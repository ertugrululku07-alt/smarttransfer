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
import { router, useSegments } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Platform, Alert, Linking, AppState, BackHandler } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';
const BG_FETCH_TASK_NAME = 'background-sync-task';
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';
const API_URL = 'https://backend-production-69e7.up.railway.app/api';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Suppress location-sync wake-up notifications from showing to user
    const data = notification.request.content.data as any;
    if (data?.type === 'LOCATION_REQUEST') {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// Create a silent notification channel for location-sync pushes (Android)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('location-sync', {
    name: 'Konum Senkronizasyonu',
    importance: Notifications.AndroidImportance.MIN,
    sound: null,
    vibrationPattern: [],
    showBadge: false,
    enableVibrate: false,
  }).catch(() => {});
}

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

// ─── COMPREHENSIVE BATTERY OPTIMIZATION BYPASS ───
// Huawei EMUI, Xiaomi MIUI, Samsung OneUI, Oppo ColorOS, Vivo, Realme
// all aggressively kill background apps. We need multi-step guidance.

const MANUFACTURER_SETTINGS: Record<string, { name: string; intents: string[]; instructions: string }> = {
  huawei: {
    name: 'Huawei',
    intents: [
      'huawei.intent.action.HSM_PROTECTED_APPS',       // EMUI protected apps
      'huawei.intent.action.HSM_BOOTAPP_MANAGER',      // EMUI auto-launch
    ],
    instructions:
      '1. Ayarlar > Pil > Uygulama başlatma yöneticisi\n' +
      '2. SmartTransfer Sürücü uygulamasını bulun\n' +
      '3. Otomatik yönetimi KAPATIN (toggle)\n' +
      '4. Açılan pencerede: Otomatik başlatma ✓, Arka plan ✓, Pil yoğun ✓ yapın\n' +
      '5. Ayarlar > Pil > Pil optimizasyonu > SmartTransfer > "Optimize etme" seçin\n' +
      '6. Son uygulamalar ekranında SmartTransfer\'e basılı tutun > "Kilitle" seçin'
  },
  xiaomi: {
    name: 'Xiaomi / Redmi / POCO',
    intents: [
      'miui.intent.action.POWER_HIDE_MODE_APP_LIST',   // Battery saver whitelist
      'miui.intent.action.OP_AUTO_START',               // Auto-start
    ],
    instructions:
      '1. Ayarlar > Uygulamalar > Uygulamaları yönet > SmartTransfer\n' +
      '2. Otomatik başlatma: AÇIK\n' +
      '3. Pil tasarrufu: Kısıtlama yok\n' +
      '4. Ayarlar > Pil > Arka plan pil kullanımı: SmartTransfer için izin ver'
  },
  samsung: {
    name: 'Samsung',
    intents: [],
    instructions:
      '1. Ayarlar > Pil > Arka plan kullanım sınırları\n' +
      '2. SmartTransfer uygulamasını "Hiçbir zaman uyutma" listesine ekleyin\n' +
      '3. Ayarlar > Uygulamalar > SmartTransfer > Pil > Sınırsız seçin'
  },
  oppo: {
    name: 'Oppo / Realme / OnePlus',
    intents: [
      'com.coloros.safecenter',
    ],
    instructions:
      '1. Ayarlar > Pil > Arka plan optimizasyonu\n' +
      '2. SmartTransfer için "Kısıtlama yok" seçin\n' +
      '3. Güvenlik > Otomatik başlatma yöneticisi > SmartTransfer: AÇIK'
  },
  vivo: {
    name: 'Vivo',
    intents: [],
    instructions:
      '1. Ayarlar > Pil > Yüksek arka plan güç tüketimi\n' +
      '2. SmartTransfer uygulamasını listede etkinleştirin\n' +
      '3. i Manager > Uygulama Yöneticisi > Otomatik başlatma: AÇIK'
  }
};

function detectManufacturer(): string | null {
  // React Native doesn't expose manufacturer directly, but we can use brand constants
  // We'll try all known intents
  return null; // Will try all
}

async function tryOpenIntent(intentUrl: string): Promise<boolean> {
  try {
    const canOpen = await Linking.canOpenURL(intentUrl);
    if (canOpen) {
      await Linking.openURL(intentUrl);
      return true;
    }
  } catch { }
  return false;
}

