import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
  Alert, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

const API_URL = 'http://187.127.76.249/api';

interface VehicleInfo {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  vehicleType: string;
}

interface FuelRecord {
  id: string;
  plateNumber: string;
  odometer: number;
  liters: number;
  pricePerLiter?: number;
  totalCost?: number;
  currency: string;
  fuelType: string;
  notes?: string;
  odometerPhotoUrl?: string;
  anomalyFlag?: string;
  anomalyReasons?: string[];
  gpsDistanceKm?: number;
  previousOdometer?: number;
  odometerDeltaKm?: number;
  createdAt: string;
}

const FUEL_TYPES = ['Dizel', 'Benzin', 'LPG'];

export default function FuelScreen() {
  const { token } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(true);

  // Form state
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [fuelType, setFuelType] = useState('Dizel');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    fetchVehicle();
    fetchRecords();
  }, []);

  const fetchVehicle = async () => {
    setVehicleLoading(true);
    try {
      const res = await fetch(`${API_URL}/driver/fuel/vehicle`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success && json.data) setVehicle(json.data);
    } catch (e) {
      console.error('Vehicle fetch error:', e);
    } finally {
      setVehicleLoading(false);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/driver/fuel?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch (e) {
      console.error('Fuel records error:', e);
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Kamera izni gereklidir');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'odometer.jpg';
      formData.append('file', { uri, name: filename, type: 'image/jpeg' } as any);
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (json.success) return json.data.url;
      return null;
    } catch (e) {
      console.error('Photo upload error:', e);
      return null;
    } finally {
      setPhotoUploading(false);
    }
  };

  const getAnomalyLabel = (code: string) => {
    const labels: Record<string, string> = {
      'KM_DECREASE': 'KM düşüşü tespit edildi',
      'GPS_DISTANCE_MISMATCH': 'GPS mesafesi ile KM uyumsuz',
      'HIGH_CONSUMPTION': 'Anormal yakıt tüketimi',
      'HIGH_FREQUENCY': 'Aynı gün çok fazla yakıt alımı',
      'OCR_KM_MISMATCH': 'Fotoğraftaki KM ile girilen KM uyuşmuyor',
      'OCR_UNREADABLE': 'Fotoğraftaki KM okunamadı (inceleme gerekli)',
    };
    return labels[code] || code;
  };

  const submitFuel = async () => {
    if (!vehicle) {
      Alert.alert('Uyarı', 'Atanmış araç bulunamadı');
      return;
    }
    if (!odometer || !liters) {
      Alert.alert('Uyarı', 'KM ve litre bilgisi zorunludur');
      return;
    }
    if (!photoUri) {
      Alert.alert('Uyarı', 'KM saati fotoğrafı zorunludur.\nLütfen fotoğraf çekin.');
      return;
    }
    const odometerVal = parseFloat(odometer);
    const litersVal = parseFloat(liters);
    if (isNaN(odometerVal) || odometerVal <= 0) {
      Alert.alert('Uyarı', 'Geçerli bir KM değeri girin');
      return;
    }
    if (isNaN(litersVal) || litersVal <= 0) {
      Alert.alert('Uyarı', 'Geçerli bir litre değeri girin');
      return;
    }

    setSaving(true);
    try {
      // Upload photo
      const photoUrl = await uploadPhoto(photoUri);
      if (!photoUrl) {
        Alert.alert('Hata', 'Fotoğraf yüklenemedi, tekrar deneyin');
        setSaving(false);
        return;
      }

      // Get current GPS location
      let gpsLat: number | undefined;
      let gpsLng: number | undefined;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        gpsLat = loc.coords.latitude;
        gpsLng = loc.coords.longitude;
      } catch (e) {
        // GPS optional — continue without
      }

      const body: any = {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        odometer: odometerVal,
        liters: litersVal,
        fuelType,
        notes: notes || undefined,
        odometerPhotoUrl: photoUrl,
        gpsLocationLat: gpsLat,
        gpsLocationLng: gpsLng,
      };
      if (pricePerLiter) {
        body.pricePerLiter = parseFloat(pricePerLiter);
        body.totalCost = parseFloat(pricePerLiter) * litersVal;
      }

      const res = await fetch(`${API_URL}/driver/fuel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.success) {
        if (json.warnings && json.warnings.length > 0) {
          Alert.alert(
            '⚠️ Kayıt Edildi — Uyarılar Var',
            json.warnings.map((w: string) => '• ' + getAnomalyLabel(w)).join('\n') +
            '\n\nKayıt sisteme işlendi ancak yönetim tarafından incelenecektir.',
          );
        } else {
          Alert.alert('Başarılı', 'Yakıt alımı kaydedildi ✓');
        }
        setOdometer('');
        setLiters('');
        setPricePerLiter('');
        setNotes('');
        setPhotoUri(null);
        fetchRecords();
      } else {
        Alert.alert('Hata', json.error || 'Kayıt başarısız');
      }
    } catch (e) {
      Alert.alert('Hata', 'Bağlantı hatası');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const renderRecord = ({ item }: { item: FuelRecord }) => (
    <View style={[s.recordCard, item.anomalyFlag && s.recordCardWarning]}>
      <View style={s.recordTop}>
        <View style={s.recordDateBox}>
          <Ionicons name="calendar" size={13} color={Brand.primary} />
          <Text style={s.recordDate}>{formatDate(item.createdAt)}</Text>
          <Text style={s.recordTime}>{formatTime(item.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {item.anomalyFlag && (
            <View style={s.anomalyBadge}>
              <Ionicons name="warning" size={10} color="#DC2626" />
              <Text style={s.anomalyBadgeText}>Şüpheli</Text>
            </View>
          )}
          <View style={s.fuelTypeBadge}>
            <Ionicons name="flame" size={11} color="#D97706" />
            <Text style={s.fuelTypeText}>{item.fuelType}</Text>
          </View>
        </View>
      </View>

      {/* Anomaly Details */}
      {item.anomalyFlag && item.anomalyReasons && item.anomalyReasons.length > 0 && (
        <View style={s.anomalyBox}>
          {item.anomalyReasons.map((r, i) => (
            <View key={i} style={s.anomalyRow}>
              <Ionicons name="alert-circle" size={12} color="#DC2626" />
              <Text style={s.anomalyText}>{getAnomalyLabel(r)}</Text>
            </View>
          ))}
          {item.gpsDistanceKm != null && item.odometerDeltaKm != null && (
            <Text style={s.anomalyDetail}>
              GPS mesafe: {item.gpsDistanceKm} km • KM farkı: {item.odometerDeltaKm} km
            </Text>
          )}
        </View>
      )}

      <View style={s.recordStats}>
        <View style={s.recordStat}>
          <Text style={s.recordStatLabel}>KM</Text>
          <Text style={s.recordStatValue}>{item.odometer.toLocaleString('tr-TR')}</Text>
        </View>
        <View style={s.recordStatDivider} />
        <View style={s.recordStat}>
          <Text style={s.recordStatLabel}>Litre</Text>
          <Text style={s.recordStatValue}>{item.liters.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</Text>
        </View>
        {item.totalCost ? (
          <>
            <View style={s.recordStatDivider} />
            <View style={s.recordStat}>
              <Text style={s.recordStatLabel}>Tutar</Text>
              <Text style={s.recordStatValue}>{item.totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</Text>
            </View>
          </>
        ) : null}
      </View>
      {item.notes ? <Text style={s.recordNotes}>{item.notes}</Text> : null}
    </View>
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <SafeAreaView edges={['top']} style={{ paddingBottom: 0 }}>
          <View style={s.headerDecor1} />
          <View style={s.headerDecor2} />
          <View style={s.headerContent}>
            <View style={s.headerTitleRow}>
              <View style={s.headerIconBox}>
                <Ionicons name="speedometer" size={20} color="#fff" />
              </View>
              <View>
                <Text style={s.headerTitle}>Yakıt Takip</Text>
                <Text style={s.headerSub}>{records.length} kayıt</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.scrollBody}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchVehicle(); fetchRecords(); }} tintColor={Brand.primary} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Vehicle Info */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              <Ionicons name="car" size={14} color="#475569" /> Araç Bilgisi
            </Text>
            {vehicleLoading ? (
              <View style={s.vehicleLoading}>
                <ActivityIndicator color={Brand.primary} />
              </View>
            ) : vehicle ? (
              <View style={s.vehicleCard}>
                <View style={s.vehicleIconBox}>
                  <Ionicons name="car-sport" size={24} color={Brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vehiclePlate}>{vehicle.plateNumber}</Text>
                  <Text style={s.vehicleDetail}>{vehicle.brand} {vehicle.model} • {vehicle.year}</Text>
                  <Text style={s.vehicleType}>{vehicle.vehicleType}</Text>
                </View>
                <View style={[s.vehicleColorDot, { backgroundColor: vehicle.color?.toLowerCase() === 'beyaz' ? '#E5E7EB' : vehicle.color?.toLowerCase() === 'siyah' ? '#1F2937' : '#94A3B8' }]} />
              </View>
            ) : (
              <View style={s.noVehicle}>
                <Ionicons name="alert-circle-outline" size={24} color="#F59E0B" />
                <Text style={s.noVehicleText}>Atanmış araç bulunamadı</Text>
              </View>
            )}
          </View>

          {/* Fuel Entry Form */}
          {vehicle && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>
                <Ionicons name="add-circle" size={14} color="#475569" /> Yakıt Alımı Kaydet
              </Text>
              <View style={s.formCard}>
                {/* Fuel Type Selector */}
                <Text style={s.inputLabel}>Yakıt Türü</Text>
                <View style={s.fuelTypeRow}>
                  {FUEL_TYPES.map(ft => (
                    <TouchableOpacity
                      key={ft}
                      style={[s.fuelTypeChip, fuelType === ft && s.fuelTypeChipActive]}
                      onPress={() => setFuelType(ft)}
                    >
                      <Ionicons
                        name="flame"
                        size={13}
                        color={fuelType === ft ? '#D97706' : '#94A3B8'}
                      />
                      <Text style={[s.fuelTypeChipText, fuelType === ft && s.fuelTypeChipTextActive]}>{ft}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Odometer */}
                <Text style={s.inputLabel}>Araç KM *</Text>
                <View style={s.inputRow}>
                  <View style={s.inputIconBox}>
                    <Ionicons name="speedometer-outline" size={18} color="#64748B" />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Ör: 45230"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={odometer}
                    onChangeText={setOdometer}
                  />
                  <Text style={s.inputUnit}>km</Text>
                </View>

                {/* Liters */}
                <Text style={s.inputLabel}>Alınan Yakıt *</Text>
                <View style={s.inputRow}>
                  <View style={s.inputIconBox}>
                    <Ionicons name="water-outline" size={18} color="#64748B" />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Ör: 45.5"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                    value={liters}
                    onChangeText={setLiters}
                  />
                  <Text style={s.inputUnit}>lt</Text>
                </View>

                {/* Price per liter (optional) */}
                <Text style={s.inputLabel}>Litre Fiyatı (opsiyonel)</Text>
                <View style={s.inputRow}>
                  <View style={s.inputIconBox}>
                    <Ionicons name="pricetag-outline" size={18} color="#64748B" />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Ör: 42.50"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                    value={pricePerLiter}
                    onChangeText={setPricePerLiter}
                  />
                  <Text style={s.inputUnit}>₺/lt</Text>
                </View>

                {/* Total display */}
                {pricePerLiter && liters ? (
                  <View style={s.totalRow}>
                    <Ionicons name="calculator" size={14} color="#059669" />
                    <Text style={s.totalText}>
                      Toplam: {(parseFloat(pricePerLiter || '0') * parseFloat(liters || '0')).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </Text>
                  </View>
                ) : null}

                {/* Odometer Photo (Required) */}
                <Text style={s.inputLabel}>KM Saati Fotoğrafı *</Text>
                {photoUri ? (
                  <View style={s.photoPreviewBox}>
                    <Image source={{ uri: photoUri }} style={s.photoPreview} />
                    <TouchableOpacity style={s.photoRetakeBtn} onPress={takePhoto}>
                      <Ionicons name="camera-reverse" size={16} color="#fff" />
                      <Text style={s.photoRetakeText}>Yeniden Çek</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={s.photoBtn} onPress={takePhoto} activeOpacity={0.7}>
                    <View style={s.photoBtnIcon}>
                      <Ionicons name="camera" size={28} color="#4F46E5" />
                    </View>
                    <Text style={s.photoBtnTitle}>Fotoğraf Çek</Text>
                    <Text style={s.photoBtnSub}>KM saatinin fotoğrafını çekin</Text>
                  </TouchableOpacity>
                )}

                {/* Notes */}
                <Text style={s.inputLabel}>Not (opsiyonel)</Text>
                <TextInput
                  style={s.notesInput}
                  placeholder="Ek bilgi..."
                  placeholderTextColor="#94A3B8"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                />

                {/* Submit */}
                <TouchableOpacity
                  style={[s.submitBtn, saving && { opacity: 0.6 }]}
                  onPress={submitFuel}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={s.submitBtnText}>Kaydet</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* History */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              <Ionicons name="time" size={14} color="#475569" /> Geçmiş Yakıt Alımları
            </Text>
            {records.length === 0 && !loading ? (
              <View style={s.emptyState}>
                <View style={s.emptyIcon}>
                  <Ionicons name="water-outline" size={32} color="#CBD5E1" />
                </View>
                <Text style={s.emptyTitle}>Henüz kayıt yok</Text>
                <Text style={s.emptySub}>Yakıt alımlarınız burada görünecek</Text>
              </View>
            ) : (
              records.map(r => (
                <View key={r.id}>{renderRecord({ item: r })}</View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  header: { backgroundColor: '#1E293B', overflow: 'hidden' },
  headerDecor1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(67,97,238,0.1)', top: -50, right: -30,
  },
  headerDecor2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(99,102,241,0.06)', bottom: -10, left: -20,
  },
  headerContent: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(67,97,238,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },

  // Body
  scrollBody: { flex: 1 },

  // Section
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10, letterSpacing: 0.3 },

  // Vehicle Card
  vehicleLoading: { padding: 30, alignItems: 'center' },
  vehicleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  vehicleIconBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  vehiclePlate: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: 1 },
  vehicleDetail: { fontSize: 12, color: '#64748B', fontWeight: '500', marginTop: 2 },
  vehicleType: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
  vehicleColorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#E2E8F0' },
  noVehicle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  noVehicleText: { color: '#92400E', fontSize: 13, fontWeight: '600' },

  // Form
  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, marginTop: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  inputIconBox: {
    width: 44, height: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#0F172A', fontWeight: '600' },
  inputUnit: { paddingRight: 14, fontSize: 12, color: '#94A3B8', fontWeight: '700' },

  fuelTypeRow: { flexDirection: 'row', gap: 8 },
  fuelTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  fuelTypeChipActive: { backgroundColor: '#FFFBEB', borderColor: '#FBBF24' },
  fuelTypeChipText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  fuelTypeChipTextActive: { color: '#D97706' },

  totalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginTop: 10,
  },
  totalText: { color: '#059669', fontWeight: '700', fontSize: 14 },

  notesInput: {
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    padding: 12, fontSize: 14, color: '#0F172A', minHeight: 50, textAlignVertical: 'top',
  },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, marginTop: 16,
    shadowColor: '#059669', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Records
  recordCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  recordDateBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordDate: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  recordTime: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  fuelTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  fuelTypeText: { fontSize: 10, fontWeight: '700', color: '#D97706' },

  recordStats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10,
  },
  recordStat: { flex: 1, alignItems: 'center' },
  recordStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
  recordStatValue: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  recordStatDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0' },
  recordNotes: { fontSize: 11, color: '#64748B', marginTop: 8, fontStyle: 'italic' },

  // Photo
  photoBtn: {
    backgroundColor: '#EEF2FF', borderRadius: 14, borderWidth: 2, borderColor: '#C7D2FE',
    borderStyle: 'dashed', padding: 24, alignItems: 'center', gap: 6,
  },
  photoBtnIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
  },
  photoBtnTitle: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  photoBtnSub: { fontSize: 11, color: '#94A3B8' },
  photoPreviewBox: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  photoPreview: { width: '100%', height: 180, borderRadius: 14 },
  photoRetakeBtn: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  photoRetakeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Anomaly
  recordCardWarning: { borderColor: '#FCA5A5', borderWidth: 1.5, backgroundColor: '#FFF7F7' },
  anomalyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  anomalyBadgeText: { fontSize: 9, fontWeight: '800', color: '#DC2626' },
  anomalyBox: {
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#FECACA', gap: 4,
  },
  anomalyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  anomalyText: { fontSize: 11, color: '#B91C1C', fontWeight: '600' },
  anomalyDetail: { fontSize: 10, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },

  // Empty
  emptyState: { padding: 40, alignItems: 'center' },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  emptyTitle: { color: '#475569', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
});
