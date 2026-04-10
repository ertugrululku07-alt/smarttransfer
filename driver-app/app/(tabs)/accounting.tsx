import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
  Alert, Modal, ScrollView, ActivityIndicator, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

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
        Alert.alert('Başarılı', 'Tahsilat muhasebeye teslim edildi');
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
    return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currency}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING': return { bg: '#fef3c7', color: '#92400e', label: 'Bekliyor' };
      case 'HANDED_OVER': return { bg: '#dbeafe', color: '#1e40af', label: 'Teslim Edildi' };
      case 'CONFIRMED': return { bg: '#dcfce7', color: '#166534', label: 'Onaylandı' };
      default: return { bg: '#f3f4f6', color: '#6b7280', label: status };
    }
  };

  const renderCollection = ({ item }: { item: Collection }) => {
    const status = getStatusStyle(item.status);
    return (
      <View style={st.collectionCard}>
        <View style={st.collectionHeader}>
          <View style={st.amountBox}>
            <Text style={st.amountText}>{formatCurrency(item.amount, item.currency)}</Text>
          </View>
          <View style={[st.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[st.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        
        <View style={st.collectionDetails}>
          {item.customerName && (
            <View style={st.detailRow}>
              <Ionicons name="person" size={14} color="#64748b" />
              <Text style={st.detailText}>{item.customerName}</Text>
            </View>
          )}
          {item.bookingNumber && (
            <View style={st.detailRow}>
              <Ionicons name="document-text" size={14} color="#64748b" />
              <Text style={st.detailText}>#{item.bookingNumber}</Text>
            </View>
          )}
          <View style={st.detailRow}>
            <Ionicons name="time" size={14} color="#64748b" />
            <Text style={st.detailText}>{formatDate(item.createdAt)}</Text>
          </View>
          {item.handedOverToUser && (
            <View style={st.detailRow}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              <Text style={[st.detailText, { color: '#059669' }]}>
                Teslim: {item.handedOverToUser.fullName}
              </Text>
            </View>
          )}
        </View>

        {item.status === 'PENDING' && (
          <TouchableOpacity style={st.handoverBtn} onPress={() => openHandoverModal(item)}>
            <Ionicons name="arrow-redo" size={16} color="#fff" />
            <Text style={st.handoverBtnText}>Muhasebeye Teslim Et</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <Ionicons name="cash" size={22} color={Brand.primary} />
        <Text style={st.title}>Tahsilatlarım</Text>
      </View>

      {/* Filter Tabs */}
      <View style={st.tabs}>
        {[
          { key: 'ALL', label: 'Tümü' },
          { key: 'PENDING', label: 'Bekleyen' },
          { key: 'HANDED_OVER', label: 'Teslim' }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[st.tab, filter === tab.key && st.activeTab]}
            onPress={() => setFilter(tab.key as any)}
          >
            <Text style={[st.tabText, filter === tab.key && st.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Totals Summary */}
      {Object.keys(totals).length > 0 && (
        <View style={st.totalsCard}>
          <Text style={st.totalsTitle}>Bekleyen Tahsilatlar</Text>
          <View style={st.totalsRow}>
            {Object.entries(totals).map(([currency, amount]) => (
              <View key={currency} style={st.totalItem}>
                <Text style={st.totalAmount}>{formatCurrency(amount, currency)}</Text>
                <Text style={st.totalCurrency}>{currency}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Collections List */}
      <FlatList
        data={collections}
        renderItem={renderCollection}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCollections} />}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="cash-outline" size={48} color={Brand.textLight} />
            <Text style={st.emptyText}>Tahsilat bulunamadı.</Text>
            <Text style={st.emptySub}>Ödeme aldıkça burada görünecek.</Text>
          </View>
        }
      />

      {/* Handover Modal */}
      <Modal visible={handoverModal} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Muhasebeye Teslim</Text>
              <TouchableOpacity onPress={() => setHandoverModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedCollection && (
              <View style={st.selectedInfo}>
                <Text style={st.selectedAmount}>
                  {formatCurrency(selectedCollection.amount, selectedCollection.currency)}
                </Text>
                <Text style={st.selectedCustomer}>
                  {selectedCollection.customerName || 'İsimsiz Müşteri'}
                </Text>
              </View>
            )}

            <Text style={st.modalLabel}>Teslim Alacak Personel</Text>
            <ScrollView style={st.personnelList}>
              {personnel.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[st.personnelItem, selectedPerson === p.id && st.personnelActive]}
                  onPress={() => setSelectedPerson(p.id)}
                >
                  <Ionicons
                    name={selectedPerson === p.id ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selectedPerson === p.id ? Brand.primary : '#94a3b8'}
                  />
                  <View style={st.personnelInfo}>
                    <Text style={[st.personnelName, selectedPerson === p.id && st.personnelNameActive]}>
                      {p.fullName}
                    </Text>
                    <Text style={st.personnelEmail}>{p.email}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={st.modalLabel}>Not (opsiyonel)</Text>
            <TextInput
              style={st.modalInput}
              placeholder="Teslimat notu..."
              placeholderTextColor="#94a3b8"
              value={handoverNotes}
              onChangeText={setHandoverNotes}
              multiline
              numberOfLines={2}
            />

            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalCancel} onPress={() => setHandoverModal(false)}>
                <Text style={st.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalSubmit, handoverLoading && { opacity: 0.6 }]}
                onPress={submitHandover}
                disabled={handoverLoading || !selectedPerson}
              >
                {handoverLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={st.modalSubmitText}>Teslim Et</Text>
                  </>
                )}
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
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e2e8f0' },
  activeTab: { backgroundColor: Brand.primary },
  tabText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  activeTabText: { color: '#fff' },

  totalsCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12,
    padding: 16, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
  },
  totalsTitle: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  totalsRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  totalItem: { alignItems: 'center' },
  totalAmount: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  totalCurrency: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 20 },

  collectionCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
  },
  collectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  amountBox: { backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  amountText: { fontSize: 16, fontWeight: '800', color: '#059669' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },

  collectionDetails: { gap: 6, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: '#475569' },

  handoverBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Brand.primary, paddingVertical: 10, borderRadius: 12
  },
  handoverBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  empty: { padding: 60, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { color: '#94a3b8', fontSize: 13, marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36, maxHeight: '85%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  selectedInfo: {
    backgroundColor: '#f0fdf4', padding: 14, borderRadius: 12,
    marginBottom: 16, alignItems: 'center'
  },
  selectedAmount: { fontSize: 24, fontWeight: '800', color: '#059669' },
  selectedCustomer: { fontSize: 14, color: '#64748b', marginTop: 4 },

  modalLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8, marginTop: 8 },
  personnelList: { maxHeight: 200, marginBottom: 12 },
  personnelItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9'
  },
  personnelActive: { backgroundColor: '#eff6ff', borderRadius: 10 },
  personnelInfo: { flex: 1 },
  personnelName: { fontSize: 14, fontWeight: '600', color: '#334155' },
  personnelNameActive: { color: Brand.primary },
  personnelEmail: { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  modalInput: {
    backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 12, fontSize: 14, color: '#0f172a', minHeight: 60, textAlignVertical: 'top'
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  modalCancelText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  modalSubmit: {
    flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: 12,
    backgroundColor: Brand.primary, alignItems: 'center', justifyContent: 'center', gap: 6
  },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
