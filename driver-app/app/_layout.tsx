import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  // 'index' is the login screen - make it the entry point
  initialRouteName: 'index',
};

import { AuthProvider, useAuth } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Platform } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';
const BG_FETCH_TASK_NAME = 'background-sync-task';
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';
const API_URL = 'https://smarttransfer-backend-production.up.railway.app/api';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Define the background location task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) { console.error("BG location error:", error); return; }
  if (data) {
    const { locations } = data as any;
    const location = locations?.[0];
    if (location) {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token) return;

        // Get last sync time
        const lastSyncTimeStr = await SecureStore.getItemAsync('lastSyncTime');
        const lastSyncTime = lastSyncTimeStr || new Date(Date.now() - 60000).toISOString();

        const response = await fetch(`${API_URL}/driver/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Tenant-Slug': 'smarttravel-demo'
          },
          body: JSON.stringify({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            speed: location.coords.speed,
            heading: location.coords.heading,
            timestamp: location.timestamp,
            checkNotifications: true,
            lastSyncTime: lastSyncTime
          })
        });

        const json = await response.json();
        if (json.success && json.data) {
          // Save new sync time
          await SecureStore.setItemAsync('lastSyncTime', json.data.serverTime);

          const { bookings, messages } = json.data.notifications;

          // Process assigned bookings
          if (bookings && bookings.length > 0) {
            for (const b of bookings) {
              const pickup = b.metadata?.pickup || 'Konum Belirtilmemiş';
              const dateRaw = b.startDate ? new Date(b.startDate) : new Date();
              const dStr = dateRaw.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '🚗 Yeni İş Atandı!',
                  body: `${pickup} • ${dStr}`,
                  sound: true,
                  data: { type: 'operationAssigned', bookingId: b.id },
                },
                trigger: null,
              });
            }
          }

          // Process unread messages
          if (messages && messages.length > 0) {
            for (const m of messages) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '💬 Yeni Mesaj',
                  body: m.content || 'Operasyon merkezinden yeni bir mesaj.',
                  sound: true,
                  data: { type: 'chatMessage', senderId: m.senderId },
                },
                trigger: null,
              });
            }
          }
        }

      } catch (err) { console.error('BG location sync error:', err); }
    }
  }
});

// Define background fetch task (runs ~15 mins, works without location movement)
TaskManager.defineTask(BG_FETCH_TASK_NAME, async () => {
  try {
    const token = await SecureStore.getItemAsync('token');
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const lastSyncTimeStr = await SecureStore.getItemAsync('lastSyncTime');
    const lastSyncTime = lastSyncTimeStr || new Date(Date.now() - 60000).toISOString();

    const response = await fetch(`${API_URL}/driver/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Slug': 'smarttravel-demo'
      },
      body: JSON.stringify({
        checkNotifications: true,
        lastSyncTime: lastSyncTime
      })
    });

    const json = await response.json();
    if (json.success && json.data) {
      await SecureStore.setItemAsync('lastSyncTime', json.data.serverTime);
      const { bookings, messages } = json.data.notifications;

      let hasNewData = false;
      if (bookings?.length > 0) {
        hasNewData = true;
        for (const b of bookings) {
          const pickup = b.metadata?.pickup || 'Konum Belirtilmemiş';
          await Notifications.scheduleNotificationAsync({
            content: { title: '🚗 Yeni İş Atandı!', body: pickup, sound: true, data: { type: 'operationAssigned', bookingId: b.id } }, trigger: null,
          });
        }
      }
      if (messages?.length > 0) {
        hasNewData = true;
        for (const m of messages) {
          await Notifications.scheduleNotificationAsync({
            content: { title: '💬 Yeni Mesaj', body: m.content, sound: true, data: { type: 'chatMessage', senderId: m.senderId } }, trigger: null,
          });
        }
      }
      return hasNewData ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error('BG fetch sync error:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// =============================================================================
// SILENT PUSH HANDLER (FCM Wake-up)
// The backend sends a silent push every 60 seconds.
// When received (even if app is force-closed), Android wakes this code,
// gets GPS, and sends location to backend - exactly like Life360 / tracking apps.
// =============================================================================
// Foreground handler (when app is open)
Notifications.addNotificationReceivedListener(async (notification) => {
  const data = notification.request.content.data as any;
  if (data?.type === 'LOCATION_REQUEST') {
    await handleLocationSyncRequest();
  }
});

// Background handler (when app is closed/suspended)
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error, executionInfo }) => {
  if (error) {
    console.error('[SilentPush] Background Task Error:', error);
    return;
  }
  const payload = (data as any)?.notification?.request?.content?.data;
  if (payload?.type === 'LOCATION_REQUEST') {
    console.log('[SilentPush] Background wake-up task execution triggered!');
    await handleLocationSyncRequest();
  }
});
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

