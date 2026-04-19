'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Table, Card, Tag, Button, Space, Spin, Alert, Tooltip,
    Typography, Row, Col, DatePicker, Select, message, Modal, Popconfirm
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CheckOutlined,
    DollarOutlined,
    UserOutlined,
    CalendarOutlined,
    ReloadOutlined,
    SwapOutlined,
    FileTextOutlined,
    ExclamationCircleOutlined,
    WalletOutlined,
    CarOutlined
} from '@ant-design/icons';
import { useAuth } from '@/app/context/AuthContext';
import { useSocket } from '@/app/context/SocketContext';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface Collection {
    id: string;
    amount: number;
    currency: string;
    customerName?: string;
    bookingNumber?: string;
    paymentMethod: string;
    status: 'PENDING' | 'HANDED_OVER' | 'CONFIRMED';
    createdAt: string;
    handedOverAt?: string;
    handoverNotes?: string;
    driver: { fullName: string; id: string };
    handedOverToUser?: { fullName: string; id: string };
    booking?: { bookingNumber: string; contactName: string };
}

interface Summary {
    PENDING?: { count: number; amounts: Record<string, number> };
    HANDED_OVER?: { count: number; amounts: Record<string, number> };
    CONFIRMED?: { count: number; amounts: Record<string, number> };
}

const STATUS_CONFIG: Record<string, { color: string; tagColor: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
    PENDING: {
        color: '#D97706', tagColor: 'warning', bg: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
        border: '#FCD34D', icon: <ClockCircleOutlined />, label: 'Şoförde Bekliyor'
    },
    HANDED_OVER: {
        color: '#2563EB', tagColor: 'processing', bg: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
        border: '#93C5FD', icon: <SwapOutlined />, label: 'Onay Bekliyor'
    },
    CONFIRMED: {
        color: '#059669', tagColor: 'success', bg: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
        border: '#6EE7B7', icon: <CheckCircleOutlined />, label: 'Onaylandı'
    }
};

