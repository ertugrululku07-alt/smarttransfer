'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Layout, Card, Typography, Form, Input, Button,
    Row, Col, Divider, Select, message, Spin, Result, Tag, Alert
} from 'antd';
import {
    ClockCircleOutlined, UserOutlined, EnvironmentOutlined,
    CalendarOutlined, CarOutlined, CheckCircleOutlined, ArrowLeftOutlined,
    PhoneOutlined, MailOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import { useCurrency } from '@/app/context/CurrencyContext';
import { useTheme } from '@/app/context/ThemeContext';
import { countryList } from '@/lib/countryData';

const { Content, Footer } = Layout;
const { Title, Text } = Typography;

const PHONE_PREFIXES = [
    { code: '+90', label: '🇹🇷 +90' }, { code: '+49', label: '🇩🇪 +49' },
    { code: '+44', label: '🇬🇧 +44' }, { code: '+1', label: '🇺🇸 +1' },
    { code: '+7', label: '🇷🇺 +7' }, { code: '+33', label: '🇫🇷 +33' },
    { code: '+31', label: '🇳🇱 +31' }, { code: '+39', label: '🇮🇹 +39' },
    { code: '+34', label: '🇪🇸 +34' }, { code: '+380', label: '🇺🇦 +380' },
    { code: '+48', label: '🇵🇱 +48' },
];

function HourlyBookContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { formatPrice } = useCurrency();
    const { theme } = useTheme();
    const [form] = Form.useForm();

    const vehicleTypeId = searchParams.get('vehicleTypeId') || '';
    const vehicleType = searchParams.get('vehicleType') || '';
    const pickup = searchParams.get('pickup') || '';
    const date = searchParams.get('date') || '';
    const time = searchParams.get('time') || '';
    const hours = parseFloat(searchParams.get('hours') || '1');
    const passengers = searchParams.get('passengers') || '1';
    const price = parseFloat(searchParams.get('price') || '0');
    const hourlyRate = parseFloat(searchParams.get('hourlyRate') || '0');
    const currency = searchParams.get('currency') || 'TRY';

    const [loading, setLoading] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState<{ bookingNumber: string } | null>(null);

    const pickupDateTime = time ? `${date}T${time}:00.000` : `${date}T12:00:00.000`;

    const handleSubmit = async (values: any) => {
        setLoading(true);
        try {
            const fullPhone = values.phone ? `${values.prefix || '+90'} ${values.phone}` : '';
            const payload = {
                vehicleType,
                vehicleTypeId,
                pickup,
                dropoff: pickup, // For hourly, start=end point
                pickupDateTime,
                passengers: Number(passengers),
                adults: Number(passengers),
                children: 0,
                infants: 0,
                price,
                currency,
                paymentMethod: 'PAY_IN_VEHICLE',
                productType: 'HOURLY',
                hourlyRate,
                hours,
                customerInfo: {
                    fullName: values.fullName,
                    email: values.email,
                    phone: fullPhone,
                },
                notes: values.notes || undefined,
            };

            const res = await apiClient.post('/api/transfer/book', payload);
            if (res.data.success) {
                setBookingSuccess({ bookingNumber: res.data.bookingNumber || res.data.data?.bookingNumber || '' });
            } else {
                message.error(res.data.error || 'Rezervasyon oluşturulamadı');
            }
        } catch (err: any) {
            message.error(err?.response?.data?.error || 'Rezervasyon hatası');
        } finally {
            setLoading(false);
        }
    };

    if (bookingSuccess) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
                <TopBar />
                <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                    <Result
                        status="success"
                        title="Rezervasyon Tamamlandı!"
                        subTitle={
                            <div>
                                <div style={{ fontSize: 14, marginBottom: 8 }}>
                                    Rezervasyon No: <strong>{bookingSuccess.bookingNumber}</strong>
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                    {vehicleType} · {pickup.split(',')[0]} · {hours} saat kiralama
                                </div>
                            </div>
                        }
                        extra={[
                            <Button key="home" type="primary" onClick={() => router.push('/')}
                                style={{ background: theme.buttonGradient, border: 'none', borderRadius: 8 }}>
                                Ana Sayfaya Dön
                            </Button>,
                            <Button key="track" onClick={() => router.push('/track')} style={{ borderRadius: 8 }}>
                                Rezervasyonu Takip Et
                            </Button>,
                        ]}
                    />
                </Content>
            </Layout>
        );
    }

    return (
        <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <TopBar />
            <Content style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px', width: '100%' }}>
                {/* Back */}
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ borderRadius: 8, marginBottom: 20 }}>
                    Geri Dön
                </Button>

                {/* Booking Summary Card */}
                <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid #e0f2fe', background: '#f0f9ff' }}
                    styles={{ body: { padding: 20 } }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <ClockCircleOutlined style={{ fontSize: 20, color: theme.primaryColor }} />
                        <Title level={5} style={{ margin: 0, color: '#0369a1' }}>Saatlik Kiralama Özeti</Title>
                    </div>
                    <Row gutter={[16, 8]}>
                        <Col xs={24} sm={12}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CarOutlined /> <strong>{vehicleType}</strong>
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <EnvironmentOutlined /> {pickup.split(',')[0]}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CalendarOutlined /> {dayjs(date).format('DD MMM YYYY')} {time}
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
                            <Tag icon={<ClockCircleOutlined />} color="blue" style={{ fontSize: 12, borderRadius: 8, padding: '4px 12px' }}>
                                {hours} saat
                            </Tag>
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatPrice(hourlyRate, currency)} / saat</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: theme.primaryColor }}>
                                    {formatPrice(price, currency)}
                                </div>
                            </div>
                        </Col>
                    </Row>
                </Card>

                {/* Booking Form */}
                <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
                    <Title level={5} style={{ marginTop: 0, marginBottom: 20 }}>
                        <UserOutlined style={{ marginRight: 8, color: theme.primaryColor }} />
                        Müşteri Bilgileri
                    </Title>
                    <Form form={form} layout="vertical" onFinish={handleSubmit}>
                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item name="fullName" label="Ad Soyad"
                                    rules={[{ required: true, message: 'Ad Soyad gerekli' }]}>
                                    <Input size="large" placeholder="Ad Soyad" style={{ borderRadius: 10 }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="email" label="E-posta"
                                    rules={[{ required: true, type: 'email', message: 'Geçerli e-posta girin' }]}>
                                    <Input size="large" placeholder="ornek@email.com" style={{ borderRadius: 10 }}
                                        prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col xs={8} sm={6}>
                                <Form.Item name="prefix" label="Ülke" initialValue="+90">
                                    <Select size="large" style={{ borderRadius: 10 }}>
                                        {PHONE_PREFIXES.map(p => (
                                            <Select.Option key={p.code} value={p.code}>{p.label}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={16} sm={18}>
                                <Form.Item name="phone" label="Telefon"
                                    rules={[{ required: true, message: 'Telefon numarası gerekli' }]}>
                                    <Input size="large" placeholder="5XX XXX XX XX" style={{ borderRadius: 10 }}
                                        prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="notes" label="Notlar (opsiyonel)">
                            <Input.TextArea rows={3} placeholder="Sürücüye iletmek istediğiniz bilgiler..."
                                style={{ borderRadius: 10 }} />
                        </Form.Item>

                        <Divider />

                        <Alert
                            type="info" showIcon
                            message="Ödeme araçta veya online yapılabilir."
                            style={{ borderRadius: 10, marginBottom: 16 }}
                        />

                        <Button
                            type="primary" htmlType="submit" block size="large"
                            loading={loading}
                            style={{
                                height: 50, borderRadius: 12, fontWeight: 700, fontSize: 16,
                                background: theme.buttonGradient || 'linear-gradient(135deg, #f97316, #ea580c)',
                                border: 'none',
                            }}
                        >
                            <CheckCircleOutlined /> Rezervasyonu Tamamla — {formatPrice(price, currency)}
                        </Button>
                    </Form>
                </Card>
            </Content>
            <Footer style={{ textAlign: 'center', background: '#fff', fontSize: 12, color: '#94a3b8' }}>
                SmartTransfer ©2026
            </Footer>
        </Layout>
    );
}

export default function HourlyBookPage() {
    return (
        <Suspense fallback={<div style={{ padding: 100, textAlign: 'center' }}><Spin size="large" /></div>}>
            <HourlyBookContent />
        </Suspense>
    );
}
