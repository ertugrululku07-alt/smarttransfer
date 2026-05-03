'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Table, Tag, Button, Typography, message, Input, Card, Select, Modal,
    Badge, Tooltip, Timeline, Space, DatePicker
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    ReloadOutlined, SearchOutlined, PhoneOutlined, CarOutlined,
    EnvironmentOutlined, CalendarOutlined, IdcardOutlined, TeamOutlined,
    CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, SendOutlined, UserOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import relativeTime from 'dayjs/plugin/relativeTime';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
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

const AIRPORTS = [
    { value: '', label: 'Tüm Havalimanları' },
    { value: 'antalya', label: 'Antalya (AYT)' },
    { value: 'gazipaşa', label: 'Gazipaşa (GZP)' },
    { value: 'dalaman', label: 'Dalaman (DLM)' },
];

export default function AirportGreetingPage() {
    const [arrivals, setArrivals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [airportFilter, setAirportFilter] = useState('');
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [noteModal, setNoteModal] = useState<{ visible: boolean; bookingId: string; bookingNumber: string }>({ visible: false, bookingId: '', bookingNumber: '' });
    const [noteText, setNoteText] = useState('');
    const [detailModal, setDetailModal] = useState<{ visible: boolean; record: any | null }>({ visible: false, record: null });
    const refreshTimer = useRef<any>(null);

    /* ── Fetch ── */
    const fetchArrivals = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = { date: selectedDate.format('YYYY-MM-DD') };
            if (airportFilter) params.airport = airportFilter;
            const res = await apiClient.get('/api/transfer/airport-arrivals', { params });
            if (res.data.success) {
                setArrivals(res.data.data);
            } else {
                message.error('Veriler alınamadı');
            }
        } catch (err) {
            console.error(err);
            message.error('Bağlantı hatası');
        } finally {
            setLoading(false);
            setLastRefresh(new Date());
        }
    }, [selectedDate, airportFilter]);

    useEffect(() => { fetchArrivals(); }, [fetchArrivals]);

    /* ── Auto refresh every 30s ── */
    useEffect(() => {
        if (autoRefresh) {
            refreshTimer.current = setInterval(fetchArrivals, 30000);
        }
        return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    }, [autoRefresh, fetchArrivals]);

    /* ── Search ── */
    const filtered = useMemo(() => {
        if (!searchText) return arrivals;
        const q = searchText.toLowerCase();
        return arrivals.filter(b =>
            b.bookingNumber?.toLowerCase().includes(q) ||
            b.passengerName?.toLowerCase().includes(q) ||
            b.passengerPhone?.toLowerCase().includes(q) ||
            b.flightNumber?.toLowerCase().includes(q) ||
            b.driverName?.toLowerCase().includes(q) ||
            b.vehiclePlate?.toLowerCase().includes(q)
        );
    }, [arrivals, searchText]);

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
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', fontFamily: 'monospace' }}>
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
                        {r.passengerPhone && (
                            <a href={`tel:${r.passengerPhone}`} style={{ fontSize: 11, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                                <PhoneOutlined style={{ fontSize: 9 }} />
                                {r.passengerPhone}
                            </a>
                        )}
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
                                onClick={() => updateStatus(r.id, nextStatus!)}
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
        <AdminGuard>
            <AdminLayout selectedKey="airport-greeting">
                {/* ═══ HEADER ═══ */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    marginBottom: 16, flexWrap: 'wrap', gap: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 16px rgba(14,165,233,0.3)',
                            fontSize: 22, color: '#fff'
                        }}>
                            ✈
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
                                Havalimanı Karşılama
                            </h1>
                            <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                                {selectedDate.format('DD MMMM YYYY')} — Son yenileme: {dayjs(lastRefresh).format('HH:mm:ss')}
                                {autoRefresh && <span style={{ color: '#16a34a', marginLeft: 6 }}>● Canlı</span>}
                            </Text>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <DatePicker
                            value={selectedDate}
                            onChange={(d) => d && setSelectedDate(d)}
                            format="DD.MM.YYYY"
                            style={{ borderRadius: 8, width: 130 }}
                            size="middle"
                            allowClear={false}
                        />
                        <Select
                            value={airportFilter}
                            onChange={setAirportFilter}
                            options={AIRPORTS}
                            style={{ width: 170, borderRadius: 8 }}
                            size="middle"
                        />
                        <Input
                            placeholder="Uçuş, isim, tel, plaka..."
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                            style={{ width: 200, borderRadius: 8 }}
                            size="middle"
                        />
                        <Button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            style={{
                                borderRadius: 8, fontWeight: 600,
                                color: autoRefresh ? '#16a34a' : '#94a3b8',
                                borderColor: autoRefresh ? '#86efac' : '#e2e8f0',
                            }}
                            size="middle"
                        >
                            {autoRefresh ? '● Canlı' : '○ Durdur'}
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchArrivals}
                            loading={loading}
                            type="primary"
                            style={{
                                borderRadius: 8, fontWeight: 700,
                                background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                                border: 'none',
                            }}
                        >
                            Yenile
                        </Button>
                    </div>
                </div>

                {/* ═══ STATS ═══ */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                        background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: 16, color: '#0ea5e9' }}>{stats.total}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Toplam</span>
                    </div>
                    {Object.entries(GREETING_STATUS).map(([key, val]) => {
                        const count = stats[key] || 0;
                        if (count === 0) return null;
                        return (
                            <div key={key} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                                background: val.bg, borderRadius: 8, border: `1px solid ${val.border}`,
                            }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: val.color }}>{count}</span>
                                <span style={{ fontSize: 10, color: val.color, fontWeight: 600 }}>{val.label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* ═══ TABLE ═══ */}
                <Card
                    styles={{ body: { padding: 0 } }}
                    style={{
                        borderRadius: 12, overflow: 'hidden',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
                    }}
                >
                    <Table
                        columns={columns}
                        dataSource={filtered}
                        rowKey="id"
                        loading={loading}
                        scroll={{ x: 1100 }}
                        pagination={{
                            pageSize: 20,
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '20', '50'],
                            showTotal: (total) => <span style={{ fontSize: 12, color: '#64748b' }}>Toplam <strong>{total}</strong> varış</span>,
                            style: { padding: '10px 16px', margin: 0 },
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
                                <div style={{ padding: '50px 0', textAlign: 'center' }}>
                                    <div style={{ fontSize: 40, marginBottom: 10 }}>✈</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                        Bugün için varış bulunamadı
                                    </div>
                                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                                        Seçili tarihe ait havalimanı varışı yok
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
                                {/* Status Badge */}
                                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                    <Tag style={{
                                        fontSize: 14, borderRadius: 8, fontWeight: 700, lineHeight: '28px',
                                        background: gs.bg, color: gs.color, border: `2px solid ${gs.border}`,
                                        padding: '4px 16px',
                                    }}>
                                        {gs.icon} {gs.label}
                                    </Tag>
                                </div>

                                {/* Info Grid */}
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

                                {/* Special Requests */}
                                {r.specialRequests && (
                                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                                        <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700, marginBottom: 2 }}>ÖZEL İSTEK</div>
                                        <div style={{ fontSize: 12, color: '#92400e' }}>{r.specialRequests}</div>
                                    </div>
                                )}

                                {/* Timeline */}
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
            </AdminLayout>
        </AdminGuard>
    );
}
