'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '../../PartnerLayout';
import PartnerGuard from '../../PartnerGuard';
import {
    CarOutlined,
    UserOutlined,
    PhoneOutlined,
    CalendarOutlined,
    ArrowLeftOutlined,
    MailOutlined,
    RocketOutlined,
    WhatsAppOutlined,
    MessageOutlined,
    TeamOutlined
} from '@ant-design/icons';
import { message, Spin, Row, Col, Dropdown } from 'antd';
import BookingMap from '@/app/components/BookingMap';
import FlightTracker from '@/components/FlightTracker';

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [stats, setStats] = useState({ dist: '', duration: '' });

    useEffect(() => {
        if (booking) setStats({ dist: booking.dropoff.dist, duration: booking.dropoff.duration });
    }, [booking]);

    const handleDistanceCalculated = (dist: string, duration: string) => {
        if (!stats.dist || stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok') setStats({ dist, duration });
    };

    useEffect(() => {
        const fetchBooking = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) { router.push('/login'); return; }
                const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/bookings/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const resData = await response.json();
                    if (resData.success) setBooking(resData.data);
                    else message.error('Detaylar alınamadı: ' + resData.error);
                } else message.error('Sunucu hatası');
            } catch (error) { console.error('Fetch error:', error); message.error('Bağlantı hatası'); }
            finally { setLoading(false); }
        };
        if (id) fetchBooking();
    }, [id, router]);

    const handleAction = async (status: 'CONFIRMED' | 'REJECTED' | 'COMPLETED') => {
        if (!booking) return;
        setActionLoading(status);
        try {
            const token = localStorage.getItem('token');
            const body = status === 'COMPLETED'
                ? { status: 'COMPLETED', subStatus: 'COMPLETED' }
                : { status: status === 'CONFIRMED' ? 'CONFIRMED' : 'CANCELLED', subStatus: status === 'CONFIRMED' ? 'PARTNER_ACCEPTED' : 'PARTNER_REJECTED' };
            const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/bookings/${booking.id}/status`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const resData = await response.json();
            if (resData.success) {
                message.success(status === 'COMPLETED' ? 'Transfer tamamlandı!' : (status === 'CONFIRMED' ? 'Kabul edildi' : 'Reddedildi'));
                router.push('/partner');
            } else message.error('İşlem başarısız: ' + resData.error);
        } catch (error) { console.error('Action error:', error); message.error('Bir hata oluştu'); }
        finally { setActionLoading(null); }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" /><span style={{ color: '#94a3b8' }}>Yükleniyor...</span>
            </div>
        );
    }

    if (!booking) {
        return (
            <PartnerGuard><PartnerLayout>
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <h3 style={{ color: '#475569', fontWeight: 600 }}>Rezervasyon Bulunamadı</h3>
                    <button onClick={() => router.push('/partner')} style={{
                        padding: '10px 24px', border: 'none', borderRadius: 12,
                        background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12,
                    }}>Geri Dön</button>
                </div>
            </PartnerLayout></PartnerGuard>
        );
    }

    const statusBg = booking.status === 'CONFIRMED' ? '#d1fae5' : booking.status === 'CANCELLED' ? '#fee2e2' : '#fef3c7';
    const statusColor = booking.status === 'CONFIRMED' ? '#065f46' : booking.status === 'CANCELLED' ? '#991b1b' : '#92400e';
    const statusText = booking.status === 'CONFIRMED' ? 'ONAYLI' : booking.status === 'CANCELLED' ? 'İPTAL' : 'BEKLİYOR';
    const isOperating = (booking.status === 'CONFIRMED' && (booking.operationalStatus === 'IN_OPERATION' || booking.operationalStatus === 'PARTNER_ACCEPTED')) || booking.status === 'ACCEPTED';

    return (
        <PartnerGuard>
            <PartnerLayout>
                <style jsx global>{`
                    .booking-detail-container { max-width: 1000px; margin: 0 auto; }
                    @media (max-width: 768px) {
                        .booking-detail-container { padding-top: 68px; }
                    }
                `}</style>

                <div className="booking-detail-container">
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
                        <button onClick={() => router.push('/partner')} style={{
                            width: 40, height: 40, borderRadius: 12, border: '1px solid #e2e8f0',
                            background: '#fff', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 16,
                        }}>
                            <ArrowLeftOutlined />
                        </button>
                        <div style={{ flex: 1 }}>
                            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Rezervasyon Detayı</h1>
                            <span style={{ fontSize: 13, color: '#94a3b8' }}>#{booking.bookingNumber}</span>
                        </div>
                        <span style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                            background: statusBg, color: statusColor,
                        }}>{statusText}</span>
                    </div>

                    <Row gutter={[24, 24]}>
                        {/* LEFT */}
                        <Col xs={24} lg={16}>
                            {/* Map */}
                            <div style={{
                                background: '#fff', borderRadius: 18, overflow: 'hidden', marginBottom: 24,
                                boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                            }}>
                                <BookingMap pickup={booking.pickup.location} dropoff={booking.dropoff.location} onDistanceCalculated={handleDistanceCalculated} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
                                    <div style={{ padding: '14px 20px', borderRight: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>MESAFE</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{stats.dist || '...'}</div>
                                    </div>
                                    <div style={{ padding: '14px 20px' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>TAHMİNİ SÜRE</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{stats.duration || '...'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Route Details */}
                            <div style={{
                                background: '#fff', borderRadius: 18, padding: '24px', marginBottom: 24,
                                boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                            }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>Transfer Bilgileri</h3>

                                <div style={{ position: 'relative', paddingLeft: 28 }}>
                                    <div style={{ position: 'absolute', left: 7, top: 12, bottom: 12, width: 2, background: 'linear-gradient(to bottom, #10b981, #e2e8f0 50%, #ef4444)', zIndex: 0 }} />

                                    {/* Pickup */}
                                    <div style={{ marginBottom: 32, position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                            <div style={{
                                                width: 16, height: 16, borderRadius: '50%', background: '#10b981',
                                                border: '3px solid #fff', boxShadow: '0 0 0 2px #10b981', flexShrink: 0, marginTop: 4,
                                            }} />
                                            <div>
                                                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>ALIŞ NOKTASI</div>
                                                <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginTop: 4 }}>{booking.pickup.location}</div>
                                                <div style={{
                                                    marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    background: '#ecfdf5', padding: '4px 12px', borderRadius: 8,
                                                    fontSize: 13, fontWeight: 600, color: '#059669',
                                                }}>
                                                    <CalendarOutlined style={{ fontSize: 12 }} /> {booking.pickup.time}
                                                </div>
                                                {booking.flightNumber && (
                                                    <div style={{ marginTop: 8 }}>
                                                        <FlightTracker flightNumber={booking.flightNumber} arrivalDate={booking.pickup.timeDate || booking.pickupDateTime} />
                                                    </div>
                                                )}
                                                {booking.pickup.note && (
                                                    <div style={{
                                                        marginTop: 8, padding: '8px 12px', background: '#f8fafc',
                                                        borderRadius: 8, fontSize: 13, color: '#64748b', fontStyle: 'italic',
                                                        border: '1px solid #f1f5f9',
                                                    }}>
                                                        Not: &ldquo;{booking.pickup.note}&rdquo;
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dropoff */}
                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                            <div style={{
                                                width: 16, height: 16, borderRadius: '50%', background: '#ef4444',
                                                border: '3px solid #fff', boxShadow: '0 0 0 2px #ef4444', flexShrink: 0, marginTop: 4,
                                            }} />
                                            <div>
                                                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>VARIŞ NOKTASI</div>
                                                <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginTop: 4 }}>{booking.dropoff.location}</div>
                                                <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>Trafiğe göre değişebilir</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Col>

                        {/* RIGHT */}
                        <Col xs={24} lg={8}>
                            {/* Customer Card */}
                            <div style={{
                                background: '#fff', borderRadius: 18, padding: '24px', marginBottom: 20,
                                boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                            }}>
                                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                                    <div style={{
                                        width: 72, height: 72, borderRadius: 20, margin: '0 auto 12px',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 22, fontWeight: 700, color: '#fff',
                                        boxShadow: '0 6px 20px rgba(99,102,241,0.3)',
                                    }}>
                                        {booking.customer.avatar}
                                    </div>
                                    <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{booking.customer.name}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Müşteri</div>
                                </div>

                                <div style={{ height: 1, background: '#f1f5f9', margin: '0 -24px 16px' }} />

                                <Dropdown menu={{
                                    items: [
                                        { key: 'call', label: <a href={`tel:${booking.customer.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}><PhoneOutlined /> Ara</a> },
                                        { key: 'sms', label: <a href={`sms:${booking.customer.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}><MessageOutlined /> SMS</a> },
                                        { key: 'whatsapp', label: <a href={`https://wa.me/${booking.customer.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}><WhatsAppOutlined /> WhatsApp</a> },
                                    ]
                                }} trigger={['click']}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                                        padding: '10px 14px', borderRadius: 12, background: '#f8fafc',
                                        border: '1px solid #f1f5f9', transition: 'all 0.2s',
                                    }}>
                                        <PhoneOutlined style={{ color: '#6366f1', fontSize: 16 }} />
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>{booking.customer.phone}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>İletişim için tıkla</div>
                                        </div>
                                    </div>
                                </Dropdown>

                                {booking.customer.email && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginTop: 8 }}>
                                        <MailOutlined style={{ color: '#94a3b8' }} />
                                        <span style={{ fontSize: 13, color: '#64748b' }}>{booking.customer.email}</span>
                                    </div>
                                )}
                            </div>

                            {/* Payment Card */}
                            <div style={{
                                background: '#fff', borderRadius: 18, padding: '24px', marginBottom: 20,
                                boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                            }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Ödeme Bilgisi</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><CarOutlined /> Araç Tipi</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{booking.vehicle.type}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><TeamOutlined /> Yolcu</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{booking.vehicle.pax} Kişi</span>
                                    </div>
                                    <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Toplam</span>
                                        <span style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>
                                            {booking.price.poolPrice || booking.price.amount} <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>{booking.price.currency}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{
                                background: '#fff', borderRadius: 18, padding: '20px',
                                boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                            }}>
                                {booking.status === 'COMPLETED' ? (
                                    <button onClick={() => router.push('/partner')} style={{
                                        width: '100%', padding: 14, border: '1px solid #e2e8f0', borderRadius: 12,
                                        background: '#fff', color: '#475569', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                    }}>Geri Dön</button>
                                ) : isOperating ? (
                                    <button onClick={() => handleAction('COMPLETED')} disabled={actionLoading === 'COMPLETED'} style={{
                                        width: '100%', padding: 16, border: 'none', borderRadius: 14,
                                        background: actionLoading === 'COMPLETED' ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                                        color: '#fff', fontSize: 16, fontWeight: 800, cursor: actionLoading === 'COMPLETED' ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        boxShadow: '0 6px 20px rgba(16,185,129,0.35)',
                                    }}>
                                        <RocketOutlined style={{ fontSize: 18 }} /> {actionLoading === 'COMPLETED' ? 'İşleniyor...' : 'Transferi Bitir'}
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <button onClick={() => handleAction('CONFIRMED')} disabled={actionLoading === 'CONFIRMED'} style={{
                                            width: '100%', padding: 14, border: 'none', borderRadius: 12,
                                            background: actionLoading === 'CONFIRMED' ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                                            color: '#fff', fontSize: 15, fontWeight: 700, cursor: actionLoading === 'CONFIRMED' ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                        }}>{actionLoading === 'CONFIRMED' ? '...' : 'Kabul Et'}</button>
                                        <button onClick={() => router.push('/partner')} style={{
                                            width: '100%', padding: 14, border: '1px solid #e2e8f0', borderRadius: 12,
                                            background: '#fff', color: '#475569', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                        }}>Geri</button>
                                    </div>
                                )}
                            </div>
                        </Col>
                    </Row>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
