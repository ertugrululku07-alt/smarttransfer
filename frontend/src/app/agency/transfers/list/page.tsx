'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Table, Typography, Button, Input, Select, DatePicker,
    Tag, Space, Modal, Form, message, Tooltip, Row, Col, Alert, Statistic
} from 'antd';
import {
    SearchOutlined, EditOutlined, StopOutlined, EyeOutlined,
    CarOutlined, ReloadOutlined, ClockCircleOutlined, CheckCircleOutlined,
    CloseCircleOutlined, CalendarOutlined, TeamOutlined, EnvironmentOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import AgencyGuard from '../../AgencyGuard';
import AgencyLayout from '../../AgencyLayout';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    CONFIRMED: { label: 'Onaylandı', color: '#16a34a', bg: '#f0fdf4' },
    PENDING: { label: 'Bekliyor', color: '#d97706', bg: '#fffbeb' },
    CANCELLED: { label: 'İptal', color: '#dc2626', bg: '#fef2f2' },
    PENDING_PAYMENT: { label: 'Ödeme Bekliyor', color: '#2563eb', bg: '#eff6ff' },
    COMPLETED: { label: 'Tamamlandı', color: '#6b7280', bg: '#f9fafb' },
};

interface Booking {
    id: string;
    bookingNumber: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    startDate: string;
    createdAt: string;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
    adults: number;
    subtotal: number;
    metadata?: any;
}

