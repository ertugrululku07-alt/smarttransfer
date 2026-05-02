import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, Image, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { API_URL, Brand } from '../../constants/theme';

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { user, token, signOut } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [vehicles, setVehicles] = useState<any[]>([]);

    const fetchVehicles = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/transfer/partner/my-vehicles`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) setVehicles(data.data || []);
        } catch {}
    }, [token]);

    useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

    const onRefresh = async () => { setRefreshing(true); await fetchVehicles(); setRefreshing(false); };

    const handleLogout = () => {
        Alert.alert('Çıkış Yap', 'Hesabınızdan çıkış yapmak istediğinize emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
        ]);
    };

    const menuItems = [
        { icon: 'notifications-outline', label: 'Bildirimler', color: '#3b82f6', bg: '#eff6ff' },
        { icon: 'shield-checkmark-outline', label: 'Güvenlik', color: '#059669', bg: '#ecfdf5' },
        { icon: 'headset-outline', label: 'Yardım Merkezi', color: '#8b5cf6', bg: '#f5f3ff' },
        { icon: 'globe-outline', label: 'Dil', color: '#f59e0b', bg: '#fffbeb', extra: 'Türkçe' },
    ];

    return (
        <View style={[s.container, { paddingTop: insets.top }]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />}
                contentContainerStyle={{ paddingBottom: 30 }}
            >
                {/* Header */}
                <LinearGradient colors={['#0f172a', '#1e293b']} style={s.header}>
                    <View style={s.profileRow}>
                        <Image
                            source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || 'P')}&background=059669&color=fff&size=120` }}
                            style={s.avatar}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={s.name}>{user?.fullName || 'Partner'}</Text>
                            <Text style={s.role}>Partner Sürücü</Text>
                            <View style={s.badges}>
                                <View style={s.badge}>
                                    <Text style={s.badgeText}>Premium</Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                                    <Ionicons name="star" size={9} color="#fbbf24" />
                                    <Text style={[s.badgeText, { color: '#e2e8f0' }]}>4.9</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </LinearGradient>

                {/* Vehicles */}
                <View style={s.section}>
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Araç Bilgileri</Text>
                        {vehicles.length > 0 ? vehicles.map((v: any, i: number) => (
                            <View key={v.id || i}>
                                <View style={s.infoRow}>
                                    <Text style={s.infoLabel}>Plaka</Text>
                                    <Text style={s.infoValue}>{v.plate || v.licensePlate || '-'}</Text>
                                </View>
                                <View style={s.infoRow}>
                                    <Text style={s.infoLabel}>Araç Tipi</Text>
                                    <Text style={s.infoValue}>{v.vehicleType?.name || v.type || '-'}</Text>
                                </View>
                                <View style={s.infoRow}>
                                    <Text style={s.infoLabel}>Koltuk</Text>
                                    <Text style={s.infoValue}>{v.seatCount || v.capacity || '-'}</Text>
                                </View>
                                <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
                                    <Text style={s.infoLabel}>Durum</Text>
                                    <View style={[s.statusBadge, { backgroundColor: v.isBusy ? '#fef3c7' : '#ecfdf5' }]}>
                                        <Text style={[s.statusText, { color: v.isBusy ? '#92400e' : '#065f46' }]}>
                                            {v.isBusy ? 'Meşgul' : 'Aktif'}
                                        </Text>
                                    </View>
                                </View>
                                {i < vehicles.length - 1 && <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 8 }} />}
                            </View>
                        )) : (
                            <Text style={s.emptyText}>Araç bilgisi bulunamadı</Text>
                        )}
                    </View>
                </View>

                {/* Menu */}
                <View style={s.section}>
                    <View style={s.menuCard}>
                        {menuItems.map((item, i) => (
                            <TouchableOpacity key={i} style={[s.menuItem, i < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f8fafc' }]} activeOpacity={0.6}>
                                <View style={[s.menuIcon, { backgroundColor: item.bg }]}>
                                    <Ionicons name={item.icon as any} size={16} color={item.color} />
                                </View>
                                <Text style={s.menuLabel}>{item.label}</Text>
                                {item.extra && <Text style={s.menuExtra}>{item.extra}</Text>}
                                <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Logout */}
                <View style={s.section}>
                    <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
                        <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                        <Text style={s.logoutText}>Çıkış Yap</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: 'rgba(5,150,105,0.3)' },
    name: { fontSize: 20, fontWeight: '800', color: '#fff' },
    role: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
    badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,150,105,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { fontSize: 10, fontWeight: '600', color: '#6ee7b7' },
    section: { paddingHorizontal: 16, marginTop: -12 },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#f1f5f9' },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
    infoLabel: { fontSize: 12, color: '#94a3b8' },
    infoValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 11, fontWeight: '600' },
    emptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 20 },
    menuCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginTop: 20, borderWidth: 1, borderColor: '#f1f5f9' },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    menuLabel: { fontSize: 14, fontWeight: '500', color: '#334155', flex: 1 },
    menuExtra: { fontSize: 12, color: '#94a3b8', marginRight: 4 },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fef2f2', borderRadius: 14, paddingVertical: 14, marginTop: 20 },
    logoutText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
});
