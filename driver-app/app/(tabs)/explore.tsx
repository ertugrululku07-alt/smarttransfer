import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, Linking, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Brand, StatusColors } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

export default function JobListScreen() {
  const { token } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, [filter]);

  // Listen for real-time status updates from backend
  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = (data: { bookingId: string; status: string }) => {
      setJobs((prev: any[]) => prev.map(j =>
        j.id === data.bookingId ? { ...j, status: data.status } : j
      ));
    };
    socket.on('booking_status_update', handleStatusUpdate);
    return () => { socket.off('booking_status_update', handleStatusUpdate); };
  }, [socket]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/driver/bookings?type=${filter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setJobs(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: string) => {
    setUpdatingId(bookingId);
    // Optimistic update: immediately reflect in UI
    setJobs((prev: any[]) => prev.map(j =>
      j.id === bookingId ? { ...j, status } : j
    ));
    try {
      const res = await fetch(`${API_URL}/driver/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) {
        // Refresh from server to get accurate state
        setTimeout(() => fetchJobs(), 500);
      } else {
        // Revert on failure
        fetchJobs();
        Alert.alert('Hata', 'Durum güncellenemedi');
      }
    } catch (e) {
      console.error(e);
      fetchJobs(); // Revert on error
      Alert.alert('Hata', 'Bağlantı hatası');
    } finally {
      setUpdatingId(null);
    }
  };

  const openNavigation = (lat: number, lng: number, address?: string) => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    if (lat && lng && lat !== 41.0082 && lng !== 28.9784 && lat !== 0 && lng !== 0) {
      const latLng = `${lat},${lng}`;
      const label = 'Müşteri';
      const url = Platform.select({
        ios: `${scheme}${label}@${latLng}`,
        android: `${scheme}${latLng}(${label})`
      });
      Linking.openURL(url!);
    } else if (address && address !== 'Belirtilmemiş') {
      const url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(address)}`,
        android: `geo:0,0?q=${encodeURIComponent(address)}`
      });
      Linking.openURL(url!);
    } else {
      Linking.openURL(Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' })!);
    }
  };

  const renderJobItem = ({ item }: { item: any }) => {
    const date = new Date(item.startDate);
    const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dayStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

    const from = item.metadata?.pickup
      || item.product?.transferData?.pickupZones?.[0]?.name
      || item.pickup?.location
      || item.contactName
      || 'Belirtilmemiş';

    const lat = item.metadata?.pickupLat || item.pickup?.lat || item.product?.transferData?.pickupZones?.[0]?.lat || 0;
    const lng = item.metadata?.pickupLng || item.pickup?.lng || item.product?.transferData?.pickupZones?.[0]?.lng || 0;

    const customerName = item.customer?.firstName
      ? `${item.customer.firstName} ${item.customer.lastName || ''}`.trim()
      : item.contactName || 'Misafir';

    const to = item.metadata?.dropoff
      || item.product?.transferData?.dropoffZones?.[0]?.name
      || item.dropoff?.location
      || 'Belirtilmemiş';

    const vehicle = item.metadata?.vehicleType
      || item.product?.name?.tr
      || item.product?.name?.en
      || 'Araç Bilgisi Yok';

    const pax = (item.adults || 0) + (item.children || 0);
    const flightNo = item.flightNumber || item.metadata?.flightNumber || null;

    // Dynamic status colors
    const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: item.status };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.dateTimeBadge}>
            <Text style={styles.dayText}>{dayStr}</Text>
            <View style={styles.timeBadge}>
              <Ionicons name="time-outline" size={12} color="#fff" />
              <Text style={styles.timeText}>{time}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
          </View>
        </View>

        <View style={styles.routeContainer}>
          <View style={styles.routeRow}>
            <View style={styles.circle} />
            <Text style={styles.locationText} numberOfLines={1}>{from}</Text>
          </View>
          <View style={styles.line} />
          <View style={styles.routeRow}>
            <View style={[styles.circle, { backgroundColor: Brand.danger }]} />
            <Text style={styles.locationText} numberOfLines={1}>{to}</Text>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <Ionicons name="people-outline" size={15} color={Brand.textSecondary} />
            <Text style={styles.detailText}>{customerName} ({pax} Pax)</Text>
          </View>
          {flightNo && (
            <View style={styles.detailItem}>
              <Ionicons name="airplane-outline" size={15} color={Brand.textSecondary} />
              <Text style={styles.detailText}>{flightNo}</Text>
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}>
            <Ionicons name="eye-outline" size={14} color={Brand.textSecondary} />
            <Text style={styles.actionText}>Detaylar</Text>
          </TouchableOpacity>

          {item.customer?.phone && (
            <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${item.customer.phone}`)}>
              <Ionicons name="call-outline" size={14} color={Brand.primary} />
              <Text style={[styles.actionText, { color: Brand.primary }]}>Ara</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.actionButton, styles.navButton]} onPress={() => openNavigation(lat, lng, from)}>
            <Ionicons name="navigate-outline" size={14} color="#fff" />
            <Text style={[styles.actionText, { color: '#fff' }]}>Yol Tarifi</Text>
          </TouchableOpacity>
        </View>

        {item.status !== 'IN_PROGRESS' && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' && (
          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={() => updateBookingStatus(item.id, 'IN_PROGRESS')}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.primaryActionText}>Müşteri Alındı</Text>
          </TouchableOpacity>
        )}

        {item.status === 'IN_PROGRESS' && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: Brand.danger }]}
            onPress={() => updateBookingStatus(item.id, 'COMPLETED')}
          >
            <Ionicons name="stop-circle-outline" size={18} color="#fff" />
            <Text style={styles.primaryActionText}>Transferi Bitir</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="briefcase" size={24} color={Brand.primary} />
        <Text style={styles.title}>Operasyon Listesi</Text>
        <TouchableOpacity onPress={fetchJobs} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color={Brand.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {[
          { key: 'all', label: 'Tümü' },
          { key: 'today', label: 'Bugün' },
          { key: 'upcoming', label: 'Gelecek' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, filter === tab.key && styles.activeTab]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.tabText, filter === tab.key && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={jobs}
        renderItem={renderJobItem}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchJobs} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="briefcase-outline" size={48} color={Brand.textLight} />
            <Text style={styles.emptyText}>Transfer bulunamadı.</Text>
            <Text style={styles.emptySubText}>Atanan transferler burada görünecek.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
    gap: 10,
  },
  refreshBtn: { marginLeft: 'auto', padding: 4 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.text,
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
  },
  activeTab: {
    backgroundColor: Brand.primary,
  },
  tabText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 13,
  },
  activeTabText: {
    color: 'white',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  timeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontWeight: '600',
    fontSize: 11,
  },
  routeContainer: {
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  circle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Brand.success,
    marginRight: 10,
  },
  line: {
    width: 2,
    height: 15,
    backgroundColor: Brand.border,
    marginLeft: 4,
    marginBottom: 5,
  },
  locationText: {
    fontSize: 14,
    color: Brand.text,
    fontWeight: '500',
    flex: 1,
  },
  detailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Brand.borderLight,
    paddingTop: 10,
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    color: Brand.textSecondary,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    gap: 5,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    gap: 5,
  },
  navButton: {
    backgroundColor: Brand.primary,
    marginLeft: 'auto',
  },
  actionText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 12,
  },
  primaryActionBtn: {
    backgroundColor: Brand.success,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: Brand.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubText: {
    color: Brand.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
});