export default function AgencyTransferListPage() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editBooking, setEditBooking] = useState<Booking | null>(null);
    const [editForm] = Form.useForm();
    const [editLoading, setEditLoading] = useState(false);

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

    const fetchBookings = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (search.trim()) params.search = search.trim();
            if (statusFilter) params.status = statusFilter;
            if (dateRange) {
                params.startDate = dateRange[0].startOf('day').toISOString();
                params.endDate = dateRange[1].endOf('day').toISOString();
            }
            const res = await apiClient.get('/api/agency/bookings', { params });
            if (res.data.success) setBookings(res.data.data);
        } catch {
            message.error('Transferler yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, dateRange]);

    useEffect(() => { fetchBookings(); }, [fetchBookings]);

    const hoursUntil = (b: Booking) =>
        (new Date(b.startDate).getTime() - Date.now()) / (1000 * 60 * 60);

    const canEdit = (b: Booking) =>
        hoursUntil(b) > 6 && b.status !== 'CANCELLED' && b.status !== 'COMPLETED';

    const canCancel = (b: Booking) =>
        b.status !== 'CANCELLED' && b.status !== 'COMPLETED';

    const handleEdit = (b: Booking) => {
        setEditBooking(b);
        editForm.setFieldsValue({
            contactName: b.contactName,
            contactPhone: b.contactPhone,
            contactEmail: b.contactEmail,
            flightNumber: b.metadata?.flightNumber || '',
            agencyNotes: b.metadata?.agencyNotes || '',
            pickup: b.metadata?.pickup || '',
            dropoff: b.metadata?.dropoff || '',
        });
        setEditModalOpen(true);
    };

    const handleEditSave = async () => {
        try {
            const values = await editForm.validateFields();
            setEditLoading(true);
            const res = await apiClient.put(`/api/agency/bookings/${editBooking?.id}`, values);
            if (res.data.success) {
                message.success('Transfer güncellendi');
                setEditModalOpen(false);
                fetchBookings();
            }
        } catch (err: any) {
            message.error(err.response?.data?.error || 'Güncelleme başarısız');
        } finally {
            setEditLoading(false);
        }
    };

    const handleCancel = (b: Booking) => {
        const hrs = hoursUntil(b);
        const warningMsg = hrs <= 6
            ? 'Transfer saatine 6 saatten az kaldığı için iade yapılmayacaktır.'
            : hrs > 6 && b.paymentStatus === 'PAID'
                ? 'Cari bakiyenize B2B maliyeti iade edilecektir.'
                : '';

        Modal.confirm({
            title: 'Rezervasyonu İptal Et',
            content: (
                <div>
                    <p><strong>{b.bookingNumber}</strong> numaralı rezervasyonu iptal etmek istediğinize emin misiniz?</p>
                    {warningMsg && <Alert type={hrs <= 6 ? 'warning' : 'info'} message={warningMsg} showIcon style={{ marginTop: 12 }} />}
                </div>
            ),
            okText: 'Evet, İptal Et',
            okButtonProps: { danger: true },
            cancelText: 'Vazgeç',
            onOk: async () => {
                try {
                    const res = await apiClient.put(`/api/agency/bookings/${b.id}/cancel`);
                    message.success(res.data.message || 'Rezervasyon iptal edildi');
                    fetchBookings();
                } catch (err: any) {
                    message.error(err.response?.data?.error || 'İptal başarısız');
                }
            }
        });
    };

    // --- Stats ---
    const total = bookings.length;
    const confirmed = bookings.filter(b => b.status === 'CONFIRMED').length;
    const cancelled = bookings.filter(b => b.status === 'CANCELLED').length;
    const upcoming = bookings.filter(b => hoursUntil(b) > 0 && b.status !== 'CANCELLED').length;

    // --- Columns ---
    const columns: any[] = [
        {
            title: 'Transfer',
            key: 'transfer',
            width: 200,
            render: (_: any, r: Booking) => {
                const hrs = hoursUntil(r);
                const isUrgent = hrs > 0 && hrs <= 6 && r.status !== 'CANCELLED';
                return (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Text strong style={{ fontFamily: 'monospace', fontSize: 13, color: '#1d4ed8' }}>
                                {r.bookingNumber}
                            </Text>
                            {isUrgent && (
                                <Tooltip title="Transfere 6 saatten az kaldı">
                                    <ClockCircleOutlined style={{ color: '#f59e0b', fontSize: 13 }} />
                                </Tooltip>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <CalendarOutlined style={{ color: '#9ca3af', fontSize: 11 }} />
                            <Text style={{ fontSize: 12 }}>{dayjs(r.startDate).format('DD.MM.YYYY')}</Text>
                            <Text strong style={{ fontSize: 13, color: '#374151', marginLeft: 4 }}>
                                {dayjs(r.startDate).format('HH:mm')}
                            </Text>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Yolcu',
            key: 'passenger',
            width: 170,
            ellipsis: true,
            render: (_: any, r: Booking) => (
                <div>
                    <Text strong style={{ fontSize: 13, display: 'block' }} ellipsis={{ tooltip: r.contactName }}>
                        {r.contactName}
                    </Text>
                    <Text type="secondary" copyable={{ tooltips: false }}
                        style={{ fontSize: 11, display: 'block', maxWidth: 155 }}
                        ellipsis={{ tooltip: r.contactPhone }}>
                        📞 {r.contactPhone}
                    </Text>
                    <Text type="secondary"
                        style={{ fontSize: 11, display: 'block', maxWidth: 155 }}
                        ellipsis={{ tooltip: r.contactEmail }}>
                        ✉ {r.contactEmail}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Güzergah',
            key: 'route',
            render: (_: any, r: Booking) => {
                const pickup = r.metadata?.pickup || null;
                const dropoff = r.metadata?.dropoff || null;
                if (!pickup && !dropoff) return <Text type="secondary">—</Text>;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, display: 'inline-block' }} />
                            <Text style={{ fontSize: 12, maxWidth: 220 }} ellipsis={{ tooltip: pickup }}>
                                {pickup || '—'}
                            </Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0, display: 'inline-block' }} />
                            <Text style={{ fontSize: 12, maxWidth: 220 }} ellipsis={{ tooltip: dropoff }}>
                                {dropoff || '—'}
                            </Text>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Araç / Tutar',
            key: 'vehicle',
            width: 150,
            render: (_: any, r: Booking) => (
                <div>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#eff6ff', color: '#2563eb',
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginBottom: 4
                    }}>
                        <CarOutlined style={{ fontSize: 10 }} />
                        {r.metadata?.vehicleType || 'Transfer'}
                    </div>
                    <Text strong style={{ display: 'block', fontSize: 14, color: '#111827' }}>
                        {Number(r.total).toLocaleString('tr-TR', { style: 'currency', currency: r.currency || 'TRY' })}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Durum',
            key: 'status',
            width: 130,
            render: (_: any, r: Booking) => {
                const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: '#6b7280', bg: '#f9fafb' };
                return (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: cfg.bg,
                        color: cfg.color,
                        borderRadius: 20,
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                        {cfg.label}
                    </div>
                );
            },
        },
        {
            title: 'İşlem',
            key: 'action',
            width: 100,
            fixed: 'right' as const,
            render: (_: any, r: Booking) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    <Tooltip title="Detaylar">
                        <Button
                            type="default"
                            size="small"
                            icon={<EyeOutlined />}
                            style={{ borderRadius: 6 }}
                            onClick={() => { setDetailBooking(r); setDetailModalOpen(true); }}
                        />
                    </Tooltip>
                    <Tooltip title={canEdit(r) ? 'Düzenle' :
                        r.status === 'CANCELLED' ? 'İptal edildi' :
                            r.status === 'COMPLETED' ? 'Tamamlandı' :
                                'Son 6 saat, düzenleme yapılamaz'}>
                        <Button
                            type="default"
                            size="small"
                            icon={<EditOutlined />}
                            disabled={!canEdit(r)}
                            style={{ borderRadius: 6, color: canEdit(r) ? '#2563eb' : undefined }}
                            onClick={() => canEdit(r) && handleEdit(r)}
                        />
                    </Tooltip>
                    {canCancel(r) && (
                        <Tooltip title="İptal Et">
                            <Button
                                type="default"
                                size="small"
                                danger
                                icon={<StopOutlined />}
                                style={{ borderRadius: 6 }}
                                onClick={() => handleCancel(r)}
                            />
                        </Tooltip>
                    )}
                </div>
            ),
        },
    ];

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="transfer-list">
                {/* Header */}
                <div style={{ marginBottom: 20 }}>
                    <Title level={3} style={{ margin: 0, fontWeight: 700 }}>Transfer Listesi</Title>
                    <Text type="secondary">Acentenize ait rezervasyonları görüntüleyin, filtreleyin ve yönetin.</Text>
                </div>

                {/* Stats Row */}
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    {[
                        { title: 'Toplam', value: total, icon: <TeamOutlined />, color: '#6366f1' },
                        { title: 'Onaylı', value: confirmed, icon: <CheckCircleOutlined />, color: '#16a34a' },
                        { title: 'İptal', value: cancelled, icon: <CloseCircleOutlined />, color: '#dc2626' },
                        { title: 'Yaklaşan', value: upcoming, icon: <ClockCircleOutlined />, color: '#f59e0b' },
                    ].map(s => (
                        <Col key={s.title} xs={12} sm={6}>
                            <Card
                                size="small"
                                style={{ borderRadius: 10, borderLeft: `3px solid ${s.color}`, background: '#fff' }}
                                bodyStyle={{ padding: '10px 14px' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {s.title}
                                        </div>
                                        <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                                    </div>
                                    <div style={{ fontSize: 20, color: s.color, opacity: 0.3 }}>{s.icon}</div>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>

                {/* Filters */}
                <Card
                    style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #f0f0f0' }}
                    bodyStyle={{ padding: '12px 16px' }}
                >
                    <Row gutter={[10, 10]} align="middle">
                        <Col xs={24} sm={9}>
                            <Input
                                prefix={<SearchOutlined style={{ color: '#d1d5db' }} />}
                                placeholder="Ad, e-posta, telefon veya PNR..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                allowClear
                                style={{ borderRadius: 8 }}
                            />
                        </Col>
                        <Col xs={24} sm={7}>
                            <RangePicker
                                style={{ width: '100%', borderRadius: 8 }}
                                placeholder={['Başlangıç', 'Bitiş']}
                                onChange={(vals) => setDateRange(vals as any)}
                                format="DD.MM.YYYY"
                            />
                        </Col>
                        <Col xs={16} sm={5}>
                            <Select
                                style={{ width: '100%', borderRadius: 8 }}
                                placeholder="Durum"
                                allowClear
                                value={statusFilter}
                                onChange={v => setStatusFilter(v)}
                                options={Object.entries(STATUS_CONFIG).map(([v, c]) => ({
                                    value: v, label: c.label
                                }))}
                            />
                        </Col>
                        <Col xs={8} sm={3}>
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchBookings}
                                block
                                style={{ borderRadius: 8 }}
                            >
                                Yenile
                            </Button>
                        </Col>
                    </Row>
                </Card>

                {/* Table */}
                <Card
                    style={{ borderRadius: 10, border: '1px solid #f0f0f0' }}
                    bodyStyle={{ padding: 0 }}
                >
                    <Table
                        columns={columns}
                        dataSource={bookings}
                        rowKey="id"
                        loading={loading}
                        size="middle"
                        tableLayout="fixed"
                        pagination={{
                            pageSize: 20,
                            showSizeChanger: true,
                            showTotal: (t) => `Toplam ${t} transfer`,
                            style: { padding: '12px 16px', margin: 0 }
                        }}
                        scroll={{ x: 820 }}
                        rowClassName={(r) => r.status === 'CANCELLED' ? 'cancelled-row' : ''}
                        style={{ borderRadius: 10, overflow: 'hidden' }}
                        onRow={(r) => ({
                            style: {
                                opacity: r.status === 'CANCELLED' ? 0.55 : 1,
                                background: r.status === 'CANCELLED' ? '#fafafa' : undefined,
                                cursor: 'default',
                            }
                        })}
                    />
                </Card>

                {/* Edit Modal */}
                <Modal
                    title={
                        <div>
                            <EditOutlined style={{ marginRight: 8, color: '#2563eb' }} />
                            Rezervasyon Düzenle
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                {editBooking?.bookingNumber}
                            </Text>
                        </div>
                    }
                    open={editModalOpen}
                    onCancel={() => setEditModalOpen(false)}
                    onOk={handleEditSave}
                    okText="Kaydet"
                    cancelText="Vazgeç"
                    confirmLoading={editLoading}
                    width={520}
                >
                    <Alert
                        type="info"
                        showIcon
                        message="Transfere 6 saatten fazla kaldığı için düzenleme yapılabilir."
                        style={{ marginBottom: 16 }}
                    />
                    <Form form={editForm} layout="vertical">
                        {/* Route Section */}
                        <div style={{
                            background: '#f8fafc', borderRadius: 8, padding: '12px 14px',
                            marginBottom: 16, border: '1px solid #e2e8f0'
                        }}>
                            <Text strong style={{ fontSize: 12, color: '#6366f1', display: 'block', marginBottom: 10 }}>
                                <EnvironmentOutlined style={{ marginRight: 6 }} />
                                Güzergah
                            </Text>
                            <Form.Item name="pickup" label="Alış Noktası" style={{ marginBottom: 10 }}>
                                <Input
                                    prefix={<span style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: '#22c55e', display: 'inline-block', marginRight: 4
                                    }} />}
                                    placeholder="Kalınılan yer, otel, adres..."
                                />
                            </Form.Item>
                            <Form.Item name="dropoff" label="Bırakış Noktası" style={{ marginBottom: 0 }}>
                                <Input
                                    prefix={<span style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: '#ef4444', display: 'inline-block', marginRight: 4
                                    }} />}
                                    placeholder="Havalimanı, otel, adres..."
                                />
                            </Form.Item>
                        </div>

                        {/* Contact Section */}
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="contactName" label="Ad Soyad" rules={[{ required: true }]}>
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="contactPhone" label="Telefon">
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="contactEmail" label="E-Posta">
                            <Input />
                        </Form.Item>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="flightNumber" label="Uçuş Numarası">
                                    <Input placeholder="TK1234" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="agencyNotes" label="Notlar">
                            <Input.TextArea rows={2} />
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Detail Modal */}
                <Modal
                    title={
                        <div>
                            <EyeOutlined style={{ marginRight: 8, color: '#6366f1' }} />
                            Transfer Detayı
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                {detailBooking?.bookingNumber}
                            </Text>
                        </div>
                    }
                    open={detailModalOpen}
                    onCancel={() => setDetailModalOpen(false)}
                    footer={[
                        <Button key="close" onClick={() => setDetailModalOpen(false)}>Kapat</Button>,
                        detailBooking && canEdit(detailBooking) && (
                            <Button key="edit" type="primary" icon={<EditOutlined />}
                                onClick={() => { setDetailModalOpen(false); handleEdit(detailBooking!); }}>
                                Düzenle
                            </Button>
                        ),
                        detailBooking && canCancel(detailBooking) && (
                            <Button key="cancel" danger icon={<StopOutlined />}
                                onClick={() => { setDetailModalOpen(false); handleCancel(detailBooking!); }}>
                                İptal Et
                            </Button>
                        ),
                    ].filter(Boolean)}
                    width={580}
                >
                    {detailBooking && (() => {
                        const cfg = STATUS_CONFIG[detailBooking.status] || { label: detailBooking.status, color: '#6b7280', bg: '#f9fafb' };
                        return (
                            <div>
                                {/* Status Banner */}
                                <div style={{
                                    background: cfg.bg, border: `1px solid ${cfg.color}33`,
                                    borderRadius: 8, padding: '10px 16px', marginBottom: 16,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <Text strong style={{ color: cfg.color }}>{cfg.label}</Text>
                                    <Text style={{ fontSize: 13 }}>{dayjs(detailBooking.startDate).format('DD MMM YYYY, HH:mm')}</Text>
                                </div>

                                <Row gutter={[16, 14]}>
                                    <Col span={24}>
                                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>GÜZERGAH</Text>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                                                <Text>{detailBooking.metadata?.pickup || '—'}</Text>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                                <Text>{detailBooking.metadata?.dropoff || '—'}</Text>
                                            </div>
                                        </div>
                                    </Col>
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>AD SOYAD</Text>
                                        <div><Text strong>{detailBooking.contactName}</Text></div>
                                    </Col>
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>TELEFON</Text>
                                        <div><Text>{detailBooking.contactPhone}</Text></div>
                                    </Col>
                                    <Col span={24}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>E-POSTA</Text>
                                        <div><Text>{detailBooking.contactEmail}</Text></div>
                                    </Col>
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>ARAÇ</Text>
                                        <div><Text>{detailBooking.metadata?.vehicleType || '—'}</Text></div>
                                    </Col>
                                    {detailBooking.metadata?.flightNumber && (
                                        <Col span={12}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>UÇUŞ NO</Text>
                                            <div><Text>{detailBooking.metadata.flightNumber}</Text></div>
                                        </Col>
                                    )}
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>TUTAR</Text>
                                        <div>
                                            <Text strong style={{ fontSize: 18, color: '#111827' }}>
                                                {Number(detailBooking.total).toLocaleString('tr-TR', { style: 'currency', currency: detailBooking.currency || 'TRY' })}
                                            </Text>
                                        </div>
                                    </Col>
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 11 }}>ÖDEME</Text>
                                        <div>
                                            <Tag style={{ marginTop: 2 }}>{detailBooking.paymentStatus}</Tag>
                                        </div>
                                    </Col>
                                    {detailBooking.metadata?.agencyNotes && (
                                        <Col span={24}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>NOTLAR</Text>
                                            <div style={{ background: '#fefce8', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                                                <Text style={{ fontSize: 13 }}>{detailBooking.metadata.agencyNotes}</Text>
                                            </div>
                                        </Col>
                                    )}
                                </Row>

                                {hoursUntil(detailBooking) > 0 && hoursUntil(detailBooking) <= 6 && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="Transfere 6 saatten az kaldığı için yalnızca iptal işlemi yapılabilir."
                                        style={{ marginTop: 16 }}
                                    />
                                )}
                            </div>
                        );
                    })()}
                </Modal>
            </AgencyLayout>
        </AgencyGuard>
    );
}
