import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
  Alert, Modal, ScrollView, ActivityIndicator, TextInput, Dimensions,
  Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Collection {
  id: string;
  amount: number;
  currency: string;
  customerName?: string;
  bookingNumber?: string;
  status: 'PENDING' | 'HANDED_OVER' | 'CONFIRMED';
  createdAt: string;
  handedOverAt?: string;
  handedOverToUser?: { fullName: string };
}

interface Personnel {
  id: string;
  fullName: string;
  email: string;
}

export default function AccountingScreen() {
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'HANDED_OVER'>('ALL');
  
  // Handover modal
  const [handoverModal, setHandoverModal] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverLoading, setHandoverLoading] = useState(false);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_URL}/driver/collections${filter !== 'ALL' ? `?status=${filter}` : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setCollections(json.data.collections);
        setTotals(json.data.totals);
      }
    } catch (e) {
      console.error('Fetch collections error:', e);
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // Listen for confirmation from accounting
  useEffect(() => {
    if (!socket) return;
    const handleConfirmed = (data: { collectionId: string; confirmedAt: string }) => {
      Alert.alert(
        '✅ Teslimat Onaylandı',
        'Muhasebe tahsilatınızı onayladı.'
      );
      fetchCollections();
    };
    socket.on('collection_confirmed', handleConfirmed);
    return () => { socket.off('collection_confirmed', handleConfirmed); };
  }, [socket, fetchCollections]);

  const fetchPersonnel = async () => {
    try {
      const res = await fetch(`${API_URL}/driver/collections/accounting-personnel`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setPersonnel(json.data);
      }
    } catch (e) {
      console.error('Fetch personnel error:', e);
    }
  };

  const openHandoverModal = (collection: Collection) => {
    setSelectedCollection(collection);
    setSelectedPerson(null);
    setHandoverNotes('');
    setHandoverModal(true);
    fetchPersonnel();
  };

  const submitHandover = async () => {
    if (!selectedCollection || !selectedPerson) {
      Alert.alert('Uyarı', 'Lütfen teslim alacak personel seçin');
      return;
    }
    setHandoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/driver/collections/${selectedCollection.id}/handover`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          handedOverTo: selectedPerson,
          handoverNotes: handoverNotes || undefined
        })
      });
      const json = await res.json();
      if (json.success) {
        Alert.alert('✅ Başarılı', 'Tahsilat muhasebeye teslim edildi');
        setHandoverModal(false);
        fetchCollections();
      } else {
        Alert.alert('Hata', json.error || 'Teslimat başarısız');
      }
    } catch (e) {
      Alert.alert('Hata', 'Bağlantı hatası');
    } finally {
      setHandoverLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$', GBP: '£' };
    const sym = symbols[currency] || currency;
    return `${sym}${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PENDING': return { 
        bg: '#FFF7ED', border: '#FDBA74', color: '#C2410C', label: 'Bekliyor',
        icon: 'time-outline' as const, gradient: ['#FB923C', '#F97316'] as const
      };
      case 'HANDED_OVER': return { 
        bg: '#EFF6FF', border: '#93C5FD', color: '#1D4ED8', label: 'Teslim Edildi',
        icon: 'arrow-redo-outline' as const, gradient: ['#60A5FA', '#3B82F6'] as const
      };
      case 'CONFIRMED': return { 
        bg: '#F0FDF4', border: '#86EFAC', color: '#15803D', label: 'Onaylandı',
        icon: 'checkmark-circle-outline' as const, gradient: ['#4ADE80', '#22C55E'] as const
      };
      default: return { 
        bg: '#F9FAFB', border: '#D1D5DB', color: '#6B7280', label: status,
        icon: 'help-outline' as const, gradient: ['#9CA3AF', '#6B7280'] as const
      };
    }
  };

  // Stats
  const pendingCount = collections.filter(c => c.status === 'PENDING').length;
  const handedOverCount = collections.filter(c => c.status === 'HANDED_OVER').length;
  const confirmedCount = collections.filter(c => c.status === 'CONFIRMED').length;

  const renderCollection = ({ item, index }: { item: Collection; index: number }) => {
    const config = getStatusConfig(item.status);
    return (
      <View style={[st.card, { borderLeftColor: config.border, borderLeftWidth: 4 }]}>
        {/* Card Header */}
        <View style={st.cardHeader}>
          <View style={st.cardAmountSection}>
            <Text style={st.cardAmount}>{formatCurrency(item.amount, item.currency)}</Text>
            <Text style={st.cardCurrency}>{item.currency}</Text>
          </View>
          <View style={[st.statusChip, { backgroundColor: config.bg, borderColor: config.border }]}>
            <Ionicons name={config.icon} size={12} color={config.color} />
            <Text style={[st.statusChipText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        {/* Card Details */}
        <View style={st.cardBody}>
          {item.customerName && (
            <View style={st.cardRow}>
              <View style={st.cardIconCircle}>
                <Ionicons name="person" size={12} color="#8B5CF6" />
              </View>
              <Text style={st.cardRowText}>{item.customerName}</Text>
            </View>
          )}
          {item.bookingNumber && (
            <View style={st.cardRow}>
              <View style={st.cardIconCircle}>
                <Ionicons name="receipt" size={12} color="#0EA5E9" />
              </View>
              <Text style={[st.cardRowText, { fontFamily: 'monospace' }]}>#{item.bookingNumber}</Text>
            </View>
          )}
          <View style={st.cardRow}>
            <View style={st.cardIconCircle}>
              <Ionicons name="calendar" size={12} color="#64748B" />
            </View>
            <Text style={st.cardRowText}>{formatDate(item.createdAt)}</Text>
          </View>
          {item.handedOverToUser && (
            <View style={st.cardRow}>
              <View style={[st.cardIconCircle, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="checkmark-done" size={12} color="#16A34A" />
              </View>
              <Text style={[st.cardRowText, { color: '#16A34A', fontWeight: '600' }]}>
                → {item.handedOverToUser.fullName}
              </Text>
            </View>
          )}
        </View>

        {/* Handover Button */}
        {item.status === 'PENDING' && (
          <TouchableOpacity
            style={st.handoverBtn}
            onPress={() => openHandoverModal(item)}
            activeOpacity={0.8}
          >
            <View style={[st.handoverGradient, { backgroundColor: '#4F46E5' }]}>
              <Ionicons name="arrow-redo" size={16} color="#fff" />
              <Text style={st.handoverBtnText}>Muhasebeye Teslim Et</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={st.root}>
      {/* ── SOLID HEADER (Fallback for gradient) ── */}
      <View style={[st.header, { backgroundColor: '#1E293B' }]}>
        <SafeAreaView edges={['top']} style={{ paddingBottom: 0 }}>
          {/* Decorative elements */}
          <View style={st.headerDecor1} />
          <View style={st.headerDecor2} />
          
          <View style={st.headerContent}>
            <View style={st.headerTitleRow}>
              <View style={st.headerIconBox}>
                <Ionicons name="wallet" size={20} color="#fff" />
              </View>
              <View>
                <Text style={st.headerTitle}>Tahsilatlarım</Text>
                <Text style={st.headerSubtitle}>{collections.length} kayıt</Text>
              </View>
            </View>
          </View>

          {/* ── SUMMARY CARDS ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.summaryScroll}
          >
            <View style={[st.summaryCard, st.summaryPending]}>
              <View style={st.summaryIconBox}>
                <Ionicons name="time" size={18} color="#F59E0B" />
              </View>
              <Text style={st.summaryValue}>{pendingCount}</Text>
              <Text style={st.summaryLabel}>Bekleyen</Text>
              {Object.entries(totals).map(([cur, amt]) => (
                <Text key={cur} style={st.summaryAmount}>{formatCurrency(amt, cur)}</Text>
              ))}
            </View>
            <View style={[st.summaryCard, st.summaryHandedOver]}>
              <View style={st.summaryIconBox}>
                <Ionicons name="arrow-redo" size={18} color="#3B82F6" />
              </View>
              <Text style={st.summaryValue}>{handedOverCount}</Text>
              <Text style={st.summaryLabel}>Teslim Edildi</Text>
            </View>
            <View style={[st.summaryCard, st.summaryConfirmed]}>
              <View style={st.summaryIconBox}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </View>
              <Text style={st.summaryValue}>{confirmedCount}</Text>
              <Text style={st.summaryLabel}>Onaylanan</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* ── FILTER TABS ── */}
      <View style={st.tabBar}>
        {[
          { key: 'ALL', label: 'Tümü', icon: 'apps' as const },
          { key: 'PENDING', label: 'Bekleyen', icon: 'time' as const },
          { key: 'HANDED_OVER', label: 'Teslim', icon: 'checkmark-done' as const },
        ].map((tab) => {
          const active = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[st.tab, active && st.tabActive]}
              onPress={() => setFilter(tab.key as any)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={active ? '#4F46E5' : '#94A3B8'}
              />
              <Text style={[st.tabText, active && st.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── COLLECTIONS LIST ── */}
      <FlatList
        data={collections}
        renderItem={renderCollection}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCollections} tintColor="#4F46E5" />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={st.emptyState}>
            <View style={st.emptyIconBox}>
              <Ionicons name="wallet-outline" size={36} color="#CBD5E1" />
            </View>
            <Text style={st.emptyTitle}>Henüz tahsilat yok</Text>
            <Text style={st.emptySub}>Ödeme aldıkça burada görünecek.</Text>
          </View>
        }
      />

      {/* ── HANDOVER MODAL ── */}
      <Modal visible={handoverModal} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            {/* Modal Handle */}
            <View style={st.modalHandle} />
            
            {/* Modal Header */}
            <View style={st.modalHeader}>
              <View style={st.modalHeaderLeft}>
                <View style={st.modalIconBox}>
                  <Ionicons name="swap-horizontal" size={18} color="#4F46E5" />
                </View>
                <Text style={st.modalTitle}>Muhasebeye Teslim</Text>
              </View>
              <TouchableOpacity
                style={st.modalCloseBtn}
                onPress={() => setHandoverModal(false)}
              >
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Selected Amount */}
            {selectedCollection && (
              <View style={[st.modalAmountCard, { backgroundColor: '#EEF2FF' }]}>
                <Text style={st.modalAmountLabel}>Teslim Edilecek Tutar</Text>
                <Text style={st.modalAmount}>
                  {formatCurrency(selectedCollection.amount, selectedCollection.currency)}
                </Text>
                <Text style={st.modalCustomer}>
                  {selectedCollection.customerName || 'İsimsiz Müşteri'}
                </Text>
              </View>
            )}

            {/* Personnel Selection */}
            <Text style={st.modalSectionLabel}>
              <Ionicons name="people" size={13} color="#64748B" /> Teslim Alacak Personel
            </Text>
            <ScrollView style={st.personnelList} showsVerticalScrollIndicator={false}>
              {personnel.length === 0 ? (
                <View style={st.personnelEmpty}>
                  <ActivityIndicator color="#4F46E5" />
                  <Text style={st.personnelEmptyText}>Personel yükleniyor...</Text>
                </View>
              ) : (
                personnel.map((p) => {
                  const isActive = selectedPerson === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[st.personnelItem, isActive && st.personnelItemActive]}
                      onPress={() => setSelectedPerson(p.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[st.personnelAvatar, isActive && st.personnelAvatarActive]}>
                        <Text style={[st.personnelAvatarText, isActive && { color: '#fff' }]}>
                          {p.fullName.charAt(0)}
                        </Text>
                      </View>
                      <View style={st.personnelInfo}>
                        <Text style={[st.personnelName, isActive && st.personnelNameActive]}>
                          {p.fullName}
                        </Text>
                        <Text style={st.personnelEmail}>{p.email}</Text>
                      </View>
                      <Ionicons
                        name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isActive ? '#4F46E5' : '#D1D5DB'}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Notes */}
            <Text style={st.modalSectionLabel}>
              <Ionicons name="chatbox-ellipses" size={13} color="#64748B" /> Not (opsiyonel)
            </Text>
            <TextInput
              style={st.modalInput}
              placeholder="Teslimat notu ekleyin..."
              placeholderTextColor="#94A3B8"
              value={handoverNotes}
              onChangeText={setHandoverNotes}
              multiline
              numberOfLines={2}
            />

            {/* Action Buttons */}
            <View style={st.modalBtnRow}>
              <TouchableOpacity
                style={st.modalCancelBtn}
                onPress={() => setHandoverModal(false)}
              >
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalSubmitBtn, (!selectedPerson || handoverLoading) && st.modalSubmitDisabled]}
                onPress={submitHandover}
                disabled={handoverLoading || !selectedPerson}
                activeOpacity={0.8}
              >
                <View style={[st.modalSubmitGradient, { backgroundColor: (!selectedPerson || handoverLoading) ? '#94A3B8' : '#4F46E5' }]}>
                  {handoverLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={st.modalSubmitText}>Teslim Et</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  // ── HEADER ──
  header: {
    paddingBottom: 0,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(79, 70, 229, 0.08)', top: -60, right: -40,
  },
  headerDecor2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(99, 102, 241, 0.06)', bottom: 40, left: -30,
  },
  headerContent: { paddingHorizontal: 20, paddingTop: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  headerSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500', marginTop: 2 },

  // ── SUMMARY CARDS ──
  summaryScroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 10 },
  summaryCard: {
    width: 130, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 14, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  summaryPending: { borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  summaryHandedOver: { borderLeftWidth: 3, borderLeftColor: '#3B82F6' },
  summaryConfirmed: { borderLeftWidth: 3, borderLeftColor: '#22C55E' },
  summaryIconBox: { marginBottom: 8 },
  summaryValue: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  summaryLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  summaryAmount: { color: '#C7D2FE', fontSize: 12, fontWeight: '700', marginTop: 6 },

  // ── TABS ──
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  tabActive: {
    backgroundColor: '#EEF2FF', borderColor: '#C7D2FE',
  },
  tabText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#4F46E5' },

  // ── LIST ──
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30 },

  // ── CARD ──
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  cardAmountSection: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  cardAmount: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  cardCurrency: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  cardBody: { gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconCircle: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center',
  },
  cardRowText: { fontSize: 13, color: '#475569', fontWeight: '500' },

  handoverBtn: { marginTop: 14 },
  handoverGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
  },
  handoverBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },

  // ── EMPTY ──
  emptyState: { padding: 60, alignItems: 'center' },
  emptyIconBox: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: '#475569', fontSize: 16, fontWeight: '700' },
  emptySub: { color: '#94A3B8', fontSize: 13, marginTop: 4 },

  // ── MODAL ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40, maxHeight: '90%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center',
  },

  modalAmountCard: {
    padding: 20, borderRadius: 16, marginBottom: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  modalAmountLabel: { fontSize: 11, fontWeight: '600', color: '#6366F1', letterSpacing: 0.5, textTransform: 'uppercase' },
  modalAmount: { fontSize: 32, fontWeight: '900', color: '#4F46E5', marginTop: 4, letterSpacing: -1 },
  modalCustomer: { fontSize: 13, color: '#64748B', marginTop: 4 },

  modalSectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 10,
    letterSpacing: 0.3,
  },
  personnelList: { maxHeight: 180, marginBottom: 16 },
  personnelEmpty: {
    padding: 20, alignItems: 'center', gap: 8,
  },
  personnelEmptyText: { color: '#94A3B8', fontSize: 12 },
  personnelItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
    marginBottom: 6, borderWidth: 1.5, borderColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  personnelItemActive: {
    borderColor: '#C7D2FE', backgroundColor: '#EEF2FF',
  },
  personnelAvatar: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center',
  },
  personnelAvatarActive: {
    backgroundColor: '#4F46E5',
  },
  personnelAvatarText: { fontSize: 15, fontWeight: '800', color: '#64748B' },
  personnelInfo: { flex: 1 },
  personnelName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  personnelNameActive: { color: '#4F46E5' },
  personnelEmail: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  modalInput: {
    backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0',
    padding: 14, fontSize: 14, color: '#0F172A', minHeight: 56, textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 0.4, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center',
  },
  modalCancelText: { color: '#64748B', fontWeight: '700', fontSize: 15 },
  modalSubmitBtn: { flex: 0.6 },
  modalSubmitDisabled: { opacity: 0.6 },
  modalSubmitGradient: {
    flexDirection: 'row', paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  modalSubmitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
