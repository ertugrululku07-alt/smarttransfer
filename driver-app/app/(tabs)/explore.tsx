import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
  Linking, Platform, Alert, Modal, TextInput, ScrollView,
  ActivityIndicator, Image, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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

  useEffect(() => {
    // Fetch tenant currencies on mount
    (async () => {
      try {
        const res = await fetch(`${API_URL}/driver/currencies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success && json.data) {
          setTenantCurrencies(json.data.currencies || ['TRY', 'EUR', 'USD']);
          setDefaultCurrency(json.data.defaultCurrency || 'TRY');
        }
      } catch (e) { console.warn('Failed to fetch currencies', e); }
    })();
  }, []);

  useEffect(() => { fetchJobs(); }, [filter]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => { setTimeout(() => fetchJobs(), 500); };
    socket.on('booking_status_update', handleUpdate);
    socket.on('booking_acknowledged', handleUpdate);
    return () => { socket.off('booking_status_update', handleUpdate); socket.off('booking_acknowledged', handleUpdate); };
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
      if (json.success) setTimeout(() => fetchJobs(), 300);
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
      await updateStatus(paymentModal.bookingId, 'IN_PROGRESS');
      Alert.alert('Başarılı', `${amount} ${collectedCurrency} ödeme alındı, müşteri alındı olarak işaretlendi.`);
      setPaymentModal({ visible: false, bookingId: null, expectedAmount: 0, expectedCurrency: 'TRY' });
      fetchJobs();
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
      if (json.success) { Alert.alert('Okundu', 'Transfer okundu olarak işaretlendi.'); fetchJobs(); }
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
        setNoShowModal({ visible: false, bookingId: null });
        setNoShowReason(''); setNoShowDesc(''); setNoShowPhoto(null);
        fetchJobs();
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

  const [expandedCustomer, setExpandedCustomer] = useState<Record<string, boolean>>({});
  const toggleCustomer = (id: string) => setExpandedCustomer(prev => ({ ...prev, [id]: !prev[id] }));

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
    const pax = (c.adults || 0) + (c.children || 0);
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
              <Text style={st.paxBadge}>{pax} Pax</Text>
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

  // ─── RENDER ITEM ───
  const renderItem = ({ item }: { item: any }) => {
    // Shuttle Group
    if (item._isShuttleGroup) {
      const expanded = expandedGroups[item.groupKey];
      const totalPax = item.bookings.reduce((s: number, b: any) => s + (b.adults || 0) + (b.children || 0), 0);
      const date = new Date(item.startDate);
      const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dayStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: item.status };

      return (
        <View style={st.card}>
          {/* Shuttle badge */}
          <View style={st.shuttleBadge}>
            <Ionicons name="bus" size={12} color="#7c3aed" />
            <Text style={st.shuttleBadgeText}>Shuttle Transfer</Text>
          </View>

          <View style={st.cardHeader}>
            <View style={st.dateTimeBadge}>
              <Text style={st.dateLabel}>{dayStr}</Text>
              <View style={st.timeBadge}><Ionicons name="time-outline" size={12} color="#fff" /><Text style={st.timeText}>{time}</Text></View>
              <Text style={st.paxInfo}>{item.bookings.length} Müşteri • {totalPax} Pax</Text>
            </View>
            <View style={[st.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[st.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
            </View>
          </View>

          {/* Show destination airport name */}
          <View style={st.shuttleDestRow}>
            <Ionicons name="airplane" size={16} color={Brand.primary} />
            <Text style={st.shuttleDestText}>{extractDestinationName(item.dropoff)}</Text>
          </View>

          <TouchableOpacity style={st.expandBtn} onPress={() => toggleGroup(item.groupKey)}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Brand.primary} />
            <Text style={st.expandText}>{expanded ? 'Müşterileri Gizle' : 'Müşterileri Göster'}</Text>
          </TouchableOpacity>

          {expanded && (
            <View style={st.customerList}>
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

    // Private Transfer
    const date = new Date(item.startDate);
    const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dayStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    const from = item.metadata?.pickup || item.product?.transferData?.pickupZones?.[0]?.name || 'Belirtilmemiş';
    const to = item.metadata?.dropoff || item.product?.transferData?.dropoffZones?.[0]?.name || 'Belirtilmemiş';
    const lat = item.metadata?.pickupLat || 0;
    const lng = item.metadata?.pickupLng || 0;
    const customerName = item.contactName || (item.customer?.firstName ? `${item.customer.firstName} ${item.customer.lastName || ''}`.trim() : 'Misafir');
    const phone = item.contactPhone || item.customer?.phone;
    const email = item.contactEmail || item.customer?.email;
    const pax = (item.adults || 0) + (item.children || 0);
    const flightNo = item.flightNumber || item.metadata?.flightNumber;
    const privateExtras: any[] = item.metadata?.extraServices || [];
    const hasPrivateExtras = privateExtras.length > 0;
    const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: item.status };
    const ack = item.metadata?.acknowledgedAt;

    return (
      <View style={st.card}>
        <View style={st.privateBadge}>
          <Ionicons name="car-sport" size={12} color={Brand.primary} />
          <Text style={st.privateBadgeText}>Özel Transfer</Text>
        </View>

        <View style={st.cardHeader}>
          <View style={st.dateTimeBadge}>
            <Text style={st.dayText}>{dayStr}</Text>
            <View style={st.timeBadge}><Ionicons name="time-outline" size={12} color="#fff" /><Text style={st.timeText}>{time}</Text></View>
          </View>
          <View style={[st.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[st.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
          </View>
        </View>

        <View style={st.route}>
          <View style={st.routeRow}><View style={st.dotGreen} /><Text style={st.routeText} numberOfLines={1}>{from}</Text></View>
          <View style={st.routeLine} />
          <View style={st.routeRow}><View style={st.dotRed} /><Text style={st.routeText} numberOfLines={1}>{to}</Text></View>
        </View>

        {/* Customer Info */}
        <View style={st.infoBlock}>
          <View style={st.infoRow}><Ionicons name="person" size={14} color="#64748b" /><Text style={st.infoText}>{customerName}</Text></View>
          {phone ? <View style={st.infoRow}><Ionicons name="call" size={14} color="#64748b" /><TouchableOpacity onPress={() => Linking.openURL(`tel:${phone}`)}><Text style={[st.infoText, { color: Brand.primary }]}>{phone}</Text></TouchableOpacity></View> : null}
          {email ? <View style={st.infoRow}><Ionicons name="mail" size={14} color="#64748b" /><Text style={st.infoText}>{email}</Text></View> : null}
          <View style={st.infoRow}><Ionicons name="people" size={14} color="#64748b" /><Text style={st.infoText}>{pax} Pax</Text></View>
          {flightNo ? <View style={st.infoRow}><Ionicons name="airplane" size={14} color="#64748b" /><Text style={st.infoText}>{flightNo}</Text></View> : null}
        </View>

        {/* Extra Services */}
        {hasPrivateExtras && (
          <FlashingExtrasBtn extras={privateExtras} onPress={() => setExtrasModal({ visible: true, extras: privateExtras })} />
        )}

        {/* Quick actions row */}
        <View style={st.quickRow}>
          <TouchableOpacity style={st.quickBtn} onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}>
            <Ionicons name="eye-outline" size={14} color="#64748b" /><Text style={st.quickText}>Detay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.quickBtn, st.navBtn]} onPress={() => openNav(lat, lng, from)}>
            <Ionicons name="navigate" size={14} color="#fff" /><Text style={[st.quickText, { color: '#fff' }]}>Navigasyon</Text>
          </TouchableOpacity>
        </View>

        {/* 3 Buttons */}
        <ThreeButtons bookingId={item.id} status={item.status} acknowledgedAt={ack} paymentMethod={item.metadata?.paymentMethod} total={Number(item.total || 0)} currency={item.currency} />
      </View>
    );
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <View style={st.header}>
        <Ionicons name="briefcase" size={22} color={Brand.primary} />
        <Text style={st.title}>Operasyon Listesi</Text>
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
  list: { paddingHorizontal: 16, paddingBottom: 20 },

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
});
