import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, Alert, ScrollView, RefreshControl,
  TouchableOpacity, Image, Platform, Linking, AppState,
  Modal, TextInput
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

const API_URL = 'https://backend-production-69e7.up.railway.app/api';
const LOCATION_TASK_NAME = 'background-location-task';


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
  const [emergencyModal, setEmergencyModal] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [emergencyDesc, setEmergencyDesc] = useState('');
  const [emergencyInfo, setEmergencyInfo] = useState<any>(null);

  const EMERGENCY_REASONS = [
    'Araç Bozuldu',
    'Teker Patladı',
    'Hastalandım',
    'Kaza Yaptım',
    'Yol Kapalı / Ulaşamıyorum',
  ];

  useEffect(() => {
    fetchStats();
    fetchProfile();
    fetchEmergencyStatus();
    ensureLocationAlwaysOn();

    // Re-check location task when app comes back from background
    // Android OEMs may kill the foreground service silently
    const handleAppState = async (nextState: string) => {
      if (nextState === 'active') {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (!isRegistered) {
          console.log('[Location] Task was killed by OS — restarting...');
          ensureLocationAlwaysOn();
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // Auto-refresh stats when booking status changes
  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = () => {
      // Refresh stats with a small delay to let backend settle
      setTimeout(() => fetchStats(), 800);
    };
    socket.on('booking_status_update', handleStatusUpdate);
    socket.on('operation_assigned', handleStatusUpdate);
    return () => {
      socket.off('booking_status_update', handleStatusUpdate);
      socket.off('operation_assigned', handleStatusUpdate);
    };
  }, [socket]);

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
    // Native foreground service handles GPS tracking — Expo location service disabled
    setLocationActive(true);
    return;
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
        setLocationActive(false);
        Alert.alert(
          'Arka Plan İzni Zorunlu',
          'Uygulama kapalıyken takip için "Her Zaman İzin Ver" şart. Lütfen ayarlardan konumu Her Zaman yapın.',
          [
            { text: 'Ayarlara Git', onPress: () => Linking.openSettings() },
            { text: 'Tamam' }
          ]
        );
        return;
      }

      // We purposely call startLocationUpdatesAsync EVERY TIME the app reaches foreground.
      // Even if TaskManager says "isRegistered" = true, Android's Doze mode may have silently
      // suppressed the foreground service. Calling it again forces OS to re-awaken it.
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 15000,       // 15 seconds — throttled in task handler to 25s min
        distanceInterval: 5,        // At least 5m movement to trigger
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: false,  // CRITICAL: prevents iOS/Android from pausing
        foregroundService: {
          notificationTitle: 'SmartTransfer Sürücü',
          notificationBody: 'Arka planda konum takip ediliyor.',
          notificationColor: '#4361ee',
          killServiceOnDestroy: false,
        }
      });
      setLocationActive(true);
    } catch (err) {
      console.error('Location error:', err);
    }
  };

  // Foreground HTTP sync: send location every 10s via REST API (no socket dependency)
  useEffect(() => {
    if (!locationActive || !token) return;
    let active = true;

    const syncLoop = async () => {
      while (active) {
        try {
          const loc = await Location.getLastKnownPositionAsync({ maxAge: 30000 });
          if (loc && token) {
            await fetch(`${API_URL}/driver/sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Tenant-Slug': 'smarttravel-demo'
              },
              body: JSON.stringify({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                speed: loc.coords.speed || 0,
                heading: loc.coords.heading || 0,
                timestamp: loc.timestamp,
                source: 'foreground_http_poll',
                checkNotifications: true,
                lastSyncTime: new Date(Date.now() - 60000).toISOString()
              })
            });
          }
        } catch (e) {
          // Silent fail — background service is fallback
        }
        // Wait 10s before next sync
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    };

    syncLoop();
    return () => { active = false; };
  }, [locationActive, token]);

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

  const fetchEmergencyStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/driver/emergency`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success && json.data?.active) {
        setEmergencyActive(true);
        setEmergencyInfo(json.data);
      } else {
        setEmergencyActive(false);
        setEmergencyInfo(null);
      }
    } catch { }
  };

  const submitEmergency = async () => {
    if (!emergencyReason) { Alert.alert('Uyarı', 'Lütfen bir acil durum sebebi seçin.'); return; }
    try {
      const res = await fetch(`${API_URL}/driver/emergency`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: emergencyReason, description: emergencyDesc })
      });
      const json = await res.json();
      if (json.success) {
        Alert.alert('Acil Durum', 'Acil durum bildirildi. Operasyon merkezi bilgilendirildi.');
        setEmergencyModal(false);
        setEmergencyActive(true);
        setEmergencyInfo({ active: true, reason: emergencyReason, description: emergencyDesc });
        setEmergencyReason(''); setEmergencyDesc('');
      }
    } catch { Alert.alert('Hata', 'Bağlantı hatası'); }
  };

  const resolveEmergency = async () => {
    Alert.alert('Acil Durumu Kapat', 'Acil durumunuz çözüldü mü?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Evet, Çözüldü', style: 'destructive', onPress: async () => {
        try {
          const res = await fetch(`${API_URL}/driver/emergency`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const json = await res.json();
          if (json.success) {
            setEmergencyActive(false);
            setEmergencyInfo(null);
            Alert.alert('Bilgi', 'Acil durum kapatıldı.');
          }
        } catch { Alert.alert('Hata', 'Bağlantı hatası'); }
      }}
    ]);
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const initials = `${(user?.firstName?.charAt(0) ?? '').toUpperCase()}${(user?.lastName?.charAt(0) ?? '').toUpperCase()}`;

  return (
    <ScrollView
      style={st.root}
      contentContainerStyle={st.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchStats} tintColor="#fff" />}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── HEADER ─── */}
      <View style={st.header}>
        {/* Decorative circles */}
        <View style={st.headerDecor1} />
        <View style={st.headerDecor2} />

        <View style={st.headerContent}>
          <View style={st.headerRow}>
            {user?.avatar ? (
              <Image source={{ uri: getImageUrl(user.avatar) }} style={st.avatar} />
            ) : (
              <View style={st.avatarFallback}>
                <Text style={st.avatarText}>{initials || '?'}</Text>
              </View>
            )}
            <View style={st.headerInfo}>
              <Text style={st.greetingText}>{greeting}</Text>
              <Text style={st.nameText}>{user?.firstName} {user?.lastName}</Text>
            </View>
            <View style={[st.statusPill, { backgroundColor: (isConnected || locationActive) ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)' }]}>
              <View style={[st.statusDot, { backgroundColor: (isConnected || locationActive) ? '#34d399' : '#f59e0b' }]} />
              <Text style={[st.statusLabel, { color: (isConnected || locationActive) ? '#34d399' : '#f59e0b' }]}>
                {(isConnected || locationActive) ? 'Aktif' : 'Bağlanıyor...'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── STATS (overlapping header) ─── */}
      <View style={st.statsRow}>
        <TouchableOpacity style={[st.statCard, st.statCardPrimary]} activeOpacity={0.7} onPress={() => router.push('/(tabs)/explore')}>
          <View style={[st.statIconBox, { backgroundColor: 'rgba(67,97,238,0.12)' }]}>
            <Ionicons name="briefcase" size={20} color={Brand.primary} />
          </View>
          <Text style={st.statValue}>{stats.todayJobs}</Text>
          <Text style={st.statLabel}>Bugün</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.statCard, st.statCardSuccess]} activeOpacity={0.7} onPress={() => router.push('/history')}>
          <View style={[st.statIconBox, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
            <Ionicons name="checkmark-circle" size={20} color={Brand.success} />
          </View>
          <Text style={st.statValue}>{stats.completedJobs}</Text>
          <Text style={st.statLabel}>Tamamlanan</Text>
        </TouchableOpacity>
        <View style={[st.statCard, st.statCardWarning]}>
          <View style={[st.statIconBox, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
            <Ionicons name="star" size={20} color={Brand.warning} />
          </View>
          <Text style={st.statValue}>{stats.rating}</Text>
          <Text style={st.statLabel}>Puan</Text>
        </View>
      </View>

      {/* ─── QUICK ACTIONS ─── */}
      <View style={st.sectionHeader}>
        <Text style={st.sectionTitle}>Hızlı Erişim</Text>
        <View style={st.sectionLine} />
      </View>

      <View style={st.actionsGrid}>
        <ActionButton icon="list" label="İş Listesi" color="#4361ee" bg="#eef2ff" onPress={() => router.push('/(tabs)/explore')} />
        <ActionButton icon="time" label="Geçmiş" color="#7c3aed" bg="#f5f3ff" onPress={() => router.push('/history')} />
        <ActionButton icon="chatbubbles" label="Mesajlar" color="#059669" bg="#ecfdf5" onPress={() => router.push('/messages')} badgeCount={unreadCount} />
        <ActionButton icon="person" label="Profil" color="#e11d48" bg="#fff1f2" onPress={() => router.push('/(tabs)/profile')} />
      </View>

      {/* ─── EMERGENCY BUTTON ─── */}
      <View style={st.sectionHeader}>
        <Text style={st.sectionTitle}>Acil Durum</Text>
        <View style={st.sectionLine} />
      </View>

      {emergencyActive ? (
        <View style={st.emergencyActiveCard}>
          <View style={st.emergencyActiveHeader}>
            <Ionicons name="warning" size={20} color="#fff" />
            <Text style={st.emergencyActiveTitle}>Acil Durum Aktif</Text>
          </View>
          <Text style={st.emergencyActiveReason}>{emergencyInfo?.reason}</Text>
          {emergencyInfo?.description ? <Text style={st.emergencyActiveDesc}>{emergencyInfo.description}</Text> : null}
          <TouchableOpacity style={st.emergencyResolveBtn} onPress={resolveEmergency}>
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={st.emergencyResolveText}>Acil Durumu Kapat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={st.emergencyBtn}
          activeOpacity={0.8}
          onPress={() => { setEmergencyModal(true); setEmergencyReason(''); setEmergencyDesc(''); }}
        >
          <View style={st.emergencyIconBox}>
            <Ionicons name="warning" size={22} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.emergencyBtnTitle}>Acil Durum Bildir</Text>
            <Text style={st.emergencyBtnSub}>Araç arızası, sağlık sorunu vb.</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#fca5a5" />
        </TouchableOpacity>
      )}

      {/* ─── FOOTER ─── */}
      <View style={st.footerRow}>
        <Text style={st.footerText}>SmartTransfer Sürücü v1.1</Text>
      </View>

      {/* ─── EMERGENCY MODAL ─── */}
      <Modal visible={emergencyModal} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="warning" size={22} color="#ef4444" />
                <Text style={st.modalTitle}>Acil Durum Bildir</Text>
              </View>
              <TouchableOpacity onPress={() => setEmergencyModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={st.modalSub}>Bu bildirim ile operasyon merkezine acil durum iletilecek ve siz acil durumu bitirene kadar yeni operasyon atanamayacaktır.</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {EMERGENCY_REASONS.map(r => (
                <TouchableOpacity key={r} style={[st.reasonItem, emergencyReason === r && st.reasonActive]} onPress={() => setEmergencyReason(r)}>
                  <Ionicons name={emergencyReason === r ? 'radio-button-on' : 'radio-button-off'} size={18} color={emergencyReason === r ? '#ef4444' : '#94a3b8'} />
                  <Text style={[st.reasonText, emergencyReason === r && { color: '#ef4444', fontWeight: '600' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={st.modalLabel}>Açıklama (opsiyonel)</Text>
            <TextInput
              style={st.modalInput}
              placeholder="Ek detay yazın..."
              placeholderTextColor="#94a3b8"
              value={emergencyDesc}
              onChangeText={setEmergencyDesc}
              multiline
              numberOfLines={3}
            />
            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalCancel} onPress={() => setEmergencyModal(false)}>
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.modalSubmit} onPress={submitEmergency}>
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={st.modalSubmitText}>Bildir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ActionButton({ icon, label, color, bg, onPress, badgeCount }: {
  icon: string; label: string; color: string; bg: string; onPress: () => void; badgeCount?: number;
}) {
  return (
    <TouchableOpacity style={st.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[st.actionIconBox, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={24} color={color} />
        {!!badgeCount && badgeCount > 0 && (
          <View style={st.actionBadge}>
            <Text style={st.actionBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        )}
      </View>
      <Text style={st.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color="#cbd5e1" style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { paddingBottom: 40 },

  // Header
  header: {
    backgroundColor: '#0f1d3d',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 50,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(67,97,238,0.12)', top: -60, right: -40,
  },
  headerDecor2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(99,102,241,0.08)', bottom: -20, left: -30,
  },
  headerContent: { zIndex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 52, height: 52, borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarFallback: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(67,97,238,0.4)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  headerInfo: { flex: 1, marginLeft: 14 },
  greetingText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500' },
  nameText: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Stats (floating overlap)
  statsRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 10,
    marginTop: -30,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 5,
    borderBottomWidth: 3,
  },
  statCardPrimary: { borderBottomColor: Brand.primary },
  statCardSuccess: { borderBottomColor: Brand.success },
  statCardWarning: { borderBottomColor: Brand.warning },
  statIconBox: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 28, marginBottom: 14, gap: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },

  // Actions — list style
  actionsGrid: { paddingHorizontal: 16, gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  actionIconBox: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  actionBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#ef4444', borderRadius: 10,
    minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#fff',
  },
  actionBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#334155', flex: 1 },

  // Emergency
  emergencyBtn: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
    backgroundColor: '#fef2f2', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#fecaca',
  },
  emergencyIconBox: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  emergencyBtnTitle: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  emergencyBtnSub: { fontSize: 11, color: '#f87171', marginTop: 1 },
  emergencyActiveCard: {
    marginHorizontal: 16, backgroundColor: '#dc2626', borderRadius: 16, padding: 16,
  },
  emergencyActiveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  emergencyActiveTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  emergencyActiveReason: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  emergencyActiveDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 10 },
  emergencyResolveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10,
  },
  emergencyResolveText: { color: '#10b981', fontWeight: '700', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 18 },
  reasonItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  reasonActive: { backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 8 },
  reasonText: { fontSize: 14, color: '#334155' },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 14, marginBottom: 6 },
  modalInput: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, fontSize: 14, color: '#0f172a', minHeight: 60, textAlignVertical: 'top' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  modalCancelText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  modalSubmit: { flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', gap: 6 },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Footer
  footerRow: { alignItems: 'center', marginTop: 24 },
  footerText: { color: '#cbd5e1', fontSize: 11, fontWeight: '500', letterSpacing: 0.5 },
});
