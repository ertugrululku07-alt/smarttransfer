import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Platform, Linking, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Brand, StatusColors } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

export default function JobDetailScreen() {
    const { id } = useLocalSearchParams();
    const { token } = useAuth();
    const router = useRouter();
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchJobDetails();
    }, [id]);

    const fetchJobDetails = async () => {
        try {
            // Try detail endpoint first, fallback to list+filter
            const res = await fetch(`${API_URL}/driver/bookings/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success && json.data) {
                setJob(json.data);
            } else {
                // Fallback: fetch list and filter (for backward compatibility)
                const listRes = await fetch(`${API_URL}/driver/bookings?type=all`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const listJson = await listRes.json();
                if (listJson.success) {
                    const found = listJson.data.find((j: any) => j.id === id);
                    setJob(found || null);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (status: string) => {
        try {
            const res = await fetch(`${API_URL}/driver/bookings/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            const json = await res.json();
            if (json.success) {
                setJob({ ...job, status });
                Alert.alert('Başarılı', `Durum güncellendi: ${StatusColors[status]?.label || status}`);
            }
        } catch (e) {
            Alert.alert('Hata', 'Durum güncellenirken bir sorun oluştu.');
        }
    };

    const openNavigation = (lat: number, lng: number, address?: string) => {
        if (lat && lng && lat !== 0 && lng !== 0) {
            const latLng = `${lat},${lng}`;
            const label = 'Müşteri';
            const url = Platform.select({
                ios: `maps:0,0?q=${label}@${latLng}`,
                android: `geo:0,0?q=${latLng}(${label})`
            });
            Linking.openURL(url!);
        } else if (address && address !== 'Belirtilmemiş') {
            const url = Platform.select({
                ios: `maps:0,0?q=${encodeURIComponent(address)}`,
                android: `geo:0,0?q=${encodeURIComponent(address)}`
            });
            Linking.openURL(url!);
        } else {
            Alert.alert('Konum Yok', 'Bu transfer için konum bilgisi bulunamadı.');
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Brand.primary} />
                <Text style={styles.loadingText}>Yükleniyor...</Text>
            </View>
        );
    }

    if (!job) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={48} color={Brand.textMuted} />
                <Text style={styles.notFoundText}>Transfer bulunamadı.</Text>
                <Text style={styles.notFoundSub}>Bu kayıt silinmiş veya size atanmamış olabilir.</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
                    <Ionicons name="chevron-back" size={18} color={Brand.primary} />
                    <Text style={styles.backLinkText}>Geri Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const vehicle = job.metadata?.vehicleType || job.product?.name?.tr || job.product?.name?.en || job.product?.vehicle?.plateNumber || 'Araç Bilgisi Yok';
    const from = job.metadata?.pickup || job.pickup?.location || job.product?.transferData?.pickupZones?.[0]?.name || 'Belirtilmemiş';
    const to = job.metadata?.dropoff || job.dropoff?.location || job.product?.transferData?.dropoffZones?.[0]?.name || 'Belirtilmemiş';
    const pickupLat = job.metadata?.pickupLat || job.pickup?.lat || job.product?.transferData?.pickupZones?.[0]?.lat || 0;
    const pickupLng = job.metadata?.pickupLng || job.pickup?.lng || job.product?.transferData?.pickupZones?.[0]?.lng || 0;

    const date = new Date(job.startDate);
    const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const statusCfg = StatusColors[job.status] || { bg: '#f3f4f6', text: '#6b7280', label: job.status };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Transfer Detayı</Text>
                <View style={{ width: 40 }}>
                    <Text style={styles.bookingNo}>#{job.bookingNumber || job.id?.substring(0, 6)}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                {/* Status Card */}
                <View style={[styles.statusCard, { borderLeftColor: statusCfg.text }]}>
                    <View style={[styles.statusBadgeLg, { backgroundColor: statusCfg.bg }]}>
                        <Text style={[styles.statusTextLg, { color: statusCfg.text }]}>{statusCfg.label}</Text>
                    </View>
                    <Text style={styles.statusDate}>{dateStr} • {timeStr}</Text>
                </View>

                {/* Route Info */}
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Ionicons name="map-outline" size={16} color={Brand.primary} />
                        <Text style={styles.sectionTitle}>Güzergah</Text>
                    </View>
                    <View style={styles.routeContainer}>
                        <View style={styles.routeRow}>
                            <View style={styles.circlePick} />
                            <Text style={styles.locationText}>{from}</Text>
                        </View>
                        <View style={styles.lineV} />
                        <View style={styles.routeRow}>
                            <View style={styles.circleDrop} />
                            <Text style={styles.locationText}>{to}</Text>
                        </View>
                    </View>
                </View>

                {/* Customer Info */}
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Ionicons name="person-outline" size={16} color={Brand.primary} />
                        <Text style={styles.sectionTitle}>Müşteri Bilgileri</Text>
                    </View>
                    <InfoRow icon="person" value={`${job.customer?.firstName || ''} ${job.customer?.lastName || ''}`} />
                    <InfoRow
                        icon="call"
                        value={job.customer?.phone || 'Telefon Yok'}
                        onPress={job.customer?.phone ? () => Linking.openURL(`tel:${job.customer.phone}`) : undefined}
                        highlight={!!job.customer?.phone}
                    />
                    <InfoRow icon="people" value={`${job.adults || 0} Yetişkin, ${job.children || 0} Çocuk`} />
                    {(job.flightNumber || job.metadata?.flightNumber) && (
                        <InfoRow icon="airplane" value={job.flightNumber || job.metadata?.flightNumber} />
                    )}
                    {vehicle && <InfoRow icon="car" value={vehicle} />}
                    {job.notes && <InfoRow icon="document-text" value={job.notes} />}
                </View>

                {/* Status Actions */}
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Ionicons name="flag-outline" size={16} color={Brand.primary} />
                        <Text style={styles.sectionTitle}>Operasyon Durumu</Text>
                    </View>

                    {(job.status === 'CONFIRMED' || job.status === 'ASSIGNED') && (
                        <TouchableOpacity style={[styles.fullBtn, { backgroundColor: Brand.success }]} onPress={() => updateStatus('IN_PROGRESS')}>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.fullBtnText}>Müşteri Alındı</Text>
                        </TouchableOpacity>
                    )}

                    {job.status === 'IN_PROGRESS' && (
                        <TouchableOpacity style={[styles.fullBtn, { backgroundColor: Brand.danger }]} onPress={() => updateStatus('COMPLETED')}>
                            <Ionicons name="stop-circle" size={20} color="#fff" />
                            <Text style={styles.fullBtnText}>Transferi Bitir</Text>
                        </TouchableOpacity>
                    )}

                    {job.status === 'COMPLETED' && (
                        <View style={[styles.fullBtn, { backgroundColor: Brand.success, opacity: 0.7 }]}>
                            <Ionicons name="checkmark-done" size={20} color="#fff" />
                            <Text style={styles.fullBtnText}>Tamamlandı ✓</Text>
                        </View>
                    )}

                    {job.status === 'CANCELLED' && (
                        <View style={[styles.fullBtn, { backgroundColor: Brand.danger, opacity: 0.7 }]}>
                            <Ionicons name="close-circle" size={20} color="#fff" />
                            <Text style={styles.fullBtnText}>İptal Edildi</Text>
                        </View>
                    )}
                </View>

                {/* Navigation Button */}
                <TouchableOpacity style={styles.mapButton} onPress={() => openNavigation(pickupLat, pickupLng, from)}>
                    <Ionicons name="navigate" size={22} color="#fff" />
                    <Text style={styles.mapButtonText}>Navigasyonu Başlat</Text>
                </TouchableOpacity>

            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ icon, value, onPress, highlight }: { icon: string; value: string; onPress?: () => void; highlight?: boolean }) {
    const content = (
        <View style={styles.infoRow}>
            <View style={styles.infoIconWrap}>
                <Ionicons name={icon as any} size={16} color={Brand.primary} />
            </View>
            <Text style={[styles.infoText, highlight && { color: Brand.primary, fontWeight: '600' }]}>{value}</Text>
            {onPress && <Ionicons name="chevron-forward" size={14} color={Brand.textMuted} />}
        </View>
    );
    return onPress ? <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity> : content;
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Brand.background },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Brand.background,
        padding: 20,
    },
    loadingText: { color: Brand.textSecondary, marginTop: 12, fontSize: 14 },
    notFoundText: { fontSize: 18, fontWeight: '700', color: Brand.text, marginTop: 16 },
    notFoundSub: { fontSize: 13, color: Brand.textSecondary, textAlign: 'center', marginTop: 6 },
    backLink: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        marginTop: 20, padding: 10,
    },
    backLinkText: { color: Brand.primary, fontWeight: '600', fontSize: 15 },

    // Header
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
    bookingNo: { color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'right' },

    content: { padding: 16, paddingBottom: 40 },

    // Status Card
    statusCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    statusBadgeLg: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 10,
    },
    statusTextLg: { fontWeight: '700', fontSize: 13 },
    statusDate: { color: Brand.textSecondary, fontSize: 13, fontWeight: '500' },

    // Cards
    card: {
        backgroundColor: 'white',
        borderRadius: 18,
        padding: 18,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    cardTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Brand.text,
    },
    routeContainer: {},
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    circlePick: {
        width: 12, height: 12, borderRadius: 6,
        backgroundColor: Brand.success, marginRight: 12,
    },
    circleDrop: {
        width: 12, height: 12, borderRadius: 6,
        backgroundColor: Brand.danger, marginRight: 12,
    },
    lineV: {
        width: 2, height: 18,
        backgroundColor: Brand.border, marginLeft: 5, marginBottom: 4,
    },
    locationText: {
        fontSize: 15,
        color: Brand.text,
        fontWeight: '500',
        flex: 1,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Brand.borderLight,
        gap: 12,
    },
    infoIconWrap: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: '#eff3ff',
        justifyContent: 'center', alignItems: 'center',
    },
    infoText: {
        fontSize: 14,
        color: '#4b5563',
        flex: 1,
    },

    // Action Buttons
    fullBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    fullBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
    mapButton: {
        backgroundColor: Brand.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 10,
        shadowColor: Brand.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    mapButtonText: {
        color: 'white',
        fontSize: 17,
        fontWeight: '700',
    },
});
