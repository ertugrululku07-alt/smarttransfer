'use client';

import React, { useState } from 'react';
import { Modal, Steps, Form, Input, InputNumber, DatePicker, Button, Space, Tag, Select, Radio, message, Spin, Divider, Row, Col, Card, Alert } from 'antd';
import {
    EnvironmentOutlined, CarOutlined, UserOutlined, PhoneOutlined, MailOutlined,
    CreditCardOutlined, DollarOutlined, ClockCircleOutlined, TeamOutlined,
    SearchOutlined, CheckCircleOutlined, ArrowLeftOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import HereLocationSearchInput from '@/app/components/HereLocationSearchInput';
import MapPickerModal from '@/app/components/MapPickerModal';
import apiClient from '@/lib/api-client';
import { getRouteDetails } from '@/lib/routing';

interface TransferResult {
    id: string;
    vehicleType: string;
    vendor: string;
    price: number;
    currency: string;
    capacity: number;
    luggage: number;
    features: string[];
    estimatedDuration: string;
    image?: string;
    isShuttle?: boolean;
    matchedMasterTime?: string;
    pickupLeadHours?: number | null;
    departureTimes?: string[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const CallCenterBookingWizard: React.FC<Props> = ({ open, onClose, onSuccess }) => {
    const [step, setStep] = useState(0);

    // Step 1 (Search) state
    const [pickup, setPickup] = useState('');
    const [dropoff, setDropoff] = useState('');
    const [pickupCoords, setPickupCoords] = useState<{ lat?: number; lng?: number }>({});
    const [dropoffCoords, setDropoffCoords] = useState<{ lat?: number; lng?: number }>({});
    const [pickupDateTime, setPickupDateTime] = useState<any>(dayjs().add(2, 'hour'));
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [infants, setInfants] = useState(0);
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<TransferResult[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance?: string; duration?: string; durationMin?: number } | null>(null);

    // Map pickers
    const [mapOpen, setMapOpen] = useState<'pickup' | 'dropoff' | null>(null);

    // Step 2 (Selected + Customer)
    const [selected, setSelected] = useState<TransferResult | null>(null);
    const [customerForm] = Form.useForm();
    const [creating, setCreating] = useState(false);

    const resetAll = () => {
        setStep(0);
        setPickup(''); setDropoff('');
        setPickupCoords({}); setDropoffCoords({});
        setPickupDateTime(dayjs().add(2, 'hour'));
        setAdults(1); setChildren(0); setInfants(0);
        setResults([]); setSearchError(null); setRouteInfo(null);
        setSelected(null);
        customerForm.resetFields();
    };

    const handleClose = () => { resetAll(); onClose(); };

    const handleSearch = async () => {
        if (!pickup || !dropoff || !pickupDateTime) {
            message.warning('Nereden, Nereye ve Tarih/Saat zorunludur');
            return;
        }
        try {
            setSearching(true);
            setSearchError(null);
            setResults([]);

            // Get route details (HERE)
            let distance: number | undefined;
            let encodedPolyline: string | undefined;
            let durMin: number | undefined;
            try {
                const r = await getRouteDetails(pickup, dropoff);
                if (r) {
                    distance = r.distanceKm;
                    encodedPolyline = r.encodedPolyline;
                    durMin = typeof r.durationMin === 'number' ? r.durationMin : undefined;
                    const hrs = durMin ? Math.floor(durMin / 60) : 0;
                    const mins = durMin ? durMin % 60 : 0;
                    setRouteInfo({
                        distance: `${r.distanceKm?.toFixed(1)} km`,
                        duration: hrs > 0 ? `${hrs} saat ${mins} dk` : `${mins} dk`,
                        durationMin: durMin
                    });
                }
            } catch (e) { console.warn('Route details failed', e); }

            const payload = {
                pickup,
                dropoff,
                pickupDateTime: pickupDateTime.toISOString(),
                passengers: Number(adults) + Number(children) + Number(infants) || 1,
                transferType: 'ONE_WAY',
                distance,
                encodedPolyline,
                pickupLat: pickupCoords.lat,
                pickupLng: pickupCoords.lng,
                dropoffLat: dropoffCoords.lat,
                dropoffLng: dropoffCoords.lng
            };

            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                const list: TransferResult[] = res.data.data.results || [];
                if (list.length === 0) {
                    setSearchError('Seçilen rota/saat için uygun araç bulunamadı.');
                }
                setResults(list);
            } else {
                setSearchError('Arama sonuçları alınamadı.');
            }
        } catch (err: any) {
            setSearchError(err?.response?.data?.error || 'Arama sırasında bir hata oluştu');
        } finally {
            setSearching(false);
        }
    };

    const handleSelectVehicle = (r: TransferResult) => {
        setSelected(r);
        setStep(1);
        customerForm.setFieldsValue({
            adults, children, infants,
            paymentMethod: 'PAY_IN_VEHICLE'
        });
    };

    const handleCreate = async () => {
        try {
            const values = await customerForm.validateFields();
            if (!selected) return;
            setCreating(true);

            // Compute home-pickup time for shuttle (snap to departureTimes)
            let shuttleMasterTime: string | undefined = undefined;
            let displayDateTime = pickupDateTime;
            if (selected.isShuttle && routeInfo?.durationMin && selected.pickupLeadHours && Array.isArray(selected.departureTimes)) {
                const searchMin = pickupDateTime.hour() * 60 + pickupDateTime.minute();
                const rawTotal = ((searchMin - routeInfo.durationMin - (selected.pickupLeadHours || 0) * 60) % (24 * 60) + 24 * 60) % (24 * 60);
                let best = selected.departureTimes[0]; let bestDiff = Infinity;
                for (const dt of selected.departureTimes) {
                    const [dh, dm] = dt.split(':').map(Number);
                    const dtMin = dh * 60 + dm;
                    const raw = Math.abs(dtMin - rawTotal);
                    const diff = Math.min(raw, 24 * 60 - raw);
                    if (diff < bestDiff) { bestDiff = diff; best = dt; }
                }
                shuttleMasterTime = selected.matchedMasterTime; // actual shuttle departure time
                // Update displayDateTime to the snapped home-pickup time
                const [bh, bm] = best.split(':').map(Number);
                displayDateTime = pickupDateTime.hour(bh).minute(bm).second(0);
            }

            const payload = {
                passengerName: values.passengerName,
                passengerPhone: values.passengerPhone,
                passengerEmail: values.passengerEmail || '',
                pickup,
                dropoff,
                pickupDateTime: displayDateTime.toISOString(),
                vehicleType: selected.vehicleType,
                flightNumber: values.flightNumber || '',
                price: selected.price,
                currency: selected.currency || 'TRY',
                notes: values.notes || '',
                adults: values.adults || adults,
                children: values.children || children,
                infants: values.infants || infants,
                paymentMethod: values.paymentMethod || 'PAY_IN_VEHICLE',
                pickupLat: pickupCoords.lat, pickupLng: pickupCoords.lng,
                dropoffLat: dropoffCoords.lat, dropoffLng: dropoffCoords.lng,
                distance: routeInfo?.distance,
                duration: routeInfo?.duration,
                isShuttle: !!selected.isShuttle,
                shuttleRouteId: selected.isShuttle ? selected.id.replace('shuttle_', '') : null,
                shuttleMasterTime: shuttleMasterTime || selected.matchedMasterTime || null,
                passengerDetails: Array.isArray(values.passengerDetails) ? values.passengerDetails : []
            };

            const res = await apiClient.post('/api/transfer/bookings/admin', payload);
            if (res.data.success) {
                message.success('Rezervasyon oluşturuldu!');
                onSuccess();
                handleClose();
            } else {
                message.error('Rezervasyon oluşturulamadı');
            }
        } catch (err: any) {
            if (err?.errorFields) return; // form validation error
            message.error(err?.response?.data?.error || 'Rezervasyon oluşturulamadı');
        } finally {
            setCreating(false);
        }
    };

    const formatPrice = (p: number, c = 'TRY') => {
        const symbol = c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : '₺';
        return `${symbol} ${p.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <>
            <Modal
                open={open}
                onCancel={handleClose}
                title={<Space><ThunderboltOutlined style={{ color: '#6366f1' }} /><span>Call Center — Yeni Rezervasyon</span></Space>}
                width={900}
                footer={null}
                destroyOnClose
            >
                <Steps
                    current={step}
                    items={[
                        { title: 'Arama & Fiyat', icon: <SearchOutlined /> },
                        { title: 'Müşteri & Ödeme', icon: <UserOutlined /> }
                    ]}
                    style={{ marginBottom: 20 }}
                />

                {/* ─── STEP 1: Search ─── */}
                {step === 0 && (
                    <div>
                        <Card size="small" style={{ marginBottom: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Row gutter={12}>
                                <Col xs={24} md={12}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                        <EnvironmentOutlined style={{ color: '#10b981' }} /> Nereden (Alış)
                                    </div>
                                    <Space.Compact style={{ width: '100%' }}>
                                        <HereLocationSearchInput
                                            placeholder="Havaalanı, Otel, Adres..."
                                            value={pickup}
                                            onChange={setPickup}
                                            onSelect={(addr, lat, lng) => {
                                                setPickup(addr);
                                                if (lat != null && lng != null) setPickupCoords({ lat, lng });
                                            }}
                                            country="TUR"
                                        />
                                        <Button icon={<EnvironmentOutlined />} onClick={() => setMapOpen('pickup')} title="Haritadan seç" />
                                    </Space.Compact>
                                </Col>
                                <Col xs={24} md={12}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                        <EnvironmentOutlined style={{ color: '#ef4444' }} /> Nereye (Bırakış)
                                    </div>
                                    <Space.Compact style={{ width: '100%' }}>
                                        <HereLocationSearchInput
                                            placeholder="Havaalanı, Otel, Adres..."
                                            value={dropoff}
                                            onChange={setDropoff}
                                            onSelect={(addr, lat, lng) => {
                                                setDropoff(addr);
                                                if (lat != null && lng != null) setDropoffCoords({ lat, lng });
                                            }}
                                            country="TUR"
                                        />
                                        <Button icon={<EnvironmentOutlined />} onClick={() => setMapOpen('dropoff')} title="Haritadan seç" />
                                    </Space.Compact>
                                </Col>
                            </Row>

                            <Row gutter={12} style={{ marginTop: 12 }}>
                                <Col xs={24} md={8}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                        <ClockCircleOutlined /> Tarih & Saat
                                    </div>
                                    <DatePicker
                                        showTime={{ format: 'HH:mm' }}
                                        format="DD.MM.YYYY HH:mm"
                                        value={pickupDateTime}
                                        onChange={setPickupDateTime}
                                        style={{ width: '100%' }}
                                    />
                                </Col>
                                <Col xs={8} md={5}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Yetişkin</div>
                                    <InputNumber min={1} max={50} value={adults} onChange={(v) => setAdults(Number(v) || 1)} style={{ width: '100%' }} />
                                </Col>
                                <Col xs={8} md={5}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Çocuk</div>
                                    <InputNumber min={0} max={20} value={children} onChange={(v) => setChildren(Number(v) || 0)} style={{ width: '100%' }} />
                                </Col>
                                <Col xs={8} md={6}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Bebek</div>
                                    <InputNumber min={0} max={10} value={infants} onChange={(v) => setInfants(Number(v) || 0)} style={{ width: '100%' }} />
                                </Col>
                            </Row>

                            <div style={{ marginTop: 14, textAlign: 'right' }}>
                                <Button type="primary" size="large" icon={<SearchOutlined />} loading={searching} onClick={handleSearch}
                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }}>
                                    Araçları Listele & Fiyat Al
                                </Button>
                            </div>
                        </Card>

                        {routeInfo && (
                            <div style={{ padding: '8px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', marginBottom: 12, fontSize: 13 }}>
                                <Space size="large">
                                    <span><strong>Mesafe:</strong> {routeInfo.distance}</span>
                                    <span><strong>Süre:</strong> {routeInfo.duration}</span>
                                </Space>
                            </div>
                        )}

                        {searchError && <Alert type="warning" showIcon message={searchError} style={{ marginBottom: 12 }} />}

                        {searching && <div style={{ textAlign: 'center', padding: 30 }}><Spin size="large" /></div>}

                        {!searching && results.length > 0 && (
                            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>
                                    {results.length} araç bulundu — müşteriye fiyat sunun ve seçim yaptırın:
                                </div>
                                {results.map((r) => (
                                    <Card
                                        key={r.id}
                                        size="small"
                                        hoverable
                                        style={{ marginBottom: 10, border: '1px solid #e5e7eb' }}
                                        styles={{ body: { padding: 14 } }}
                                        onClick={() => handleSelectVehicle(r)}
                                    >
                                        <Row gutter={12} align="middle">
                                            <Col xs={24} md={14}>
                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                    {r.image ? (
                                                        <img src={r.image} alt={r.vehicleType} style={{ width: 90, height: 60, objectFit: 'cover', borderRadius: 6, background: '#f1f5f9' }} onError={(e) => { (e.target as HTMLImageElement).src = r.isShuttle ? '/vehicles/sprinter.png' : '/vehicles/vito.png'; }} />
                                                    ) : (
                                                        <div style={{ width: 90, height: 60, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CarOutlined style={{ fontSize: 28, color: '#94a3b8' }} /></div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: 15 }}>{r.vehicleType}</div>
                                                        <div style={{ fontSize: 12, color: '#64748b' }}>by {r.vendor}</div>
                                                        <Space size={4} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                                                            {r.isShuttle && <Tag color="purple" style={{ margin: 0 }}>Paylaşımlı Shuttle</Tag>}
                                                            {r.matchedMasterTime && <Tag color="blue" style={{ margin: 0 }}>{r.matchedMasterTime} Sefer</Tag>}
                                                            <Tag icon={<TeamOutlined />} color="default" style={{ margin: 0 }}>{r.capacity} Yolcu</Tag>
                                                        </Space>
                                                    </div>
                                                </div>
                                            </Col>
                                            <Col xs={24} md={10} style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>
                                                    {formatPrice(r.price, r.currency)}
                                                </div>
                                                <Button type="primary" size="small" style={{ marginTop: 8, background: '#10b981', border: 'none' }}>
                                                    Bu Aracı Seç →
                                                </Button>
                                            </Col>
                                        </Row>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── STEP 2: Customer + Payment ─── */}
                {step === 1 && selected && (
                    <div>
                        <Card size="small" style={{ marginBottom: 14, background: '#f0fdf4', border: '1px solid #86efac' }}>
                            <Row align="middle" gutter={10}>
                                <Col flex="auto">
                                    <div style={{ fontSize: 12, color: '#065f46', fontWeight: 700 }}>SEÇİLEN ARAÇ</div>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.vehicleType}</div>
                                    <div style={{ fontSize: 12, color: '#475569' }}>
                                        {pickup} → {dropoff} · {pickupDateTime?.format('DD.MM.YYYY HH:mm')}
                                        {routeInfo?.duration && ` · ${routeInfo.duration}`}
                                    </div>
                                </Col>
                                <Col>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{formatPrice(selected.price, selected.currency)}</div>
                                        <Button size="small" icon={<ArrowLeftOutlined />} type="link" onClick={() => setStep(0)}>Araç değiştir</Button>
                                    </div>
                                </Col>
                            </Row>
                        </Card>

                        <Form form={customerForm} layout="vertical">
                            <Divider style={{ marginTop: 0, fontSize: 13, color: '#64748b' }}>Müşteri Bilgileri</Divider>
                            <Row gutter={12}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="passengerName" label="Ad Soyad" rules={[{ required: true, message: 'Zorunlu' }]}>
                                        <Input prefix={<UserOutlined />} placeholder="Ali Yılmaz" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="passengerPhone" label="Telefon" rules={[{ required: true, message: 'Zorunlu' }]}>
                                        <Input prefix={<PhoneOutlined />} placeholder="+90 555 123 45 67" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="passengerEmail" label="E-posta">
                                        <Input prefix={<MailOutlined />} placeholder="musteri@ornek.com" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="flightNumber" label="Uçuş No / PNR">
                                        <Input placeholder="TK1234 / ABC123" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider style={{ fontSize: 13, color: '#64748b' }}>Yolcu Sayısı</Divider>
                            <Row gutter={12}>
                                <Col span={8}><Form.Item name="adults" label="Yetişkin" initialValue={adults}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
                                <Col span={8}><Form.Item name="children" label="Çocuk" initialValue={children}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                <Col span={8}><Form.Item name="infants" label="Bebek" initialValue={infants}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                            </Row>

                            <Divider style={{ fontSize: 13, color: '#64748b' }}>Ödeme</Divider>
                            <Form.Item name="paymentMethod" label="Tahsilat Yöntemi" initialValue="PAY_IN_VEHICLE" rules={[{ required: true }]}>
                                <Radio.Group buttonStyle="solid" size="large" style={{ width: '100%' }}>
                                    <Radio.Button value="PAY_IN_VEHICLE" style={{ width: '50%', textAlign: 'center' }}>
                                        <DollarOutlined /> Araçta Tahsilat
                                    </Radio.Button>
                                    <Radio.Button value="CREDIT_CARD" style={{ width: '50%', textAlign: 'center' }}>
                                        <CreditCardOutlined /> Kredi Kartı
                                    </Radio.Button>
                                </Radio.Group>
                            </Form.Item>

                            <Form.Item name="notes" label="Ek Açıklama / Notlar">
                                <Input.TextArea rows={2} placeholder="Özel istekler, bebek koltuğu, ekstra bagaj vb." />
                            </Form.Item>
                        </Form>

                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)}>Geri</Button>
                            <Button type="primary" size="large" icon={<CheckCircleOutlined />} loading={creating} onClick={handleCreate}
                                style={{ background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none' }}>
                                Rezervasyonu Oluştur · {formatPrice(selected.price, selected.currency)}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Map Picker */}
            <MapPickerModal
                visible={mapOpen !== null}
                onCancel={() => setMapOpen(null)}
                onConfirm={(addr, lat, lng) => {
                    if (mapOpen === 'pickup') {
                        setPickup(addr);
                        setPickupCoords({ lat, lng });
                    } else if (mapOpen === 'dropoff') {
                        setDropoff(addr);
                        setDropoffCoords({ lat, lng });
                    }
                    setMapOpen(null);
                }}
                initialLocation={mapOpen === 'pickup' ? (pickupCoords.lat ? { lat: pickupCoords.lat!, lng: pickupCoords.lng! } : null) : (dropoffCoords.lat ? { lat: dropoffCoords.lat!, lng: dropoffCoords.lng! } : null)}
                initialAddress={mapOpen === 'pickup' ? pickup : dropoff}
                title={mapOpen === 'pickup' ? 'Alış Konumunu Seçin' : 'Bırakış Konumunu Seçin'}
                country="TUR"
            />
        </>
    );
};

export default CallCenterBookingWizard;
