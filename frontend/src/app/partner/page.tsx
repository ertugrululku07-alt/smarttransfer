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
    CalendarOutlined,
    ReloadOutlined,
    RightOutlined,
    TeamOutlined,
    InboxOutlined,
    SwapRightOutlined
} from '@ant-design/icons';
import { Button, message, Spin, Empty, Tabs, Tag, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import FlightTracker from '@/components/FlightTracker';
import BookingMap from '@/app/components/BookingMap';

const DistanceCalculator = ({ pickup, dropoff, onCalculated }: any) => (
    <div style={{ display: 'none' }}>
        <BookingMap pickup={pickup} dropoff={dropoff} onDistanceCalculated={onCalculated} />
    </div>
);

const PartnerDashboard = () => {
    const router = useRouter();
    const [reservations, setReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState<string | null>(null);
    const [fetching, setFetching] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const [stats, setStats] = useState({ pending: 0, today: 0 });
    // Vehicle capacity state
    const [myVehicles, setMyVehicles] = useState<any[]>([]);
    const [vehicleCapacity, setVehicleCapacity] = useState({ totalVehicles: 0, busyVehicles: 0, availableSlots: 0, canAcceptMore: false });
    const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
    const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);

    const fetchStats = async () => {
        try {
            const response = await apiClient.get('/api/transfer/partner/stats');
            if (response.data.success) setStats(response.data.data);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const [poolRuns, setPoolRuns] = useState<any[]>([]);

    const fetchMyVehicles = async () => {
        try {
            const res = await apiClient.get('/api/transfer/partner/my-vehicles');
            if (res.data.success) {
                const d = res.data.data;
                setMyVehicles(d.vehicles || []);
                setVehicleCapacity({
                    totalVehicles: d.totalVehicles || 0,
                    busyVehicles: d.busyVehicles || 0,
                    availableSlots: d.availableSlots || 0,
                    canAcceptMore: d.canAcceptMore || false
                });
                return d;
            }
        } catch (e) { console.error('Vehicle fetch error:', e); }
        return null;
    };

    const fetchBookings = async () => {
        setFetching(true);
        fetchStats();
        try {
            // Fetch vehicles and active bookings in parallel
            const [vehicleData, activeResponse] = await Promise.all([
                fetchMyVehicles(),
                apiClient.get('/api/transfer/partner/active-bookings')
            ]);

            const activeBookings = activeResponse.data.success ? activeResponse.data.data : [];
            const availableSlots = vehicleData?.availableSlots ?? 0;
            const totalVehicles = vehicleData?.totalVehicles ?? 0;

            // Always set active bookings as reservations
            if (activeBookings.length > 0) {
                setReservations(activeBookings);
            } else {
                setReservations([]);
            }

            // Show pool only if there are available vehicle slots
            if (availableSlots > 0 || totalVehicles === 0) {
                const poolResponse = await apiClient.get('/api/transfer/pool-bookings');
                if (poolResponse.data.success) {
                    const all = poolResponse.data.data || [];
                    const runMap: Record<string, any[]> = {};
                    const singles: any[] = [];
                    all.forEach((b: any) => {
                        if (b.poolRunKey) {
                            if (!runMap[b.poolRunKey]) runMap[b.poolRunKey] = [];
                            runMap[b.poolRunKey].push(b);
                        } else {
                            singles.push(b);
                        }
                    });
                    // If there are active bookings, append pool singles after them
                    if (activeBookings.length > 0) {
                        setReservations([...activeBookings, ...singles]);
                    } else {
                        setReservations(singles);
                    }
                    setPoolRuns(Object.entries(runMap).map(([key, bookings]) => ({
                        poolRunKey: key,
                        routeName: bookings[0]?.poolRunName || 'Shuttle Sefer',
                        departureTime: bookings[0]?.poolDepartureTime || '--:--',
                        poolPrice: bookings[0]?.price?.amount || 0,
                        currency: bookings[0]?.price?.currency || 'TRY',
                        bookings
                    })));
                }
            } else {
                setPoolRuns([]);
            }
        } catch (error) {
            console.error('Error fetching bookings:', error);
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => { fetchBookings(); }, []);

    const handleAccept = async (id: string, vehicleId?: string) => {
        // If multiple vehicles and no vehicleId selected yet, show modal
        const availableVehicles = myVehicles.filter(v => !v.isBusy);
        if (availableVehicles.length > 1 && !vehicleId) {
            setPendingAcceptId(id);
            setVehicleModalVisible(true);
            return;
        }

        // Auto-select if only 1 available vehicle
        const selectedVehicleId = vehicleId || (availableVehicles.length === 1 ? availableVehicles[0].id : undefined);

        setLoading(id);
        try {
            const response = await apiClient.put(`/api/transfer/bookings/${id}/status`, {
                status: 'CONFIRMED', subStatus: 'IN_OPERATION',
                ...(selectedVehicleId ? { partnerVehicleId: selectedVehicleId } : {})
            });
            if (response.data.success) {
                message.success('Rezervasyon kabul edildi!');
                setVehicleModalVisible(false);
                setPendingAcceptId(null);
                fetchBookings();
            } else {
                message.error(response.data.error || 'İşlem başarısız oldu');
            }
        } catch (error: any) {
            console.error('Accept error:', error);
            message.error(error?.response?.data?.error || 'Bir hata oluştu');
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

    const hasActive = reservations.some(r => r.status === 'ACCEPTED' || r.status === 'CONFIRMED');
    const allVehiclesBusy = vehicleCapacity.totalVehicles > 0 && vehicleCapacity.availableSlots === 0;
    const hasPool = reservations.some(r => r.status === 'PENDING' || r.status === 'WAITING' || r.status === 'POOL');
    const filters = [
        { key: 'all', label: 'Tümü', count: reservations.length },
        { key: 'vip', label: 'VIP Transfer' },
        { key: 'minibus', label: 'Minibüs' },
    ];

    return (
        <PartnerGuard>
            <PartnerLayout>
                <style jsx global>{`
                    .partner-page-container { max-width: 1200px; margin: 0 auto; }
                    .partner-stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 28px; }
                    .partner-res-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
                    @media (max-width: 768px) {
                        .partner-page-container { padding-top: 68px; }
                        .partner-stat-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
                        .partner-res-grid { grid-template-columns: 1fr !important; gap: 16px; }
                    }
                `}</style>

                <div className="partner-page-container">
                    {/* Page Header */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>
                                    {allVehiclesBusy ? '🟢 Aktif Transferler' : hasActive && hasPool ? '📋 Transfer Havuzu' : hasActive ? '🟢 Aktif Transfer' : '📋 Transfer Havuzu'}
                                </h1>
                                <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0', fontWeight: 400 }}>
                                    {allVehiclesBusy ? 'Tüm araçlarınız meşgul — havuz gizli' : hasActive ? 'Aktif transferleriniz ve bekleyen havuz' : 'Size atanan ve bekleyen transferler'}
                                </p>
                            </div>
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchBookings}
                                loading={fetching}
                                style={{ borderRadius: 12, fontWeight: 600, height: 40, border: '1px solid #e2e8f0' }}
                            >
                                Yenile
                            </Button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="partner-stat-grid">
                        <div style={{
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 16,
                            padding: '20px 22px', color: '#fff', position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', right: -10, top: -10, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <ClockCircleOutlined style={{ marginRight: 6 }} />Bekleyen
                            </div>
                            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, marginTop: 6 }}>{stats.pending}</div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>transfer</div>
                        </div>
                        <div style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 16,
                            padding: '20px 22px', color: '#fff', position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', right: -10, top: -10, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <CalendarOutlined style={{ marginRight: 6 }} />Bugün
                            </div>
                            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, marginTop: 6 }}>{stats.today}</div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>transfer</div>
                        </div>
                    </div>

                    {/* Vehicle Capacity Banner */}
                    {vehicleCapacity.totalVehicles > 0 && (
                        <div style={{
                            background: allVehiclesBusy
                                ? 'linear-gradient(135deg, #fef2f2, #fee2e2)'
                                : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                            borderRadius: 14, padding: '14px 20px', marginBottom: 20,
                            border: `1px solid ${allVehiclesBusy ? '#fca5a5' : '#86efac'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CarOutlined style={{ fontSize: 20, color: allVehiclesBusy ? '#dc2626' : '#16a34a' }} />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: allVehiclesBusy ? '#991b1b' : '#166534' }}>
                                        {allVehiclesBusy ? '🔴 Tüm araçlarınız meşgul' : `🟢 ${vehicleCapacity.availableSlots} araç müsait`}
                                    </div>
                                    <div style={{ fontSize: 12, color: allVehiclesBusy ? '#b91c1c' : '#15803d', marginTop: 2 }}>
                                        {vehicleCapacity.totalVehicles} araç toplam • {vehicleCapacity.busyVehicles} meşgul • {vehicleCapacity.availableSlots} boş
                                    </div>
                                </div>
                            </div>
                            {allVehiclesBusy && (
                                <div style={{
                                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    background: '#fecaca', color: '#991b1b',
                                }}>
                                    Transferler bitene kadar havuz gizli
                                </div>
                            )}
                            {/* Vehicle list chips */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%' }}>
                                {myVehicles.map(v => (
                                    <div key={v.id} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        background: v.isBusy ? '#fef3c7' : '#ecfdf5',
                                        border: `1px solid ${v.isBusy ? '#fcd34d' : '#6ee7b7'}`,
                                        color: v.isBusy ? '#92400e' : '#065f46',
                                    }}>
                                        <CarOutlined style={{ fontSize: 11 }} />
                                        {v.plateNumber}
                                        {v.isBusy ? ` • ${v.activeBooking?.bookingNumber || 'Meşgul'}` : ' • Boş'}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tabs for Private and Shuttle */}
                    <Tabs
                        defaultActiveKey="private"
                        size="large"
                        items={[
                            {
                                key: 'private',
                                label: <span style={{ fontSize: 15, fontWeight: 600 }}>🚕 Özel Transferler</span>,
                                children: (
                                    <>
                                        {/* Filters */}
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                                            {filters.map(f => (
                                                <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{
                                                    padding: '8px 18px', border: 'none',
                                                    background: activeFilter === f.key ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#fff',
                                                    color: activeFilter === f.key ? '#fff' : '#64748b',
                                                    borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                                    boxShadow: activeFilter === f.key ? '0 4px 12px rgba(15,23,42,0.2)' : '0 1px 4px rgba(0,0,0,0.06)',
                                                    transition: 'all 0.2s ease',
                                                }}>
                                                    {f.label}{f.count !== undefined && ` (${f.count})`}
                                                </button>
                                            ))}
                                        </div>

                                        {fetching ? (
                                            <div style={{ textAlign: 'center', padding: 60 }}>
                                                <Spin size="large" />
                                                <p style={{ color: '#94a3b8', marginTop: 12 }}>Yükleniyor...</p>
                                            </div>
                                        ) : reservations.length === 0 ? (
                                            <div style={{
                                                background: '#fff', borderRadius: 20, padding: '60px 24px', textAlign: 'center',
                                                boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                                            }}>
                                                <InboxOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />
                                                <h3 style={{ color: '#64748b', fontWeight: 600, margin: '16px 0 8px' }}>Henüz transfer yok</h3>
                                                <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Yeni özel transferler atandığında burada görünecektir</p>
                                            </div>
                                        ) : (
                                            <div className="partner-res-grid">
                                                {reservations.map(res => (
                                                    <ReservationCard key={res.id} res={res} onAccept={handleAccept} onReject={handleReject} loading={loading === res.id} router={router} />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )
                            },
                            {
                                key: 'shuttle',
                                label: <span style={{ fontSize: 15, fontWeight: 600 }}>🚌 Shuttle Seferleri {poolRuns.length > 0 && <span style={{ background: '#fef08a', color: '#854d0e', padding: '2px 8px', borderRadius: 12, fontSize: 12, marginLeft: 8 }}>{poolRuns.length}</span>}</span>,
                                children: (
                                    <>
                                        {fetching ? (
                                            <div style={{ textAlign: 'center', padding: 60 }}>
                                                <Spin size="large" />
                                                <p style={{ color: '#94a3b8', marginTop: 12 }}>Yükleniyor...</p>
                                            </div>
                                        ) : poolRuns.length === 0 ? (
                                            <div style={{
                                                background: '#fff', borderRadius: 20, padding: '60px 24px', textAlign: 'center',
                                                boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                                            }}>
                                                <InboxOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />
                                                <h3 style={{ color: '#64748b', fontWeight: 600, margin: '16px 0 8px' }}>Henüz shuttle seferi yok</h3>
                                                <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Havuza atılan shuttle seferleri burada listelenir</p>
                                            </div>
                                        ) : (
                                            <div style={{ marginBottom: 24 }}>
                                                {poolRuns.map(run => (
                                                    <div key={run.poolRunKey} style={{
                                                        background: '#fff', borderRadius: 18, overflow: 'hidden', marginBottom: 16,
                                                        boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                                                    }}>
                                                        {/* Run header */}
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: 16,
                                                            padding: '16px 20px',
                                                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                                            borderBottom: '1px solid #e2e8f0',
                                                        }}>
                                                            <div style={{
                                                                background: '#fff', border: '2px solid #3b82f6',
                                                                color: '#1d4ed8', borderRadius: 12, padding: '8px 16px',
                                                                fontSize: 22, fontWeight: 900, minWidth: 80, textAlign: 'center',
                                                                boxShadow: '0 2px 8px rgba(59,130,246,0.15)'
                                                            }}>
                                                                {run.departureTime}
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginTop: 2, textTransform: 'uppercase' }}>Uçuş</div>
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{run.routeName}</div>
                                                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <TeamOutlined /> {run.bookings.length} Yolcu
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Tüm Sefer Ücreti</div>
                                                                <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981', display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                                                                    {Number(run.poolPrice).toLocaleString('tr-TR')} <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>{run.currency}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {/* Booking rows */}
                                                        <div style={{ padding: '12px 16px', background: '#fff' }}>
                                                            {run.bookings.map((b: any, i: number) => {
                                                                const isPaid = b.paymentStatus === 'PAID';
                                                                return (
                                                                    <div key={b.id} style={{
                                                                        display: 'grid', gridTemplateColumns: '40px 2fr 1.5fr 1fr 1fr 1fr 1fr', gap: 12, alignItems: 'center',
                                                                        padding: '12px 16px', borderRadius: 10,
                                                                        borderBottom: i < run.bookings.length - 1 ? '1px dashed #e2e8f0' : 'none',
                                                                        background: i % 2 === 0 ? '#f8fafc' : '#fff'
                                                                    }}>
                                                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                                                                            {i + 1}
                                                                        </div>
                                                                        
                                                                        {/* Müşteri & İletişim */}
                                                                        <div style={{ minWidth: 0 }}>
                                                                            <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{b.customer?.name}</div>
                                                                            {b.customer?.phone && (
                                                                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                                    <PhoneOutlined /> {b.customer.phone}
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Güzergah */}
                                                                        <div style={{ minWidth: 0 }}>
                                                                            <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                <span style={{ color: '#ef4444' }}>📍</span> {b.pickup?.location}
                                                                            </div>
                                                                            <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                                                                                <span style={{ color: '#10b981' }}>📍</span> {b.dropoff?.location}
                                                                            </div>
                                                                        </div>

                                                                        {/* Saatler */}
                                                                        <div>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Alış Saati</div>
                                                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>{b.pickupTime || '--:--'}</div>
                                                                        </div>

                                                                        {/* Uçuş */}
                                                                        <div>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Uçuş</div>
                                                                            {(b.flightNumber || b.flightTime) ? (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                                    {b.flightNumber && <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>✈️ {b.flightNumber}</div>}
                                                                                    {b.flightTime && <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>🕒 {b.flightTime}</div>}
                                                                                </div>
                                                                            ) : <div style={{ fontSize: 12, color: '#cbd5e1' }}>Yok</div>}
                                                                        </div>

                                                                        {/* Kişi Sayısı */}
                                                                        <div>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Yolcu</div>
                                                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>👥 {b.pax} Kişi</div>
                                                                        </div>

                                                                        {/* Ödeme Durumu */}
                                                                        <div>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Ödeme</div>
                                                                            <Tag color={isPaid ? 'success' : 'warning'} style={{ margin: 0, marginTop: 2, fontWeight: 700, borderRadius: 6 }}>
                                                                                {isPaid ? 'ÖDENDİ' : 'ARAÇTA'}
                                                                            </Tag>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {/* Action Footer */}
                                                        <div style={{ padding: '16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                                                            <button
                                                                onClick={() => {
                                                                    run.bookings.forEach((b: any) => handleAccept(b.id));
                                                                }}
                                                                style={{
                                                                    padding: '12px 24px', border: 'none', borderRadius: 12,
                                                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                                                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                                                    boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                                                    display: 'flex', alignItems: 'center', gap: 8
                                                                }}
                                                            >
                                                                Seferi Kabul Et <RightOutlined style={{ fontSize: 12 }} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )
                            }
                        ]}
                    />
                </div>

                {/* Vehicle Selection Modal */}
                <Modal
                    open={vehicleModalVisible}
                    title={null}
                    footer={null}
                    onCancel={() => { setVehicleModalVisible(false); setPendingAcceptId(null); }}
                    centered
                    width={420}
                    styles={{ body: { padding: 0 } }}
                >
                    <div style={{ padding: '24px 24px 8px' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>🚗 Araç Seçin</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                            Bu transferi hangi aracınızla yapacaksınız?
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {myVehicles.filter(v => !v.isBusy).map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => pendingAcceptId && handleAccept(pendingAcceptId, v.id)}
                                    disabled={loading !== null}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '16px 18px', border: '2px solid #e2e8f0', borderRadius: 14,
                                        background: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease', textAlign: 'left', width: '100%',
                                    }}
                                    onMouseEnter={e => { (e.target as any).closest('button').style.borderColor = '#6366f1'; (e.target as any).closest('button').style.background = '#f5f3ff'; }}
                                    onMouseLeave={e => { (e.target as any).closest('button').style.borderColor = '#e2e8f0'; (e.target as any).closest('button').style.background = '#fff'; }}
                                >
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', flexShrink: 0,
                                    }}>
                                        <CarOutlined style={{ fontSize: 20 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{v.plateNumber}</div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{v.name} • {v.vehicleType} • {v.capacity} kişi</div>
                                    </div>
                                    <RightOutlined style={{ color: '#94a3b8', fontSize: 14 }} />
                                </button>
                            ))}
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#94a3b8' }}>
                            Sadece boş araçlarınız listeleniyor
                        </div>
                    </div>
                </Modal>
            </PartnerLayout>
        </PartnerGuard>
    );
};

const ReservationCard = ({ res, onAccept, onReject, loading, router }: any) => {
    const [stats, setStats] = useState({ dist: res.dropoff.dist, duration: res.dropoff.duration });
    const isPending = res.status === 'PENDING' || res.status === 'WAITING';

    const handleDistanceCalculated = (dist: string, duration: string) => {
        if (!stats.dist || stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok') setStats({ dist, duration });
    };

    return (
        <div style={{
            background: '#fff', borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 2px 16px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9',
            transition: 'all 0.3s ease', position: 'relative',
        }}>
            {/* Top accent */}
            <div style={{
                height: 4,
                background: isPending
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : 'linear-gradient(90deg, #10b981, #059669)',
            }} />

            {(stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok') && (
                <DistanceCalculator pickup={res.pickup.location} dropoff={res.dropoff.location} onCalculated={handleDistanceCalculated} />
            )}

            <div style={{ padding: '18px 20px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 14,
                            background: isPending ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                            boxShadow: isPending ? '0 4px 12px rgba(245,158,11,0.3)' : '0 4px 12px rgba(16,185,129,0.3)',
                        }}>
                            {res.customer.avatar}
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{res.customer.name}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                                <PhoneOutlined style={{ fontSize: 11 }} />{res.customer.phone}
                            </div>
                        </div>
                    </div>
                    <div style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        background: isPending ? '#fef3c7' : '#d1fae5',
                        color: isPending ? '#92400e' : '#065f46',
                    }}>
                        {isPending ? 'Bekliyor' : 'Aktif'}
                    </div>
                </div>

                {/* Route */}
                <div style={{
                    background: '#f8fafc', borderRadius: 14, padding: '14px 16px', marginBottom: 14,
                    border: '1px solid #f1f5f9',
                }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 0 3px rgba(16,185,129,0.2)' }} />
                            <div style={{ width: 2, flex: 1, background: 'linear-gradient(to bottom, #10b981, #e2e8f0)', margin: '4px 0', minHeight: 24 }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.2)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>ALIŞ</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', lineHeight: 1.4, marginTop: 2 }}>{res.pickup.location}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CalendarOutlined style={{ fontSize: 11 }} />{res.pickup.time}
                                </div>
                                {res.flightNumber && (
                                    <FlightTracker flightNumber={res.flightNumber} arrivalDate={res.pickup.timeDate || res.pickup.time} />
                                )}
                            </div>
                            <div>
                                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>VARIŞ</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', lineHeight: 1.4, marginTop: 2 }}>{res.dropoff.location}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CarOutlined style={{ fontSize: 11 }} />{stats.dist || '...'} • {stats.duration || '...'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info chips */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569',
                    }}>
                        <CarOutlined style={{ fontSize: 13 }} />{res.vehicle.type}
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569',
                    }}>
                        <TeamOutlined style={{ fontSize: 13 }} />{res.vehicle.pax} kişi
                    </div>
                    {res.partnerVehiclePlate && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', background: '#eef2ff', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#4f46e5',
                            border: '1px solid #c7d2fe',
                        }}>
                            <CarOutlined style={{ fontSize: 13 }} />{res.partnerVehiclePlate}
                        </div>
                    )}
                    <div style={{
                        marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: '#0f172a',
                        display: 'flex', alignItems: 'baseline', gap: 4,
                    }}>
                        {res.price.amount}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{res.price.currency}</span>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: isPending ? '1fr 1fr 1fr' : '1fr', gap: 8 }}>
                    {!isPending ? (
                        <button onClick={() => router.push(`/partner/booking/${res.id}`)} style={{
                            padding: '12px', border: 'none', borderRadius: 12,
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                        }}>
                            Detay / İşlemler <RightOutlined style={{ fontSize: 12 }} />
                        </button>
                    ) : (
                        <>
                            <button onClick={() => onReject(res.id)} style={{
                                padding: '11px 8px', border: '1px solid #fecaca', borderRadius: 12,
                                background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}>Reddet</button>
                            <button onClick={() => router.push(`/partner/booking/${res.id}`)} style={{
                                padding: '11px 8px', border: '1px solid #e2e8f0', borderRadius: 12,
                                background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}>Detay</button>
                            <button onClick={() => onAccept(res.id)} disabled={loading} style={{
                                padding: '11px 8px', border: 'none', borderRadius: 12,
                                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                            }}>{loading ? '...' : 'Kabul Et'}</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PartnerDashboard;
