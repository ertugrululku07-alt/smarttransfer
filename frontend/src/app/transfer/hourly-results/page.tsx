'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Layout, Spin, Card, Button, Tag, Typography, Row, Col,
    Alert, Divider, Space
} from 'antd';
import {
    ClockCircleOutlined, UserOutlined, CarOutlined,
    ArrowRightOutlined, CheckCircleOutlined, FilterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import TopBar from '@/app/components/TopBar';
import apiClient, { getImageUrl } from '@/lib/api-client';
import { useCurrency } from '@/app/context/CurrencyContext';
import { useTheme } from '@/app/context/ThemeContext';

const { Content, Footer } = Layout;
const { Title, Text } = Typography;

function HourlyResultsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { formatPrice } = useCurrency();
    const { theme } = useTheme();

    const pickup = searchParams.get('pickup') || '';
    const date = searchParams.get('date') || '';
    const time = searchParams.get('time') || '';
    const hours = parseFloat(searchParams.get('hours') || '1');
    const passengers = searchParams.get('passengers') || '1';

    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!pickup || !date) { setLoading(false); return; }
        fetchResults();
    }, [searchParams]);

    const fetchResults = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get('/api/transfer/hourly-search', {
                params: { passengers, hours },
            });
            if (res.data.success) {
                setResults(res.data.data || []);
            } else {
                setError(res.data.error || 'Sonuç bulunamadı');
            }
        } catch {
            setError('Arama sırasında hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectVehicle = (vt: any) => {
        const params = new URLSearchParams({
            vehicleTypeId: vt.vehicleTypeId,
            vehicleType: vt.vehicleType,
            pickup,
            date,
            time,
            hours: hours.toString(),
            passengers,
            price: vt.totalPrice.toString(),
            hourlyRate: vt.hourlyRate.toString(),
            currency: vt.currency,
        });
        router.push(`/transfer/hourly-book?${params.toString()}`);
    };

    const pickupDisplay = pickup.split(',')[0];
    const dateDisplay = date ? dayjs(date).format('DD MMMM YYYY') : '';

    return (
        <Layout style={{ minHeight: '100vh', background: '#fff' }}>
            <TopBar />
            
            {/* Header with search summary */}
            <div style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '24px 0' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                    <Row gutter={[24, 24]} align="middle">
                        <Col xs={24} md={16}>
                            <Title level={4} style={{ margin: 0 }}>
                                <ClockCircleOutlined style={{ color: theme.primaryColor, marginRight: 8 }} />
                                {pickupDisplay}
                            </Title>
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text type="secondary"><ClockCircleOutlined /> {dateDisplay} {time}</Text>
                                <div style={{ width: 1, height: 14, background: '#f0f0f0', margin: '0 8px' }}></div>
                                <Text type="secondary"><UserOutlined /> {passengers} Yolcu</Text>
                                <div style={{ width: 1, height: 14, background: '#f0f0f0', margin: '0 8px' }}></div>
                                <Tag color="cyan">{hours} Saat</Tag>
                            </div>
                        </Col>
                        <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                            <Button type="primary" icon={<FilterOutlined />} onClick={() => router.back()}>Aramayı Düzenle</Button>
                        </Col>
                    </Row>
                </div>
            </div>

            <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
                {loading && (
                    <div style={{ textAlign: 'center', padding: 80 }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 12, color: '#64748b' }}>Araçlar yükleniyor...</div>
                    </div>
                )}

                {!loading && error && (
                    <Alert type="error" message={error} showIcon style={{ borderRadius: 10 }} />
                )}

                {!loading && !error && results.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 80 }}>
                        <CarOutlined style={{ fontSize: 48, color: '#cbd5e1', marginBottom: 16 }} />
                        <Title level={4} style={{ color: '#64748b' }}>Uygun araç bulunamadı</Title>
                        <Text style={{ color: '#94a3b8' }}>Saatlik fiyatlandırılmış aktif araç tipi yok.</Text>
                    </div>
                )}

                {!loading && results.map(vt => (
                    <Card
                        key={vt.vehicleTypeId}
                        hoverable
                        style={{
                            marginBottom: 16, overflow: 'hidden',
                            borderRadius: 12, border: '1px solid #e2e8f0',
                        }}
                        styles={{ body: { padding: 0 } }}
                    >
                        <Row>
                            {/* Vehicle image - left side */}
                            <Col xs={24} md={8} style={{
                                background: '#f9f9f9', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', padding: 0, minHeight: 200,
                                overflow: 'hidden', position: 'relative'
                            }}>
                                {vt.image ? (
                                    <img
                                        src={vt.image}
                                        alt={vt.vehicleType}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px' }}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                        }}
                                    />
                                ) : (
                                    <CarOutlined style={{ fontSize: 64, color: '#cbd5e1' }} />
                                )}
                            </Col>

                            {/* Info - right side */}
                            <Col xs={24} md={16} style={{ padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                    <div>
                                        <Title level={4} style={{ margin: 0, color: '#1e293b' }}>{vt.vehicleType}</Title>
                                        <Text type="secondary" style={{ fontSize: 13 }}>{vt.description || 'Saatlik kiralama'}</Text>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                                            {hours} saat
                                        </div>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: theme.primaryColor }}>
                                            {formatPrice(vt.totalPrice, vt.currency)}
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {formatPrice(vt.hourlyRate, vt.currency)}/saat
                                        </Text>
                                    </div>
                                </div>

                                <Space size="small" wrap style={{ marginBottom: 12 }}>
                                    <Tag icon={<UserOutlined />} style={{ borderRadius: 6 }}>
                                        {vt.capacity} Yolcu
                                    </Tag>
                                    {vt.luggage > 0 && (
                                        <Tag style={{ borderRadius: 6 }}>
                                            {vt.luggage} Bagaj
                                        </Tag>
                                    )}
                                </Space>

                                {vt.features?.length > 0 && (
                                    <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {vt.features.slice(0, 3).map((f: string, i: number) => (
                                            <Tag key={i} icon={<CheckCircleOutlined />} color="success" style={{ borderRadius: 6, fontSize: 11 }}>
                                                {f}
                                            </Tag>
                                        ))}
                                    </div>
                                )}

                                <Divider style={{ margin: '12px 0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        ✓ Araçta veya online ödeme
                                    </Text>
                                    <Button
                                        type="primary"
                                        size="large"
                                        onClick={() => handleSelectVehicle(vt)}
                                        style={{
                                            background: theme.buttonGradient || 'linear-gradient(135deg, #667eea, #764ba2)',
                                            border: 'none', borderRadius: 10, fontWeight: 700, height: 44, minWidth: 140,
                                        }}
                                    >
                                        Hemen Seç
                                    </Button>
                                </div>
                            </Col>
                        </Row>
                    </Card>
                ))}
            </Content>
            <Footer style={{ textAlign: 'center', background: '#fff', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #e2e8f0' }}>
                SmartTransfer ©2026
            </Footer>
        </Layout>
    );
}

export default function HourlyResultsPage() {
    return (
        <Suspense fallback={<div style={{ padding: 100, textAlign: 'center' }}><Spin size="large" /></div>}>
            <HourlyResultsContent />
        </Suspense>
    );
}
