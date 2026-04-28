import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Platform, Linking, ActivityIndicator, Alert, Modal, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Brand, StatusColors } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

const NO_SHOW_REASON_LABELS: Record<string, string> = {
    CUSTOMER_NOT_FOUND: 'Müşteri buluşma noktasında değildi',
    CUSTOMER_NO_RESPONSE: 'Müşteri telefonu açmadı',
    WRONG_LOCATION: 'Yanlış adres / lokasyon',
    CUSTOMER_REFUSED: 'Müşteri transferi kabul etmedi',
    OTHER: 'Diğer',
};

export default function JobDetailScreen() {
    const { id } = useLocalSearchParams();
    const { token } = useAuth();
    const router = useRouter();
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [paymentModal, setPaymentModal] = useState(false);
    const [collectedAmount, setCollectedAmount] = useState('');
    const [collectedCurrency, setCollectedCurrency] = useState('TRY');
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [tenantCurrencies, setTenantCurrencies] = useState<string[]>(['TRY', 'EUR', 'USD']);
    const [defaultCurrency, setDefaultCurrency] = useState('TRY');
    // ── No-Show ──
    const [noShowModal, setNoShowModal] = useState(false);
    const [noShowReason, setNoShowReason] = useState('CUSTOMER_NOT_FOUND');
    const [noShowDescription, setNoShowDescription] = useState('');
    const [noShowPhoto, setNoShowPhoto] = useState<string | null>(null);
    const [noShowSaving, setNoShowSaving] = useState(false);

    useEffect(() => {
        // Fetch tenant currencies on mount
        (async () => {
            try {
                const res = await fetch(`${API_URL}/driver/currencies`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.success && json.data) {
                    setTenantCurrencies(json.data.currencies || ['TRY', 'EUR', 'USD']);
                    setDefaultCurrency(json.data.defaultCurrency || 'TRY');
                }
            } catch (e) { console.warn('Failed to fetch currencies', e); }
        })();
    }, []);

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
            let loaded: any = null;
            if (json.success && json.data) {
                loaded = json.data;
            } else {
                // Fallback: fetch list and filter (for backward compatibility)
                const listRes = await fetch(`${API_URL}/driver/bookings?type=all`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const listJson = await listRes.json();
                if (listJson.success) {
                    loaded = listJson.data.find((j: any) => j.id === id) || null;
                }
            }
            setJob(loaded);

            // ── Auto-acknowledge: detayı açtığı an "okundu" işaretle ──
            // Yalnızca henüz okunmamış ve transfer sürmüyor/tamamlanmamışsa.
            if (loaded && !loaded.acknowledgedAt && !loaded.metadata?.acknowledgedAt
                && (loaded.status === 'CONFIRMED' || loaded.status === 'ASSIGNED')) {
                try {
                    await fetch(`${API_URL}/driver/bookings/${id}/acknowledge`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    // Local state güncelle (admin'de anında görünmesi için socket zaten emit ediyor)
                    setJob((prev: any) => prev ? {
                        ...prev,
                        acknowledgedAt: new Date().toISOString(),
                        metadata: { ...(prev.metadata || {}), acknowledgedAt: new Date().toISOString() }
                    } : prev);
                } catch (ackErr) {
                    // Sessiz: okundu işareti kritik değil
                    console.warn('Auto-acknowledge failed', ackErr);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // ── No-Show: foto + açıklama + zaman damgası ──
    const pickNoShowPhoto = async () => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                // Kamera izni yoksa galeriden seç
                const galleryPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!galleryPerm.granted) {
                    Alert.alert('İzin Gerekli', 'Foto çekmek için kamera veya galeri izni gerekli.');
                    return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.6,
                    base64: true,
                });
                if (!result.canceled && result.assets[0]) {
                    const asset = result.assets[0];
                    setNoShowPhoto(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
                }
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.6,
                base64: true,
            });
            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                setNoShowPhoto(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
            }
        } catch (e: any) {
            Alert.alert('Hata', 'Foto alınamadı: ' + (e?.message || ''));
        }
    };

    const submitNoShow = async () => {
        if (!noShowReason) {
            Alert.alert('Uyarı', 'Lütfen bir sebep seçin');
            return;
        }
        setNoShowSaving(true);
        try {
            const res = await fetch(`${API_URL}/driver/bookings/${id}/no-show`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: noShowReason,
                    description: noShowDescription || null,
                    photo: noShowPhoto || null,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                Alert.alert('Hata', json.error || 'No-Show kaydedilemedi');
                return;
            }
            setJob({ ...job, status: 'NO_SHOW' });
            setNoShowModal(false);
            setNoShowReason('CUSTOMER_NOT_FOUND');
            setNoShowDescription('');
            setNoShowPhoto(null);
            Alert.alert(
                '✓ No-Show Kaydedildi',
                `Müşteri gelmedi olarak işaretlendi.\nZaman: ${new Date().toLocaleString('tr-TR')}\nDelil olarak admin paneline iletildi.`
            );
        } catch (e) {
            Alert.alert('Hata', 'Bağlantı hatası');
        } finally {
            setNoShowSaving(false);
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

    const handlePickup = () => {
        const method = job.metadata?.paymentMethod;
        const total = Number(job.total || 0);
        const currency = job.currency || defaultCurrency || 'TRY';
        if (method === 'PAY_IN_VEHICLE') {
            setPaymentModal(true);
            setCollectedAmount(String(total));
            setCollectedCurrency(currency);
        } else {
            updateStatus('IN_PROGRESS');
        }
    };

    const submitPaymentAndPickup = async () => {
        const amount = parseFloat(collectedAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Uyarı', 'Lütfen geçerli bir tutar girin.');
            return;
        }
        setPaymentSaving(true);
        try {
            const payRes = await fetch(`${API_URL}/driver/bookings/${id}/payment-received`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ collectedAmount: amount, collectedCurrency })
            });
            const payJson = await payRes.json();
            if (!payJson.success) {
                Alert.alert('Hata', payJson.error || 'Ödeme kaydedilemedi');
                setPaymentSaving(false);
                return;
            }
            await updateStatus('IN_PROGRESS');
            Alert.alert('Başarılı', `${amount} ${collectedCurrency} ödeme alındı.`);
            setPaymentModal(false);
        } catch {
            Alert.alert('Hata', 'Bağlantı hatası');
        } finally {
            setPaymentSaving(false);
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
                    <InfoRow icon="person" value={
                        job.contactName
                            ? job.contactName
                            : `${job.customer?.firstName || ''} ${job.customer?.lastName || ''}`.trim() || 'Belirtilmemiş'
                    } />
                    <InfoRow
                        icon="call"
                        value={job.contactPhone || job.customer?.phone || 'Telefon Yok'}
                        onPress={(job.contactPhone || job.customer?.phone) ? () => Linking.openURL(`tel:${job.contactPhone || job.customer?.phone}`) : undefined}
                        highlight={!!(job.contactPhone || job.customer?.phone)}
                    />
                    {(job.contactEmail || job.customer?.email) ? (
                        <InfoRow icon="mail" value={job.contactEmail || job.customer?.email} />
                    ) : null}
                    <InfoRow icon="people" value={(() => {
                        const a = job.adults || 0;
                        const c = job.children || 0;
                        const inf = job.infants || 0;
                        const total = a + c + inf;
                        const parts: string[] = [];
                        if (a > 0) parts.push(`${a} Yetişkin`);
                        if (c > 0) parts.push(`${c} Çocuk`);
                        if (inf > 0) parts.push(`${inf} Bebek`);
                        return `${total} Yolcu${parts.length > 1 ? ` (${parts.join(', ')})` : (parts.length === 1 ? ` (${parts[0]})` : '')}`;
                    })()} />
                    {(job.flightNumber || job.metadata?.flightNumber) && (
                        <InfoRow icon="airplane" value={job.flightNumber || job.metadata?.flightNumber} />
                    )}
                    {vehicle && <InfoRow icon="car" value={vehicle} />}
                    {(job.specialRequests || job.notes) && <InfoRow icon="document-text" value={job.specialRequests || job.notes} />}
                </View>

                {/* Extra Services */}
                {(job.metadata?.extraServices?.length > 0) && (
                    <View style={styles.card}>
                        <View style={styles.cardTitleRow}>
                            <Ionicons name="star-outline" size={16} color="#d97706" />
                            <Text style={styles.sectionTitle}>Ekstra Hizmetler</Text>
                        </View>
                        <View style={styles.extrasContainer}>
                            {job.metadata.extraServices.map((ex: any, i: number) => {
                                const qty = ex?.quantity || ex?.qty || 1;
                                const name = ex?.name || ex?.label || ex || 'Özel Hizmet';
                                return (
                                    <View key={i} style={[styles.extraChip, { backgroundColor: '#ffe4e6', borderColor: '#fda4af' }]}>
                                        <Ionicons name="alert-circle" size={16} color="#e11d48" />
                                        <Text style={[styles.extraChipText, { color: '#e11d48', fontSize: 15 }]}>{qty} Adet: {name}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Status Actions */}
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Ionicons name="flag-outline" size={16} color={Brand.primary} />
                        <Text style={styles.sectionTitle}>Operasyon Durumu</Text>
                    </View>

                    {(job.status === 'CONFIRMED' || job.status === 'ASSIGNED') && (
                        <>
                            {/* Okundu indicator (auto-set) */}
                            {(job.acknowledgedAt || job.metadata?.acknowledgedAt) && (
                                <View style={styles.readBadge}>
                                    <Ionicons name="eye" size={14} color="#3b82f6" />
                                    <Text style={styles.readBadgeText}>Okundu (otomatik)</Text>
                                </View>
                            )}
                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: Brand.success, flex: 2 }]}
                                    onPress={handlePickup}
                                >
                                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                                    <Text style={styles.actionBtnText}>Müşteri Alındı</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: Brand.danger, flex: 1 }]}
                                    onPress={() => setNoShowModal(true)}
                                >
                                    <Ionicons name="person-remove" size={18} color="#fff" />
                                    <Text style={styles.actionBtnText}>No-Show</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    {job.status === 'NO_SHOW' && (
                        <View style={[styles.fullBtn, { backgroundColor: Brand.danger, opacity: 0.9 }]}>
                            <Ionicons name="person-remove" size={20} color="#fff" />
                            <Text style={styles.fullBtnText}>Müşteri Gelmedi (No-Show)</Text>
                        </View>
                    )}
                    {job.status === 'NO_SHOW' && job.metadata?.noShowReportedAt && (
                        <View style={styles.noShowEvidence}>
                            <Text style={styles.noShowEvidenceTitle}>📋 No-Show Kaydı</Text>
                            <Text style={styles.noShowEvidenceLine}>
                                <Text style={styles.noShowEvidenceLabel}>Zaman: </Text>
                                {new Date(job.metadata.noShowReportedAt).toLocaleString('tr-TR')}
                            </Text>
                            {job.metadata.noShowReason && (
                                <Text style={styles.noShowEvidenceLine}>
                                    <Text style={styles.noShowEvidenceLabel}>Sebep: </Text>
                                    {NO_SHOW_REASON_LABELS[job.metadata.noShowReason] || job.metadata.noShowReason}
                                </Text>
                            )}
                            {job.metadata.noShowDescription && (
                                <Text style={styles.noShowEvidenceLine}>
                                    <Text style={styles.noShowEvidenceLabel}>Açıklama: </Text>
                                    {job.metadata.noShowDescription}
                                </Text>
                            )}
                            {job.metadata.noShowPhoto && (
                                <Image
                                    source={{ uri: job.metadata.noShowPhoto }}
                                    style={styles.noShowPhotoPreview}
                                    resizeMode="cover"
                                />
                            )}
                        </View>
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

            {/* Payment Collection Modal */}
            <Modal visible={paymentModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Ödeme Tahsilatı</Text>
                            <TouchableOpacity onPress={() => setPaymentModal(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.payExpectedRow}>
                            <Ionicons name="cash-outline" size={20} color="#059669" />
                            <Text style={styles.payExpectedLabel}>Alınması Gereken Tutar:</Text>
                        </View>
                        <Text style={styles.payExpectedAmount}>
                            {Number(job?.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {job?.currency || 'TRY'}
                        </Text>
                        <Text style={styles.modalLabel}>Alınan Tutar</Text>
                        <TextInput
                            style={styles.payAmountInput}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            value={collectedAmount}
                            onChangeText={setCollectedAmount}
                        />
                        <Text style={styles.modalLabel}>Para Birimi</Text>
                        <View style={styles.currencyRow}>
                            {tenantCurrencies.map(c => (
                                <TouchableOpacity
                                    key={c}
                                    style={[styles.currencyChip, collectedCurrency === c && styles.currencyChipActive]}
                                    onPress={() => setCollectedCurrency(c)}
                                >
                                    <Text style={[styles.currencyChipText, collectedCurrency === c && styles.currencyChipTextActive]}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity style={styles.modalCancel} onPress={() => setPaymentModal(false)}>
                                <Text style={styles.modalCancelText}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalSubmit, { backgroundColor: '#059669' }, paymentSaving && { opacity: 0.6 }]}
                                onPress={submitPaymentAndPickup}
                                disabled={paymentSaving}
                            >
                                {paymentSaving
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <>
                                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                                        <Text style={styles.modalSubmitText}>Ödeme Alındı</Text>
                                    </>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ════════ NO-SHOW MODAL ════════ */}
            <Modal visible={noShowModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Ionicons name="person-remove" size={22} color={Brand.danger} />
                                    <Text style={styles.modalTitle}>Müşteri Gelmedi (No-Show)</Text>
                                </View>
                                <TouchableOpacity onPress={() => setNoShowModal(false)}>
                                    <Ionicons name="close" size={24} color="#64748b" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.noShowWarn}>
                                <Ionicons name="warning" size={16} color="#92400e" />
                                <Text style={styles.noShowWarnText}>
                                    Bu kayıt admin paneline delil olarak iletilir. Zaman damgası otomatik kaydedilir.
                                </Text>
                            </View>

                            <Text style={styles.modalLabel}>Sebep *</Text>
                            <View style={{ gap: 6 }}>
                                {Object.entries(NO_SHOW_REASON_LABELS).map(([key, label]) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={[styles.reasonChip, noShowReason === key && styles.reasonChipActive]}
                                        onPress={() => setNoShowReason(key)}
                                    >
                                        <Ionicons
                                            name={noShowReason === key ? "radio-button-on" : "radio-button-off"}
                                            size={18}
                                            color={noShowReason === key ? Brand.danger : '#94a3b8'}
                                        />
                                        <Text style={[styles.reasonChipText, noShowReason === key && styles.reasonChipTextActive]}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.modalLabel}>Açıklama (opsiyonel)</Text>
                            <TextInput
                                style={styles.descInput}
                                multiline
                                numberOfLines={3}
                                placeholder="Olayı kısaca açıklayın (örn: 30 dakika bekledim, telefon kapalıydı...)"
                                placeholderTextColor="#94a3b8"
                                value={noShowDescription}
                                onChangeText={setNoShowDescription}
                            />

                            <Text style={styles.modalLabel}>Fotoğraf (delil olarak)</Text>
                            {noShowPhoto ? (
                                <View style={styles.photoPreviewWrap}>
                                    <Image source={{ uri: noShowPhoto }} style={styles.photoPreview} resizeMode="cover" />
                                    <TouchableOpacity style={styles.photoRemove} onPress={() => setNoShowPhoto(null)}>
                                        <Ionicons name="close-circle" size={28} color="#dc2626" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity style={styles.photoBtn} onPress={pickNoShowPhoto}>
                                    <Ionicons name="camera" size={22} color={Brand.primary} />
                                    <Text style={styles.photoBtnText}>Fotoğraf Çek / Seç</Text>
                                </TouchableOpacity>
                            )}

                            <View style={styles.modalBtnRow}>
                                <TouchableOpacity style={styles.modalCancel} onPress={() => setNoShowModal(false)}>
                                    <Text style={styles.modalCancelText}>İptal</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalSubmit, { backgroundColor: Brand.danger }, noShowSaving && { opacity: 0.6 }]}
                                    onPress={submitNoShow}
                                    disabled={noShowSaving}
                                >
                                    {noShowSaving
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : <>
                                            <Ionicons name="checkmark-circle" size={16} color="#fff" />
                                            <Text style={styles.modalSubmitText}>Onayla & Kaydet</Text>
                                        </>
                                    }
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </Modal>
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
    extrasContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    extraChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fffbeb',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#fbbf24',
    },
    extraChipText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#92400e',
    },

    // Payment modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    payExpectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    payExpectedLabel: { fontSize: 14, color: '#374151', fontWeight: '600' },
    payExpectedAmount: { fontSize: 28, fontWeight: '800', color: '#059669', marginVertical: 12, textAlign: 'center' },
    modalLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 14, marginBottom: 6 },
    payAmountInput: {
        backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb',
        paddingHorizontal: 16, height: 52, fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center',
        marginBottom: 12,
    },
    currencyRow: { flexDirection: 'row', gap: 10, marginBottom: 16, justifyContent: 'center' },
    currencyChip: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0' },
    currencyChipActive: { backgroundColor: '#059669', borderColor: '#059669' },
    currencyChipText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
    currencyChipTextActive: { color: '#fff' },
    modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
    modalCancelText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
    modalSubmit: { flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: 12, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', gap: 6 },
    modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // ── Okundu badge ──
    readBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#dbeafe', borderColor: '#93c5fd', borderWidth: 1,
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
        alignSelf: 'flex-start', marginBottom: 10,
    },
    readBadgeText: { color: '#1e40af', fontSize: 12, fontWeight: '700' },

    // ── Alındı / No-Show row ──
    actionRow: { flexDirection: 'row', gap: 8 },
    actionBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 14, borderRadius: 14,
    },
    actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    // ── No-Show evidence card on already-reported view ──
    noShowEvidence: {
        marginTop: 12, padding: 12,
        backgroundColor: '#fef2f2', borderRadius: 12,
        borderWidth: 1, borderColor: '#fecaca',
    },
    noShowEvidenceTitle: { fontSize: 13, fontWeight: '800', color: '#991b1b', marginBottom: 6 },
    noShowEvidenceLine: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 4 },
    noShowEvidenceLabel: { fontWeight: '700', color: '#64748b' },
    noShowPhotoPreview: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 },

    // ── No-Show modal ──
    noShowWarn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fef3c7', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        marginTop: 4, marginBottom: 4,
    },
    noShowWarnText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600', lineHeight: 17 },
    reasonChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
        borderRadius: 10,
    },
    reasonChipActive: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
    reasonChipText: { fontSize: 13, color: '#475569', fontWeight: '500', flex: 1 },
    reasonChipTextActive: { color: '#991b1b', fontWeight: '700' },
    descInput: {
        backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb',
        paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827',
        textAlignVertical: 'top', minHeight: 70,
    },
    photoBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 14, borderRadius: 12,
        backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe', borderStyle: 'dashed',
    },
    photoBtnText: { color: Brand.primary, fontWeight: '700', fontSize: 14 },
    photoPreviewWrap: { position: 'relative' },
    photoPreview: { width: '100%', height: 180, borderRadius: 12 },
    photoRemove: {
        position: 'absolute', top: 6, right: 6,
        backgroundColor: '#fff', borderRadius: 14,
    },
});
