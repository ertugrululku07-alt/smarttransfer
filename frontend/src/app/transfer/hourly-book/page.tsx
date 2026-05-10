'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Layout, Card, Typography, Form, Input, Button,
    Row, Col, Divider, Select, message, Spin, Result, Tag, Alert, Space, Radio
} from 'antd';
import {
    ClockCircleOutlined, UserOutlined, EnvironmentOutlined,
    CalendarOutlined, CarOutlined, CheckCircleOutlined, ArrowLeftOutlined,
    PhoneOutlined, MailOutlined, LockOutlined, CreditCardOutlined, WalletOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import { useCurrency } from '@/app/context/CurrencyContext';
import { useTheme } from '@/app/context/ThemeContext';

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
    const vehicleImage = searchParams.get('image') || '';
    const capacity = searchParams.get('capacity') || '';
    const luggage = searchParams.get('luggage') || '';

    const [loading, setLoading] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState<{ bookingNumber: string } | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'PAY_IN_VEHICLE' | 'ONLINE'>('PAY_IN_VEHICLE');

    const pickupDateTime = time ? `${date}T${time}:00.000` : `${date}T12:00:00.000`;

    const handleSubmit = async (values: any) => {
        setLoading(true);
        try {
            const fullPhone = values.phone ? `${values.prefix || '+90'} ${values.phone}` : '';
            const payload = {
                vehicleType,
                vehicleTypeId,
                pickup,
                dropoff: pickup,
                pickupDateTime,
                passengers: Number(passengers),
                adults: Number(passengers),
                children: 0,
                infants: 0,
                price,
                currency,
                paymentMethod,
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
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
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

    const pickupDisplay = pickup.split(',')[0];
    const dateDisplay = dayjs(date).format('DD MMMM YYYY');

    return (
        <Layout style={{ minHeight: '100vh', background: '#fff' }}>
            <TopBar />
            
            {/* Header with back button */}
            <div style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '16px 0' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                    <Button
                        type="text"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => router.back()}
                        style={{ fontSize: 14, fontWeight: 500, color: theme.primaryColor }}
                    >
                        Araçları Geri Göster
                    </Button>
                </div>
            </div>

            <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
                <Row gutter={[32, 32]}>
                    {/* Left: Summary */}
                    <Col xs={24} lg={10}>
                        <Card
                            style={{
                                borderRadius: 16, border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 12px rgba(0,0,0,0.05)', position: 'sticky', top: 20,
                                overflow: 'hidden',
                            }}
                            styles={{ body: { padding: 0 } }}
                        >
                            {/* Vehicle image */}
                            {vehicleImage && (
                                <div style={{
                                    background: '#f8fafc', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', padding: '20px', borderBottom: '1px solid #e2e8f0',
                                    minHeight: 160,
                                }}>
                                    <img
                                        src={vehicleImage}
                                        alt={vehicleType}
                                        style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain' }}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                </div>
                            )}

                            <div style={{ padding: 24 }}>
                                <Title level={5} style={{ marginTop: 0, marginBottom: 16, color: '#1e293b' }}>
                                    <ClockCircleOutlined style={{ marginRight: 8, color: theme.primaryColor }} />
                                    Kiralama Özeti
                                </Title>

                                <div style={{ marginBottom: 14 }}>
                                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Araç Tipi</Text>
                                    <Title level={4} style={{ margin: 0, color: '#1e293b' }}>{vehicleType}</Title>
                                    {(capacity || luggage) && (
                                        <Space size="small" style={{ marginTop: 6 }}>
                                            {capacity && <Tag icon={<UserOutlined />} style={{ borderRadius: 6 }}>{capacity} Yolcu</Tag>}
                                            {luggage && Number(luggage) > 0 && <Tag style={{ borderRadius: 6 }}>{luggage} Bagaj</Tag>}
                                        </Space>
                                    )}
                                </div>

                                <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 16 }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            <EnvironmentOutlined style={{ marginRight: 6 }} />Konum
                                        </Text>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>{pickupDisplay}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            <CalendarOutlined style={{ marginRight: 6 }} />Tarih & Saat
                                        </Text>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>{dateDisplay} {time}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            <ClockCircleOutlined style={{ marginRight: 6 }} />Kiralama Süresi
                                        </Text>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>{hours} Saat</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            <UserOutlined style={{ marginRight: 6 }} />Yolcu Sayısı
                                        </Text>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>{passengers} Yolcu</div>
                                    </div>
                                </Space>

                                <Divider style={{ margin: '16px 0' }} />

                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text type="secondary">Saat Başı Ücret</Text>
                                        <Text>{formatPrice(hourlyRate, currency)}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text type="secondary">Süre</Text>
                                        <Text>{hours} saat</Text>
                                    </div>
                                </div>

                                <Divider style={{ margin: '12px 0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <Title level={4} style={{ margin: 0, color: '#1e293b' }}>Toplam</Title>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: theme.primaryColor }}>
                                            {formatPrice(price, currency)}
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>KDV dahil</Text>
                                    </div>
                                </div>

                                {/* Payment Method Selection */}
                                <div style={{
                                    background: '#f8fafc', borderRadius: 12,
                                    border: '1px solid #e2e8f0', padding: '14px 16px',
                                }}>
                                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12, color: '#374151' }}>
                                        Ödeme Yöntemi
                                    </Text>
                                    <Radio.Group
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
                                    >
                                        <Radio value="PAY_IN_VEHICLE">
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                <WalletOutlined style={{ color: '#059669' }} />
                                                <span style={{ fontSize: 13, fontWeight: 500 }}>Araçta Ödeme</span>
                                                <Tag color="green" style={{ borderRadius: 6, fontSize: 10, margin: 0 }}>Nakit / Kart</Tag>
                                            </div>
                                        </Radio>
                                        <Radio value="ONLINE">
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                <CreditCardOutlined style={{ color: '#6366f1' }} />
                                                <span style={{ fontSize: 13, fontWeight: 500 }}>Online Ödeme</span>
                                                <Tag color="purple" style={{ borderRadius: 6, fontSize: 10, margin: 0 }}>Güvenli</Tag>
                                            </div>
                                        </Radio>
                                    </Radio.Group>

                                    {paymentMethod === 'ONLINE' && (
                                        <Alert
                                            type="info"
                                            message="Online ödeme için rezervasyon onaylanınca size ödeme bağlantısı gönderilecektir."
                                            showIcon
                                            style={{ marginTop: 12, borderRadius: 8, fontSize: 12 }}
                                        />
                                    )}
                                    {paymentMethod === 'PAY_IN_VEHICLE' && (
                                        <Alert
                                            type="success"
                                            message="Ödemeyi araç içinde sürücüye nakit veya kart ile yapabilirsiniz."
                                            showIcon
                                            style={{ marginTop: 12, borderRadius: 8, fontSize: 12 }}
                                        />
                                    )}
                                </div>
                            </div>
                        </Card>
                    </Col>

                    {/* Right: Form */}
                    <Col xs={24} lg={14}>
                        <Card
                            style={{
                                borderRadius: 16, border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
                            }}
                            styles={{ body: { padding: 24 } }}
                        >
                            <Title level={4} style={{ marginTop: 0, marginBottom: 24, color: '#1e293b' }}>
                                <UserOutlined style={{ marginRight: 8, color: theme.primaryColor }} />
                                Müşteri Bilgileri
                            </Title>

                            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                                <Row gutter={16}>
                                    <Col xs={24}>
                                        <Form.Item
                                            name="fullName"
                                            label={<Text strong>Ad Soyad</Text>}
                                            rules={[{ required: true, message: 'Ad Soyad gerekli' }]}
                                        >
                                            <Input
                                                size="large"
                                                placeholder="Adınız Soyadınız"
                                                style={{ borderRadius: 10 }}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Row gutter={16}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="email"
                                            label={<Text strong>E-posta</Text>}
                                            rules={[{ required: true, type: 'email', message: 'Geçerli e-posta girin' }]}
                                        >
                                            <Input
                                                size="large"
                                                placeholder="ornek@email.com"
                                                style={{ borderRadius: 10 }}
                                                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="prefix"
                                            label={<Text strong>Ülke</Text>}
                                            initialValue="+90"
                                        >
                                            <Select size="large" style={{ borderRadius: 10 }}>
                                                {PHONE_PREFIXES.map(p => (
                                                    <Select.Option key={p.code} value={p.code}>{p.label}</Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Row gutter={16}>
                                    <Col xs={24}>
                                        <Form.Item
                                            name="phone"
                                            label={<Text strong>Telefon Numarası</Text>}
                                            rules={[{ required: true, message: 'Telefon numarası gerekli' }]}
                                        >
                                            <Input
                                                size="large"
                                                placeholder="5XX XXX XX XX"
                                                style={{ borderRadius: 10 }}
                                                prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Form.Item
                                    name="notes"
                                    label={<Text>Özel Notlar (opsiyonel)</Text>}
                                >
                                    <Input.TextArea
                                        rows={3}
                                        placeholder="Sürücüye iletmek istediğiniz bilgiler..."
                                        style={{ borderRadius: 10 }}
                                    />
                                </Form.Item>

                                <Divider style={{ margin: '24px 0' }} />

                                <Alert
                                    type="success"
                                    message="Güvenli Rezervasyon"
                                    description="Tüm ödeme işlemleri güvenli SSL şifrelemesi ile korunmaktadır."
                                    icon={<LockOutlined />}
                                    showIcon
                                    style={{ marginBottom: 24, borderRadius: 10 }}
                                />

                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    block
                                    size="large"
                                    loading={loading}
                                    style={{
                                        height: 50, borderRadius: 12, fontWeight: 700, fontSize: 16,
                                        background: theme.buttonGradient || 'linear-gradient(135deg, #667eea, #764ba2)',
                                        border: 'none',
                                    }}
                                >
                                    <CheckCircleOutlined /> Rezervasyonu Tamamla — {formatPrice(price, currency)}
                                </Button>

                                <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 12 }}>
                                    Rezervasyon onayı e-posta adresinize gönderilecektir
                                </Text>
                            </Form>
                        </Card>
                    </Col>
                </Row>
            </Content>
            <Footer style={{ textAlign: 'center', background: '#fff', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #e2e8f0' }}>
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