export default function DriverCollectionsPage() {
    const { token } = useAuth();
    const { socket } = useSocket();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [summary, setSummary] = useState<Summary>({});
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const fetchCollections = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (filterStatus !== 'ALL') params.status = filterStatus;
            if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
            if (dateRange?.[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');

            const res = await apiClient.get('/api/operations/driver-collections', { params });
            if (res.data.success) {
                setCollections(res.data.data.collections);
                setSummary(res.data.data.summary);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    }, [filterStatus, dateRange]);

    useEffect(() => {
        fetchCollections();
    }, [fetchCollections]);

    useEffect(() => {
        if (!socket) return;
        const handleHandover = () => {
            message.info('Yeni teslimat var!');
            fetchCollections();
        };
        socket.on('collection_handed_over', handleHandover);
        return () => { socket.off('collection_handed_over', handleHandover); };
    }, [socket, fetchCollections]);

    const confirmCollection = async (id: string) => {
        setConfirmingId(id);
        try {
            const res = await apiClient.post(`/api/operations/driver-collections/${id}/confirm`);
            if (res.data.success) {
                message.success('Teslimat başarıyla onaylandı');
                fetchCollections();
            }
        } catch (error) {
            console.error('Confirm error:', error);
            message.error('Onaylama başarısız');
        } finally {
            setConfirmingId(null);
        }
    };

    const formatCurrency = (amount: number, currency: string) => {
        const num = typeof amount === 'object' ? parseFloat(String(amount)) : Number(amount);
        if (isNaN(num)) return `0,00 ${currency}`;
        // Backend now normalizes currency codes using tenant settings
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(num);
    };

    const getStatusTag = (status: string) => {
        const cfg = STATUS_CONFIG[status];
        if (!cfg) return <Tag>{status}</Tag>;
        return (
            <Tag icon={cfg.icon} color={cfg.tagColor} style={{ borderRadius: 6, padding: '2px 10px', fontWeight: 600 }}>
                {cfg.label}
            </Tag>
        );
    };

    // Summary calculations
    const pendingCount = summary.PENDING?.count || 0;
    const handedOverCount = summary.HANDED_OVER?.count || 0;
    const confirmedCount = summary.CONFIRMED?.count || 0;
    const totalCount = pendingCount + handedOverCount + confirmedCount;

    // Displayed totals per currency
    const displayedTotals = collections.reduce((acc, c) => {
        const amt = typeof c.amount === 'object' ? parseFloat(String(c.amount)) : Number(c.amount);
        if (!isNaN(amt)) {
            acc[c.currency] = (acc[c.currency] || 0) + amt;
        }
        return acc;
    }, {} as Record<string, number>);

    const columns = [
        {
            title: 'Tarih',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (date: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalendarOutlined style={{ color: '#94A3B8', fontSize: 13 }} />
                    <Text style={{ fontSize: 13 }}>{dayjs(date).format('DD.MM.YYYY HH:mm')}</Text>
                </div>
            )
        },
        {
            title: 'Şoför',
            dataIndex: 'driver',
            key: 'driver',
            width: 170,
            render: (driver: { fullName: string }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid #C7D2FE', flexShrink: 0
                    }}>
                        <CarOutlined style={{ color: '#4F46E5', fontSize: 14 }} />
                    </div>
                    <Text strong style={{ fontSize: 13 }}>{driver.fullName}</Text>
                </div>
            )
        },
        {
            title: 'Müşteri / Rezarvasyon',
            dataIndex: 'customerName',
            key: 'customerName',
            width: 210,
            render: (name: string, record: Collection) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <UserOutlined style={{ color: '#64748B', fontSize: 12 }} />
                        <Text style={{ fontWeight: 600 }}>{name || 'İsimsiz Müşteri'}</Text>
                    </div>
                    {record.bookingNumber && (
                        <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', marginLeft: 18 }}>
                            #{record.bookingNumber}
                        </Text>
                    )}
                </div>
            )
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            key: 'amount',
            width: 150,
            align: 'right' as const,
            render: (amount: number, record: Collection) => (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#ECFDF5', padding: '4px 12px', borderRadius: 8,
                    border: '1px solid #A7F3D0'
                }}>
                    <Text strong style={{ fontSize: 15, color: '#059669', letterSpacing: -0.3 }}>
                        {formatCurrency(amount, record.currency)}
                    </Text>
                </div>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            width: 180,
            render: (status: string, record: Collection) => (
                <div>
                    {getStatusTag(status)}
                    {record.handedOverToUser && status !== 'PENDING' && (
                        <div style={{ marginTop: 4, marginLeft: 2 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                → {record.handedOverToUser.fullName}
                            </Text>
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'İşlem',
            key: 'action',
            width: 140,
            fixed: 'right' as const,
            render: (_: any, record: Collection) => (
                record.status === 'HANDED_OVER' ? (
                    <Popconfirm
                        title="Tahsilatı onaylıyor musunuz?"
                        description={`${formatCurrency(record.amount, record.currency)} tutarını onaylayacaksınız.`}
                        onConfirm={() => confirmCollection(record.id)}
                        okText="Evet, Onayla"
                        cancelText="İptal"
                    >
                        <Button
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            loading={confirmingId === record.id}
                            size="small"
                            style={{
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, #059669, #10B981)',
                                border: 'none', fontWeight: 600
                            }}
                        >
                            Onayla
                        </Button>
                    </Popconfirm>
                ) : record.status === 'CONFIRMED' ? (
                    <Tag color="success" style={{ borderRadius: 6 }}>
                        <CheckCircleOutlined /> Tamam
                    </Tag>
                ) : (
                    <Tag color="default" style={{ borderRadius: 6, color: '#94A3B8' }}>
                        <ClockCircleOutlined /> Bekliyor
                    </Tag>
                )
            )
        }
    ];

    // Page summary —  totals per currency for the current page
    const pageSummary = (pageData: readonly Collection[]) => {
        const totals = pageData.reduce((acc, record) => {
            const amt = typeof record.amount === 'object' ? parseFloat(String(record.amount)) : Number(record.amount);
            if (!isNaN(amt)) {
                acc[record.currency] = (acc[record.currency] || 0) + amt;
            }
            return acc;
        }, {} as Record<string, number>);

        return (
            <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#F8FAFC' }}>
                    <Table.Summary.Cell index={0} colSpan={3}>
                        <Text strong style={{ fontSize: 13, color: '#475569' }}>
                            <FileTextOutlined style={{ marginRight: 6 }} />
                            Sayfa Toplamı ({pageData.length} kayıt)
                        </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} colSpan={4}>
                        <Space>
                            {Object.entries(totals).map(([currency, amount]) => (
                                <div key={currency} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                                    padding: '4px 14px', borderRadius: 8,
                                    border: '1px solid #6EE7B7', fontWeight: 700, fontSize: 14, color: '#059669'
                                }}>
                                    {formatCurrency(amount, currency)}
                                </div>
                            ))}
                        </Space>
                    </Table.Summary.Cell>
                </Table.Summary.Row>
            </Table.Summary>
        );
    };

    const statCardStyle = (bg: string, borderColor: string): React.CSSProperties => ({
        background: bg,
        borderRadius: 16,
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.2s ease',
        cursor: 'default'
    });

    return (
    <AdminGuard>
      <AdminLayout selectedKey="driver-collections">
        <div style={{ padding: '24px 28px', background: '#F8FAFC', minHeight: '100vh' }}>

            {/* ── HEADER ── */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 24
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 14,
                        background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(79,70,229,0.3)'
                    }}>
                        <WalletOutlined style={{ color: '#fff', fontSize: 20 }} />
                    </div>
                    <div>
                        <Title level={3} style={{ margin: 0, letterSpacing: -0.5, color: '#0F172A' }}>
                            Şoför Tahsilatları
                        </Title>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            {totalCount} toplam kayıt
                        </Text>
                    </div>
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={fetchCollections}
                    loading={loading}
                    style={{ borderRadius: 10, fontWeight: 600 }}
                >
                    Yenile
                </Button>
            </div>

            {/* ── STAT CARDS ── */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} md={6}>
                    <Card style={statCardStyle(
                        'linear-gradient(135deg, #FFFBEB, #FEF3C7)', '#FCD34D'
                    )} bodyStyle={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <ClockCircleOutlined style={{ fontSize: 18, color: '#D97706' }} />
                            <Text style={{ fontSize: 12, color: '#92400E', fontWeight: 600, letterSpacing: 0.3 }}>
                                ŞOFÖRDE BEKLİYOR
                            </Text>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: '#D97706', letterSpacing: -1 }}>
                            {pendingCount}
                        </div>
                        {summary.PENDING?.amounts && Object.entries(summary.PENDING.amounts).map(([cur, amt]) => (
                            <Text key={cur} style={{ fontSize: 13, color: '#B45309', fontWeight: 600 }}>
                                {formatCurrency(amt, cur)}
                            </Text>
                        ))}
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card style={statCardStyle(
                        'linear-gradient(135deg, #EFF6FF, #DBEAFE)', '#93C5FD'
                    )} bodyStyle={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <SwapOutlined style={{ fontSize: 18, color: '#2563EB' }} />
                            <Text style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600, letterSpacing: 0.3 }}>
                                ONAY BEKLİYOR
                            </Text>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: '#2563EB', letterSpacing: -1 }}>
                            {handedOverCount}
                        </div>
                        {summary.HANDED_OVER?.amounts && Object.entries(summary.HANDED_OVER.amounts).map(([cur, amt]) => (
                            <Text key={cur} style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 600 }}>
                                {formatCurrency(amt, cur)}
                            </Text>
                        ))}
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card style={statCardStyle(
                        'linear-gradient(135deg, #ECFDF5, #D1FAE5)', '#6EE7B7'
                    )} bodyStyle={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <CheckCircleOutlined style={{ fontSize: 18, color: '#059669' }} />
                            <Text style={{ fontSize: 12, color: '#065F46', fontWeight: 600, letterSpacing: 0.3 }}>
                                ONAYLANDI
                            </Text>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>
                            {confirmedCount}
                        </div>
                        {summary.CONFIRMED?.amounts && Object.entries(summary.CONFIRMED.amounts).map(([cur, amt]) => (
                            <Text key={cur} style={{ fontSize: 13, color: '#047857', fontWeight: 600 }}>
                                {formatCurrency(amt, cur)}
                            </Text>
                        ))}
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card style={statCardStyle(
                        'linear-gradient(135deg, #F5F3FF, #EDE9FE)', '#C4B5FD'
                    )} bodyStyle={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <DollarOutlined style={{ fontSize: 18, color: '#7C3AED' }} />
                            <Text style={{ fontSize: 12, color: '#5B21B6', fontWeight: 600, letterSpacing: 0.3 }}>
                                TOPLAM TUTAR
                            </Text>
                        </div>
                        {Object.entries(displayedTotals).length > 0 ? (
                            Object.entries(displayedTotals).map(([currency, amount]) => (
                                <div key={currency} style={{ fontSize: 24, fontWeight: 900, color: '#7C3AED', letterSpacing: -0.5 }}>
                                    {formatCurrency(amount, currency)}
                                </div>
                            ))
                        ) : (
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#7C3AED' }}>₺0,00</div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ── FILTERS ── */}
            <Card style={{
                marginBottom: 20, borderRadius: 14,
                border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }} bodyStyle={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong style={{ fontSize: 13, color: '#475569' }}>Durum:</Text>
                        <Select
                            value={filterStatus}
                            onChange={setFilterStatus}
                            style={{ width: 200 }}
                            placeholder="Tümü"
                        >
                            <Option value="ALL">Tümü</Option>
                            <Option value="PENDING">Şoförde Bekliyor</Option>
                            <Option value="HANDED_OVER">Onay Bekliyor</Option>
                            <Option value="CONFIRMED">Onaylandı</Option>
                        </Select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarOutlined style={{ color: '#64748B' }} />
                        <Text strong style={{ fontSize: 13, color: '#475569' }}>Tarih Aralığı:</Text>
                        <RangePicker
                            onChange={(dates) => setDateRange(dates as any)}
                            format="DD.MM.YYYY"
                            style={{ borderRadius: 8 }}
                        />
                    </div>
                    <Button
                        type="primary"
                        onClick={fetchCollections}
                        loading={loading}
                        icon={<ReloadOutlined />}
                        style={{ borderRadius: 8, fontWeight: 600 }}
                    >
                        Filtrele
                    </Button>
                </div>
            </Card>

            {/* ── PENDING ALERT ── */}
            {handedOverCount > 0 && (
                <Alert
                    message={
                        <span style={{ fontWeight: 600 }}>
                            <ExclamationCircleOutlined style={{ marginRight: 8 }} />
                            {handedOverCount} adet onay bekleyen teslimat bulunuyor
                        </span>
                    }
                    type="warning"
                    showIcon={false}
                    style={{
                        marginBottom: 20, borderRadius: 12,
                        border: '1px solid #FCD34D',
                        background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)'
                    }}
                    action={
                        <Button
                            size="small"
                            style={{ borderRadius: 8, fontWeight: 600 }}
                            onClick={() => setFilterStatus('HANDED_OVER')}
                        >
                            Göster
                        </Button>
                    }
                />
            )}

            {/* ── TABLE ── */}
            <Card style={{
                borderRadius: 16, border: '1px solid #E2E8F0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                overflow: 'hidden'
            }} bodyStyle={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={collections}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total) => <Text type="secondary">{total} kayıt</Text>,
                        style: { padding: '12px 20px' }
                    }}
                    scroll={{ x: 1100 }}
                    summary={pageSummary}
                    rowClassName={(record) =>
                        record.status === 'HANDED_OVER' ? 'collection-row-highlight' : ''
                    }
                    style={{ borderRadius: 16 }}
                />
            </Card>
        </div>

        {/* Inline styles for row highlight */}
        <style jsx global>{`
            .collection-row-highlight {
                background: #FFFBEB !important;
            }
            .collection-row-highlight:hover td {
                background: #FEF3C7 !important;
            }
            .ant-table-thead > tr > th {
                background: #F8FAFC !important;
                font-weight: 700 !important;
                font-size: 12px !important;
                letter-spacing: 0.3px !important;
                text-transform: uppercase !important;
                color: #64748B !important;
                border-bottom: 2px solid #E2E8F0 !important;
            }
            .ant-table-tbody > tr > td {
                border-bottom: 1px solid #F1F5F9 !important;
                padding: 14px 16px !important;
            }
            .ant-table-tbody > tr:hover > td {
                background: #F8FAFC !important;
            }
        `}</style>
      </AdminLayout>
    </AdminGuard>
    );
}
