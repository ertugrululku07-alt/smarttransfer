import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';

// -------------------------------------------------------------
// HEADLESS BACKGROUND TASKS - MUST BE DECLARED HERE AT ROOT
// BEFORE REACT APP BOOTS SO ANDROID RE-BINDS THEM AFTER SWIPE-CLOSE
// -------------------------------------------------------------
const LOCATION_TASK_NAME = 'background-location-task';
const BG_FETCH_TASK_NAME = 'background-sync-task';
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

// Throttle & debounce tracking
let lastForegroundSyncMs = 0;
const FOREGROUND_SYNC_MIN_INTERVAL = 25000; // Min 25s between foreground location syncs
let lastNetRecoveryMs = 0;
const NET_RECOVERY_DEBOUNCE = 30000; // Min 30s between net_recovery syncs
let bootSyncDone = false;

const LOCATION_UPDATES_OPTIONS = {
  accuracy: Location.Accuracy.High,
  timeInterval: 15000,
  distanceInterval: 5,
  showsBackgroundLocationIndicator: true,
  activityType: Location.ActivityType.AutomotiveNavigation,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: 'SmartTransfer Sürücü',
    notificationBody: 'Arka planda konum takip ediliyor.',
    notificationColor: '#4361ee',
    killServiceOnDestroy: false,
  }
};

const ensureLocationTaskRunning = async (reason) => {
  // Native foreground service handles GPS — Expo location task disabled
  return true;
};

// Read tokens safely from secure storage (fallback to AsyncStorage)
const readToken = async (key) => {
  let v = await SecureStore.getItemAsync(key);
  if (!v) v = await AsyncStorage.getItem(key);
  return v;
};

// Refresh access token using stored refreshToken
const refreshAccessToken = async () => {
  try {
    const refreshToken = await readToken('refreshToken');
    if (!refreshToken) return null;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return null;
    const json = await res.json();
    const newToken = json?.data?.token;
    if (newToken) {
      await SecureStore.setItemAsync('token', newToken);
      await AsyncStorage.setItem('token', newToken);
      return newToken;
    }
    return null;
  } catch (e) {
    console.log('[Headless] Token refresh failed:', e?.message || e);
    return null;
  }
};

