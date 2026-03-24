import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Platform, Linking, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';

// Replace with your actual IP
const API_URL = 'https://lazy-trainable-sha.ngrok-free.dev/api';

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
            // We reuse the list endpoint or specific detail endpoint. 
            // Ideally backend should have /api/driver/bookings/:id
            // For now, let's filter from list or implement detail endpoint.
            // Assuming backend has simple list, we might need to find within it or fetch all.
            // Let's implement /api/driver/bookings/:id in backend if needed, 
            // OR just fetch list and find. Fetching list is inefficient but verified to exist.
            // Actually, let's implement the detail fetching properly or use what we have.
            // DriverJS route doesn't have GET /bookings/:id. 
            // I will use GET /bookings and filter for now to avoid breaking backend flow again 
            // unless I am sure I added it.
            // Wait, I did NOT add GET /bookings/:id in driver.js.
            // I will add it or just filter client side for MVP.

            const res = await fetch(`${API_URL}/driver/bookings?type=all`, { // 'all' might not be supported, check driver.js
                headers: { 'Authorization': `Bearer ${token}` }
            });
            // driver.js supports 'today' and 'upcoming'. Default is all?
            // driver.js: const { type } = req.query; if type is today/upcoming it filters. 
            // So no type means all (except cancelled/completed).

            const json = await res.json();
            if (json.success) {
                const found = json.data.find((j: any) => j.id === id);
                setJob(found);
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
            }
        } catch (e) {
            console.error(e);
        }
    };

    const openNavigation = (lat: number, lng: number) => {
        const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
        const latLng = `${lat},${lng}`;
        const label = 'Müşteri';
        const url = Platform.select({
            ios: `${scheme}${label}@${latLng}`,
            android: `${scheme}${latLng}(${label})`
        });
        Linking.openURL(url!);
    };

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color="#4361ee" /></View>;
    }

    if (!job) {
        return (
            <View style={styles.center}>
                <Text>Booking not found.</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
                    <Text style={{ color: 'blue' }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const vehicle = job.metadata?.vehicleType || job.product?.name?.tr || job.product?.name?.en || job.product?.vehicle?.plateNumber || 'Araç Bilgisi Yok';
    const from = job.metadata?.pickup || job.pickup?.location || job.product?.fromName || 'Belirtilmemiş';
    const to = job.metadata?.dropoff || job.dropoff?.location || job.product?.toName || 'Belirtilmemiş';

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <IconSymbol name="chevron.left" size={24} color="#1f2937" />
                <Text style={styles.backText}>Geri Dön</Text>
            </TouchableOpacity>

            <View style={styles.header}>
                <Text style={styles.title}>Transfer Detayı</Text>
                <Text style={styles.idText}>#{job.bookingNumber || job.id.substring(0, 8)}</Text>
            </View>

            {/* Route Info */}
            <View style={styles.card}>
                <View style={styles.cardSection}>
                    <Text style={styles.sectionTitle}>Güzergah</Text>
                    <View style={styles.routeContainer}>
                        <View style={styles.routeRow}>
                            <View style={styles.circle} />
                            <Text style={styles.locationText}>{from}</Text>
                        </View>
                        <View style={styles.line} />
                        <View style={styles.routeRow}>
                            <View style={[styles.circle, { backgroundColor: '#ef4444' }]} />
                            <Text style={styles.locationText}>{to}</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Customer Info */}
            <View style={styles.card}>
                <View style={styles.cardSection}>
                    <Text style={styles.sectionTitle}>Müşteri Bilgileri</Text>
                    <View style={styles.infoRow}>
                        <IconSymbol name="person.fill" size={20} color="#6b7280" />
                        <Text style={styles.infoText}>{job.customer?.firstName} {job.customer?.lastName}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <IconSymbol name="phone.fill" size={20} color="#6b7280" />
                        <Text style={[styles.infoText, { color: '#4361ee' }]} onPress={() => Linking.openURL(`tel:${job.customer?.phone}`)}>
                            {job.customer?.phone || 'Telefon Yok'}
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <IconSymbol name="person.2.fill" size={20} color="#6b7280" />
                        <Text style={styles.infoText}>{job.adults} Yetişkin, {job.children} Çocuk</Text>
                    </View>
                    {job.flightNumber && (
                        <View style={styles.infoRow}>
                            <IconSymbol name="airplane" size={20} color="#6b7280" />
                            <Text style={styles.infoText}>{job.flightNumber}</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Status Actions */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Operasyon Durumu</Text>

                <View style={styles.statusButtons}>
                    {job.status === 'CONFIRMED' && (
                        <TouchableOpacity style={[styles.statusButton, { backgroundColor: '#10b981' }]} onPress={() => updateStatus('IN_PROGRESS')}>
                            <Text style={styles.statusButtonText}>Müşteri Alındı</Text>
                        </TouchableOpacity>
                    )}

                    {job.status === 'IN_PROGRESS' && (
                        <TouchableOpacity style={[styles.statusButton, { backgroundColor: '#ef4444' }]} onPress={() => updateStatus('COMPLETED')}>
                            <Text style={styles.statusButtonText}>Transferi Bitir</Text>
                        </TouchableOpacity>
                    )}

                    {job.status === 'COMPLETED' && (
                        <View style={[styles.statusButton, { backgroundColor: '#10b981', opacity: 0.8 }]}>
                            <Text style={styles.statusButtonText}>Tamamlandı</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Navigation Button */}
            <TouchableOpacity style={styles.mapButton} onPress={() => openNavigation(41.0082, 28.9784)}>
                <IconSymbol name="map.fill" size={24} color="#fff" />
                <Text style={styles.mapButtonText}>Navigasyonu Başlat</Text>
            </TouchableOpacity>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        padding: 20,
        backgroundColor: '#f8f9fa',
        paddingTop: 60,
        paddingBottom: 40,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    backText: {
        fontSize: 16,
        color: '#1f2937',
        marginLeft: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    idText: {
        fontSize: 14,
        color: '#6b7280',
        backgroundColor: '#e5e7eb',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 20,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    cardSection: {
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 15,
    },
    routeContainer: {
    },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    circle: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#10b981',
        marginRight: 10,
    },
    line: {
        width: 2,
        height: 20,
        backgroundColor: '#e5e7eb',
        marginLeft: 4,
        marginBottom: 5,
    },
    locationText: {
        fontSize: 16,
        color: '#1f2937',
        flex: 1,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    infoText: {
        marginLeft: 10,
        fontSize: 16,
        color: '#4b5563',
    },
    statusButtons: {
        flexDirection: 'column',
    },
    statusButton: {
        paddingVertical: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 10,
    },
    statusButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    mapButton: {
        backgroundColor: '#4361ee',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 15,
        marginBottom: 20,
    },
    mapButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 10,
    },
});
