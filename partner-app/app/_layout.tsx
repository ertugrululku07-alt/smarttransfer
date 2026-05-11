import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { router, useSegments } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Keep splash visible until we explicitly hide it
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Genel Bildirimler',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#059669',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  }).catch(() => {});
}

function AuthGuard() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    // Auth check done — hide splash screen
    SplashScreen.hideAsync();
    const inProtectedRoute = segments[0] === '(tabs)' || segments[0] === 'transfer';
    if (!token && inProtectedRoute) {
      try { router.replace('/'); } catch {}
      setTimeout(() => { try { router.replace('/'); } catch {} }, 300);
    }
  }, [token, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthGuard />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transfer/[id]" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
        <Toast />
      </ThemeProvider>
    </AuthProvider>
  );
}