// Shared logic for both foreground and background silent push wakes
async function handleLocationSyncRequest() {
  try {
    const token = await SecureStore.getItemAsync('token');
    if (!token) return;

    // Get current GPS location
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    let location: Location.LocationObject | null = null;
    try {
      location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 3000,
      });
    } catch {
      // If we can't get location, still send a ping to update lastSeen
    }

    const lastSyncTime = await SecureStore.getItemAsync('lastSyncTime') || new Date(Date.now() - 60000).toISOString();

    const response = await fetch(`${API_URL}/driver/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Slug': 'smarttravel-demo'
      },
      body: JSON.stringify({
        lat: location?.coords?.latitude,
        lng: location?.coords?.longitude,
        speed: location?.coords?.speed,
        heading: location?.coords?.heading,
        checkNotifications: true,
        lastSyncTime,
        source: 'silent_push'
      })
    });

    const json = await response.json();
    if (json.success && json.data) {
      await SecureStore.setItemAsync('lastSyncTime', json.data.serverTime);
      const { bookings, messages } = json.data.notifications;

      if (bookings?.length > 0) {
        for (const b of bookings) {
          const pickup = b.metadata?.pickup || 'Konum Belirtilmemiş';
          await Notifications.scheduleNotificationAsync({
            content: { title: '🚗 Yeni İş Atandı!', body: pickup, sound: true, data: { type: 'operationAssigned', bookingId: b.id } }, trigger: null,
          });
        }
      }
      if (messages?.length > 0) {
        for (const m of messages) {
          await Notifications.scheduleNotificationAsync({
            content: { title: '💬 Yeni Mesaj', body: m.content, sound: true, data: { type: 'chatMessage', senderId: m.senderId } }, trigger: null,
          });
        }
      }
    }

    console.log('[SilentPush] Location sent on wake-up');
  } catch (err) {
    console.error('[SilentPush] Error:', err);
  }
}

// AuthGuard: watches auth state and redirects accordingly
function AuthGuard() {
  const { token, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!token) {
      router.replace('/');
      return;
    }
    // Register push token when authenticated
    registerPushToken(token);
  }, [token, isLoading]);

  // Handle notification taps (when app is opened from notification)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'chatMessage') {
        router.push('/messages');
      } else if (data?.bookingId || data?.type === 'operationAssigned') {
        router.push('/(tabs)/explore');
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

async function registerPushToken(token: string) {
  try {
    // Expo Go doesn't support remote push (SDK 53+) — skip gracefully
    // Push will work when built as a real APK / development build
    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      console.log('[Push] Running in Expo Go — skipping remote push token (not supported). Socket notifications still active.');
      return;
    }

    // Set Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('operations', {
        name: 'Operasyon Bildirimleri',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4361ee',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Bildirim İzni Reddedildi',
        text2: 'Uygulama arka planda size bildirim gönderemez.'
      });
      return;
    }

    // Get the Expo project ID from app config (set by EAS)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[Push] No EAS projectId found in app config — push token skipped.');
      Toast.show({
        type: 'error',
        text1: 'Sistem Hatası',
        text2: 'Uygulama proje kimliğini bulamadı (EAS Project ID eksik).'
      });
      return;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = tokenData.data;

    // Send token to backend
    const fRes = await fetch(`${API_URL}/driver/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Slug': 'smarttravel-demo'
      },
      body: JSON.stringify({ token: pushToken })
    });

    const fJson = await fRes.json();
    if (fJson.success) {
      Toast.show({
        type: 'success',
        text1: 'Cihaz Kaydedildi',
        text2: 'Bildirim altyapısı (Push) başarılı şekilde aktifleşti.'
      });
      console.log('Push token registered successfully:', pushToken);
    } else {
      Toast.show({
        type: 'error',
        text1: 'Kayıt Hatası',
        text2: 'Bildirim altyapısı sunucuya kaydedilemedi.'
      });
    }

  } catch (e: any) {
    console.error('Push token registration error:', e);
    Toast.show({
      type: 'error',
      text1: 'Kritik Hata (Push)',
      text2: String(e.message || e).substring(0, 50)
    });
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Register background fetch task once globally
    const registerFetchTask = async () => {
      try {
        await BackgroundFetch.registerTaskAsync(BG_FETCH_TASK_NAME, {
          minimumInterval: 15 * 60, // 15 minutes
          stopOnTerminate: false, // android only,
          startOnBoot: true,     // android only
        });
      } catch (err) {
        console.warn('BG Fetch task registration failed:', err);
      }
    };
    registerFetchTask();
  }, []);

  return (
    <AuthProvider>
      <SocketProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthGuard />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
          <Toast />
        </ThemeProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