async function promptBatteryOptimization() {
  if (Platform.OS !== 'android') return;

  try {
    // Check if we've already shown the detailed manufacturer guide
    const lastAsked = await SecureStore.getItemAsync('battery_opt_asked_v2');
    const daysSinceAsked = lastAsked 
      ? (Date.now() - parseInt(lastAsked)) / (1000 * 60 * 60 * 24)
      : 999;
    
    // Show every 3 days — Huawei EMUI resets these settings after updates
    if (daysSinceAsked < 3) return;

    // Wait for app to fully load
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Step 2: Try manufacturer-specific intents first (auto-detect)
    let opened = false;
    for (const [brand, cfg] of Object.entries(MANUFACTURER_SETTINGS)) {
      for (const intent of cfg.intents) {
        if (await tryOpenIntent(intent)) {
          opened = true;
          break;
        }
      }
      if (opened) break;
    }

    // Step 3: Show detailed guidance dialog
    const allInstructions = Object.values(MANUFACTURER_SETTINGS)
      .map(cfg => `📱 ${cfg.name}:\n${cfg.instructions}`)
      .join('\n\n');

    Alert.alert(
      '⚡ Arka Plan Konum İzni',
      'Uygulamanın arka planda çalışması için pil optimizasyonunu kapatmanız GEREKLİDİR.\n\n' +
      'Aksi halde 10-15 dakika sonra uygulama uyku moduna geçer ve konumunuz güncellenmez.\n\n' +
      '── Telefonunuza göre ayarlar ──\n\n' +
      allInstructions +
      '\n\n📌 Genel: Ayarlar > Pil > Pil Optimizasyonu > SmartTransfer > Optimize etme',
      [
        {
          text: 'Bir Daha Gösterme',
          style: 'cancel',
          onPress: async () => {
            // Set far future so it never shows again
            await SecureStore.setItemAsync('battery_opt_asked_v2', String(Date.now() + 365 * 24 * 60 * 60 * 1000));
          }
        },
        {
          text: 'Pil Ayarlarına Git',
          onPress: async () => {
            try {
              // Try battery optimization settings directly
              const opened = await tryOpenIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
              if (!opened) {
                await tryOpenIntent('android.settings.BATTERY_SAVER_SETTINGS');
              }
              if (!opened) {
                Linking.openSettings();
              }
            } catch {
              Linking.openSettings();
            }
          }
        },
        {
          text: 'Uygulama Ayarları',
          onPress: () => Linking.openSettings()
        }
      ]
    );

    await SecureStore.setItemAsync('battery_opt_asked_v2', String(Date.now()));
  } catch (err) {
    console.warn('Battery optimization prompt error:', err);
  }
}

// AuthGuard: watches auth state and redirects accordingly
function AuthGuard() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const batteryPromptDone = React.useRef(false);

  useEffect(() => {
    if (isLoading) return;

    // Determine if user is on a protected route
    const inProtectedRoute = segments[0] === '(tabs)' || segments[0] === 'job' || segments[0] === 'messages' || segments[0] === 'history';

    if (!token) {
      // Not authenticated — force to login screen
      if (inProtectedRoute) {
        try { router.replace('/'); } catch {}
        // Retry after short delay (Samsung workaround)
        setTimeout(() => {
          try { router.replace('/'); } catch {}
        }, 300);
      }
      return;
    }

    // Register push token when authenticated (only once per session)
    registerPushToken(token);
    // Prompt battery optimization only once per app session
    if (!batteryPromptDone.current) {
      batteryPromptDone.current = true;
      promptBatteryOptimization();
    }
  }, [token, isLoading, segments]);

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
    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      console.log('[Push] Running in Expo Go — skipping remote push token (not supported). Socket notifications still active.');
      return;
    }

    // Set Android notification channel with maximum priority + DND bypass
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('operations', {
        name: 'Operasyon Bildirimleri',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4361ee',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // Secondary channel for messages
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Mesaj Bildirimleri',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#10b981',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
    console.warn('[Push] Token registration failed (non-fatal):', e?.message || e);
    // Don't show error toast — push is optional, socket notifications still work
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Register background fetch task once globally
    const registerFetchTask = async () => {
      try {
        await BackgroundFetch.registerTaskAsync(BG_FETCH_TASK_NAME, {
          minimumInterval: 5 * 60, // 5 minutes (Android may still enforce its own minimum)
          stopOnTerminate: false,   // CRITICAL: keep running after app swipe
          startOnBoot: true,        // CRITICAL: start after phone reboot
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
            <Stack.Screen name="messages" options={{ headerShown: false }} />
            <Stack.Screen name="history" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
          <Toast />
        </ThemeProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
