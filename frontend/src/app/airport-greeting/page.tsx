'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Table, Tag, Button, Typography, message, Input, Card, Select, Modal,
    Badge, Tooltip, Timeline, Space, DatePicker, Collapse, Segmented
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    ReloadOutlined, SearchOutlined, PhoneOutlined, CarOutlined,
    EnvironmentOutlined, CalendarOutlined, IdcardOutlined, TeamOutlined,
    CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, SendOutlined, UserOutlined, LoadingOutlined,
    GlobalOutlined, SwapRightOutlined, LockOutlined, EyeOutlined,
    AimOutlined, WifiOutlined, HistoryOutlined, CompassOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import relativeTime from 'dayjs/plugin/relativeTime';
import AirportLayout from './AirportLayout';
import AirportGuard from './AirportGuard';
import apiClient from '@/lib/api-client';

dayjs.locale('tr');
dayjs.extend(relativeTime);
const { Text } = Typography;
const { TextArea } = Input;

/* ═══ Constants ═══ */

const GREETING_STATUS: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    WAITING:    { label: 'Bekleniyor',    color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: <ClockCircleOutlined /> },
    DELAYED:    { label: 'Rötar',         color: '#ea580c', bg: '#fff7ed', border: '#fdba74', icon: <ExclamationCircleOutlined /> },
    LANDED:     { label: 'Uçak İndi',     color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', icon: <CheckCircleOutlined /> },
    CANCELLED:  { label: 'İptal',         color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: <CloseCircleOutlined /> },
    MET:        { label: 'Karşılandı',    color: '#7c3aed', bg: '#f3e8ff', border: '#ddd6fe', icon: <UserOutlined /> },
    HANDED_OFF: { label: 'Teslim Edildi', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: <CheckCircleOutlined /> },
    NO_SHOW:    { label: 'Gelmedi',       color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', icon: <CloseCircleOutlined /> },
};

const FLIGHT_STATUS: Record<string, { label: string; color: string }> = {
    ON_TIME:   { label: 'Zamanında', color: '#16a34a' },
    DELAYED:   { label: 'Rötarlı',   color: '#ea580c' },
    LANDED:    { label: 'İndi',      color: '#2563eb' },
    CANCELLED: { label: 'İptal',     color: '#dc2626' },
};

const NEXT_STATUS: Record<string, string> = {
    WAITING:  'LANDED',
    DELAYED:  'LANDED',
    LANDED:   'MET',
    MET:      'HANDED_OFF',
};

export default function AirportGreetingStandalonePage() {
    const [arrivals, setArrivals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [viewTab, setViewTab] = useState<'all' | 'shuttle' | 'private' | 'completed'>('all');
    // ── Completed greetings (today's HANDED_OFF / NO_SHOW / CANCELLED) ──
    const [completed, setCompleted] = useState<any[]>([]);
    const [completedLoading, setCompletedLoading] = useState(false);
    // ── Driver locations modal (anti-delay tool) ──
    const [driverLocModal, setDriverLocModal] = useState(false);
    const [driverLocations, setDriverLocations] = useState<any[]>([]);
    const [driverLocLoading, setDriverLocLoading] = useState(false);
    const driverLocTimer = useRef<any>(null);
    // ── Phone reveal cache: bookingId -> { phone, email } ──
    const [revealedPhones, setRevealedPhones] = useState<Record<string, { phone: string; email?: string | null }>>({});
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [noteModal, setNoteModal] = useState<{ visible: boolean; bookingId: string; bookingNumber: string }>({ visible: false, bookingId: '', bookingNumber: '' });
    const [noteText, setNoteText] = useState('');
    const [detailModal, setDetailModal] = useState<{ visible: boolean; record: any | null }>({ visible: false, record: null });
    const [flightModal, setFlightModal] = useState<{ visible: boolean; flightNumber: string; loading: boolean; data: any | null; record: any | null }>({ visible: false, flightNumber: '', loading: false, data: null, record: null });
    const [handoffModal, setHandoffModal] = useState<{ visible: boolean; bookingId: string; bookingNumber: string; passengerName: string }>({ visible: false, bookingId: '', bookingNumber: '', passengerName: '' });
    const [driverList, setDriverList] = useState<any[]>([]);
    const [driverListLoading, setDriverListLoading] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [moveModal, setMoveModal] = useState<{ visible: boolean; bookingId: string; bookingNumber: string; passengerName: string; currentRunKey?: string }>({ visible: false, bookingId: '', bookingNumber: '', passengerName: '' });
    const [shuttleRuns, setShuttleRuns] = useState<any[]>([]);
    const [shuttleRunsLoading, setShuttleRunsLoading] = useState(false);
    const refreshTimer = useRef<any>(null);

    /* ── Fetch ── */
    const fetchArrivals = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = { date: selectedDate.format('YYYY-MM-DD') };
            const res = await apiClient.get('/api/transfer/airport-arrivals', { params });
            if (res.data.success) {
                setArrivals(res.data.data);
            } else {
                message.error('Veriler alınamadı');
            }
        } catch (err: any) {
            console.error(err);
            const status = err?.response?.status;
            const serverMsg = err?.response?.data?.error;
            if (status === 403 && serverMsg) {
                // e.g. "Karşılama personeline atanmış bir havalimanı bulunamadı..."
                message.warning(serverMsg);
            } else if (serverMsg) {
                message.error(serverMsg);
            } else {
                message.error('Bağlantı hatası');
            }
        } finally {
            setLoading(false);
            setLastRefresh(new Date());
        }
    }, [selectedDate]);

    useEffect(() => { fetchArrivals(); }, [fetchArrivals]);

    /* ── Auto refresh every 30s ── */
    useEffect(() => {
        if (autoRefresh) {
            refreshTimer.current = setInterval(fetchArrivals, 30000);
        }
        return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    }, [autoRefresh, fetchArrivals]);

    /* ── Active set: hide finished bookings from active list. They go to "Tamamlanan" tab. ── */
    const FINISHED = ['HANDED_OFF', 'NO_SHOW', 'CANCELLED'];
    const activeArrivals = useMemo(
        () => arrivals.filter(b => !FINISHED.includes(b.greetingStatus)),
        [arrivals]
    );

    /* ── Search ── */
    const filtered = useMemo(() => {
        const base = activeArrivals;
        if (!searchText) return base;
        const q = searchText.toLowerCase();
        return base.filter(b =>
            b.bookingNumber?.toLowerCase().includes(q) ||
            b.passengerName?.toLowerCase().includes(q) ||
            b.passengerPhone?.toLowerCase().includes(q) ||
            b.flightNumber?.toLowerCase().includes(q) ||
            b.driverName?.toLowerCase().includes(q) ||
            b.vehiclePlate?.toLowerCase().includes(q)
        );
    }, [activeArrivals, searchText]);

    /* ── Fetch today's completed greetings (separate from active list) ── */
    const fetchCompleted = useCallback(async () => {
        setCompletedLoading(true);
        try {
            const params: any = { date: selectedDate.format('YYYY-MM-DD') };
            const res = await apiClient.get('/api/transfer/airport-greeting/completed', { params });
            if (res.data.success) setCompleted(res.data.data || []);
        } catch { /* silent */ }
        finally { setCompletedLoading(false); }
    }, [selectedDate]);

    useEffect(() => { fetchCompleted(); }, [fetchCompleted]);

    /* ── Driver locations: fetch + auto-refresh while modal open ── */
    const fetchDriverLocations = useCallback(async () => {
        setDriverLocLoading(true);
        try {
            const res = await apiClient.get('/api/transfer/airport-greeting/driver-locations');
            if (res.data.success) setDriverLocations(res.data.data || []);
        } catch { /* silent */ }
        finally { setDriverLocLoading(false); }
    }, []);

    useEffect(() => {
        if (driverLocModal) {
            fetchDriverLocations();
            driverLocTimer.current = setInterval(fetchDriverLocations, 30000);
        }
        return () => { if (driverLocTimer.current) clearInterval(driverLocTimer.current); };
    }, [driverLocModal, fetchDriverLocations]);

    /* ── Reveal masked phone (gated; audited server-side) ── */
    const revealPhone = useCallback(async (bookingId: string) => {
        if (revealedPhones[bookingId]) return;
        try {
            const res = await apiClient.post('/api/transfer/airport-greeting/reveal-phone', { bookingId });
            if (res.data.success) {
                setRevealedPhones(prev => ({
                    ...prev,
                    [bookingId]: { phone: res.data.data.passengerPhone || '', email: res.data.data.contactEmail || null }
                }));
                message.success('Müşteri telefonu açıldı (audit kaydedildi)');
            } else {
                message.warning(res.data.error || 'Telefon açılamadı');
            }
        } catch (err: any) {
            const errCode = err?.response?.data?.code;
            if (errCode === 'PHONE_LOCKED') {
                message.warning('Müşteri telefonu uçak inmeden gösterilemez');
            } else {
                message.error('Telefon açılamadı');
            }
        }
    }, [revealedPhones]);

    /* ── Helper: render passenger phone with redaction guard ── */
    const renderPassengerPhone = (r: any) => {
        const cached = revealedPhones[r.id];
        const phone = cached?.phone || r.passengerPhone;
        if (phone) {
            return (
                <a href={`tel:${phone}`} style={{ fontSize: 11, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                    <PhoneOutlined style={{ fontSize: 9 }} />
                    {phone}
                </a>
            );
        }
        if (r.passengerPhoneMasked) {
            return (
                <Tooltip title="Müşteri uçağı inmeden telefon açılamaz (anti-fraud koruması)">
                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <LockOutlined style={{ fontSize: 9 }} />
                        <span style={{ fontFamily: 'monospace' }}>{r.passengerPhoneMasked}</span>
                        <Button
                            type="link"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={(e) => { e.stopPropagation(); revealPhone(r.id); }}
                            style={{ padding: 0, fontSize: 10, height: 16 }}
                        >
                            Göster
                        </Button>
                    </span>
                </Tooltip>
            );
        }
        return null;
    };

    /* ── Separate private vs shuttle ── */
    const isShuttle = (b: any) => {
        const vt = (b.vehicleType || '').toLowerCase();
        return vt.includes('shuttle') || vt.includes('paylaşımlı') || vt.includes('paylasimli') || !!b.shuttleRouteId;
    };

    const privateArrivals = useMemo(() => filtered.filter(b => !isShuttle(b)), [filtered]);

    const shuttleRunGroups = useMemo(() => {
        const shuttles = filtered.filter(b => isShuttle(b));
        const groups: Record<string, { key: string; time: string; flight: string; pax: number; bookings: any[] }> = {};
        // Mirror operations.js shuttle-runs grouping: prefer manual/route IDs,
        // otherwise group by direction (ARV here) + dropoff region + master time / hour bucket
        // so same-airport same-time arrivals merge into one run on the greeter screen.
        shuttles.forEach(b => {
            const masterTime = b.shuttleMasterTime || (b.pickupDateTime ? dayjs(b.pickupDateTime).format('HH:mm') : '');
            // Bucket by hour when no master time exists, so flights in same hour group
            const hourBucket = masterTime ? masterTime.split(':')[0] : '';
            const region = (b.dropoffRegionCode || b.pickupRegionCode || 'X').toString().split(/[\s\-\/]+/)[0].toUpperCase();
            let runKey: string;
            if (b.manualRunId) {
                runKey = `MANUAL::${b.manualRunId}`;
            } else if (b.shuttleRouteId) {
                runKey = `ROUTE::${b.shuttleRouteId}::${masterTime || hourBucket}`;
            } else {
                runKey = `ADHOC::ARV::${region}::${masterTime || hourBucket || 'NA'}`;
            }
            const time = masterTime || '--:--';
            if (!groups[runKey]) {
                groups[runKey] = { key: runKey, time, flight: b.flightNumber || '', pax: 0, bookings: [] };
            }
            groups[runKey].bookings.push(b);
            groups[runKey].pax += (b.adults || 1) + (b.children || 0) + (b.infants || 0);
            if (b.flightNumber && !groups[runKey].flight.split(',').includes(b.flightNumber)) {
                groups[runKey].flight = groups[runKey].flight ? `${groups[runKey].flight}, ${b.flightNumber}` : b.flightNumber;
            }
        });
        return Object.values(groups).sort((a, b) => a.time.localeCompare(b.time));
    }, [filtered]);

    /* ── Stats ── */
    const stats = useMemo(() => {
        const s: Record<string, number> = { total: arrivals.length };
        Object.keys(GREETING_STATUS).forEach(k => { s[k] = 0; });
        arrivals.forEach(b => { s[b.greetingStatus] = (s[b.greetingStatus] || 0) + 1; });
        return s;
    }, [arrivals]);

    /* ── Update status ── */
    const updateStatus = async (bookingId: string, status: string, extra?: any) => {
        try {
            const body: any = { bookingId, status, ...extra };
            const res = await apiClient.patch('/api/transfer/greeting-status', body);
            if (res.data.success) {
                message.success(`Durum güncellendi: ${GREETING_STATUS[status]?.label || status}`);
                fetchArrivals();
            } else {
                message.error(res.data.error || 'Hata');
            }
        } catch { message.error('Durum güncellenemedi'); }
    };

    /* ── Add note ── */
    const addNote = async () => {
        if (!noteText.trim()) return;
        try {
            const res = await apiClient.post('/api/transfer/greeting-note', { bookingId: noteModal.bookingId, text: noteText.trim() });
            if (res.data.success) {
                message.success('Not eklendi');
                setNoteModal({ visible: false, bookingId: '', bookingNumber: '' });
                setNoteText('');
                fetchArrivals();
            }
        } catch { message.error('Not eklenemedi'); }
    };

    /* ── Fetch flight info ── */
    const fetchFlightInfo = async (flightNumber: string, record: any) => {
        setFlightModal({ visible: true, flightNumber, loading: true, data: null, record });
        try {
            const res = await apiClient.get('/api/flight/status', { params: { flightNumber } });
            if (res.data.success) {
                setFlightModal(prev => ({ ...prev, loading: false, data: res.data.data }));
            } else {
                setFlightModal(prev => ({ ...prev, loading: false, data: null }));
            }
        } catch {
            setFlightModal(prev => ({ ...prev, loading: false, data: null }));
        }
    };

    /* ── Handle delay ── */
    const handleDelay = (bookingId: string) => {
        Modal.confirm({
            title: 'Rötar Bildirimi',
            content: (
                <div>
                    <p>Tahmini yeni iniş saatini girin (opsiyonel):</p>
                    <Input id="delay-time-input" placeholder="Örn: 14:30" style={{ marginTop: 8 }} />
                    <Input id="delay-notes-input" placeholder="Not (opsiyonel)" style={{ marginTop: 8 }} />
                </div>
            ),
            okText: 'Rötar Bildir',
            cancelText: 'Vazgeç',
            onOk: () => {
                const timeEl = document.getElementById('delay-time-input') as HTMLInputElement;
                const notesEl = document.getElementById('delay-notes-input') as HTMLInputElement;
                updateStatus(bookingId, 'DELAYED', {
                    estimatedLanding: timeEl?.value || null,
                    notes: notesEl?.value || 'Uçuş rötarlı',
                });
            },
        });
    };

    /* ── Fetch drivers for handoff ── */
    const fetchDrivers = async () => {
        setDriverListLoading(true);
        try {
            const res = await apiClient.get('/api/transfer/greeting-drivers');
            if (res.data.success) {
                setDriverList(res.data.data);
            }
        } catch { /* silent */ }
        finally { setDriverListLoading(false); }
    };

    /* ── Handle handoff (Teslim Edildi) ── */
    const handleHandoff = (record: any) => {
        if (record.driverId) {
            // Driver already assigned, just update status
            updateStatus(record.id, 'HANDED_OFF');
        } else {
            // No driver assigned — show driver selection modal
            setSelectedDriver(null);
            setHandoffModal({
                visible: true,
                bookingId: record.id,
                bookingNumber: record.bookingNumber,
                passengerName: record.passengerName,
            });
            fetchDrivers();
        }
    };

    /* ── Confirm handoff with selected driver ── */
    const confirmHandoff = async () => {
        if (!selectedDriver) {
            message.warning('Lütfen bir şoför seçin');
            return;
        }
        await updateStatus(handoffModal.bookingId, 'HANDED_OFF', { driverId: selectedDriver });
        setHandoffModal({ visible: false, bookingId: '', bookingNumber: '', passengerName: '' });
        setSelectedDriver(null);
    };

    /* ── Handle no show ── */
    const handleNoShow = (bookingId: string) => {
        Modal.confirm({
            title: 'Müşteri Gelmedi',
            content: 'Müşteri bulunamadı olarak işaretlenecek. Emin misiniz?',
            okText: 'Evet, Gelmedi',
            okButtonProps: { danger: true },
            cancelText: 'Vazgeç',
            onOk: () => updateStatus(bookingId, 'NO_SHOW', { notes: 'Müşteri havalimanında bulunamadı' }),
        });
    };

    /* ── Shuttle: fetch runs for move modal ── */
    const fetchShuttleRuns = async () => {
        setShuttleRunsLoading(true);
        try {
            const res = await apiClient.get('/api/operations/shuttle-runs', { params: { date: selectedDate.format('YYYY-MM-DD') } });
            if (res.data.success) {
                setShuttleRuns(res.data.data || []);
            }
        } catch { /* silent */ }
        finally { setShuttleRunsLoading(false); }
    };

    /* ── Shuttle: open move modal ── */
    const handleMovePassenger = (record: any) => {
        setMoveModal({
            visible: true,
            bookingId: record.id,
            bookingNumber: record.bookingNumber,
            passengerName: record.passengerName,
            currentRunKey: record.manualRunId || record.shuttleRouteId || '',
        });
        fetchShuttleRuns();
    };

    /* ── Shuttle: execute move ── */
    const executeMovePassenger = async (targetRun: any) => {
        try {
            // Find a sample booking in the target run to adopt its metadata
            const sampleBookingId = targetRun.bookings?.[0]?.id;
            const body: any = {
                bookingIds: [moveModal.bookingId],
                sampleBookingId,
                targetBookingIds: targetRun.bookings?.map((b: any) => b.id) || [],
            };
            if (!sampleBookingId) {
                body.targetRun = {
                    shuttleRouteId: targetRun.shuttleRouteId,
                    shuttleMasterTime: targetRun.departureTime,
                    manualRunId: targetRun.runKey?.includes('MANUAL') ? targetRun.runKey.replace('MANUAL::', '') : null,
                    tripType: targetRun.tripType,
                };
            }
            const res = await apiClient.post('/api/operations/shuttle-runs/move', body);
            if (res.data.success) {
                message.success('Müşteri başarıyla taşındı');
                setMoveModal({ visible: false, bookingId: '', bookingNumber: '', passengerName: '' });
                fetchArrivals();
            } else {
                message.error(res.data.message || res.data.error || 'Taşıma başarısız');
            }
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Taşıma hatası');
        }
    };

    /* ── Columns ── */
    const columns: ColumnsType<any> = [
        {
            title: 'Uçuş',
            key: 'flight',
            width: 120,
            fixed: 'left',
            sorter: (a, b) => (a.flightNumber || '').localeCompare(b.flightNumber || ''),
            render: (_, r) => {
                const fs = FLIGHT_STATUS[r.flightStatus] || FLIGHT_STATUS.ON_TIME;
                return (
                    <div>
                        <div
                            onClick={() => r.flightNumber && fetchFlightInfo(r.flightNumber, r)}
                            style={{
                                fontWeight: 800, fontSize: 14, color: r.flightNumber ? '#0ea5e9' : '#1e293b',
                                fontFamily: 'monospace', cursor: r.flightNumber ? 'pointer' : 'default',
                                textDecoration: r.flightNumber ? 'underline' : 'none',
                                textDecorationStyle: 'dotted' as const,
                            }}
                            title={r.flightNumber ? 'Uçuş bilgisi için tıklayın' : ''}
                        >
                            {r.flightNumber || '-'}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                            {r.flightTime || (r.pickupDateTime ? dayjs(r.pickupDateTime).format('HH:mm') : '-')}
                        </div>
                        <Tag style={{
                            margin: 0, marginTop: 2, fontSize: 9, borderRadius: 4, fontWeight: 700,
                            color: fs.color, background: 'transparent', border: 'none', padding: 0,
                        }}>
                            {fs.label}
                        </Tag>
                        {r.estimatedLanding && r.flightStatus === 'DELAYED' && (
                            <div style={{ fontSize: 9, color: '#ea580c', fontWeight: 600, marginTop: 1 }}>
                                Yeni: {r.estimatedLanding}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Müşteri',
            key: 'customer',
            width: 200,
            render: (_, r) => {
                const pax = (r.adults || 1) + (r.children || 0) + (r.infants || 0);
                return (
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.passengerName || '-'}</div>
                        {renderPassengerPhone(r)}
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            <Badge count={pax} style={{ backgroundColor: '#6366f1', fontSize: 9, height: 16, lineHeight: '16px' }} />
                            <span style={{ marginLeft: 4 }}>kişi</span>
                            {r.specialRequests && (
                                <Tooltip title={r.specialRequests}>
                                    <ExclamationCircleOutlined style={{ color: '#f59e0b', marginLeft: 6, fontSize: 11 }} />
                                </Tooltip>
                            )}
                        </div>
                        <div style={{ fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace' }}>{r.bookingNumber}</div>
                    </div>
                );
            },
        },
        {
            title: 'Varış Noktası',
            key: 'dropoff',
            width: 180,
            render: (_, r) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#334155' }}>
                        <EnvironmentOutlined style={{ color: '#ef4444', fontSize: 10 }} />
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 }}>
                            {r.dropoff || '-'}
                        </span>
                    </div>
                    {r.agencyName && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            <TeamOutlined style={{ fontSize: 9, marginRight: 3 }} />
                            {r.agencyName}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Şoför / Araç',
            key: 'driver',
            width: 160,
            render: (_, r) => (
                <div>
                    {r.driverName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: 5,
                                background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <IdcardOutlined style={{ fontSize: 10, color: '#16a34a' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 11, color: '#1e293b' }}>{r.driverName}</div>
                                {r.driverPhone && (
                                    <a href={`tel:${r.driverPhone}`} style={{ fontSize: 9, color: '#3b82f6', textDecoration: 'none' }}>
                                        <PhoneOutlined style={{ fontSize: 8, marginRight: 2 }} />{r.driverPhone}
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        <span style={{ color: '#cbd5e1', fontSize: 11, fontStyle: 'italic' }}>Şoför atanmadı</span>
                    )}
                    {r.vehiclePlate && (
                        <div style={{ marginTop: 3 }}>
                            <span style={{
                                fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#0369a1',
                                background: '#f0f9ff', padding: '1px 5px', borderRadius: 3, border: '1px solid #bae6fd'
                            }}>
                                <CarOutlined style={{ fontSize: 9, marginRight: 3 }} />
                                {r.vehiclePlate}
                            </span>
                            {r.vehicleBrand && <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 4 }}>{r.vehicleBrand}</span>}
                        </div>
                    )}
                    {r.vehicleType && !r.vehiclePlate && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            <CarOutlined style={{ fontSize: 9, marginRight: 3 }} />{r.vehicleType}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Durum',
            dataIndex: 'greetingStatus',
            key: 'status',
            width: 120,
            align: 'center',
            filters: Object.entries(GREETING_STATUS).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.greetingStatus === value,
            render: (_, r) => {
                const gs = GREETING_STATUS[r.greetingStatus] || GREETING_STATUS.WAITING;
                return (
                    <div style={{ textAlign: 'center' }}>
                        <Tag style={{
                            margin: 0, fontSize: 10, borderRadius: 6, fontWeight: 700, lineHeight: '20px',
                            background: gs.bg, color: gs.color, border: `1px solid ${gs.border}`,
                            padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                            {gs.icon} {gs.label}
                        </Tag>
                        {r.greeterName && (
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>
                                {r.greeterName}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Aksiyon',
            key: 'action',
            width: 200,
            fixed: 'right',
            render: (_, r) => {
                const nextStatus = NEXT_STATUS[r.greetingStatus];
                const nextInfo = nextStatus ? GREETING_STATUS[nextStatus] : null;
                const isFinished = ['HANDED_OFF', 'NO_SHOW', 'CANCELLED'].includes(r.greetingStatus);

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {!isFinished && nextInfo && (
                            <Button
                                type="primary"
                                size="small"
                                icon={nextInfo.icon}
                                onClick={() => nextStatus === 'HANDED_OFF' ? handleHandoff(r) : updateStatus(r.id, nextStatus!)}
                                style={{
                                    borderRadius: 6, fontWeight: 700, fontSize: 11,
                                    background: nextInfo.color, border: 'none', height: 28,
                                }}
                            >
                                {nextInfo.label}
                            </Button>
                        )}
                        <div style={{ display: 'flex', gap: 3 }}>
                            {r.greetingStatus === 'WAITING' && (
                                <Button size="small" danger onClick={() => handleDelay(r.id)}
                                    style={{ borderRadius: 5, fontSize: 10, height: 24, flex: 1 }}>
                                    Rötar
                                </Button>
                            )}
                            {['LANDED', 'DELAYED'].includes(r.greetingStatus) && (
                                <Button size="small" danger onClick={() => handleNoShow(r.id)}
                                    style={{ borderRadius: 5, fontSize: 10, height: 24, flex: 1 }}>
                                    Gelmedi
                                </Button>
                            )}
                            {!isFinished && (
                                <Button size="small"
                                    onClick={() => setNoteModal({ visible: true, bookingId: r.id, bookingNumber: r.bookingNumber })}
                                    style={{ borderRadius: 5, fontSize: 10, height: 24, flex: 1 }}>
                                    Not
                                </Button>
                            )}
                            {!isFinished && ((r.vehicleType || '').toLowerCase().includes('shuttle') || (r.vehicleType || '').toLowerCase().includes('paylaşımlı') || r.shuttleRouteId) && (
                                <Button size="small"
                                    icon={<SwapRightOutlined style={{ fontSize: 10 }} />}
                                    onClick={() => handleMovePassenger(r)}
                                    style={{ borderRadius: 5, fontSize: 10, height: 24, flex: 1, color: '#6366f1', borderColor: '#c7d2fe' }}>
                                    Sefer
                                </Button>
                            )}
                            <Button size="small" type="link"
                                onClick={() => setDetailModal({ visible: true, record: r })}
                                style={{ fontSize: 10, height: 24, padding: '0 6px' }}>
                                Detay
                            </Button>
                        </div>
                    </div>
                );
            },
        },
    ];

    return (
        <AirportGuard>
            <AirportLayout>
                {/* ═══ FILTERS ═══ */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                    flexWrap: 'wrap', background: '#fff', borderRadius: 10, padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginRight: 4 }}>
                        {selectedDate.format('DD MMM YYYY')} — {dayjs(lastRefresh).format('HH:mm:ss')}
                        {autoRefresh && <span style={{ color: '#16a34a', marginLeft: 4 }}>● Canlı</span>}
                    </div>
                    <div style={{ flex: 1 }} />
                    <DatePicker
                        value={selectedDate}
                        onChange={(d) => d && setSelectedDate(d)}
                        format="DD.MM.YYYY"
                        style={{ borderRadius: 8, width: 120 }}
                        size="small"
                        allowClear={false}
                    />
                    <Input
                        placeholder="Ara..."
                        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        style={{ width: 160, borderRadius: 8 }}
                        size="small"
                    />
                    <Button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        size="small"
                        style={{
                            borderRadius: 8, fontWeight: 600, fontSize: 11,
                            color: autoRefresh ? '#16a34a' : '#94a3b8',
                            borderColor: autoRefresh ? '#86efac' : '#e2e8f0',
                        }}
                    >
                        {autoRefresh ? '● Canlı' : '○ Durdur'}
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchArrivals}
                        loading={loading}
                        type="primary"
                        size="small"
                        style={{
                            borderRadius: 8, fontWeight: 700,
                            background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                            border: 'none',
                        }}
                    >
                        Yenile
                    </Button>
                </div>

                {/* ═══ STATS ═══ */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                        background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#0ea5e9' }}>{stats.total}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>Toplam</span>
                    </div>
                    {Object.entries(GREETING_STATUS).map(([key, val]) => {
                        const count = stats[key] || 0;
                        if (count === 0) return null;
                        return (
                            <div key={key} style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                background: val.bg, borderRadius: 8, border: `1px solid ${val.border}`,
                            }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: val.color }}>{count}</span>
                                <span style={{ fontSize: 9, color: val.color, fontWeight: 600 }}>{val.label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* ═══ VIEW TABS ═══ */}
                <div style={{
                    marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                    <Segmented
                        value={viewTab}
                        onChange={(v) => setViewTab(v as any)}
                        options={[
                            {
                                value: 'all',
                                label: (
                                    <div style={{ padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>Tümü</span>
                                        <Badge count={filtered.length} style={{ backgroundColor: '#64748b', fontSize: 9 }} />
                                    </div>
                                ),
                            },
                            {
                                value: 'shuttle',
                                label: (
                                    <div style={{ padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <TeamOutlined style={{ fontSize: 12 }} />
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>Shuttle</span>
                                        <Badge count={shuttleRunGroups.reduce((s, g) => s + g.bookings.length, 0)} style={{ backgroundColor: '#0ea5e9', fontSize: 9 }} />
                                    </div>
                                ),
                            },
                            {
                                value: 'private',
                                label: (
                                    <div style={{ padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <CarOutlined style={{ fontSize: 12 }} />
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>Özel</span>
                                        <Badge count={privateArrivals.length} style={{ backgroundColor: '#6366f1', fontSize: 9 }} />
                                    </div>
                                ),
                            },
                            {
                                value: 'completed',
                                label: (
                                    <div style={{ padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <HistoryOutlined style={{ fontSize: 12 }} />
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>Tamamlanan</span>
                                        <Badge count={completed.length} style={{ backgroundColor: '#16a34a', fontSize: 9 }} />
                                    </div>
                                ),
                            },
                        ]}
                        style={{
                            borderRadius: 10, background: '#f1f5f9',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                    />
                    <div style={{ flex: 1 }} />
                    <Button
                        icon={<CompassOutlined />}
                        onClick={() => setDriverLocModal(true)}
                        size="small"
                        style={{
                            borderRadius: 8, fontWeight: 700, fontSize: 11,
                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                            color: '#92400e', borderColor: '#fcd34d',
                        }}
                    >
                        Şoför Konumları (1 saat)
                    </Button>
                </div>

                {/* ═══ SHUTTLE RUNS (Compact Accordion) ═══ */}
                {(viewTab === 'all' || viewTab === 'shuttle') && shuttleRunGroups.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <Collapse
                            size="small"
                            style={{ background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd' }}
                            items={shuttleRunGroups.map(group => {
                                const allFlights = [...new Set(group.bookings.map((b: any) => b.flightNumber).filter(Boolean))];
                                const statuses = group.bookings.map((b: any) => b.greetingStatus);
                                const allDone = statuses.every((s: string) => ['HANDED_OFF', 'NO_SHOW', 'CANCELLED'].includes(s));
                                const someMet = statuses.some((s: string) => s === 'MET');

                                return {
                                    key: group.key,
                                    style: { marginBottom: 4, borderRadius: 8, overflow: 'hidden' },
                                    label: (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <div style={{
                                                fontWeight: 800, fontSize: 15, color: '#0369a1', fontFamily: 'monospace',
                                                background: '#e0f2fe', padding: '2px 10px', borderRadius: 6, minWidth: 52, textAlign: 'center',
                                            }}>
                                                {group.time}
                                            </div>
                                            {allFlights.map(f => (
                                                <Tag key={f} color="cyan" style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', margin: 0 }}>
                                                    ✈ {f}
                                                </Tag>
                                            ))}
                                            <Badge
                                                count={`${group.bookings.length} müşteri`}
                                                style={{ backgroundColor: allDone ? '#86efac' : someMet ? '#c4b5fd' : '#fbbf24', color: allDone ? '#166534' : someMet ? '#5b21b6' : '#92400e', fontWeight: 700, fontSize: 9 }}
                                            />
                                            <Badge
                                                count={`${group.pax} pax`}
                                                style={{ backgroundColor: '#e0e7ff', color: '#4338ca', fontWeight: 700, fontSize: 9 }}
                                            />
                                        </div>
                                    ),
                                    children: (
                                        <div style={{ overflowX: 'auto' }}>
                                            {/* Column headers */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '28px 180px 85px 1fr 36px 110px 1fr',
                                                gap: '0 12px',
                                                padding: '4px 10px 6px',
                                                borderBottom: '1px solid #e8f4fd',
                                                marginBottom: 4,
                                            }}>
                                                {['#', 'MÜŞTERİ', 'UÇUŞ', 'VARIŞ NOKTASI', 'PAX', 'DURUM', 'AKSİYON'].map((h, i) => (
                                                    <div key={i} style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                                                ))}
                                            </div>
                                            {/* Rows */}
                                            {group.bookings.map((b: any, idx: number) => {
                                                const gs = GREETING_STATUS[b.greetingStatus] || GREETING_STATUS.WAITING;
                                                const nextStatus = NEXT_STATUS[b.greetingStatus];
                                                const nextInfo = nextStatus ? GREETING_STATUS[nextStatus] : null;
                                                const isFinished = ['HANDED_OFF', 'NO_SHOW', 'CANCELLED'].includes(b.greetingStatus);
                                                const pax = (b.adults || 1) + (b.children || 0) + (b.infants || 0);
                                                const shortDropoff = (b.dropoff || '-').split(',')[0];

                                                return (
                                                    <div key={b.id} style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: '28px 180px 85px 1fr 36px 110px 1fr',
                                                        gap: '0 12px',
                                                        alignItems: 'center',
                                                        padding: '7px 10px',
                                                        borderRadius: 8,
                                                        background: '#fff',
                                                        border: `1px solid ${isFinished ? '#f1f5f9' : gs.border}`,
                                                        borderLeft: `3px solid ${isFinished ? '#e2e8f0' : gs.color}`,
                                                        opacity: isFinished ? 0.55 : 1,
                                                        marginBottom: 4,
                                                        minWidth: 720,
                                                    }}>
                                                        {/* # */}
                                                        <div style={{ fontWeight: 800, fontSize: 11, color: '#cbd5e1', textAlign: 'center' }}>{idx + 1}</div>

                                                        {/* Customer */}
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.passengerName}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                {renderPassengerPhone(b)}
                                                                <span style={{ fontSize: 9, color: '#cbd5e1', fontFamily: 'monospace' }}>{b.bookingNumber}</span>
                                                            </div>
                                                        </div>

                                                        {/* Flight */}
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#0ea5e9' }}>{b.flightNumber || '-'}</div>
                                                            {b.flightTime && <div style={{ fontSize: 9, color: '#94a3b8' }}>{b.flightTime}</div>}
                                                        </div>

                                                        {/* Dropoff */}
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <Tooltip title={b.dropoff}>
                                                                <div style={{ fontSize: 11, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <EnvironmentOutlined style={{ color: '#ef4444', fontSize: 9, flexShrink: 0 }} />
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortDropoff}</span>
                                                                </div>
                                                            </Tooltip>
                                                        </div>

                                                        {/* Pax */}
                                                        <div style={{ textAlign: 'center' }}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                width: 22, height: 22, borderRadius: '50%',
                                                                background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: 10,
                                                            }}>{pax}</span>
                                                        </div>

                                                        {/* Status */}
                                                        <div>
                                                            <Tag style={{
                                                                margin: 0, fontSize: 9, borderRadius: 6, fontWeight: 700,
                                                                background: gs.bg, color: gs.color, border: `1px solid ${gs.border}`,
                                                                padding: '2px 7px', lineHeight: '16px', whiteSpace: 'nowrap',
                                                            }}>
                                                                {gs.icon} {gs.label}
                                                            </Tag>
                                                        </div>

                                                        {/* Actions */}
                                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>
                                                            {!isFinished && nextInfo && (
                                                                <Button size="small" type="primary"
                                                                    onClick={() => updateStatus(b.id, nextStatus!)}
                                                                    style={{ borderRadius: 5, fontSize: 10, height: 24, background: nextInfo.color, border: 'none', fontWeight: 700, padding: '0 8px', whiteSpace: 'nowrap' }}
                                                                >
                                                                    {nextInfo.label}
                                                                </Button>
                                                            )}
                                                            {b.greetingStatus === 'WAITING' && (
                                                                <Button size="small" danger onClick={() => handleDelay(b.id)}
                                                                    style={{ borderRadius: 5, fontSize: 10, height: 24, padding: '0 6px' }}>Rötar</Button>
                                                            )}
                                                            {!isFinished && (
                                                                <Button size="small"
                                                                    onClick={() => setNoteModal({ visible: true, bookingId: b.id, bookingNumber: b.bookingNumber })}
                                                                    style={{ borderRadius: 5, fontSize: 10, height: 24, padding: '0 6px' }}>Not</Button>
                                                            )}
                                                            {!isFinished && (
                                                                <Button size="small"
                                                                    icon={<SwapRightOutlined style={{ fontSize: 10 }} />}
                                                                    onClick={() => handleMovePassenger(b)}
                                                                    style={{ borderRadius: 5, fontSize: 10, height: 24, padding: '0 6px' }}>Sefer</Button>
                                                            )}
                                                            <Button size="small" type="link"
                                                                onClick={() => setDetailModal({ visible: true, record: b })}
                                                                style={{ fontSize: 10, height: 24, padding: '0 4px' }}>Detay</Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ),
                                };
                            })}
                        />
                    </div>
                )}

                {/* ═══ PRIVATE TRANSFERS TABLE ═══ */}
                {(viewTab === 'all' || viewTab === 'private') && (
                    <Card
                        styles={{ body: { padding: 0 } }}
                        style={{
                            borderRadius: 10, overflow: 'hidden',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 6px rgba(0,0,0,0.04)'
                        }}
                    >
                        <Table
                            columns={columns}
                            dataSource={privateArrivals}
                            rowKey="id"
                            loading={loading}
                            scroll={{ x: 1100 }}
                            pagination={{
                                pageSize: 20,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '20', '50'],
                                showTotal: (total) => <span style={{ fontSize: 11, color: '#64748b' }}>Toplam <strong>{total}</strong> varış</span>,
                                style: { padding: '8px 12px', margin: 0 },
                            }}
                            size="small"
                            rowClassName={(r) => {
                                if (r.greetingStatus === 'DELAYED') return 'row-delayed';
                                if (r.greetingStatus === 'HANDED_OFF') return 'row-done';
                                if (r.greetingStatus === 'NO_SHOW' || r.greetingStatus === 'CANCELLED') return 'row-cancelled';
                                return '';
                            }}
                            locale={{
                                emptyText: (
                                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                                        <div style={{ fontSize: 36, marginBottom: 8 }}>✈</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                            Özel transfer varışı yok
                                        </div>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                            Seçili tarihe ait özel transfer varışı yok
                                        </div>
                                    </div>
                                ),
                                filterTitle: 'Filtrele',
                                filterConfirm: 'Uygula',
                                filterReset: 'Temizle',
                                filterSearchPlaceholder: 'Listede ara...',
                                filterCheckall: 'Tümünü Seç',
                            }}
                        />
                    </Card>
                )}

                {/* ═══ COMPLETED GREETINGS TAB ═══ */}
                {viewTab === 'completed' && (
                    <Card
                        styles={{ body: { padding: 0 } }}
                        style={{
                            borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 6px rgba(0,0,0,0.04)'
                        }}
                    >
                        <Table
                            size="small"
                            rowKey="id"
                            loading={completedLoading}
                            dataSource={completed}
                            pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], style: { padding: '8px 12px', margin: 0 } }}
                            scroll={{ x: 1000 }}
                            locale={{
                                emptyText: (
                                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                                        <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Henüz tamamlanan karşılama yok</div>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>Bugün tamamlanan kayıtlar burada görünecek</div>
                                    </div>
                                )
                            }}
                            columns={[
                                {
                                    title: 'Saat',
                                    key: 'time',
                                    width: 90,
                                    render: (_, r) => (
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 12, color: '#0ea5e9', fontFamily: 'monospace' }}>
                                                {r.flightTime || (r.pickupDateTime ? dayjs(r.pickupDateTime).format('HH:mm') : '-')}
                                            </div>
                                            {r.flightNumber && <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{r.flightNumber}</div>}
                                        </div>
                                    )
                                },
                                {
                                    title: 'Müşteri',
                                    key: 'customer',
                                    width: 200,
                                    render: (_, r) => (
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 13 }}>{r.passengerName || '-'}</div>
                                            {r.passengerPhone && (
                                                <a href={`tel:${r.passengerPhone}`} style={{ fontSize: 11, color: '#3b82f6' }}>
                                                    <PhoneOutlined style={{ fontSize: 9, marginRight: 3 }} />{r.passengerPhone}
                                                </a>
                                            )}
                                            <div style={{ fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace' }}>{r.bookingNumber}</div>
                                        </div>
                                    )
                                },
                                {
                                    title: 'Varış',
                                    key: 'dropoff',
                                    width: 220,
                                    render: (_, r) => (
                                        <span style={{ fontSize: 11, color: '#334155' }}>
                                            <EnvironmentOutlined style={{ color: '#ef4444', fontSize: 10, marginRight: 3 }} />
                                            {r.dropoff || '-'}
                                        </span>
                                    )
                                },
                                {
                                    title: 'Şoför',
                                    key: 'driver',
                                    width: 180,
                                    render: (_, r) => (
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{r.driverName || '-'}</div>
                                            {r.vehiclePlate && (
                                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#0369a1', background: '#f0f9ff', padding: '1px 5px', borderRadius: 3 }}>
                                                    {r.vehiclePlate}
                                                </span>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    title: 'Karşılayan',
                                    key: 'greeter',
                                    width: 140,
                                    render: (_, r) => <span style={{ fontSize: 11, color: '#64748b' }}>{r.greeterName || '-'}</span>
                                },
                                {
                                    title: 'Durum',
                                    dataIndex: 'greetingStatus',
                                    key: 'status',
                                    width: 130,
                                    render: (_, r) => {
                                        const gs = GREETING_STATUS[r.greetingStatus] || GREETING_STATUS.HANDED_OFF;
                                        const ts = r.handedOffAt || r.greetedAt;
                                        return (
                                            <div>
                                                <Tag style={{ background: gs.bg, color: gs.color, border: `1px solid ${gs.border}`, fontSize: 10, fontWeight: 700, borderRadius: 6 }}>
                                                    {gs.icon} {gs.label}
                                                </Tag>
                                                {ts && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{dayjs(ts).format('HH:mm')}</div>}
                                            </div>
                                        );
                                    }
                                },
                            ]}
                        />
                    </Card>
                )}

                {/* ═══ DRIVER LOCATIONS MODAL (1 hour window, anti-delay tool) ═══ */}
                <Modal
                    open={driverLocModal}
                    onCancel={() => setDriverLocModal(false)}
                    footer={null}
                    width={780}
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CompassOutlined style={{ color: '#d97706' }} />
                            <span>Şoför Konumları — Önümüzdeki 1 saat</span>
                            <Button size="small" icon={<ReloadOutlined />} loading={driverLocLoading} onClick={fetchDriverLocations} style={{ marginLeft: 'auto' }}>
                                Yenile
                            </Button>
                        </div>
                    }
                >
                    <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                        {driverLocations.length === 0 && !driverLocLoading && (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                <AimOutlined style={{ fontSize: 40, marginBottom: 8 }} />
                                <div style={{ fontSize: 13, fontWeight: 600 }}>Önümüzdeki 1 saat içinde aktif şoför yok</div>
                                <div style={{ fontSize: 11 }}>Sadece pickup'ı 1 saat içinde olan veya devam eden seferlerin şoförleri burada listelenir</div>
                            </div>
                        )}
                        {driverLocations.map((d: any) => {
                            const minutesAgo = d.lastSeen ? Math.round((Date.now() - d.lastSeen) / 60000) : null;
                            const stale = minutesAgo === null || minutesAgo > 5;
                            return (
                                <div key={d.driverId} style={{
                                    display: 'flex', gap: 12, alignItems: 'flex-start',
                                    padding: 12, marginBottom: 8, borderRadius: 10,
                                    background: '#fff', border: `1px solid ${d.online && !stale ? '#86efac' : '#fde68a'}`,
                                    borderLeft: `4px solid ${d.online && !stale ? '#16a34a' : '#f59e0b'}`,
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 20,
                                        background: d.online && !stale ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <IdcardOutlined style={{ color: d.online && !stale ? '#16a34a' : '#92400e', fontSize: 16 }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{d.name}</span>
                                            {d.vehicle?.plate && (
                                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#0369a1', background: '#f0f9ff', padding: '1px 6px', borderRadius: 3, border: '1px solid #bae6fd' }}>
                                                    <CarOutlined style={{ fontSize: 9, marginRight: 3 }} />{d.vehicle.plate}
                                                </span>
                                            )}
                                            <Tag color={d.online && !stale ? 'success' : 'warning'} style={{ fontSize: 10, fontWeight: 700, margin: 0 }}>
                                                <WifiOutlined style={{ fontSize: 9, marginRight: 3 }} />
                                                {d.online && !stale ? 'Çevrimiçi' : (minutesAgo !== null ? `${minutesAgo} dk önce` : 'Bilinmiyor')}
                                            </Tag>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                            {d.phone && (
                                                <a href={`tel:${d.phone}`} style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>
                                                    <PhoneOutlined style={{ fontSize: 10, marginRight: 3 }} />{d.phone}
                                                </a>
                                            )}
                                            {d.location && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${d.location.lat},${d.location.lng}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    style={{ fontSize: 11, color: '#7c3aed', textDecoration: 'none' }}
                                                >
                                                    <EnvironmentOutlined style={{ fontSize: 10, marginRight: 3 }} />
                                                    Haritada Aç ({d.location.lat.toFixed(4)}, {d.location.lng.toFixed(4)})
                                                </a>
                                            )}
                                            {!d.location && (
                                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                                    <AimOutlined style={{ fontSize: 10, marginRight: 3 }} />
                                                    Konum yok
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                                            <strong>{d.bookings?.length || 0}</strong> sefer:{' '}
                                            {(d.bookings || []).slice(0, 3).map((b: any, i: number) => (
                                                <span key={b.id}>
                                                    {i > 0 && ', '}
                                                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#0ea5e9' }}>{b.bookingNumber}</span>
                                                    {b.pickupDateTime && <span style={{ color: '#94a3b8' }}> @ {dayjs(b.pickupDateTime).format('HH:mm')}</span>}
                                                </span>
                                            ))}
                                            {(d.bookings?.length || 0) > 3 && <span style={{ color: '#94a3b8' }}> +{d.bookings.length - 3} daha</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Modal>

                {/* ═══ FLIGHT INFO MODAL ═══ */}
                <Modal
                    open={flightModal.visible}
                    onCancel={() => setFlightModal({ visible: false, flightNumber: '', loading: false, data: null, record: null })}
                    footer={null}
                    width={560}
                    title={null}
                    styles={{ body: { padding: 0 } }}
                >
                    {(() => {
                        const fm = flightModal;
                        const fd = fm.data;
                        const rec = fm.record;

                        const statusMap: Record<string, { label: string; color: string; bg: string }> = {
                            scheduled: { label: 'Planlandı', color: '#d97706', bg: '#fffbeb' },
                            active:    { label: 'Havada', color: '#2563eb', bg: '#eff6ff' },
                            landed:    { label: 'İndi', color: '#16a34a', bg: '#f0fdf4' },
                            cancelled: { label: 'İptal', color: '#dc2626', bg: '#fef2f2' },
                            diverted:  { label: 'Yön Değiştirdi', color: '#ea580c', bg: '#fff7ed' },
                        };
                        const st = fd ? (statusMap[fd.status] || statusMap.scheduled) : statusMap.scheduled;

                        let progressPct = 0;
                        if (fd) {
                            if (fd.status === 'landed') progressPct = 100;
                            else if (fd.status === 'active' && fd.departure?.scheduled && fd.arrival?.scheduled) {
                                const depTime = new Date(fd.departure.scheduled).getTime();
                                const arrTime = new Date(fd.arrival.estimated || fd.arrival.scheduled).getTime();
                                const now = Date.now();
                                if (arrTime > depTime) {
                                    progressPct = Math.min(95, Math.max(5, ((now - depTime) / (arrTime - depTime)) * 100));
                                }
                            } else if (fd.status === 'scheduled') progressPct = 0;
                        }

                        const altitude = fd?.live?.altitude ? `${Math.round(fd.live.altitude * 0.3048)}m (FL${Math.round(fd.live.altitude / 100)})` : null;

                        return (
                            <div>
                                {/* Header */}
                                <div style={{
                                    background: 'linear-gradient(135deg, #0c4a6e, #0369a1, #0ea5e9)',
                                    padding: '20px 24px', color: '#fff',
                                    borderRadius: '8px 8px 0 0',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 1 }}>
                                                {fm.flightNumber}
                                            </div>
                                            {fd?.departure?.airport && (
                                                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                                                    {fd.departure.airport}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{
                                            padding: '4px 12px', borderRadius: 6,
                                            background: st.bg, color: st.color,
                                            fontWeight: 700, fontSize: 12,
                                        }}>
                                            {fm.loading ? <LoadingOutlined spin /> : st.label}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: '20px 24px' }}>
                                    {fm.loading ? (
                                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                            <LoadingOutlined spin style={{ fontSize: 32, color: '#0ea5e9' }} />
                                            <div style={{ marginTop: 12, color: '#64748b', fontSize: 13 }}>Uçuş bilgileri yükleniyor...</div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Route Visualization */}
                                            <div style={{
                                                background: '#f8fafc', borderRadius: 12, padding: '20px',
                                                border: '1px solid #e2e8f0', marginBottom: 16,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>
                                                            {fd?.departure?.airport?.match(/\(([A-Z]{3})\)/)?.[1] || rec?.pickup?.match(/\b(AYT|GZP|DAL|IST|SAW|ESB|ADB|BJV|DLM)\b/i)?.[1]?.toUpperCase() || 'DEP'}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {fd?.departure?.airport || 'Kalkış'}
                                                        </div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                                                            {fd?.departure?.scheduled ? dayjs(fd.departure.scheduled).format('HH:mm') : '-'}
                                                        </div>
                                                    </div>

                                                    <div style={{ flex: 1, margin: '0 16px', position: 'relative' }}>
                                                        <div style={{
                                                            height: 3, background: '#e2e8f0', borderRadius: 2,
                                                            position: 'relative', overflow: 'visible',
                                                        }}>
                                                            <div style={{
                                                                height: '100%', borderRadius: 2,
                                                                background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                                                                width: `${progressPct}%`,
                                                                transition: 'width 1s ease',
                                                            }} />
                                                            <div style={{
                                                                position: 'absolute',
                                                                left: `${Math.max(0, Math.min(92, progressPct - 4))}%`,
                                                                top: -12,
                                                                fontSize: 20,
                                                                transition: 'left 1s ease',
                                                                filter: fd?.status === 'active' ? 'none' : 'grayscale(0.5)',
                                                            }}>
                                                                ✈️
                                                            </div>
                                                        </div>
                                                        {fd?.status === 'active' && altitude && (
                                                            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: '#64748b' }}>
                                                                🔼 {altitude}
                                                                {fd.live?.speed_horizontal ? ` · ${Math.round(fd.live.speed_horizontal)} km/h` : ''}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>
                                                            {fd?.arrival?.airport?.match(/\(([A-Z]{3})\)/)?.[1] || rec?.pickup?.match(/\b(AYT|GZP|DAL|IST|SAW|ESB|ADB|BJV|DLM)\b/i)?.[1]?.toUpperCase() || 'ARR'}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {fd?.arrival?.airport || 'Varış'}
                                                        </div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                                                            {fd?.arrival?.scheduled ? dayjs(fd.arrival.scheduled).format('HH:mm') : (rec?.flightTime || '-')}
                                                        </div>
                                                    </div>
                                                </div>

                                                {fd?.status === 'active' && (
                                                    <div style={{ textAlign: 'center', fontSize: 11, color: '#0369a1', fontWeight: 600, marginTop: 4 }}>
                                                        Uçuş devam ediyor — %{Math.round(progressPct)} tamamlandı
                                                    </div>
                                                )}
                                            </div>

                                            {/* Time Details */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
                                                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Planlanan Varış</div>
                                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                                                        {fd?.arrival?.scheduled ? dayjs(fd.arrival.scheduled).format('HH:mm') : (rec?.flightTime || '-')}
                                                    </div>
                                                </div>
                                                <div style={{ background: fd?.arrival?.estimated ? '#f0fdf4' : '#f8fafc', borderRadius: 8, padding: 12, border: `1px solid ${fd?.arrival?.estimated ? '#86efac' : '#e2e8f0'}` }}>
                                                    <div style={{ fontSize: 9, color: fd?.arrival?.estimated ? '#16a34a' : '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Tahmini Varış</div>
                                                    <div style={{ fontSize: 16, fontWeight: 800, color: fd?.arrival?.estimated ? '#16a34a' : '#1e293b' }}>
                                                        {fd?.arrival?.estimated ? dayjs(fd.arrival.estimated).format('HH:mm') : '-'}
                                                    </div>
                                                </div>
                                                {fd?.arrival?.actual && (
                                                    <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', borderRadius: 8, padding: 12, border: '1px solid #86efac' }}>
                                                        <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Gerçek Varış</div>
                                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                                                            {dayjs(fd.arrival.actual).format('HH:mm')}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Live Data */}
                                            {fd?.live && !fd.live.is_ground && (
                                                <div style={{
                                                    background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', borderRadius: 10,
                                                    padding: 14, border: '1px solid #bae6fd', marginBottom: 16,
                                                }}>
                                                    <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Canlı Uçuş Verisi</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                        <div>
                                                            <div style={{ fontSize: 9, color: '#64748b' }}>Yükseklik</div>
                                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{altitude || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 9, color: '#64748b' }}>Hız</div>
                                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                                                                {fd.live.speed_horizontal ? `${Math.round(fd.live.speed_horizontal)} km/h` : '-'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 9, color: '#64748b' }}>Konum</div>
                                                            <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', fontFamily: 'monospace' }}>
                                                                {fd.live.latitude ? `${fd.live.latitude.toFixed(2)}°, ${fd.live.longitude.toFixed(2)}°` : '-'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Customer Info */}
                                            {rec && (
                                                <div style={{ background: '#faf5ff', borderRadius: 8, padding: 12, border: '1px solid #e9d5ff', marginBottom: 16 }}>
                                                    <div style={{ fontSize: 9, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Bu Uçuştaki Müşteri</div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{rec.passengerName}</div>
                                                            <div style={{ fontSize: 11, color: '#64748b' }}>{rec.bookingNumber} · {(rec.adults || 1) + (rec.children || 0) + (rec.infants || 0)} Pax</div>
                                                        </div>
                                                        {rec.passengerPhone && (
                                                            <a href={`tel:${rec.passengerPhone}`} style={{
                                                                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                                                                background: '#7c3aed', color: '#fff', borderRadius: 6, fontSize: 11,
                                                                fontWeight: 600, textDecoration: 'none', height: 'fit-content',
                                                            }}>
                                                                <PhoneOutlined /> Ara
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Flightradar24 Button */}
                                            <Button
                                                type="primary"
                                                block
                                                size="large"
                                                icon={<GlobalOutlined />}
                                                onClick={() => window.open(`https://www.flightradar24.com/${fm.flightNumber}`, '_blank')}
                                                style={{
                                                    borderRadius: 10, fontWeight: 700, height: 44,
                                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                    border: 'none', fontSize: 14,
                                                    boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
                                                }}
                                            >
                                                Flightradar24'te Canlı İzle
                                            </Button>

                                            {!fd && (
                                                <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#94a3b8' }}>
                                                    API verisi alınamadı — Flightradar24 butonuyla canlı takip yapabilirsiniz
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </Modal>

                {/* ═══ NOTE MODAL ═══ */}
                <Modal
                    title={`Not Ekle — ${noteModal.bookingNumber}`}
                    open={noteModal.visible}
                    onCancel={() => { setNoteModal({ visible: false, bookingId: '', bookingNumber: '' }); setNoteText(''); }}
                    onOk={addNote}
                    okText="Gönder"
                    cancelText="Vazgeç"
                    okButtonProps={{ icon: <SendOutlined />, disabled: !noteText.trim() }}
                >
                    <TextArea
                        rows={3}
                        placeholder="Operasyona iletmek istediğiniz notu yazın..."
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        style={{ borderRadius: 8 }}
                        maxLength={500}
                        showCount
                    />
                </Modal>

                {/* ═══ DETAIL MODAL ═══ */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>✈</span>
                            <span>Detay — {detailModal.record?.bookingNumber}</span>
                        </div>
                    }
                    open={detailModal.visible}
                    onCancel={() => setDetailModal({ visible: false, record: null })}
                    footer={null}
                    width={520}
                >
                    {detailModal.record && (() => {
                        const r = detailModal.record;
                        const gs = GREETING_STATUS[r.greetingStatus] || GREETING_STATUS.WAITING;
                        return (
                            <div>
                                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                    <Tag style={{
                                        fontSize: 14, borderRadius: 8, fontWeight: 700, lineHeight: '28px',
                                        background: gs.bg, color: gs.color, border: `2px solid ${gs.border}`,
                                        padding: '4px 16px',
                                    }}>
                                        {gs.icon} {gs.label}
                                    </Tag>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Uçuş</div>
                                        <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{r.flightNumber || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>İniş Saati</div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                                            {r.flightTime || (r.pickupDateTime ? dayjs(r.pickupDateTime).format('HH:mm') : '-')}
                                            {r.actualLanding && <span style={{ color: '#16a34a', marginLeft: 6, fontSize: 11 }}>✓ İndi</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Müşteri</div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.passengerName}</div>
                                        {r.passengerPhone && <div style={{ fontSize: 11, color: '#3b82f6' }}>{r.passengerPhone}</div>}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Kişi Sayısı</div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{(r.adults || 1) + (r.children || 0) + (r.infants || 0)} Pax</div>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Varış Noktası</div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.dropoff || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Şoför</div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.driverName || 'Atanmadı'}</div>
                                        {r.driverPhone && <div style={{ fontSize: 11, color: '#3b82f6' }}>{r.driverPhone}</div>}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Araç</div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.vehiclePlate || r.vehicleType || '-'}</div>
                                        {r.vehicleBrand && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.vehicleBrand}</div>}
                                    </div>
                                </div>
                                {r.specialRequests && (
                                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                                        <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700, marginBottom: 2 }}>ÖZEL İSTEK</div>
                                        <div style={{ fontSize: 12, color: '#92400e' }}>{r.specialRequests}</div>
                                    </div>
                                )}
                                {r.greeterNotes && r.greeterNotes.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>
                                            Zaman Çizelgesi
                                        </div>
                                        <Timeline
                                            items={[...r.greeterNotes].reverse().map((note: any) => ({
                                                color: note.isSystem ? '#94a3b8' : '#3b82f6',
                                                children: (
                                                    <div>
                                                        <div style={{ fontSize: 12, color: note.isSystem ? '#94a3b8' : '#1e293b', fontWeight: note.isSystem ? 400 : 600 }}>
                                                            {note.text}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#cbd5e1' }}>
                                                            {note.by} — {dayjs(note.at).format('HH:mm:ss')}
                                                        </div>
                                                    </div>
                                                ),
                                            }))}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </Modal>

                {/* ═══ DRIVER SELECTION MODAL ═══ */}
                <Modal
                    title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CarOutlined style={{ color: '#6366f1' }} />
                        <span>Şoför Seçin — Teslim Et</span>
                    </div>}
                    open={handoffModal.visible}
                    onCancel={() => setHandoffModal({ visible: false, bookingId: '', bookingNumber: '', passengerName: '' })}
                    onOk={confirmHandoff}
                    okText="Teslim Et"
                    cancelText="Vazgeç"
                    okButtonProps={{
                        disabled: !selectedDriver,
                        style: { background: selectedDriver ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : undefined, border: 'none', fontWeight: 700 }
                    }}
                    width={500}
                >
                    <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Müşteri</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{handoffModal.passengerName}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{handoffModal.bookingNumber}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                        Şoför atanmamış. Lütfen müşteriyi teslim edeceğiniz şoförü seçin:
                    </div>
                    {driverListLoading ? (
                        <div style={{ textAlign: 'center', padding: 30 }}>
                            <LoadingOutlined style={{ fontSize: 24, color: '#6366f1' }} />
                            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Şoförler yükleniyor...</div>
                        </div>
                    ) : (
                        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {driverList.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Uygun şoför bulunamadı</div>
                            ) : driverList.map(d => (
                                <div
                                    key={d.id}
                                    onClick={() => setSelectedDriver(d.userId || d.id)}
                                    style={{
                                        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                        border: `2px solid ${selectedDriver === (d.userId || d.id) ? '#6366f1' : '#e2e8f0'}`,
                                        background: selectedDriver === (d.userId || d.id) ? '#eef2ff' : '#fff',
                                        transition: 'all 0.15s',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}
                                >
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 8,
                                        background: selectedDriver === (d.userId || d.id) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#f1f5f9',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: selectedDriver === (d.userId || d.id) ? '#fff' : '#64748b',
                                        fontWeight: 700, fontSize: 14,
                                    }}>
                                        {d.avatar ? (
                                            <img src={d.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                                        ) : (
                                            d.name?.charAt(0)?.toUpperCase() || <UserOutlined />
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{d.name}</div>
                                        {d.phone && <div style={{ fontSize: 11, color: '#64748b' }}><PhoneOutlined style={{ fontSize: 9, marginRight: 3 }} />{d.phone}</div>}
                                    </div>
                                    {d.vehicle && (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{d.vehicle.plate}</div>
                                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{d.vehicle.brand}</div>
                                        </div>
                                    )}
                                    {selectedDriver === (d.userId || d.id) && (
                                        <CheckCircleOutlined style={{ color: '#6366f1', fontSize: 18 }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>

                {/* ═══ SHUTTLE MOVE MODAL ═══ */}
                <Modal
                    title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SwapRightOutlined style={{ color: '#6366f1' }} />
                        <span>Sefer Değiştir</span>
                    </div>}
                    open={moveModal.visible}
                    onCancel={() => setMoveModal({ visible: false, bookingId: '', bookingNumber: '', passengerName: '' })}
                    footer={null}
                    width={560}
                >
                    <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Taşınacak Müşteri</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{moveModal.passengerName}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{moveModal.bookingNumber}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                        Müşteriyi taşımak istediğiniz seferi seçin:
                    </div>
                    {shuttleRunsLoading ? (
                        <div style={{ textAlign: 'center', padding: 30 }}>
                            <LoadingOutlined style={{ fontSize: 24, color: '#6366f1' }} />
                            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Seferler yükleniyor...</div>
                        </div>
                    ) : (
                        <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {shuttleRuns.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Bugün için shuttle seferi bulunamadı</div>
                            ) : shuttleRuns.map((run: any, idx: number) => {
                                const isCurrent = run.runKey === moveModal.currentRunKey ||
                                    run.bookings?.some((b: any) => b.id === moveModal.bookingId);
                                const paxCount = run.bookings?.length || 0;
                                return (
                                    <div
                                        key={run.runKey || idx}
                                        onClick={() => !isCurrent && executeMovePassenger(run)}
                                        style={{
                                            padding: '10px 14px', borderRadius: 10,
                                            cursor: isCurrent ? 'not-allowed' : 'pointer',
                                            border: `2px solid ${isCurrent ? '#86efac' : '#e2e8f0'}`,
                                            background: isCurrent ? '#f0fdf4' : '#fff',
                                            opacity: isCurrent ? 0.7 : 1,
                                            transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', gap: 12,
                                        }}
                                    >
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 10,
                                            background: isCurrent ? '#dcfce7' : 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: 14, color: isCurrent ? '#16a34a' : '#4f46e5', lineHeight: 1 }}>
                                                {run.departureTime || '--:--'}
                                            </div>
                                            <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>
                                                {run.tripType || ''}
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                                                {run.routeName || 'Shuttle'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                                {paxCount} müşteri
                                                {run.maxSeats ? ` / ${run.maxSeats} koltuk` : ''}
                                            </div>
                                            {run.bookings && run.bookings.length > 0 && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                                    {run.bookings.slice(0, 3).map((b: any) => b.contactName).join(', ')}
                                                    {run.bookings.length > 3 && ` +${run.bookings.length - 3}`}
                                                </div>
                                            )}
                                        </div>
                                        {isCurrent ? (
                                            <Tag color="green" style={{ fontSize: 10, borderRadius: 6 }}>Mevcut</Tag>
                                        ) : (
                                            <SwapRightOutlined style={{ color: '#6366f1', fontSize: 18 }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Modal>

                {/* ═══ STYLES ═══ */}
                <style>{`
                    .ant-table-thead > tr > th {
                        background: #f0f9ff !important;
                        font-weight: 700 !important;
                        font-size: 11px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.4px !important;
                        color: #0369a1 !important;
                        border-bottom: 2px solid #bae6fd !important;
                        padding: 10px 12px !important;
                    }
                    .ant-table-tbody > tr > td {
                        padding: 10px 12px !important;
                        border-bottom: 1px solid #f1f5f9 !important;
                        vertical-align: top !important;
                    }
                    .ant-table-tbody > tr:hover > td {
                        background: #f0f9ff !important;
                    }
                    .ant-table-tbody > tr.row-delayed > td {
                        background: #fffbeb !important;
                    }
                    .ant-table-tbody > tr.row-delayed:hover > td {
                        background: #fef3c7 !important;
                    }
                    .ant-table-tbody > tr.row-done > td {
                        background: #f0fdf4 !important;
                        opacity: 0.7;
                    }
                    .ant-table-tbody > tr.row-cancelled > td {
                        background: #fef2f2 !important;
                        opacity: 0.5;
                    }
                    .ant-table-cell-fix-left, .ant-table-cell-fix-right {
                        background: inherit !important;
                    }
                    .ant-table-thead .ant-table-cell-fix-left,
                    .ant-table-thead .ant-table-cell-fix-right {
                        background: #f0f9ff !important;
                    }
                    .ant-table-filter-dropdown {
                        border-radius: 10px !important;
                        box-shadow: 0 8px 30px rgba(0,0,0,0.12) !important;
                    }
                `}</style>
            </AirportLayout>
        </AirportGuard>
    );
}
