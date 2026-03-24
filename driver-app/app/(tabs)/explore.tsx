import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Replace with your actual IP
const API_URL = 'https://smarttransfer-backend-production.up.railway.app/api';

export default function JobListScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'today' | 'upcoming'

  useEffect(() => {
    fetchJobs();
  }, [filter]);

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
        fetchJobs(); // refresh the list
      }
    } catch (e) {
      console.error(e);
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
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={14} color="#fff" />
            <Text style={styles.timeText}>{time}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.routeContainer}>
          <View style={styles.routeRow}>
            <View style={styles.circle} />
            <Text style={styles.locationText} numberOfLines={1}>{from}</Text>
          </View>
          <View style={styles.line} />
          <View style={styles.routeRow}>
            <View style={[styles.circle, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.locationText} numberOfLines={1}>{to}</Text>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <Ionicons name="people-outline" size={16} color="#6b7280" />
            <Text style={styles.detailText}>{customerName} ({item.adults + item.children} Pax)</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="car-outline" size={16} color="#6b7280" />
            <Text style={styles.detailText}>{vehicle}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}>
            <Text style={styles.actionText}>Detaylar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.navButton]} onPress={() => openNavigation(lat, lng, from)}>
            <Ionicons name="navigate-outline" size={16} color="#fff" />
            <Text style={[styles.actionText, { color: '#fff', marginLeft: 5 }]}>Yol Tarifi</Text>
          </TouchableOpacity>
        </View>

        {item.status !== 'IN_PROGRESS' && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#10b981', marginTop: 10, width: '100%', flexDirection: 'row', justifyContent: 'center' }]}
            onPress={() => updateBookingStatus(item.id, 'IN_PROGRESS')}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={[styles.actionText, { color: '#fff', marginLeft: 8, fontSize: 16 }]}>Müşteri Alındı</Text>
          </TouchableOpacity>
        )}

        {item.status === 'IN_PROGRESS' && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#ef4444', marginTop: 10, width: '100%', flexDirection: 'row', justifyContent: 'center' }]}
            onPress={() => updateBookingStatus(item.id, 'COMPLETED')}
          >
            <Ionicons name="stop-circle-outline" size={18} color="#fff" />
            <Text style={[styles.actionText, { color: '#fff', marginLeft: 8, fontSize: 16 }]}>Transferi Bitir</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Operasyon Listesi</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, filter === 'all' && styles.activeTab]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.activeTabText]}>Tümü</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'today' && styles.activeTab]}
          onPress={() => setFilter('today')}
        >
          <Text style={[styles.tabText, filter === 'today' && styles.activeTabText]}>Bugün</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'upcoming' && styles.activeTab]}
          onPress={() => setFilter('upcoming')}
        >
          <Text style={[styles.tabText, filter === 'upcoming' && styles.activeTabText]}>Gelecek</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={jobs}
        renderItem={renderJobItem}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchJobs} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Transfer bulunamadı.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { width: 40 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  tab: {
    marginRight: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
  },
  activeTab: {
    backgroundColor: '#4361ee',
  },
  tabText: {
    color: '#4b5563',
    fontWeight: '600',
  },
  activeTabText: {
    color: 'white',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4361ee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 4,
  },
  statusBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#10b981',
    fontWeight: '600',
    fontSize: 12,
  },
  routeContainer: {
    marginBottom: 15,
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
    backgroundColor: '#10b981',
    marginRight: 10,
  },
  line: {
    width: 2,
    height: 15,
    backgroundColor: '#e5e7eb',
    marginLeft: 4,
    marginBottom: 5,
  },
  locationText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    flex: 1,
  },
  detailsContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  detailText: {
    marginLeft: 5,
    color: '#6b7280',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginLeft: 10,
  },
  navButton: {
    backgroundColor: '#4361ee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16,
  },
});
