'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '../../PartnerLayout';
import PartnerGuard from '../../PartnerGuard';
import {
    ClockCircleOutlined,
    EnvironmentOutlined,
    CarOutlined,
    UserOutlined,
    PhoneOutlined,
    CalendarOutlined,
    ArrowLeftOutlined,
    MailOutlined,
    RocketOutlined,
    WhatsAppOutlined,
    MessageOutlined
} from '@ant-design/icons';
import { Button, message, Tag, Spin, Card, Row, Col, Typography, Divider, Alert, Dropdown } from 'antd';
import BookingMap from '@/app/components/BookingMap'; // Use existing map component
import FlightTracker from '@/components/FlightTracker';

const { Title, Text } = Typography;

// FlightTracker Component moved to @/components/FlightTracker

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params); // Next.js 15+ Params are Promises
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [stats, setStats] = useState({ dist: '', duration: '' });

    // Initialize stats from booking when loaded
    useEffect(() => {
        if (booking) {
            setStats({
                dist: booking.dropoff.dist,
                duration: booking.dropoff.duration
            });
        }
    }, [booking]);

    // Handler for map calculation
    const handleDistanceCalculated = (dist: string, duration: string) => {
        // Only update if current values are empty, zero, or defaults
        if (!stats.dist || stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok' ||
            !stats.duration || stats.duration === '0 dk' || stats.duration === 'Süre Yok') {
            setStats({ dist, duration });
        }
    };

    // Fetch Booking Details
    useEffect(() => {
        const fetchBooking = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    router.push('/login');
                    return;
                }

                const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/bookings/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const resData = await response.json();
                    if (resData.success) {
                        setBooking(resData.data);
                    } else {
                        message.error('Rezervasyon detayları alınamadı: ' + resData.error);
                    }
                } else {
                    message.error('Sunucu hatası');
                }
            } catch (error) {
                console.error('Fetch error:', error);
                message.error('Bağlantı hatası');
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchBooking();
        }
    }, [id, router]);

    // Handle Actions (Accept/Reject/Finish)
    const handleAction = async (status: 'CONFIRMED' | 'REJECTED' | 'COMPLETED') => {
        if (!booking) return;

        setActionLoading(status);
        try {
            const token = localStorage.getItem('token');
            const body = status === 'COMPLETED'
                ? { status: 'COMPLETED', subStatus: 'COMPLETED' }
                : {
                    status: status === 'CONFIRMED' ? 'CONFIRMED' : 'CANCELLED',
                    subStatus: status === 'CONFIRMED' ? 'PARTNER_ACCEPTED' : 'PARTNER_REJECTED'
                };

            const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/bookings/${booking.id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            const resData = await response.json();
            if (resData.success) {
                if (status === 'COMPLETED') {
                    message.success('Transfer başarıyla tamamlandı!');
                } else {
                    message.success(status === 'CONFIRMED' ? 'Rezervasyon kabul edildi' : 'Rezervasyon reddedildi');
                }
                router.push('/partner'); // Go back to list
            } else {
                message.error('İşlem başarısız: ' + resData.error);
            }
        } catch (error) {
            console.error('Action error:', error);
            message.error('Bir hata oluştu');
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" />
                <div>Yükleniyor...</div>
            </div>
        );
    }

    if (!booking) {
        return (
            <PartnerGuard>
                <PartnerLayout>
                    <div style={{ textAlign: 'center', padding: '50px' }}>
                        <Title level={4}>Rezervasyon Bulunamadı</Title>
                        <Button onClick={() => router.push('/partner')}>Geri Dön</Button>
                    </div>
                </PartnerLayout>
            </PartnerGuard>
        );
    }

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => router.push('/partner')}
                            type="text"
                        />
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Rezervasyon Detayı</Title>
                            <Text type="secondary">#{booking.bookingNumber}</Text>
                        </div>
                        <div style={{ marginLeft: 'auto' }}>
                            <Tag color={booking.status === 'CONFIRMED' ? 'green' : (booking.status === 'CANCELLED' ? 'red' : 'gold')}>
                                {booking.status === 'CONFIRMED' ? 'ONAYLI' : (booking.status === 'CANCELLED' ? 'İPTAL' : 'BEKLİYOR')}
                            </Tag>
                        </div>
                    </div>

                    <Row gutter={[24, 24]}>

                        {/* LEFT COLUMN: Main Info */}
                        <Col xs={24} lg={16}>





                            {/* Map Card */}
                            <Card style={{ marginBottom: '24px', overflow: 'hidden', padding: 0 }} styles={{ body: { padding: 0 } }}>
                                {/* Only show map if loading is false */}
                                <BookingMap
                                    pickup={booking.pickup.location}
                                    dropoff={booking.dropoff.location}
                                    onDistanceCalculated={handleDistanceCalculated}
                                />
                                <div style={{ padding: '16px', background: '#f9f9f9', borderTop: '1px solid #f0f0f0' }}>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>MESAFE</div>
                                            <div style={{ fontSize: '16px', fontWeight: 600 }}>{stats.dist || 'Hesaplanıyor...'}</div>
                                        </Col>
                                        <Col span={12}>
                                            <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>TAHMİNİ SÜRE</div>
                                            <div style={{ fontSize: '16px', fontWeight: 600 }}>{stats.duration || 'Hesaplanıyor...'}</div>
                                        </Col>
                                    </Row>
                                </div>
                            </Card>

                            {/* Route Details */}
                            <Card title="Transfer Bilgileri" style={{ marginBottom: '24px' }}>
                                <div className="route-timeline" style={{ position: 'relative', paddingLeft: '20px' }}>
                                    {/* Vertical Line */}
                                    <div style={{
                                        position: 'absolute', left: '7px', top: '10px', bottom: '10px',
                                        width: '2px', background: '#e5e7eb', zIndex: 0
                                    }} />

                                    {/* Pickup */}
                                    <div style={{ marginBottom: '32px', position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                                            <div style={{
                                                width: '16px', height: '16px', borderRadius: '50%', background: '#10B981',
                                                border: '3px solid #fff', boxShadow: '0 0 0 2px #10B981', flexShrink: 0, marginTop: '4px'
                                            }} />
                                            <div>
                                                <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>ALIŞ NOKTASI</div>
                                                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>{booking.pickup.location}</div>
                                                <div style={{ display: 'flex', gap: '12px', fontSize: '14px', color: '#666' }}>
                                                    <span><CalendarOutlined /> {booking.pickup.time}</span>
                                                </div>
                                                {booking.flightNumber && (
                                                    <FlightTracker
                                                        flightNumber={booking.flightNumber}
                                                        arrivalDate={booking.pickup.timeDate || booking.pickupDateTime}
                                                    />
                                                )}
                                                {booking.pickup.note && (
                                                    <div style={{ marginTop: '8px', fontStyle: 'italic', color: '#666' }}>
                                                        Not: "{booking.pickup.note}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dropoff */}
                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                                            <div style={{
                                                width: '16px', height: '16px', borderRadius: '50%', background: '#EF4444',
                                                border: '3px solid #fff', boxShadow: '0 0 0 2px #EF4444', flexShrink: 0, marginTop: '4px'
                                            }} />
                                            <div>
                                                <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>VARIŞ NOKTASI</div>
                                                <div style={{ fontSize: '16px', fontWeight: 500 }}>{booking.dropoff.location}</div>
                                                <div style={{ marginTop: '4px', fontSize: '13px', color: '#666' }}>
                                                    Varış bilgisi trafiğe göre değişebilir.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                        </Col>

                        {/* RIGHT COLUMN: Customer & Payment */}
                        <Col xs={24} lg={8}>

                            {/* Customer Card */}
                            <Card style={{ marginBottom: '24px' }}>
                                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                                    <div style={{
                                        width: '80px', height: '80px', borderRadius: '50%', background: '#f0f2f5',
                                        margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '24px', fontWeight: 600, color: '#667eea'
                                    }}>
                                        {booking.customer.avatar}
                                    </div>
                                    <Title level={5} style={{ margin: 0 }}>{booking.customer.name}</Title>
                                    <Text type="secondary">Müşteri</Text>
                                </div>
                                <Divider />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <Dropdown
                                        menu={{
                                            items: [
                                                {
                                                    key: 'call',
                                                    label: (
                                                        <a href={`tel:${booking.customer.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit' }}>
                                                            <PhoneOutlined /> Ara
                                                        </a>
                                                    )
                                                },
                                                {
                                                    key: 'sms',
                                                    label: (
                                                        <a href={`sms:${booking.customer.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit' }}>
                                                            <MessageOutlined /> SMS Gönder
                                                        </a>
                                                    )
                                                },
                                                {
                                                    key: 'whatsapp',
                                                    label: (
                                                        <a
                                                            href={`https://wa.me/${booking.customer.phone.replace(/[^0-9]/g, '')}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit' }}
                                                        >
                                                            <WhatsAppOutlined /> WhatsApp
                                                        </a>
                                                    )
                                                }
                                            ]
                                        }}
                                        trigger={['click']}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '8px', borderRadius: '6px', transition: 'background 0.2s', background: '#f9f9f9' }} className="hover:bg-gray-100">
                                            <PhoneOutlined style={{ color: '#667eea' }} />
                                            <Text strong style={{ color: '#1890ff' }}>{booking.customer.phone} (İletişim İçin Tıkla)</Text>
                                        </div>
                                    </Dropdown>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px' }}>
                                        <MailOutlined style={{ color: '#667eea' }} />
                                        <Text>{booking.customer.email || 'E-posta yok'}</Text>
                                    </div>
                                </div>
                            </Card>

                            {/* Payment Card */}
                            <Card title="Ödeme Bilgisi" style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <Text>Araç Tipi</Text>
                                    <Text strong>{booking.vehicle.type}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <Text>Yolcu Sayısı</Text>
                                    <Text strong>{booking.vehicle.pax} Kişi</Text>
                                </div>
                                <Divider style={{ margin: '12px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontSize: '16px' }}>Toplam Tutar</Text>
                                    <Text style={{ fontSize: '24px', fontWeight: 700, color: '#10B981' }}>
                                        {booking.price.amount} {booking.price.currency}
                                    </Text>
                                </div>
                            </Card>

                            {/* Actions */}
                            <Card>
                                {booking.status === 'COMPLETED' ? (
                                    <Button
                                        block
                                        style={{ height: '45px', fontSize: '16px' }}
                                        onClick={() => router.push('/partner')}
                                    >
                                        Geri
                                    </Button>
                                ) : ((booking.status === 'CONFIRMED' && (booking.operationalStatus === 'IN_OPERATION' || booking.operationalStatus === 'PARTNER_ACCEPTED')) || booking.status === 'ACCEPTED') ? (
                                    <Button
                                        type="primary"
                                        block
                                        style={{ height: '50px', fontSize: '16px', background: '#10B981', borderColor: '#10B981' }}
                                        loading={actionLoading === 'COMPLETED'}
                                        onClick={() => handleAction('COMPLETED')}
                                        icon={<RocketOutlined />}
                                    >
                                        Transferi Bitir
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            type="primary"
                                            block
                                            style={{ height: '45px', fontSize: '16px', background: '#10B981', marginBottom: '12px' }}
                                            loading={actionLoading === 'CONFIRMED'}
                                            onClick={() => handleAction('CONFIRMED')}
                                        >
                                            Kabul Et
                                        </Button>
                                        <Button
                                            block
                                            style={{ height: '45px', fontSize: '16px' }}
                                            onClick={() => router.push('/partner')}
                                        >
                                            Geri
                                        </Button>
                                    </>
                                )}
                            </Card>

                        </Col>
                    </Row>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
