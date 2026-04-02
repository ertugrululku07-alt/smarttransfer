'use client';

import React from 'react';
import { Card, Typography, Row, Col, Divider, Space, Tag } from 'antd';
import { CarOutlined, CreditCardOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useBranding } from '../context/BrandingContext';
import { getImageUrl } from '@/lib/api-client';

const { Title, Text } = Typography;

interface VoucherProps {
    booking: any;
    tenant?: any;       // Tenant info (branding, name)
    agency?: any;       // Agency info (logo, companyName, contactPhone, contactEmail)
    pickup?: string;    // Direct pickup from page state as fallback
    dropoff?: string;   // Direct dropoff from page state as fallback
}

export default function BookingVoucher({ booking, tenant, agency, pickup: pickupProp, dropoff: dropoffProp }: VoucherProps) {
    const { branding, fullName } = useBranding();
    if (!booking) return null;

    const passengerMetadata = booking.metadata?.passengersList || [];

    // Pickup/dropoff: first try metadata (new bookings), then direct props (page state)
    const pickupLocation = booking.metadata?.pickup || pickupProp || 'Belirtilmedi';
    const dropoffLocation = booking.metadata?.dropoff || dropoffProp || 'Belirtilmedi';

    // Agency logo & name - prefer agency logo over tenant, check all possible field names
    let agencyLogoRaw = agency?.logo || agency?.logoUrl || agency?.logoImage
        || tenant?.logoUrl || tenant?.logo || null;

    let agencyLogo = agencyLogoRaw ? getImageUrl(agencyLogoRaw) : null;

    // Validate that the logo is actually a URL or base64 data, not just a string like "null" or empty
    if (agencyLogo && typeof agencyLogo === 'string' && !agencyLogo.startsWith('http') && !agencyLogo.startsWith('data:image')) {
        agencyLogo = null;
    }
    const agencyName = agency?.companyName || agency?.name || tenant?.name || branding.companyName;
    const agencyPhone = agency?.phone || agency?.contactPhone || tenant?.phone || '';
    const agencyEmail = agency?.email || agency?.contactEmail || tenant?.email || '';

    return (
        <div id="booking-voucher-print-area" style={{
            fontFamily: "'Inter', Arial, sans-serif",
            color: '#333',
            background: '#fff',
            padding: 40,
            maxWidth: 800,
            margin: '0 auto',
        }}>
            {/* Header: Agency Info (Logo + Contact on Left, Voucher Title on Right) */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 30 }}>
                <Col>
                    {agencyLogo ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                                src={agencyLogo} 
                                alt="Firma Logosu" 
                                style={{ height: 70, maxWidth: 220, objectFit: 'contain', display: 'block' }} 
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    const fallbackEl = document.getElementById(`fallback-name-${booking.id}`);
                                    if (fallbackEl) fallbackEl.style.display = 'block';
                                }}
                            />
                            <Title id={`fallback-name-${booking.id}`} level={3} style={{ margin: 0, display: 'none' }}>{agencyName}</Title>
                        </>
                    ) : (
                        <Title level={3} style={{ margin: 0 }}>{agencyName}</Title>
                    )}
                    <div style={{ marginTop: 8, textAlign: 'left' }}>
                        {agencyEmail && (
                            <Text style={{ display: 'block', fontSize: 12, color: '#555' }}>
                                ✉ {agencyEmail}
                            </Text>
                        )}
                        {agencyPhone && (
                            <Text style={{ display: 'block', fontSize: 12, color: '#555' }}>
                                📞 {agencyPhone}
                            </Text>
                        )}
                    </div>
                </Col>
                <Col style={{ textAlign: 'right' }}>
                    <Title level={2} style={{ margin: 0, color: '#1890ff' }}>TRANSFER VOUCHER</Title>
                    <div style={{ marginTop: 8 }}>
                        <Text strong style={{ display: 'block' }}>PNR / Ref: {booking.bookingNumber}</Text>
                        <Text type="secondary" style={{ display: 'block' }}>
                            Tarih: {dayjs(booking.createdAt).format('DD.MM.YYYY HH:mm')}
                        </Text>
                        {agencyName && agencyName !== branding.companyName && (
                            <Tag color="blue" style={{ marginTop: 4 }}>{agencyName}</Tag>
                        )}
                    </div>
                </Col>
            </Row>

            <Divider style={{ borderColor: '#1890ff', borderWidth: 2 }} />

            {/* Passenger & Contact Info */}
            <Row gutter={[32, 32]} style={{ marginBottom: 30 }}>
                <Col span={12}>
                    <Card size="small" title={<><UserOutlined /> İletişim Bilgileri</>} bordered={false} style={{ background: '#f5f5f5' }}>
                        <Text strong style={{ display: 'block' }}>{booking.contactName}</Text>
                        <Text style={{ display: 'block' }}>{booking.contactPhone}</Text>
                        <Text style={{ display: 'block' }}>{booking.contactEmail}</Text>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card size="small" title={<><SafetyCertificateOutlined /> Yolcu Listesi</>} bordered={false} style={{ background: '#f5f5f5' }}>
                        {passengerMetadata.length > 0 ? passengerMetadata.map((p: any, idx: number) => (
                            <Text key={idx} style={{ display: 'block' }}>
                                {idx + 1}. {p.firstName} {p.lastName} {p.nationality ? `(${p.nationality})` : ''}
                            </Text>
                        )) : (
                            <Text>{booking.contactName} (+{Math.max(0, (booking.adults || 1) - 1)} Kişi)</Text>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Transfer Details */}
            <Title level={5} style={{ color: '#1890ff', marginBottom: 16 }}>
                <CarOutlined /> Transfer Detayları
            </Title>

            <div style={{
                borderLeft: '4px solid #1890ff',
                paddingLeft: 20,
                marginBottom: 30,
                background: '#fafafa',
                padding: '16px 16px 16px 20px',
                borderRadius: '0 8px 8px 0'
            }}>
                <Row gutter={[16, 12]}>
                    <Col span={12}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Alış Noktası</Text>
                        <Text strong style={{ fontSize: 15 }}>{pickupLocation}</Text>
                    </Col>
                    <Col span={12}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Bırakış Noktası</Text>
                        <Text strong style={{ fontSize: 15 }}>{dropoffLocation}</Text>
                    </Col>

                    <Col span={12}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Tarih & Saat</Text>
                        <Text strong style={{ fontSize: 15 }}>{dayjs(booking.startDate).format('DD.MM.YYYY HH:mm')}</Text>
                    </Col>
                    <Col span={12}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Araç / Hizmet</Text>
                        <Text strong style={{ fontSize: 15 }}>
                            {booking.metadata?.vehicleType || 'VIP Transfer'}
                        </Text>
                    </Col>

                    {booking.metadata?.flightNumber && (
                        <Col span={24}>
                            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Uçuş Numarası</Text>
                            <Text strong>{booking.metadata.flightNumber}</Text>
                        </Col>
                    )}

                    {booking.metadata?.agencyNotes && (
                        <Col span={24}>
                            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Notlar</Text>
                            <Text>{booking.metadata.agencyNotes}</Text>
                        </Col>
                    )}
                </Row>
            </div>

            {/* Payment Summary */}
            <Row justify="end">
                <Col span={12}>
                    <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: 16, borderRadius: 8 }}>
                        <Title level={5} style={{ margin: 0, color: '#389e0d', marginBottom: 12 }}>
                            <CreditCardOutlined /> Ödeme Özeti
                        </Title>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text>Tutar:</Text>
                            <Text strong>
                                {Number(booking.total || 0).toLocaleString('tr-TR', { style: 'currency', currency: booking.currency || 'TRY' })}
                            </Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>Ödeme Durumu:</Text>
                            <Tag color={booking.paymentStatus === 'PAID' ? 'success' : 'processing'}>
                                {booking.paymentStatus === 'PAID' ? 'ÖDENDİ' : 'BEKLİYOR / POS KALAN'}
                            </Tag>
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Footer */}
            <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #eee', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    Bu rezervasyon belgesi elektronik olarak üretilmiştir. Herhangi bir sorunuz için lütfen yetkili acenteniz ile iletişime geçiniz.
                </Text>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                    İyi yolculuklar dileriz.
                </Text>
            </div>
        </div>
    );
}
