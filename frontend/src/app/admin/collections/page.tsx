'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Table, Card, Tag, Button, Space, Badge, Spin, Alert,
    Typography, Row, Col, Statistic, DatePicker, Select, message, Modal
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CheckOutlined,
    DollarOutlined,
    UserOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import { useAuth } from '@/app/context/AuthContext';
import { useSocket } from '@/app/context/SocketContext';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';

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

export default function DriverCollectionsPage() {
    const { token } = useAuth();
    const { socket } = useSocket();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [summary, setSummary] = useState<Summary>({});
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('HANDED_OVER');
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

    // Listen for real-time updates
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
                message.success('Teslimat onaylandı');
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
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(amount);
    };

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'PENDING':
                return <Tag icon={<ClockCircleOutlined />} color="warning">Şoförde Bekliyor</Tag>;
            case 'HANDED_OVER':
                return <Tag icon={<CheckOutlined />} color="processing">Teslim Edildi (Onay Bekliyor)</Tag>;
            case 'CONFIRMED':
                return <Tag icon={<CheckCircleOutlined />} color="success">Onaylandı</Tag>;
            default:
                return <Tag>{status}</Tag>;
        }
    };

    const columns = [
        {
            title: 'Tarih',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm')
        },
        {
            title: 'Şoför',
            dataIndex: 'driver',
            key: 'driver',
            width: 150,
            render: (driver: { fullName: string }) => (
                <Space>
                    <UserOutlined />
                    <Text strong>{driver.fullName}</Text>
                </Space>
            )
        },
        {
            title: 'Müşteri',
            dataIndex: 'customerName',
            key: 'customerName',
            width: 180,
            render: (name: string, record: Collection) => (
                <div>
                    <Text>{name || 'İsimsiz'}</Text>
                    {record.bookingNumber && (
                        <div><Text type="secondary" style={{ fontSize: 12 }}>#{record.bookingNumber}</Text></div>
                    )}
                </div>
            )
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            key: 'amount',
            width: 140,
            align: 'right' as const,
            render: (amount: number, record: Collection) => (
                <Text strong style={{ fontSize: 16, color: '#059669' }}>
                    {formatCurrency(amount, record.currency)}
                </Text>
            )
        },
        {
            title: 'Para Birimi',
            dataIndex: 'currency',
            key: 'currency',
            width: 100,
            align: 'center' as const
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
                        <div style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                Teslim: {record.handedOverToUser.fullName}
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
                    <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        loading={confirmingId === record.id}
                        onClick={() => confirmCollection(record.id)}
                        size="small"
                    >
                        Onayla
                    </Button>
                ) : record.status === 'CONFIRMED' ? (
                    <Tag color="success">Onaylandı</Tag>
                ) : (
                    <Tag color="warning">Bekliyor</Tag>
                )
            )
        }
    ];

    // Calculate display totals
    const displayedTotals = collections.reduce((acc, c) => {
        acc[c.currency] = (acc[c.currency] || 0) + c.amount;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div style={{ padding: 24 }}>
            <Title level={3} style={{ marginBottom: 24 }}>
                <DollarOutlined /> Şoför Tahsilatları
            </Title>

            {/* Summary Cards */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Onay Bekleyen Teslimat"
                            value={summary.HANDED_OVER?.count || 0}
                            valueStyle={{ color: '#faad14' }}
                            suffix="adet"
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Şoförde Bekleyen"
                            value={summary.PENDING?.count || 0}
                            valueStyle={{ color: '#1890ff' }}
                            suffix="adet"
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Onaylanan"
                            value={summary.CONFIRMED?.count || 0}
                            valueStyle={{ color: '#52c41a' }}
                            suffix="adet"
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>Toplam Tutar</div>
                        {Object.entries(displayedTotals).map(([currency, amount]) => (
                            <div key={currency} style={{ fontSize: 18, fontWeight: 'bold', color: '#059669' }}>
                                {formatCurrency(amount, currency)}
                            </div>
                        ))}
                    </Card>
                </Col>
            </Row>

            {/* Filters */}
            <Card style={{ marginBottom: 24 }}>
                <Space size="large" wrap>
                    <Space>
                        <Text strong>Durum:</Text>
                        <Select
                            value={filterStatus}
                            onChange={setFilterStatus}
                            style={{ width: 200 }}
                            allowClear
                            placeholder="Tümü"
                        >
                            <Option value="ALL">Tümü</Option>
                            <Option value="PENDING">Şoförde Bekliyor</Option>
                            <Option value="HANDED_OVER">Onay Bekliyor</Option>
                            <Option value="CONFIRMED">Onaylandı</Option>
                        </Select>
                    </Space>
                    <Space>
                        <CalendarOutlined />
                        <Text strong>Tarih Aralığı:</Text>
                        <RangePicker
                            onChange={(dates) => setDateRange(dates as any)}
                            format="DD.MM.YYYY"
                        />
                    </Space>
                    <Button type="primary" onClick={fetchCollections} loading={loading}>
                        Yenile
                    </Button>
                </Space>
            </Card>

            {/* Alert for pending confirmations */}
            {(summary.HANDED_OVER?.count || 0) > 0 && (
                <Alert
                    message={`${summary.HANDED_OVER?.count} adet onay bekleyen teslimat var`}
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    action={
                        <Button size="small" onClick={() => setFilterStatus('HANDED_OVER')}>
                            Göster
                        </Button>
                    }
                />
            )}

            {/* Table */}
            <Card>
                <Table
                    columns={columns}
                    dataSource={collections}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    scroll={{ x: 1100 }}
                    summary={(pageData) => {
                        const totals = pageData.reduce((acc, record) => {
                            acc[record.currency] = (acc[record.currency] || 0) + record.amount;
                            return acc;
                        }, {} as Record<string, number>);

                        return (
                            <Table.Summary fixed>
                                <Table.Summary.Row style={{ background: '#fafafa' }}>
                                    <Table.Summary.Cell index={0} colSpan={3}>
                                        <Text strong>Sayfa Toplamı</Text>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={3} colSpan={4}>
                                        <Space>
                                            {Object.entries(totals).map(([currency, amount]) => (
                                                <Badge
                                                    key={currency}
                                                    count={formatCurrency(amount, currency)}
                                                    style={{ backgroundColor: '#52c41a', fontSize: 14, padding: '4px 8px' }}
                                                />
                                            ))}
                                        </Space>
                                    </Table.Summary.Cell>
                                </Table.Summary.Row>
                            </Table.Summary>
                        );
                    }}
                />
            </Card>
        </div>
    );
}
