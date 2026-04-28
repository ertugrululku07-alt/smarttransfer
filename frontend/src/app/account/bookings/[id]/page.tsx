'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Card, Row, Col, Typography, Tag, Button, Space, Skeleton, message,
    Avatar, Descriptions, Divider, Input, Empty, Rate, Alert, Statistic
} from 'antd';
import {
    ArrowLeftOutlined, EnvironmentOutlined, CarOutlined, UserOutlined,
    PhoneOutlined, SendOutlined, MessageOutlined, ClockCircleOutlined,
    StarFilled, FileTextOutlined, ReloadOutlined, AimOutlined
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import AccountGuard from '../../AccountGuard';
import AccountLayout from '../../AccountLayout';
import api from '@/lib/api-client';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';

const { Title, Text, Paragraph } = Typography;

const STATUS_INFO: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Onay Bekliyor', color: 'orange' },
    CONFIRMED: { label: 'Onaylandı', color: 'cyan' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'magenta' },
    COMPLETED: { label: 'Tamamlandı', color: 'green' },
    CANCELLED: { label: 'İptal', color: 'red' },
    NO_SHOW: { label: 'Gelmedi', color: 'red' },
};

interface Driver {
    id: string;
    fullName: string;
    phone?: string;
    avatar?: string;
    vehicleType?: string | null;
    vehiclePlate?: string | null;
    vehicleColor?: string | null;
    vehicleModel?: string | null;
    rating?: number | null;
    ratingCount?: number;
}

interface BookingDetail {
    id: string;
    bookingNumber: string;
    status: string;
    paymentStatus: string;
    startDate: string;
    total: number;
    currency: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    adults: number;
    children: number;
    infants: number;
    pickedUpAt?: string | null;
    droppedOffAt?: string | null;
    specialRequests?: string | null;
    metadata: {
        pickup?: string;
        dropoff?: string;
        pickupCoordinates?: { lat: number; lng: number };
        dropoffCoordinates?: { lat: number; lng: number };
        vehicleType?: string;
        flightNumber?: string;
        paymentMethod?: string;
        rating?: { overall: number; submittedAt: string } | null;
        ratingToken?: string;
    };
    driver: Driver | null;
    minutesUntilPickup: number | null;
    trackingAvailable: boolean;
}

interface DriverLocation {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
}

interface ChatMessage {
    id: string;
    senderId: string;
    receiverId: string;
    content: string;
    format?: string;
    createdAt: string;
    bookingId?: string;
    sender?: { id: string; firstName?: string; lastName?: string };
}

