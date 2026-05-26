'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Card, Button, Table, Tag, Space, DatePicker, Tooltip, Modal, message, Tabs, Badge,
    Typography, Statistic, Row, Col, Empty, Drawer, Descriptions, Input, Select, Popconfirm
} from 'antd';
import {
    SendOutlined, CloseCircleOutlined, ReloadOutlined, EyeOutlined, RedoOutlined,
    FilterOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined,
    DeleteOutlined, ThunderboltOutlined, CarOutlined, UserOutlined, EnvironmentOutlined,
    DownOutlined, PhoneOutlined, TeamOutlined, IdcardOutlined, ClockCircleOutlined,
    ArrowRightOutlined, InfoCircleOutlined, SafetyCertificateOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '@/lib/api-client';
import AdminGuard from '../../AdminGuard';
import AdminLayout from '../../AdminLayout';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type Driver = { id: string; name: string; phone?: string; tcNo?: string } | null;
type Vehicle = { id: string; plate: string; brand?: string; model?: string } | null;
type BookingMini = {
    id: string; bookingNumber: string; contactName: string; contactPhone?: string;
    pickup: string; dropoff: string; pickupRegionCode?: string; dropoffRegionCode?: string;
    startDate: string; adults: number; children: number; infants: number; status: string;
    driver?: Driver; vehicle?: Vehicle;
};
type SubmissionRef = {
    id: string; status: 'SENT' | 'CANCELLED' | 'REJECTED' | 'PENDING';
    uetdsSeferId?: string | null; submittedAt?: string | null;
    cancelledAt?: string | null; errorMessage?: string | null;
} | null;

type QueueItem = {
    kind: 'SOLO' | 'RUN';
    key: string;
    bookingId?: string | null;
    runKey?: string | null;
    bookings: BookingMini[];
    driver: Driver;
    vehicle: Vehicle;
    pickup: string;
    dropoff: string;
    pickupRegionCode?: string | null;
    dropoffRegionCode?: string | null;
    startDate: string | null;
    passengerCount: number;
    routeName?: string;
    departureTime?: string | null;
    submission: SubmissionRef;
};

type Submission = {
    id: string;
    status: 'SENT' | 'CANCELLED' | 'REJECTED' | 'PENDING';
    uetdsSeferId?: string | null;
    uetdsRefNo?: string | null;
    errorMessage?: string | null;
    submittedAt?: string | null;
    cancelledAt?: string | null;
    createdAt: string;
    request?: any;
    response?: any;
    booking?: {
        id: string; bookingNumber: string; contactName: string;
        contactPhone?: string; startDate: string;
        pickup: string; dropoff: string;
        adults: number; children: number;
    } | null;
    runKey?: string | null;
    runBookingIds?: string[] | null;
    runPassengerCount?: number | null;
};

const statusColor = (s: string) => ({
    SENT: 'green', CANCELLED: 'orange', REJECTED: 'red', PENDING: 'blue'
} as Record<string, string>)[s] || 'default';

const statusLabel = (s: string) => ({
    SENT: 'Gönderildi', CANCELLED: 'İptal Edildi', REJECTED: 'Reddedildi', PENDING: 'Bekliyor'
} as Record<string, string>)[s] || s;

export default function UetdsSubmissionPage() {
    const [tab, setTab] = useState<'queue' | 'history'>('queue');
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);
    const [items, setItems] = useState<QueueItem[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [filterKind, setFilterKind] = useState<string>('ALL');
    const [detailItem, setDetailItem] = useState<QueueItem | null>(null);
    const [detailSubmission, setDetailSubmission] = useState<Submission | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
    const toggleExpandRow = (key: string) => setExpandedRowKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    // ─── Loaders ────────────────────────────────────────────────────────────
    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/uetds/queue', {
                params: {
                    startDate: dateRange[0].format('YYYY-MM-DD'),
                    endDate: dateRange[1].format('YYYY-MM-DD'),
                }
            });
            if (res.data?.success) setItems(res.data.data || []);
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Kuyruk yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    const loadHistory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/uetds/submissions', {
                params: {
                    startDate: dateRange[0].format('YYYY-MM-DD'),
                    endDate: dateRange[1].format('YYYY-MM-DD'),
                    status: filterStatus !== 'ALL' ? filterStatus : undefined,
                }
            });
            if (res.data?.success) setSubmissions(res.data.data || []);
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Kayıtlar yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, [dateRange, filterStatus]);

    useEffect(() => {
        if (tab === 'queue') loadQueue();
        else loadHistory();
    }, [tab, loadQueue, loadHistory]);

    // ─── Filtered views ─────────────────────────────────────────────────────
    const filteredItems = useMemo(() => {
        return items.filter(it => {
            if (filterKind !== 'ALL' && it.kind !== filterKind) return false;
            if (filterStatus === 'PENDING' && it.submission) return false;
            if (filterStatus === 'SENT' && it.submission?.status !== 'SENT') return false;
            if (filterStatus === 'REJECTED' && it.submission?.status !== 'REJECTED') return false;
            if (search) {
                const s = search.toLowerCase();
                const hit = (it.driver?.name || '').toLowerCase().includes(s)
                    || (it.vehicle?.plate || '').toLowerCase().includes(s)
                    || (it.routeName || '').toLowerCase().includes(s)
                    || it.bookings.some(b => (b.contactName || '').toLowerCase().includes(s)
                        || (b.bookingNumber || '').toLowerCase().includes(s));
                if (!hit) return false;
            }
            return true;
        });
    }, [items, filterKind, filterStatus, search]);

    const filteredSubmissions = useMemo(() => {
        if (!search) return submissions;
        const s = search.toLowerCase();
        return submissions.filter(sub =>
            (sub.uetdsSeferId || '').toLowerCase().includes(s)
            || (sub.booking?.bookingNumber || '').toLowerCase().includes(s)
            || (sub.booking?.contactName || '').toLowerCase().includes(s)
            || (sub.errorMessage || '').toLowerCase().includes(s)
        );
    }, [submissions, search]);

    // ─── Stats ──────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const pending = items.filter(i => !i.submission).length;
        const sent = items.filter(i => i.submission?.status === 'SENT').length;
        const rejected = items.filter(i => i.submission?.status === 'REJECTED').length;
        const totalPax = items.reduce((s, i) => s + i.passengerCount, 0);
        return { pending, sent, rejected, totalPax, total: items.length };
    }, [items]);

    // ─── Actions ────────────────────────────────────────────────────────────
    const buildPayload = (it: QueueItem) => {
        if (it.kind === 'SOLO') return { kind: 'SOLO' as const, bookingId: it.bookingId };
        return {
            kind: 'RUN' as const,
            runKey: it.runKey,
            bookingIds: it.bookings.map(b => b.id)
        };
    };

    const submitItems = async (its: QueueItem[]) => {
        if (its.length === 0) return;
        setSubmitting(true);
        try {
            const res = await apiClient.post('/api/uetds/submit', {
                items: its.map(buildPayload)
            });
            if (res.data?.success) {
                const ok = res.data.okCount || 0;
                const failed = res.data.failedCount || 0;
                if (failed === 0) message.success(`${ok} öğe başarıyla gönderildi ✓`);
                else if (ok === 0) message.error(`${failed} öğe gönderilemedi`);
                else message.warning(`${ok} başarılı, ${failed} başarısız`);
                setSelectedKeys([]);
                await loadQueue();
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Toplu gönderim başarısız');
        } finally {
            setSubmitting(false);
        }
    };

    const cancelSubmission = async (submissionId: string) => {
        try {
            const res = await apiClient.post('/api/uetds/cancel', { submissionId });
            if (res.data?.success) {
                message.success('UETDS seferi iptal edildi');
                if (tab === 'queue') loadQueue(); else loadHistory();
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'İptal başarısız');
        }
    };

    const resubmit = async (submissionId: string) => {
        try {
            const res = await apiClient.post('/api/uetds/resubmit', { submissionId });
            if (res.data?.success) {
                message.success('Yeniden gönderildi ✓');
                if (tab === 'queue') loadQueue(); else loadHistory();
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Yeniden gönderim başarısız');
        }
    };

    const deleteSubmission = async (submissionId: string) => {
        try {
            await apiClient.delete(`/api/uetds/submission/${submissionId}`);
            message.success('Kayıt silindi');
            loadHistory();
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Silinemedi');
        }
    };

    // ─── Queue table columns ────────────────────────────────────────────────
    const queueColumns = [
        {
            title: 'Tip',
            dataIndex: 'kind',
            width: 100,
            render: (k: string, it: QueueItem) => (
                <div style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => toggleExpandRow(it.key)}>
                    <Tag color={k === 'RUN' ? 'purple' : 'blue'} style={{ fontWeight: 700, margin: 0 }}>
                        {k === 'RUN' ? '🚌 Sefer' : '🚗 Özel'}
                    </Tag>
                    <DownOutlined style={{ fontSize: 9, color: '#94a3b8', transition: 'transform .2s', transform: expandedRowKeys.includes(it.key) ? 'rotate(180deg)' : 'rotate(0)' }} />
                </div>
            )
        },
        {
            title: 'Saat / Tarih',
            dataIndex: 'startDate',
            width: 130,
            render: (d: string, it: QueueItem) => (
                <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {it.departureTime || (d ? dayjs(d).format('HH:mm') : '--:--')}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                        {d ? dayjs(d).format('DD.MM.YYYY') : '-'}
                    </div>
                </div>
            )
        },
        {
            title: 'Güzergah',
            render: (_: any, it: QueueItem) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {it.routeName || `${it.pickupRegionCode || '?'} → ${it.dropoffRegionCode || '?'}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <EnvironmentOutlined />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                            {it.pickup} → {it.dropoff}
                        </span>
                    </div>
                </div>
            )
        },
        {
            title: 'Yolcu',
            dataIndex: 'passengerCount',
            width: 90,
            render: (p: number, it: QueueItem) => (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--brand-accent)' }}>{p}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{it.bookings.length} rez.</div>
                </div>
            )
        },
        {
            title: 'Şoför',
            render: (_: any, it: QueueItem) => it.driver ? (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                        <UserOutlined style={{ marginRight: 4 }} />{it.driver.name}
                    </div>
                    {it.driver.phone && <div style={{ fontSize: 11, color: '#64748b' }}>{it.driver.phone}</div>}
                </div>
            ) : <Tag color="red">Atanmamış</Tag>
        },
        {
            title: 'Araç',
            render: (_: any, it: QueueItem) => it.vehicle ? (
                <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                        <CarOutlined style={{ marginRight: 4 }} />{it.vehicle.plate}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{it.vehicle.brand} {it.vehicle.model}</div>
                </div>
            ) : <Tag color="red">Atanmamış</Tag>
        },
        {
            title: 'Durum',
            width: 130,
            render: (_: any, it: QueueItem) => {
                if (!it.submission) return <Tag color="default">Hazır — Bekliyor</Tag>;
                return (
                    <Tooltip title={it.submission.errorMessage || ''}>
                        <Tag color={statusColor(it.submission.status)} icon={
                            it.submission.status === 'SENT' ? <CheckCircleOutlined /> :
                                it.submission.status === 'REJECTED' ? <ExclamationCircleOutlined /> : undefined
                        }>
                            {statusLabel(it.submission.status)}
                        </Tag>
                        {it.submission.uetdsSeferId && (
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                #{it.submission.uetdsSeferId}
                            </div>
                        )}
                    </Tooltip>
                );
            }
        },
        {
            title: 'İşlem',
            width: 220,
            render: (_: any, it: QueueItem) => {
                const sub = it.submission;
                return (
                    <Space size={4}>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailItem(it)}>
                            Detay
                        </Button>
                        {!sub && (
                            <Button
                                size="small" type="primary" icon={<SendOutlined />}
                                loading={submitting}
                                onClick={() => submitItems([it])}
                            >
                                Gönder
                            </Button>
                        )}
                        {sub?.status === 'SENT' && (
                            <Popconfirm
                                title="Bu kaydı iptal etmek istediğinizden emin misiniz?"
                                onConfirm={() => cancelSubmission(sub.id)}
                                okText="İptal Et" cancelText="Vazgeç"
                            >
                                <Button size="small" danger icon={<CloseCircleOutlined />}>
                                    İptal
                                </Button>
                            </Popconfirm>
                        )}
                        {sub?.status === 'REJECTED' && (
                            <Button
                                size="small" type="primary" icon={<RedoOutlined />}
                                onClick={() => submitItems([it])}
                            >
                                Tekrar
                            </Button>
                        )}
                        {sub?.status === 'SENT' && (
                            <Tooltip title="İptal edip yeniden gönder">
                                <Button size="small" icon={<RedoOutlined />} onClick={() => resubmit(sub.id)}>
                                    Yenile
                                </Button>
                            </Tooltip>
                        )}
                    </Space>
                );
            }
        }
    ];

    // ─── History table columns ──────────────────────────────────────────────
    const historyColumns = [
        {
            title: 'Gönderim Zamanı',
            dataIndex: 'submittedAt',
            width: 150,
            render: (d: string, s: Submission) => (
                <div>
                    <div style={{ fontSize: 12 }}>{d ? dayjs(d).format('DD.MM.YYYY HH:mm') : dayjs(s.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                </div>
            )
        },
        {
            title: 'Tip',
            width: 90,
            render: (_: any, s: Submission) => (
                <Tag color={s.runKey ? 'purple' : 'blue'}>
                    {s.runKey ? '🚌 Sefer' : '🚗 Özel'}
                </Tag>
            )
        },
        {
            title: 'Sefer ID',
            dataIndex: 'uetdsSeferId',
            width: 140,
            render: (id: string) => id ? <Text code style={{ fontSize: 11 }}>{id}</Text> : '-'
        },
        {
            title: 'Rezervasyon',
            render: (_: any, s: Submission) => s.booking ? (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{s.booking.bookingNumber}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.booking.contactName}</div>
                </div>
            ) : '-'
        },
        {
            title: 'Yolcu',
            width: 80,
            render: (_: any, s: Submission) => (
                <Tag>{s.runPassengerCount || ((s.booking?.adults || 0) + (s.booking?.children || 0))}</Tag>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            width: 130,
            render: (st: string, s: Submission) => (
                <Tooltip title={s.errorMessage || ''}>
                    <Tag color={statusColor(st)}>{statusLabel(st)}</Tag>
                </Tooltip>
            )
        },
        {
            title: 'İşlem',
            width: 240,
            render: (_: any, s: Submission) => (
                <Space size={4}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailSubmission(s)}>
                        Detay
                    </Button>
                    {s.status === 'SENT' && (
                        <>
                            <Popconfirm title="İptal edilsin mi?" onConfirm={() => cancelSubmission(s.id)}>
                                <Button size="small" danger icon={<CloseCircleOutlined />}>İptal</Button>
                            </Popconfirm>
                            <Tooltip title="İptal edip yeniden gönder">
                                <Button size="small" icon={<RedoOutlined />} onClick={() => resubmit(s.id)}>Yenile</Button>
                            </Tooltip>
                        </>
                    )}
                    {s.status === 'REJECTED' && (
                        <Button size="small" type="primary" icon={<RedoOutlined />} onClick={() => resubmit(s.id)}>
                            Tekrar Gönder
                        </Button>
                    )}
                    {(s.status === 'CANCELLED' || s.status === 'REJECTED') && (
                        <Popconfirm title="Kaydı geçmişten silmek istediğinize emin misiniz?" onConfirm={() => deleteSubmission(s.id)}>
                            <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            )
        }
    ];

    const selectedItems = filteredItems.filter(it => selectedKeys.includes(it.key));
    const submittableSelected = selectedItems.filter(it => !it.submission || it.submission.status === 'REJECTED');

    return (
        <AdminGuard>
            <AdminLayout selectedKey="uetds-submission">
                <div style={{ padding: 20 }}>
                    {/* Header */}
                    <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)', borderRadius: 16, padding: '20px 28px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: -30, right: -30, width: 200, height: 200, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', filter: 'blur(50px)', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', bottom: -20, left: 100, width: 150, height: 150, borderRadius: '50%', background: 'rgba(99,102,241,0.08)', filter: 'blur(40px)', pointerEvents: 'none' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ThunderboltOutlined style={{ fontSize: 26, color: '#60a5fa' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>UETDS Gönderim Merkezi</div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                                    Şoför ve araç atanmış özel transferler ile <span style={{ color: '#93c5fd', fontWeight: 600 }}>Hazır</span> işaretlenmiş shuttle seferlerini U-ETDS sistemine bildirin
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{stats.total}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Toplam</div>
                                </div>
                                <div style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>{stats.pending}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Bekleyen</div>
                                </div>
                                <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80' }}>{stats.sent}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Gönderildi</div>
                                </div>
                                <div style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{stats.totalPax}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Yolcu</div>
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* Filters & Bulk Actions */}
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <RangePicker
                                value={dateRange}
                                onChange={(v) => v && setDateRange([v[0]!, v[1]!])}
                                format="DD.MM.YYYY"
                                allowClear={false}
                            />
                            <Input
                                placeholder="Plaka, şoför, müşteri, rez. no..."
                                prefix={<SearchOutlined />}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: 260 }}
                                allowClear
                            />
                            <Select
                                value={filterStatus}
                                onChange={setFilterStatus}
                                style={{ width: 140 }}
                                options={[
                                    { value: 'ALL', label: 'Tüm Durumlar' },
                                    { value: 'PENDING', label: 'Bekleyenler' },
                                    { value: 'SENT', label: 'Gönderilenler' },
                                    { value: 'REJECTED', label: 'Reddedilenler' },
                                    { value: 'CANCELLED', label: 'İptal Edilenler' },
                                ]}
                            />
                            {tab === 'queue' && (
                                <Select
                                    value={filterKind}
                                    onChange={setFilterKind}
                                    style={{ width: 130 }}
                                    options={[
                                        { value: 'ALL', label: 'Tümü' },
                                        { value: 'SOLO', label: '🚗 Özel' },
                                        { value: 'RUN', label: '🚌 Sefer' },
                                    ]}
                                />
                            )}
                            <Button icon={<ReloadOutlined />} onClick={() => tab === 'queue' ? loadQueue() : loadHistory()}>
                                Yenile
                            </Button>

                            <div style={{ flex: 1 }} />

                            {tab === 'queue' && submittableSelected.length > 0 && (
                                <Popconfirm
                                    title={`${submittableSelected.length} öğe UETDS sistemine gönderilecek. Onaylıyor musunuz?`}
                                    onConfirm={() => submitItems(submittableSelected)}
                                    okText="Gönder" cancelText="Vazgeç"
                                >
                                    <Button
                                        type="primary"
                                        size="large"
                                        icon={<SendOutlined />}
                                        loading={submitting}
                                    >
                                        Toplu Gönder ({submittableSelected.length})
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                    </Card>

                    {/* Tabs + Table */}
                    <Card bodyStyle={{ padding: 0 }}>
                        <Tabs
                            activeKey={tab}
                            onChange={(k) => { setTab(k as any); setSelectedKeys([]); }}
                            style={{ padding: '0 16px' }}
                            items={[
                                {
                                    key: 'queue',
                                    label: <span><FilterOutlined /> Gönderim Kuyruğu <Badge count={stats.pending} style={{ marginLeft: 6 }} /></span>,
                                    children: (
                                        <Table
                                            rowKey="key"
                                            columns={queueColumns as any}
                                            dataSource={filteredItems}
                                            loading={loading}
                                            pagination={{ pageSize: 25, showSizeChanger: true }}
                                            rowSelection={{
                                                selectedRowKeys: selectedKeys,
                                                onChange: setSelectedKeys,
                                                getCheckboxProps: (it: QueueItem) => ({
                                                    disabled: it.submission?.status === 'SENT' || it.submission?.status === 'CANCELLED',
                                                })
                                            }}
                                            expandable={{
                                                expandedRowKeys,
                                                onExpand: (_, it) => toggleExpandRow(it.key),
                                                expandIcon: () => null,
                                                expandedRowRender: (it: QueueItem) => (
                                                    <div style={{ padding: '10px 48px 14px', background: 'linear-gradient(135deg, #f0f9ff 0%, #eff6ff 100%)', borderTop: '1px solid #bae6fd' }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <TeamOutlined style={{ color: '#3b82f6', fontSize: 14 }} />
                                                            Müşteri Listesi — {it.bookings.length} rezervasyon, toplam {it.passengerCount} yolcu
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {it.bookings.map(b => (
                                                                <div key={b.id} style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(59,130,246,0.07)' }}>
                                                                    <div style={{ minWidth: 110 }}>
                                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>REZ. NO</div>
                                                                        <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{b.bookingNumber}</div>
                                                                    </div>
                                                                    <div style={{ minWidth: 150 }}>
                                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>MÜŞTERİ</div>
                                                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                            <UserOutlined style={{ color: '#3b82f6', fontSize: 11 }} />{b.contactName}
                                                                        </div>
                                                                    </div>
                                                                    {b.contactPhone && (
                                                                        <div style={{ minWidth: 130 }}>
                                                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>TELEFON</div>
                                                                            <div style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                                <PhoneOutlined style={{ color: '#3b82f6', fontSize: 11 }} />{b.contactPhone}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <div style={{ minWidth: 70 }}>
                                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>YOLCU</div>
                                                                        <div style={{ fontSize: 12, color: '#475569' }}>{(b.adults || 0) + (b.children || 0)} kişi</div>
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 200 }}>
                                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>GÜZERGAH</div>
                                                                        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                                                                            <EnvironmentOutlined style={{ marginRight: 3, color: '#3b82f6' }} />{b.pickup} → {b.dropoff}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            }}
                                            size="middle"
                                            locale={{ emptyText: <Empty description="Hazır öğe yok. Özel transferlere şoför+araç atayın veya shuttle seferlerinde 'Hazır' kutucuğunu işaretleyin." /> }}
                                        />
                                    )
                                },
                                {
                                    key: 'history',
                                    label: <span><CheckCircleOutlined /> Gönderim Geçmişi</span>,
                                    children: (
                                        <Table
                                            rowKey="id"
                                            columns={historyColumns as any}
                                            dataSource={filteredSubmissions}
                                            loading={loading}
                                            pagination={{ pageSize: 25, showSizeChanger: true }}
                                            size="middle"
                                            locale={{ emptyText: <Empty description="Bu tarih aralığında gönderim yok" /> }}
                                        />
                                    )
                                }
                            ]}
                        />
                    </Card>

                    {/* Item detail drawer */}
                    <Drawer
                        title={null}
                        open={!!detailItem}
                        onClose={() => setDetailItem(null)}
                        width={660}
                        styles={{ body: { padding: 0 } }}
                    >
                        {detailItem && (
                            <div>
                                {/* Drawer header */}
                                <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', filter: 'blur(30px)', pointerEvents: 'none' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                                            {detailItem.kind === 'RUN' ? '🚌' : '🚗'}
                                        </div>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{detailItem.kind === 'RUN' ? 'Shuttle Sefer Detayı' : 'Özel Transfer Detayı'}</div>
                                            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{detailItem.startDate ? dayjs(detailItem.startDate).format('DD.MM.YYYY HH:mm') : '-'} · {detailItem.passengerCount} yolcu</div>
                                        </div>
                                        {detailItem.submission && (
                                            <div style={{ marginLeft: 'auto' }}>
                                                <Tag color={statusColor(detailItem.submission.status)} style={{ fontWeight: 700, fontSize: 13 }}>{statusLabel(detailItem.submission.status)}</Tag>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ padding: '20px 24px' }}>
                                    <Space direction="vertical" size={14} style={{ width: '100%' }}>

                                        {/* Güzergah & Araç Bilgileri */}
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: 10 }}>GÜZERGAH & ARAÇ BİLGİLERİ</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                                                <div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Güzergah</div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}><EnvironmentOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailItem.pickupRegionCode || '?'} → {detailItem.dropoffRegionCode || '?'}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{detailItem.pickup}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Tarih / Saat</div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}><ClockCircleOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailItem.startDate ? dayjs(detailItem.startDate).format('DD.MM.YYYY HH:mm') : '-'}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Şoför</div>
                                                    {detailItem.driver ? (
                                                        <div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}><UserOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailItem.driver.name}</div>
                                                            {detailItem.driver.phone && <div style={{ fontSize: 11, color: '#64748b' }}><PhoneOutlined style={{ marginRight: 3 }} />{detailItem.driver.phone}</div>}
                                                            {detailItem.driver.tcNo && <div style={{ fontSize: 11, color: '#64748b' }}><IdcardOutlined style={{ marginRight: 3 }} />{detailItem.driver.tcNo}</div>}
                                                        </div>
                                                    ) : <Tag color="red" style={{ marginTop: 2 }}>Atanmamış</Tag>}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Araç</div>
                                                    {detailItem.vehicle ? (
                                                        <div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}><CarOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailItem.vehicle.plate}</div>
                                                            <div style={{ fontSize: 11, color: '#64748b' }}>{detailItem.vehicle.brand} {detailItem.vehicle.model}</div>
                                                        </div>
                                                    ) : <Tag color="red" style={{ marginTop: 2 }}>Atanmamış</Tag>}
                                                </div>
                                            </div>
                                        </div>

                                        {/* UETDS Bilgileri */}
                                        {detailItem.submission && (
                                            <div style={{ background: detailItem.submission.status === 'SENT' ? '#f0fdf4' : detailItem.submission.status === 'REJECTED' ? '#fef2f2' : '#f8fafc', border: `1px solid ${detailItem.submission.status === 'SENT' ? '#bbf7d0' : detailItem.submission.status === 'REJECTED' ? '#fecaca' : '#e2e8f0'}`, borderRadius: 12, padding: '14px 16px' }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: 10 }}>UETDS BİLGİLERİ</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                                                    <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Sefer ID</div><div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{detailItem.submission.uetdsSeferId || '-'}</div></div>
                                                    <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Durum</div><Tag color={statusColor(detailItem.submission.status)} style={{ marginTop: 2 }}>{statusLabel(detailItem.submission.status)}</Tag></div>
                                                    {detailItem.submission.submittedAt && <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Gönderim Zamanı</div><div style={{ fontSize: 12 }}>{dayjs(detailItem.submission.submittedAt).format('DD.MM.YYYY HH:mm:ss')}</div></div>}
                                                </div>
                                                {detailItem.submission.errorMessage && (
                                                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', marginBottom: 3 }}>HATA MESAJI</div>
                                                        <Text style={{ fontSize: 12, color: '#7f1d1d' }}>{detailItem.submission.errorMessage}</Text>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Müşteri Listesi */}
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <TeamOutlined style={{ color: '#3b82f6' }} />
                                                MÜŞTERİ LİSTESİ — {detailItem.bookings.length} rezervasyon
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {detailItem.bookings.map(b => (
                                                    <div key={b.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', display: 'grid', gridTemplateColumns: '110px 1fr 1fr auto', gap: '0 16px', alignItems: 'center' }}>
                                                        <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>REZ. NO</div><div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{b.bookingNumber}</div></div>
                                                        <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>MÜŞTERİ</div><div style={{ fontSize: 12, fontWeight: 600 }}><UserOutlined style={{ color: '#3b82f6', marginRight: 3 }} />{b.contactName}</div></div>
                                                        <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>TELEFON</div><div style={{ fontSize: 12, color: '#475569' }}>{b.contactPhone || '-'}</div></div>
                                                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>YOLCU</div><div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>{(b.adults || 0) + (b.children || 0)}</div></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                    </Space>
                                </div>
                            </div>
                        )}
                    </Drawer>

                    {/* Submission detail drawer */}
                    <Drawer
                        title={null}
                        open={!!detailSubmission}
                        onClose={() => setDetailSubmission(null)}
                        width={660}
                        styles={{ body: { padding: 0 } }}
                    >
                        {detailSubmission && (
                            <div>
                                {/* Drawer header */}
                                <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', filter: 'blur(30px)', pointerEvents: 'none' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                                            {detailSubmission.runKey ? '🚌' : '🚗'}
                                        </div>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Gönderim Detayı</div>
                                            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                                                {detailSubmission.runKey ? 'Shuttle Sefer' : 'Özel Transfer'} · {detailSubmission.submittedAt ? dayjs(detailSubmission.submittedAt).format('DD.MM.YYYY HH:mm') : dayjs(detailSubmission.createdAt).format('DD.MM.YYYY HH:mm')}
                                            </div>
                                        </div>
                                        <div style={{ marginLeft: 'auto' }}>
                                            <Tag color={statusColor(detailSubmission.status)} style={{ fontWeight: 700, fontSize: 13 }}>{statusLabel(detailSubmission.status)}</Tag>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: '20px 24px' }}>
                                    <Space direction="vertical" size={14} style={{ width: '100%' }}>

                                        {/* UETDS ID Bilgileri */}
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: 10 }}>UETDS BİLGİLERİ</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                                                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>UETDS Sefer ID</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#1e293b' }}>{detailSubmission.uetdsSeferId || '-'}</div></div>
                                                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Referans No</div><div style={{ fontSize: 12, fontFamily: 'monospace', color: '#1e293b' }}>{detailSubmission.uetdsRefNo || '-'}</div></div>
                                                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Gönderim Zamanı</div><div style={{ fontSize: 12, color: '#1e293b' }}>{detailSubmission.submittedAt ? dayjs(detailSubmission.submittedAt).format('DD.MM.YYYY HH:mm:ss') : '-'}</div></div>
                                                {detailSubmission.cancelledAt && <div><div style={{ fontSize: 11, color: '#94a3b8' }}>İptal Zamanı</div><div style={{ fontSize: 12, color: '#ef4444' }}>{dayjs(detailSubmission.cancelledAt).format('DD.MM.YYYY HH:mm:ss')}</div></div>}
                                            </div>
                                            {detailSubmission.errorMessage && (
                                                <div style={{ marginTop: 10, padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', marginBottom: 3 }}>HATA MESAJI</div>
                                                    <Text style={{ fontSize: 12, color: '#7f1d1d' }}>{detailSubmission.errorMessage}</Text>
                                                </div>
                                            )}
                                        </div>

                                        {/* Müşteri / Rezervasyon Bilgileri */}
                                        {detailSubmission.booking && (
                                            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '14px 16px' }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', letterSpacing: '0.05em', marginBottom: 10 }}>MÜŞTERİ & REZERVASYON BİLGİLERİ</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                                                    <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Rezervasyon No</div><div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{detailSubmission.booking.bookingNumber}</div></div>
                                                    <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Müşteri Adı</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}><UserOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailSubmission.booking.contactName}</div></div>
                                                    {detailSubmission.booking.contactPhone && <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Telefon</div><div style={{ fontSize: 12, color: '#475569' }}><PhoneOutlined style={{ marginRight: 3, color: '#3b82f6' }} />{detailSubmission.booking.contactPhone}</div></div>}
                                                    <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Yolcu Sayısı</div><div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>{(detailSubmission.booking.adults || 0) + (detailSubmission.booking.children || 0)} kişi</div></div>
                                                    <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Güzergah</div><div style={{ fontSize: 12, color: '#1e293b' }}><EnvironmentOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailSubmission.booking.pickup} <ArrowRightOutlined style={{ fontSize: 10, color: '#94a3b8', margin: '0 4px' }} /> {detailSubmission.booking.dropoff}</div></div>
                                                    <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Transfer Tarihi</div><div style={{ fontSize: 12, color: '#1e293b' }}><ClockCircleOutlined style={{ color: '#3b82f6', marginRight: 4 }} />{detailSubmission.booking.startDate ? dayjs(detailSubmission.booking.startDate).format('DD.MM.YYYY HH:mm') : '-'}</div></div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Shuttle yolcu sayısı (runKey varsa) */}
                                        {detailSubmission.runKey && detailSubmission.runPassengerCount && (
                                            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <TeamOutlined style={{ fontSize: 20, color: '#7c3aed' }} />
                                                <div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>SHUTTLE SEFER</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Toplam {detailSubmission.runPassengerCount} yolcu · {detailSubmission.runBookingIds?.length || 0} rezervasyon</div>
                                                    <div style={{ fontSize: 11, color: '#7c3aed', fontFamily: 'monospace', marginTop: 2 }}>Run: {detailSubmission.runKey}</div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Servis Yanıtı */}
                                        {detailSubmission.response && (
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <InfoCircleOutlined />
                                                    SERVİS YANITI
                                                </div>
                                                <pre style={{ fontSize: 11, maxHeight: 220, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: 10, lineHeight: 1.6, margin: 0 }}>
                                                    {typeof detailSubmission.response === 'string'
                                                        ? detailSubmission.response
                                                        : JSON.stringify(detailSubmission.response, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                    </Space>
                                </div>
                            </div>
                        )}
                    </Drawer>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
