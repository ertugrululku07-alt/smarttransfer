'use client';

import React, { useState, useEffect } from 'react';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import { Table, Card, Row, Col, Typography, Tag, Statistic, message, Spin } from 'antd';
import { DollarOutlined, RiseOutlined, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;

export default function EarningsPage() {
    const [loading, setLoading] = useState(true);
    const [earnings, setEarnings] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalNet: 0,
        pending: 0,
        paid: 0
    });

    useEffect(() => {
        fetchEarnings();
    }, []);

    const fetchEarnings = async () => {
        try {
            const response = await apiClient.get('/api/transfer/partner/completed-bookings');
            if (response.data.success) {
                const bookings = response.data.data;

                // Process bookings to calculate earnings
                const processedEarnings = bookings.map((booking: any) => {
                    const amount = Number(booking.price.amount);
                    const commissionRate = 0.15; // Mock 15% commission
                    const deduction = amount * commissionRate;
                    const net = amount - deduction;

                    return {
                        key: booking.id,
                        id: booking.id,
                        bookingNumber: booking.bookingNumber,
                        date: booking.pickup.time, // Formatted date string from API
                        route: {
                            from: booking.pickup.location,
                            to: booking.dropoff.location
                        },
                        amount: amount,
                        deduction: deduction,
                        net: net,
                        currency: booking.price.currency,
                        status: booking.paymentStatus || 'PENDING', // Default to PENDING if not set
                        customer: booking.customer.name
                    };
                });

                setEarnings(processedEarnings);

                // Calculate Summary Stats
                const totalNet = processedEarnings.reduce((acc: number, curr: any) => acc + curr.net, 0);
                // Mock logic for Paid vs Pending (since backend might not have this fully wired yet)
                // Assuming older than 7 days is Paid, otherwise Pending for demo
                // Or just use the status if available. 
                // Let's use the status from the object.
                const pending = processedEarnings
                    .filter((e: any) => e.status === 'PENDING')
                    .reduce((acc: number, curr: any) => acc + curr.net, 0);

                const paid = processedEarnings
                    .filter((e: any) => e.status === 'PAID')
                    .reduce((acc: number, curr: any) => acc + curr.net, 0);

                setStats({
                    totalNet,
                    pending,
                    paid
                });
            }
        } catch (error) {
            console.error('Error fetching earnings:', error);
            message.error('Kazanç bilgileri alınamadı');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'Tarih / Referans',
            dataIndex: 'date',
            key: 'date',
            render: (text: string, record: any) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{text}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{record.bookingNumber}</div>
                </div>
            )
        },
        {
            title: 'Güzergah',
            key: 'route',
            render: (record: any) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
                        <Text ellipsis style={{ maxWidth: '200px' }}>{record.route.from}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }}></span>
                        <Text ellipsis style={{ maxWidth: '200px' }}>{record.route.to}</Text>
                    </div>
                </div>
            )
        },
        {
            title: 'Toplam Tutar',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            render: (amount: number, record: any) => (
                <Text strong>{amount.toFixed(2)} {record.currency}</Text>
            )
        },
        {
            title: 'Kesinti (%15)',
            dataIndex: 'deduction',
            key: 'deduction',
            align: 'right' as const,
            render: (deduction: number, record: any) => (
                <Text type="danger">-{deduction.toFixed(2)} {record.currency}</Text>
            )
        },
        {
            title: 'Net Kazanç',
            dataIndex: 'net',
            key: 'net',
            align: 'right' as const,
            render: (net: number, record: any) => (
                <Text type="success" strong style={{ fontSize: '15px' }}>+{net.toFixed(2)} {record.currency}</Text>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            align: 'center' as const,
            render: (status: string) => {
                const color = status === 'PAID' ? 'success' : 'warning';
                const text = status === 'PAID' ? 'Ödendi' : 'Bekliyor';
                const icon = status === 'PAID' ? <CheckCircleOutlined /> : <ClockCircleOutlined />;
                return (
                    <Tag icon={icon} color={color} style={{ borderRadius: '12px', padding: '4px 12px' }}>
                        {text}
                    </Tag>
                );
            }
        }
    ];

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <Title level={2}>Kazanç Raporu</Title>
                        <Text type="secondary">Tamamlanan transferleriniz ve ödeme detayları</Text>
                    </div>

                    {/* Summary Cards */}
                    <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                        <Col xs={24} sm={8}>
                            <Card bordered={false} style={{ height: '100%', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                                <Statistic
                                    title="Toplam Net Kazanç"
                                    value={stats.totalNet}
                                    precision={2}
                                    suffix="TRY" // Assuming TRY for summary for now, ideally handle mixed currencies
                                    valueStyle={{ color: '#3f8600', fontWeight: 700 }}
                                    prefix={<RiseOutlined />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card bordered={false} style={{ height: '100%', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                                <Statistic
                                    title="Bekleyen Ödeme"
                                    value={stats.pending}
                                    precision={2}
                                    suffix="TRY"
                                    valueStyle={{ color: '#faad14', fontWeight: 700 }}
                                    prefix={<ClockCircleOutlined />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card bordered={false} style={{ height: '100%', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                                <Statistic
                                    title="Yapılan Ödeme"
                                    value={stats.paid}
                                    precision={2}
                                    suffix="TRY"
                                    valueStyle={{ color: '#10B981', fontWeight: 700 }}
                                    prefix={<DollarOutlined />}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Earnings Table */}
                    <Card
                        bordered={false}
                        style={{ borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}
                        bodyStyle={{ padding: 0 }}
                    >
                        <Table
                            columns={columns}
                            dataSource={earnings}
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            rowClassName="earnings-row"
                        />
                    </Card>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
