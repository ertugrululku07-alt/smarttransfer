import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, ActivityIndicator, Modal, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { API_URL, Brand } from '../../constants/theme';
import Toast from 'react-native-toast-message';

export default function PoolScreen() {
    const insets = useSafeAreaInsets();
    const { token } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<any[]>([]);
    const [filter, setFilter] = useState('all');

    const fetchPool = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/transfer/partner/active-bookings`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) setBookings(data.data || []);
        } catch (e) {
            console.warn('Pool fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchPool(); }, [fetchPool]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchPool();
        setRefreshing(false);
    };

    const [myDrivers, setMyDrivers] = useState<any[]>([]);
    const [myVehicles, setMyVehicles] = useState<any[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<any>(null);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
    const [assigning, setAssigning] = useState(false);

    const fetchResources = useCallback(async () => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [driversRes, vehiclesRes] = await Promise.all([
                fetch(`${API_URL}/transfer/partner/my-drivers`, { headers }),
                fetch(`${API_URL}/transfer/partner/my-vehicles`, { headers }),
            ]);
            const [driversData, vehiclesData] = await Promise.all([driversRes.json(), vehiclesRes.json()]);
            if (driversData.success) setMyDrivers(driversData.data || []);
            if (vehiclesData.success) setMyVehicles(vehiclesData.data?.vehicles || vehiclesData.data || []);
        } catch {}
    }, [token]);

    useEffect(() => { fetchResources(); }, [fetchResources]);

    const openAssignModal = (booking: any) => {
        setSelectedBooking(booking);
        setSelectedDriver(null);
        setSelectedVehicle(null);
        setShowAssignModal(true);
    };

    const handleAssign = async () => {
        if (!selectedDriver) {
            Toast.show({ type: 'error', text1: 'Şoför Seçin', text2: 'Lütfen bir şoför seçin' });
            return;
        }
        setAssigning(true);
        try {
            const res = await fetch(`${API_URL}/transfer/partner/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ bookingId: selectedBooking.id, driverId: selectedDriver, vehicleId: selectedVehicle }),
            });
            const data = await res.json();
            if (data.success) {
                Toast.show({ type: 'success', text1: 'Atandı', text2: data.message });
                setShowAssignModal(false);
                fetchPool();
            } else {
                Toast.show({ type: 'error', text1: 'Hata', text2: data.error || 'Atama başarısız' });
            }
        } catch {
            Toast.show({ type: 'error', text1: 'Bağlantı Hatası' });
        } finally {
            setAssigning(false);
        }
    };

    const fmtDate = (iso: string) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const filters = [
        { key: 'all', label: 'Tümü' },
        { key: 'vip', label: 'VIP' },
        { key: 'minibus', label: 'Minibüs' },
    ];

    return (
        <View style={[s.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={s.header}>
                <Text style={s.title}>Transfer Havuzu</Text>
                <Text style={s.subtitle}>Mevcut bölgedeki aktif transferler</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
                    {filters.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[s.filterChip, filter === f.key && s.filterChipActive]}
                            onPress={() => setFilter(f.key)}
                        >
                            <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />}
                contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
            >
                {loading ? (
                    <ActivityIndicator size="large" color={Brand.primary} style={{ marginTop: 40 }} />
                ) : bookings.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Ionicons name="search-outline" size={48} color="#cbd5e1" />
                        <Text style={s.emptyTitle}>Havuzda transfer yok</Text>
                        <Text style={s.emptyText}>Yeni transferler eklendiğinde burada göreceksiniz</Text>
                    </View>
                ) : (
                    bookings.map((b: any) => (
                        <TouchableOpacity
                            key={b.id}
                            style={s.card}
                            activeOpacity={0.7}
                            onPress={() => router.push(`/transfer/${b.id}`)}
                        >
                            {/* Map placeholder */}
                            <LinearGradient colors={['#e0e7ff', '#c7d2fe']} style={s.mapArea}>
                                <View style={s.mapBadge}>
                                    <Ionicons name="location" size={12} color="#ef4444" />
                                    <Text style={s.mapBadgeText}>Transfer</Text>
                                </View>
                            </LinearGradient>

                            <View style={s.cardBody}>
                                <View style={s.cardTop}>
                                    <View>
                                        <View style={s.statusBadge}>
                                            <View style={s.pulseDot} />
                                            <Text style={s.statusText}>Bekliyor</Text>
                                        </View>
                                        <Text style={s.cardPrice}>₺{Number(b.total || 0).toLocaleString('tr-TR')}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={s.estLabel}>Tahmini süre</Text>
                                        <Text style={s.estValue}>{b.metadata?.estimatedDuration || '~30 dk'}</Text>
                                    </View>
                                </View>

                                {/* Route points */}
                                <View style={s.routePoints}>
                                    <View style={s.routeRow}>
                                        <View style={[s.dot, { backgroundColor: '#10b981' }]} />
                                        <Text style={s.routeText} numberOfLines={1}>{b.metadata?.pickup || b.pickupAddress || '-'}</Text>
                                    </View>
                                    <View style={s.routeRow}>
                                        <View style={[s.dot, { backgroundColor: '#ef4444' }]} />
                                        <Text style={s.routeText} numberOfLines={1}>{b.metadata?.dropoff || b.dropoffAddress || '-'}</Text>
                                    </View>
                                </View>

                                <View style={s.cardFooter}>
                                    <View style={s.tags}>
                                        <View style={s.tag}>
                                            <Text style={s.tagText}>{b.metadata?.vehicleType || 'Transfer'}</Text>
                                        </View>
                                        <View style={s.tag}>
                                            <Text style={s.tagText}>{b.passengerCount || '?'} Kişi</Text>
                                        </View>
                                        <View style={s.tag}>
                                            <Text style={s.tagText}>{fmtDate(b.startDate)}</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={s.acceptBtn}
                                        onPress={() => openAssignModal(b)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={s.acceptText}>Ata</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
            {/* Assign Modal */}
            <Modal visible={showAssignModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Şoför & Araç Seç</Text>
                            <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                                <Ionicons name="close" size={22} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        {selectedBooking && (
                            <View style={s.assignBookingInfo}>
                                <Text style={s.assignCustomer}>{selectedBooking.contactName || 'Müşteri'}</Text>
                                <Text style={s.assignRoute} numberOfLines={1}>
                                    {selectedBooking.metadata?.pickup || '—'} → {selectedBooking.metadata?.dropoff || '—'}
                                </Text>
                            </View>
                        )}

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={s.assignSectionTitle}>Şoför Seç *</Text>
                            {myDrivers.length === 0 ? (
                                <Text style={s.assignEmpty}>Henüz şoför eklenmemiş</Text>
                            ) : myDrivers.map((d: any) => (
                                <TouchableOpacity
                                    key={d.id}
                                    style={[s.assignOption, selectedDriver === d.id && s.assignOptionActive]}
                                    onPress={() => setSelectedDriver(d.id)}
                                >
                                    <Image
                                        source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(d.fullName)}&background=059669&color=fff&size=40` }}
                                        style={s.assignAvatar}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.assignName}>{d.fullName}</Text>
                                        <Text style={s.assignSub}>{d.isOnline ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı'}{d.activeBooking ? ' • Görevde' : ' • Müsait'}</Text>
                                    </View>
                                    {selectedDriver === d.id && <Ionicons name="checkmark-circle" size={20} color="#059669" />}
                                </TouchableOpacity>
                            ))}

                            <Text style={[s.assignSectionTitle, { marginTop: 16 }]}>Araç Seç (Opsiyonel)</Text>
                            {myVehicles.length === 0 ? (
                                <Text style={s.assignEmpty}>Araç bulunamadı</Text>
                            ) : myVehicles.map((v: any) => (
                                <TouchableOpacity
                                    key={v.id}
                                    style={[s.assignOption, selectedVehicle === v.id && s.assignOptionActive]}
                                    onPress={() => setSelectedVehicle(selectedVehicle === v.id ? null : v.id)}
                                >
                                    <View style={s.assignVehicleIcon}>
                                        <Ionicons name="car-sport" size={16} color="#059669" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.assignName}>{v.plateNumber || v.plate}</Text>
                                        <Text style={s.assignSub}>{v.name || `${v.brand} ${v.model}`}{v.isBusy ? ' • Meşgul' : ' • Müsait'}</Text>
                                    </View>
                                    {selectedVehicle === v.id && <Ionicons name="checkmark-circle" size={20} color="#059669" />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={[s.assignBtn, !selectedDriver && { opacity: 0.5 }]}
                            onPress={handleAssign}
                            disabled={!selectedDriver || assigning}
                        >
                            {assigning ? <ActivityIndicator color="#fff" /> : (
                                <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={s.assignBtnText}>Transferi Ata</Text></>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    subtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 10 },
    filterRow: { flexDirection: 'row', marginBottom: 10 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8 },
    filterChipActive: { backgroundColor: '#059669' },
    filterText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
    filterTextActive: { color: '#fff' },
    emptyCard: { alignItems: 'center', padding: 50, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748b' },
    emptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
    card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    mapArea: { height: 80, justifyContent: 'center', alignItems: 'center' },
    mapBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    mapBadgeText: { fontSize: 10, fontWeight: '700', color: '#334155' },
    cardBody: { padding: 14 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginBottom: 6 },
    pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
    statusText: { fontSize: 10, fontWeight: '600', color: '#92400e' },
    cardPrice: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    estLabel: { fontSize: 10, color: '#94a3b8' },
    estValue: { fontSize: 14, fontWeight: '700', color: '#334155' },
    routePoints: { gap: 8, marginBottom: 12 },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    routeText: { fontSize: 12, color: '#475569', flex: 1 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
    tag: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    tagText: { fontSize: 10, color: '#64748b', fontWeight: '500' },
    acceptBtn: { backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    acceptText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    assignBookingInfo: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
    assignCustomer: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    assignRoute: { fontSize: 12, color: '#64748b', marginTop: 4 },
    assignSectionTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
    assignEmpty: { fontSize: 12, color: '#94a3b8', paddingVertical: 8 },
    assignOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 8, backgroundColor: '#fff' },
    assignOptionActive: { borderColor: '#059669', backgroundColor: '#ecfdf5' },
    assignAvatar: { width: 36, height: 36, borderRadius: 18 },
    assignVehicleIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ecfdf5', justifyContent: 'center', alignItems: 'center' },
    assignName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    assignSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, marginTop: 12 },
    assignBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
