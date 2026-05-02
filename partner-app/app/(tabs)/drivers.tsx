import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, ActivityIndicator, TextInput, Modal, Alert, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { API_URL, Brand } from '../../constants/theme';
import Toast from 'react-native-toast-message';

export default function DriversScreen() {
    const insets = useSafeAreaInsets();
    const { token } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });

    const fetchDrivers = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/transfer/partner/my-drivers`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) setDrivers(data.data || []);
        } catch (e) {
            console.warn('Drivers fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchDrivers(); }, [fetchDrivers]);
    const onRefresh = async () => { setRefreshing(true); await fetchDrivers(); setRefreshing(false); };

    const handleAddDriver = async () => {
        if (!form.firstName || !form.lastName || !form.email || !form.password) {
            Alert.alert('Eksik Bilgi', 'Ad, soyad, e-posta ve şifre zorunludur');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/transfer/partner/drivers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                Toast.show({ type: 'success', text1: 'Başarılı', text2: data.message });
                setShowAddModal(false);
                setForm({ firstName: '', lastName: '', email: '', phone: '', password: '' });
                fetchDrivers();
            } else {
                Alert.alert('Hata', data.error || 'Şoför oluşturulamadı');
            }
        } catch {
            Alert.alert('Bağlantı Hatası', 'Sunucuya bağlanılamadı');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDriver = (driver: any) => {
        Alert.alert(
            'Şoför Kaldır',
            `${driver.fullName} adlı şoförü kaldırmak istediğinize emin misiniz?`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Kaldır', style: 'destructive', onPress: async () => {
                        try {
                            const res = await fetch(`${API_URL}/transfer/partner/drivers/${driver.id}`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${token}` },
                            });
                            const data = await res.json();
                            if (data.success) {
                                Toast.show({ type: 'success', text1: 'Kaldırıldı', text2: data.message });
                                fetchDrivers();
                            }
                        } catch { }
                    }
                },
            ]
        );
    };

    const onlineCount = drivers.filter(d => d.isOnline).length;
    const busyCount = drivers.filter(d => d.activeBooking).length;

    return (
        <View style={[s.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <LinearGradient colors={['#0f172a', '#1e293b']} style={s.header}>
                <View style={s.headerTop}>
                    <View>
                        <Text style={s.title}>Şoförlerim</Text>
                        <Text style={s.subtitle}>{drivers.length} şoför kayıtlı</Text>
                    </View>
                    <TouchableOpacity style={s.addBtn} onPress={() => setShowAddModal(true)}>
                        <Ionicons name="person-add" size={16} color="#fff" />
                        <Text style={s.addBtnText}>Ekle</Text>
                    </TouchableOpacity>
                </View>
                <View style={s.statsRow}>
                    <View style={s.statChip}>
                        <View style={[s.dot, { backgroundColor: '#10b981' }]} />
                        <Text style={s.statText}>{onlineCount} Çevrimiçi</Text>
                    </View>
                    <View style={s.statChip}>
                        <View style={[s.dot, { backgroundColor: '#f59e0b' }]} />
                        <Text style={s.statText}>{busyCount} Görevde</Text>
                    </View>
                    <View style={s.statChip}>
                        <View style={[s.dot, { backgroundColor: '#94a3b8' }]} />
                        <Text style={s.statText}>{drivers.length - onlineCount} Çevrimdışı</Text>
                    </View>
                </View>
            </LinearGradient>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />}
                contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
            >
                {loading ? (
                    <ActivityIndicator size="large" color={Brand.primary} style={{ marginTop: 40 }} />
                ) : drivers.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Ionicons name="people-outline" size={48} color="#cbd5e1" />
                        <Text style={s.emptyTitle}>Henüz şoför eklenmemiş</Text>
                        <Text style={s.emptyText}>Şoför ekleyerek transferleri atamaya başlayın</Text>
                        <TouchableOpacity style={s.emptyBtn} onPress={() => setShowAddModal(true)}>
                            <Ionicons name="person-add-outline" size={16} color="#fff" />
                            <Text style={s.emptyBtnText}>Şoför Ekle</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    drivers.map((d: any) => (
                        <View key={d.id} style={s.card}>
                            <View style={s.cardRow}>
                                <Image
                                    source={{ uri: d.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.fullName)}&background=059669&color=fff` }}
                                    style={s.avatar}
                                />
                                <View style={[s.onlineBadge, { backgroundColor: d.isOnline ? '#10b981' : '#94a3b8' }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.driverName}>{d.fullName}</Text>
                                    <Text style={s.driverEmail}>{d.email}</Text>
                                    {d.phone && <Text style={s.driverPhone}><Ionicons name="call-outline" size={10} color="#94a3b8" /> {d.phone}</Text>}
                                </View>
                                <TouchableOpacity onPress={() => handleDeleteDriver(d)} style={s.moreBtn}>
                                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                </TouchableOpacity>
                            </View>

                            {/* Status */}
                            <View style={s.cardFooter}>
                                <View style={[s.statusTag, d.activeBooking ? { backgroundColor: '#fef3c7' } : { backgroundColor: '#ecfdf5' }]}>
                                    <Text style={[s.statusText, d.activeBooking ? { color: '#92400e' } : { color: '#065f46' }]}>
                                        {d.activeBooking ? `Görevde: ${d.activeBooking.customerName}` : 'Müsait'}
                                    </Text>
                                </View>
                                {d.activeBookingsCount > 0 && (
                                    <View style={s.countTag}>
                                        <Text style={s.countText}>{d.activeBookingsCount} iş</Text>
                                    </View>
                                )}
                                {d.nextBooking && !d.activeBooking && (
                                    <Text style={s.nextText}>Sıradaki: {d.nextBooking.customerName}</Text>
                                )}
                            </View>

                            {/* Location indicator */}
                            {d.lastLocation && (
                                <View style={s.locRow}>
                                    <Ionicons name="location" size={10} color="#3b82f6" />
                                    <Text style={s.locText}>Konum bilgisi mevcut</Text>
                                    <Text style={s.locTime}>
                                        {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Add Driver Modal */}
            <Modal visible={showAddModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Yeni Şoför Ekle</Text>
                            <TouchableOpacity onPress={() => setShowAddModal(false)}>
                                <Ionicons name="close" size={22} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={s.fieldLabel}>Ad *</Text>
                            <TextInput style={s.fieldInput} placeholder="Adı" value={form.firstName}
                                onChangeText={v => setForm({ ...form, firstName: v })} />

                            <Text style={s.fieldLabel}>Soyad *</Text>
                            <TextInput style={s.fieldInput} placeholder="Soyadı" value={form.lastName}
                                onChangeText={v => setForm({ ...form, lastName: v })} />

                            <Text style={s.fieldLabel}>E-posta *</Text>
                            <TextInput style={s.fieldInput} placeholder="ornek@email.com" value={form.email}
                                onChangeText={v => setForm({ ...form, email: v })}
                                autoCapitalize="none" keyboardType="email-address" />

                            <Text style={s.fieldLabel}>Telefon</Text>
                            <TextInput style={s.fieldInput} placeholder="05XX XXX XXXX" value={form.phone}
                                onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />

                            <Text style={s.fieldLabel}>Şifre *</Text>
                            <TextInput style={s.fieldInput} placeholder="Minimum 6 karakter" value={form.password}
                                onChangeText={v => setForm({ ...form, password: v })} secureTextEntry />

                            <View style={s.infoBox}>
                                <Ionicons name="information-circle" size={16} color="#3b82f6" />
                                <Text style={s.infoText}>
                                    Şoför bu bilgilerle driver-app'e giriş yapabilecek. Giriş bilgilerini şoförünüze iletin.
                                </Text>
                            </View>

                            <TouchableOpacity style={s.saveBtn} onPress={handleAddDriver} disabled={saving}>
                                {saving ? <ActivityIndicator color="#fff" /> : (
                                    <>
                                        <Ionicons name="person-add" size={16} color="#fff" />
                                        <Text style={s.saveBtnText}>Şoför Ekle</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    title: { fontSize: 18, fontWeight: '800', color: '#fff' },
    subtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    statText: { fontSize: 11, color: '#cbd5e1', fontWeight: '500' },
    emptyCard: { alignItems: 'center', padding: 50, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748b' },
    emptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#059669', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 10 },
    emptyBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    onlineBadge: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff', position: 'absolute', left: 44, top: 32, zIndex: 1 },
    driverName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    driverEmail: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
    driverPhone: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
    moreBtn: { padding: 8 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f8fafc' },
    statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    statusText: { fontSize: 10, fontWeight: '600' },
    countTag: { backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    countText: { fontSize: 10, color: '#2563eb', fontWeight: '600' },
    nextText: { fontSize: 10, color: '#94a3b8', flex: 1, textAlign: 'right' },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f8fafc' },
    locText: { fontSize: 10, color: '#3b82f6', flex: 1 },
    locTime: { fontSize: 10, color: '#94a3b8' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 12 },
    fieldInput: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, height: 46, fontSize: 14, color: '#0f172a' },
    infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#eff6ff', padding: 12, borderRadius: 12, marginTop: 16, alignItems: 'flex-start' },
    infoText: { fontSize: 11, color: '#1e40af', flex: 1, lineHeight: 16 },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, marginTop: 20, marginBottom: 20 },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
