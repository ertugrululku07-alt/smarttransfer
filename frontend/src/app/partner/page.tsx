'use client';

import React, { useState, useEffect } from 'react';
import PartnerLayout from './PartnerLayout';
import PartnerGuard from './PartnerGuard';
import {
    ClockCircleOutlined,
    EnvironmentOutlined,
    CarOutlined,
    UserOutlined,
    PhoneOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import { Button, message, Tag, Row, Col, Typography, Card } from 'antd'; // Added Row, Col, Typography, Card
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import FlightTracker from '@/components/FlightTracker';
import BookingMap from '@/app/components/BookingMap'; // Import BookingMap

const { Title, Text } = Typography;

// FlightTracker Component moved to @/components/FlightTracker

// Distance Calculator Component (Wrapper for BookingMap)
const DistanceCalculator = ({ pickup, dropoff, onCalculated }: any) => {
    return (
        <div style={{ display: 'none' }}>
            <BookingMap pickup={pickup} dropoff={dropoff} onDistanceCalculated={onCalculated} />
        </div>
    );
};

// Mock data based on HTML structure
const mockReservations = [
    {
        id: 'REZ-2458',
        customer: {
            name: 'Ahmet Yılmaz',
            phone: '+90 532 555 1234',
            avatar: 'AY'
        },
        pickup: {
            location: 'Antalya Havalimanı (AYT)',
            time: '14 Şubat 2024, 14:30',
            note: 'Dış hatlar çıkışı'
        },
        dropoff: {
            location: 'Rixos Premium Belek',
            dist: '35 km',
            duration: '45 dk'
        },
        vehicle: {
            type: 'Vito VIP',
            pax: 4,
            luggage: 3
        },
        price: {
            amount: 450,
            currency: 'EUR'
        },
        status: 'PENDING'
    },
    {
        id: 'REZ-2459',
        customer: {
            name: 'Sarah Johnson',
            phone: '+44 7700 900077',
            avatar: 'SJ'
        },
        pickup: {
            location: 'Lara Barut Collection',
            time: '15 Şubat 2024, 09:00',
            note: 'Lobi'
        },
        dropoff: {
            location: 'Antalya Havalimanı (AYT)',
            dist: '15 km',
            duration: '25 dk'
        },
        vehicle: {
            type: 'Sprinter',
            pax: 12,
            luggage: 10
        },
        price: {
            amount: 800,
            currency: 'EUR'
        },
        status: 'PENDING'
    }
];

const PartnerDashboard = () => {
    const router = useRouter();
    const [reservations, setReservations] = useState<any[]>([]); // Initialize empty
    const [loading, setLoading] = useState<string | null>(null);
    const [fetching, setFetching] = useState(true);


    const [stats, setStats] = useState({ pending: 0, today: 0 });

    const fetchStats = async () => {
        try {
            const response = await apiClient.get('/api/transfer/partner/stats');
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    // Extract fetch logic to reuse
    const fetchBookings = async () => {
        setFetching(true);
        fetchStats(); // Fetch stats when refreshing bookings
        try {
            // First, check for active bookings (Focus Mode)
            const activeResponse = await apiClient.get('/api/transfer/partner/active-bookings');

            if (activeResponse.data.success && activeResponse.data.data.length > 0) {
                // Start: Focus Mode Active
                setReservations(activeResponse.data.data);
                // End: Focus Mode Active
            } else {
                // No active bookings, fetch pool bookings
                const poolResponse = await apiClient.get('/api/transfer/pool-bookings');
                if (poolResponse.data.success) {
                    setReservations(poolResponse.data.data);
                }
            }
        } catch (error) {
            console.error('Error fetching bookings:', error);
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchBookings();
    }, []);

    const handleAccept = async (id: string) => {
        setLoading(id);
        try {
            const response = await apiClient.put(`/api/transfer/bookings/${id}/status`, {
                status: 'CONFIRMED',
                subStatus: 'IN_OPERATION' // Partner takes operation
            });

            if (response.data.success) {
                message.success('Rezervasyon kabul edildi! İyi yolculuklar 🚗');
                // Refresh list to trigger Focus Mode (show only active booking)
                fetchBookings();
            } else {
                message.error('İşlem başarısız oldu');
            }
        } catch (error) {
            console.error('Accept error:', error);
            message.error('Bir hata oluştu');
        } finally {
            setLoading(null);
        }
    };

    const handleReject = (id: string) => {
        if (confirm('Bu rezervasyonu reddetmek istediğinize emin misiniz?')) {
            setReservations(prev => prev.filter(r => r.id !== id));
            message.info('Rezervasyon reddedildi');
        }
    };

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div className="dashboard-header" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}>
                    <div className="dashboard-title" style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a2e' }}>
                        {reservations.some(r => r.status === 'ACCEPTED') ? 'Aktif Transferiniz' : 'Transferlerim'}
                    </div>
                    <div className="dashboard-stats" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <div className="stat-badge" style={{
                            background: '#fff',
                            padding: '10px 18px',
                            borderRadius: '10px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span className="number" style={{ fontSize: '18px', fontWeight: 700, color: '#4361ee' }}>{stats.pending}</span>
                            <span className="label" style={{ fontSize: '13px', color: '#6b7280' }}>Bekleyen</span>
                        </div>
                        <div className="stat-badge" style={{
                            background: '#fff',
                            padding: '10px 18px',
                            borderRadius: '10px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span className="number" style={{ fontSize: '18px', fontWeight: 700, color: '#10B981' }}>{stats.today}</span>
                            <span className="label" style={{ fontSize: '13px', color: '#6b7280' }}>Bugün</span>
                        </div>
                    </div>
                </div>

                <div className="filters-bar" style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <button className="filter-btn active" style={{
                        padding: '10px 20px',
                        border: '1px solid #4361ee',
                        background: '#4361ee',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}>Tümü</button>
                    <button className="filter-btn" style={{
                        padding: '10px 20px',
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#6b7280',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}>VIP Transfer</button>
                    <button className="filter-btn" style={{
                        padding: '10px 20px',
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#6b7280',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}>Minibüs</button>
                </div>

                <div className="reservations-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                    gap: '20px'
                }}>
                    {reservations.map(res => (
                        <ReservationCard
                            key={res.id}
                            res={res}
                            onAccept={handleAccept}
                            onReject={handleReject}
                            loading={loading === res.id}
                            router={router}
                        />
                    ))}
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
};

const ReservationCard = ({ res, onAccept, onReject, loading, router }: any) => {
    const [stats, setStats] = useState({
        dist: res.dropoff.dist,
        duration: res.dropoff.duration
    });

    const handleDistanceCalculated = (dist: string, duration: string) => {
        // Only update if current values are empty/zero
        if (!stats.dist || stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok' ||
            !stats.duration || stats.duration === '0 dk' || stats.duration === 'Süre Yok') {
            setStats({ dist, duration });
        }
    };

    return (
        <div className="reservation-card" style={{
            background: '#fff',
            borderRadius: '16px',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
            padding: '20px',
            transition: 'all 0.3s ease',
            border: '1px solid transparent',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: (res.status === 'PENDING' || res.status === 'WAITING') ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #4361ee, #00d4aa)'
            }} />

            {/* Hidden Calculator if needed */}
            {(stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok') && (
                <DistanceCalculator
                    pickup={res.pickup.location}
                    dropoff={res.dropoff.location}
                    onCalculated={handleDistanceCalculated}
                />
            )}

            <div className="card-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
                paddingBottom: '14px',
                borderBottom: '1px solid #f3f4f6'
            }}>
                <div className="customer-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="customer-avatar" style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '16px'
                    }}>
                        {res.customer.avatar}
                    </div>
                    <div>
                        <div className="customer-name" style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a2e' }}>{res.customer.name}</div>
                        <div className="customer-phone" style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            <PhoneOutlined style={{ marginRight: 4 }} />
                            {res.customer.phone}
                        </div>
                    </div>
                </div>
                <div className="status-badge" style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    background: (res.status === 'PENDING' || res.status === 'WAITING') ? '#fef3c7' : '#d1fae5',
                    color: (res.status === 'PENDING' || res.status === 'WAITING') ? '#d97706' : '#047857'
                }}>
                    {(res.status === 'PENDING' || res.status === 'WAITING') ? 'Bekliyor' : 'Aktif / Onaylı'}
                </div>
            </div>

            <div className="route-info" style={{ marginBottom: '16px' }}>
                <div className="route-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    <div className="route-icon pickup" style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '12px',
                        background: '#ecfdf5',
                        color: '#10B981'
                    }}>
                        <EnvironmentOutlined />
                    </div>
                    <div className="route-details" style={{ flex: 1 }}>
                        <div className="route-label" style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>ALIŞ NOKTASI</div>
                        <div className="route-location" style={{ fontSize: '14px', fontWeight: 500, color: '#374151', lineHeight: 1.4 }}>{res.pickup.location}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            <CalendarOutlined style={{ marginRight: 4 }} />
                            {res.pickup.time}
                        </div>
                        {res.flightNumber && (
                            <FlightTracker
                                flightNumber={res.flightNumber}
                                arrivalDate={res.pickup.timeDate || res.pickup.time} // Fallback if timeDate missing
                            />
                        )}
                    </div>
                </div>

                <div className="route-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div className="route-icon dropoff" style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '12px',
                        background: '#fef2f2',
                        color: '#EF4444'
                    }}>
                        <EnvironmentOutlined />
                    </div>
                    <div className="route-details" style={{ flex: 1 }}>
                        <div className="route-label" style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>VARIŞ NOKTASI</div>
                        <div className="route-location" style={{ fontSize: '14px', fontWeight: 500, color: '#374151', lineHeight: 1.4 }}>{res.dropoff.location}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            <CarOutlined style={{ marginRight: 4 }} />
                            {stats.dist || 'Hesaplanıyor...'} • {stats.duration || '...'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card-footer" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '14px',
                borderTop: '1px solid #f3f4f6',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div className="vehicle-type" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: '#f9fafb',
                    borderRadius: '6px'
                }}>
                    <CarOutlined />
                    <span className="vehicle-text" style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>{res.vehicle.type}</span>
                </div>

                <div className="price-tag" style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a2e' }}>
                    {res.price.amount} <span className="price-currency" style={{ fontSize: '14px', fontWeight: 500, color: '#6b7280' }}>{res.price.currency}</span>
                </div>
            </div>

            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {!(res.status === 'PENDING' || res.status === 'WAITING') ? (
                    <Button
                        type="primary"
                        style={{ width: '100%', background: '#10B981', borderColor: '#10B981', gridColumn: '1 / -1' }}
                        onClick={() => router.push(`/partner/booking/${res.id}`)}
                    >
                        Detay / İşlemler
                    </Button>
                ) : (
                    <>
                        <Button
                            danger
                            className="action-btn"
                            style={{ flex: 1 }}
                            onClick={() => onReject(res.id)}
                        >
                            Reddet
                        </Button>
                        <Button
                            style={{ width: '100%', borderColor: '#4361ee', color: '#4361ee' }}
                            onClick={() => router.push(`/partner/booking/${res.id}`)}
                        >
                            Detay
                        </Button>
                        <Button
                            type="primary"
                            className="action-btn"
                            style={{ flex: 1, background: '#4361ee', borderColor: '#4361ee' }}
                            loading={loading}
                            onClick={() => onAccept(res.id)}
                        >
                            Kabul Et
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};


export default PartnerDashboard;
