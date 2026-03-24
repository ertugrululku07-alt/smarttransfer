'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import { Card, Row, Col, Typography, Tag, Button, Spin, Empty, Badge } from 'antd';
import {
    ClockCircleOutlined,
    EnvironmentOutlined,
    CarOutlined,
    UserOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;

export default function MyTransfersPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [transfers, setTransfers] = useState<any[]>([]);

    useEffect(() => {
        fetchTransfers();
    }, []);

    const fetchTransfers = async () => {
        try {
            const response = await apiClient.get('/api/transfer/partner/active-bookings');
            if (response.data.success) {
                setTransfers(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching transfers:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Title level={2}>Transferlerim</Title>
                            <Text type="secondary">Kabul ettiğiniz ve aktif olan transferler</Text>
                        </div>
                        <Badge count={transfers.length} showZero color="#10B981" />
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '50px' }}>
                            <Spin size="large" />
                        </div>
                    ) : transfers.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="Henüz kabul edilmiş bir transferiniz bulunmuyor."
                        >
                            <Button type="primary" onClick={() => router.push('/partner')}>
                                Transfer Havuzuna Git
                            </Button>
                        </Empty>
                    ) : (
                        <Row gutter={[24, 24]}>
                            {transfers.map((transfer) => (
                                <Col xs={24} md={12} lg={8} key={transfer.id}>
                                    <div style={{
                                        background: '#fff',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                                        border: '1px solid rgba(0,0,0,0.03)',
                                        borderTop: '4px solid #10B981', // Green for active
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}>
                                        {/* Header */}
                                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>
                                                {transfer.bookingNumber}
                                            </div>
                                            <Tag color="geekblue" style={{ borderRadius: '12px', padding: '2px 10px', border: 'none', background: '#e0e7ff', color: '#4361ee' }}>
                                                Aktif
                                            </Tag>
                                        </div>

                                        {/* Body */}
                                        <div style={{ padding: '20px', flex: 1 }}>
                                            {/* Route */}
                                            <div style={{ marginBottom: '20px' }}>
                                                {/* Pickup */}
                                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)' }} />
                                                        <div style={{ width: '2px', flex: 1, background: 'linear-gradient(to bottom, #10B981 0%, #e5e7eb 100%)', margin: '4px 0', minHeight: '30px' }} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ALIŞ NOKTASI</Text>
                                                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#1f2937', lineHeight: '1.4', marginTop: '2px' }}>
                                                            {transfer.pickup.location}
                                                        </div>
                                                        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '13px', fontWeight: 500, background: '#ecfdf5', padding: '4px 8px', borderRadius: '6px', width: 'fit-content' }}>
                                                            <CalendarOutlined /> {transfer.pickup.time}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Dropoff */}
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    <div style={{ marginTop: '6px' }}>
                                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)' }} />
                                                    </div>
                                                    <div>
                                                        <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>VARIŞ NOKTASI</Text>
                                                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#1f2937', marginTop: '2px' }}>
                                                            {transfer.dropoff.location}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Info Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f9fafb', padding: '12px', borderRadius: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <CarOutlined style={{ color: '#6b7280' }} />
                                                    <Text style={{ fontSize: '13px', color: '#4b5563' }}>{transfer.vehicle.type}</Text>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <UserOutlined style={{ color: '#6b7280' }} />
                                                    <Text style={{ fontSize: '13px', color: '#4b5563' }}>{transfer.customer.name}</Text>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div style={{ padding: '16px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '10px' }}>
                                            <Button
                                                type="primary"
                                                block
                                                style={{ height: '40px', background: '#4361ee', borderColor: '#4361ee', borderRadius: '8px', fontWeight: 500 }}
                                                onClick={() => router.push(`/partner/booking/${transfer.id}`)}
                                            >
                                                Detay / İşlemler
                                            </Button>
                                        </div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    )}
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
