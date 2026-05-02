import React, { useEffect, useState, useCallback } from 'react';
import {
    StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl,
    Modal, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand, StatusColors } from '../constants/theme';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

const formatTRDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const toApiDate = (d: Date) => d.toISOString().split('T')[0];

export default function HistoryScreen() {
    const { token } = useAuth();
    const router = useRouter();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [total, setTotal] = useState(0);

    // Date filter state
    const [filterMode, setFilterMode] = useState<'all' | 'single' | 'range'>('all');
    const [singleDate, setSingleDate] = useState(new Date());
    const [rangeStart, setRangeStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; });
    const [rangeEnd, setRangeEnd] = useState(new Date());

    // Picker visibility
    const [showPicker, setShowPicker] = useState<'single' | 'rangeStart' | 'rangeEnd' | null>(null);

    useEffect(() => {
        fetchHistory(1, true);
    }, [filterMode, singleDate, rangeStart, rangeEnd]);

    const buildDateParams = () => {
        if (filterMode === 'single') return `&startDate=${toApiDate(singleDate)}&endDate=${toApiDate(singleDate)}`;
        if (filterMode === 'range') return `&startDate=${toApiDate(rangeStart)}&endDate=${toApiDate(rangeEnd)}`;
        return '';
    };

    const fetchHistory = async (requestPage: number = page, reset: boolean = false) => {
        if (loading && !reset) return;
        setLoading(true);
        try {
            const dateParams = buildDateParams();
            const res = await fetch(`${API_URL}/driver/history?page=${requestPage}&limit=10${dateParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                const pagination = json.pagination || {};
                setHasMore(pagination.hasMore !== undefined ? pagination.hasMore : json.data.length >= 10);
                setTotal(pagination.total || json.data.length);
                setJobs(prev => reset ? json.data : [...prev, ...json.data]);
                setPage(requestPage + 1);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = useCallback(() => {
        setPage(1);
        fetchHistory(1, true);
    }, [filterMode, singleDate, rangeStart, rangeEnd]);

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowPicker(null);
        if (!selectedDate) return;
        if (showPicker === 'single') setSingleDate(selectedDate);
        else if (showPicker === 'rangeStart') setRangeStart(selectedDate);
        else if (showPicker === 'rangeEnd') setRangeEnd(selectedDate);
    };

    const renderJobItem = ({ item }: { item: any }) => {
        const date = new Date(item.startDate);
        const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
        const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const from = item.metadata?.pickup || item.product?.transferData?.pickupZones?.[0]?.name || item.product?.fromName || 'Belirtilmemiş';
        const to = item.metadata?.dropoff || item.product?.transferData?.dropoffZones?.[0]?.name || item.product?.toName || 'Belirtilmemiş';
        const vehicle = item.product?.vehicle?.plateNumber || item.metadata?.vehicleType || '';
        const customerName = item.customer?.firstName ? `${item.customer.firstName} ${item.customer.lastName || ''}`.trim() : item.contactName || '';
        const pax = (item.adults || 0) + (item.children || 0) + (item.infants || 0);
        const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: item.status };

        return (
            <View style={s.card}>
                <View style={s.cardTop}>
                    <View style={s.dateCol}>
                        <View style={s.dateIconBox}>
                            <Ionicons name="calendar" size={14} color={Brand.primary} />
                        </View>
                        <View>
                            <Text style={s.dateText}>{dateStr}</Text>
                            <Text style={s.timeText}>{timeStr}</Text>
                        </View>
                    </View>
                    <View style={[s.statusChip, { backgroundColor: statusCfg.bg }]}>
                        <Text style={[s.statusChipText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
                    </View>
                </View>

                <View style={s.routeBox}>
                    <View style={s.routeDotsCol}>
                        <View style={[s.dot, { backgroundColor: '#22c55e' }]} />
                        <View style={s.routeDash} />
                        <View style={[s.dot, { backgroundColor: '#ef4444' }]} />
                    </View>
                    <View style={{ flex: 1, gap: 8 }}>
                        <Text style={s.locationText} numberOfLines={1}>{from}</Text>
                        <Text style={s.locationText} numberOfLines={1}>{to}</Text>
                    </View>
                </View>

                <View style={s.metaRow}>
                    {customerName ? (
                        <View style={s.metaChip}>
                            <Ionicons name="person" size={11} color="#6366f1" />
                            <Text style={s.metaText}>{customerName}</Text>
                        </View>
                    ) : null}
                    {pax > 0 && (
                        <View style={s.metaChip}>
                            <Ionicons name="people" size={11} color="#0ea5e9" />
                            <Text style={s.metaText}>{pax} Pax</Text>
                        </View>
                    )}
                    {vehicle ? (
                        <View style={s.metaChip}>
                            <Ionicons name="car" size={11} color="#f59e0b" />
                            <Text style={s.metaText}>{vehicle}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.safe} edges={['top']}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View>
                    <Text style={s.headerTitle}>Geçmiş Transferler</Text>
                    <Text style={s.headerSub}>{total} kayıt</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Filter Bar */}
            <View style={s.filterBar}>
                <View style={s.filterTabs}>
                    {(['all', 'single', 'range'] as const).map(m => (
                        <TouchableOpacity
                            key={m}
                            style={[s.filterTab, filterMode === m && s.filterTabActive]}
                            onPress={() => setFilterMode(m)}
                        >
                            <Ionicons
                                name={m === 'all' ? 'list' : m === 'single' ? 'today' : 'calendar'}
                                size={13}
                                color={filterMode === m ? '#4F46E5' : '#94A3B8'}
                            />
                            <Text style={[s.filterTabText, filterMode === m && s.filterTabTextActive]}>
                                {m === 'all' ? 'Tümü' : m === 'single' ? 'Tek Gün' : 'Aralık'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {filterMode === 'single' && (
                    <TouchableOpacity style={s.dateBtn} onPress={() => setShowPicker('single')}>
                        <Ionicons name="calendar-outline" size={16} color={Brand.primary} />
                        <Text style={s.dateBtnText}>{formatTRDate(singleDate)}</Text>
                    </TouchableOpacity>
                )}

                {filterMode === 'range' && (
                    <View style={s.rangeBtnRow}>
                        <TouchableOpacity style={s.dateBtn} onPress={() => setShowPicker('rangeStart')}>
                            <Text style={s.dateBtnText}>{formatTRDate(rangeStart)}</Text>
                        </TouchableOpacity>
                        <Ionicons name="arrow-forward" size={16} color="#94A3B8" />
                        <TouchableOpacity style={s.dateBtn} onPress={() => setShowPicker('rangeEnd')}>
                            <Text style={s.dateBtnText}>{formatTRDate(rangeEnd)}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* List */}
            <FlatList
                data={jobs}
                renderItem={renderJobItem}
                keyExtractor={(item: any) => item.id}
                contentContainerStyle={s.list}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={Brand.primary} />}
                onEndReached={() => { if (hasMore && !loading) fetchHistory(); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                    hasMore && jobs.length > 0 ? (
                        <View style={{ padding: 16, alignItems: 'center' }}>
                            <ActivityIndicator color={Brand.primary} />
                            <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>Daha fazla yükleniyor...</Text>
                        </View>
                    ) : jobs.length > 0 ? (
                        <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 11, padding: 16 }}>
                            Toplam {total} kayıt gösteriliyor
                        </Text>
                    ) : null
                }
                ListEmptyComponent={
                    !loading ? (
                        <View style={s.empty}>
                            <View style={s.emptyIcon}>
                                <Ionicons name="time-outline" size={40} color="#CBD5E1" />
                            </View>
                            <Text style={s.emptyTitle}>Transfer bulunamadı</Text>
                            <Text style={s.emptySub}>Seçili tarih aralığında tamamlanmış transfer yok.</Text>
                        </View>
                    ) : null
                }
            />

            {/* Date Picker */}
            {showPicker && (
                <DateTimePicker
                    value={showPicker === 'single' ? singleDate : showPicker === 'rangeStart' ? rangeStart : rangeEnd}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                />
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        backgroundColor: '#0f1d3d',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 16,
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
    headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },

    // Filter
    filterBar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 10 },
    filterTabs: { flexDirection: 'row', gap: 8 },
    filterTab: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10,
        backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    },
    filterTabActive: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
    filterTabText: { color: '#94A3B8', fontWeight: '600', fontSize: 12 },
    filterTabTextActive: { color: '#4F46E5' },
    dateBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
        paddingVertical: 8, paddingHorizontal: 14,
    },
    dateBtnText: { color: '#334155', fontWeight: '600', fontSize: 13 },
    rangeBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    // List
    list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },

    // Card
    card: {
        backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10,
        shadowColor: '#1E293B', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    dateCol: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dateIconBox: {
        width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF2FF',
        justifyContent: 'center', alignItems: 'center',
    },
    dateText: { fontWeight: '700', color: '#1E293B', fontSize: 13 },
    timeText: { fontWeight: '500', color: '#64748B', fontSize: 11, marginTop: 1 },
    statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    statusChipText: { fontWeight: '700', fontSize: 10, letterSpacing: 0.3 },

    // Route
    routeBox: { flexDirection: 'row', gap: 10, marginBottom: 12, paddingLeft: 4 },
    routeDotsCol: { alignItems: 'center', paddingTop: 4, gap: 2 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    routeDash: { width: 2, height: 12, backgroundColor: '#E2E8F0' },
    locationText: { fontSize: 13, fontWeight: '500', color: '#334155' },

    // Meta
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#F8FAFC', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8,
    },
    metaText: { fontSize: 11, color: '#475569', fontWeight: '600' },

    // Empty
    empty: { padding: 60, alignItems: 'center' },
    emptyIcon: {
        width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    emptyTitle: { color: '#475569', fontSize: 16, fontWeight: '700' },
    emptySub: { color: '#94A3B8', fontSize: 13, marginTop: 4, textAlign: 'center' },
});
