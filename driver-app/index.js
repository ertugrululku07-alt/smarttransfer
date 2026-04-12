import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
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

// Reusable headless sync function
const syncLocationWithBackend = async (lat, lng, speed, heading, timestamp, source) => {
  try {
    let token = await SecureStore.getItemAsync('token');
    if (!token) token = await AsyncStorage.getItem('token');
    if (!token) return;
    
    let lastSyncTime = await SecureStore.getItemAsync('lastSyncTime');
    if (!lastSyncTime) lastSyncTime = await AsyncStorage.getItem('lastSyncTime');
    lastSyncTime = lastSyncTime || new Date(Date.now() - 60000).toISOString();
    
    // If coordinates weren't provided directly, try to fetch last known location reliably
    if (!lat) {
      try {
        const fallback = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (fallback) {
          lat = fallback.coords.latitude;
          lng = fallback.coords.longitude;
          speed = fallback.coords.speed;
          heading = fallback.coords.heading;
          timestamp = fallback.timestamp;
        } else {
          // Last resort if cache is empty
          const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 5000 });
          lat = fresh.coords.latitude;
          lng = fresh.coords.longitude;
          speed = fresh.coords.speed;
          heading = fresh.coords.heading;
          timestamp = fresh.timestamp;
        }
      } catch (e) { 
        console.log('[Headless] Failed to acquire GPS fallback:', e);
      }
    }

    const res = await fetch(`${API_URL}/driver/sync`, {
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

// 1. Foreground Tracking Real-time Task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Headless] Location Task Error:', error);
    return;
  }
  if (data) {
    const location = data.locations?.[0];
    if (location) {
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
  await syncLocationWithBackend(null, null, null, null, null, 'bg_fetch');
});

// 3. Silent Wake-Up Push Task
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) return;
  const payload = data?.notification?.request?.content?.data;
  
  if (payload?.type === 'LOCATION_REQUEST') {
     console.log('[Headless] Silent push location request received');
     await syncLocationWithBackend(null, null, null, null, null, 'silent_push');
     
     // CRITICAL: Aggressively force-revive the tracking loop if Android had previously killed the service 
     // when the user swiped the app away.
     try {
       await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
         accuracy: Location.Accuracy.Highest,
         timeInterval: 2000,
         distanceInterval: 0,
         showsBackgroundLocationIndicator: true,
         activityType: Location.ActivityType.AutomotiveNavigation,
         pausesUpdatesAutomatically: false,
         foregroundService: {
           notificationTitle: 'SmartTransfer Sürücü',
           notificationBody: 'Arka planda konum takip ediliyor.',
           notificationColor: '#4361ee',
           killServiceOnDestroy: false,
           notificationChannelId: 'location-tracking',
         }
       });
       console.log('[Headless] Background tracking successfully re-bound to OS');
     } catch (e) {
       console.log('[Headless] Background tracking revive loop failed:', e);
     }
  }
});
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

// 4. Auto-Recovery: Listen for Connectivity Restoration
// This ensures that when the user exits Airplane Mode, we don't wait for 
// a GPS event to tell the server we are back online.
NetInfo.addEventListener(state => {
  // We trigger sync on EVERY transition to connected state
  if (state.isConnected && state.isInternetReachable !== false) {
    console.log('[Headless] Connectivity detected! Pinging server...');
    syncLocationWithBackend(null, null, null, null, null, 'net_recovery');
    
    // Also re-ensure tracking service is bound
    Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 2000,
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'SmartTransfer Sürücü',
          notificationBody: 'Arka planda konum takip ediliyor.',
          notificationColor: '#4361ee',
          killServiceOnDestroy: false,
          notificationChannelId: 'location-tracking',
        }
    }).catch(e => console.log('[Headless] Net recovery service restart failed:', e));
  }
});

// Initial trigger if already connected at boot
NetInfo.fetch().then(state => {
    if (state.isConnected) syncLocationWithBackend(null, null, null, null, null, 'boot_sync');
});

// Must export App entry for Expo Router
export function App() {
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