// Reusable headless sync function
const syncLocationWithBackend = async (lat, lng, speed, heading, timestamp, source) => {
  try {
    let token = await readToken('token');
    if (!token) return;
    
    let lastSyncTime = await SecureStore.getItemAsync('lastSyncTime');
    if (!lastSyncTime) lastSyncTime = await AsyncStorage.getItem('lastSyncTime');
    lastSyncTime = lastSyncTime || new Date(Date.now() - 60000).toISOString();
    
    // If coordinates weren't provided directly, try to fetch last known location reliably
    if (!lat) {
      try {
        // Try cached location first (up to 5 min old — useful when app is backgrounded)
        const fallback = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
        if (fallback) {
          lat = fallback.coords.latitude;
          lng = fallback.coords.longitude;
          speed = fallback.coords.speed;
          heading = fallback.coords.heading;
          timestamp = fallback.timestamp;
        }
      } catch (e) { 
        console.log('[Headless] getLastKnownPosition failed:', e?.message);
      }
      // If still no location, try active GPS with timeout
      if (!lat) {
        try {
          const fresh = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 8000))
          ]);
          if (fresh) {
            lat = fresh.coords.latitude;
            lng = fresh.coords.longitude;
            speed = fresh.coords.speed;
            heading = fresh.coords.heading;
            timestamp = fresh.timestamp;
          }
        } catch (e) {
          console.log('[Headless] getCurrentPosition failed:', e?.message);
        }
      }
    }

    let res = await fetch(`${API_URL}/driver/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token}`, 
        'X-Tenant-Slug': 'smarttravel-demo' 
      },
      body: JSON.stringify({ 
        lat, lng, speed, heading, timestamp, source, 
        checkNotifications: false, 
        lastSyncTime 
      })
    });
    // If token expired, try refresh once and retry the sync immediately
    if (res.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        token = newToken;
        res = await fetch(`${API_URL}/driver/sync`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}`, 
            'X-Tenant-Slug': 'smarttravel-demo' 
          },
          body: JSON.stringify({ 
            lat, lng, speed, heading, timestamp, source: source + '_retry_after_refresh', 
            checkNotifications: false, 
            lastSyncTime 
          })
        });
      }
    }
    
    // Check if server sent us a fresh token via header (auto-renewal for expired tokens)
    const newTokenHeader = res.headers?.get?.('X-New-Token') || res.headers?.get?.('x-new-token');
    if (newTokenHeader) {
      console.log('[Headless] Received auto-renewed token from server');
      await SecureStore.setItemAsync('token', newTokenHeader);
      await AsyncStorage.setItem('token', newTokenHeader);
    }

    const json = await res.json();
    if (json?.data?.serverTime) {
      await SecureStore.setItemAsync('lastSyncTime', json.data.serverTime);
      await AsyncStorage.setItem('lastSyncTime', json.data.serverTime);
    }
    console.log(`[Headless] Sync success (${source})`);
  } catch (e) {
    console.log(`[Headless] Sync failed (${source}):`, e.message);
    
    // RETRY LOGIC: If we failed due to network, try again in 30 seconds
    // This allows the app to catch the 'internet returned' moment even if NetInfo misses it.
    if (!source.includes('retry')) {
      console.log('[Headless] Scheduling auto-retry in 30s...');
      setTimeout(() => {
        syncLocationWithBackend(lat, lng, speed, heading, timestamp, source + '_retry');
      }, 30000);
    }
  }
};

// 1. Foreground Tracking Real-time Task (throttled to avoid spam)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Headless] Location Task Error:', error);
    return;
  }
  if (data) {
    const location = data.locations?.[0];
    if (location) {
      const now = Date.now();
      // Throttle: skip if we synced less than 25s ago
      if (now - lastForegroundSyncMs < FOREGROUND_SYNC_MIN_INTERVAL) {
        return;
      }
      lastForegroundSyncMs = now;
      await syncLocationWithBackend(
        location.coords.latitude, 
        location.coords.longitude,
        location.coords.speed, 
        location.coords.heading,
        location.timestamp, 
        'foreground_service_location'
      );
    }
  }
});

// 2. Scheduled Background Fetch Event
TaskManager.defineTask(BG_FETCH_TASK_NAME, async () => {
  await ensureLocationTaskRunning('bg_fetch');
  await syncLocationWithBackend(null, null, null, null, null, 'bg_fetch');
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

// 3. Silent Wake-Up Push Task
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) return;
  const payload = data?.notification?.request?.content?.data;
  
  if (payload?.type === 'LOCATION_REQUEST') {
     console.log('[Headless] Silent push location request received');
     await syncLocationWithBackend(null, null, null, null, null, 'silent_push');
     
     await ensureLocationTaskRunning('silent_push');
  }
});

(async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (!isRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }
  } catch (e) {
    console.log('[Headless] Notification task register failed (non-fatal):', e?.message || e);
  }
})();

// 4. Auto-Recovery: Listen for Connectivity Restoration (debounced)
NetInfo.addEventListener(state => {
  if (state.isConnected && state.isInternetReachable !== false) {
    const now = Date.now();
    // Debounce: skip if we already synced within last 30s
    if (now - lastNetRecoveryMs < NET_RECOVERY_DEBOUNCE) {
      return;
    }
    lastNetRecoveryMs = now;
    console.log('[Headless] Connectivity detected! Pinging server...');
    syncLocationWithBackend(null, null, null, null, null, 'net_recovery');
    ensureLocationTaskRunning('net_recovery');
  }
});

// Initial trigger if already connected at boot (skip if net_recovery already fired)
NetInfo.fetch().then(async (state) => {
    await ensureLocationTaskRunning('boot_init');
    if (state.isConnected && !bootSyncDone) {
      bootSyncDone = true;
      lastNetRecoveryMs = Date.now(); // Prevent immediate net_recovery duplicate
      syncLocationWithBackend(null, null, null, null, null, 'boot_sync');
    }
});

// Self-heal once at process startup (after cold boot / process recreation)
setTimeout(() => {
  ensureLocationTaskRunning('startup_self_heal');
}, 4000);

// Ensure BackgroundFetch is registered to wake the app periodically even if OS throttles timers
(async () => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    // Register if available
    if (status === BackgroundFetch.BackgroundFetchStatus.Available) {
      const isReg = await TaskManager.isTaskRegisteredAsync(BG_FETCH_TASK_NAME);
      if (!isReg) {
        await BackgroundFetch.registerTaskAsync(BG_FETCH_TASK_NAME, {
          minimumInterval: 15 * 60, // 15 minutes (Android min)
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log('[Headless] BackgroundFetch registered');
      }
    }
  } catch (e) {
    console.log('[Headless] BackgroundFetch register error (non-fatal):', e);
  }
})();

// Must export App entry for Expo Router
export function App() {
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
