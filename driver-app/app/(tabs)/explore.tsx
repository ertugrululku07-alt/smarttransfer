import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
  Linking, Platform, Alert, Modal, TextInput, ScrollView,
  ActivityIndicator, Image, Animated, Vibration, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Brand, StatusColors } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

// Extract short airport/destination name from full address
const extractDestinationName = (address: string): string => {
  if (!address) return 'Shuttle';
  const lower = address.toLowerCase();
  if (lower.includes('antalya') && (lower.includes('havaliman') || lower.includes('airport'))) return 'Antalya Havalimanı';
  if (lower.includes('gazipaşa') || lower.includes('gazipasa') || lower.includes('alanya')) return 'Gazipaşa Havalimanı';
  if (lower.includes('istanbul') && (lower.includes('havaliman') || lower.includes('airport'))) return 'İstanbul Havalimanı';
  if (lower.includes('sabiha')) return 'Sabiha Gökçen Havalimanı';
  if (lower.includes('dalaman')) return 'Dalaman Havalimanı';
  if (lower.includes('bodrum') || lower.includes('milas')) return 'Milas-Bodrum Havalimanı';
  if (lower.includes('izmir') || lower.includes('adnan menderes')) return 'İzmir Havalimanı';
  if (lower.includes('havaliman') || lower.includes('airport')) {
    // Extract first meaningful part
    const parts = address.split(',');
    return parts[0].trim();
  }
  // Not an airport — return first part of address
  const parts = address.split(',');
  return parts[0].trim();
};

const NO_SHOW_REASONS = [
  'Müşteri bulunamadı',
  'Müşteri telefona cevap vermiyor',
  'Müşteri iptal ettiğini söyledi',
  'Yanlış adres / konum',
  'Bekleme süresi doldu',
];

