import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Alert, Linking,
  Platform, Dimensions, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Brand } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';
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

  const [geocoding, setGeocoding] = useState(false);

  // Geocode using Nominatim (OpenStreetMap) — free, no API key needed
  const nominatimSearch = async (q: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=tr`,
        { headers: { 'User-Agent': 'SmartTransfer-DriverApp/1.0' } }
      );
      const json = await res.json();
      if (json.length > 0) {
        return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
      }
    } catch (e) {
      console.error('Geocode error:', e);
    }
    return null;
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    // Try full address first
    let result = await nominatimSearch(address);
    if (result) return result;

    // Simplify: remove postal codes, trim parts
    const simplified = address
      .replace(/\d{5}/g, '')  // remove 5-digit postal codes
      .replace(/\s+/g, ' ')
      .trim();
    if (simplified !== address) {
      result = await nominatimSearch(simplified);
      if (result) return result;
    }

    // Try just the last 2-3 meaningful parts (e.g. "Alanya, Antalya, Turkey")
    const parts = address.split(',').map(p => p.trim()).filter(p => p && !/^\d{5}$/.test(p));
    if (parts.length > 2) {
      const shortAddr = parts.slice(-3).join(', ');
      result = await nominatimSearch(shortAddr);
      if (result) return result;
    }

    // Last resort: first meaningful part + Turkey
    if (parts.length > 0) {
      result = await nominatimSearch(`${parts[0]}, Turkey`);
    }
    return result;
  };

  useEffect(() => {
    const init = async () => {
      try {
        const data = JSON.parse(params.bookings as string);
        setRouteName(params.routeName as string || 'Shuttle');

        // Geocode bookings that don't have coordinates
        setGeocoding(true);
        const enriched: any[] = [];
        const geoCache: Record<string, { lat: number; lng: number }> = {};
        let geocodedCount = 0;
        let failedAddrs: string[] = [];

        for (let i = 0; i < data.length; i++) {
          const b = data[i];
          const lat = b.metadata?.pickupLat || b.pickupLat || 0;
          const lng = b.metadata?.pickupLng || b.pickupLng || 0;
          if (lat && lng && lat !== 0 && lng !== 0) {
            enriched.push({ ...b, _lat: lat, _lng: lng });
            continue;
          }
          // Fallback: geocode the pickup address
          const addr = (b.pickup || b.metadata?.pickup || '').trim();
          if (addr) {
            // Check cache first
            if (geoCache[addr]) {
              // Add small offset to prevent markers stacking
              const offset = enriched.filter(e => e._fromGeocode).length * 0.002;
              enriched.push({ ...b, _lat: geoCache[addr].lat + offset, _lng: geoCache[addr].lng + offset, _fromGeocode: true });
              geocodedCount++;
              continue;
            }
            if (Object.keys(geoCache).length > 0) await new Promise(r => setTimeout(r, 400));
            const geo = await geocodeAddress(addr);
            if (geo) {
              geoCache[addr] = geo;
              enriched.push({ ...b, _lat: geo.lat, _lng: geo.lng, _fromGeocode: true });
              geocodedCount++;
              continue;
            } else {
              failedAddrs.push(addr);
            }
          }
          enriched.push({ ...b, _lat: 0, _lng: 0 });
        }
        setBookings(enriched);
        setGeocoding(false);

        // Debug: show result summary
        const withCoords = enriched.filter(e => e._lat !== 0).length;
        if (withCoords === 0 && enriched.length > 0) {
          Alert.alert(
            'Konum Uyarısı',
            `${enriched.length} müşterinin hiçbirinin koordinatı bulunamadı.\n\nAdresler: ${failedAddrs.join(', ') || 'boş'}`
          );
        }
      } catch (e) {
        console.error('Failed to parse shuttle bookings:', e);
        setGeocoding(false);
      }
    };
    init();
  }, []);

  // Fit map to all markers
  useEffect(() => {
    if (bookings.length === 0 || !mapRef.current) return;
    const coords = bookings
      .filter(b => b._lat !== 0 && b._lng !== 0)
      .map(b => ({ latitude: b._lat, longitude: b._lng }));
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
    return { lat: b._lat || 0, lng: b._lng || 0 };
  };

  const getCustomerName = (b: any) => {
    return b.contactName || ((b.customerFirstName || '') + ' ' + (b.customerLastName || '')).trim() || 'Misafir';
  };

  const isPickedUp = (b: any) => b.status === 'IN_PROGRESS' || b.status === 'PICKUP' || b.status === 'STARTED' || b.status === 'COMPLETED';

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

  // In-app route state
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; targetName: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Get driver's current location
  useEffect(() => {
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setDriverLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        console.warn('Could not get driver location');
      }
    })();
  }, []);

  // Fetch route from OSRM (free, no API key)
  const fetchRoute = async (destLat: number, destLng: number, customerName: string) => {
    if (!driverLocation) {
      Alert.alert('Uyarı', 'Şoför konumu alınamadı. Konum izni açık mı?');
      return;
    }
    setRouteLoading(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${driverLocation.lng},${driverLocation.lat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.code === 'Ok' && json.routes[0]) {
        const route = json.routes[0];
        const coords = route.geometry.coordinates.map((c: number[]) => ({
          latitude: c[1],
          longitude: c[0],
        }));
        setRouteCoords(coords);
        const distKm = (route.distance / 1000).toFixed(1);
        const durMin = Math.round(route.duration / 60);
        setRouteInfo({ distance: `${distKm} km`, duration: `${durMin} dk`, targetName: customerName });

        // Fit map to show entire route
        const allPoints = [
          { latitude: driverLocation.lat, longitude: driverLocation.lng },
          { latitude: destLat, longitude: destLng },
        ];
        mapRef.current?.fitToCoordinates(allPoints, {
          edgePadding: { top: 100, right: 60, bottom: 220, left: 60 },
          animated: true,
        });
      } else {
        Alert.alert('Hata', 'Rota bulunamadı');
      }
    } catch {
      Alert.alert('Hata', 'Rota hesaplanamadı');
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setRouteCoords([]);
    setRouteInfo(null);
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

      {/* Geocoding loading */}
      {geocoding && (
        <View style={{ position: 'absolute', top: 80, left: 0, right: 0, zIndex: 10, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 }}>
            <ActivityIndicator size="small" color={Brand.primary} />
            <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '600' }}>Konumlar yükleniyor...</Text>
          </View>
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={st.map}
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
                        onPress={() => fetchRoute(c.lat, c.lng, getCustomerName(b))}
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
        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#4f46e5"
            strokeWidth={5}
            lineDashPattern={[0]}
          />
        )}
      </MapView>

      {/* Route info bar */}
      {routeInfo && (
        <View style={st.routeBar}>
          <View style={{ flex: 1 }}>
            <Text style={st.routeTarget} numberOfLines={1}>{routeInfo.targetName}</Text>
            <Text style={st.routeDetails}>{routeInfo.distance} · {routeInfo.duration}</Text>
          </View>
          <TouchableOpacity style={st.routeClearBtn} onPress={clearRoute}>
            <Ionicons name="close-circle" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Loading overlay for route */}
      {routeLoading && (
        <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -30, marginTop: -30, zIndex: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 }}>
            <ActivityIndicator size="large" color={Brand.primary} />
          </View>
        </View>
      )}

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
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {hasCoords && (
                      <TouchableOpacity
                        style={[st.chipPickupBtn, { backgroundColor: '#3b82f6' }]}
                        onPress={() => {
                          const c = getCoords(b);
                          fetchRoute(c.lat, c.lng, getCustomerName(b));
                        }}
                      >
                        <Ionicons name="navigate" size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
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
                  </View>
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
  // Route bar
  routeBar: {
    position: 'absolute', top: 80, left: 12, right: 12, zIndex: 15,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  routeTarget: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  routeDetails: { fontSize: 13, fontWeight: '600', color: '#4f46e5', marginTop: 2 },
  routeClearBtn: { padding: 4 },
});
