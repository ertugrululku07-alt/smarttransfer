import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand, StatusColors } from '../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

export default function HistoryScreen() {
    const { token } = useAuth();
    const router = useRouter();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        fetchHistory(1, true);
    }, []);

    const fetchHistory = async (requestPage: number = page, reset: boolean = false) => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/driver/history?page=${requestPage}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                if (json.data.length < 20) setHasMore(false);
                else setHasMore(true);
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
    }, []);

    const renderJobItem = ({ item }: { item: any }) => {
        const date = new Date(item.startDate);
        const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
        const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        // Use metadata first, then product fallbacks
        const from = item.metadata?.pickup
            || item.product?.transferData?.pickupZones?.[0]?.name
            || item.product?.fromName
            || 'Belirtilmemiş';
        const to = item.metadata?.dropoff
            || item.product?.transferData?.dropoffZones?.[0]?.name
            || item.product?.toName
            || 'Belirtilmemiş';

        const vehicle = item.product?.vehicle?.plateNumber || item.metadata?.vehicleType || '';
        const customerName = item.customer?.firstName
            ? `${item.customer.firstName} ${item.customer.lastName || ''}`.trim()
            : item.contactName || '';
        const paxAdults = item.adults || 0;
        const paxChildren = item.children || 0;
        const paxInfants = item.infants || 0;
        const pax = paxAdults + paxChildren + paxInfants;
        const paxParts: string[] = [];
        if (paxAdults > 0) paxParts.push(`${paxAdults}Y`);
        if (paxChildren > 0) paxParts.push(`${paxChildren}Ç`);
        if (paxInfants > 0) paxParts.push(`${paxInfants}B`);

        const statusCfg = StatusColors[item.status] || { bg: '#f3f4f6', text: '#6b7280', label: item.status };

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.dateCol}>
                        <Ionicons name="calendar-outline" size={14} color={Brand.textSecondary} />
                        <Text style={styles.dateText}>{dateStr} {timeStr}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <Text style={[styles.statusText, { color: statusCfg.text }]}>
                            {statusCfg.label}
                        </Text>
                    </View>
                </View>

                <View style={styles.routeContainer}>
                    <View style={styles.routeRow}>
                        <View style={styles.circlePick} />
                        <Text style={styles.locationText} numberOfLines={1}>{from}</Text>
                    </View>
                    <View style={styles.lineV} />
                    <View style={styles.routeRow}>
                        <View style={styles.circleDrop} />
                        <Text style={styles.locationText} numberOfLines={1}>{to}</Text>
                    </View>
                </View>

                <View style={styles.detailsContainer}>
                    {customerName ? (
                        <View style={styles.detailItem}>
                            <Ionicons name="person-outline" size={13} color={Brand.textSecondary} />
                            <Text style={styles.detailText}>{customerName}</Text>
                        </View>
                    ) : null}
                    {pax > 0 && (
                        <View style={styles.detailItem}>
                            <Ionicons name="people-outline" size={13} color={Brand.textSecondary} />
                            <Text style={styles.detailText}>{pax} Pax{(paxChildren > 0 || paxInfants > 0) ? ` (${paxParts.join('+')})` : ''}</Text>
                        </View>
                    )}
                    {vehicle ? (
                        <View style={styles.detailItem}>
                            <Ionicons name="car-outline" size={13} color={Brand.textSecondary} />
                            <Text style={styles.detailText}>{vehicle}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Geçmiş Transferler</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={jobs}
                renderItem={renderJobItem}
                keyExtractor={(item: any) => item.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} />}
                onEndReached={() => { if (hasMore && !loading) fetchHistory(); }}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="time-outline" size={48} color={Brand.textLight} />
                            <Text style={styles.emptyText}>Geçmiş transfer bulunamadı.</Text>
                            <Text style={styles.emptySubText}>Tamamlanan transferleriniz burada görünecek.</Text>
                        </View>
                    ) : null
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Brand.background },

    header: {
        backgroundColor: Brand.headerBg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        shadowColor: Brand.headerBg,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    backBtn: { width: 40 },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

    list: {
        paddingHorizontal: 16,
        paddingVertical: 16,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    dateCol: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dateText: {
        fontWeight: '600',
        color: '#374151',
        fontSize: 13,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontWeight: '600',
        fontSize: 11,
    },
    routeContainer: {
        marginBottom: 12,
    },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    circlePick: {
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: Brand.success, marginRight: 10,
    },
    circleDrop: {
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: Brand.danger, marginRight: 10,
    },
    lineV: {
        width: 2, height: 14,
        backgroundColor: Brand.border, marginLeft: 4, marginBottom: 4,
    },
    locationText: {
        fontSize: 14,
        color: Brand.text,
        fontWeight: '500',
        flex: 1,
    },
    detailsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        borderTopWidth: 1,
        borderTopColor: Brand.borderLight,
        paddingTop: 10,
        gap: 14,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    detailText: {
        color: Brand.textSecondary,
        fontSize: 12,
    },
    emptyContainer: {
        padding: 60,
        alignItems: 'center',
    },
    emptyText: {
        color: Brand.textSecondary,
        fontSize: 16,
        fontWeight: '600',
        marginTop: 12,
    },
    emptySubText: {
        color: Brand.textMuted,
        fontSize: 13,
        marginTop: 4,
    },
});
