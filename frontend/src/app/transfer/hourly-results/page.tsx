'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Layout, Spin, Card, Button, Tag, Typography, Row, Col,
    Alert, Divider, Badge
} from 'antd';
import {
    ClockCircleOutlined, UserOutlined, CarOutlined,
    ArrowLeftOutlined, CheckCircleOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import TopBar from '@/app/components/TopBar';
import apiClient from '@/lib/api-client';
import { useCurrency } from '@/app/context/CurrencyContext';
import { useTheme } from '@/app/context/ThemeContext';

const { Content, Footer } = Layout;
const { Title, Text } = Typography;

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

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
            mode: 'hourly',
        });
        router.push(`/transfer/hourly-book?${params.toString()}`);
    };

    const pickupDisplay = pickup.split(',')[0];
    const dateDisplay = date ? dayjs(date).format('DD MMM YYYY') : '';

    return (
        <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <TopBar />
            <Content style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px', width: '100%' }}>

                {/* Back + Summary */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ borderRadius: 8 }}>
                        Geri
                    </Button>
                    <div style={{ flex: 1 }}>
                        <Title level={4} style={{ margin: 0, color: '#1e293b' }}>
                            <ClockCircleOutlined style={{ color: theme.primaryColor, marginRight: 8 }} />
                            Saatlik Kiralama Sonuçları
                        </Title>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>
                            {pickupDisplay} · {dateDisplay} {time} · {hours} saat · {passengers} yolcu
                        </Text>
                    </div>
                </div>

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
                        style={{
                            borderRadius: 16, marginBottom: 16, border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                            overflow: 'hidden',
                        }}
                        styles={{ body: { padding: 0 } }}
                    >
                        <Row>
                            {/* Vehicle image */}
                            <Col xs={24} sm={8} style={{
                                background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 140,
                            }}>
                                {vt.image ? (
                                    <img src={vt.image} alt={vt.vehicleType}
                                        style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                                ) : (
                                    <CarOutlined style={{ fontSize: 64, color: '#94a3b8' }} />
                                )}
                            </Col>

                            {/* Info */}
                            <Col xs={24} sm={16} style={{ padding: '20px 24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        <Title level={4} style={{ margin: 0, color: '#1e293b' }}>{vt.vehicleType}</Title>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                            <Tag icon={<UserOutlined />} style={{ borderRadius: 6, fontSize: 11 }}>
                                                {vt.capacity} Yolcu
                                            </Tag>
                                            <Tag icon={<ClockCircleOutlined />} color="blue" style={{ borderRadius: 6, fontSize: 11 }}>
                                                {formatPrice(vt.hourlyRate, vt.currency)} / saat
                                            </Tag>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                                            {hours} saat toplam
                                        </div>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: theme.primaryColor }}>
                                            {formatPrice(vt.totalPrice, vt.currency)}
                                        </div>
                                    </div>
                                </div>

                                {vt.description && (
                                    <Text style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 8 }}>
                                        {vt.description}
                                    </Text>
                                )}

                                {vt.features?.length > 0 && (
                                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {vt.features.slice(0, 4).map((f: string, i: number) => (
                                            <Tag key={i} icon={<CheckCircleOutlined />} color="success"
                                                style={{ borderRadius: 6, fontSize: 10 }}>
                                                {f}
                                            </Tag>
                                        ))}
                                    </div>
                                )}

                                <Divider style={{ margin: '14px 0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        <CreditCardOutlined style={{ marginRight: 4 }} />
                                        Araçta veya online ödeme
                                    </div>
                                    <Button
                                        type="primary"
                                        size="large"
                                        onClick={() => handleSelectVehicle(vt)}
                                        style={{
                                            background: theme.buttonGradient || 'linear-gradient(135deg, #f97316, #ea580c)',
                                            border: 'none', borderRadius: 10, fontWeight: 700, height: 44, minWidth: 140,
                                        }}
                                    >
                                        Seç ve Devam
                                    </Button>
                                </div>
                            </Col>
                        </Row>
                    </Card>
                ))}
            </Content>
            <Footer style={{ textAlign: 'center', background: '#fff', fontSize: 12, color: '#94a3b8' }}>
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
