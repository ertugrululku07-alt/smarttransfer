'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useSocket } from '@/app/context/SocketContext';
import apiClient from '@/lib/api-client';
import { Badge, Spin, Input, Typography, Empty, Tooltip } from 'antd';
import {
    DashboardOutlined, EnvironmentOutlined, ClockCircleOutlined,
    SearchOutlined, ReloadOutlined, CompassOutlined, ExpandOutlined, CompressOutlined,
    CarOutlined, UserOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/tr';
import dynamic from 'next/dynamic';
import type { DriverMapData } from '@/app/admin/live-map/HereLiveMapClient';

dayjs.extend(relativeTime);
dayjs.locale('tr');

const { Text } = Typography;

// We can reuse the admin HereLiveMapClient
const HereLiveMapClient = dynamic(() => import('@/app/admin/live-map/HereLiveMapClient'), {
    ssr: false,
    loading: () => (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', background: '#f1f5f9', borderRadius: 16 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#64748b', fontSize: 13 }}>Harita yükleniyor...</div>
        </div>
    )
});

interface PartnerDriverRaw {
    id: string;
    fullName: string;
    phone?: string;
    avatar?: string;
    location?: { lat: number; lng: number; speed?: number; heading?: number; ts?: string };
    lastSeenAt?: string;
    socketId?: string;
    activeBookings?: any[];
    currentBooking?: any;
    todayJobCount?: number;
    vehicle?: any;
}

const STATUS_COLORS = {
    on_job:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6', label: 'Seferde' },
    idle:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e', label: 'Boşta' },
    offline:  { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', dot: '#9ca3af', label: 'Çevrimdışı' },
};

function getDriverStatus(d: PartnerDriverRaw): 'on_job' | 'idle' | 'offline' {
    const isOnline = d.lastSeenAt && dayjs().diff(dayjs(d.lastSeenAt), 'second') <= 90;
    if (!isOnline) return 'offline';
    if (d.currentBooking) return 'on_job';
    return 'idle';
}

const PartnerDispatchPage = () => {
    const { socket, isConnected } = useSocket();
    const [rawDrivers, setRawDrivers] = useState<PartnerDriverRaw[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sidebarExpanded, setSidebarExpanded] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);

    const fetchDrivers = async () => {
        try {
            const res = await apiClient.get('/api/transfer/partner/live-drivers');
            if (res.data?.success && Array.isArray(res.data.data)) {
                setRawDrivers(res.data.data);
                setLastUpdate(new Date());
            }
        } catch (err) {
            console.error('Failed to fetch partner live drivers:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrivers();
        const interval = setInterval(fetchDrivers, 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handleLoc = (data: any) => {
            setRawDrivers(prev => prev.map(d => {
                if (d.id !== data.driverId) return d;
                return {
                    ...d,
                    location: {
                        ...d.location,
                        lat: parseFloat(data.lat),
                        lng: parseFloat(data.lng),
                        speed: data.speed ? parseFloat(data.speed) : d.location?.speed,
                        heading: data.heading ? parseFloat(data.heading) : d.location?.heading,
                        ts: data.timestamp
                    },
                    lastSeenAt: new Date().toISOString(),
                    socketId: d.socketId || 'live'
                };
            }));
        };
        socket.on('driver_location', handleLoc);
        return () => { socket.off('driver_location', handleLoc); };
    }, [socket]);

    const mapDrivers: DriverMapData[] = useMemo(() => rawDrivers.filter(d => d.location?.lat && d.location?.lng).map(d => ({
        driverId: d.id,
        driverName: d.fullName,
        lat: d.location!.lat,
        lng: d.location!.lng,
        speed: d.location?.speed ? parseFloat(String(d.location.speed)) : 0,
        timestamp: d.location?.ts || d.lastSeenAt || new Date().toISOString(),
        heading: d.location?.heading || 0,
        status: getDriverStatus(d) === 'on_job' ? 'on_job' : getDriverStatus(d) === 'idle' ? 'idle' : 'offline',
        currentJob: d.currentBooking ? {
            pickup: d.currentBooking.pickup,
            dropoff: d.currentBooking.dropoff,
            contactName: d.currentBooking.contactName,
            startDate: d.currentBooking.startDate
        } : null,
        vehicle: d.vehicle || null,
        speedViolations: 0 // Not emphasizing speed violations for partner right now
    })), [rawDrivers]);

    const selectedMapDriver = mapDrivers.find(d => d.driverId === selectedDriverId) || null;

    const stats = useMemo(() => {
        const all = rawDrivers.map(d => getDriverStatus(d));
        return {
            total: rawDrivers.length,
            onJob: all.filter(s => s === 'on_job').length,
            idle: all.filter(s => s === 'idle').length,
            offline: all.filter(s => s === 'offline').length
        };
    }, [rawDrivers]);

    const filteredDrivers = useMemo(() => {
        let list = [...rawDrivers];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(d => d.fullName.toLowerCase().includes(q) || d.phone?.includes(q));
        }
        const order = { on_job: 1, idle: 2, offline: 3 };
        list.sort((a, b) => (order[getDriverStatus(a)] ?? 9) - (order[getDriverStatus(b)] ?? 9));
        return list;
    }, [rawDrivers, search]);

    return (
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#f1f5f9', overflow: 'hidden', margin: '-24px', padding: 0 }}>
                    {/* ── TOP BAR ── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                        background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
                            <CompassOutlined style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
                            <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Operasyon Merkezi</span>
                        </div>
                        {[
                            { label: 'Tümü', value: stats.total, color: '#475569', bg: '#f1f5f9' },
                            { label: 'Seferde', value: stats.onJob, color: '#1d4ed8', bg: '#eff6ff' },
                            { label: 'Boşta', value: stats.idle, color: '#15803d', bg: '#f0fdf4' },
                            { label: 'Çevrimdışı', value: stats.offline, color: '#6b7280', bg: '#f9fafb' },
                        ].map(s => (
                            <div key={s.label} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 12px', borderRadius: 20, background: s.bg,
                                fontSize: 12, fontWeight: 600, color: s.color, border: `1px solid ${s.color}20`
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                                {s.label}: {s.value}
                            </div>
                        ))}
                        <div style={{ flex: 1 }} />
                        <Tooltip title="Yenile">
                            <div onClick={fetchDrivers} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: '#f1f5f9' }}>
                                <ReloadOutlined style={{ fontSize: 13, color: '#64748b' }} />
                            </div>
                        </Tooltip>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{dayjs(lastUpdate).format('HH:mm:ss')}</span>
                    </div>

                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        {/* ── MAP ── */}
                        <div style={{ flex: 1, position: 'relative', margin: 8, marginRight: sidebarExpanded ? 0 : 8 }}>
                            <HereLiveMapClient
                                drivers={mapDrivers}
                                selectedDriver={selectedMapDriver}
                                onSelectDriver={(d) => setSelectedDriverId(d?.driverId || null)}
                                routePoints={[]}
                                routeStops={[]}
                            />
                            {/* Expand/Collapse sidebar */}
                            <div
                                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                                style={{
                                    position: 'absolute', top: 16, right: 16, width: 32, height: 32,
                                    background: 'rgba(255,255,255,0.95)', borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                                }}
                            >
                                {sidebarExpanded ? <CompressOutlined style={{ fontSize: 14 }} /> : <ExpandOutlined style={{ fontSize: 14 }} />}
                            </div>
                        </div>

                        {/* ── SIDEBAR ── */}
                        {sidebarExpanded && (
                            <div style={{
                                width: 320, background: '#fff', borderLeft: '1px solid #e2e8f0',
                                display: 'flex', flexDirection: 'column', flexShrink: 0
                            }}>
                                <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <Input
                                        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                        placeholder="Sürücü ara..."
                                        size="middle"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        allowClear
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                                    {loading ? (
                                        <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
                                    ) : filteredDrivers.length === 0 ? (
                                        <Empty description="Sürücü bulunamadı" style={{ padding: 40 }} />
                                    ) : (
                                        filteredDrivers.map(d => {
                                            const status = getDriverStatus(d);
                                            const cfg = STATUS_COLORS[status];
                                            const isSelected = selectedDriverId === d.id;
                                            const speed = d.location?.speed ? Math.round(parseFloat(String(d.location.speed))) : 0;
                                            return (
                                                <div
                                                    key={d.id}
                                                    onClick={() => setSelectedDriverId(isSelected ? null : d.id)}
                                                    style={{
                                                        margin: '3px 8px', padding: '10px 12px',
                                                        borderRadius: 12, cursor: 'pointer',
                                                        background: isSelected ? cfg.bg : '#fff',
                                                        border: `1.5px solid ${isSelected ? cfg.border : '#f1f5f9'}`,
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{
                                                            width: 38, height: 38, borderRadius: '50%',
                                                            background: `linear-gradient(135deg, ${cfg.dot}, ${cfg.dot}cc)`,
                                                            color: '#fff', display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center', fontWeight: 800, fontSize: 14,
                                                            boxShadow: `0 2px 8px ${cfg.dot}40`, flexShrink: 0
                                                        }}>
                                                            {d.fullName.charAt(0)}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{d.fullName}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                                                <span style={{
                                                                    fontSize: 10, fontWeight: 600, color: cfg.text,
                                                                    background: cfg.bg, padding: '1px 8px',
                                                                    borderRadius: 10, border: `1px solid ${cfg.border}`
                                                                }}>{cfg.label}</span>
                                                                {speed > 0 && (
                                                                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#64748b' }}>
                                                                        <DashboardOutlined /> {speed} km/s
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {(d.todayJobCount || 0) > 0 && (
                                                            <div style={{
                                                                background: '#eff6ff', color: '#1d4ed8', fontSize: 10, fontWeight: 800,
                                                                padding: '2px 8px', borderRadius: 10, minWidth: 20, textAlign: 'center'
                                                            }}>
                                                                {d.todayJobCount} İş
                                                            </div>
                                                        )}
                                                    </div>

                                                    {d.currentBooking && isSelected && (
                                                        <div style={{
                                                            marginTop: 8, marginLeft: 48, padding: '8px 10px',
                                                            background: '#f8fafc', borderRadius: 8, fontSize: 11
                                                        }}>
                                                            <div style={{ fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>
                                                                <UserOutlined /> {d.currentBooking.contactName}
                                                            </div>
                                                            {d.currentBooking.pickup && (
                                                                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start', marginBottom: 2 }}>
                                                                    <EnvironmentOutlined style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
                                                                    <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {d.currentBooking.pickup.substring(0, 40)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {d.currentBooking.dropoff && (
                                                                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                                                                    <EnvironmentOutlined style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
                                                                    <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {d.currentBooking.dropoff.substring(0, 40)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {d.currentBooking.startDate && (
                                                                <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 10 }}>
                                                                    <ClockCircleOutlined /> {dayjs(d.currentBooking.startDate).format('HH:mm')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {status === 'offline' && d.lastSeenAt && (
                                                        <div style={{ marginTop: 4, marginLeft: 48, fontSize: 10, color: '#94a3b8' }}>
                                                            <ClockCircleOutlined /> Son: {dayjs(d.lastSeenAt).fromNow()}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
    );
};

export default PartnerDispatchPage;
