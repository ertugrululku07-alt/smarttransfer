import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { API_URL, Brand } from '../../constants/theme';

export default function EarningsScreen() {
    const insets = useSafeAreaInsets();
    const { token } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ pending: 0, today: 0, financials: { balance: 0, debit: 0, credit: 0 } });
    const [completedBookings, setCompletedBookings] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [statsRes, compRes] = await Promise.all([
                fetch(`${API_URL}/transfer/partner/stats`, { headers }),
                fetch(`${API_URL}/transfer/partner/completed-bookings`, { headers }),
            ]);
            const [statsData, compData] = await Promise.all([statsRes.json(), compRes.json()]);
            if (statsData.success) setStats(statsData.data);
            if (compData.success) setCompletedBookings((compData.data || []).slice(0, 10));
        } catch (e) {
            console.warn('Earnings fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

    const fmtDate = (iso: string) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const weekData = [60, 45, 80, 95, 75, 100, 10];

    return (
        <View style={[s.container, { paddingTop: insets.top }]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />}
                contentContainerStyle={{ paddingBottom: 30 }}
            >
                {/* Header */}
                <LinearGradient colors={['#0f172a', '#1e293b']} style={s.header}>
                    <Text style={s.title}>Kazancım</Text>
                    <Text style={s.subtitle}>Performans özeti</Text>

                    <View style={s.balanceWrap}>
                        <Text style={s.balanceLabel}>Toplam Bakiye</Text>
                        <Text style={s.balanceAmount}>₺{stats.financials.balance.toLocaleString('tr-TR')}</Text>
                        <View style={s.changeRow}>
                            <Ionicons name="trending-up" size={14} color="#6ee7b7" />
                            <Text style={s.changeText}>Bugün {stats.today} transfer</Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* Weekly Chart */}
                <View style={s.section}>
                    <View style={s.chartCard}>
                        <Text style={s.chartTitle}>Haftalık Performans</Text>
                        <View style={s.chartBars}>
                            {weekDays.map((day, i) => (
                                <View key={day} style={s.barCol}>
                                    <View style={[s.barBg, { height: 100 }]}>
                                        <LinearGradient
                                            colors={['#059669', '#10b981']}
                                            style={[s.barFill, { height: `${weekData[i]}%` }]}
                                        />
                                    </View>
                                    <Text style={[s.barLabel, i === 5 && { color: '#059669', fontWeight: '700' }]}>{day}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Stat Cards */}
                <View style={s.section}>
                    <View style={s.statGrid}>
                        <View style={s.statCard}>
                            <View style={[s.statIcon, { backgroundColor: '#ecfdf5' }]}>
                                <Ionicons name="trending-up" size={18} color="#059669" />
                            </View>
                            <Text style={s.statNum}>₺{stats.financials.credit.toLocaleString('tr-TR')}</Text>
                            <Text style={s.statLabel}>Toplam Gelir</Text>
                        </View>
                        <View style={s.statCard}>
                            <View style={[s.statIcon, { backgroundColor: '#eff6ff' }]}>
                                <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
                            </View>
                            <Text style={s.statNum}>{stats.today}</Text>
                            <Text style={s.statLabel}>Bugün Tamamlanan</Text>
                        </View>
                    </View>
                </View>

                {/* Recent Transactions */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>Son İşlemler</Text>
                    {loading ? (
                        <ActivityIndicator size="small" color={Brand.primary} style={{ marginTop: 20 }} />
                    ) : completedBookings.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
                            <Text style={s.emptyText}>Tamamlanan transfer yok</Text>
                        </View>
                    ) : (
                        completedBookings.map((b: any) => (
                            <View key={b.id} style={s.txCard}>
                                <View style={[s.txIcon, { backgroundColor: b.status === 'COMPLETED' ? '#ecfdf5' : '#fee2e2' }]}>
                                    <Ionicons
                                        name={b.status === 'COMPLETED' ? 'car-sport' : 'close-circle'}
                                        size={16}
                                        color={b.status === 'COMPLETED' ? '#059669' : '#ef4444'}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.txName}>{b.metadata?.pickup?.substring(0, 30) || 'Transfer'}</Text>
                                    <Text style={s.txDate}>{fmtDate(b.updatedAt || b.startDate)}</Text>
                                </View>
                                <Text style={[s.txAmount, b.status === 'COMPLETED' ? { color: '#059669' } : { color: '#ef4444' }]}>
                                    {b.status === 'COMPLETED' ? '+' : '-'}₺{Number(b.total || 0).toLocaleString('tr-TR')}
                                </Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
    title: { fontSize: 18, fontWeight: '800', color: '#fff' },
    subtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    balanceWrap: { alignItems: 'center', marginTop: 24 },
    balanceLabel: { fontSize: 12, color: '#94a3b8' },
    balanceAmount: { fontSize: 36, fontWeight: '800', color: '#6ee7b7', marginTop: 4 },
    changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    changeText: { fontSize: 12, color: '#6ee7b7', fontWeight: '500' },
    section: { paddingHorizontal: 16, marginTop: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
    chartCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
    chartTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
    chartBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 6 },
    barCol: { flex: 1, alignItems: 'center', gap: 6 },
    barBg: { width: '100%', backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
    barFill: { width: '100%', borderRadius: 6 },
    barLabel: { fontSize: 10, color: '#94a3b8' },
    statGrid: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
    statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    statNum: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
    statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
    emptyCard: { alignItems: 'center', padding: 40, gap: 10 },
    emptyText: { fontSize: 13, color: '#94a3b8' },
    txCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    txName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    txDate: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
    txAmount: { fontSize: 14, fontWeight: '700' },
});
