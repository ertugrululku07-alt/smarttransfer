import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
  Linking, Platform, Alert, Modal, TextInput, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Brand, StatusColors } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

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

  const submitNoShow = async () => {
    if (!noShowReason) { Alert.alert('Uyarı', 'Lütfen bir sebep seçin.'); return; }
    if (!noShowModal.bookingId) return;
    try {
      const res = await fetch(`${API_URL}/driver/bookings/${noShowModal.bookingId}/no-show`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: noShowReason, description: noShowDesc })
      });
      const json = await res.json();
      if (json.success) {
        Alert.alert('No-Show', 'Müşteri gelmedi olarak bildirildi.');
        setNoShowModal({ visible: false, bookingId: null });
        setNoShowReason(''); setNoShowDesc('');
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
  const ThreeButtons = ({ bookingId, status, acknowledgedAt }: { bookingId: string; status: string; acknowledgedAt?: string }) => {
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
            onPress={() => updateStatus(bookingId, 'IN_PROGRESS')}
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
        {/* No-Show */}
        <TouchableOpacity
          style={[st.triBtn, st.triBtnRed]}
          onPress={() => { setNoShowModal({ visible: true, bookingId }); setNoShowReason(''); setNoShowDesc(''); }}
        >
          <Ionicons name="person-remove" size={14} color="#fff" />
          <Text style={st.triBtnText}>No-Show</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── CUSTOMER ROW ───
  const CustomerRow = ({ c, onCall }: { c: any; onCall?: () => void }) => {
    const name = (c.customerFirstName || c.contactName || 'Misafir') + ' ' + (c.customerLastName || '');
    const phone = c.customerPhone || c.contactPhone;
    const pax = (c.adults || 0) + (c.children || 0);
    return (
      <View style={st.customerRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.customerName}>{name.trim()}</Text>
          <View style={st.customerMeta}>
            {phone ? <Text style={st.customerPhone}>{phone}</Text> : null}
            {c.customerEmail ? <Text style={st.customerEmail}>{c.customerEmail}</Text> : null}
            <Text style={st.paxBadge}>{pax} Pax</Text>
            {c.flightNumber ? <Text style={st.flightBadge}>{c.flightNumber}</Text> : null}
          </View>
          {c.notes ? <Text style={st.noteText}>{c.notes}</Text> : null}
        </View>
        {phone ? (
          <TouchableOpacity style={st.callChip} onPress={onCall}>
            <Ionicons name="call" size={14} color={Brand.primary} />
          </TouchableOpacity>
        ) : null}
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
              <View style={st.timeBadge}><Ionicons name="time-outline" size={12} color="#fff" /><Text style={st.timeText}>{time}</Text></View>
              <Text style={st.paxInfo}>{item.bookings.length} Müşteri • {totalPax} Pax</Text>
            </View>
            <View style={[st.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[st.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
            </View>
          </View>

          <View style={st.route}>
            <View style={st.routeRow}><View style={st.dotGreen} /><Text style={st.routeText} numberOfLines={1}>{item.pickup}</Text></View>
            <View style={st.routeLine} />
            <View style={st.routeRow}><View style={st.dotRed} /><Text style={st.routeText} numberOfLines={1}>{item.dropoff}</Text></View>
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
                  <ThreeButtons bookingId={b.id} status={b.status} acknowledgedAt={b.acknowledgedAt} />
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
    const from = item.metadata?.pickup || item.product?.transferData?.pickupZones?.[0]?.name || item.contactName || 'Belirtilmemiş';
    const to = item.metadata?.dropoff || item.product?.transferData?.dropoffZones?.[0]?.name || 'Belirtilmemiş';
    const lat = item.metadata?.pickupLat || 0;
    const lng = item.metadata?.pickupLng || 0;
    const customerName = item.customer?.firstName ? `${item.customer.firstName} ${item.customer.lastName || ''}`.trim() : item.contactName || 'Misafir';
    const phone = item.customer?.phone || item.contactPhone;
    const email = item.customer?.email || item.contactEmail;
    const pax = (item.adults || 0) + (item.children || 0);
    const flightNo = item.flightNumber || item.metadata?.flightNumber;
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
        <ThreeButtons bookingId={item.id} status={item.status} acknowledgedAt={ack} />
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
            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalCancel} onPress={() => setNoShowModal({ visible: false, bookingId: null })}>
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.modalSubmit} onPress={submitNoShow}>
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={st.modalSubmitText}>Bildir</Text>
              </TouchableOpacity>
            </View>
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
  triBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Expand
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4 },
  expandText: { fontSize: 12, fontWeight: '600', color: Brand.primary },

  // Customer list (shuttle)
  customerList: { marginTop: 8 },
  customerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  customerName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  customerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  customerPhone: { fontSize: 11, color: Brand.primary },
  customerEmail: { fontSize: 11, color: '#64748b' },
  paxBadge: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  flightBadge: { fontSize: 11, color: '#d97706', fontWeight: '600' },
  noteText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 },
  callChip: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 4 },

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
});