export default function JobListScreen() {
  const { token } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [noShowModal, setNoShowModal] = useState<{ visible: boolean; bookingId: string | null }>({ visible: false, bookingId: null });
  const [noShowReason, setNoShowReason] = useState('');
  const [noShowDesc, setNoShowDesc] = useState('');
  const [noShowPhoto, setNoShowPhoto] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    visible: boolean; bookingId: string | null;
    expectedAmount: number; expectedCurrency: string;
  }>({ visible: false, bookingId: null, expectedAmount: 0, expectedCurrency: 'TRY' });
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedCurrency, setCollectedCurrency] = useState('TRY');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [tenantCurrencies, setTenantCurrencies] = useState<string[]>(['TRY', 'EUR', 'USD']);
  const [defaultCurrency, setDefaultCurrency] = useState('TRY');
  const [extrasModal, setExtrasModal] = useState<{ visible: boolean; extras: any[] }>({ visible: false, extras: [] });
  const [expandedCustomer, setExpandedCustomer] = useState<Record<string, boolean>>({});
  // ── SOS / Emergency ──
  const [sosModal, setSosModal] = useState(false);
  const [sosType, setSosType] = useState<string>('GENERAL');
  const [sosMessage, setSosMessage] = useState('');
  const [sosSending, setSosSending] = useState(false);
  // ── Pre-trip Alarm ──
  const [alarmSettings, setAlarmSettings] = useState<{ enabled: boolean; minutes: number }>({ enabled: true, minutes: 30 });
  const [alarmModal, setAlarmModal] = useState<{ visible: boolean; job: any | null }>({ visible: false, job: null });
  // ── Late-warning per job (jobKey -> { etaMin, lateBy }) ──
  const [lateWarnings, setLateWarnings] = useState<Record<string, { etaMin: number; lateBy: number }>>({});
  const lastLateAlertRef = useRef<Set<string>>(new Set()); // already-alerted jobKeys (don't spam)
  const acknowledgedAlarmsRef = useRef<Set<string>>(new Set()); // booking ids/groupKeys whose alarm was already acknowledged
  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const vibrationLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fetch tenant currencies + driver settings on mount
    (async () => {
      try {
        const [curRes, setRes] = await Promise.all([
          fetch(`${API_URL}/driver/currencies`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_URL}/driver/settings`, { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);
        const curJson = await curRes.json();
        if (curJson.success && curJson.data) {
          setTenantCurrencies(curJson.data.currencies || ['TRY', 'EUR', 'USD']);
          setDefaultCurrency(curJson.data.defaultCurrency || 'TRY');
        }
        const setJson = await setRes.json();
        if (setJson.success && setJson.data) {
          setAlarmSettings({
            enabled: setJson.data.alarmEnabled !== false,
            minutes: Number(setJson.data.alarmMinutes) || 30,
          });
        }
      } catch (e) { console.warn('Failed to fetch driver config', e); }
    })();

    // Configure audio mode for alarm to play even in silent mode
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      staysActiveInBackground: false,
    }).catch(() => {});

    // Request notification permissions for background alerts
    Notifications.requestPermissionsAsync().catch(() => {});
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
        shouldShowBanner: true, shouldShowList: true,
      } as any),
    });
  }, []);

  // ── Alarm checker: every 20 seconds, check upcoming jobs ──
  useEffect(() => {
    if (!alarmSettings.enabled) return;
    const checkUpcoming = () => {
      const now = Date.now();
      const thresholdMs = alarmSettings.minutes * 60 * 1000;
      // Iterate jobs (private + shuttle groups) and find first un-acknowledged within threshold
      for (const j of jobs) {
        const jobKey = j._isShuttleGroup ? j.groupKey : j.id;
        if (!jobKey || acknowledgedAlarmsRef.current.has(jobKey)) continue;
        const startStr = j.startDate || j.bookings?.[0]?.pickupDateTime;
        if (!startStr) continue;
        const startMs = new Date(startStr).getTime();
        if (isNaN(startMs)) continue;
        const diff = startMs - now;
        // Trigger if within threshold AND in future (don't trigger for past jobs)
        if (diff > 0 && diff <= thresholdMs) {
          if (!alarmModal.visible) {
            triggerAlarm(j);
          }
          break;
        }
      }
    };
    checkUpcoming(); // immediate check
    const interval = setInterval(checkUpcoming, 20000); // every 20s
    return () => clearInterval(interval);
  }, [jobs, alarmSettings, alarmModal.visible]);

  // ── Late-warning checker: every 90s computes ETA via Haversine + 50 km/h avg ──
  useEffect(() => {
    let cancelled = false;
    const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const checkLate = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const myLat = pos.coords.latitude;
        const myLng = pos.coords.longitude;
        const now = Date.now();
        const newWarnings: Record<string, { etaMin: number; lateBy: number }> = {};

        for (const j of jobs) {
          if (j.status === 'COMPLETED' || j.status === 'CANCELLED' || j.status === 'NO_SHOW' || j.status === 'IN_PROGRESS') continue;
          const startStr = j.startDate || j.bookings?.[0]?.pickupDateTime;
          if (!startStr) continue;
          const startMs = new Date(startStr).getTime();
          if (isNaN(startMs)) continue;
          const minToStart = (startMs - now) / 60000;
          // Only check upcoming jobs in next 90 min
          if (minToStart < -5 || minToStart > 90) continue;

          // Pickup coords
          let pLat: number | undefined, pLng: number | undefined;
          if (j._isShuttleGroup) {
            pLat = j.bookings?.[0]?.metadata?.pickupLat;
            pLng = j.bookings?.[0]?.metadata?.pickupLng;
          } else {
            pLat = j.metadata?.pickupLat;
            pLng = j.metadata?.pickupLng;
          }
          if (!pLat || !pLng || pLat === 0 || pLng === 0) continue;

          const distKm = haversineKm(myLat, myLng, pLat, pLng);
          // Avg 50 km/h with 20% road-factor buffer → effective 40 km/h
          const etaMin = Math.ceil((distKm / 40) * 60) + 5; // +5 min boarding buffer
          const lateBy = Math.round(etaMin - minToStart);

          const jobKey = j._isShuttleGroup ? j.groupKey : j.id;
          if (lateBy > 0 && jobKey) {
            newWarnings[jobKey] = { etaMin, lateBy };
            // Show one-time toast alert per job
            if (!lastLateAlertRef.current.has(jobKey) && lateBy >= 5) {
              lastLateAlertRef.current.add(jobKey);
              const title = j._isShuttleGroup ? j.routeName : (j.contactName || 'Transfer');
              Alert.alert(
                '⚠️ Geç Kalabilirsin!',
                `${title}\n\nTahmini varış: ${etaMin} dk\nPickup'a kalan: ${Math.max(0, Math.round(minToStart))} dk\n\n~${lateBy} dakika geç kalman bekleniyor. Hemen yola çık!`
              );
              // Auto-clear so re-trigger after 10 min if still late
              setTimeout(() => { lastLateAlertRef.current.delete(jobKey); }, 10 * 60 * 1000);
            }
          }
        }
        if (!cancelled) setLateWarnings(newWarnings);
      } catch (e) {
        // Silent — location may be unavailable
      }
    };

    checkLate();
    const interval = setInterval(checkLate, 90 * 1000); // every 90s
    return () => { cancelled = true; clearInterval(interval); };
  }, [jobs]);

  const triggerAlarm = async (job: any) => {
    setAlarmModal({ visible: true, job });
    // Vibration loop
    Vibration.vibrate([0, 800, 400, 800], true);
    // Sound loop
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/alert.mp3'),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      alarmSoundRef.current = sound;
    } catch (e) {
      // Sound asset may not exist yet — fall back to system notification ping
      console.warn('Alarm sound load failed, using haptics only:', e);
    }
  };

  const stopAlarm = async () => {
    Vibration.cancel();
    if (vibrationLoopRef.current) { clearInterval(vibrationLoopRef.current); vibrationLoopRef.current = null; }
    if (alarmSoundRef.current) {
      try { await alarmSoundRef.current.stopAsync(); await alarmSoundRef.current.unloadAsync(); } catch {}
      alarmSoundRef.current = null;
    }
  };

  const acknowledgeAlarm = async () => {
    const j = alarmModal.job;
    if (j) {
      const jobKey = j._isShuttleGroup ? j.groupKey : j.id;
      if (jobKey) acknowledgedAlarmsRef.current.add(jobKey);
    }
    await stopAlarm();
    setAlarmModal({ visible: false, job: null });
  };

  const snoozeAlarm = async () => {
    // Snooze: stop alarm but DON'T mark as acknowledged — will re-trigger on next check
    await stopAlarm();
    setAlarmModal({ visible: false, job: null });
    // Temporarily mark as acknowledged for 5 minutes only
    const j = alarmModal.job;
    if (j) {
      const jobKey = j._isShuttleGroup ? j.groupKey : j.id;
      if (jobKey) {
        acknowledgedAlarmsRef.current.add(jobKey);
        setTimeout(() => { acknowledgedAlarmsRef.current.delete(jobKey); }, 5 * 60 * 1000);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopAlarm(); };
  }, []);

  const toggleCustomer = (id: string) => {
    setExpandedCustomer(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const sendSos = async () => {
    setSosSending(true);
    let lat: number | undefined, lng: number | undefined, address: string | undefined;
    try {
      // Best-effort location capture
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        try {
          const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (rev?.[0]) {
            const r = rev[0];
            address = [r.street, r.district, r.city, r.region].filter(Boolean).join(', ');
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Location capture failed for SOS:', e);
    }

    try {
      const res = await fetch(`${API_URL}/driver/sos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: sosType, message: sosMessage, lat, lng, address }),
      });
      const json = await res.json();
      if (json.success) {
        Alert.alert('✓ SOS Gönderildi', 'Yönetim ekibi bilgilendirildi. En kısa sürede sizinle iletişime geçilecek.');
        setSosModal(false);
        setSosMessage('');
        setSosType('GENERAL');
      } else {
        Alert.alert('Hata', json.error || 'SOS gönderilemedi');
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Bağlantı hatası');
    } finally {
      setSosSending(false);
    }
  };

  useEffect(() => { fetchJobs(); }, [filter]);

  // Periodic polling to ensure job list stays in sync (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs();
    }, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => { setTimeout(() => fetchJobs(), 500); };
    const handleUnassigned = (data: any) => {
      // Immediately remove from local state for instant UI feedback
      if (data?.bookingId) {
        setJobs(prev => {
          const filtered = prev.filter(j => j.id !== data.bookingId);
          // Also remove from shuttle groups
          return filtered.map(j => {
            if (j._isShuttleGroup && j.bookings) {
              const updatedBookings = j.bookings.filter((b: any) => b.id !== data.bookingId);
              if (updatedBookings.length === 0) return null;
              return { ...j, bookings: updatedBookings };
            }
            return j;
          }).filter(Boolean);
        });
      }
      // Also re-fetch to confirm server state
      setTimeout(() => fetchJobs(), 500);
    };

    socket.on('booking_status_update', handleUpdate);
    socket.on('booking_acknowledged', handleUpdate);
    socket.on('operation_assigned', handleUpdate);
    socket.on('operation_unassigned', handleUnassigned);
    socket.on('shuttle_runs_updated', handleUpdate);
    return () => { 
      socket.off('booking_status_update', handleUpdate); 
      socket.off('booking_acknowledged', handleUpdate); 
      socket.off('operation_assigned', handleUpdate);
      socket.off('operation_unassigned', handleUnassigned);
      socket.off('shuttle_runs_updated', handleUpdate);
    };
  }, [socket]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/driver/bookings?type=${filter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setJobs(json.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const updateStatus = async (bookingId: string, status: string) => {
    try {
      const res = await fetch(`${API_URL}/driver/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) {
        if (status === 'COMPLETED' || status === 'CANCELLED') {
           setJobs(prev => prev.filter(j => j.id !== bookingId)); // Optimistic remove
        } else {
           setJobs(prev => prev.map(j => j.id === bookingId ? { ...j, status } : j)); // Optimistic update
        }
        setTimeout(() => fetchJobs(), 1000);
      }
      else Alert.alert('Hata', 'Durum güncellenemedi');
    } catch { Alert.alert('Hata', 'Bağlantı hatası'); }
  };

  // Handle "Alındı" press — check if payment is PAY_IN_VEHICLE
  const handlePickup = (bookingId: string, paymentMethod?: string, total?: number, currency?: string) => {
    if (paymentMethod === 'PAY_IN_VEHICLE') {
      const useCurrency = currency || defaultCurrency || 'TRY';
      setPaymentModal({
        visible: true,
        bookingId,
        expectedAmount: total || 0,
        expectedCurrency: useCurrency
      });
      setCollectedAmount(String(total || 0));
      setCollectedCurrency(useCurrency);
    } else {
      updateStatus(bookingId, 'IN_PROGRESS');
    }
  };

  const submitPaymentAndPickup = async () => {
    if (!paymentModal.bookingId) return;
    const amount = parseFloat(collectedAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Uyarı', 'Lütfen geçerli bir tutar girin.');
      return;
    }
    setPaymentSaving(true);
    try {
      // 1. Record payment
      const payRes = await fetch(`${API_URL}/driver/bookings/${paymentModal.bookingId}/payment-received`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectedAmount: amount, collectedCurrency: collectedCurrency })
      });
      const payJson = await payRes.json();
      if (!payJson.success) {
        Alert.alert('Hata', payJson.error || 'Ödeme kaydedilemedi');
        setPaymentSaving(false);
        return;
      }
      // 2. Update status to IN_PROGRESS
      setJobs(prev => prev.map(j => j.id === paymentModal.bookingId ? { ...j, status: 'IN_PROGRESS' } : j)); // Optimistic UI
      await updateStatus(paymentModal.bookingId, 'IN_PROGRESS');
      Alert.alert('Başarılı', `${amount} ${collectedCurrency} ödeme alındı, müşteri alındı olarak işaretlendi.`);
      setPaymentModal({ visible: false, bookingId: null, expectedAmount: 0, expectedCurrency: 'TRY' });
    } catch {
      Alert.alert('Hata', 'Bağlantı hatası');
    } finally {
      setPaymentSaving(false);
    }
  };

  const acknowledgeBooking = async (bookingId: string) => {
    try {
      const res = await fetch(`${API_URL}/driver/bookings/${bookingId}/acknowledge`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      if (json.success) { 
        Alert.alert('Okundu', 'Transfer okundu olarak işaretlendi.'); 
        setJobs(prev => prev.map(j => j.id === bookingId ? { ...j, metadata: { ...j.metadata, driverAcknowledgedAt: new Date().toISOString() } } : j));
        setTimeout(() => fetchJobs(), 1000); 
      }
    } catch { Alert.alert('Hata', 'Bağlantı hatası'); }
  };

  const takeNoShowPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf çekmek için kamera izni gereklidir.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setNoShowPhoto(result.assets[0].uri);
    }
  };

  const submitNoShow = async () => {
    if (!noShowReason) { Alert.alert('Uyarı', 'Lütfen bir sebep seçin.'); return; }
    if (!noShowPhoto) { Alert.alert('Uyarı', 'Lütfen kanıt fotoğrafı çekin.'); return; }
    if (!noShowModal.bookingId) return;
    try {
      const res = await fetch(`${API_URL}/driver/bookings/${noShowModal.bookingId}/no-show`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: noShowReason, description: noShowDesc, photo: noShowPhoto })
      });
      const json = await res.json();
      if (json.success) {
        Alert.alert('No-Show', 'Müşteri gelmedi olarak bildirildi.');
        setJobs(prev => prev.filter(j => j.id !== noShowModal.bookingId)); // Optimistic remove
        setNoShowModal({ visible: false, bookingId: null });
        setNoShowReason(''); setNoShowDesc(''); setNoShowPhoto(null);
        setTimeout(() => fetchJobs(), 1000);
      }
    } catch { Alert.alert('Hata', 'Bağlantı hatası'); }
  };

  const openNav = (lat: number, lng: number, address?: string) => {
    if (lat && lng && lat !== 0 && lng !== 0) {
      const url = Platform.select({
        ios: `maps:0,0?q=Müşteri@${lat},${lng}`,
        android: `geo:0,0?q=${lat},${lng}(Müşteri)`
      });
      Linking.openURL(url!);
    } else if (address && address !== 'Belirtilmemiş') {
      Linking.openURL(Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(address)}`,
        android: `geo:0,0?q=${encodeURIComponent(address)}`
      })!);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ─── 3 ACTION BUTTONS ───
  const ThreeButtons = ({ bookingId, status, acknowledgedAt, paymentMethod, total, currency }: {
    bookingId: string; status: string; acknowledgedAt?: string;
    paymentMethod?: string; total?: number; currency?: string;
  }) => {
    if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW') return null;
    return (
      <View style={st.btnRow}>
        {/* Okundu */}
        <TouchableOpacity
          style={[st.triBtn, acknowledgedAt ? st.triBtnDone : st.triBtnBlue]}
          onPress={() => !acknowledgedAt && acknowledgeBooking(bookingId)}
          disabled={!!acknowledgedAt}
        >
          <Ionicons name={acknowledgedAt ? 'checkmark-done' : 'eye'} size={14} color="#fff" />
          <Text style={st.triBtnText}>{acknowledgedAt ? 'Okundu' : 'Okundu'}</Text>
        </TouchableOpacity>
        {/* Müşteri Alındı */}
        {status !== 'IN_PROGRESS' ? (
          <TouchableOpacity
            style={[st.triBtn, st.triBtnGreen]}
            onPress={() => handlePickup(bookingId, paymentMethod, total, currency)}
          >
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={st.triBtnText}>Alındı</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[st.triBtn, st.triBtnOrange]}
            onPress={() => updateStatus(bookingId, 'COMPLETED')}
          >
            <Ionicons name="flag" size={14} color="#fff" />
            <Text style={st.triBtnText}>Bitir</Text>
          </TouchableOpacity>
        )}
        {/* No-Show — disabled after pickup */}
        <TouchableOpacity
          style={[st.triBtn, status === 'IN_PROGRESS' ? st.triBtnDisabled : st.triBtnRed]}
          onPress={() => { if (status !== 'IN_PROGRESS') { setNoShowModal({ visible: true, bookingId }); setNoShowReason(''); setNoShowDesc(''); } }}
          disabled={status === 'IN_PROGRESS'}
        >
          <Ionicons name="person-remove" size={14} color="#fff" />
          <Text style={st.triBtnText}>No-Show</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── FLASHING EXTRAS BUTTON ───
  const FlashingExtrasBtn = ({ extras, onPress }: { extras: any[], onPress: () => void }) => {
    const pulseAnim = React.useRef(new Animated.Value(1)).current;
    
    React.useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
        ])
      ).start();
    }, []);

    const totalItems = extras.reduce((sum, ex) => sum + (ex?.quantity || ex?.qty || 1), 0);

    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ marginVertical: 4 }}>
        <Animated.View style={[st.flashingBtn, { opacity: pulseAnim }]}>
          <Ionicons name="alert-circle" size={16} color="#fff" />
          <Text style={st.flashingBtnText}>DİKKAT: MÜŞTERİ EKSTRA HİZMET ALMIŞTIR ({totalItems})</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // ─── CUSTOMER ROW (Shuttle) ───
  const CustomerRow = ({ c, onCall }: { c: any; onCall?: () => void }) => {
    const name = (c.contactName || ((c.customerFirstName || '') + ' ' + (c.customerLastName || '')).trim() || 'Misafir');
    const phone = c.customerPhone || c.contactPhone;
    const cAdults = c.adults || 0;
    const cChildren = c.children || 0;
    const cInfants = c.infants || 0;
    const pax = cAdults + cChildren + cInfants;
    const paxParts: string[] = [];
    if (cAdults > 0) paxParts.push(`${cAdults}Y`);
    if (cChildren > 0) paxParts.push(`${cChildren}Ç`);
    if (cInfants > 0) paxParts.push(`${cInfants}B`);
    const isExpanded = expandedCustomer[c.id];
    const pickupAddr = c.pickup || c.metadata?.pickup || '';
    const dropoffAddr = c.dropoff || c.metadata?.dropoff || '';
    const pickupLat = c.metadata?.pickupLat || 0;
    const pickupLng = c.metadata?.pickupLng || 0;
    const extras: any[] = c.extraServices || c.metadata?.extraServices || [];
    const hasExtras = extras.length > 0;
    return (
      <View>
        <TouchableOpacity style={[st.customerRow, hasExtras && st.customerRowExtras]} onPress={() => toggleCustomer(c.id)} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={st.customerName}>{name.trim()}</Text>
            <View style={st.customerMeta}>
              {phone ? <Text style={st.customerPhone}>{phone}</Text> : null}
              {c.customerEmail ? <Text style={st.customerEmail}>{c.customerEmail}</Text> : null}
              <Text style={st.paxBadge}>{pax} Pax{(cChildren > 0 || cInfants > 0) ? ` (${paxParts.join('+')})` : ''}</Text>
              {c.flightNumber ? <Text style={st.flightBadge}>{c.flightNumber}</Text> : null}
            </View>
            {hasExtras && (
              <FlashingExtrasBtn extras={extras} onPress={() => setExtrasModal({ visible: true, extras })} />
            )}
            {c.notes ? <Text style={st.noteText}>{c.notes}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {phone ? (
              <TouchableOpacity style={st.callChip} onPress={(e) => { e.stopPropagation(); onCall?.(); }}>
                <Ionicons name="call" size={14} color={Brand.primary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={st.navChip} onPress={(e) => { e.stopPropagation(); openNav(pickupLat, pickupLng, pickupAddr); }}>
              <Ionicons name="navigate" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {isExpanded && (
          <View style={st.customerDetail}>
            {pickupAddr ? <View style={st.cdRow}><View style={st.dotGreen} /><Text style={st.cdText} numberOfLines={2}>{pickupAddr}</Text></View> : null}
            {dropoffAddr ? <View style={st.cdRow}><View style={st.dotRed} /><Text style={st.cdText} numberOfLines={2}>{dropoffAddr}</Text></View> : null}
            {phone ? <View style={st.cdRow}><Ionicons name="call" size={12} color="#64748b" /><Text style={st.cdText}>{phone}</Text></View> : null}
            {c.customerEmail ? <View style={st.cdRow}><Ionicons name="mail" size={12} color="#64748b" /><Text style={st.cdText}>{c.customerEmail}</Text></View> : null}
            {c.bookingNumber ? <View style={st.cdRow}><Ionicons name="document-text" size={12} color="#64748b" /><Text style={st.cdText}>#{c.bookingNumber}</Text></View> : null}
          </View>
        )}
      </View>
    );
  };

  // ─── Helper: shorten address to 2-3 words for compact display ───
  const shortAddr = (addr: string): string => {
    if (!addr) return '-';
    // Take first comma-separated chunk and trim
    const first = addr.split(',')[0].trim();
    // If too long, take first 22 chars
    return first.length > 24 ? first.substring(0, 22) + '…' : first;
  };

  // ─── RENDER ITEM (Compact tabular row) ───
  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const orderLabel = `${index + 1}.İŞ`;

    // Shuttle Group ────────────────────────────────────────────────
    if (item._isShuttleGroup) {
      const expanded = expandedGroups[item.groupKey];
      const totalPax = item.bookings.reduce((s: number, b: any) => s + (b.adults || 0) + (b.children || 0) + (b.infants || 0), 0);
      const date = new Date(item.startDate);
      const time = item.masterTime || date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dirCode = item.pickupCode && item.dropoffCode ? `${item.pickupCode}-${item.dropoffCode}` : (item.direction || 'TRF');
      const dirColor = item.direction === 'ARV' ? '#3b82f6' : item.direction === 'DEP' ? '#f59e0b' : '#7c3aed';
      const meetingPlace = shortAddr(item.bookings[0]?.pickup || item.pickup || 'Çeşitli');
      const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: '' };
      const lateW = lateWarnings[item.groupKey];

      return (
        <View style={st.compactWrap}>
          {lateW && (
            <View style={st.lateBadge}>
              <Ionicons name="warning" size={10} color="#fff" />
              <Text style={st.lateBadgeText}>~{lateW.lateBy} dk geç kalabilirsin</Text>
            </View>
          )}
          <TouchableOpacity style={[st.compactRow, lateW && st.compactRowLate]} activeOpacity={0.7} onPress={() => toggleGroup(item.groupKey)}>
            <View style={[st.orderBadge, { backgroundColor: '#f5f3ff' }]}>
              <Text style={[st.orderText, { color: '#7c3aed' }]}>{orderLabel}</Text>
            </View>
            <View style={st.timeCol}>
              <Text style={st.timeBig}>{time}</Text>
              <View style={st.typeChipShuttle}><Ionicons name="bus" size={9} color="#7c3aed" /><Text style={st.typeChipShuttleText}>SHUTTLE</Text></View>
            </View>
            <View style={st.placeCol}>
              <Text style={st.placeText} numberOfLines={1}>{item.routeName}</Text>
              <Text style={st.placeSub} numberOfLines={1}>{item.bookings.length} müşteri · {totalPax} Pax · {meetingPlace}</Text>
            </View>
            <View style={[st.dirBadge, { backgroundColor: `${dirColor}18`, borderColor: `${dirColor}55` }]}>
              <Text style={[st.dirText, { color: dirColor }]}>{dirCode}</Text>
            </View>
            <View style={st.detayBtn}>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          {expanded && (
            <View style={st.expandedSection}>
              <View style={st.expandedHeader}>
                <Text style={st.expandedTitle}>{item.routeName}</Text>
                {statusCfg.label ? <View style={[st.statusBadge, { backgroundColor: statusCfg.bg }]}><Text style={[st.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text></View> : null}
              </View>
              {item.bookings.map((b: any, i: number) => (
                <View key={b.id}>
                  <CustomerRow c={b} onCall={() => Linking.openURL(`tel:${b.customerPhone || b.contactPhone}`)} />
                  <ThreeButtons bookingId={b.id} status={b.status} acknowledgedAt={b.acknowledgedAt} paymentMethod={b.paymentMethod || b.metadata?.paymentMethod} total={b.total} currency={b.currency} />
                  {i < item.bookings.length - 1 && <View style={st.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }

    // Private Transfer ─────────────────────────────────────────────
    const date = new Date(item.startDate);
    const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const from = item.metadata?.pickup || item.product?.transferData?.pickupZones?.[0]?.name || 'Belirtilmemiş';
    const to = item.metadata?.dropoff || item.product?.transferData?.dropoffZones?.[0]?.name || 'Belirtilmemiş';
    const customerName = item.contactName || (item.customer?.firstName ? `${item.customer.firstName} ${item.customer.lastName || ''}`.trim() : 'Misafir');
    const iAdults = item.adults || 0, iChildren = item.children || 0, iInfants = item.infants || 0;
    const pax = iAdults + iChildren + iInfants;
    // Direction code: try to detect airport in either side
    const fromU = String(from).toLowerCase();
    const toU = String(to).toLowerCase();
    const isFromAirport = fromU.includes('havaliman') || fromU.includes('airport') || /\bayt\b|\bgzp\b/.test(fromU);
    const isToAirport = toU.includes('havaliman') || toU.includes('airport') || /\bayt\b|\bgzp\b/.test(toU);
    const dirType = isFromAirport && !isToAirport ? 'ARV' : isToAirport && !isFromAirport ? 'DEP' : 'TRF';
    const dirCode = dirType;
    const dirColor = dirType === 'ARV' ? '#3b82f6' : dirType === 'DEP' ? '#f59e0b' : '#64748b';
    const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: '' };
    const ack = item.metadata?.acknowledgedAt;
    const lateW = lateWarnings[item.id];

    return (
      <View style={st.compactWrap}>
        {lateW && (
          <View style={st.lateBadge}>
            <Ionicons name="warning" size={10} color="#fff" />
            <Text style={st.lateBadgeText}>~{lateW.lateBy} dk geç kalabilirsin</Text>
          </View>
        )}
      <TouchableOpacity
        style={[st.compactRow, lateW && st.compactRowLate]}
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}
      >
        <View style={[st.orderBadge, { backgroundColor: '#eef2ff' }]}>
          <Text style={[st.orderText, { color: Brand.primary }]}>{orderLabel}</Text>
        </View>
        <View style={st.timeCol}>
          <Text style={st.timeBig}>{time}</Text>
          <View style={st.typeChipPrivate}><Ionicons name="car-sport" size={9} color={Brand.primary} /><Text style={st.typeChipPrivateText}>ÖZEL</Text></View>
        </View>
        <View style={st.placeCol}>
          <Text style={st.placeText} numberOfLines={1}>{customerName}</Text>
          <Text style={st.placeSub} numberOfLines={1}>{shortAddr(from)} → {shortAddr(to)} · {pax} Pax{ack ? ' · ✓' : ''}</Text>
        </View>
        <View style={[st.dirBadge, { backgroundColor: `${dirColor}18`, borderColor: `${dirColor}55` }]}>
          <Text style={[st.dirText, { color: dirColor }]}>{dirCode}</Text>
        </View>
        <View style={st.detayBtn}>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </View>
      </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <View style={st.header}>
        <Ionicons name="briefcase" size={22} color={Brand.primary} />
        <Text style={st.title}>Operasyon Listesi</Text>
        <TouchableOpacity onPress={() => setSosModal(true)} style={st.sosHeaderBtn}>
          <Ionicons name="warning" size={16} color="#fff" />
          <Text style={st.sosHeaderBtnText}>SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={fetchJobs} style={{ padding: 4 }}>
          <Ionicons name="refresh-outline" size={22} color={Brand.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={st.tabs}>
        {[{ key: 'all', label: 'Tümü' }, { key: 'today', label: 'Bugün' }, { key: 'upcoming', label: 'Gelecek' }].map(tab => (
          <TouchableOpacity key={tab.key} style={[st.tab, filter === tab.key && st.activeTab]} onPress={() => setFilter(tab.key)}>
            <Text style={[st.tabText, filter === tab.key && st.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={jobs}
        renderItem={renderItem}
        keyExtractor={(item: any) => item.groupKey || item.id}
        extraData={jobs}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchJobs} />}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="briefcase-outline" size={48} color={Brand.textLight} />
            <Text style={st.emptyText}>Transfer bulunamadı.</Text>
            <Text style={st.emptySub}>Atanan transferler burada görünecek.</Text>
          </View>
        }
      />

      {/* No-Show Modal */}
      <Modal visible={noShowModal.visible} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>No-Show Bildirimi</Text>
              <TouchableOpacity onPress={() => setNoShowModal({ visible: false, bookingId: null })}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={st.modalSub}>Müşterinin gelmeme sebebini seçin:</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {NO_SHOW_REASONS.map(r => (
                <TouchableOpacity key={r} style={[st.reasonItem, noShowReason === r && st.reasonActive]} onPress={() => setNoShowReason(r)}>
                  <Ionicons name={noShowReason === r ? 'radio-button-on' : 'radio-button-off'} size={18} color={noShowReason === r ? Brand.danger : '#94a3b8'} />
                  <Text style={[st.reasonText, noShowReason === r && { color: Brand.danger, fontWeight: '600' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={st.modalLabel}>Açıklama (opsiyonel)</Text>
            <TextInput
              style={st.modalInput}
              placeholder="Ek detay yazın..."
              placeholderTextColor="#94a3b8"
              value={noShowDesc}
              onChangeText={setNoShowDesc}
              multiline
              numberOfLines={3}
            />

            {/* Photo proof */}
            <Text style={st.modalLabel}>Kanıt Fotoğrafı (zorunlu)</Text>
            <TouchableOpacity style={st.photoBtn} onPress={takeNoShowPhoto}>
              {noShowPhoto ? (
                <Image source={{ uri: noShowPhoto }} style={st.photoPreview} />
              ) : (
                <View style={st.photoPlaceholder}>
                  <Ionicons name="camera" size={28} color="#94a3b8" />
                  <Text style={st.photoPlaceholderText}>Fotoğraf Çek</Text>
                </View>
              )}
            </TouchableOpacity>
            {noShowPhoto && (
              <TouchableOpacity onPress={() => setNoShowPhoto(null)} style={{ alignSelf: 'center', marginTop: 4 }}>
                <Text style={{ color: Brand.danger, fontSize: 12, fontWeight: '600' }}>Fotoğrafı Kaldır</Text>
              </TouchableOpacity>
            )}

            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalCancel} onPress={() => { setNoShowModal({ visible: false, bookingId: null }); setNoShowPhoto(null); }}>
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.modalSubmit, !noShowPhoto && { opacity: 0.5 }]} onPress={submitNoShow}>
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={st.modalSubmitText}>Bildir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Collection Modal */}
      <Modal visible={paymentModal.visible} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Ödeme Tahsilatı</Text>
              <TouchableOpacity onPress={() => setPaymentModal({ visible: false, bookingId: null, expectedAmount: 0, expectedCurrency: 'TRY' })}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={st.payExpectedRow}>
              <Ionicons name="cash-outline" size={20} color="#059669" />
              <Text style={st.payExpectedLabel}>Alınması Gereken Tutar:</Text>
            </View>
            <Text style={st.payExpectedAmount}>
              {paymentModal.expectedAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paymentModal.expectedCurrency}
            </Text>

            <Text style={st.modalLabel}>Alınan Tutar</Text>
            <TextInput
              style={st.payAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              value={collectedAmount}
              onChangeText={setCollectedAmount}
            />

            <Text style={st.modalLabel}>Para Birimi</Text>
            <View style={st.currencyRow}>
              {tenantCurrencies.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[st.currencyChip, collectedCurrency === c && st.currencyChipActive]}
                  onPress={() => setCollectedCurrency(c)}
                >
                  <Text style={[st.currencyChipText, collectedCurrency === c && st.currencyChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalCancel} onPress={() => setPaymentModal({ visible: false, bookingId: null, expectedAmount: 0, expectedCurrency: 'TRY' })}>
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalSubmit, { backgroundColor: '#059669' }, paymentSaving && { opacity: 0.6 }]}
                onPress={submitPaymentAndPickup}
                disabled={paymentSaving}
              >
                {paymentSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={st.modalSubmitText}>Ödeme Alındı</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ───────── PRE-TRIP ALARM MODAL ───────── */}
      <Modal visible={alarmModal.visible} animationType="fade" transparent statusBarTranslucent>
        <View style={st.alarmOverlay}>
          <View style={st.alarmCard}>
            <View style={st.alarmIconWrap}>
              <Ionicons name="alarm" size={56} color="#fff" />
            </View>
            <Text style={st.alarmTitle}>YAKLAŞAN TRANSFER!</Text>
            <Text style={st.alarmSubtitle}>
              {alarmSettings.minutes} dakika içinde başlıyor
            </Text>

            {alarmModal.job && (() => {
              const j = alarmModal.job;
              const date = j.startDate ? new Date(j.startDate) : null;
              const time = date ? date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
              const minutesLeft = date ? Math.max(0, Math.floor((date.getTime() - Date.now()) / 60000)) : alarmSettings.minutes;
              const title = j._isShuttleGroup ? j.routeName : (j.contactName || 'Transfer');
              const pickup = j._isShuttleGroup ? (j.bookings?.[0]?.pickup || j.pickup) : j.metadata?.pickup;
              const dropoff = j._isShuttleGroup ? j.dropoff : j.metadata?.dropoff;
              const totalPax = j._isShuttleGroup
                ? j.bookings.reduce((s: number, b: any) => s + (b.adults || 0) + (b.children || 0) + (b.infants || 0), 0)
                : (j.adults || 0) + (j.children || 0) + (j.infants || 0);
              return (
                <View style={st.alarmJobBox}>
                  <View style={st.alarmRow}>
                    <Ionicons name="time" size={20} color="#dc2626" />
                    <Text style={st.alarmTime}>{time}</Text>
                    <View style={st.alarmCountdown}>
                      <Text style={st.alarmCountdownText}>{minutesLeft} dk kaldı</Text>
                    </View>
                  </View>
                  <Text style={st.alarmJobTitle} numberOfLines={2}>{title}</Text>
                  {pickup ? (
                    <View style={st.alarmRow}>
                      <View style={st.dotGreen} />
                      <Text style={st.alarmAddrText} numberOfLines={2}>{pickup}</Text>
                    </View>
                  ) : null}
                  {dropoff ? (
                    <View style={st.alarmRow}>
                      <View style={st.dotRed} />
                      <Text style={st.alarmAddrText} numberOfLines={2}>{dropoff}</Text>
                    </View>
                  ) : null}
                  {totalPax > 0 && (
                    <View style={st.alarmRow}>
                      <Ionicons name="people" size={14} color="#64748b" />
                      <Text style={st.alarmMeta}>{totalPax} Pax</Text>
                    </View>
                  )}
                </View>
              );
            })()}

            <View style={st.alarmBtnRow}>
              <TouchableOpacity style={[st.alarmBtn, st.alarmBtnSnooze]} onPress={snoozeAlarm}>
                <Ionicons name="time-outline" size={18} color="#fff" />
                <Text style={st.alarmBtnText}>5 dk Ertele</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.alarmBtn, st.alarmBtnAck]} onPress={acknowledgeAlarm}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={st.alarmBtnText}>Hazırım</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ───────── SOS / Emergency Modal ───────── */}
      <Modal visible={sosModal} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#dc2626' } as any}>
                  <Ionicons name="warning" size={20} color="#fff" />
                </View>
                <View>
                  <Text style={st.modalTitle}>SOS / Acil Durum</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>Yönetim ekibine acil bildirim gönder</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSosModal(false)} disabled={sosSending}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={st.modalLabel}>Acil Durum Türü</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[
                { v: 'ACCIDENT', l: '🚗 Kaza', c: '#dc2626' },
                { v: 'VEHICLE', l: '🔧 Araç Arızası', c: '#f59e0b' },
                { v: 'PASSENGER', l: '👤 Müşteri Sorunu', c: '#7c3aed' },
                { v: 'MEDICAL', l: '🏥 Sağlık', c: '#0ea5e9' },
                { v: 'GENERAL', l: '⚠️ Diğer', c: '#64748b' },
              ].map(t => (
                <TouchableOpacity
                  key={t.v}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                    borderWidth: 2, borderColor: sosType === t.v ? t.c : '#e2e8f0',
                    backgroundColor: sosType === t.v ? `${t.c}15` : '#fff',
                  }}
                  onPress={() => setSosType(t.v)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: sosType === t.v ? t.c : '#64748b' }}>{t.l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.modalLabel}>Açıklama (opsiyonel)</Text>
            <TextInput
              style={st.modalInput}
              placeholder="Kısa açıklama yazın..."
              placeholderTextColor="#94a3b8"
              value={sosMessage}
              onChangeText={setSosMessage}
              multiline
              numberOfLines={3}
              maxLength={300}
            />

            <View style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginVertical: 8, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle" size={16} color="#dc2626" />
              <Text style={{ fontSize: 11, color: '#991b1b', flex: 1, lineHeight: 16 }}>
                Konum bilgin otomatik alınır ve yönetim ekibine iletilir. Çok acil bir durumda 112 / 155'i de aramayı unutma.
              </Text>
            </View>

            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalCancel} onPress={() => setSosModal(false)} disabled={sosSending}>
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalSubmit, { backgroundColor: '#dc2626' }, sosSending && { opacity: 0.6 }]}
                onPress={sendSos}
                disabled={sosSending}
              >
                {sosSending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="warning" size={16} color="#fff" />}
                <Text style={st.modalSubmitText}>{sosSending ? 'Gönderiliyor...' : 'SOS Gönder'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Extras Details Modal */}
      <Modal visible={extrasModal.visible} animationType="fade" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="star" size={22} color="#e11d48" />
                <Text style={st.modalTitle}>Ekstra Hizmetler</Text>
              </View>
              <TouchableOpacity onPress={() => setExtrasModal({ visible: false, extras: [] })}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300, marginTop: 10 }}>
              {extrasModal.extras.map((ex: any, i: number) => {
                const qty = ex?.quantity || ex?.qty || 1;
                const name = ex?.name || ex?.label || ex || 'Bilinmeyen Hizmet';
                return (
                  <View key={i} style={st.extraModalItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    <Text style={st.extraModalItemName}>{name}</Text>
                    <View style={st.extraModalItemQtyBadge}>
                      <Text style={st.extraModalItemQtyText}>{qty} Adet</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            
            <TouchableOpacity style={[st.modalSubmit, { marginTop: 16 }]} onPress={() => setExtrasModal({ visible: false, extras: [] })}>
              <Text style={st.modalSubmitText}>Tamam, Anladım</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a', flex: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#e2e8f0' },
  activeTab: { backgroundColor: Brand.primary },
  tabText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  activeTabText: { color: '#fff' },
  list: { paddingHorizontal: 12, paddingBottom: 20 },

  // ─── Compact tabular row (new design) ───
  compactWrap: { marginBottom: 6 },
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
    marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  orderBadge: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  orderText: { fontSize: 10, fontWeight: '800' },
  timeCol: { alignItems: 'center', minWidth: 56, gap: 2 },
  timeBig: { fontSize: 16, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  typeChipShuttle: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#f5f3ff', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  typeChipShuttleText: { fontSize: 8, fontWeight: '800', color: '#7c3aed', letterSpacing: 0.3 },
  typeChipPrivate: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#eef2ff', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  typeChipPrivateText: { fontSize: 8, fontWeight: '800', color: Brand.primary, letterSpacing: 0.3 },
  placeCol: { flex: 1, gap: 2 },
  placeText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  placeSub: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  dirBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 56,
  },
  dirText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  detayBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  expandedSection: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: -2, marginBottom: 6,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  expandedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  expandedTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', flex: 1 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  shuttleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f5f3ff', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
  shuttleBadgeText: { fontSize: 10, fontWeight: '700', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5 },
  privateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eef2ff', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
  privateBadgeText: { fontSize: 10, fontWeight: '700', color: Brand.primary, textTransform: 'uppercase', letterSpacing: 0.5 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dateTimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  dateLabel: { fontSize: 12, fontWeight: '700', color: '#334155', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Brand.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 4 },
  timeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  paxInfo: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontWeight: '700', fontSize: 10 },

  // Route
  route: { marginBottom: 10 },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.success, marginRight: 10 },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.danger, marginRight: 10 },
  routeLine: { width: 2, height: 12, backgroundColor: '#e2e8f0', marginLeft: 3, marginBottom: 3 },
  routeText: { fontSize: 13, color: '#1e293b', fontWeight: '500', flex: 1 },

  // Customer info (private)
  infoBlock: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginBottom: 8, gap: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 12, color: '#475569' },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f1f5f9' },
  quickText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  navBtn: { backgroundColor: Brand.primary, marginLeft: 'auto' },

  // 3 Buttons
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  triBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10 },
  triBtnBlue: { backgroundColor: '#3b82f6' },
  triBtnGreen: { backgroundColor: '#10b981' },
  triBtnOrange: { backgroundColor: '#f59e0b' },
  triBtnRed: { backgroundColor: '#ef4444' },
  triBtnDone: { backgroundColor: '#94a3b8' },
  triBtnDisabled: { backgroundColor: '#cbd5e1', opacity: 0.5 },
  triBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Expand
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4 },
  expandText: { fontSize: 12, fontWeight: '600', color: Brand.primary },

  // Customer list (shuttle)
  customerList: { marginTop: 8 },
  customerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  customerRowExtras: { backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: '#f59e0b', paddingLeft: 8, borderRadius: 8, marginVertical: 2 },
  extrasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  extraBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#fbbf24' },
  extraBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400e' },
  privateExtrasBlock: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: '#fffbeb', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#fde68a' },
  customerName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  customerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  customerPhone: { fontSize: 11, color: Brand.primary },
  customerEmail: { fontSize: 11, color: '#64748b' },
  paxBadge: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  flightBadge: { fontSize: 11, color: '#d97706', fontWeight: '600' },
  noteText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 },
  callChip: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  navChip: { width: 32, height: 32, borderRadius: 16, backgroundColor: Brand.primary, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 4 },

  // Shuttle destination
  shuttleDestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  shuttleDestText: { fontSize: 15, fontWeight: '700', color: '#1e293b', flex: 1 },

  // Customer detail expansion
  customerDetail: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 4, marginBottom: 6, gap: 6 },
  cdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cdText: { fontSize: 12, color: '#475569', flex: 1 },

  // Empty
  empty: { padding: 60, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { color: '#94a3b8', fontSize: 13, marginTop: 4 },

  // No-Show Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 12 },
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

  // Photo capture
  photoBtn: { borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  photoPreview: { width: '100%', height: 150, borderRadius: 12 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', height: 100, backgroundColor: '#f8fafc' },
  photoPlaceholderText: { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginTop: 4 },

  // Payment modal
  payExpectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  payExpectedLabel: { fontSize: 14, color: '#374151', fontWeight: '600' },
  payExpectedAmount: { fontSize: 28, fontWeight: '800', color: '#059669', marginVertical: 12, textAlign: 'center' },
  payAmountInput: {
    backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb',
    paddingHorizontal: 16, height: 52, fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center',
    marginBottom: 12,
  },
  currencyRow: { flexDirection: 'row', gap: 10, marginBottom: 16, justifyContent: 'center' },
  currencyChip: {
    paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  currencyChipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  currencyChipText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  currencyChipTextActive: { color: '#fff' },

  // Flashing Btn
  flashingBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e11d48', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6, alignSelf: 'flex-start' },
  flashingBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  extraModalItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, marginVertical: 4, borderWidth: 1, borderColor: '#e2e8f0', gap: 10 },
  extraModalItemName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1e293b' },
  extraModalItemQtyBadge: { backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  extraModalItemQtyText: { fontSize: 13, fontWeight: '800', color: Brand.primary },

  // ─── Pre-trip Alarm modal ───
  alarmOverlay: {
    flex: 1, backgroundColor: 'rgba(220, 38, 38, 0.92)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  alarmCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24,
    width: '100%', maxWidth: 420,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 20,
  },
  alarmIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#dc2626', alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, marginTop: -60,
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  alarmTitle: {
    fontSize: 22, fontWeight: '900', color: '#dc2626',
    textAlign: 'center', letterSpacing: 0.5, marginBottom: 4,
  },
  alarmSubtitle: {
    fontSize: 14, color: '#64748b', textAlign: 'center',
    fontWeight: '600', marginBottom: 16,
  },
  alarmJobBox: {
    backgroundColor: '#fef2f2', borderRadius: 14, padding: 14,
    borderWidth: 2, borderColor: '#fecaca', marginBottom: 16, gap: 8,
  },
  alarmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alarmTime: { fontSize: 22, fontWeight: '900', color: '#dc2626', flex: 1 },
  alarmCountdown: {
    backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12,
  },
  alarmCountdownText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  alarmJobTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  alarmAddrText: { fontSize: 12, color: '#475569', flex: 1, fontWeight: '500' },
  alarmMeta: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  alarmBtnRow: { flexDirection: 'row', gap: 10 },
  alarmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12,
  },
  alarmBtnSnooze: { backgroundColor: '#94a3b8' },
  alarmBtnAck: { backgroundColor: '#16a34a' },
  alarmBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // ─── SOS button in header ───
  sosHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  sosHeaderBtnText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  // ─── Late warning badge & row ───
  compactRowLate: { borderColor: '#fb923c', borderWidth: 2 },
  lateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f97316',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, alignSelf: 'flex-start',
    marginLeft: 14, marginBottom: -2, zIndex: 2,
  },
  lateBadgeText: { color: '#fff', fontWeight: '800', fontSize: 10 },
});
