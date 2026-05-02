import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, ActivityIndicator, Dimensions, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { API_URL, Brand, StatusColors } from '../../constants/theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const { user, token } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ pending: 0, today: 0, financials: { balance: 0, debit: 0, credit: 0 } });
    const [activeBookings, setActiveBookings] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [statsRes, bookingsRes, vehiclesRes] = await Promise.all([
                fetch(`${API_URL}/transfer/partner/stats`, { headers }),
                fetch(`${API_URL}/transfer/partner/active-bookings`, { headers }),
                fetch(`${API_URL}/transfer/partner/my-vehicles`, { headers }),
            ]);
            const [statsData, bookingsData, vehiclesData] = await Promise.all([
                statsRes.json(), bookingsRes.json(), vehiclesRes.json(),
            ]);
            if (statsData.success) setStats(statsData.data);
            if (bookingsData.success) setActiveBookings(bookingsData.data || []);
            if (vehiclesData.success) setVehicles(vehiclesData.data || []);
        } catch (e) {
            console.warn('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Günaydın';
        if (h < 18) return 'İyi günler';
        return 'İyi akşamlar';
    };

    const firstName = user?.fullName?.split(' ')[0] || 'Partner';

    const fmtDate = (iso: string) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <View style={[s.container, { paddingTop: insets.top }]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />}
                contentContainerStyle={{ paddingBottom: 30 }}
            >
                {/* Header */}
                <LinearGradient colors={['#0f172a', '#1e293b']} style={s.header}>
                    <View style={s.headerTop}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.greeting}>{getGreeting()},</Text>
                            <Text style={s.userName}>{user?.fullName || 'Partner'}</Text>
                            <View style={s.statusRow}>
                                <View style={s.statusDot} />
                                <Text style={s.statusText}>Aktif</Text>
                            </View>
                        </View>
                        <View style={s.avatarWrap}>
                            <Image
                                source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || 'P')}&background=059669&color=fff` }}
                                style={s.avatar}
                            />
                            <View style={s.onlineDot} />
                        </View>
                    </View>

                    {/* Stats Cards */}
                    <View style={s.statsRow}>
                        <View style={s.statCard}>
                            <Text style={[s.statNum, { color: '#6ee7b7' }]}>₺{stats.financials.balance.toLocaleString('tr-TR')}</Text>
                            <Text style={s.statLabel}>Bakiye</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={[s.statNum, { color: '#93c5fd' }]}>{stats.today}</Text>
                            <Text style={s.statLabel}>Bugün</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={[s.statNum, { color: '#fbbf24' }]}>{stats.pending}</Text>
                            <Text style={s.statLabel}>Bekleyen</Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* Active Transfers */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>Aktif Transferler</Text>
                        {activeBookings.length > 0 && (
                            <View style={s.countBadge}>
                                <Text style={s.countText}>{activeBookings.length}</Text>
                            </View>
                        )}
                    </View>

                    {loading ? (
                        <ActivityIndicator size="small" color={Brand.primary} style={{ marginTop: 20 }} />
                    ) : activeBookings.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Ionicons name="car-sport-outline" size={40} color="#cbd5e1" />
                            <Text style={s.emptyText}>Aktif transfer bulunmuyor</Text>
                        </View>
                    ) : (
                        activeBookings.map((b: any) => (
                            <TouchableOpacity
                                key={b.id}
                                style={s.transferCard}
                                activeOpacity={0.7}
                                onPress={() => router.push(`/transfer/${b.id}`)}
                            >
                                <View style={s.cardHeader}>
                                    <View style={s.cardCustomer}>
                                        <View style={s.cardAvatar}>
                                            <Text style={s.cardAvatarText}>
                                                {(b.contactName || 'M').substring(0, 2).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.cardName}>{b.contactName || 'Müşteri'}</Text>
                                            {b.contactPhone && (
                                                <Text style={s.cardPhone}>
                                                    <Ionicons name="call-outline" size={10} color="#94a3b8" /> {b.contactPhone}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <View>
                                        <Text style={s.cardPrice}>₺{Number(b.total || 0).toLocaleString('tr-TR')}</Text>
                                        <Text style={s.cardPayment}>{b.paymentMethod === 'CASH' ? 'Nakit' : 'Havale'}</Text>
                                    </View>
                                </View>

                                {/* Route */}
                                <View style={s.routeWrap}>
                                    <View style={s.routeLine}>
                                        <View style={[s.routeDot, { backgroundColor: '#10b981' }]} />
                                        <View style={s.routeDash} />
                                        <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
                                    </View>
                                    <View style={s.routeTexts}>
                                        <View style={s.routeItem}>
                                            <Text style={s.routeLabel}>ALIŞ</Text>
                                            <Text style={s.routeAddr} numberOfLines={1}>
                                                {b.metadata?.pickup || b.pickupAddress || '-'}
                                            </Text>
                                        </View>
                                        <View style={s.routeItem}>
                                            <Text style={[s.routeLabel, { color: '#ef4444' }]}>VARIŞ</Text>
                                            <Text style={s.routeAddr} numberOfLines={1}>
                                                {b.metadata?.dropoff || b.dropoffAddress || '-'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={s.cardFooter}>
                                    <View style={s.tagRow}>
                                        <View style={s.tag}>
                                            <Ionicons name="car-outline" size={10} color="#64748b" />
                                            <Text style={s.tagText}>{b.metadata?.vehicleType || 'Transfer'}</Text>
                                        </View>
                                        <View style={s.tag}>
                                            <Ionicons name="people-outline" size={10} color="#64748b" />
                                            <Text style={s.tagText}>{b.passengerCount || b.metadata?.pax || '?'} Kişi</Text>
                                        </View>
                                        <View style={s.tag}>
                                            <Ionicons name="calendar-outline" size={10} color="#64748b" />
                                            <Text style={s.tagText}>{fmtDate(b.startDate)}</Text>
                                        </View>
                                    </View>
                                    {b.metadata?.flightNumber && (
                                        <View style={[s.tag, { backgroundColor: '#eff6ff' }]}>
                                            <Ionicons name="airplane-outline" size={10} color="#2563eb" />
                                            <Text style={[s.tagText, { color: '#2563eb' }]}>{b.metadata.flightNumber}</Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>

                {/* Quick Actions */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>Hızlı İşlemler</Text>
                    <View style={s.quickGrid}>
                        {[
                            { icon: 'search', label: 'İş Bul', color: '#059669', bg: '#ecfdf5', onPress: () => router.push('/(tabs)/pool') },
                            { icon: 'wallet', label: 'Kazanç', color: '#3b82f6', bg: '#eff6ff', onPress: () => router.push('/(tabs)/earnings') },
                            { icon: 'chatbubbles', label: 'Mesajlar', color: '#8b5cf6', bg: '#f5f3ff', onPress: () => {} },
                            { icon: 'navigate', label: 'Navigasyon', color: '#f59e0b', bg: '#fffbeb', onPress: () => {} },
                        ].map((item, i) => (
                            <TouchableOpacity key={i} style={s.quickItem} activeOpacity={0.7} onPress={item.onPress}>
                                <View style={[s.quickIcon, { backgroundColor: item.bg }]}>
                                    <Ionicons name={item.icon as any} size={22} color={item.color} />
                                </View>
                                <Text style={s.quickLabel}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* My Vehicles */}
                {vehicles.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>Araçlarım</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {vehicles.map((v: any, i: number) => (
                                <View key={v.id || i} style={s.vehicleCard}>
                                    <View style={s.vehicleIconWrap}>
                                        <Ionicons name="car-sport" size={20} color={Brand.primary} />
                                    </View>
                                    <Text style={s.vehiclePlate}>{v.plate || v.licensePlate}</Text>
                                    <Text style={s.vehicleType}>{v.vehicleType?.name || v.type || '-'}</Text>
                                    <View style={[s.vehicleStatus, { backgroundColor: v.isBusy ? '#fef3c7' : '#ecfdf5' }]}>
                                        <Text style={[s.vehicleStatusText, { color: v.isBusy ? '#92400e' : '#065f46' }]}>
                                            {v.isBusy ? 'Meşgul' : 'Müsait'}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    greeting: { fontSize: 13, color: '#94a3b8' },
    userName: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
    statusText: { fontSize: 11, color: '#6ee7b7', fontWeight: '600' },
    avatarWrap: { position: 'relative' },
    avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#059669' },
    onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10b981', borderWidth: 2.5, borderColor: '#0f172a' },
    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, alignItems: 'center' },
    statNum: { fontSize: 18, fontWeight: '800' },
    statLabel: { fontSize: 10, color: '#94a3b8', marginTop: 4 },
    section: { paddingHorizontal: 16, marginTop: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
    countBadge: { backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 12 },
    countText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 40, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#f1f5f9' },
    emptyText: { fontSize: 13, color: '#94a3b8' },
    transferCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
    cardCustomer: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    cardAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ecfdf5', justifyContent: 'center', alignItems: 'center' },
    cardAvatarText: { fontSize: 13, fontWeight: '700', color: '#059669' },
    cardName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
    cardPhone: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    cardPrice: { fontSize: 16, fontWeight: '800', color: '#059669', textAlign: 'right' },
    cardPayment: { fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 },
    routeWrap: { flexDirection: 'row', gap: 10, marginBottom: 14, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12 },
    routeLine: { alignItems: 'center', gap: 4, paddingVertical: 4 },
    routeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
    routeDash: { width: 1.5, flex: 1, backgroundColor: '#e2e8f0' },
    routeTexts: { flex: 1, justifyContent: 'space-between', gap: 12 },
    routeItem: {},
    routeLabel: { fontSize: 9, fontWeight: '700', color: '#10b981', marginBottom: 2 },
    routeAddr: { fontSize: 12, color: '#334155', fontWeight: '500' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    tagText: { fontSize: 10, color: '#64748b', fontWeight: '500' },
    quickGrid: { flexDirection: 'row', gap: 12 },
    quickItem: { alignItems: 'center', gap: 6 },
    quickIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 10, color: '#64748b', fontWeight: '600' },
    vehicleCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginRight: 12, width: 140, borderWidth: 1, borderColor: '#f1f5f9', alignItems: 'center', gap: 6 },
    vehicleIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ecfdf5', justifyContent: 'center', alignItems: 'center' },
    vehiclePlate: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
    vehicleType: { fontSize: 10, color: '#94a3b8' },
    vehicleStatus: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    vehicleStatusText: { fontSize: 10, fontWeight: '600' },
});
