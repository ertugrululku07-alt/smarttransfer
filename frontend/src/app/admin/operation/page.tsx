'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Row, Col, Card, Statistic, Table, Tag, Typography, Button, Space,
    message, Avatar, Badge, Tooltip, Progress, Timeline, Drawer, Divider,
    Empty, Spin
} from 'antd';
import {
    CarOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined,
    TeamOutlined, EnvironmentOutlined, ThunderboltOutlined, StarOutlined,
    ArrowRightOutlined, AlertOutlined, WifiOutlined, DashboardOutlined,
    UserOutlined, PhoneOutlined, CalendarOutlined, EyeOutlined,
    RiseOutlined, AimOutlined, CompassOutlined, HistoryOutlined,
    DisconnectOutlined, ApiOutlined, SafetyCertificateOutlined,
    WarningOutlined, LinkOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import apiClient, { getImageUrl } from '@/lib/api-client';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import relativeTime from 'dayjs/plugin/relativeTime';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import { useSocket } from '@/app/context/SocketContext';
import dynamic from 'next/dynamic';

const HereLiveMapClient = dynamic(() => import('../live-map/HereLiveMapClient'), {
    ssr: false,
    loading: () => (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column' }}>
            <Spin size="large" />
            <div style={{ marginTop: 10 }}>Harita yükleniyor...</div>
        </div>
    )
});

dayjs.locale('tr');
dayjs.extend(relativeTime);

const { Text, Title } = Typography;

interface ConnectionEvent {
    event: string;
    driverName?: string;
    ts: string;
    tsMs: number;
    reason?: string;
    source?: string;
    socketId?: string;
    hasLocation?: boolean;
    tokenAutoRenewed?: boolean;
    lastSeenAgoSec?: number;
    hadSocket?: boolean;
    error?: string;
    via?: string;
}

interface Driver {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    jobTitle?: string;
    location?: { lat: number; lng: number; speed?: number } | null;
    lastSeenAt?: string;
    socketId?: string;
    recentConnectionEvents?: ConnectionEvent[];
}

interface Booking {
    id: string;
    bookingNumber: string;
    contactName: string;
    contactPhone: string;
    pickup: any;
    dropoff: any;
    pickupDateTime: string;
    status: string;
    operationalStatus?: string;
    total: number;
    currency: string;
    vehicleType?: string;
    driverId?: string;
    assignedVehicleId?: string;
    adults?: number;
    flightNumber?: string;
    agencyName?: string;
}

export default function OperationDashboard() {
    const router = useRouter();
    const { socket } = useSocket();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(dayjs());

    const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, completed: 0, inPool: 0, todayCount: 0, inProgress: 0, cancelled: 0 });
    const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
    const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [onlineDriverIds, setOnlineDriverIds] = useState<Set<string>>(new Set());
    const [driverLocations, setDriverLocations] = useState<Record<string, { lat: number; lng: number; speed?: number }>>({});

    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [detailDrawer, setDetailDrawer] = useState(false);

    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [driverLogDrawer, setDriverLogDrawer] = useState(false);
    const [selectedDriverForLog, setSelectedDriverForLog] = useState<Driver | null>(null);
    const [driverLogs, setDriverLogs] = useState<ConnectionEvent[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [realtimeEvents, setRealtimeEvents] = useState<ConnectionEvent[]>([]);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            PENDING: '#f59e0b', CONFIRMED: '#6366f1', IN_PROGRESS: '#8b5cf6',
            COMPLETED: '#10b981', CANCELLED: '#ef4444', IN_POOL: '#06b6d4'
        };
        return map[status] || '#6b7280';
    };

    const getStatusLabel = (status: string, opStatus?: string) => {
        if (opStatus === 'IN_POOL') return 'Havuzda';
        const map: Record<string, string> = {
            PENDING: 'Bekliyor', CONFIRMED: 'Onaylı', IN_PROGRESS: 'Aktif Sefer',
            COMPLETED: 'Tamamlandı', CANCELLED: 'İptal'
        };
        return map[status] || status;
    };

    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const [bookingsRes, driversRes] = await Promise.all([
                apiClient.get('/api/transfer/bookings'),
                apiClient.get('/api/driver/online')
            ]);

            if (bookingsRes.data.success) {
                const raw: Booking[] = bookingsRes.data.data;
                const enriched = raw.map(b => ({
                    ...b,
                    pickup: typeof b.pickup === 'string' ? { location: b.pickup } : b.pickup,
                    dropoff: typeof b.dropoff === 'string' ? { location: b.dropoff } : b.dropoff,
                    pickupDateTime: b.pickupDateTime || (b as any).startDate,
                }));
                setAllBookings(enriched);

                const today = dayjs().startOf('day');
                const todayBks = enriched.filter(b => dayjs(b.pickupDateTime).isSame(today, 'day'));

                setStats({
                    total: enriched.length,
                    pending: enriched.filter(b => b.status === 'PENDING').length,
                    confirmed: enriched.filter(b => b.status === 'CONFIRMED').length,
                    inProgress: enriched.filter(b => b.status === 'IN_PROGRESS').length,
                    completed: enriched.filter(b => b.status === 'COMPLETED').length,
                    cancelled: enriched.filter(b => b.status === 'CANCELLED').length,
                    inPool: enriched.filter(b => b.operationalStatus === 'IN_POOL').length,
                    todayCount: todayBks.length,
                });

                // Upcoming: next 24h, active or pending
                const now = dayjs();
                const upcoming = enriched
                    .filter(b => ['PENDING', 'CONFIRMED'].includes(b.status))
                    .filter(b => dayjs(b.pickupDateTime).isAfter(now.subtract(2, 'hour')))
                    .sort((a, b) => dayjs(a.pickupDateTime).valueOf() - dayjs(b.pickupDateTime).valueOf())
                    .slice(0, 8);
                setUpcomingBookings(upcoming);

                // Active: IN_PROGRESS
                const active = enriched.filter(b => b.status === 'IN_PROGRESS');
                setActiveBookings(active);
            }

            if (driversRes.data.success) {
                const driverList: Driver[] = driversRes.data.data;
                setDrivers(driverList);
                const online = new Set<string>();
                const locs: Record<string, { lat: number; lng: number; speed?: number }> = {};
                driverList.forEach(d => {
                    // Online if seen within last 3 minutes (native service syncs every 15s)
                    if (d.lastSeenAt && dayjs().diff(dayjs(d.lastSeenAt), 'second') <= 300) {
                        online.add(d.id);
                    }
                    if (d.location) locs[d.id] = d.location;
                });
                setOnlineDriverIds(online);
                setDriverLocations(locs);
            }

            setLastUpdated(dayjs());
        } catch {
            message.error('Veriler yüklenemedi');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        // Poll every 10s for near-real-time tracking (no socket dependency)
        const interval = setInterval(() => fetchAll(true), 10000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    // Socket listeners
    useEffect(() => {
        if (!socket) return;
        const handleLocUpdate = (data: { driverId: string; lat: string; lng: string; speed?: string }) => {
            const loc = { lat: parseFloat(data.lat as any), lng: parseFloat(data.lng as any), speed: data.speed ? parseFloat(data.speed as any) : undefined };
            setDriverLocations(prev => ({ ...prev, [data.driverId]: loc }));
            setOnlineDriverIds(prev => new Set([...prev, data.driverId]));
        };
        const handleStatusUpdate = (data: { bookingId: string; status: string }) => {
            setAllBookings(prev => prev.map(b => b.id === data.bookingId ? { ...b, status: data.status } : b));
        };
        const handleNewBooking = () => fetchAll(true);

        socket.on('driver_location', handleLocUpdate);
        socket.on('booking_status_update', handleStatusUpdate);
        socket.on('new_booking', handleNewBooking);

        // Real-time connection events for debugging
        const handleConnectionEvent = (data: any) => {
            setRealtimeEvents(prev => {
                const next = [...prev, data];
                return next.length > 100 ? next.slice(-100) : next;
            });
            // If the log drawer is open for this driver, append in real-time
            setDriverLogs(prev => {
                if (prev.length === 0) return prev; // drawer not loaded yet
                return [...prev, data];
            });
        };
        socket.on('driver_connection_event', handleConnectionEvent);

        return () => {
            socket.off('driver_location', handleLocUpdate);
            socket.off('booking_status_update', handleStatusUpdate);
            socket.off('new_booking', handleNewBooking);
            socket.off('driver_connection_event', handleConnectionEvent);
        };
    }, [socket, fetchAll]);

    // Open driver connection log drawer
    const openDriverLog = async (driver: Driver) => {
        setSelectedDriverForLog(driver);
        setDriverLogDrawer(true);
        setLoadingLogs(true);
        try {
            const res = await apiClient.get(`/api/driver/connection-logs/${driver.id}`);
            if (res.data.success) {
                setDriverLogs(res.data.data);
            }
        } catch {
            // Fallback to inline data from /online endpoint
            setDriverLogs(driver.recentConnectionEvents || []);
        } finally {
            setLoadingLogs(false);
        }
    };

    // Event type configuration for display
    const eventConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
        SOCKET_CONNECT: { color: '#10b981', icon: <LinkOutlined />, label: 'Socket Bağlandı' },
        SOCKET_DISCONNECT: { color: '#ef4444', icon: <DisconnectOutlined />, label: 'Socket Koptu' },
        HTTP_SYNC: { color: '#3b82f6', icon: <ApiOutlined />, label: 'HTTP Sync' },
        TOKEN_AUTO_REFRESH: { color: '#f59e0b', icon: <SafetyCertificateOutlined />, label: 'Token Yenilendi' },
        AUTH_FAILED: { color: '#ef4444', icon: <WarningOutlined />, label: 'Auth Başarısız' },
        OFFLINE: { color: '#6b7280', icon: <DisconnectOutlined />, label: 'Offline Oldu' },
    };

    const driversForMap = drivers.filter(d => onlineDriverIds.has(d.id) && driverLocations[d.id]).map(d => {
        const speedMS = driverLocations[d.id].speed || 0;
        const speedKmH = speedMS * 3.6;
        const hasJob = !!(d as any).currentBooking;
        const status: 'idle' | 'on_job' | 'speeding' | 'offline' = speedKmH > 120 ? 'speeding' : hasJob ? 'on_job' : 'idle';
        return {
            driverId: d.id,
            driverName: d.fullName,
            lat: driverLocations[d.id].lat,
            lng: driverLocations[d.id].lng,
            speed: speedKmH, // Map expects km/h
            timestamp: d.lastSeenAt || new Date().toISOString(),
            heading: 0,
            status,
            vehicle: (d as any).vehicle || null,
            currentJob: (d as any).currentBooking ? {
                pickup: (d as any).currentBooking.pickup,
                dropoff: (d as any).currentBooking.dropoff,
                contactName: (d as any).currentBooking.contactName,
            } : null,
            speedViolations: (d as any).speedViolations || 0
        };
    });


    const openDetail = (booking: Booking) => {
        setSelectedBooking(booking);
        setDetailDrawer(true);
    };

    const upcomingColumns = [
        {
            title: 'Rezervasyon',
            key: 'info',
            render: (_: any, r: Booking) => {
                const mins = dayjs(r.pickupDateTime).diff(dayjs(), 'minute');
                const isUrgent = mins <= 60 && mins >= 0;
                return (
                    <Space>
                        <Avatar style={{ background: isUrgent ? '#ef4444' : '#6366f1', fontSize: 11 }} size={32}>
                            {r.contactName?.charAt(0)?.toUpperCase() || '?'}
                        </Avatar>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.contactName}</div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                                <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{r.bookingNumber}</Tag>
                            </div>
                        </div>
                        {isUrgent && <AlertOutlined style={{ color: '#ef4444' }} />}
                    </Space>
                );
            },
        },
        {
            title: 'Tarih / Saat',
            key: 'datetime',
            width: 100,
            render: (_: any, r: Booking) => {
                const dt = dayjs(r.pickupDateTime);
                const diff = dt.fromNow();
                return (
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{dt.format('HH:mm')}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{dt.format('DD.MM')}</div>
                        <div style={{ fontSize: 10, color: dt.isBefore(dayjs()) ? '#ef4444' : '#10b981' }}>{diff}</div>
                    </div>
                );
            }
        },
        {
            title: 'Güzergah',
            key: 'route',
            render: (_: any, r: Booking) => (
                <div style={{ fontSize: 11 }}>
                    <div style={{ color: '#10b981' }}>↑ {r.pickup?.location?.substring(0, 25) || '-'}</div>
                    <div style={{ color: '#ef4444' }}>↓ {r.dropoff?.location?.substring(0, 25) || '-'}</div>
                </div>
            ),
        },
        {
            title: 'Durum',
            key: 'status',
            width: 90,
            render: (_: any, r: Booking) => (
                <Badge
                    status={r.status === 'CONFIRMED' ? 'processing' : 'warning'}
                    text={<span style={{ fontSize: 11 }}>{getStatusLabel(r.status, r.operationalStatus)}</span>}
                />
            ),
        },
        {
            title: '',
            key: 'action',
            width: 40,
            render: (_: any, r: Booking) => (
                <Tooltip title="Detay">
                    <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openDetail(r)} />
                </Tooltip>
            )
        }
    ];

    const onlineDriversCount = onlineDriverIds.size;
    const onlineDriversWithLoc = drivers.filter(d => onlineDriverIds.has(d.id) && driverLocations[d.id]);

    return (
        <AdminGuard>
            <AdminLayout selectedKey="op-dashboard">
                <div style={{ padding: '0 0 24px' }}>
                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <DashboardOutlined style={{ color: '#6366f1' }} />
                                Operasyon Merkezi
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Son güncelleme: {lastUpdated.format('HH:mm:ss')}
                                <Badge count={onlineDriversCount} style={{ marginLeft: 12, background: '#10b981' }} overflowCount={99} showZero />
                                <span style={{ marginLeft: 6, fontSize: 11, color: '#10b981' }}>şoför çevrimiçi</span>
                            </Text>
                        </div>
                        <Space>
                            <Button icon={<SyncOutlined spin={refreshing} />} onClick={() => fetchAll(true)} loading={refreshing}>Yenile</Button>
                            <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => router.push('/admin/operation/operations')}>
                                Operasyon Tablosu
                            </Button>
                        </Space>
                    </div>

                    {/* ── KPI Cards ── */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                        {[
                            { label: 'Bugün Toplam', value: stats.todayCount, color: '#6366f1', icon: <CalendarOutlined /> },
                            { label: 'Beklemede', value: stats.pending, color: '#f59e0b', icon: <ClockCircleOutlined /> },
                            { label: 'Onaylı', value: stats.confirmed, color: '#3b82f6', icon: <CheckCircleOutlined /> },
                            { label: 'Aktif Sefer', value: stats.inProgress, color: '#8b5cf6', icon: <ThunderboltOutlined />, pulse: true },
                            { label: 'Havuzda', value: stats.inPool, color: '#06b6d4', icon: <AimOutlined /> },
                            { label: 'Tamamlanan', value: stats.completed, color: '#10b981', icon: <StarOutlined /> },
                        ].map((item, idx) => (
                            <Col xs={12} sm={8} lg={4} key={idx}>
                                <Card
                                    variant="borderless"
                                    style={{
                                        borderRadius: 12,
                                        background: `linear-gradient(135deg, ${item.color}15, ${item.color}08)`,
                                        borderLeft: `3px solid ${item.color}`,
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s',
                                    }}
                                    styles={{ body: { padding: '14px 16px' } }}
                                    hoverable
                                    onClick={() => router.push('/admin/operation/operations')}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{item.label}</div>
                                            <div style={{ fontSize: 28, fontWeight: 700, color: item.color, lineHeight: 1 }}>
                                                {loading ? <Spin size="small" /> : item.value}
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: 20, color: item.color, opacity: 0.8,
                                            animation: item.pulse && item.value > 0 ? 'pulse 2s infinite' : undefined
                                        }}>
                                            {item.icon}
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    {/* ── Main Content ── */}
                    <Row gutter={[16, 16]}>
                        {/* Left: Map + Active Seferler */}
                        <Col xs={24} lg={15}>
                            {/* Live Map */}
                            <Card
                                title={
                                    <Space>
                                        <CompassOutlined style={{ color: '#6366f1' }} />
                                        <span>Canlı Konum Haritası</span>
                                        <Badge count={onlineDriversWithLoc.length} style={{ background: '#10b981' }} showZero />
                                    </Space>
                                }
                                extra={
                                    <Space size={4}>
                                        <Badge color="#10b981" text={<span style={{ fontSize: 11 }}>Çevrimiçi</span>} />
                                        <Badge color="#6b7280" text={<span style={{ fontSize: 11 }}>Çevrimdışı</span>} />
                                    </Space>
                                }
                                variant="borderless"
                                style={{ borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}
                                styles={{ body: { padding: 0 } }}
                            >
                                <div style={{ width: '100%', height: 300, background: '#1a1a2e', borderRadius: '0 0 12px 12px', position: 'relative', overflow: 'hidden' }}>
                                    <HereLiveMapClient
                                        drivers={driversForMap}
                                        selectedDriver={selectedDriver}
                                        onSelectDriver={setSelectedDriver}
                                    />
                                </div>
                            </Card>

                            {/* Upcoming Transfers */}
                            <Card
                                title={
                                    <Space>
                                        <ClockCircleOutlined style={{ color: '#f59e0b' }} />
                                        <span>Yaklaşan Transferler</span>
                                    </Space>
                                }
                                extra={
                                    <Button size="small" type="link" onClick={() => router.push('/admin/operation/operations')}>
                                        Tümünü Gör <ArrowRightOutlined />
                                    </Button>
                                }
                                variant="borderless"
                                style={{ borderRadius: 12 }}
                                styles={{ body: { padding: '0 0 8px' } }}
                            >
                                <Table
                                    columns={upcomingColumns}
                                    dataSource={upcomingBookings}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    loading={loading}
                                    locale={{ emptyText: <Empty description="Yaklaşan transfer yok" /> }}
                                    rowClassName={(r: Booking) => {
                                        const mins = dayjs(r.pickupDateTime).diff(dayjs(), 'minute');
                                        return mins <= 60 && mins >= 0 ? 'urgent-row' : '';
                                    }}
                                />
                            </Card>
                        </Col>

                        {/* Right: Drivers, Active, Quick Actions */}
                        <Col xs={24} lg={9}>
                            {/* Active Seferler */}
                            {activeBookings.length > 0 && (
                                <Card
                                    title={
                                        <Space>
                                            <Badge status="processing" color="#8b5cf6" />
                                            <span>Aktif Seferler</span>
                                            <Tag color="purple">{activeBookings.length}</Tag>
                                        </Space>
                                    }
                                    variant="borderless"
                                    style={{ borderRadius: 12, marginBottom: 16 }}
                                    styles={{ body: { padding: '8px 16px' } }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                        {activeBookings.map(b => (
                                            <div key={b.id}
                                                style={{
                                                    background: 'linear-gradient(135deg, #8b5cf615, #6366f108)',
                                                    borderRadius: 10, padding: '10px 12px',
                                                    borderLeft: '3px solid #8b5cf6', cursor: 'pointer'
                                                }}
                                                onClick={() => openDetail(b)}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Space size={6}>
                                                        <Avatar size={28} style={{ background: '#8b5cf6', fontSize: 11 }}>
                                                            {b.contactName?.charAt(0)}
                                                        </Avatar>
                                                        <div>
                                                            <div style={{ fontSize: 12, fontWeight: 600 }}>{b.contactName}</div>
                                                            <div style={{ fontSize: 11, color: '#888' }}>{b.bookingNumber}</div>
                                                        </div>
                                                    </Space>
                                                    <Badge status="processing" color="#8b5cf6" text={<span style={{ fontSize: 10 }}>Yolda</span>} />
                                                </div>
                                                <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                                                    <span style={{ color: '#10b981' }}>↑</span> {b.pickup?.location?.substring(0, 20)} →{' '}
                                                    <span style={{ color: '#ef4444' }}>↓</span> {b.dropoff?.location?.substring(0, 20)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            )}

                            {/* Online Drivers */}
                            <Card
                                title={
                                    <Space>
                                        <WifiOutlined style={{ color: '#10b981' }} />
                                        <span>Sürücüler</span>
                                    </Space>
                                }
                                extra={<Tag color={onlineDriversCount > 0 ? 'green' : 'default'}>{onlineDriversCount} aktif</Tag>}
                                variant="borderless"
                                style={{ borderRadius: 12, marginBottom: 16 }}
                                styles={{ body: { padding: '8px 16px 16px' } }}
                            >
                                {loading ? <Spin /> : drivers.length === 0 ? (
                                    <Empty description="Sürücü bulunamadı" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                        {drivers.slice(0, 6).map(d => {
                                            const isOnline = onlineDriverIds.has(d.id);
                                            const loc = driverLocations[d.id];
                                            const lastSeen = d.lastSeenAt ? dayjs(d.lastSeenAt).fromNow() : null;
                                            return (
                                                <div key={d.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '8px 10px', borderRadius: 8,
                                                    background: isOnline ? '#10b98108' : 'transparent',
                                                    border: `1px solid ${isOnline ? '#10b98130' : '#f0f0f0'}`,
                                                    cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                                    onClick={() => openDriverLog(d)}
                                                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                                                    onMouseLeave={e => (e.currentTarget.style.borderColor = isOnline ? '#10b98130' : '#f0f0f0')}
                                                >
                                                    <Badge dot status={isOnline ? 'success' : 'default'}>
                                                        <Avatar src={getImageUrl(d.avatar)} size={34} style={{ background: '#6366f1' }}>
                                                            {d.firstName?.charAt(0)}
                                                        </Avatar>
                                                    </Badge>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{d.fullName}</div>
                                                        <div style={{ fontSize: 11, color: '#888' }}>
                                                            {d.jobTitle || 'Şoför'}
                                                            {loc?.speed !== undefined ? ` • ${Math.round(loc.speed)} km/h` : ''}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontSize: 11 }}>
                                                        {isOnline ? (
                                                            <span style={{ color: '#10b981', fontWeight: 600 }}>Çevrimiçi</span>
                                                        ) : (
                                                            <span style={{ color: '#9ca3af' }}>{lastSeen || 'Bilinmiyor'}</span>
                                                        )}
                                                        {loc && (
                                                            <div>
                                                                <EnvironmentOutlined style={{ color: '#6366f1', fontSize: 10 }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {!isOnline && (
                                                        <Tooltip title="Şöförü Uyandır (Silent Push)">
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                icon={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    try {
                                                                        await apiClient.post(`/api/driver/${d.id}/wake`);
                                                                        message.success(`${d.fullName} uyandırıldı`);
                                                                    } catch {
                                                                        message.error('Push token yok veya hata oluştu');
                                                                    }
                                                                }}
                                                            />
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip title="Bağlantı Geçmişi">
                                                        <HistoryOutlined style={{ color: '#9ca3af', fontSize: 14 }} />
                                                    </Tooltip>
                                                </div>
                                            );
                                        })}
                                        {drivers.length > 6 && (
                                            <Button block size="small" type="link" onClick={() => router.push('/admin/personnel')}>
                                                +{drivers.length - 6} daha göster
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </Card>

                            {/* Quick Actions */}
                            <Card
                                title="Hızlı İşlemler"
                                variant="borderless"
                                style={{ borderRadius: 12, marginBottom: 12 }}
                                styles={{ body: { padding: '8px 16px 16px' } }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                    {[
                                        { label: 'Operasyon Tablosu', icon: <DashboardOutlined />, link: '/admin/operation/operations', color: '#6366f1' },
                                        { label: 'Havuz Yönetimi', icon: <AimOutlined />, link: '/admin/operation/pool', color: '#06b6d4', badge: stats.inPool },
                                        { label: 'Partner Transferleri', icon: <TeamOutlined />, link: '/admin/operation/partner-transfers', color: '#f59e0b' },
                                        { label: 'Araç Takibi', icon: <CarOutlined />, link: '/admin/vehicle-tracking', color: '#8b5cf6' },
                                        { label: 'Rezervasyon Yönetimi', icon: <CalendarOutlined />, link: '/admin/transfers', color: '#10b981' },
                                    ].map((item, i) => (
                                        <div key={i}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                                background: '#fafafa', border: '1px solid #f0f0f0',
                                                transition: 'all 0.2s'
                                            }}
                                            onClick={() => router.push(item.link)}
                                            onMouseEnter={e => (e.currentTarget.style.borderColor = item.color)}
                                            onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}
                                        >
                                            <span style={{ color: item.color, fontSize: 16 }}>{item.icon}</span>
                                            <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{item.label}</span>
                                            {item.badge ? <Tag color="cyan">{item.badge}</Tag> : null}
                                            <ArrowRightOutlined style={{ color: '#ccc', fontSize: 12 }} />
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            {/* System Status */}
                            <Card
                                title="Sistem Durumu"
                                variant="borderless"
                                style={{ borderRadius: 12 }}
                                styles={{ body: { padding: '12px 16px' } }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                    {[
                                        { label: 'API Sunucusu', status: 'online' },
                                        { label: 'Socket Bağlantısı', status: socket?.connected ? 'online' : 'offline' },
                                        { label: 'Canlı Takip', status: onlineDriversCount > 0 ? 'online' : 'idle' },
                                    ].map((s, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 13 }}>{s.label}</Text>
                                            <Tag color={s.status === 'online' ? 'green' : s.status === 'idle' ? 'gold' : 'red'}>
                                                {s.status === 'online' ? 'Online' : s.status === 'idle' ? 'Bekleniyor' : 'Offline'}
                                            </Tag>
                                        </div>
                                    ))}
                                    <Divider style={{ margin: '8px 0' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Son yenileme</Text>
                                        <Text style={{ fontSize: 11 }}>{lastUpdated.format('HH:mm:ss')}</Text>
                                    </div>
                                    <Progress
                                        percent={100}
                                        showInfo={false}
                                        strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
                                        size="small"
                                        style={{ marginTop: -4 }}
                                    />
                                </div>
                            </Card>
                        </Col>
                    </Row>
                </div>

                {/* Booking Detail Drawer */}
                <Drawer
                    title={
                        <Space>
                            <Avatar style={{ background: '#6366f1' }}>{selectedBooking?.contactName?.charAt(0)}</Avatar>
                            <div>
                                <div style={{ fontWeight: 600 }}>{selectedBooking?.contactName}</div>
                                <Tag color="blue" style={{ fontSize: 11 }}>{selectedBooking?.bookingNumber}</Tag>
                            </div>
                        </Space>
                    }
                    placement="right"
                    open={detailDrawer}
                    onClose={() => setDetailDrawer(false)}
                    extra={
                        <Button type="primary" size="small" onClick={() => {
                            setDetailDrawer(false);
                            router.push('/admin/operation/operations');
                        }}>
                            Tabloda Aç
                        </Button>
                    }
                >
                    {selectedBooking && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                            {/* Status */}
                            <Card style={{ borderRadius: 10, background: `${getStatusColor(selectedBooking.status)}10`, border: `1px solid ${getStatusColor(selectedBooking.status)}30` }} styles={{ body: { padding: 12 } }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: getStatusColor(selectedBooking.status) }}>
                                        {getStatusLabel(selectedBooking.status, selectedBooking.operationalStatus)}
                                    </div>
                                </div>
                            </Card>

                            {/* Route */}
                            <Card variant="borderless" style={{ borderRadius: 10, background: '#fafafa' }} styles={{ body: { padding: 12 } }}>
                                <Timeline
                                    items={[
                                        {
                                            color: '#10b981',
                                            dot: <EnvironmentOutlined style={{ color: '#10b981' }} />,
                                            children: (
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>Alış</div>
                                                    <div style={{ fontSize: 12 }}>{selectedBooking.pickup?.location || '-'}</div>
                                                    <div style={{ fontSize: 11, color: '#888' }}>
                                                        {dayjs(selectedBooking.pickupDateTime).format('DD.MM.YYYY HH:mm')}
                                                    </div>
                                                </div>
                                            )
                                        },
                                        {
                                            color: '#ef4444',
                                            dot: <AimOutlined style={{ color: '#ef4444' }} />,
                                            children: (
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#ef4444' }}>Bırakış</div>
                                                    <div style={{ fontSize: 12 }}>{selectedBooking.dropoff?.location || '-'}</div>
                                                </div>
                                            )
                                        }
                                    ]}
                                />
                            </Card>

                            {/* Details */}
                            {[
                                { label: 'Müşteri', value: selectedBooking.contactName },
                                { label: 'Telefon', value: selectedBooking.contactPhone, icon: <PhoneOutlined /> },
                                { label: 'Yolcu Sayısı', value: selectedBooking.adults ? `${selectedBooking.adults} kişi` : '-' },
                                { label: 'Araç Tipi', value: selectedBooking.vehicleType || '-', icon: <CarOutlined /> },
                                { label: 'Uçuş Kodu', value: selectedBooking.flightNumber || '-' },
                                { label: 'Tutar', value: `${selectedBooking.total} ${selectedBooking.currency}` },
                                { label: 'Acente', value: selectedBooking.agencyName || 'Direkt Satış' },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                                    <Text style={{ fontSize: 12, fontWeight: 500 }}>{item.value}</Text>
                                </div>
                            ))}
                        </div>
                    )}
                </Drawer>

                {/* Driver Connection Log Drawer */}
                <Drawer
                    title={
                        <Space>
                            <HistoryOutlined style={{ color: '#6366f1' }} />
                            <div>
                                <div style={{ fontWeight: 600 }}>{selectedDriverForLog?.fullName}</div>
                                <div style={{ fontSize: 11, color: '#888' }}>Bağlantı Geçmişi</div>
                            </div>
                        </Space>
                    }
                    placement="right"
                    width={420}
                    open={driverLogDrawer}
                    onClose={() => setDriverLogDrawer(false)}
                    extra={
                        <Button size="small" onClick={() => selectedDriverForLog && openDriverLog(selectedDriverForLog)}>
                            <SyncOutlined /> Yenile
                        </Button>
                    }
                >
                    {loadingLogs ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                    ) : driverLogs.length === 0 ? (
                        <Empty description="Henüz bağlantı kaydı yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ) : (
                        <div>
                            {/* Summary stats */}
                            <Card style={{ marginBottom: 16, borderRadius: 10 }} styles={{ body: { padding: 12 } }}>
                                <Row gutter={[8, 8]}>
                                    {(() => {
                                        const stats = [
                                            { label: 'Bağlantı', count: driverLogs.filter(l => l.event === 'SOCKET_CONNECT').length, color: '#10b981' },
                                            { label: 'Kopma', count: driverLogs.filter(l => l.event === 'SOCKET_DISCONNECT').length, color: '#ef4444' },
                                            { label: 'HTTP Sync', count: driverLogs.filter(l => l.event === 'HTTP_SYNC').length, color: '#3b82f6' },
                                            { label: 'Token Yenileme', count: driverLogs.filter(l => l.event === 'TOKEN_AUTO_REFRESH').length, color: '#f59e0b' },
                                            { label: 'Hata', count: driverLogs.filter(l => l.event === 'AUTH_FAILED' || l.event === 'OFFLINE').length, color: '#6b7280' },
                                        ];
                                        return stats.map((s, i) => (
                                            <Col span={i < 3 ? 8 : 12} key={i}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</div>
                                                    <div style={{ fontSize: 10, color: '#888' }}>{s.label}</div>
                                                </div>
                                            </Col>
                                        ));
                                    })()}
                                </Row>
                            </Card>

                            {/* Timeline */}
                            <Timeline
                                items={[...driverLogs].reverse().map((log, i) => {
                                    const cfg = eventConfig[log.event] || { color: '#6b7280', icon: <ClockCircleOutlined />, label: log.event };
                                    const time = dayjs(log.ts);
                                    const details: string[] = [];
                                    if (log.reason) details.push(`Neden: ${log.reason}`);
                                    if (log.source) details.push(`Kaynak: ${log.source}`);
                                    if (log.socketId) details.push(`Socket: ${log.socketId.substring(0, 8)}...`);
                                    if (log.hasLocation !== undefined) details.push(log.hasLocation ? 'Konum var' : 'Konum yok');
                                    if (log.tokenAutoRenewed) details.push('Token otomatik yenilendi');
                                    if (log.lastSeenAgoSec !== undefined && log.lastSeenAgoSec !== null) details.push(`Son görülme: ${log.lastSeenAgoSec}s önce`);
                                    if (log.hadSocket !== undefined) details.push(log.hadSocket ? 'Socket aktifti' : 'Socket yoktu');
                                    if (log.error) details.push(`Hata: ${log.error}`);
                                    if (log.via) details.push(`Via: ${log.via}`);

                                    return {
                                        color: cfg.color,
                                        dot: <span style={{ color: cfg.color }}>{cfg.icon}</span>,
                                        children: (
                                            <div style={{ paddingBottom: 4 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Tag color={cfg.color} style={{ fontSize: 11, margin: 0 }}>{cfg.label}</Tag>
                                                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{time.format('HH:mm:ss')}</span>
                                                </div>
                                                {details.length > 0 && (
                                                    <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
                                                        {details.map((d, j) => (
                                                            <div key={j}>• {d}</div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: 10, color: '#c0c0c0', marginTop: 2 }}>{time.fromNow()}</div>
                                            </div>
                                        )
                                    };
                                })}
                            />
                        </div>
                    )}
                </Drawer>

                <style>{`
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }
                    .urgent-row td { background: #fef2f2 !important; }
                    .urgent-row:hover td { background: #fee2e2 !important; }
                `}</style>
            </AdminLayout>
        </AdminGuard>
    );
}