const fmtDate = (iso?: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

export default function BookingDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = params.id;
    const { user } = useAuth();
    const { socket } = useSocket();

    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
    const [locationOnline, setLocationOnline] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [locationLastSeen, setLocationLastSeen] = useState<number | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    // ─── Fetch booking ──
    const fetchBooking = useCallback(async () => {
        try {
            const res = await api.get(`/api/customer/bookings/${id}`);
            if (res.data.success) setBooking(res.data.data);
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Detay alınamadı');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) fetchBooking();
    }, [id, fetchBooking]);

    // ─── Fetch driver location periodically when allowed ──
    const fetchDriverLocation = useCallback(async () => {
        if (!id || !booking?.trackingAvailable) return;
        try {
            const res = await api.get(`/api/customer/bookings/${id}/driver-location`);
            if (res.data.success) {
                setDriverLocation(res.data.data.location);
                setLocationOnline(res.data.data.online);
                setLocationLastSeen(res.data.data.lastSeen);
                setLocationError(null);
            }
        } catch (e: any) {
            setLocationError(e?.response?.data?.error || 'Konum alınamadı');
        }
    }, [id, booking?.trackingAvailable]);

    useEffect(() => {
        if (!booking?.trackingAvailable) return;
        fetchDriverLocation();
        const interval = setInterval(fetchDriverLocation, 15000);
        return () => clearInterval(interval);
    }, [booking?.trackingAvailable, fetchDriverLocation]);

    // ─── Subscribe to live driver_location socket events ──
    useEffect(() => {
        if (!socket || !booking?.driver?.id) return;
        const handler = (data: any) => {
            if (data.driverId !== booking.driver?.id) return;
            setDriverLocation({
                lat: data.lat, lng: data.lng,
                speed: data.speed, heading: data.heading
            });
            setLocationOnline(true);
            setLocationLastSeen(Date.now());
        };
        socket.on('driver_location', handler);
        return () => { socket.off('driver_location', handler); };
    }, [socket, booking?.driver?.id]);

    // ─── Fetch chat messages ──
    const fetchMessages = useCallback(async () => {
        if (!booking?.driver?.id) return;
        try {
            const res = await api.get(`/api/messages?contactId=${booking.driver.id}&bookingId=${booking.id}`);
            if (res.data.success) setMessages(res.data.data || []);
        } catch { /* silent */ }
    }, [booking?.driver?.id, booking?.id]);

    useEffect(() => {
        if (booking?.driver?.id) fetchMessages();
    }, [booking?.driver?.id, fetchMessages]);

    // ─── Subscribe to new chat messages ──
    useEffect(() => {
        if (!socket || !user) return;
        const handler = (msg: ChatMessage) => {
            if (msg.bookingId === booking?.id || msg.senderId === booking?.driver?.id) {
                setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
            }
        };
        socket.on('new_message', handler);
        return () => { socket.off('new_message', handler); };
    }, [socket, user, booking?.id, booking?.driver?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        const content = chatInput.trim();
        if (!content || !booking?.driver?.id) return;
        setSending(true);
        try {
            const res = await api.post('/api/messages', {
                receiverId: booking.driver.id,
                bookingId: booking.id,
                content,
                format: 'TEXT'
            });
            if (res.data.success) {
                setMessages(prev => [...prev, res.data.data]);
                setChatInput('');
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Gönderilemedi');
        } finally {
            setSending(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchBooking();
    };

    if (loading) {
        return (
            <AccountGuard>
                <AccountLayout>
                    <div style={{ padding: 16 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
                </AccountLayout>
            </AccountGuard>
        );
    }

    if (!booking) {
        return (
            <AccountGuard>
                <AccountLayout>
                    <div style={{ padding: 24 }}><Empty description="Rezervasyon bulunamadı" /></div>
                </AccountLayout>
            </AccountGuard>
        );
    }

    const status = STATUS_INFO[booking.status] || { label: booking.status, color: 'default' };

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>
                    {/* Header */}
                    <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
                        <Col>
                            <Space>
                                <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>Geri</Button>
                                <Title level={4} style={{ margin: 0 }}>Rezervasyon #{booking.bookingNumber}</Title>
                            </Space>
                        </Col>
                        <Col>
                            <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>Yenile</Button>
                        </Col>
                    </Row>

                    {/* Status banner */}
                    <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
                        <Row align="middle" gutter={[16, 12]}>
                            <Col flex="auto">
                                <Space size="middle" wrap>
                                    <Tag color={status.color} style={{ fontSize: 14, padding: '4px 14px', fontWeight: 700 }}>
                                        {status.label}
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
                        </Row>
                    </Card>

                    <Row gutter={[16, 16]}>
                        {/* Left: Trip info */}
                        <Col xs={24} lg={14}>
                            <Card title={<><EnvironmentOutlined /> Yolculuk Bilgileri</>} style={{ marginBottom: 16 }}>
                                <Descriptions column={1} size="small" colon>
                                    <Descriptions.Item label="Alış">{booking.metadata.pickup || '-'}</Descriptions.Item>
                                    <Descriptions.Item label="Varış">{booking.metadata.dropoff || '-'}</Descriptions.Item>
                                    <Descriptions.Item label="Tarih / Saat">{fmtDate(booking.startDate)}</Descriptions.Item>
                                    <Descriptions.Item label="Yolcu Sayısı">
                                        {booking.adults} Yetişkin
                                        {booking.children ? `, ${booking.children} Çocuk` : ''}
                                        {booking.infants ? `, ${booking.infants} Bebek` : ''}
                                    </Descriptions.Item>
                                    {booking.metadata.flightNumber && (
                                        <Descriptions.Item label="Uçuş No">{booking.metadata.flightNumber}</Descriptions.Item>
                                    )}
                                    {booking.metadata.vehicleType && (
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
                                style={{ marginBottom: 16 }}
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
                                            <Statistic
                                                title="Mevcut Hız"
                                                value={driverLocation.speed ? Math.round(driverLocation.speed * 3.6) : 0}
                                                suffix="km/sa"
                                            />
                                            <Text type="secondary">
                                                Konum: {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
                                            </Text>
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
                                                >
                                                    Haritada Göster
                                                </Button>
                                                {booking.metadata.pickupCoordinates && (
                                                    <Button
                                                        icon={<EnvironmentOutlined />}
                                                        href={`https://www.google.com/maps/dir/${driverLocation.lat},${driverLocation.lng}/${booking.metadata.pickupCoordinates.lat},${booking.metadata.pickupCoordinates.lng}`}
                                                        target="_blank"
                                                    >
                                                        Yola Bak
                                                    </Button>
                                                )}
                                            </Space>
                                        </Space>
                                        {/* Embedded simple map preview using Google Maps Embed */}
                                        <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                                            <iframe
                                                title="Şoför Konumu"
                                                width="100%"
                                                height="280"
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

                        {/* Right: Driver + Chat */}
                        <Col xs={24} lg={10}>
                            <Card title={<><CarOutlined /> Şoför & Araç</>} style={{ marginBottom: 16 }}>
                                {!booking.driver ? (
                                    <Empty description="Henüz şoför atanmamış" />
                                ) : (
                                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                        <Space size="middle">
                                            <Avatar size={64} icon={<UserOutlined />} src={booking.driver.avatar} />
                                            <div>
                                                <Title level={5} style={{ margin: 0 }}>{booking.driver.fullName}</Title>
                                                {booking.driver.rating !== null && booking.driver.rating !== undefined && (
                                                    <Space size={4}>
                                                        <Rate disabled allowHalf value={booking.driver.rating} style={{ fontSize: 12 }} />
                                                        <Text style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                                                            {booking.driver.rating.toFixed(1)}
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
                                                            type="link"
                                                            size="small"
                                                            icon={<PhoneOutlined />}
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

                            {/* Chat */}
                            {booking.driver && (
                                <Card title={<><MessageOutlined /> Şoför ile Mesajlaşma</>}>
                                    <div
                                        style={{
                                            background: '#f8fafc',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: 8,
                                            padding: 8,
                                            height: 320,
                                            overflowY: 'auto',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 6,
                                        }}
                                    >
                                        {messages.length === 0 ? (
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>Henüz mesaj yok</Text>
                                            </div>
                                        ) : (
                                            messages.map(m => {
                                                const fromMe = m.senderId === user?.id;
                                                return (
                                                    <div
                                                        key={m.id}
                                                        style={{
                                                            alignSelf: fromMe ? 'flex-end' : 'flex-start',
                                                            background: fromMe ? '#4f46e5' : '#fff',
                                                            color: fromMe ? '#fff' : '#0f172a',
                                                            padding: '8px 12px',
                                                            borderRadius: 12,
                                                            maxWidth: '78%',
                                                            border: fromMe ? 'none' : '1px solid #e5e7eb',
                                                            fontSize: 13,
                                                            lineHeight: 1.4,
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        <div>{m.content}</div>
                                                        <div style={{
                                                            fontSize: 10, opacity: 0.7, textAlign: 'right',
                                                            marginTop: 2
                                                        }}>
                                                            {new Date(m.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>
                                    <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                                        <Input
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            placeholder="Mesajınızı yazın…"
                                            onPressEnter={sendMessage}
                                            disabled={sending}
                                        />
                                        <Button
                                            type="primary"
                                            icon={<SendOutlined />}
                                            onClick={sendMessage}
                                            loading={sending}
                                            disabled={!chatInput.trim()}
                                        >Gönder</Button>
                                    </Space.Compact>
                                </Card>
                            )}

                            {/* Rating prompt for completed trips */}
                            {booking.status === 'COMPLETED' && booking.metadata.ratingToken && !booking.metadata.rating && (
                                <Card style={{ marginTop: 16 }}>
                                    <Space direction="vertical" style={{ width: '100%' }} align="center">
                                        <StarFilled style={{ fontSize: 32, color: '#f59e0b' }} />
                                        <Text strong>Yolculuğunuzu değerlendirmek ister misiniz?</Text>
                                        <Button
                                            type="primary"
                                            href={`/rate/${booking.metadata.ratingToken}`}
                                            target="_blank"
                                        >
                                            Puanla
                                        </Button>
                                    </Space>
                                </Card>
                            )}

                            {booking.metadata.rating && (
                                <Card style={{ marginTop: 16 }}>
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                        <Text strong><FileTextOutlined /> Verdiğiniz Puan</Text>
                                        <Space>
                                            <Rate disabled allowHalf value={booking.metadata.rating.overall} />
                                            <Text strong style={{ color: '#f59e0b' }}>
                                                {booking.metadata.rating.overall.toFixed(1)}
                                            </Text>
                                        </Space>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {fmtDate(booking.metadata.rating.submittedAt)}
                                        </Text>
                                    </Space>
                                </Card>
                            )}
                        </Col>
                    </Row>
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
