import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

// Replace with your actual IP
const API_URL = 'https://smarttransfer-backend-production.up.railway.app/api';

export default function HistoryScreen() {
    const { token } = useAuth();
    const router = useRouter();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/driver/history?page=${page}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                if (json.data.length < 20) setHasMore(false);
                setJobs(prev => page === 1 ? json.data : [...prev, ...json.data]);
                setPage(prev => prev + 1);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const renderJobItem = ({ item }: { item: any }) => {
        const date = new Date(item.startDate);
        const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Fallbacks
        const vehicle = item.product?.vehicle?.plateNumber || 'Plaka Yok';
        const from = item.product?.fromName || 'Belirtilmemiş';
        const to = item.product?.toName || 'Belirtilmemiş';
        const price = item.driverEarnings || 0; // Assuming we have this field or calculate it

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.dateText}>{dateStr} {timeStr}</Text>
                    <View style={[styles.statusBadge, item.status === 'CANCELLED' && styles.statusCancelled]}>
                        <Text style={[styles.statusText, item.status === 'CANCELLED' && styles.statusTextCancelled]}>
                            {item.status === 'COMPLETED' ? 'Tamamlandı' : 'İptal'}
                        </Text>
                    </View>
                </View>

                <View style={styles.routeContainer}>
                    <Text style={styles.locationText}>{from} ➔ {to}</Text>
                </View>

                <View style={styles.detailsContainer}>
                    <View style={styles.detailItem}>
                        <IconSymbol name="car.fill" size={14} color="#6b7280" />
                        <Text style={styles.detailText}>{vehicle}</Text>
                    </View>
                    <View style={styles.detailItem}>
                        <Text style={styles.priceText}>{price} ₺</Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <IconSymbol name="chevron.left" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.title}>Geçmiş Transferler</Text>
            </View>

            <FlatList
                data={jobs}
                renderItem={renderJobItem}
                keyExtractor={(item: any) => item.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setPage(1); fetchHistory(); }} />}
                onEndReached={() => { if (hasMore) fetchHistory(); }}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>Geçmiş transfer bulunamadı.</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        paddingTop: 60,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    backButton: {
        marginRight: 15,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    list: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 15,
        marginBottom: 15,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    dateText: {
        fontWeight: '600',
        color: '#374151',
        fontSize: 14,
    },
    statusBadge: {
        backgroundColor: '#ecfdf5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusCancelled: {
        backgroundColor: '#fef2f2',
    },
    statusText: {
        color: '#10b981',
        fontWeight: '600',
        fontSize: 12,
    },
    statusTextCancelled: {
        color: '#ef4444',
    },
    routeContainer: {
        marginBottom: 10,
    },
    locationText: {
        fontSize: 15,
        color: '#1f2937',
        fontWeight: '500',
    },
    detailsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        paddingTop: 10,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailText: {
        marginLeft: 5,
        color: '#6b7280',
        fontSize: 13,
    },
    priceText: {
        fontWeight: 'bold',
        color: '#111827',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#9ca3af',
        fontSize: 16,
    },
});
