'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    SearchOutlined,
    CalendarOutlined,
    CarOutlined
} from '@ant-design/icons';
import {
    Table,
    Tag,
    Input,
    Spin,
    Card,
    Typography,
    Tabs,
    Button,
    Empty
} from 'antd';

const { Title, Text } = Typography;

export default function CompletedReservationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<any[]>([]);
    const [searchText, setSearchText] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');

    // Fetch Completed Bookings
    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    router.push('/login');
                    return;
                }

                const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/partner/completed-bookings`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const resData = await response.json();
                    if (resData.success) {
                        setBookings(resData.data);
                    }
                }
            } catch (error) {
                console.error('Fetch error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchBookings();
    }, [router]);

    // Filter Logic
    const getFilteredBookings = () => {
        let filtered = bookings;

        // 1. Tab Filter
        if (activeTab !== 'ALL') {
            filtered = filtered.filter(b => b.paymentStatus === activeTab);
        }

        // 2. Search Filter
        if (searchText) {
            const lowerSearch = searchText.toLowerCase();
            filtered = filtered.filter(b =>
                b.bookingNumber?.toLowerCase().includes(lowerSearch) ||
                b.customer?.name?.toLowerCase().includes(lowerSearch) ||
                b.pickup?.location?.toLowerCase().includes(lowerSearch)
            );
        }

        return filtered;
    };

    // Columns
    const columns = [
        {
            title: 'Rezervasyon',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            render: (text: string, record: any) => (
                <div>
                    <div style={{ fontWeight: 600, color: '#1890ff' }}>{text}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                        {new Date(record.completedAt).toLocaleDateString('tr-TR')}
                    </div>
                </div>
            )
        },
        {
            title: 'Müşteri',
            dataIndex: ['customer', 'name'],
            key: 'customer',
            render: (text: string, record: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', background: '#f0f2f5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 600, color: '#667eea'
                    }}>
                        {record.customer.avatar}
                    </div>
                    <div>
                        <div style={{ fontWeight: 500 }}>{text}</div>
                        <div style={{ fontSize: '11px', color: '#999' }}>{record.customer.phone}</div>
                    </div>
                </div>
            )
        },
        {
            title: 'Güzergah',
            key: 'route',
            render: (_: any, record: any) => (
                <div style={{ maxWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#52c41a' }} />
                        <Text ellipsis={{ tooltip: record.pickup.location }} style={{ fontSize: '13px' }}>
                            {record.pickup.location}
                        </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f5222d' }} />
                        <Text ellipsis={{ tooltip: record.dropoff.location }} style={{ fontSize: '13px' }}>
                            {record.dropoff.location}
                        </Text>
                    </div>
                </div>
            )
        },
        {
            title: 'Tutar',
            key: 'price',
            render: (_: any, record: any) => (
                <div style={{ fontWeight: 600, fontSize: '15px' }}>
                    {record.price.amount} {record.price.currency}
                </div>
            )
        },
        {
            title: 'Ödeme Durumu',
            dataIndex: 'paymentStatus',
            key: 'paymentStatus',
            render: (status: string) => {
                let color = 'gold';
                let text = 'Beklemede';
                let icon = <ClockCircleOutlined />;

                if (status === 'PAID') {
                    color = 'success';
                    text = 'Ödendi';
                    icon = <CheckCircleOutlined />;
                } else if (status === 'DISPUTED') {
                    color = 'error';
                    text = 'İtiraz Edildi';
                    icon = <ExclamationCircleOutlined />;
                } else if (status === 'PENDING') {
                    color = 'warning';
                    text = 'Beklemede';
                    icon = <ClockCircleOutlined />;
                } else if (status === 'FAILED') {
                    color = 'red';
                    text = 'Başarısız';
                    icon = <ExclamationCircleOutlined />;
                }

                return (
                    <Tag icon={icon} color={color} style={{ margin: 0 }}>
                        {text}
                    </Tag>
                );
            }
        },
        {
            title: 'İşlem',
            key: 'action',
            render: (_: any, record: any) => (
                <Button type="link" size="small" onClick={() => router.push(`/partner/booking/${record.id}`)}>
                    Detay
                </Button>
            )
        }
    ];

    const tabItems = [
        { key: 'ALL', label: 'Tümü' },
        { key: 'PAID', label: 'Ödendi' },
        { key: 'PENDING', label: 'Beklemede' },
        { key: 'DISPUTED', label: 'İtiraz Edildi' }
    ];

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Tamamlanmış Rezervasyonlar</Title>
                            <Text type="secondary">Geçmiş transferlerinizi ve ödeme durumlarını görüntüleyin</Text>
                        </div>
                    </div>

                    {/* Filters */}
                    <Card style={{ marginBottom: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} bodyStyle={{ padding: '12px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                            <Tabs
                                activeKey={activeTab}
                                onChange={setActiveTab}
                                items={tabItems}
                                style={{ marginBottom: -16 }}
                            />
                            <Input
                                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                                placeholder="Rezervasyon no, müşteri veya konum ara..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                style={{ width: '300px', borderRadius: '6px' }}
                            />
                        </div>
                    </Card>

                    {/* Table */}
                    <Card style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
                        <Table
                            columns={columns}
                            dataSource={getFilteredBookings()}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            locale={{ emptyText: <Empty description="Kayıt bulunamadı" /> }}
                        />
                    </Card>

                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
