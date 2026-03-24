'use client';

import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Space, Typography, message, Tooltip } from 'antd';
import {
    ReloadOutlined,
    CarOutlined,
    EnvironmentOutlined,
    CalendarOutlined,
    UserOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';

dayjs.locale('tr');

const { Title } = Typography;

import apiClient from '@/lib/api-client';

export default function PoolTransfersPage() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPoolBookings = async () => {
        setLoading(true);
        try {
            // Re-using the existing pool-bookings endpoint since it returns all pool items
            const response = await apiClient.get('/api/transfer/pool-bookings');

            if (response.data.success) {
                setBookings(response.data.data);
            } else {
                message.error('Veriler alınamadı: ' + response.data.error);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Bağlantı hatası');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPoolBookings();
    }, []);

    const columns = [
        {
            title: 'Rezervasyon No',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>
        },
        {
            title: 'Tarih/Saat',
            dataIndex: ['pickup', 'time'],
            key: 'time',
            render: (text: string) => (
                <Space>
                    <CalendarOutlined style={{ color: '#1890ff' }} />
                    <span>{text}</span>
                </Space>
            )
        },
        {
            title: 'Güzergah',
            key: 'route',
            render: (_: any, record: any) => (
                <Space direction="vertical" size={0}>
                    <Space>
                        <EnvironmentOutlined style={{ color: '#52c41a' }} />
                        <span style={{ fontSize: '13px' }}>{record.pickup.location}</span>
                    </Space>
                    <div style={{ paddingLeft: '22px', borderLeft: '1px dashed #d9d9d9', marginLeft: '7px', height: '10px' }} />
                    <Space>
                        <EnvironmentOutlined style={{ color: '#f5222d' }} />
                        <span style={{ fontSize: '13px' }}>{record.dropoff.location}</span>
                    </Space>
                </Space>
            )
        },
        {
            title: 'Araç',
            dataIndex: ['vehicle', 'type'],
            key: 'vehicle',
            render: (text: string) => (
                <Tag icon={<CarOutlined />} color="blue">{text}</Tag>
            )
        },
        {
            title: 'Müşteri',
            dataIndex: ['customer', 'name'],
            key: 'customer',
            render: (text: string) => (
                <Space>
                    <UserOutlined />
                    {text}
                </Space>
            )
        },
        {
            title: 'Tutar',
            key: 'price',
            render: (_: any, record: any) => (
                <span style={{ fontWeight: 600, color: '#52c41a' }}>
                    {record.price.amount} {record.price.currency}
                </span>
            )
        },
        {
            title: 'Durum',
            key: 'status',
            render: () => (
                <Tag color="orange">HAVUZDA</Tag>
            )
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: any) => (
                <Button
                    size="small"
                    onClick={() => message.info('Detay sayfası henüz admin paneline eklenmedi')}
                >
                    Detay
                </Button>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="pool-transfers">
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <Title level={2} style={{ margin: 0 }}>Havuzdaki Transferler</Title>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchPoolBookings}
                            loading={loading}
                        >
                            Yenile
                        </Button>
                    </div>

                    <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <Table
                            columns={columns}
                            dataSource={bookings}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            locale={{ emptyText: 'Havuzda bekleyen transfer yok' }}
                        />
                    </Card>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
