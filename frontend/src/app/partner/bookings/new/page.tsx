'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Card, Form, Input, InputNumber, DatePicker, Button, Select, message,
    Spin, Row, Col, Alert, Tag, Divider, Typography, Space, Tooltip
} from 'antd';
import {
    EnvironmentOutlined, CarOutlined, UserOutlined, PhoneOutlined, MailOutlined,
    DollarOutlined, ClockCircleOutlined, TeamOutlined,
    CheckCircleOutlined, SwapOutlined,
    CalendarOutlined, InfoCircleOutlined, SendOutlined,
    PlusCircleOutlined, FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
import MapPickerModal from '@/app/components/MapPickerModal';
import apiClient from '@/lib/api-client';
import { getRouteDetails } from '@/lib/routing';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import PartnerLayout from '../../PartnerLayout';
import PartnerGuard from '../../PartnerGuard';

const { Text, Title } = Typography;

interface Driver {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    status: string;
    isOnline: boolean;
    activeBookingsCount: number;
}

interface Vehicle {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    year: number;
    isBusy: boolean;
    vehicleType?: { id: string; name: string; capacity: number };
}

interface AllowedZone {
    id: string;
    zoneId: string;
    baseLocation: string;
    isActive: boolean;
    maxPriceCap: string | number | null;
    zone: { id: string; name: string; code: string | null };
}

interface VehicleType {
    id: string;
    name: string;
    category: string;
    capacity: number;
}

interface ZonePrice {
    id: string;
    vehicleTypeId: string;
    zoneId: string;
    baseLocation: string;
    price: string | number;
    fixedPrice: string | number | null;
    currency: string;
}

const PartnerNewBookingPage: React.FC = () => {
    const [form] = Form.useForm();
    const { currencies } = useDefinitions();

    // Data
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
    const [allowedZones, setAllowedZones] = useState<AllowedZone[]>([]);
    const [zonePrices, setZonePrices] = useState<ZonePrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState<any>(null);

    // Location state
    const [pickup, setPickup] = useState('');
    const [dropoff, setDropoff] = useState('');
    const [pickupCoords, setPickupCoords] = useState<{ lat?: number; lng?: number }>({});
    const [dropoffCoords, setDropoffCoords] = useState<{ lat?: number; lng?: number }>({});
    const [routeInfo, setRouteInfo] = useState<{ distance?: string; duration?: string; distanceKm?: number; durationMin?: number } | null>(null);
    const [routeLoading, setRouteLoading] = useState(false);

    // Map picker
    const [mapOpen, setMapOpen] = useState<'pickup' | 'dropoff' | null>(null);

    // Passenger counts
    const [adults, setAdults] = useState(1);
    const [childrenCount, setChildrenCount] = useState(0);
    const [infants, setInfants] = useState(0);

    const totalPax = adults + childrenCount + infants;

    // Price auto-fill state
    const [autoPrice, setAutoPrice] = useState<number | null>(null);
    const [autoCurrency, setAutoCurrency] = useState<string | null>(null);

    const defCurrencies = useMemo(() => currencies || [], [currencies]);

    // Load data on mount
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [driversRes, vehiclesRes, vtRes, zonesRes, pricesRes] = await Promise.all([
                    apiClient.get('/api/transfer/partner/my-drivers').catch(() => ({ data: { success: false } })),
                    apiClient.get('/api/transfer/partner/my-vehicles').catch(() => ({ data: { success: false } })),
                    apiClient.get('/api/vehicle-types').catch(() => ({ data: { success: false } })),
                    apiClient.get('/api/transfer/partner/allowed-zones').catch(() => ({ data: { success: false } })),
                    apiClient.get('/api/transfer/partner/zone-prices').catch(() => ({ data: { success: false } })),
                ]);
                if (driversRes.data?.success) setDrivers(driversRes.data.data || []);
                if (vehiclesRes.data?.success) setVehicles(vehiclesRes.data.data?.vehicles || vehiclesRes.data.data || []);
                if (vtRes.data?.success) setVehicleTypes(vtRes.data.data || []);
                if (zonesRes.data?.success) setAllowedZones((zonesRes.data.data || []).filter((z: AllowedZone) => z.isActive));
                if (pricesRes.data?.success) setZonePrices(pricesRes.data.data || []);
            } catch (e) {
                console.error('Load error', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Route calculation when both locations have coords
    useEffect(() => {
        if (!pickup || !dropoff) return;
        const calc = async () => {
            setRouteLoading(true);
            try {
                const r = await getRouteDetails(pickup, dropoff);
                if (r) {
                    const hrs = Math.floor(r.durationMin / 60);
                    const mins = r.durationMin % 60;
                    setRouteInfo({
                        distanceKm: r.distanceKm,
                        durationMin: r.durationMin,
                        distance: `${r.distanceKm.toFixed(1)} km`,
                        duration: hrs > 0 ? `${hrs} sa ${mins} dk` : `${mins} dk`,
                    });
                }
            } catch (e) {
                console.warn('Route calc failed', e);
            } finally {
                setRouteLoading(false);
            }
        };
        const timer = setTimeout(calc, 800);
        return () => clearTimeout(timer);
    }, [pickup, dropoff]);

    // Auto-fill price when zone + vehicle type changes
    const handleAutoPrice = (zoneId?: string, vehicleTypeId?: string) => {
        if (!zoneId || !vehicleTypeId) {
            setAutoPrice(null);
            setAutoCurrency(null);
            return;
        }
        const zone = allowedZones.find(z => z.zoneId === zoneId);
        if (!zone) return;
        const pp = zonePrices.find(
            p => p.zoneId === zoneId && p.vehicleTypeId === vehicleTypeId && p.baseLocation === zone.baseLocation
        );
        if (pp) {
            const pax = adults + childrenCount + infants;
            const price = pp.fixedPrice != null ? Number(pp.fixedPrice) : Number(pp.price) * pax;
            setAutoPrice(price);
            setAutoCurrency(pp.currency);
            form.setFieldsValue({ price, currency: pp.currency });
        } else {
            setAutoPrice(null);
            setAutoCurrency(null);
        }
    };

    // When vehicle is selected, auto-set vehicleTypeId
    const handleVehicleChange = (vehicleId: string) => {
        const v = vehicles.find(x => x.id === vehicleId);
        if (v?.vehicleType) {
            form.setFieldsValue({ vehicleTypeId: v.vehicleType.id });
            const zoneId = form.getFieldValue('partnerZoneId');
            handleAutoPrice(zoneId, v.vehicleType.id);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (!pickup || !dropoff) {
                message.warning('Alış ve bırakış yeri zorunludur');
                return;
            }

            setSubmitting(true);

            const zone = allowedZones.find(z => z.zoneId === values.partnerZoneId);

            const payload = {
                passengerName: values.passengerName,
                passengerPhone: values.passengerPhone || null,
                passengerEmail: values.passengerEmail || null,
                pickup,
                dropoff,
                pickupDateTime: values.pickupDateTime.toISOString(),
                pickupLat: pickupCoords.lat,
                pickupLng: pickupCoords.lng,
                dropoffLat: dropoffCoords.lat,
                dropoffLng: dropoffCoords.lng,
                distance: routeInfo?.distanceKm ? `${routeInfo.distanceKm.toFixed(1)} km` : null,
                duration: routeInfo?.durationMin ? `${routeInfo.durationMin} min` : null,
                flightNumber: values.flightNumber || null,
                flightTime: values.flightTime ? values.flightTime.toISOString() : null,
                adults,
                children: childrenCount,
                infants,
                vehicleTypeId: values.vehicleTypeId || null,
                vehicleId: values.vehicleId || null,
                driverId: values.driverId || null,
                price: values.price != null ? Number(values.price) : null,
                currency: values.currency || null,
                paymentMethod: values.paymentMethod || 'CASH',
                notes: values.notes || null,
                partnerZoneId: values.partnerZoneId || null,
                baseLocation: zone?.baseLocation || null,
            };

            const res = await apiClient.post('/api/transfer/partner/bookings', payload);
            if (res.data.success) {
                message.success('Rezervasyon başarıyla oluşturuldu!');
                setSuccess(res.data.data);
                form.resetFields();
                setPickup('');
                setDropoff('');
                setPickupCoords({});
                setDropoffCoords({});
                setRouteInfo(null);
                setAdults(1);
                setChildrenCount(0);
                setInfants(0);
                setAutoPrice(null);
                setAutoCurrency(null);
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.error || 'Rezervasyon oluşturulamadı');
        } finally {
            setSubmitting(false);
        }
    };

    const swapLocations = () => {
        const tmpPickup = pickup;
        const tmpDropoff = dropoff;
        const tmpPC = { ...pickupCoords };
        const tmpDC = { ...dropoffCoords };
        setPickup(tmpDropoff);
        setDropoff(tmpPickup);
        setPickupCoords(tmpDC);
        setDropoffCoords(tmpPC);
    };

    if (loading) {
        return (
            <PartnerGuard>
                <PartnerLayout>
                    <div style={{ textAlign: 'center', padding: 100 }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16, color: '#64748b' }}>Veriler yükleniyor...</div>
                    </div>
                </PartnerLayout>
            </PartnerGuard>
        );
    }

    if (success) {
        return (
            <PartnerGuard>
                <PartnerLayout>
                    <div style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
                        <Card style={{ borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px', boxShadow: '0 8px 30px rgba(16,185,129,0.3)',
                            }}>
                                <CheckCircleOutlined style={{ fontSize: 40, color: '#fff' }} />
                            </div>
                            <Title level={3} style={{ color: '#0f172a', marginBottom: 8 }}>Rezervasyon Oluşturuldu!</Title>
                            <Text type="secondary" style={{ fontSize: 14 }}>
                                Rezervasyon numarası: <strong style={{ color: '#10b981' }}>{success.bookingNumber}</strong>
                            </Text>
                            <Divider />
                            <div style={{ textAlign: 'left', padding: '0 20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Müşteri</Text>
                                        <div style={{ fontWeight: 600 }}>{success.contactName}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Tarih</Text>
                                        <div style={{ fontWeight: 600 }}>{dayjs(success.startDate).format('DD.MM.YYYY HH:mm')}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Fiyat</Text>
                                        <div style={{ fontWeight: 600 }}>{success.total} {success.currency}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Durum</Text>
                                        <Tag color="green">ONAYLANDI</Tag>
                                    </div>
                                </div>
                            </div>
                            <Divider />
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<PlusCircleOutlined />}
                                    size="large"
                                    onClick={() => setSuccess(null)}
                                    style={{ borderRadius: 10, background: '#10b981', borderColor: '#10b981' }}
                                >
                                    Yeni Rezervasyon
                                </Button>
                                <Button
                                    size="large"
                                    onClick={() => window.location.href = '/partner/pool'}
                                    style={{ borderRadius: 10 }}
                                >
                                    Transferlerime Git
                                </Button>
                            </Space>
                        </Card>
                    </div>
                </PartnerLayout>
            </PartnerGuard>
        );
    }

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 4px' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 20 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <PlusCircleOutlined style={{ color: '#10b981' }} /> Yeni İş Ekle
                        </h1>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            Manuel transfer rezervasyonu oluşturun. Oluşturulan rezervasyonlar otomatik onaylanır.
                        </Text>
                    </div>

                    <Form form={form} layout="vertical" onFinish={handleSubmit}>
                        {/* ── Location Card ── */}
                        <Card
                            size="small"
                            style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e8ecf1', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <EnvironmentOutlined style={{ fontSize: 14, color: '#10b981' }} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Güzergah</span>
                                    {routeInfo && (
                                        <Tag color="blue" style={{ marginLeft: 'auto', fontSize: 11 }}>
                                            {routeInfo.distance} · {routeInfo.duration}
                                        </Tag>
                                    )}
                                    {routeLoading && <Spin size="small" style={{ marginLeft: 'auto' }} />}
                                </div>
                            }
                        >
                            <Row gutter={12} align="middle">
                                <Col xs={24} md={11}>
                                    <Form.Item label={<span style={{ fontWeight: 600, fontSize: 12 }}>Alış Yeri</span>} required style={{ marginBottom: 8 }}>
                                        <DynamicLocationSearchInput
                                            placeholder="Havaalanı, Otel, Adres..."
                                            value={pickup}
                                            onChange={(val) => { setPickup(val); setPickupCoords({}); }}
                                            onSelect={(addr, lat, lng) => { setPickup(addr); setPickupCoords({ lat, lng }); }}
                                            onMapClick={() => setMapOpen('pickup')}
                                            size="large"
                                            prefix={<EnvironmentOutlined style={{ color: '#10b981' }} />}
                                            style={{ borderRadius: 10 }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={2} style={{ textAlign: 'center' }}>
                                    <Button
                                        icon={<SwapOutlined />}
                                        shape="circle"
                                        size="small"
                                        onClick={swapLocations}
                                        style={{ marginTop: 8, background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                                        title="Yerleri değiştir"
                                    />
                                </Col>
                                <Col xs={24} md={11}>
                                    <Form.Item label={<span style={{ fontWeight: 600, fontSize: 12 }}>Bırakış Yeri</span>} required style={{ marginBottom: 8 }}>
                                        <DynamicLocationSearchInput
                                            placeholder="Havaalanı, Otel, Adres..."
                                            value={dropoff}
                                            onChange={(val) => { setDropoff(val); setDropoffCoords({}); }}
                                            onSelect={(addr, lat, lng) => { setDropoff(addr); setDropoffCoords({ lat, lng }); }}
                                            onMapClick={() => setMapOpen('dropoff')}
                                            size="large"
                                            prefix={<EnvironmentOutlined style={{ color: '#ef4444' }} />}
                                            style={{ borderRadius: 10 }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* ── Date & Passengers Card ── */}
                        <Card
                            size="small"
                            style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e8ecf1', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CalendarOutlined style={{ fontSize: 14, color: '#3b82f6' }} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Tarih & Yolcular</span>
                                </div>
                            }
                        >
                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="pickupDateTime"
                                        label={<span style={{ fontWeight: 600, fontSize: 12 }}>Alış Tarihi & Saati</span>}
                                        rules={[{ required: true, message: 'Tarih zorunludur' }]}
                                        initialValue={dayjs().add(2, 'hour')}
                                    >
                                        <DatePicker
                                            showTime={{ format: 'HH:mm' }}
                                            format="DD.MM.YYYY HH:mm"
                                            disabledDate={(current) => current && current.isBefore(dayjs().startOf('day'))}
                                            style={{ width: '100%', borderRadius: 10 }}
                                            size="large"
                                            placeholder="Tarih ve saat seçin"
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item label={<span style={{ fontWeight: 600, fontSize: 12 }}>Yolcu Sayısı</span>}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {[
                                                { label: 'Yetişkin', value: adults, set: setAdults, min: 1 },
                                                { label: 'Çocuk', value: childrenCount, set: setChildrenCount, min: 0 },
                                                { label: 'Bebek', value: infants, set: setInfants, min: 0 },
                                            ].map(p => (
                                                <div key={p.label} style={{
                                                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    padding: '8px 6px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb',
                                                }}>
                                                    <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{p.label}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => p.set(Math.max(p.min, p.value - 1))}
                                                            disabled={p.value <= p.min}
                                                            style={{
                                                                width: 26, height: 26, borderRadius: 6, background: '#fff',
                                                                border: '1px solid #e5e7eb', cursor: p.value <= p.min ? 'not-allowed' : 'pointer',
                                                                opacity: p.value <= p.min ? 0.4 : 1, fontSize: 14, fontWeight: 700,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151',
                                                            }}
                                                        >−</button>
                                                        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 18, textAlign: 'center' }}>{p.value}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => p.set(Math.min(20, p.value + 1))}
                                                            style={{
                                                                width: 26, height: 26, borderRadius: 6, background: '#fff',
                                                                border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151',
                                                            }}
                                                        >+</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ textAlign: 'center', marginTop: 6 }}>
                                            <Tag color="purple" style={{ fontSize: 11 }}>
                                                <TeamOutlined /> Toplam: {totalPax} kişi
                                            </Tag>
                                        </div>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* ── Customer Info Card ── */}
                        <Card
                            size="small"
                            style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e8ecf1', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <UserOutlined style={{ fontSize: 14, color: '#8b5cf6' }} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Müşteri Bilgileri</span>
                                </div>
                            }
                        >
                            <Row gutter={12}>
                                <Col xs={24} md={8}>
                                    <Form.Item
                                        name="passengerName"
                                        label={<span style={{ fontWeight: 600, fontSize: 12 }}>Ad Soyad</span>}
                                        rules={[{ required: true, message: 'Müşteri adı zorunludur' }]}
                                    >
                                        <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Ali Yılmaz" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="passengerPhone" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Telefon</span>}>
                                        <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} placeholder="+90 555 123 45 67" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="passengerEmail" label={<span style={{ fontWeight: 600, fontSize: 12 }}>E-posta</span>}>
                                        <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="musteri@ornek.com" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col xs={24} md={8}>
                                    <Form.Item name="flightNumber" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Uçuş No / PNR</span>}>
                                        <Input placeholder="TK1234" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="flightTime" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Uçuş Saati</span>}>
                                        <DatePicker
                                            showTime={{ format: 'HH:mm' }}
                                            format="DD.MM.YYYY HH:mm"
                                            style={{ width: '100%', borderRadius: 10 }}
                                            size="large"
                                            placeholder="Uçuş varış/kalkış saati"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* ── Vehicle & Driver Card ── */}
                        <Card
                            size="small"
                            style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e8ecf1', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CarOutlined style={{ fontSize: 14, color: '#f59e0b' }} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Araç & Şoför</span>
                                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>(Opsiyonel)</Text>
                                </div>
                            }
                        >
                            <Row gutter={12}>
                                <Col xs={24} md={8}>
                                    <Form.Item name="vehicleTypeId" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Araç Tipi</span>}>
                                        <Select
                                            allowClear
                                            placeholder="Araç tipi seçin"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                            onChange={(val) => {
                                                const zoneId = form.getFieldValue('partnerZoneId');
                                                handleAutoPrice(zoneId, val);
                                            }}
                                            options={vehicleTypes.map(vt => ({
                                                value: vt.id,
                                                label: `${vt.name} — ${vt.capacity} kişi`,
                                            }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="vehicleId" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Araç</span>}>
                                        <Select
                                            allowClear
                                            placeholder="Araç seçin"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                            onChange={handleVehicleChange}
                                            options={vehicles.map(v => ({
                                                value: v.id,
                                                label: `${v.plateNumber} — ${v.brand} ${v.model}`,
                                                disabled: v.isBusy,
                                            }))}
                                            optionRender={(option) => {
                                                const v = vehicles.find(x => x.id === option.value);
                                                return (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{option.label}</span>
                                                        {v?.isBusy && <Tag color="red" style={{ fontSize: 10 }}>Meşgul</Tag>}
                                                    </div>
                                                );
                                            }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="driverId" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Şoför</span>}>
                                        <Select
                                            allowClear
                                            placeholder="Şoför seçin"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                            options={drivers.map(d => ({
                                                value: d.id,
                                                label: d.fullName || `${d.firstName} ${d.lastName}`,
                                            }))}
                                            optionRender={(option) => {
                                                const d = drivers.find(x => x.id === option.value);
                                                return (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{option.label}</span>
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            {d?.isOnline && <Tag color="green" style={{ fontSize: 10, margin: 0 }}>Online</Tag>}
                                                            {(d?.activeBookingsCount || 0) > 0 && (
                                                                <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>{d?.activeBookingsCount} aktif</Tag>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                            {drivers.length === 0 && vehicles.length === 0 && (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Henüz kayıtlı araç veya şoförünüz yok. Ayarlar sayfasından ekleyebilirsiniz."
                                    style={{ borderRadius: 10 }}
                                />
                            )}
                        </Card>

                        {/* ── Pricing Card ── */}
                        <Card
                            size="small"
                            style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e8ecf1', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <DollarOutlined style={{ fontSize: 14, color: '#10b981' }} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Fiyatlandırma</span>
                                    {autoPrice != null && (
                                        <Tag color="green" style={{ marginLeft: 'auto', fontSize: 11 }}>
                                            <CheckCircleOutlined /> Otomatik: {autoPrice} {autoCurrency}
                                        </Tag>
                                    )}
                                </div>
                            }
                        >
                            <Row gutter={12}>
                                <Col xs={24} md={8}>
                                    <Form.Item
                                        name="partnerZoneId"
                                        label={
                                            <span style={{ fontWeight: 600, fontSize: 12 }}>
                                                Bölge{' '}
                                                <Tooltip title="Bölge seçerseniz tanımlı fiyatınız otomatik doldurulur">
                                                    <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                                                </Tooltip>
                                            </span>
                                        }
                                    >
                                        <Select
                                            allowClear
                                            placeholder="Bölge seçin (opsiyonel)"
                                            size="large"
                                            style={{ borderRadius: 10 }}
                                            onChange={(val) => {
                                                const vtId = form.getFieldValue('vehicleTypeId');
                                                handleAutoPrice(val, vtId);
                                            }}
                                            options={allowedZones.map(az => ({
                                                value: az.zoneId,
                                                label: `${az.zone.name} ${az.zone.code ? `(${az.zone.code})` : ''} @ ${az.baseLocation}`,
                                            }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Form.Item
                                        name="price"
                                        label={<span style={{ fontWeight: 600, fontSize: 12 }}>Fiyat</span>}
                                    >
                                        <InputNumber
                                            min={0}
                                            style={{ width: '100%', borderRadius: 10 }}
                                            size="large"
                                            placeholder="0.00"
                                            prefix={<DollarOutlined style={{ color: '#94a3b8' }} />}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={5}>
                                    <Form.Item name="currency" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Para Birimi</span>}>
                                        <Select size="large" style={{ borderRadius: 10 }} placeholder="Seçin">
                                            {defCurrencies.map(c => (
                                                <Select.Option key={c.code} value={c.code}>
                                                    {c.symbol} {c.code}
                                                </Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={5}>
                                    <Form.Item name="paymentMethod" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Ödeme</span>} initialValue="CASH">
                                        <Select size="large" style={{ borderRadius: 10 }}>
                                            <Select.Option value="CASH">Nakit</Select.Option>
                                            <Select.Option value="CREDIT_CARD">Kredi Kartı</Select.Option>
                                            <Select.Option value="BANK_TRANSFER">Havale/EFT</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* ── Notes Card ── */}
                        <Card
                            size="small"
                            style={{ marginBottom: 24, borderRadius: 14, border: '1px solid #e8ecf1', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <FileTextOutlined style={{ fontSize: 14, color: '#d97706' }} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Notlar</span>
                                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>(Opsiyonel)</Text>
                                </div>
                            }
                        >
                            <Form.Item name="notes" style={{ marginBottom: 0 }}>
                                <Input.TextArea
                                    rows={3}
                                    placeholder="Özel istekler, ek bilgiler..."
                                    style={{ borderRadius: 10 }}
                                />
                            </Form.Item>
                        </Card>

                        {/* ── Submit ── */}
                        <div style={{
                            position: 'sticky', bottom: 0, zIndex: 10,
                            background: 'linear-gradient(to top, #f0f2f5 60%, transparent)',
                            padding: '16px 0 8px',
                        }}>
                            <Card
                                size="small"
                                style={{
                                    borderRadius: 14, border: '1px solid #d1fae5',
                                    background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)',
                                    boxShadow: '0 4px 20px rgba(16,185,129,0.1)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#064e3b' }}>
                                            {pickup && dropoff ? (
                                                <span>{pickup.substring(0, 30)}... → {dropoff.substring(0, 30)}...</span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>Güzergah seçilmedi</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                            {totalPax} yolcu
                                            {routeInfo && ` · ${routeInfo.distance}`}
                                            {form.getFieldValue('price') != null && ` · ${form.getFieldValue('price')} ${form.getFieldValue('currency') || ''}`}
                                        </div>
                                    </div>
                                    <Button
                                        type="primary"
                                        size="large"
                                        icon={<SendOutlined />}
                                        loading={submitting}
                                        htmlType="submit"
                                        style={{
                                            borderRadius: 12, height: 48, paddingInline: 32,
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            border: 'none', fontWeight: 700, fontSize: 15,
                                            boxShadow: '0 4px 15px rgba(16,185,129,0.35)',
                                        }}
                                    >
                                        Rezervasyon Oluştur
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    </Form>

                    {/* Map Picker Modal */}
                    <MapPickerModal
                        visible={!!mapOpen}
                        onCancel={() => setMapOpen(null)}
                        onConfirm={(address: string, lat: number, lng: number) => {
                            if (mapOpen === 'pickup') {
                                setPickup(address);
                                setPickupCoords({ lat, lng });
                            } else {
                                setDropoff(address);
                                setDropoffCoords({ lat, lng });
                            }
                            setMapOpen(null);
                        }}
                        title={mapOpen === 'pickup' ? 'Alış Noktası Seçin' : 'Bırakış Noktası Seçin'}
                    />
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
};

export default PartnerNewBookingPage;
