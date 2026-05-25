'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Card, Button, Table, Tag, Space, DatePicker, Tooltip, Modal, message, Tabs, Badge,
    Typography, Statistic, Row, Col, Empty, Drawer, Descriptions, Input, Select, Popconfirm
} from 'antd';
import {
    SendOutlined, CloseCircleOutlined, ReloadOutlined, EyeOutlined, RedoOutlined,
    FilterOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined,
    DeleteOutlined, ThunderboltOutlined, CarOutlined, UserOutlined, EnvironmentOutlined
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
            width: 90,
            render: (k: string) => (
                <Tag color={k === 'RUN' ? 'purple' : 'blue'} style={{ fontWeight: 700 }}>
                    {k === 'RUN' ? '🚌 Sefer' : '🚗 Özel'}
                </Tag>
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
                    <Card
                        bordered={false}
                        style={{
                            background: 'linear-gradient(135deg, var(--brand-accent) 0%, var(--brand-accent) 100%)',
                            color: '#fff', marginBottom: 16
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <ThunderboltOutlined style={{ fontSize: 32 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>UETDS Gönderim Merkezi</div>
                                <div style={{ fontSize: 13, opacity: 0.9 }}>
                                    Şoför ve araç atanmış (özel) transferler ile <b>Hazır</b> işaretlenmiş shuttle seferlerini U-ETDS sistemine bildirin
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Stats */}
                    <Row gutter={12} style={{ marginBottom: 16 }}>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic title="Toplam Öğe" value={stats.total} valueStyle={{ color: '#1e293b' }} />
                            </Card>
                        </Col>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic title="Bekleyen" value={stats.pending} valueStyle={{ color: '#f59e0b' }} prefix={<ExclamationCircleOutlined />} />
                            </Card>
                        </Col>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic title="Gönderilen" value={stats.sent} valueStyle={{ color: '#16a34a' }} prefix={<CheckCircleOutlined />} />
                            </Card>
                        </Col>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic title="Toplam Yolcu" value={stats.totalPax} valueStyle={{ color: 'var(--brand-primary)' }} />
                            </Card>
                        </Col>
                    </Row>

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
                        title={detailItem ? `${detailItem.kind === 'RUN' ? '🚌 Sefer' : '🚗 Özel Transfer'} Detayı` : 'Detay'}
                        open={!!detailItem}
                        onClose={() => setDetailItem(null)}
                        width={620}
                    >
                        {detailItem && (
                            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                <Descriptions bordered size="small" column={1}>
                                    <Descriptions.Item label="Tip">{detailItem.kind === 'RUN' ? 'Shuttle Sefer' : 'Özel Transfer'}</Descriptions.Item>
                                    <Descriptions.Item label="Tarih / Saat">
                                        {detailItem.startDate ? dayjs(detailItem.startDate).format('DD.MM.YYYY HH:mm') : '-'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Güzergah">{detailItem.pickup} → {detailItem.dropoff}</Descriptions.Item>
                                    <Descriptions.Item label="Şoför">{detailItem.driver?.name || '-'} {detailItem.driver?.phone}</Descriptions.Item>
                                    <Descriptions.Item label="Araç">{detailItem.vehicle?.plate} {detailItem.vehicle?.brand} {detailItem.vehicle?.model}</Descriptions.Item>
                                    <Descriptions.Item label="Toplam Yolcu">{detailItem.passengerCount}</Descriptions.Item>
                                    {detailItem.submission && (
                                        <>
                                            <Descriptions.Item label="UETDS Durumu">
                                                <Tag color={statusColor(detailItem.submission.status)}>{statusLabel(detailItem.submission.status)}</Tag>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="Sefer ID">{detailItem.submission.uetdsSeferId || '-'}</Descriptions.Item>
                                            {detailItem.submission.errorMessage && (
                                                <Descriptions.Item label="Hata">
                                                    <Text type="danger">{detailItem.submission.errorMessage}</Text>
                                                </Descriptions.Item>
                                            )}
                                        </>
                                    )}
                                </Descriptions>

                                <div>
                                    <h4 style={{ marginBottom: 8 }}>Rezervasyonlar ({detailItem.bookings.length})</h4>
                                    <Table
                                        size="small" pagination={false}
                                        rowKey="id"
                                        dataSource={detailItem.bookings}
                                        columns={[
                                            { title: 'Rez. No', dataIndex: 'bookingNumber', width: 110 },
                                            { title: 'Müşteri', dataIndex: 'contactName' },
                                            { title: 'Telefon', dataIndex: 'contactPhone', width: 120 },
                                            { title: 'PAX', width: 60, render: (_: any, b: BookingMini) => (b.adults || 0) + (b.children || 0) },
                                        ]}
                                    />
                                </div>
                            </Space>
                        )}
                    </Drawer>

                    {/* Submission detail drawer */}
                    <Drawer
                        title="Gönderim Detayı"
                        open={!!detailSubmission}
                        onClose={() => setDetailSubmission(null)}
                        width={620}
                    >
                        {detailSubmission && (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                <Descriptions bordered size="small" column={1}>
                                    <Descriptions.Item label="UETDS Sefer ID">{detailSubmission.uetdsSeferId || '-'}</Descriptions.Item>
                                    <Descriptions.Item label="Referans No">{detailSubmission.uetdsRefNo || '-'}</Descriptions.Item>
                                    <Descriptions.Item label="Durum"><Tag color={statusColor(detailSubmission.status)}>{statusLabel(detailSubmission.status)}</Tag></Descriptions.Item>
                                    <Descriptions.Item label="Gönderim Zamanı">{detailSubmission.submittedAt ? dayjs(detailSubmission.submittedAt).format('DD.MM.YYYY HH:mm:ss') : '-'}</Descriptions.Item>
                                    {detailSubmission.cancelledAt && (
                                        <Descriptions.Item label="İptal Zamanı">{dayjs(detailSubmission.cancelledAt).format('DD.MM.YYYY HH:mm:ss')}</Descriptions.Item>
                                    )}
                                    {detailSubmission.booking && (
                                        <Descriptions.Item label="Rezervasyon">
                                            {detailSubmission.booking.bookingNumber} — {detailSubmission.booking.contactName}
                                        </Descriptions.Item>
                                    )}
                                    {detailSubmission.errorMessage && (
                                        <Descriptions.Item label="Hata Mesajı"><Text type="danger">{detailSubmission.errorMessage}</Text></Descriptions.Item>
                                    )}
                                </Descriptions>

                                {detailSubmission.response && (
                                    <Card size="small" title="Servis Yanıtı">
                                        <pre style={{ fontSize: 11, maxHeight: 240, overflow: 'auto', background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                                            {typeof detailSubmission.response === 'string'
                                                ? detailSubmission.response
                                                : JSON.stringify(detailSubmission.response, null, 2)}
                                        </pre>
                                    </Card>
                                )}
                            </Space>
                        )}
                    </Drawer>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
