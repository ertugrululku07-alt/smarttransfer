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
        fetchStats();
        fetchEarnings();
    }, []);

    const fetchStats = async () => {
        try {
            const res = await apiClient.get('/api/transfer/partner/stats');
            if (res.data.success && res.data.data.financials) {
                const fin = res.data.data.financials;
                setStats({
                    totalNet: fin.credit,
                    pending: fin.balance,
                    paid: fin.debit
                });
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchEarnings = async () => {
        try {
            const response = await apiClient.get('/api/transfer/partner/completed-bookings');
            if (response.data.success) {
                const bookings = response.data.data;

                // Process bookings to calculate earnings
                const processedEarnings = bookings.map((booking: any) => {
                    const amount = Number(booking.price.amount);
                    const deduction = Number(booking.price.commissionAmount || 0);
                    const net = Number(booking.price.netEarning || amount);
                    const commissionRate = booking.price.commissionRate;

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
                        commissionRate: commissionRate,
                        currency: booking.price.currency,
                        status: booking.paymentStatus || 'PENDING', // Default to PENDING if not set
                        customer: booking.customer.name
                    };
                });

                setEarnings(processedEarnings);

                setEarnings(processedEarnings);

                // Summary Stats are now fetched from fetchStats() for real financial precision
                // But we can fallback to calculation if stats API fails (handled in useEffect order)
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
            title: 'Kesinti',
            dataIndex: 'deduction',
            key: 'deduction',
            align: 'right' as const,
            render: (deduction: number, record: any) => (
                <div>
                    <Text type={deduction > 0 ? "danger" : "secondary"}>
                        {deduction > 0 ? `-${deduction.toFixed(2)}` : '0.00'} {record.currency}
                    </Text>
                    {record.commissionRate !== null && record.commissionRate !== undefined && (
                        <div style={{ fontSize: '10px', color: '#999' }}>%{record.commissionRate} Komisyon</div>
                    )}
                </div>
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
