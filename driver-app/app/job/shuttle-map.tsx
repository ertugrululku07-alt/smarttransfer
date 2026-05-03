import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Alert, Linking,
  Platform, Dimensions, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Brand } from '../../constants/theme';

const API_URL = 'http://187.127.76.249/api';
const { width, height } = Dimensions.get('window');

export default function ShuttleMapScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const mapRef = useRef<MapView>(null);

  // Parse bookings from params
  const [bookings, setBookings] = useState<any[]>([]);
  const [routeName, setRouteName] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);

  useEffect(() => {
    try {
      const data = JSON.parse(params.bookings as string);
      setBookings(data);
      setRouteName(params.routeName as string || 'Shuttle');
    } catch (e) {
      console.error('Failed to parse shuttle bookings:', e);
    }
  }, []);

  // Fit map to all markers
  useEffect(() => {
    if (bookings.length === 0 || !mapRef.current) return;
    const coords = bookings
      .filter(b => getCoords(b).lat !== 0)
      .map(b => {
        const c = getCoords(b);
        return { latitude: c.lat, longitude: c.lng };
      });
    if (coords.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
          animated: true,
        });
      }, 500);
    }
  }, [bookings]);

  const getCoords = (b: any) => {
    const lat = b.metadata?.pickupLat || 0;
    const lng = b.metadata?.pickupLng || 0;
    return { lat, lng };
  };

  const getCustomerName = (b: any) => {
    return b.contactName || ((b.customerFirstName || '') + ' ' + (b.customerLastName || '')).trim() || 'Misafir';
  };

  const isPickedUp = (b: any) => b.status === 'IN_PROGRESS' || b.status === 'COMPLETED';

  const handlePickup = async (bookingId: string) => {
    setUpdating(bookingId);
    try {
      const res = await fetch(`${API_URL}/driver/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' })
      });
      const json = await res.json();
      if (json.success) {
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'IN_PROGRESS' } : b));
        setSelectedMarker(null);
      } else {
        Alert.alert('Hata', json.error || 'Durum güncellenemedi');
      }
    } catch {
      Alert.alert('Hata', 'Bağlantı hatası');
    } finally {
      setUpdating(null);
    }
  };

  const openExternalNav = (lat: number, lng: number, address?: string) => {
    if (lat && lng && lat !== 0 && lng !== 0) {
      const url = Platform.select({
        ios: `maps:0,0?q=Müşteri@${lat},${lng}`,
        android: `geo:0,0?q=${lat},${lng}(Müşteri)`
      });
      Linking.openURL(url!);
    } else if (address) {
      Linking.openURL(Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(address)}`,
        android: `geo:0,0?q=${encodeURIComponent(address)}`
      })!);
    }
  };

  // Default region: Antalya
  const defaultRegion = {
    latitude: 36.8969,
    longitude: 30.7133,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  const validBookings = bookings.filter(b => getCoords(b).lat !== 0);
  const invalidBookings = bookings.filter(b => getCoords(b).lat === 0);
  const pickedCount = bookings.filter(b => isPickedUp(b)).length;

  // Pin color based on status
  const getPinColor = (b: any) => {
    if (isPickedUp(b)) return '#22c55e'; // green — picked up
    if (b.id === selectedMarker) return '#f59e0b'; // amber — selected
    return '#ef4444'; // red — waiting
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{routeName}</Text>
          <Text style={st.headerSub}>{pickedCount}/{bookings.length} müşteri alındı</Text>
        </View>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={st.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {validBookings.map((b, i) => {
          const c = getCoords(b);
          const picked = isPickedUp(b);
          return (
            <Marker
              key={b.id}
              coordinate={{ latitude: c.lat, longitude: c.lng }}
              pinColor={getPinColor(b)}
              onPress={() => setSelectedMarker(b.id)}
            >
              <Callout tooltip>
                <View style={st.callout}>
                  <Text style={st.calloutName}>{getCustomerName(b)}</Text>
                  {b.pickupTime && <Text style={st.calloutTime}>{b.pickupTime}</Text>}
                  <Text style={st.calloutAddr} numberOfLines={2}>{b.pickup || 'Adres yok'}</Text>
                  <Text style={st.calloutPax}>
                    {(b.adults || 0) + (b.children || 0) + (b.infants || 0)} Pax
                    {b.flightNumber ? ` · ${b.flightNumber}` : ''}
                  </Text>
                  {picked ? (
                    <View style={[st.calloutBtn, { backgroundColor: '#22c55e' }]}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={st.calloutBtnText}>Alındı ✓</Text>
                    </View>
                  ) : (
                    <View style={st.calloutActions}>
                      <TouchableOpacity
                        style={[st.calloutBtn, { backgroundColor: Brand.primary, flex: 1 }]}
                        onPress={() => handlePickup(b.id)}
                      >
                        {updating === b.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={16} color="#fff" />
                            <Text style={st.calloutBtnText}>Alındı</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.calloutBtn, { backgroundColor: '#3b82f6' }]}
                        onPress={() => openExternalNav(c.lat, c.lng, b.pickup)}
                      >
                        <Ionicons name="navigate" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Bottom customer list overlay */}
      <View style={st.bottomSheet}>
        <View style={st.sheetHandle} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
          {bookings.map((b, i) => {
            const picked = isPickedUp(b);
            const hasCoords = getCoords(b).lat !== 0;
            return (
              <TouchableOpacity
                key={b.id}
                style={[
                  st.chip,
                  picked && st.chipPicked,
                  selectedMarker === b.id && st.chipSelected
                ]}
                onPress={() => {
                  setSelectedMarker(b.id);
                  if (hasCoords) {
                    const c = getCoords(b);
                    mapRef.current?.animateToRegion({
                      latitude: c.lat,
                      longitude: c.lng,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }, 500);
                  }
                }}
              >
                <Text style={[st.chipOrder, picked && { color: '#22c55e' }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.chipName} numberOfLines={1}>{getCustomerName(b)}</Text>
                  {b.pickupTime && <Text style={st.chipTime}>{b.pickupTime}</Text>}
                </View>
                {picked ? (
                  <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                ) : (
                  <TouchableOpacity
                    style={st.chipPickupBtn}
                    onPress={() => handlePickup(b.id)}
                  >
                    {updating === b.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={st.chipPickupText}>Alındı</Text>
                    )}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Brand.primary,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  map: { flex: 1 },
  // Callout
  callout: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    width: 220, shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 8, elevation: 5,
  },
  calloutName: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  calloutTime: { fontSize: 12, fontWeight: '600', color: '#3b82f6', marginBottom: 4 },
  calloutAddr: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  calloutPax: { fontSize: 11, color: '#94a3b8', marginBottom: 8 },
  calloutActions: { flexDirection: 'row', gap: 6 },
  calloutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
  },
  calloutBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Bottom sheet
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 10,
    maxHeight: 160,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1',
    alignSelf: 'center', marginTop: 8, marginBottom: 8,
  },
  chipRow: { paddingHorizontal: 12, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 10,
    paddingHorizontal: 12, width: 220, borderWidth: 1.5, borderColor: 'transparent',
  },
  chipPicked: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  chipSelected: { borderColor: Brand.primary },
  chipOrder: { fontSize: 16, fontWeight: '800', color: Brand.primary, width: 22 },
  chipName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  chipTime: { fontSize: 11, color: '#3b82f6', fontWeight: '600' },
  chipPickupBtn: {
    backgroundColor: Brand.primary, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
  },
  chipPickupText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
