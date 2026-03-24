'use client';

import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Space, Typography, message, Input } from 'antd';
import {
    ReloadOutlined,
    CarOutlined,
    EnvironmentOutlined,
    CalendarOutlined,
    UserOutlined,
    TeamOutlined,
    SearchOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

dayjs.locale('tr');

const { Title } = Typography;

export default function PartnerTransfersPage() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    const fetchBookings = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/api/transfer/bookings');

            if (response.data.success) {
                // Filter only confirmed transfers that have a partner assigned AND are external partners
                const allBookings = response.data.data;
                const partnerBookings = allBookings.filter((b: any) =>
                    b.status === 'CONFIRMED' &&
                    b.partnerName &&
                    b.partnerRole === 'PARTNER'
                );
                setBookings(partnerBookings);
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
        fetchBookings();
    }, []);

    const filteredBookings = bookings.filter((b: any) =>
        b.bookingNumber.toLowerCase().includes(searchText.toLowerCase()) ||
        b.partnerName?.toLowerCase().includes(searchText.toLowerCase()) ||
        b.passengerName.toLowerCase().includes(searchText.toLowerCase())
    );

    const columns = [
        {
            title: 'Rezervasyon No',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>
        },
        {
            title: 'Partner',
            dataIndex: 'partnerName',
            key: 'partnerName',
            render: (text: string) => (
                <Tag icon={<TeamOutlined />} color="purple" style={{ fontSize: '14px', padding: '4px 8px' }}>
                    {text}
                </Tag>
            )
        },
        {
            title: 'Tarih/Saat',
            dataIndex: 'pickupDateTime',
            key: 'time',
            render: (text: string) => (
                <Space>
                    <CalendarOutlined style={{ color: '#1890ff' }} />
                    <span>{dayjs(text).format('DD MMMM HH:mm')}</span>
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
                        <span style={{ fontSize: '13px' }}>{record.pickup.location || record.pickup}</span>
                    </Space>
                    <div style={{ paddingLeft: '22px', borderLeft: '1px dashed #d9d9d9', marginLeft: '7px', height: '10px' }} />
                    <Space>
                        <EnvironmentOutlined style={{ color: '#f5222d' }} />
                        <span style={{ fontSize: '13px' }}>{record.dropoff.location || record.dropoff}</span>
                    </Space>
                </Space>
            )
        },
        {
            title: 'Müşteri',
            dataIndex: 'passengerName',
            key: 'customer',
            render: (text: string) => (
                <Space>
                    <UserOutlined />
                    {text}
                </Space>
            )
        },
        {
            title: 'Araç',
            dataIndex: 'vehicleType',
            key: 'vehicle',
            render: (text: string) => (
                <Tag icon={<CarOutlined />} color="blue">{text}</Tag>
            )
        },
        {
            title: 'Durum',
            key: 'status',
            render: (_: any, record: any) => {
                const isPartner = record.partnerRole === 'PARTNER';
                return (
                    <Tag color={isPartner ? "purple" : "cyan"}>
                        {isPartner ? "DIŞ OPERASYONDA" : "OPERASYONDA"}
                    </Tag>
                );
            }
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="partner-transfers">
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <Space>
                            <Title level={2} style={{ margin: 0 }}>Partner Transfer Listesi</Title>
                            <Tag color="purple">{bookings.length} Transfer</Tag>
                        </Space>
                        <Space>
                            <Input
                                placeholder="Ara..."
                                prefix={<SearchOutlined />}
                                onChange={e => setSearchText(e.target.value)}
                                style={{ width: 200 }}
                            />
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchBookings}
                                loading={loading}
                            >
                                Yenile
                            </Button>
                        </Space>
                    </div>

                    <Card style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <Table
                            columns={columns}
                            dataSource={filteredBookings}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            locale={{ emptyText: 'Partnerde aktif transfer yok' }}
                        />
                    </Card>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
