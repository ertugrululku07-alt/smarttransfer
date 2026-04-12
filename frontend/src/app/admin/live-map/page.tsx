'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSocket } from '@/app/context/SocketContext';
import apiClient from '@/lib/api-client';
import AdminLayout from '../AdminLayout';
import { Badge, Spin, Input, Tooltip, Typography, Empty, Drawer, Timeline, Tag } from 'antd';
import {
    CarOutlined, DashboardOutlined, EnvironmentOutlined, PhoneOutlined,
    ClockCircleOutlined, WarningOutlined, UserOutlined, SearchOutlined,
    ReloadOutlined, ExpandOutlined, CompressOutlined, AimOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/tr';
import dynamic from 'next/dynamic';
import type { DriverMapData } from './HereLiveMapClient';

dayjs.extend(relativeTime);
dayjs.locale('tr');

const { Text } = Typography;

const HereLiveMapClient = dynamic(() => import('./HereLiveMapClient'), {
    ssr: false,
    loading: () => (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', background: '#f1f5f9', borderRadius: 16 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#64748b', fontSize: 13 }}>Harita yükleniyor...</div>
        </div>
    )
});

interface DriverRaw {
    id: string;
    fullName: string;
    phone?: string;
    avatar?: string;
    location?: { lat: number; lng: number; speed?: number; heading?: number; ts?: string };
    lastSeenAt?: string;
    socketId?: string;
    activeBookings?: any[];
    currentBooking?: any;
    vehicle?: { plateNumber?: string; brand?: string; model?: string; color?: string };
    todayJobCount?: number;
    speedViolations?: number;
    lastViolation?: any;
}

const STATUS_COLORS = {
    on_job:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6', label: 'Seferde' },
    idle:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e', label: 'Boşta' },
    speeding: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#ef4444', label: 'Hız İhlali' },
    offline:  { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', dot: '#9ca3af', label: 'Çevrimdışı' },
};

function getDriverStatus(d: DriverRaw): 'on_job' | 'idle' | 'speeding' | 'offline' {
    const speed = d.location?.speed ? parseFloat(String(d.location.speed)) : 0;
    // 1. We strictly require fresh data. If no data arrived in 60s, they are offline.
    // We do NOT trust socketId alone because Airplane Mode causes 'ghost' sockets for ~45s.
    const isOnline = d.lastSeenAt && dayjs().diff(dayjs(d.lastSeenAt), 'second') <= 60;
    if (!isOnline) return 'offline';
    if (speed > 120) return 'speeding';
    if (d.currentBooking) return 'on_job';
    return 'idle';
}

const LiveMapPage = () => {
    const { socket, isConnected } = useSocket();
    const [rawDrivers, setRawDrivers] = useState<DriverRaw[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sidebarExpanded, setSidebarExpanded] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);
    const [violationDrawer, setViolationDrawer] = useState(false);
    const [violationDriverId, setViolationDriverId] = useState<string | null>(null);
    const [violationDriverName, setViolationDriverName] = useState('');
    const [violationData, setViolationData] = useState<Record<string, any[]>>({});
    const [violationLoading, setViolationLoading] = useState(false);
    const [violationTotalCount, setViolationTotalCount] = useState(0);

    const fetchDrivers = useCallback(async () => {
        try {
            const res = await apiClient.get('/api/driver/online');
            if (res.data?.success && Array.isArray(res.data.data)) {
                setRawDrivers(res.data.data);
                setLastUpdate(new Date());
            }
        } catch (err) {
            console.error('Failed to fetch drivers:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDrivers();
        const interval = setInterval(fetchDrivers, 12000);
        return () => clearInterval(interval);
    }, [fetchDrivers]);

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

    // Map raw data to DriverMapData for the map component
    const mapDrivers: DriverMapData[] = useMemo(() => rawDrivers.filter(d => d.location?.lat && d.location?.lng).map(d => ({
        driverId: d.id,
        driverName: d.fullName,
        lat: d.location!.lat,
        lng: d.location!.lng,
        speed: d.location?.speed ? parseFloat(String(d.location.speed)) : 0,
        timestamp: d.location?.ts || d.lastSeenAt || new Date().toISOString(),
        heading: d.location?.heading || 0,
        status: getDriverStatus(d),
        currentJob: d.currentBooking ? {
            pickup: d.currentBooking.pickup,
            dropoff: d.currentBooking.dropoff,
            contactName: d.currentBooking.contactName,
            startDate: d.currentBooking.startDate
        } : null,
        vehicle: d.vehicle || null,
        speedViolations: d.speedViolations || 0
    })), [rawDrivers]);

    const selectedMapDriver = mapDrivers.find(d => d.driverId === selectedDriverId) || null;

    // Stats
    const stats = useMemo(() => {
        const all = rawDrivers.map(d => getDriverStatus(d));
        return {
            total: rawDrivers.length,
            onJob: all.filter(s => s === 'on_job').length,
            idle: all.filter(s => s === 'idle').length,
            speeding: all.filter(s => s === 'speeding').length,
            offline: all.filter(s => s === 'offline').length,
            violations: rawDrivers.reduce((sum, d) => sum + (d.speedViolations || 0), 0)
        };
    }, [rawDrivers]);

    // Filtered & sorted driver list
    const filteredDrivers = useMemo(() => {
        let list = [...rawDrivers];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(d => d.fullName.toLowerCase().includes(q) || d.phone?.includes(q));
        }
        // Sort: on_job first, then idle, speeding, offline
        const order = { speeding: 0, on_job: 1, idle: 2, offline: 3 };
        list.sort((a, b) => (order[getDriverStatus(a)] ?? 9) - (order[getDriverStatus(b)] ?? 9));
        return list;
    }, [rawDrivers, search]);

    const selectedRaw = rawDrivers.find(d => d.id === selectedDriverId);

    const openViolationHistory = useCallback(async (driverId: string, driverName: string) => {
        setViolationDriverId(driverId);
        setViolationDriverName(driverName);
        setViolationDrawer(true);
        setViolationLoading(true);
        try {
            const res = await apiClient.get(`/api/driver/${driverId}/violations?days=30`);
            if (res.data?.success) {
                setViolationData(res.data.data.grouped || {});
                setViolationTotalCount(res.data.data.totalCount || 0);
            }
        } catch (err) {
            console.error('Failed to fetch violations:', err);
        } finally {
            setViolationLoading(false);
        }
    }, []);

    return (
        <AdminLayout selectedKey="driver-tracking">
            <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#f1f5f9', overflow: 'hidden' }}>
                {/* ── TOP STATS BAR ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                    background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
                        <AimOutlined style={{ fontSize: 18, color: '#6366f1' }} />
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Filo Takip</span>
                    </div>
                    {[
                        { label: 'Toplam', value: stats.total, color: '#475569', bg: '#f1f5f9' },
                        { label: 'Seferde', value: stats.onJob, color: '#1d4ed8', bg: '#eff6ff' },
                        { label: 'Boşta', value: stats.idle, color: '#15803d', bg: '#f0fdf4' },
                        { label: 'Hız İhlali', value: stats.speeding, color: '#dc2626', bg: '#fef2f2' },
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
                    {stats.violations > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 12px', borderRadius: 20, background: '#fef2f2',
                            fontSize: 12, fontWeight: 700, color: '#dc2626',
                            border: '1px solid #fecaca', animation: 'pulse 2s infinite'
                        }}>
                            <WarningOutlined /> {stats.violations} İhlal
                        </div>
                    )}
                    <div style={{ flex: 1 }} />
                    <Badge status={isConnected ? 'success' : 'error'} text={<span style={{ fontSize: 11, color: '#64748b' }}>{isConnected ? 'Canlı' : 'Bağlantı Yok'}</span>} />
                    <Tooltip title="Yenile">
                        <div onClick={fetchDrivers} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: '#f1f5f9' }}>
                            <ReloadOutlined style={{ fontSize: 13, color: '#64748b' }} />
                        </div>
                    </Tooltip>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                        {dayjs(lastUpdate).format('HH:mm:ss')}
                    </span>
                </div>

                {/* ── MAIN CONTENT ── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* ── MAP ── */}
                    <div style={{ flex: 1, position: 'relative', margin: 8, marginRight: sidebarExpanded ? 0 : 8 }}>
                        <HereLiveMapClient
                            drivers={mapDrivers}
                            selectedDriver={selectedMapDriver}
                            onSelectDriver={(d) => setSelectedDriverId(d?.driverId || null)}
                        />
                        {/* Map Legend */}
                        <div style={{
                            position: 'absolute', bottom: 16, left: 16,
                            background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
                            borderRadius: 12, padding: '8px 14px',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.1)', fontSize: 10
                        }}>
                            {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'offline').map(([key, cfg]) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }} />
                                    <span style={{ color: cfg.text, fontWeight: 600 }}>{cfg.label}</span>
                                </div>
                            ))}
                        </div>
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
                            width: 340, background: '#fff', borderLeft: '1px solid #e2e8f0',
                            display: 'flex', flexDirection: 'column', flexShrink: 0
                        }}>
                            {/* Search */}
                            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                <Input
                                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                    placeholder="Şoför ara..."
                                    size="small"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    allowClear
                                    style={{ borderRadius: 8 }}
                                />
                            </div>

                            {/* Driver List */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                                {loading ? (
                                    <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
                                ) : filteredDrivers.length === 0 ? (
                                    <Empty description="Şoför bulunamadı" style={{ padding: 40 }} />
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
                                                    {/* Avatar */}
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
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{d.fullName}</span>
                                                            {(d.speedViolations || 0) > 0 && (
                                                                <Tooltip title={`${d.speedViolations} hız ihlali - geçmişi gör`}>
                                                                    <WarningOutlined
                                                                        style={{ color: '#ef4444', fontSize: 11, cursor: 'pointer' }}
                                                                        onClick={(e) => { e.stopPropagation(); openViolationHistory(d.id, d.fullName); }}
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                                            <span style={{
                                                                fontSize: 10, fontWeight: 600, color: cfg.text,
                                                                background: cfg.bg, padding: '1px 8px',
                                                                borderRadius: 10, border: `1px solid ${cfg.border}`
                                                            }}>{cfg.label}</span>
                                                            {speed > 0 && (
                                                                <span style={{
                                                                    fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                                                                    color: speed > 120 ? '#ef4444' : speed > 80 ? '#f59e0b' : '#64748b'
                                                                }}>
                                                                    <DashboardOutlined /> {speed} km/s
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Job count badge */}
                                                    {(d.todayJobCount || 0) > 0 && (
                                                        <div style={{
                                                            background: '#eff6ff', color: '#1d4ed8',
                                                            fontSize: 10, fontWeight: 800, padding: '2px 8px',
                                                            borderRadius: 10, minWidth: 20, textAlign: 'center'
                                                        }}>
                                                            {d.todayJobCount}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Vehicle info */}
                                                {d.vehicle && (
                                                    <div style={{
                                                        marginTop: 6, marginLeft: 48,
                                                        fontSize: 10, color: '#64748b',
                                                        display: 'flex', alignItems: 'center', gap: 4
                                                    }}>
                                                        <CarOutlined />
                                                        <span style={{ fontWeight: 600 }}>{d.vehicle.plateNumber}</span>
                                                        <span>{d.vehicle.brand} {d.vehicle.model}</span>
                                                        {d.vehicle.color && (
                                                            <span style={{
                                                                width: 8, height: 8, borderRadius: '50%',
                                                                background: d.vehicle.color, border: '1px solid #d1d5db',
                                                                display: 'inline-block', marginLeft: 2
                                                            }} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* Current job */}
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
                                                                {d.currentBooking.flightNumber && (
                                                                    <span style={{ marginLeft: 8 }}>✈ {d.currentBooking.flightNumber}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Last seen for offline */}
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

                            {/* Speed Violations Footer */}
                            {stats.violations > 0 && (
                                <div style={{
                                    padding: '8px 12px', borderTop: '1px solid #fecaca',
                                    background: '#fef2f2', fontSize: 11
                                }}>
                                    <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                                        <WarningOutlined /> Hız İhlalleri ({stats.violations})
                                    </div>
                                    {rawDrivers.filter(d => (d.speedViolations || 0) > 0).map(d => (
                                        <div
                                            key={d.id}
                                            onClick={() => openViolationHistory(d.id, d.fullName)}
                                            style={{
                                                display: 'flex', justifyContent: 'space-between',
                                                padding: '3px 0', color: '#991b1b', cursor: 'pointer',
                                                borderRadius: 4
                                            }}
                                        >
                                            <span>{d.fullName}</span>
                                            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {d.speedViolations} ihlal <HistoryOutlined style={{ fontSize: 10 }} />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── VIOLATION HISTORY DRAWER ── */}
            <Drawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: '#ef4444', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: 13
                        }}>
                            {violationDriverName.charAt(0)}
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{violationDriverName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>Hız İhlali Geçmişi (Son 30 Gün)</div>
                        </div>
                    </div>
                }
                open={violationDrawer}
                onClose={() => setViolationDrawer(false)}
                width={420}
                styles={{ body: { padding: '12px 16px' } }}
            >
                {violationLoading ? (
                    <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>
                ) : Object.keys(violationData).length === 0 ? (
                    <Empty description="Son 30 günde hız ihlali kaydı yok" />
                ) : (
                    <div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', background: '#fef2f2', borderRadius: 10, marginBottom: 16
                        }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                                <WarningOutlined /> Toplam İhlal
                            </span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>
                                {violationTotalCount}
                            </span>
                        </div>
                        {Object.entries(violationData)
                            .sort(([a], [b]) => b.localeCompare(a))
                            .map(([dateKey, items]) => (
                                <div key={dateKey} style={{ marginBottom: 16 }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #f1f5f9'
                                    }}>
                                        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                                            {dayjs(dateKey).format('DD MMMM YYYY, dddd')}
                                        </span>
                                        <Tag color="red" style={{ fontSize: 11, fontWeight: 700 }}>
                                            {items.length} ihlal
                                        </Tag>
                                    </div>
                                    {items.sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((v: any, idx: number) => (
                                        <div key={v.id || idx} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 10px', marginBottom: 4,
                                            background: v.speed > 150 ? '#fef2f2' : '#fff7ed',
                                            borderRadius: 8, border: `1px solid ${v.speed > 150 ? '#fecaca' : '#fed7aa'}`
                                        }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: 8,
                                                background: v.speed > 150 ? '#dc2626' : '#f59e0b',
                                                color: '#fff', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', fontWeight: 800, fontSize: 12,
                                                fontFamily: 'monospace', flexShrink: 0
                                            }}>
                                                {Math.round(v.speed)}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: 12, color: v.speed > 150 ? '#dc2626' : '#d97706' }}>
                                                    {Math.round(v.speed)} km/s
                                                    <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4, fontSize: 10 }}>
                                                        (limit: {v.speedLimit} km/s)
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                                    <ClockCircleOutlined /> {dayjs(v.time).format('HH:mm:ss')}
                                                    {v.lat && v.lng && (
                                                        <span style={{ marginLeft: 8 }}>
                                                            <EnvironmentOutlined /> {parseFloat(v.lat).toFixed(4)}, {parseFloat(v.lng).toFixed(4)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {v.speed > 150 && (
                                                <Tag color="red" style={{ fontSize: 9, margin: 0 }}>Kritik</Tag>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                    </div>
                )}
            </Drawer>

            <style jsx global>{`
                @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
            `}</style>
        </AdminLayout>
    );
};

export default LiveMapPage;
