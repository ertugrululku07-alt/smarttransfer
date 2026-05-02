import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Linking, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { API_URL, Brand, StatusColors } from '../../constants/theme';
import Toast from 'react-native-toast-message';

export default function TransferDetailScreen() {
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { token } = useAuth();
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        const fetchBooking = async () => {
            try {
                const res = await fetch(`${API_URL}/transfer/bookings/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.success) setBooking(data.data);
            } catch (e) {
                console.warn('Fetch error:', e);
                Toast.show({ type: 'error', text1: 'Bağlantı Hatası' });
            } finally {
                setLoading(false);
            }
        };
        if (id && token) fetchBooking();
    }, [id, token]);

    const handleAction = async (status: string, subStatus: string, label: string) => {
        setActionLoading(status);
        try {
            const res = await fetch(`${API_URL}/transfer/bookings/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, subStatus }),
            });
            const data = await res.json();
            if (data.success) {
                Toast.show({ type: 'success', text1: label, text2: 'İşlem başarılı' });
                if (status === 'COMPLETED') {
                    router.back();
                } else {
                    setBooking({ ...booking, status, operationalStatus: subStatus });
                }
            } else {
                Toast.show({ type: 'error', text1: 'Hata', text2: data.error });
            }
        } catch {
            Toast.show({ type: 'error', text1: 'Bağlantı Hatası' });
        } finally {
            setActionLoading(null);
        }
    };

    const fmtDate = (iso: string) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <View style={[s.centerWrap, { paddingTop: insets.top }]}>
                <ActivityIndicator size="large" color={Brand.primary} />
                <Text style={s.loadingText}>Yükleniyor...</Text>
            </View>
        );
    }

    if (!booking) {
        return (
            <View style={[s.centerWrap, { paddingTop: insets.top }]}>
                <Ionicons name="alert-circle-outline" size={48} color="#cbd5e1" />
                <Text style={s.emptyTitle}>Rezervasyon Bulunamadı</Text>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Text style={s.backBtnText}>Geri Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const statusInfo = StatusColors[booking.status] || { bg: '#f1f5f9', text: '#64748b', label: booking.status };
    const isActive = booking.status === 'CONFIRMED' &&
        (booking.operationalStatus === 'IN_OPERATION' || booking.operationalStatus === 'PARTNER_ACCEPTED');

    return (
        <View style={[s.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity style={s.backIcon} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={18} color="#334155" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Transfer Detayı</Text>
                <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
                    <Text style={[s.statusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Map Placeholder */}
                <LinearGradient colors={['#e0e7ff', '#c7d2fe']} style={s.mapArea}>
                    <View style={s.mapContent}>
                        <View style={s.mapIcon}>
                            <Ionicons name="car-sport" size={18} color="#059669" />
                        </View>
                        <View>
                            <Text style={s.mapTitle}>Transfer Rotası</Text>
                            <Text style={s.mapSub}>Navigasyonu başlatmak için aşağıdaki butonu kullanın</Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* Customer Info */}
                <View style={s.section}>
                    <View style={s.customerCard}>
                        <View style={s.customerRow}>
                            <Image
                                source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(booking.contactName || 'M')}&background=10b981&color=fff` }}
                                style={s.customerAvatar}
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={s.customerName}>{booking.contactName || 'Müşteri'}</Text>
                                {booking.contactPhone && (
                                    <Text style={s.customerPhone}>{booking.contactPhone}</Text>
                                )}
                            </View>
                            <View style={s.actionBtns}>
                                <TouchableOpacity
                                    style={[s.actionCircle, { backgroundColor: '#059669' }]}
                                    onPress={() => booking.contactPhone && Linking.openURL(`tel:${booking.contactPhone}`)}
                                >
                                    <Ionicons name="call" size={16} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.actionCircle, { backgroundColor: '#3b82f6' }]}
                                    onPress={() => booking.contactPhone && Linking.openURL(`sms:${booking.contactPhone}`)}
                                >
                                    <Ionicons name="chatbubble" size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={s.infoGrid}>
                            <View style={s.infoItem}>
                                <Ionicons name="people" size={14} color="#059669" />
                                <Text style={s.infoLabel}>Yolcu</Text>
                                <Text style={s.infoValue}>{booking.passengerCount || booking.metadata?.pax || '1'} Kişi</Text>
                            </View>
                            <View style={s.infoItem}>
                                <Ionicons name="briefcase" size={14} color="#3b82f6" />
                                <Text style={s.infoLabel}>Bavul</Text>
                                <Text style={s.infoValue}>{booking.metadata?.luggage || '-'}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Route */}
                <View style={s.section}>
                    <View style={s.routeCard}>
                        <Text style={s.routeCardTitle}>Rota Bilgileri</Text>
                        <View style={s.routeWrap}>
                            <View style={s.routeLine}>
                                <View style={[s.routeDot, { backgroundColor: '#10b981' }]}>
                                    <View style={s.routeDotInner} />
                                </View>
                                <View style={s.routeDash} />
                                <View style={[s.routeDot, { backgroundColor: '#ef4444' }]}>
                                    <View style={s.routeDotInner} />
                                </View>
                            </View>
                            <View style={s.routeTexts}>
                                <View style={s.routeItem}>
                                    <View style={s.routeItemHead}>
                                        <Text style={[s.routeLabel, { color: '#059669' }]}>ALIŞ NOKTASI</Text>
                                        <Text style={s.routeTime}>{fmtDate(booking.startDate)}</Text>
                                    </View>
                                    <Text style={s.routeAddr}>{booking.metadata?.pickup || booking.pickupAddress || '-'}</Text>
                                </View>
                                <View style={s.routeItem}>
                                    <View style={s.routeItemHead}>
                                        <Text style={[s.routeLabel, { color: '#ef4444' }]}>VARIŞ NOKTASI</Text>
                                    </View>
                                    <Text style={s.routeAddr}>{booking.metadata?.dropoff || booking.dropoffAddress || '-'}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={s.routeFooter}>
                            <View style={s.routeStat}>
                                <Ionicons name="navigate" size={12} color="#059669" />
                                <Text style={s.routeStatText}>{booking.metadata?.distance || '-'}</Text>
                            </View>
                            <View style={s.routeStat}>
                                <Ionicons name="time" size={12} color="#3b82f6" />
                                <Text style={s.routeStatText}>{booking.metadata?.estimatedDuration || '-'}</Text>
                            </View>
                            {booking.metadata?.flightNumber && (
                                <View style={[s.routeStat, { backgroundColor: '#eff6ff' }]}>
                                    <Ionicons name="airplane" size={12} color="#2563eb" />
                                    <Text style={[s.routeStatText, { color: '#2563eb' }]}>{booking.metadata.flightNumber}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Payment */}
                <View style={s.section}>
                    <LinearGradient colors={['#059669', '#10b981']} style={s.paymentCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <View style={s.paymentRow}>
                            <Text style={s.paymentLabel}>Transfer Ücreti</Text>
                            <Text style={s.paymentMethod}>{booking.paymentMethod === 'CASH' ? 'Nakit' : 'Havale'}</Text>
                        </View>
                        <View style={s.paymentRow}>
                            <Text style={s.paymentAmount}>₺{Number(booking.total || 0).toLocaleString('tr-TR')}</Text>
                        </View>
                    </LinearGradient>
                </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={[s.actionBar, { paddingBottom: insets.bottom + 16 }]}>
                {booking.status === 'PENDING' && (
                    <>
                        <TouchableOpacity
                            style={[s.actionBtnFull, { backgroundColor: '#0f172a' }]}
                            onPress={() => handleAction('CONFIRMED', 'PARTNER_ACCEPTED', 'Kabul Edildi')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'CONFIRMED' ? <ActivityIndicator color="#fff" /> : (
                                <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={s.actionBtnText}>Transferi Kabul Et</Text></>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.actionBtnFull, { backgroundColor: '#fee2e2' }]}
                            onPress={() => Alert.alert('Reddet', 'Transferi reddetmek istiyor musunuz?', [
                                { text: 'İptal' },
                                { text: 'Reddet', style: 'destructive', onPress: () => handleAction('CANCELLED', 'PARTNER_REJECTED', 'Reddedildi') }
                            ])}
                            disabled={!!actionLoading}
                        >
                            <Ionicons name="close-circle" size={18} color="#ef4444" />
                            <Text style={[s.actionBtnText, { color: '#ef4444' }]}>Reddet</Text>
                        </TouchableOpacity>
                    </>
                )}
                {isActive && (
                    <TouchableOpacity
                        style={[s.actionBtnFull, { backgroundColor: '#059669' }]}
                        onPress={() => handleAction('COMPLETED', 'COMPLETED', 'Tamamlandı')}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'COMPLETED' ? <ActivityIndicator color="#fff" /> : (
                            <><Ionicons name="checkmark-done-circle" size={18} color="#fff" /><Text style={s.actionBtnText}>Transferi Tamamla</Text></>
                        )}
                    </TouchableOpacity>
                )}
                {booking.status === 'CONFIRMED' && !isActive && (
                    <TouchableOpacity
                        style={[s.actionBtnFull, { backgroundColor: '#0f172a' }]}
                        onPress={() => {
                            const pickup = booking.metadata?.pickup || booking.pickupAddress;
                            if (pickup) {
                                Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pickup)}`);
                            }
                        }}
                    >
                        <Ionicons name="navigate" size={18} color="#10b981" />
                        <Text style={s.actionBtnText}>Navigasyonu Aç</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc' },
    loadingText: { fontSize: 13, color: '#94a3b8' },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#64748b' },
    backBtn: { backgroundColor: '#059669', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
    backBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    backIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 11, fontWeight: '600' },
    mapArea: { height: 140, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    mapContent: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
    mapIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ecfdf5', justifyContent: 'center', alignItems: 'center' },
    mapTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
    mapSub: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
    section: { paddingHorizontal: 16, marginTop: 12 },
    customerCard: { backgroundColor: '#f8fafc', borderRadius: 18, padding: 16 },
    customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    customerAvatar: { width: 52, height: 52, borderRadius: 26 },
    customerName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
    customerPhone: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    actionBtns: { flexDirection: 'row', gap: 8 },
    actionCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
    infoGrid: { flexDirection: 'row', gap: 12 },
    infoItem: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    infoLabel: { fontSize: 10, color: '#94a3b8' },
    infoValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
    routeCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
    routeCardTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
    routeWrap: { flexDirection: 'row', gap: 14 },
    routeLine: { alignItems: 'center', paddingVertical: 4 },
    routeDot: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 },
    routeDotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
    routeDash: { width: 2, flex: 1, backgroundColor: '#e2e8f0', marginVertical: 4 },
    routeTexts: { flex: 1, justifyContent: 'space-between', gap: 20 },
    routeItem: {},
    routeItemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    routeLabel: { fontSize: 10, fontWeight: '700' },
    routeTime: { fontSize: 10, backgroundColor: '#f1f5f9', color: '#64748b', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    routeAddr: { fontSize: 13, color: '#334155', fontWeight: '500', lineHeight: 18 },
    routeFooter: { flexDirection: 'row', gap: 8, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    routeStat: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    routeStatText: { fontSize: 11, color: '#64748b', fontWeight: '500' },
    paymentCard: { borderRadius: 18, padding: 18 },
    paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    paymentLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
    paymentMethod: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
    paymentAmount: { fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 4 },
    actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
    actionBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
