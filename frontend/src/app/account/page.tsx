'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Row, Col, Typography, Tag, Button, Space, Empty, Statistic,
    Avatar, Skeleton, message, Rate
} from 'antd';
import {
    CarOutlined, ClockCircleOutlined, EnvironmentOutlined, UserOutlined,
    StarFilled, RightOutlined, MessageOutlined, HistoryOutlined,
    PhoneOutlined, CalendarOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AccountGuard from './AccountGuard';
import AccountLayout from './AccountLayout';
import api from '@/lib/api-client';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

interface BookingItem {
    id: string;
    bookingNumber: string;
    status: string;
    paymentStatus: string;
    startDate: string;
    total: number | string;
    currency: string;
    contactName: string;
    pickedUpAt?: string | null;
    droppedOffAt?: string | null;
    metadata?: {
        pickup?: string;
        dropoff?: string;
        vehicleType?: string;
        flightNumber?: string;
        rating?: { overall: number; submittedAt: string } | null;
    };
    driver?: { id: string; fullName: string; phone?: string; avatar?: string };
}

const STATUS_INFO: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Onay Bekliyor', color: 'orange' },
    CONFIRMED: { label: 'Onaylandı', color: 'cyan' },
    ON_WAY: { label: 'Şoför Yolda', color: 'blue' },
    ARRIVED: { label: 'Şoför Geldi', color: 'geekblue' },
    PICKUP: { label: 'Alındınız', color: 'purple' },
    STARTED: { label: 'Yolculuk Başladı', color: 'purple' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'magenta' },
    COMPLETED: { label: 'Tamamlandı', color: 'green' },
    CANCELLED: { label: 'İptal', color: 'red' },
    NO_SHOW: { label: 'Gelmedi', color: 'red' },
};

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'ON_WAY', 'ARRIVED', 'PICKUP', 'STARTED', 'IN_PROGRESS'];

const fmtMoney = (amount: number | string, currency: string) => {
    const n = Number(amount || 0);
    return `${n.toFixed(2)} ${currency || 'TRY'}`;
};

const fmtDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

function ActiveTransferCard({ booking, onOpen }: { booking: BookingItem; onOpen: () => void }) {
    const status = STATUS_INFO[booking.status] || { label: booking.status, color: 'default' };
    const minutesUntil = booking.startDate
        ? Math.round((new Date(booking.startDate).getTime() - Date.now()) / 60000)
        : null;

    let countdownText = '';
    if (minutesUntil !== null) {
        if (minutesUntil > 60) countdownText = `${Math.round(minutesUntil / 60)} saat sonra`;
        else if (minutesUntil > 0) countdownText = `${minutesUntil} dakika sonra`;
        else if (minutesUntil > -60 && minutesUntil <= 0) countdownText = 'Şu anda';
        else countdownText = '';
    }

    return (
        <Card
            hoverable
            onClick={onOpen}
            style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #8b5cf6 100%)',
                color: '#fff',
                border: 'none',
                marginBottom: 16,
                cursor: 'pointer',
                boxShadow: '0 12px 32px -12px rgba(99,102,241,0.5)'
            }}
            styles={{ body: { padding: 24 } }}
        >
            <Row align="middle" gutter={[16, 16]}>
                <Col xs={24} md={16}>
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Space>
                            <Tag color="white" style={{ color: '#4338ca', fontWeight: 700, border: 'none' }}>
                                AKTİF
                            </Tag>
                            <Tag color={status.color}>{status.label}</Tag>
                            {countdownText && (
                                <Tag color="gold" icon={<ClockCircleOutlined />}>{countdownText}</Tag>
                            )}
                        </Space>
                        <Title level={4} style={{ color: '#fff', margin: 0, marginTop: 6 }}>
                            <EnvironmentOutlined /> {booking.metadata?.pickup || '—'}
                        </Title>
                        <Title level={4} style={{ color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                            <span style={{ marginLeft: 18, color: 'rgba(255,255,255,0.6)' }}>↓</span>
                        </Title>
                        <Title level={4} style={{ color: '#fff', margin: 0 }}>
                            <EnvironmentOutlined /> {booking.metadata?.dropoff || '—'}
                        </Title>
                        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                            <CalendarOutlined /> {fmtDate(booking.startDate)} • PNR: <strong>{booking.bookingNumber}</strong>
                        </Text>
                    </Space>
                </Col>
                <Col xs={24} md={8}>
                    <Card style={{ background: 'rgba(255,255,255,0.15)', border: 'none', backdropFilter: 'blur(8px)' }} styles={{ body: { padding: 16 } }}>
                        {booking.driver ? (
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>ŞÖFÖRÜNÜZ</Text>
                                <Space>
                                    <Avatar size={40} icon={<UserOutlined />} src={booking.driver.avatar} />
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 700 }}>{booking.driver.fullName}</div>
                                        {booking.driver.phone && (
                                            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                                                <PhoneOutlined /> {booking.driver.phone}
                                            </div>
                                        )}
                                    </div>
                                </Space>
                            </Space>
                        ) : (
                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Şoför ataması bekleniyor…</Text>
                        )}
                        <Button
                            type="primary"
                            ghost
                            block
                            style={{ marginTop: 12, color: '#fff', borderColor: '#fff', fontWeight: 600 }}
                            icon={<RightOutlined />}
                        >
                            Detayları Gör
                        </Button>
                    </Card>
                </Col>
            </Row>
        </Card>
    );
}

