import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Alert, Linking,
  Platform, Dimensions, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
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
  const webRef = useRef<WebView>(null);

  const [bookings, setBookings] = useState<any[]>([]);
  const [routeName, setRouteName] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; targetName: string } | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Geocode using Nominatim (OpenStreetMap)
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
    let result = await nominatimSearch(address);
    if (result) return result;
    const simplified = address
      .replace(/\d{5}/g, '')
      .replace(/\//g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
    if (simplified !== address) {
      result = await nominatimSearch(simplified);
      if (result) return result;
    }
    const parts = simplified.split(',').map(p => p.trim()).filter(p => p && !/^\d{5}$/.test(p));
    if (parts.length > 2) {
      result = await nominatimSearch(parts.slice(-3).join(', '));
      if (result) return result;
    }
    if (parts.length > 0) {
      result = await nominatimSearch(`${parts[0]}, Turkey`);
    }
    return result;
  };

  // Get driver location
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

  // Parse and geocode bookings
  useEffect(() => {
    const init = async () => {
      try {
        const data = JSON.parse(params.bookings as string);
        setRouteName(params.routeName as string || 'Shuttle');
        const dir = (params.direction as string || 'DEP').toUpperCase();
        const useDropoff = dir === 'ARV';

        setGeocoding(true);
        const enriched: any[] = [];
        const geoCache: Record<string, { lat: number; lng: number }> = {};
        let failedAddrs: string[] = [];

        for (let i = 0; i < data.length; i++) {
          const b = data[i];
          const lat = useDropoff
            ? (b.metadata?.dropoffLat || b.dropoffLat || 0)
            : (b.metadata?.pickupLat || b.pickupLat || 0);
          const lng = useDropoff
            ? (b.metadata?.dropoffLng || b.dropoffLng || 0)
            : (b.metadata?.pickupLng || b.pickupLng || 0);
          const displayAddr = useDropoff
            ? (b.dropoff || b.metadata?.dropoff || '').trim()
            : (b.pickup || b.metadata?.pickup || '').trim();

          if (lat && lng && lat !== 0 && lng !== 0) {
            enriched.push({ ...b, _lat: lat, _lng: lng, _displayAddr: displayAddr });
            continue;
          }
          const addr = displayAddr;
          if (addr) {
            if (geoCache[addr]) {
              const offset = enriched.filter(e => e._fromGeocode).length * 0.002;
              enriched.push({ ...b, _lat: geoCache[addr].lat + offset, _lng: geoCache[addr].lng + offset, _fromGeocode: true, _displayAddr: displayAddr });
              continue;
            }
            if (Object.keys(geoCache).length > 0) await new Promise(r => setTimeout(r, 400));
            const geo = await geocodeAddress(addr);
            if (geo) {
              geoCache[addr] = geo;
              enriched.push({ ...b, _lat: geo.lat, _lng: geo.lng, _fromGeocode: true, _displayAddr: displayAddr });
              continue;
            } else {
              failedAddrs.push(addr);
            }
          }
          enriched.push({ ...b, _lat: 0, _lng: 0, _displayAddr: displayAddr });
        }
        setBookings(enriched);
        setGeocoding(false);

        const withCoords = enriched.filter(e => e._lat !== 0).length;
        if (withCoords === 0 && enriched.length > 0) {
          Alert.alert('Konum Uyarısı', `${enriched.length} müşterinin hiçbirinin koordinatı bulunamadı.\n\nAdresler: ${failedAddrs.join(', ') || 'boş'}`);
        }
      } catch (e) {
        console.error('Failed to parse shuttle bookings:', e);
        setGeocoding(false);
      }
    };
    init();
  }, []);

  // Send markers to WebView when bookings or map ready
  useEffect(() => {
    if (!mapReady || bookings.length === 0) return;
    const markers = bookings
      .filter(b => b._lat && b._lng && b._lat !== 0)
      .map((b, i) => ({
        id: b.id,
        lat: b._lat,
        lng: b._lng,
        name: b.contactName || ((b.customerFirstName || '') + ' ' + (b.customerLastName || '')).trim() || 'Misafir',
        addr: b._displayAddr || b.pickup || '',
        time: b.pickupTime || '',
        pax: (b.adults || 0) + (b.children || 0) + (b.infants || 0),
        flight: b.flightNumber || '',
        picked: b.status === 'IN_PROGRESS' || b.status === 'PICKUP' || b.status === 'STARTED' || b.status === 'COMPLETED',
        order: i + 1,
      }));
    webRef.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(markers)}); true;`);
  }, [bookings, mapReady]);

  const getCoords = (b: any) => ({ lat: b._lat || 0, lng: b._lng || 0 });
  const getCustomerName = (b: any) => b.contactName || ((b.customerFirstName || '') + ' ' + (b.customerLastName || '')).trim() || 'Misafir';
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

  // Handle messages from WebView
  const onWebMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        setMapReady(true);
      } else if (msg.type === 'pickup') {
        handlePickup(msg.id);
      } else if (msg.type === 'navigate') {
        if (!driverLocation) {
          Alert.alert('Uyarı', 'Şoför konumu alınamadı');
          return;
        }
        const url = Platform.select({
          ios: `maps://app?saddr=${driverLocation.lat},${driverLocation.lng}&daddr=${msg.lat},${msg.lng}`,
          default: `https://www.google.com/maps/dir/?api=1&origin=${driverLocation.lat},${driverLocation.lng}&destination=${msg.lat},${msg.lng}&travelmode=driving`,
        });
        Linking.openURL(url!);
      } else if (msg.type === 'select') {
        setSelectedMarker(msg.id);
      } else if (msg.type === 'routeInfo') {
        setRouteInfo({ distance: msg.distance, duration: msg.duration, targetName: msg.name });
      } else if (msg.type === 'clearRoute') {
        setRouteInfo(null);
      }
    } catch (e) {
      console.error('WebView message error:', e);
    }
  }, [driverLocation, token]);

  const focusMarker = (bookingId: string, lat: number, lng: number) => {
    setSelectedMarker(bookingId);
    webRef.current?.injectJavaScript(`window.focusMarker('${bookingId}', ${lat}, ${lng}); true;`);
  };

  const pickedCount = bookings.filter(b => isPickedUp(b)).length;

  // Leaflet HTML map
  const mapHtml = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%}
  .popup-name{font-weight:700;font-size:14px;color:#1e293b;margin-bottom:2px}
  .popup-time{font-size:12px;font-weight:600;color:#3b82f6;margin-bottom:3px}
  .popup-addr{font-size:11px;color:#64748b;margin-bottom:3px}
  .popup-pax{font-size:11px;color:#94a3b8;margin-bottom:8px}
  .popup-btns{display:flex;gap:6px}
  .popup-btn{display:flex;align-items:center;justify-content:center;gap:4px;padding:8px 12px;border-radius:8px;border:none;color:#fff;font-weight:700;font-size:13px;cursor:pointer;flex:1}
  .btn-pickup{background:#4361ee}
  .btn-nav{background:#3b82f6;flex:none;padding:8px 10px}
  .btn-done{background:#22c55e;pointer-events:none}
  .order-icon{background:#ef4444;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
  .order-icon.picked{background:#22c55e}
  .order-icon.selected{background:#f59e0b}
</style>
</head><body>
<div id="map"></div>
<script>
var map = L.map('map',{zoomControl:false}).setView([36.8969,30.7133],9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OSM',maxZoom:19
}).addTo(map);
L.control.zoom({position:'topright'}).addTo(map);

var markers={}, routeLine=null;

function makeIcon(order,picked,selected){
  var cls='order-icon';
  if(picked) cls+=' picked';
  else if(selected) cls+=' selected';
  return L.divIcon({
    html:'<div class="'+cls+'">'+order+'</div>',
    className:'',iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-16]
  });
}

function send(obj){window.ReactNativeWebView.postMessage(JSON.stringify(obj))}

window.setMarkers=function(list){
  Object.values(markers).forEach(function(m){map.removeLayer(m)});
  markers={};
  if(!list.length) return;
  var bounds=[];
  list.forEach(function(b){
    var icon=makeIcon(b.order,b.picked,false);
    var m=L.marker([b.lat,b.lng],{icon:icon}).addTo(map);
    var popupHtml='<div class="popup-name">'+b.name+'</div>';
    if(b.time) popupHtml+='<div class="popup-time">'+b.time+'</div>';
    popupHtml+='<div class="popup-addr">'+b.addr+'</div>';
    popupHtml+='<div class="popup-pax">'+b.pax+' Pax'+(b.flight?' · '+b.flight:'')+'</div>';
    if(b.picked){
      popupHtml+='<div class="popup-btns"><button class="popup-btn btn-done">Alındı ✓</button></div>';
    } else {
      popupHtml+='<div class="popup-btns">';
      popupHtml+='<button class="popup-btn btn-pickup" onclick="send({type:\\'pickup\\',id:\\''+b.id+'\\'})">Alındı</button>';
      popupHtml+='<button class="popup-btn btn-nav" onclick="send({type:\\'navigate\\',id:\\''+b.id+'\\',lat:'+b.lat+',lng:'+b.lng+'})">🧭</button>';
      popupHtml+='</div>';
    }
    m.bindPopup(popupHtml,{maxWidth:220,minWidth:180});
    m.on('click',function(){send({type:'select',id:b.id})});
    markers[b.id]=m;
    bounds.push([b.lat,b.lng]);
  });
  if(bounds.length>0){
    map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
  }
};

window.focusMarker=function(id,lat,lng){
  map.setView([lat,lng],15,{animate:true});
  if(markers[id]) markers[id].openPopup();
};

send({type:'ready'});
</script>
</body></html>`;

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

      {/* WebView Map (Leaflet — works on ALL devices, no native crash) */}
      <WebView
        ref={webRef}
        source={{ html: mapHtml }}
        style={st.map}
        onMessage={onWebMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        startInLoadingState
        renderLoading={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f8' }}>
            <ActivityIndicator size="large" color={Brand.primary} />
            <Text style={{ marginTop: 8, color: '#64748b' }}>Harita yükleniyor...</Text>
          </View>
        )}
      />

      {/* Route info bar */}
      {routeInfo && (
        <View style={st.routeBar}>
          <View style={{ flex: 1 }}>
            <Text style={st.routeTarget} numberOfLines={1}>{routeInfo.targetName}</Text>
            <Text style={st.routeDetails}>{routeInfo.distance} · {routeInfo.duration}</Text>
          </View>
          <TouchableOpacity style={st.routeClearBtn} onPress={() => setRouteInfo(null)}>
            <Ionicons name="close-circle" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom customer list */}
      <View style={st.bottomSheet}>
        <View style={st.sheetHandle} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
          {bookings.map((b, i) => {
            const picked = isPickedUp(b);
            const hasCoords = getCoords(b).lat !== 0;
            return (
              <TouchableOpacity
                key={b.id}
                style={[st.chip, picked && st.chipPicked, selectedMarker === b.id && st.chipSelected]}
                onPress={() => {
                  if (hasCoords) focusMarker(b.id, b._lat, b._lng);
                  else setSelectedMarker(b.id);
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
                          if (driverLocation) {
                            const url = Platform.select({
                              ios: `maps://app?saddr=${driverLocation.lat},${driverLocation.lng}&daddr=${c.lat},${c.lng}`,
                              default: `https://www.google.com/maps/dir/?api=1&origin=${driverLocation.lat},${driverLocation.lng}&destination=${c.lat},${c.lng}&travelmode=driving`,
                            });
                            Linking.openURL(url!);
                          } else {
                            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`);
                          }
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
