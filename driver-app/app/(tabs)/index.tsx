import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, Alert, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Dimensions, Image, Platform, Linking
} from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

const API_URL = 'https://smarttransfer-backend-production.up.railway.app/api';
const LOCATION_TASK_NAME = 'background-location-task';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { user, signOut, token, signIn } = useAuth();
  const { socket, isConnected, unreadCount } = useSocket();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);

  const getImageUrl = (url: string | undefined | null) => {
    if (!url) return '';
    const baseApi = API_URL.replace('/api', '');
    if (url.startsWith('/uploads')) {
      return `${baseApi}${url}`;
    }
    if (url.includes('localhost')) {
      return url.replace(/https?:\/\/localhost(:\d+)?/, baseApi);
    }
    return url;
  };
  const [stats, setStats] = useState({ todayJobs: 0, completedJobs: 0, rating: 4.9 });
  const [loading, setLoading] = useState(false);
  const [locationActive, setLocationActive] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchProfile();
    ensureLocationAlwaysOn();
  }, []);

  // Local listeners removed to prevent duplicate toasts.
  // SocketContext already handles `new_message` and `operation_assigned` globally.

  // Foreground notification listener (when push arrives while app open)
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data?.bookingId && data?.pickup) {
        playAlertSound();
      }
    });
    return () => {
      notificationListener.current?.remove();
    };
  }, []);

  const playAlertSound = async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/alert.mp3'),
        { shouldPlay: true }
      );
      sound.setOnPlaybackStatusUpdate(status => {
        if ('didJustFinish' in status && status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      // Fallback: sound file might not exist, notification alert is still shown
      console.log('Alert sound error (non-fatal):', e);
    }
  };

  const ensureLocationAlwaysOn = async () => {
    try {
      // First request foreground
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert(
          'Konum İzni Zorunlu',
          'SmartTransfer Sürücü uygulaması konum izni olmadan çalışamaz. Lütfen ayarlardan izin verin.',
          [
            { text: 'Ayarlara Git', onPress: () => Linking.openSettings() },
            { text: 'Tamam' }
          ]
        );
        return;
      }

      // Then try background
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        Alert.alert(
          'Arka Plan İzni Önerisi',
          'Arka planda kesintisiz takip için ayarlardan "Her Zaman İzin Ver" seçmeniz önerilir.',
          [
            { text: 'Ayarlara Git', onPress: () => Linking.openSettings() },
            { text: 'Tamam' }
          ]
        );
      }

      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,  // Balanced for battery efficiency
          timeInterval: 10000,    // 10 seconds — less aggressive than 5s
          distanceInterval: 5,    // Only update if moved 5m — saves battery
          deferredUpdatesInterval: 10000,
          deferredUpdatesDistance: 5,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'SmartTransfer Sürücü',
            notificationBody: 'Konum servisi aktif — Operasyon takip ediliyor',
            notificationColor: '#4361ee'
          }
        });
      }
      setLocationActive(true);
    } catch (err) {
      console.error('Location error:', err);
    }
  };

  // Start FOREGROUND tracking to stream live points to Web Sockets for Admin Map
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startForegroundTracking = async () => {
      if (!locationActive || !socket || !isConnected) return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Emit every 5 seconds while app is open
          distanceInterval: 0,
        },
        (location) => {
          socket.emit('driver_location_update', {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            speed: location.coords.speed || 0,
            heading: location.coords.heading || 0,
            timestamp: new Date(location.timestamp).toISOString()
          });
        }
      );
    };

    startForegroundTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [locationActive, socket, isConnected]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/driver/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/driver/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success && json.data && json.data.avatar !== user?.avatar) {
        signIn(token!, { ...user, ...json.data });
      }
    } catch (e) {
      console.error('Profile sync error:', e);
    }
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchStats} tintColor="#fff" />}
    >
      {/* ─── HEADER ─── */}
      <View style={styles.headerGradient}>
        <View style={styles.headerTop}>
          {user?.avatar ? (
            <Image
              source={{ uri: getImageUrl(user.avatar) }}
              style={styles.avatarCircleImage}
            />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(user?.firstName?.charAt(0) ?? '').toUpperCase()}{(user?.lastName?.charAt(0) ?? '').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.greetingText}>{greeting},</Text>
            <Text style={styles.nameText}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <View style={[styles.onlineBadge, { backgroundColor: isConnected ? '#10b981' : '#6b7280' }]}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{isConnected ? 'Online' : 'Offline'}</Text>
          </View>
        </View>

        {/* ─── LOCATION STATUS ─── */}
        <View style={styles.locationBanner}>
          <View style={styles.locationPulse}>
            <View style={[styles.pulseOuter, { backgroundColor: locationActive ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)' }]} />
            <View style={[styles.pulseCore, { backgroundColor: locationActive ? '#10b981' : '#6b7280' }]} />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.locationTitle}>Konum Servisi</Text>
            <Text style={styles.locationSubtitle}>{locationActive ? 'Aktif — Sürekli İzleniyor' : 'Başlatılıyor...'}</Text>
          </View>
          <View style={[styles.locationStatus, { borderColor: locationActive ? '#10b981' : '#6b7280' }]}>
            <Text style={{ color: locationActive ? '#10b981' : '#6b7280', fontWeight: 'bold', fontSize: 11 }}>
              {locationActive ? 'AKTİF' : 'BEKLENİYOR'}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── STATS ─── */}
      <View style={styles.statsRow}>
        <StatCard icon="briefcase-outline" label="Bugünkü İşler" value={stats.todayJobs} color={Brand.primary} />
        <StatCard icon="checkmark-circle-outline" label="Tamamlanan" value={stats.completedJobs} color={Brand.success} />
        <StatCard icon="star-outline" label="Puan" value={stats.rating} color={Brand.warning} />
      </View>

      {/* ─── QUICK ACTIONS ─── */}
      <Text style={styles.sectionTitle}>Hızlı Erişim</Text>
      <View style={styles.actionsGrid}>
        <ActionButton
          icon="list"
          label="İş Listesi"
          color={Brand.primary}
          onPress={() => router.push('/(tabs)/explore')}
        />
        <ActionButton
          icon="time"
          label="Geçmiş"
          color={Brand.secondary}
          onPress={() => router.push('/history')}
        />
        <ActionButton
          icon="chatbubbles"
          label="Mesajlar"
          color="#059669"
          onPress={() => router.push('/messages')}
          badgeCount={unreadCount}
        />
        <ActionButton
          icon="person"
          label="Profil"
          color={Brand.danger}
          onPress={() => router.push('/(tabs)/profile')}
        />
      </View>
    </ScrollView>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: any; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Ionicons name={icon as any} size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({ icon, label, color, onPress, badgeCount }: { icon: string; label: string; color: string; onPress: () => void; badgeCount?: number }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={28} color={color} />
        {!!badgeCount && badgeCount > 0 && (
          <View style={styles.actionBadge}>
            <Text style={styles.actionBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        )}
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.background },
  container: { paddingBottom: 40 },

  // Header
  headerGradient: {
    backgroundColor: Brand.headerBg,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: Brand.headerBg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarCircle: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)'
  },
  avatarCircleImage: {
    width: 58, height: 58, borderRadius: 29,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)'
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  greetingText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  nameText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  onlineBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 5 },
  onlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Location banner
  locationBanner: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  locationPulse: { position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pulseOuter: {
    position: 'absolute',
    width: 28, height: 28, borderRadius: 14,
  },
  pulseCore: { width: 14, height: 14, borderRadius: 7 },
  locationTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  locationSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  locationStatus: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1,
  },

  // Stats
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 20, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    alignItems: 'center', borderTopWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  statLabel: { fontSize: 11, color: Brand.textSecondary, marginTop: 4, textAlign: 'center' },

  // Actions
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: Brand.text,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 12
  },
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 10
  },
  actionBtn: {
    width: (width - 52) / 2,
    backgroundColor: '#fff', borderRadius: 18,
    padding: 18, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  actionIcon: {
    width: 54, height: 54, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10
  },
  actionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff'
  },
  actionBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
});