function BookingMiniCard({ booking, onOpen }: { booking: BookingItem; onOpen: () => void }) {
    const status = STATUS_INFO[booking.status] || { label: booking.status, color: 'default' };
    return (
        <Card
            hoverable
            onClick={onOpen}
            size="small"
            style={{ marginBottom: 8, cursor: 'pointer' }}
            styles={{ body: { padding: 12 } }}
        >
            <Row align="middle" gutter={8}>
                <Col flex="auto">
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space>
                            <Tag color={status.color}>{status.label}</Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>{booking.bookingNumber}</Text>
                        </Space>
                        <Text strong style={{ fontSize: 13 }}>
                            {booking.metadata?.pickup} → {booking.metadata?.dropoff}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <CalendarOutlined /> {fmtDate(booking.startDate)} • {fmtMoney(booking.total, booking.currency)}
                        </Text>
                    </Space>
                </Col>
                <Col>
                    <RightOutlined style={{ color: '#94a3b8' }} />
                </Col>
            </Row>
        </Card>
    );
}

export default function AccountDashboardPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [activeBookings, setActiveBookings] = useState<BookingItem[]>([]);
    const [pastBookings, setPastBookings] = useState<BookingItem[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const [activeRes, pastRes] = await Promise.all([
                    api.get('/api/customer/bookings?status=active'),
                    api.get('/api/customer/bookings?status=past&pageSize=5'),
                ]);
                if (activeRes.data.success) setActiveBookings(activeRes.data.data.items || []);
                if (pastRes.data.success) setPastBookings(pastRes.data.data.items || []);
            } catch (e: any) {
                message.error(e?.response?.data?.error || 'Veriler alınamadı');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const totalPast = pastBookings.length;
    const completedTrips = pastBookings.filter(b => b.status === 'COMPLETED').length;
    const ratedTrips = pastBookings.filter(b => b.metadata?.rating?.overall).length;

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>
                    <div style={{ marginBottom: 16 }}>
                        <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                            Merhaba, {user?.fullName || user?.email} 👋
                        </Title>
                        <Text type="secondary">Aktif transferleriniz ve son rezervasyonlarınızı buradan takip edin.</Text>
                    </div>

                    {/* Stats */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} md={8}>
                            <Card>
                                <Statistic
                                    title="Aktif Transfer"
                                    value={activeBookings.length}
                                    prefix={<CarOutlined style={{ color: '#4f46e5' }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} md={8}>
                            <Card>
                                <Statistic
                                    title="Tamamlanan"
                                    value={completedTrips}
                                    prefix={<HistoryOutlined style={{ color: '#10b981' }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card>
                                <Statistic
                                    title="Verilen Puan"
                                    value={ratedTrips}
                                    prefix={<StarFilled style={{ color: '#f59e0b' }} />}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Active transfers */}
                    <div style={{ marginBottom: 12 }}>
                        <Title level={5} style={{ margin: 0, color: '#0f172a' }}>Aktif Transferler</Title>
                    </div>
                    {loading ? (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    ) : activeBookings.length === 0 ? (
                        <Card>
                            <Empty description="Aktif transferiniz bulunmuyor.">
                                <Button type="primary" onClick={() => router.push('/')}>
                                    Yeni Transfer Ara
                                </Button>
                            </Empty>
                        </Card>
                    ) : (
                        activeBookings.map(b => (
                            <ActiveTransferCard
                                key={b.id}
                                booking={b}
                                onOpen={() => router.push(`/account/bookings/${b.id}`)}
                            />
                        ))
                    )}

                    {/* Recent past */}
                    <div style={{ margin: '24px 0 12px' }}>
                        <Row align="middle" justify="space-between">
                            <Col>
                                <Title level={5} style={{ margin: 0, color: '#0f172a' }}>Son Rezervasyonlar</Title>
                            </Col>
                            <Col>
                                <Button type="link" onClick={() => router.push('/account/bookings')}>
                                    Tümünü Gör <RightOutlined />
                                </Button>
                            </Col>
                        </Row>
                    </div>
                    {loading ? (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    ) : pastBookings.length === 0 ? (
                        <Card><Empty description="Geçmiş rezervasyon yok" /></Card>
                    ) : (
                        pastBookings.map(b => (
                            <BookingMiniCard
                                key={b.id}
                                booking={b}
                                onOpen={() => router.push(`/account/bookings/${b.id}`)}
                            />
                        ))
                    )}
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
