'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Row, Col, Typography, Tag, Button, Space, Skeleton,
    Avatar, Descriptions, Divider, Empty, Rate, Alert, Statistic,
    Form, Input, message,
} from 'antd';
import {
    SearchOutlined, EnvironmentOutlined, CarOutlined, UserOutlined,
    PhoneOutlined, ClockCircleOutlined,
    ReloadOutlined, AimOutlined, CheckCircleOutlined,
    ArrowRightOutlined, SafetyCertificateOutlined, StarOutlined,
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import SiteFooter from '@/app/components/SiteFooter';
import { useTheme } from '@/app/context/ThemeContext';
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

const STEP_STATUS: Record<string, number> = {
    PENDING: 0, CONFIRMED: 1, IN_PROGRESS: 2, COMPLETED: 3, CANCELLED: -1, NO_SHOW: -1,
};

function TrackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme } = useTheme();
    const [form] = Form.useForm();
    const [searching, setSearching] = useState(false);
    const [booking, setBooking] = useState<any | null>(null);
    const [verifyEmail, setVerifyEmail] = useState<string>('');
    const [verifyPhone4, setVerifyPhone4] = useState<string>('');
    const [refreshing, setRefreshing] = useState(false);
    const [driverLocation, setDriverLocation] = useState<any | null>(null);
    const [locationOnline, setLocationOnline] = useState(false);
    const [locationLastSeen, setLocationLastSeen] = useState<number | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    useEffect(() => {
        const bn = searchParams.get('bookingNumber');
        const em = searchParams.get('email');
        const ph = searchParams.get('phone4');
        if (bn) form.setFieldValue('bookingNumber', bn);
        if (em) form.setFieldValue('identifier', em);
        if (ph) form.setFieldValue('identifier', ph);
        if (bn && (em || ph)) handleSearch({ bookingNumber: bn, identifier: em || ph || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const buildParams = (bn: string, id: string) => {
        const params: Record<string, string> = { bookingNumber: bn };
        if (id.includes('@')) params.email = id;
        else params.phone4 = id.replace(/\D/g, '').slice(-4);
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
            message.error(e?.response?.data?.error || 'Rezervasyon bulunamadı');
        } finally { setSearching(false); }
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
        } catch (e: any) { setLocationError(e?.response?.data?.error || 'Konum alınamadı'); }
    }, [booking?.id, booking?.trackingAvailable, verifyEmail, verifyPhone4]);

    useEffect(() => {
        if (!booking?.trackingAvailable) return;
        fetchDriverLocation();
        const iv = setInterval(fetchDriverLocation, 15000);
        return () => clearInterval(iv);
    }, [booking?.trackingAvailable, fetchDriverLocation]);

    const status = booking ? (STATUS_INFO[booking.status] || { label: booking.status, color: 'default' }) : null;
    const stepIndex = booking ? (STEP_STATUS[booking.status] ?? 0) : -1;

    const inputStyle: React.CSSProperties = {
        height: 52, borderRadius: 12, fontSize: 15, border: '1.5px solid #e2e8f0',
        background: '#f8fafc',
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <TopBar />
            <style>{`
                .trk-card { background: #fff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(0,0,0,0.05); overflow: hidden; }
                .trk-section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${theme.sectionAccent}; margin-bottom: 6px; display: block; }
                .trk-step { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; }
                .trk-step-circle { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; transition: all 0.3s; }
                .trk-step-line { flex: 1; height: 3px; border-radius: 2px; transition: all 0.3s; }
                .trk-info-row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; border-bottom: 1px solid #f1f5f9; }
                .trk-info-row:last-child { border-bottom: none; }
                .trk-info-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .trk-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: 100px; font-size: 13px; font-weight: 700; }
            `}</style>

            {/* Hero / Search bar */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
                padding: '80px 16px 56px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${theme.sectionAccent}55, transparent)` }} />
                <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 320, height: 320, borderRadius: '50%', background: `${theme.sectionAccent}06`, pointerEvents: 'none' }} />
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <Row align="middle" gutter={[48, 40]}>
                        {/* Left: text + form */}
                        <Col xs={24} lg={14}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', padding: '5px 18px', borderRadius: 100, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
                                <SafetyCertificateOutlined /> Rezervasyon Takip
                            </div>
                            <Title level={1} style={{ color: '#fff', fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', marginBottom: 12, fontWeight: 700 }}>
                                Rezervasyonunuzu Sorgulayın
                            </Title>
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, display: 'block', marginBottom: 36, fontWeight: 300, lineHeight: 1.7 }}>
                                Rezervasyon numaranız ve e-posta / telefon bilginizle transferinizin anlık durumunu takip edin.
                            </Text>

                            {/* Search Card */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '28px 24px', backdropFilter: 'blur(20px)' }}>
                                <Form form={form} layout="vertical" onFinish={handleSearch}>
                                    <Row gutter={[12, 0]}>
                                        <Col xs={24} sm={11}>
                                            <Form.Item name="bookingNumber" label={<Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>Rezervasyon Numarası</Text>} rules={[{ required: true, message: 'Rezervasyon no girin' }]} style={{ marginBottom: 16 }}>
                                                <Input placeholder="ÖRN: TR-20260501-1234" style={inputStyle} prefix={<CheckCircleOutlined style={{ color: theme.sectionAccent }} />} allowClear />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} sm={9}>
                                            <Form.Item name="identifier" label={<Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>E-posta veya Tel. Son 4 Hane</Text>} rules={[{ required: true, message: 'E-posta / telefon girin' }]} style={{ marginBottom: 16 }} tooltip="Rezervasyon yaparken kullandığınız e-posta veya telefonun son 4 rakamı">
                                                <Input placeholder="ornek@email.com veya 4567" style={inputStyle} prefix={<UserOutlined style={{ color: '#94a3b8' }} />} allowClear />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} sm={4} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 16 }}>
                                            <Button
                                                type="primary" htmlType="submit" icon={<SearchOutlined />}
                                                loading={searching} block
                                                style={{ height: 52, borderRadius: 12, background: theme.buttonGradient, border: 'none', fontWeight: 700, fontSize: 15, boxShadow: theme.buttonShadow }}
                                            >
                                                Sorgula
                                            </Button>
                                        </Col>
                                    </Row>
                                </Form>
                            </div>
                        </Col>

                        {/* Right: hero image */}
                        <Col xs={0} lg={10} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                                <div style={{ position: 'absolute', inset: -12, borderRadius: 32, background: `linear-gradient(135deg, ${theme.sectionAccent}18, transparent)`, border: `1px solid ${theme.sectionAccent}20` }} />
                                <img
                                    src="/reservation-hero.jpg"
                                    alt="Rezervasyon Takip"
                                    style={{
                                        width: '100%',
                                        borderRadius: 24,
                                        boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
                                        display: 'block',
                                        position: 'relative',
                                        zIndex: 1,
                                        transform: 'perspective(1000px) rotateY(-4deg) rotateX(2deg)',
                                    }}
                                />
                                <div style={{ position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)', width: '70%', height: 40, background: `${theme.primaryColor}33`, filter: 'blur(20px)', borderRadius: '50%' }} />
                            </div>
                        </Col>
                    </Row>
                </div>
            </div>

            {/* Results area */}
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 16px 60px' }}>

                {searching && (
                    <div style={{ background: '#fff', borderRadius: 20, padding: 32, border: '1px solid #e2e8f0' }}>
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                )}

                {booking && !searching && (
                    <>
                        {/* Status Progress Bar */}
                        <div className="trk-card" style={{ padding: '28px 32px', marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Title level={4} style={{ margin: 0, fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
                                        #{booking.bookingNumber}
                                    </Title>
                                    <span className="trk-badge" style={{
                                        background: booking.status === 'COMPLETED' ? '#dcfce7' : booking.status === 'CANCELLED' ? '#fee2e2' : booking.status === 'IN_PROGRESS' ? '#fef3c7' : '#dbeafe',
                                        color: booking.status === 'COMPLETED' ? '#16a34a' : booking.status === 'CANCELLED' ? '#dc2626' : booking.status === 'IN_PROGRESS' ? '#d97706' : '#2563eb',
                                    }}>
                                        {status!.label}
                                    </span>
                                    {booking.minutesUntilPickup !== null && booking.minutesUntilPickup > 0 && booking.minutesUntilPickup < 600 && (
                                        <span className="trk-badge" style={{ background: '#fef3c7', color: '#b45309' }}>
                                            <ClockCircleOutlined /> {booking.minutesUntilPickup > 60 ? `${Math.round(booking.minutesUntilPickup / 60)} saat sonra` : `${booking.minutesUntilPickup} dk sonra`}
                                        </span>
                                    )}
                                </div>
                                <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh} style={{ borderRadius: 10 }}>
                                    Yenile
                                </Button>
                            </div>

                            {/* Step progress */}
                            {booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                    {['Alındı', 'Onaylandı', 'Yolda', 'Tamamlandı'].map((label, i) => (
                                        <React.Fragment key={i}>
                                            <div className="trk-step">
                                                <div className="trk-step-circle" style={{
                                                    background: i <= stepIndex ? theme.buttonGradient : '#f1f5f9',
                                                    color: i <= stepIndex ? '#fff' : '#94a3b8',
                                                    boxShadow: i === stepIndex ? `0 4px 16px ${theme.primaryColor}55` : 'none',
                                                }}>
                                                    {i < stepIndex ? '✓' : i + 1}
                                                </div>
                                                <Text style={{ fontSize: 11, fontWeight: i <= stepIndex ? 700 : 400, color: i <= stepIndex ? theme.primaryColor : '#94a3b8', whiteSpace: 'nowrap' }}>
                                                    {label}
                                                </Text>
                                            </div>
                                            {i < 3 && (
                                                <div className="trk-step-line" style={{ background: i < stepIndex ? theme.buttonGradient : '#e2e8f0' }} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Row gutter={[24, 24]}>
                            {/* Left: Trip details + map */}
                            <Col xs={24} lg={14}>
                                {/* Trip info */}
                                <div className="trk-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
                                    <span className="trk-section-label"><EnvironmentOutlined /> Yolculuk Detayları</span>
                                    <div style={{ marginTop: 16 }}>
                                        {/* Route visual */}
                                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 20 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 16, paddingTop: 4 }}>
                                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: theme.primaryColor, flexShrink: 0 }} />
                                                <div style={{ width: 2, flex: 1, background: `linear-gradient(to bottom, ${theme.primaryColor}, ${theme.sectionAccent})`, margin: '4px 0', minHeight: 36 }} />
                                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: theme.sectionAccent, flexShrink: 0 }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ marginBottom: 20 }}>
                                                    <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>NEREDEN</Text>
                                                    <Text style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{booking.metadata?.pickup || '-'}</Text>
                                                </div>
                                                <div>
                                                    <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>NEREYE</Text>
                                                    <Text style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{booking.metadata?.dropoff || '-'}</Text>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            {[
                                                { label: 'Tarih & Saat', value: fmtDate(booking.startDate), icon: <ClockCircleOutlined style={{ color: theme.primaryColor }} /> },
                                                { label: 'Yolcu', value: `${booking.adults} Yetişkin${booking.children ? `, ${booking.children} Çocuk` : ''}${booking.infants ? `, ${booking.infants} Bebek` : ''}`, icon: <UserOutlined style={{ color: theme.primaryColor }} /> },
                                                ...(booking.metadata?.flightNumber ? [{ label: 'Uçuş No', value: booking.metadata.flightNumber, icon: <ArrowRightOutlined style={{ color: theme.primaryColor }} /> }] : []),
                                                ...(booking.metadata?.vehicleType ? [{ label: 'Araç', value: booking.metadata.vehicleType, icon: <CarOutlined style={{ color: theme.primaryColor }} /> }] : []),
                                            ].map((item, i) => (
                                                <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 16px' }}>
                                                    <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>{item.label}</Text>
                                                    <Text style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{item.value}</Text>
                                                </div>
                                            ))}
                                            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 16px' }}>
                                                <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Tutar</Text>
                                                <Text style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                                                    {Number(booking.total).toFixed(2)} {booking.currency}
                                                    {' '}<span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: booking.paymentStatus === 'PAID' ? '#dcfce7' : '#fef3c7', color: booking.paymentStatus === 'PAID' ? '#16a34a' : '#d97706' }}>
                                                        {booking.paymentStatus === 'PAID' ? 'Ödendi' : 'Bekliyor'}
                                                    </span>
                                                </Text>
                                            </div>
                                        </div>

                                        {booking.specialRequests && (
                                            <div style={{ marginTop: 12, background: '#fffbeb', borderRadius: 12, padding: '12px 16px', border: '1px solid #fde68a' }}>
                                                <Text style={{ fontSize: 11, color: '#92400e', fontWeight: 600, display: 'block', marginBottom: 4 }}>ÖZEL İSTEKLER</Text>
                                                <Text style={{ fontSize: 14, color: '#78350f' }}>{booking.specialRequests}</Text>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Live tracking */}
                                <div className="trk-card" style={{ padding: '24px 28px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <span className="trk-section-label" style={{ marginBottom: 0 }}><AimOutlined /> Şoför Konumu</span>
                                        {booking.trackingAvailable && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: locationOnline ? '#16a34a' : '#94a3b8' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: locationOnline ? '#16a34a' : '#d1d5db', display: 'inline-block', ...(locationOnline ? { boxShadow: '0 0 0 3px #dcfce7' } : {}) }} />
                                                {locationOnline ? 'Canlı' : 'Bekleniyor'}
                                            </span>
                                        )}
                                    </div>
                                    {!booking.driver ? (
                                        <Empty description="Henüz şoför atanmamış" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    ) : !booking.trackingAvailable ? (
                                        <Alert type="info" showIcon icon={<ClockCircleOutlined />}
                                            message="Canlı takip yakında aktif olacak"
                                            description={booking.minutesUntilPickup !== null && booking.minutesUntilPickup > 0
                                                ? `Şoför konumu transfer saatine 30 dakika kala paylaşılacaktır. Transferinize ${booking.minutesUntilPickup > 60 ? Math.round(booking.minutesUntilPickup / 60) + ' saat' : booking.minutesUntilPickup + ' dakika'} var.`
                                                : 'Bu transfer için canlı takip aktif değil.'
                                            }
                                            style={{ borderRadius: 12 }}
                                        />
                                    ) : driverLocation ? (
                                        <div>
                                            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                                <div style={{ flex: 1, minWidth: 100, background: '#f8fafc', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                                                    <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block' }}>Hız</Text>
                                                    <Text style={{ fontSize: 22, fontWeight: 800, color: theme.primaryColor }}>{driverLocation.speed ? Math.round(driverLocation.speed * 3.6) : 0}</Text>
                                                    <Text style={{ fontSize: 11, color: '#94a3b8' }}> km/sa</Text>
                                                </div>
                                                {locationLastSeen && (
                                                    <div style={{ flex: 1, minWidth: 100, background: '#f8fafc', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                                                        <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block' }}>Son Güncelleme</Text>
                                                        <Text style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{new Date(locationLastSeen).toLocaleTimeString('tr-TR')}</Text>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                                                <Button type="primary" icon={<EnvironmentOutlined />} href={`https://www.google.com/maps?q=${driverLocation.lat},${driverLocation.lng}`} target="_blank" style={{ background: theme.buttonGradient, border: 'none', borderRadius: 10, fontWeight: 600 }}>
                                                    Haritada Aç
                                                </Button>
                                                {booking.metadata?.pickupCoordinates && (
                                                    <Button icon={<ArrowRightOutlined />} href={`https://www.google.com/maps/dir/${driverLocation.lat},${driverLocation.lng}/${booking.metadata.pickupCoordinates.lat},${booking.metadata.pickupCoordinates.lng}`} target="_blank" style={{ borderRadius: 10, fontWeight: 600 }}>
                                                        Rotayı Gör
                                                    </Button>
                                                )}
                                            </div>
                                            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                                <iframe title="Şoför Konumu" width="100%" height="280" frameBorder="0" style={{ display: 'block' }}
                                                    src={`https://maps.google.com/maps?q=${driverLocation.lat},${driverLocation.lng}&z=15&output=embed`}
                                                />
                                            </div>
                                        </div>
                                    ) : locationError ? (
                                        <Alert type="warning" message={locationError} showIcon style={{ borderRadius: 12 }} />
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                            <Text type="secondary">Şoförün konumu bekleniyor…</Text>
                                        </div>
                                    )}
                                </div>
                            </Col>

                            {/* Right: Driver + actions */}
                            <Col xs={24} lg={10}>
                                {/* Driver card */}
                                <div className="trk-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
                                    <span className="trk-section-label"><CarOutlined /> Şoför & Araç</span>
                                    {!booking.driver ? (
                                        <Empty description="Henüz şoför atanmamış" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 16 }} />
                                    ) : (
                                        <div style={{ marginTop: 16 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                                <Avatar size={72} icon={<UserOutlined />} src={booking.driver.avatar}
                                                    style={{ background: theme.buttonGradient, flexShrink: 0, fontSize: 28, boxShadow: `0 8px 24px ${theme.primaryColor}33` }}
                                                />
                                                <div>
                                                    <Title level={5} style={{ margin: 0, fontSize: 17 }}>{booking.driver.fullName}</Title>
                                                    {booking.driver.rating !== null && booking.driver.rating !== undefined && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                            <Rate disabled allowHalf value={booking.driver.rating} style={{ fontSize: 12 }} />
                                                            <Text style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>
                                                                {Number(booking.driver.rating).toFixed(1)}
                                                            </Text>
                                                            {booking.driver.ratingCount ? <Text type="secondary" style={{ fontSize: 11 }}>({booking.driver.ratingCount})</Text> : null}
                                                        </div>
                                                    )}
                                                    {booking.driver.phone && (
                                                        <Button type="link" size="small" icon={<PhoneOutlined />} href={`tel:${booking.driver.phone}`}
                                                            style={{ padding: 0, marginTop: 4, fontWeight: 600, color: theme.primaryColor }}>
                                                            {booking.driver.phone}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            {(booking.driver.vehiclePlate || booking.driver.vehicleType) && (
                                                <>
                                                    <div style={{ height: 1, background: '#f1f5f9', marginBottom: 16 }} />
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                        {booking.driver.vehiclePlate && (
                                                            <div style={{ gridColumn: '1/-1', background: `${theme.primaryColor}10`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <Text style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>PLAKA</Text>
                                                                <Text style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', letterSpacing: 2, fontFamily: 'monospace' }}>{booking.driver.vehiclePlate}</Text>
                                                            </div>
                                                        )}
                                                        {[
                                                            { label: 'Araç Tipi', value: booking.driver.vehicleType },
                                                            { label: 'Model', value: booking.driver.vehicleModel },
                                                            { label: 'Renk', value: booking.driver.vehicleColor },
                                                        ].filter(x => x.value).map((item, i) => (
                                                            <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                                                                <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</Text>
                                                                <Text style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{item.value}</Text>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Rating */}
                                {booking.status === 'COMPLETED' && booking.metadata?.ratingToken && !booking.metadata?.rating && (
                                    <div className="trk-card" style={{ padding: '24px 28px', marginBottom: 24, background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fde68a' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <StarOutlined style={{ fontSize: 20, color: '#f59e0b' }} />
                                            <Text strong style={{ fontSize: 15 }}>Yolculuğunuzu Değerlendirin</Text>
                                        </div>
                                        <Text style={{ color: '#92400e', fontSize: 13, display: 'block', marginBottom: 16 }}>
                                            Deneyiminizi paylaşarak diğer yolcuların doğru tercih yapmasına yardımcı olun.
                                        </Text>
                                        <Button type="primary" href={`/rate/${booking.metadata.ratingToken}`} target="_blank"
                                            style={{ background: '#f59e0b', border: 'none', fontWeight: 700, borderRadius: 10, height: 44 }}>
                                            Şimdi Puanla <ArrowRightOutlined />
                                        </Button>
                                    </div>
                                )}
                                {booking.metadata?.rating && (
                                    <div className="trk-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
                                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Verdiğiniz Puan</Text>
                                        <Space>
                                            <Rate disabled allowHalf value={booking.metadata.rating.overall} />
                                            <Text strong style={{ color: '#f59e0b', fontSize: 18 }}>{Number(booking.metadata.rating.overall).toFixed(1)}</Text>
                                        </Space>
                                    </div>
                                )}

                                {/* CTA: register */}
                                <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 20, padding: '28px 24px', border: `1px solid ${theme.sectionAccent}22`, position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: `${theme.sectionAccent}08` }} />
                                    <SafetyCertificateOutlined style={{ fontSize: 28, color: theme.sectionAccent, marginBottom: 12, display: 'block' }} />
                                    <Text strong style={{ color: '#fff', fontSize: 16, display: 'block', marginBottom: 8, fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
                                        Tüm transferlerinizi yönetin
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, display: 'block', marginBottom: 20, lineHeight: 1.7 }}>
                                        Üye olun; tüm rezervasyonlarınızı, şoför takibini ve geçmişinizi kolayca görün.
                                    </Text>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <Button onClick={() => router.push('/register')}
                                            style={{ flex: 1, height: 42, borderRadius: 10, background: theme.buttonGradient, border: 'none', color: '#fff', fontWeight: 700 }}>
                                            Üye Ol
                                        </Button>
                                        <Button onClick={() => router.push('/login')}
                                            style={{ flex: 1, height: 42, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600 }}>
                                            Giriş Yap
                                        </Button>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    </>
                )}

                {/* Empty state: how it works info */}
                {!booking && !searching && (
                    <div style={{ marginTop: 16 }}>
                        <Row gutter={[20, 20]}>
                            {[
                                { icon: '🔍', title: 'Hızlı Sorgulama', desc: 'Rezervasyon numaranız ve e-posta / telefon son 4 hanenizle saniyeler içinde bilgi alın.' },
                                { icon: '📍', title: 'Canlı Takip', desc: 'Transfer saatine 30 dakika kala şoförünüzün konumunu haritada gerçek zamanlı görün.' },
                                { icon: '🚘', title: 'Şoför Bilgisi', desc: 'Sizi karşılayacak şoförün adını, aracını ve plakasını önceden öğrenin.' },
                            ].map((item, i) => (
                                <Col xs={24} sm={8} key={i}>
                                    <div className="trk-card" style={{ padding: '28px 24px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 36, marginBottom: 16 }}>{item.icon}</div>
                                        <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8, fontFamily: 'var(--font-playfair, Georgia, serif)', color: '#0f172a' }}>{item.title}</Text>
                                        <Text style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{item.desc}</Text>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </div>
                )}
            </div>

            <SiteFooter />
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
