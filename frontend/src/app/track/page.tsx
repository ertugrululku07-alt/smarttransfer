'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Card, Row, Col, Typography, Tag, Button, Space, Skeleton,
    Avatar, Descriptions, Divider, Empty, Rate, Alert, Statistic,
    Form, Input, message, Tabs
} from 'antd';
import {
    SearchOutlined, EnvironmentOutlined, CarOutlined, UserOutlined,
    PhoneOutlined, ClockCircleOutlined, ArrowLeftOutlined,
    ReloadOutlined, AimOutlined, HomeOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import { Suspense } from 'react';

const { Title, Text } = Typography;

const STATUS_INFO: Record<string, { label: string; color: string }> = {
    PENDING:     { label: 'Onay Bekliyor',  color: 'orange'  },
    CONFIRMED:   { label: 'Onaylandı',      color: 'cyan'    },
    IN_PROGRESS: { label: 'Devam Ediyor',   color: 'magenta' },
    COMPLETED:   { label: 'Tamamlandı',     color: 'green'   },
    CANCELLED:   { label: 'İptal',          color: 'red'     },
    NO_SHOW:     { label: 'Gelmedi',        color: 'red'     },
};

const fmtDate = (iso?: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

function TrackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [form] = Form.useForm();

    // Lookup form state
    const [searching, setSearching] = useState(false);

    // Booking result state
    const [booking, setBooking] = useState<any | null>(null);
    const [verifyEmail, setVerifyEmail] = useState<string>('');
    const [verifyPhone4, setVerifyPhone4] = useState<string>('');
    const [refreshing, setRefreshing] = useState(false);

    // Driver location state
    const [driverLocation, setDriverLocation] = useState<any | null>(null);
    const [locationOnline, setLocationOnline] = useState(false);
    const [locationLastSeen, setLocationLastSeen] = useState<number | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    // Pre-fill from URL params (e.g. from homepage quick-form)
    useEffect(() => {
        const bn = searchParams.get('bookingNumber');
        const em = searchParams.get('email');
        const ph = searchParams.get('phone4');
        if (bn) form.setFieldValue('bookingNumber', bn);
        if (em) form.setFieldValue('identifier', em);
        if (ph) form.setFieldValue('identifier', ph);
        // Auto-submit if both provided
        if (bn && (em || ph)) {
            handleSearch({ bookingNumber: bn, identifier: em || ph || '' });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const buildParams = (bookingNumberOverride?: string, identifierOverride?: string) => {
        const bn = bookingNumberOverride ?? form.getFieldValue('bookingNumber');
        const id = identifierOverride ?? form.getFieldValue('identifier');
        const params: Record<string, string> = { bookingNumber: bn };
        if (id.includes('@')) {
            params.email = id;
        } else {
            params.phone4 = id.replace(/\D/g, '').slice(-4);
        }
        return params;
    };

    const handleSearch = async (values?: { bookingNumber: string; identifier: string }) => {
        const { bookingNumber, identifier } = values || form.getFieldsValue();
        if (!bookingNumber?.trim() || !identifier?.trim()) {
            message.warning('Rezervasyon numarası ve e-posta / telefon gerekli');
            return;
        }
        setSearching(true);
        setBooking(null);
        setDriverLocation(null);
        try {
            const params = buildParams(bookingNumber, identifier);
            const res = await apiClient.get('/api/transfer/track', { params });
            if (res.data.success) {
                setBooking(res.data.data);
                setVerifyEmail(params.email || '');
                setVerifyPhone4(params.phone4 || '');
            }
        } catch (e: any) {
            const msg = e?.response?.data?.error || 'Rezervasyon bulunamadı';
            message.error(msg);
        } finally {
            setSearching(false);
        }
    };

    const handleRefresh = async () => {
        if (!booking) return;
        setRefreshing(true);
        try {
            const params: Record<string, string> = { bookingNumber: booking.bookingNumber };
            if (verifyEmail) params.email = verifyEmail;
            else if (verifyPhone4) params.phone4 = verifyPhone4;
            const res = await apiClient.get('/api/transfer/track', { params });
            if (res.data.success) setBooking(res.data.data);
        } catch { /* silent */ }
        finally { setRefreshing(false); }
    };

    const fetchDriverLocation = useCallback(async () => {
        if (!booking?.id || !booking?.trackingAvailable) return;
        try {
            const params: Record<string, string> = {};
            if (verifyEmail) params.email = verifyEmail;
            else if (verifyPhone4) params.phone4 = verifyPhone4;
            const res = await apiClient.get(`/api/transfer/track/${booking.id}/driver-location`, { params });
            if (res.data.success) {
                setDriverLocation(res.data.data.location);
                setLocationOnline(res.data.data.online);
                setLocationLastSeen(res.data.data.lastSeen);
                setLocationError(null);
            }
        } catch (e: any) {
            setLocationError(e?.response?.data?.error || 'Konum alınamadı');
        }
    }, [booking?.id, booking?.trackingAvailable, verifyEmail, verifyPhone4]);

    useEffect(() => {
        if (!booking?.trackingAvailable) return;
        fetchDriverLocation();
        const iv = setInterval(fetchDriverLocation, 15000);
        return () => clearInterval(iv);
    }, [booking?.trackingAvailable, fetchDriverLocation]);

    const status = booking ? (STATUS_INFO[booking.status] || { label: booking.status, color: 'default' }) : null;

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <TopBar />

            <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 16px' }}>
                {/* Back / Title */}
                <Space style={{ marginBottom: 24 }}>
                    <Button icon={<HomeOutlined />} onClick={() => router.push('/')}>Ana Sayfa</Button>
                    <Title level={3} style={{ margin: 0 }}>Rezervasyon Sorgulama</Title>
                </Space>

                {/* Lookup form */}
                <Card
                    style={{ marginBottom: 24, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}
                    styles={{ body: { padding: '24px 28px' } }}
                >
                    <Title level={5} style={{ marginBottom: 16, color: '#4f46e5' }}>
                        <SearchOutlined /> Rezervasyonunuzu Sorgulayın
                    </Title>
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSearch}
                    >
                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="bookingNumber"
                                    label="Rezervasyon Numarası"
                                    rules={[{ required: true, message: 'Rezervasyon numarası girin' }]}
                                >
                                    <Input
                                        placeholder="TR-20260501-1234"
                                        size="large"
                                        prefix={<CheckCircleOutlined style={{ color: '#9ca3af' }} />}
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="identifier"
                                    label="E-posta veya Telefon Son 4 Hanesi"
                                    rules={[{ required: true, message: 'E-posta veya telefon son 4 hanesi girin' }]}
                                    tooltip="Rezervasyonu yaparken kullandığınız e-posta ya da telefon numaranızın son 4 rakamını girin"
                                >
                                    <Input
                                        placeholder="ornek@email.com veya 4567"
                                        size="large"
                                        prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SearchOutlined />}
                            loading={searching}
                            size="large"
                            style={{ background: '#4f46e5', borderColor: '#4f46e5', borderRadius: 8 }}
                        >
                            Rezervasyonu Sorgula
                        </Button>
                    </Form>
                </Card>

                {/* Loading skeleton */}
                {searching && <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>}

                {/* Booking result */}
                {booking && !searching && (
                    <>
                        {/* Status banner */}
                        <Card style={{ marginBottom: 16, borderRadius: 12 }} styles={{ body: { padding: 16 } }}>
                            <Row align="middle" justify="space-between" wrap>
                                <Col>
                                    <Space size="middle" wrap>
                                        <Title level={5} style={{ margin: 0 }}>#{booking.bookingNumber}</Title>
                                        <Tag color={status!.color} style={{ fontSize: 14, padding: '4px 14px', fontWeight: 700 }}>
                                            {status!.label}
                                        </Tag>
                                        <Text type="secondary">
                                            <ClockCircleOutlined /> {fmtDate(booking.startDate)}
                                        </Text>
                                        {booking.minutesUntilPickup !== null && booking.minutesUntilPickup > 0 && booking.minutesUntilPickup < 600 && (
                                            <Tag color="gold" icon={<ClockCircleOutlined />}>
                                                {booking.minutesUntilPickup > 60
                                                    ? `${Math.round(booking.minutesUntilPickup / 60)} saat sonra`
                                                    : `${booking.minutesUntilPickup} dk sonra`}
                                            </Tag>
                                        )}
                                    </Space>
                                </Col>
                                <Col>
                                    <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
                                        Yenile
                                    </Button>
                                </Col>
                            </Row>
                        </Card>

                        <Row gutter={[16, 16]}>
                            {/* Left col */}
                            <Col xs={24} lg={14}>
                                {/* Trip info */}
                                <Card
                                    title={<><EnvironmentOutlined /> Yolculuk Bilgileri</>}
                                    style={{ marginBottom: 16, borderRadius: 12 }}
                                >
                                    <Descriptions column={1} size="small" colon>
                                        <Descriptions.Item label="Alış">{booking.metadata?.pickup || '-'}</Descriptions.Item>
                                        <Descriptions.Item label="Varış">{booking.metadata?.dropoff || '-'}</Descriptions.Item>
                                        <Descriptions.Item label="Tarih / Saat">{fmtDate(booking.startDate)}</Descriptions.Item>
                                        <Descriptions.Item label="Yolcu Sayısı">
                                            {booking.adults} Yetişkin
                                            {booking.children ? `, ${booking.children} Çocuk` : ''}
                                            {booking.infants ? `, ${booking.infants} Bebek` : ''}
                                        </Descriptions.Item>
                                        {booking.metadata?.flightNumber && (
                                            <Descriptions.Item label="Uçuş No">{booking.metadata.flightNumber}</Descriptions.Item>
                                        )}
                                        {booking.metadata?.vehicleType && (
                                            <Descriptions.Item label="Araç Tipi">{booking.metadata.vehicleType}</Descriptions.Item>
                                        )}
                                        <Descriptions.Item label="Tutar">
                                            <strong>{Number(booking.total).toFixed(2)} {booking.currency}</strong>
                                            <Tag color={booking.paymentStatus === 'PAID' ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
                                                {booking.paymentStatus === 'PAID' ? 'Ödendi' : 'Bekliyor'}
                                            </Tag>
                                        </Descriptions.Item>
                                        {booking.specialRequests && (
                                            <Descriptions.Item label="Özel İstekler">{booking.specialRequests}</Descriptions.Item>
                                        )}
                                        {booking.pickedUpAt && (
                                            <Descriptions.Item label="Alış Zamanı">{fmtDate(booking.pickedUpAt)}</Descriptions.Item>
                                        )}
                                        {booking.droppedOffAt && (
                                            <Descriptions.Item label="Varış Zamanı">{fmtDate(booking.droppedOffAt)}</Descriptions.Item>
                                        )}
                                    </Descriptions>
                                </Card>

                                {/* Live tracking */}
                                <Card
                                    title={<><AimOutlined /> Şoför Konumu</>}
                                    style={{ marginBottom: 16, borderRadius: 12 }}
                                    extra={
                                        booking.trackingAvailable && (
                                            <Tag color={locationOnline ? 'green' : 'default'}>
                                                {locationOnline ? '● Canlı' : 'Bekleniyor'}
                                            </Tag>
                                        )
                                    }
                                >
                                    {!booking.driver ? (
                                        <Empty description="Henüz şoför atanmamış" />
                                    ) : !booking.trackingAvailable ? (
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="Şoför konumu transfer saatine 30 dakika kala paylaşılacaktır"
                                            description={
                                                booking.minutesUntilPickup !== null && booking.minutesUntilPickup > 0
                                                    ? `Transferinize ${booking.minutesUntilPickup > 60
                                                        ? Math.round(booking.minutesUntilPickup / 60) + ' saat'
                                                        : booking.minutesUntilPickup + ' dakika'} var.`
                                                    : 'Bu transfer için canlı takip aktif değil.'
                                            }
                                        />
                                    ) : driverLocation ? (
                                        <div>
                                            <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                                <Space wrap>
                                                    <Statistic
                                                        title="Mevcut Hız"
                                                        value={driverLocation.speed ? Math.round(driverLocation.speed * 3.6) : 0}
                                                        suffix="km/sa"
                                                    />
                                                </Space>
                                                {locationLastSeen && (
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        Son güncelleme: {new Date(locationLastSeen).toLocaleTimeString('tr-TR')}
                                                    </Text>
                                                )}
                                                <Space wrap>
                                                    <Button
                                                        type="primary"
                                                        icon={<EnvironmentOutlined />}
                                                        href={`https://www.google.com/maps?q=${driverLocation.lat},${driverLocation.lng}`}
                                                        target="_blank"
                                                        style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
                                                    >
                                                        Haritada Göster
                                                    </Button>
                                                    {booking.metadata?.pickupCoordinates && (
                                                        <Button
                                                            icon={<EnvironmentOutlined />}
                                                            href={`https://www.google.com/maps/dir/${driverLocation.lat},${driverLocation.lng}/${booking.metadata.pickupCoordinates.lat},${booking.metadata.pickupCoordinates.lng}`}
                                                            target="_blank"
                                                        >
                                                            Şöförün Yolunu Gör
                                                        </Button>
                                                    )}
                                                </Space>
                                            </Space>
                                            <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                                                <iframe
                                                    title="Şoför Konumu"
                                                    width="100%"
                                                    height="300"
                                                    frameBorder="0"
                                                    style={{ display: 'block' }}
                                                    src={`https://maps.google.com/maps?q=${driverLocation.lat},${driverLocation.lng}&z=15&output=embed`}
                                                />
                                            </div>
                                        </div>
                                    ) : locationError ? (
                                        <Alert type="warning" message={locationError} showIcon />
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 16 }}>
                                            <Text type="secondary">Şoförün konumu bekleniyor…</Text>
                                        </div>
                                    )}
                                </Card>
                            </Col>

                            {/* Right col – Driver + Vehicle */}
                            <Col xs={24} lg={10}>
                                <Card
                                    title={<><CarOutlined /> Şoför & Araç</>}
                                    style={{ marginBottom: 16, borderRadius: 12 }}
                                >
                                    {!booking.driver ? (
                                        <Empty description="Henüz şoför atanmamış" />
                                    ) : (
                                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                            <Space size="middle">
                                                <Avatar size={64} icon={<UserOutlined />} src={booking.driver.avatar}
                                                    style={{ background: '#4f46e5' }} />
                                                <div>
                                                    <Title level={5} style={{ margin: 0 }}>{booking.driver.fullName}</Title>
                                                    {booking.driver.rating !== null && booking.driver.rating !== undefined && (
                                                        <Space size={4}>
                                                            <Rate disabled allowHalf value={booking.driver.rating} style={{ fontSize: 12 }} />
                                                            <Text style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                                                                {Number(booking.driver.rating).toFixed(1)}
                                                            </Text>
                                                            {booking.driver.ratingCount ? (
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    ({booking.driver.ratingCount})
                                                                </Text>
                                                            ) : null}
                                                        </Space>
                                                    )}
                                                    {booking.driver.phone && (
                                                        <div style={{ marginTop: 4 }}>
                                                            <Button
                                                                type="link" size="small" icon={<PhoneOutlined />}
                                                                href={`tel:${booking.driver.phone}`}
                                                                style={{ padding: 0 }}
                                                            >
                                                                {booking.driver.phone}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </Space>

                                            {(booking.driver.vehiclePlate || booking.driver.vehicleType) && (
                                                <>
                                                    <Divider style={{ margin: '8px 0' }} />
                                                    <Descriptions column={1} size="small">
                                                        {booking.driver.vehiclePlate && (
                                                            <Descriptions.Item label="Plaka">
                                                                <Tag color="blue" style={{ fontWeight: 700, fontSize: 14 }}>
                                                                    {booking.driver.vehiclePlate}
                                                                </Tag>
                                                            </Descriptions.Item>
                                                        )}
                                                        {booking.driver.vehicleType && (
                                                            <Descriptions.Item label="Tip">{booking.driver.vehicleType}</Descriptions.Item>
                                                        )}
                                                        {booking.driver.vehicleModel && (
                                                            <Descriptions.Item label="Model">{booking.driver.vehicleModel}</Descriptions.Item>
                                                        )}
                                                        {booking.driver.vehicleColor && (
                                                            <Descriptions.Item label="Renk">{booking.driver.vehicleColor}</Descriptions.Item>
                                                        )}
                                                    </Descriptions>
                                                </>
                                            )}
                                        </Space>
                                    )}
                                </Card>

                                {/* Rating for completed trips */}
                                {booking.status === 'COMPLETED' && booking.metadata?.ratingToken && !booking.metadata?.rating && (
                                    <Card style={{ marginTop: 0, borderRadius: 12 }}>
                                        <Space direction="vertical" style={{ width: '100%' }} align="center">
                                            <Text strong>Yolculuğunuzu değerlendirmek ister misiniz?</Text>
                                            <Button
                                                type="primary"
                                                href={`/rate/${booking.metadata.ratingToken}`}
                                                target="_blank"
                                                style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
                                            >
                                                Puanla
                                            </Button>
                                        </Space>
                                    </Card>
                                )}
                                {booking.metadata?.rating && (
                                    <Card style={{ marginTop: 0, borderRadius: 12 }}>
                                        <Text strong>Verdiğiniz Puan</Text>
                                        <Space style={{ marginTop: 8 }}>
                                            <Rate disabled allowHalf value={booking.metadata.rating.overall} />
                                            <Text strong style={{ color: '#f59e0b' }}>
                                                {Number(booking.metadata.rating.overall).toFixed(1)}
                                            </Text>
                                        </Space>
                                    </Card>
                                )}

                                {/* Hint: register for full features */}
                                <Card
                                    style={{ marginTop: 16, borderRadius: 12, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none' }}
                                    styles={{ body: { padding: 20 } }}
                                >
                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                        <Text strong style={{ color: '#fff', fontSize: 15 }}>
                                            Tüm rezervasyonlarınızı tek yerden yönetin
                                        </Text>
                                        <Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 13 }}>
                                            Üye olun; tüm transferlerinizi, şoför takibini ve mesajları müşteri panelinizden kolayca yönetin.
                                        </Text>
                                        <Space>
                                            <Button
                                                onClick={() => router.push('/register')}
                                                style={{ background: '#fff', color: '#4f46e5', borderColor: '#fff', fontWeight: 600 }}
                                            >
                                                Kayıt Ol
                                            </Button>
                                            <Button
                                                onClick={() => router.push('/login')}
                                                style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}
                                            >
                                                Giriş Yap
                                            </Button>
                                        </Space>
                                    </Space>
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>
        </div>
    );
}

export default function TrackPage() {
    return (
        <Suspense fallback={<div style={{ padding: 32 }}><Skeleton active paragraph={{ rows: 8 }} /></div>}>
            <TrackContent />
        </Suspense>
    );
}
