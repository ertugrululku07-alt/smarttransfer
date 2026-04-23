'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Layout,
    Card,
    Row,
    Col,
    Typography,
    Button,
    Spin,
    message,
    Alert,
    Tag,
    Divider,
    Space,
    Badge,
    Form,
    Input,
    Select,
    DatePicker,
    TimePicker,
    Modal,
    Radio
} from 'antd';
import {
    CarOutlined,
    UserOutlined,
    WifiOutlined,
    ArrowRightOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    SafetyCertificateOutlined,
    FilterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient, { getImageUrl } from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import BookingMap from '@/app/components/BookingMap';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
import { getRouteDetails } from '@/lib/routing';
import { useCurrency } from '@/app/context/CurrencyContext';

const { Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

interface TransferResult {
    id: string;
    vehicleType: string;
    vendor: string;
    price: number;
    currency: string;
    capacity: number;
    luggage: number;
    features: string[];
    cancellationPolicy: string;
    estimatedDuration: string;
    image?: string;
    isShuttle?: boolean;
    shuttleRouteName?: string;
    departureTimes?: string[];
    matchedMasterTime?: string;
    timeOffsetMin?: number;
    pickupLeadHours?: number | null;
}

const TransferSearchContent: React.FC = () => {
    const { formatPrice } = useCurrency();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [results, setResults] = useState<TransferResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [routeStats, setRouteStats] = useState<{ distance: string | number; duration: string | number } | null>(null);
    const [durationMin, setDurationMin] = useState<number | null>(null);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [form] = Form.useForm();

    // Round-trip state
    const [roundTripStep, setRoundTripStep] = useState<'outbound' | 'return'>('outbound');
    const [returnResults, setReturnResults] = useState<TransferResult[]>([]);
    const [returnLoading, setReturnLoading] = useState(false);
    const [selectedOutbound, setSelectedOutbound] = useState<{ vehicleId: string; matchedMasterTime?: string } | null>(null);

    const pickup = searchParams.get('pickup') || '';
    const dropoff = searchParams.get('dropoff') || '';
    const date = searchParams.get('date') || '';
    const time = searchParams.get('time') || '';
    const passengers = searchParams.get('passengers') || '1';
    const type = searchParams.get('type') || 'ONE_WAY';
    const returnDate = searchParams.get('returnDate') || '';
    const returnTime = searchParams.get('returnTime') || '';
    const pickupLat = searchParams.get('pickupLat') || '';
    const pickupLng = searchParams.get('pickupLng') || '';
    const dropoffLat = searchParams.get('dropoffLat') || '';
    const dropoffLng = searchParams.get('dropoffLng') || '';
    const isRoundTrip = type === 'ROUND_TRIP';

    useEffect(() => {
        if (pickup && dropoff && date) {
            searchTransfers();
        } else {
            setLoading(false);
        }
    }, [searchParams]);

    const searchTransfers = async () => {
        try {
            setLoading(true);
            setError(null);
            let pickupDateTime = date;
            if (time) {
                pickupDateTime = `${date}T${time}:00.000`;
            }

            let distance: number | undefined;
            let encodedPolyline: string | undefined;
            if (pickup && dropoff) {
                try {
                    const route = await getRouteDetails(pickup, dropoff);
                    if (route) {
                        distance = route.distanceKm;
                        encodedPolyline = route.encodedPolyline;
                        if (encodedPolyline) sessionStorage.setItem('lastEncodedPolyline', encodedPolyline);
                        setRouteStats({ distance: route.distanceKm, duration: route.durationMin });
                        if (typeof route.durationMin === 'number') setDurationMin(route.durationMin);
                    }
                } catch (e) {
                    console.error('Distance calculation failed:', e);
                }
            }

            const payload = {
                pickup,
                dropoff,
                pickupDateTime,
                passengers: Number(passengers) || 1,
                transferType: type,
                distance,
                encodedPolyline,
                pickupLat: searchParams.get('pickupLat') || undefined,
                pickupLng: searchParams.get('pickupLng') || undefined,
                dropoffLat: searchParams.get('dropoffLat') || undefined,
                dropoffLng: searchParams.get('dropoffLng') || undefined
            };

            const res = await apiClient.post('/api/transfer/search', payload);

            if (res.data.success) {
                setResults(res.data.data.results);
            } else {
                setError('Arama sonuçları alınamadı.');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Arama sırasında bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const searchReturnTransfers = async () => {
        try {
            setReturnLoading(true);
            let returnPickupDateTime = returnDate || date;
            const rTime = returnTime || '12:00';
            returnPickupDateTime = `${returnDate || date}T${rTime}:00.000`;

            // Calculate route for reversed direction (needed for zone matching)
            let returnDistance: number | undefined;
            let returnPolyline: string | undefined;
            try {
                const route = await getRouteDetails(dropoff, pickup);
                if (route) {
                    returnDistance = route.distanceKm;
                    returnPolyline = route.encodedPolyline;
                }
            } catch (e) {
                console.error('Return route calculation failed:', e);
            }

            const payload = {
                pickup: dropoff,   // Reversed!
                dropoff: pickup,   // Reversed!
                pickupDateTime: returnPickupDateTime,
                passengers: Number(passengers) || 1,
                transferType: 'ONE_WAY',
                distance: returnDistance,
                encodedPolyline: returnPolyline,
                pickupLat: dropoffLat || undefined,
                pickupLng: dropoffLng || undefined,
                dropoffLat: pickupLat || undefined,
                dropoffLng: pickupLng || undefined
            };

            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                setReturnResults(res.data.data.results);
            }
        } catch (err: any) {
            message.error('Dönüş araçları aranamadı');
        } finally {
            setReturnLoading(false);
        }
    };

    const handleBook = (vehicleId: string, matchedMasterTime?: string) => {
        if (isRoundTrip && roundTripStep === 'outbound') {
            // Save outbound selection, search return
            setSelectedOutbound({ vehicleId, matchedMasterTime });
            setRoundTripStep('return');
            searchReturnTransfers();
            return;
        }

        const currentDistance = routeStats?.distance;
        if (currentDistance) sessionStorage.setItem('routeDistance', currentDistance.toString());
        const params = new URLSearchParams(searchParams.toString());

        if (isRoundTrip && selectedOutbound) {
            // Both legs selected
            params.set('vehicleId', selectedOutbound.vehicleId);
            if (selectedOutbound.matchedMasterTime) {
                params.set('shuttleMasterTime', selectedOutbound.matchedMasterTime);
            }
            params.set('returnVehicleId', vehicleId);
            if (matchedMasterTime) {
                params.set('returnShuttleMasterTime', matchedMasterTime);
            }
        } else {
            params.set('vehicleId', vehicleId);
            if (matchedMasterTime) {
                params.set('shuttleMasterTime', matchedMasterTime);
            }
        }
        if (routeStats?.duration) {
            params.set('duration', routeStats.duration.toString());
        }
        router.push(`/transfer/book?${params.toString()}`);
    };

    const showEditModal = () => {
        form.setFieldsValue({
            pickup,
            dropoff,
            date: date ? dayjs(date) : null,
            time: time ? dayjs(time, 'HH:mm') : null,
            passengers: Number(passengers) || 1,
            type: type || 'ONE_WAY',
            pickupLat: searchParams.get('pickupLat') || '',
            pickupLng: searchParams.get('pickupLng') || '',
            dropoffLat: searchParams.get('dropoffLat') || '',
            dropoffLng: searchParams.get('dropoffLng') || ''
        });
        setIsEditModalVisible(true);
    };

    const handleEditSubmit = (values: any) => {
        const params = new URLSearchParams();
        params.set('pickup', values.pickup);
        params.set('dropoff', values.dropoff);
        params.set('date', values.date.format('YYYY-MM-DD'));
        params.set('time', values.time.format('HH:mm'));
        params.set('passengers', values.passengers);
        params.set('type', values.type);
        if (values.pickupLat) params.set('pickupLat', values.pickupLat);
        if (values.pickupLng) params.set('pickupLng', values.pickupLng);
        if (values.dropoffLat) params.set('dropoffLat', values.dropoffLat);
        if (values.dropoffLng) params.set('dropoffLng', values.dropoffLng);
        
        setIsEditModalVisible(false);
        router.push(`/transfer/search?${params.toString()}`);
    };

    return (
        <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
            <TopBar />
            <div style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '24px 0' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                    <Row gutter={[24, 24]} align="middle">
                        <Col xs={24} md={16}>
                            <Title level={4} style={{ margin: 0 }}>
                                {pickup} <ArrowRightOutlined style={{ fontSize: 16, margin: '0 8px', color: '#999' }} /> {dropoff}
                            </Title>
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text type="secondary" suppressHydrationWarning><ClockCircleOutlined /> {dayjs(date).format('DD MMMM YYYY')} {time}</Text>
                                <div style={{ width: 1, height: 14, background: '#f0f0f0', margin: '0 8px' }}></div>
                                <Text type="secondary"><UserOutlined /> {passengers} Yolcu</Text>
                                <div style={{ width: 1, height: 14, background: '#f0f0f0', margin: '0 8px' }}></div>
                                <Tag color={type === 'ONE_WAY' ? 'blue' : 'purple'}>
                                    {type === 'ONE_WAY' ? 'Tek Yön' : 'Gidiş-Dönüş'}
                                </Tag>
                            </div>
                        </Col>
                        <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                            <Button type="primary" icon={<FilterOutlined />} onClick={showEditModal}>Aramayı Düzenle</Button>
                        </Col>
                    </Row>
                </div>
            </div>

            <Content style={{ maxWidth: 1200, margin: '24px auto', padding: '0 24px', width: '100%' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>En uygun transfer araçları aranıyor...</div>
                    </div>
                ) : error ? (
                    <Alert message="Hata" description={error} type="error" showIcon action={<Button size="small" type="primary" onClick={searchTransfers}>Tekrar Dene</Button>} />
                ) : (
                    <Row gutter={[24, 24]}>
                        <Col xs={24} lg={6}>
                            <Card title="Filtrele" size="small">
                                <div style={{ marginBottom: 16 }}>
                                    <Text strong>Araç Tipi</Text>
                                    <div style={{ marginTop: 8 }}>
                                        <Tag>Sedan</Tag><Tag>Hatchback</Tag><Tag>Minivan</Tag>
                                    </div>
                                </div>
                            </Card>
                            <Card title="Rota Bilgileri" size="small" style={{ marginTop: 24 }}>
                                <div style={{ marginBottom: 16, height: 200, borderRadius: 8, overflow: 'hidden' }}>
                                    <BookingMap pickup={pickup} dropoff={dropoff} onDistanceCalculated={(dist, dur) => setRouteStats({ distance: dist, duration: dur })} />
                                </div>
                                <Divider style={{ margin: '12px 0' }} />
                                <Row gutter={16}>
                                    <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>Mesafe</Text><div style={{ fontWeight: 500, fontSize: 16 }}>{routeStats?.distance}</div></Col>
                                    <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>Süre</Text><div style={{ fontWeight: 500, fontSize: 16 }}>{routeStats?.duration}</div></Col>
                                </Row>
                            </Card>
                        </Col>
                        <Col xs={24} lg={18}>
                            {/* Round-trip step indicator */}
                            {isRoundTrip && (
                                <div style={{
                                    marginBottom: 20, padding: '16px 20px', borderRadius: 14,
                                    background: roundTripStep === 'outbound'
                                        ? 'linear-gradient(135deg, #667eea20, #764ba220)'
                                        : 'linear-gradient(135deg, #10b98120, #059669 20)',
                                    border: roundTripStep === 'outbound' ? '1px solid #667eea40' : '1px solid #10b98140',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
                                }}>
                                    <div>
                                        <Text strong style={{ fontSize: 15, color: roundTripStep === 'outbound' ? '#667eea' : '#059669' }}>
                                            {roundTripStep === 'outbound' ? '1️⃣ Gidiş Aracını Seçin' : '2️⃣ Dönüş Aracını Seçin'}
                                        </Text>
                                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                                            {roundTripStep === 'outbound'
                                                ? `${pickup} → ${dropoff} • ${dayjs(date).format('DD MMM YYYY')} ${time}`
                                                : `${dropoff} → ${pickup} • ${dayjs(returnDate || date).format('DD MMM YYYY')} ${returnTime || '12:00'}`
                                            }
                                        </div>
                                    </div>
                                    {roundTripStep === 'return' && (
                                        <Button size="small" onClick={() => { setRoundTripStep('outbound'); setSelectedOutbound(null); }}>
                                            ← Gidişe Dön
                                        </Button>
                                    )}
                                </div>
                            )}
                            <div style={{ marginBottom: 16 }}>
                                <Text strong>
                                    {roundTripStep === 'return' ? `${returnResults.length} dönüş aracı bulundu` : `${results.length} araç bulundu`}
                                </Text>
                            </div>
                            {returnLoading ? (
                                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                    <Spin size="large" />
                                    <div style={{ marginTop: 16 }}>Dönüş araçları aranıyor...</div>
                                </div>
                            ) : (roundTripStep === 'return' ? returnResults : results).map((result) => (
                                <Card key={result.id} hoverable style={{ marginBottom: 16, overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
                                    <Row>
                                        <Col xs={24} md={8} style={{ background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, minHeight: 200, overflow: 'hidden', position: 'relative' }}>
                                            {result.image ? (
                                                <img 
                                                    src={getImageUrl(result.image)} 
                                                    alt={result.vehicleType} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px' }} 
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        if (target.src.includes('/vehicles/')) {
                                                            // If even fallback fails, hide it or show icon
                                                            target.style.display = 'none';
                                                            const parent = target.parentElement;
                                                            if (parent) {
                                                                const icon = document.createElement('span');
                                                                icon.className = 'anticon anticon-car';
                                                                icon.style.fontSize = '80px';
                                                                icon.style.color = '#d9d9d9';
                                                                parent.appendChild(icon);
                                                            }
                                                        } else {
                                                            // Try local fallback based on type
                                                            target.src = result.isShuttle ? '/vehicles/sprinter.png' : '/vehicles/vito.png';
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <CarOutlined style={{ fontSize: 80, color: '#d9d9d9' }} />
                                            )}
                                            <div style={{ position: 'absolute', top: 12, left: 12 }}><Tag color="cyan">{result.vehicleType}</Tag></div>
                                        </Col>
                                        <Col xs={24} md={10} style={{ padding: 24 }}>
                                            <Title level={4} style={{ marginTop: 0 }}>{result.vehicleType}</Title>
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>by {result.vendor}</Text>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 16 }}>
                                                {result.isShuttle && <Tag color="purple">Paylaşımlı Shuttle</Tag>}
                                                {result.isShuttle && result.shuttleRouteName && <Text type="secondary" style={{ fontSize: 11 }}>{result.shuttleRouteName}</Text>}
                                                {result.isShuttle && result.matchedMasterTime ? (() => {
                                                    // Calculate raw home-pickup time: searchTime - travelDuration - pickupLeadHours
                                                    const timeStr = time || '12:00';
                                                    const [sh, sm] = timeStr.split(':').map(Number);
                                                    const searchMin = (sh || 0) * 60 + (sm || 0);
                                                    const travelMin = durationMin || 0;
                                                    const leadMin = (result.pickupLeadHours || 0) * 60;
                                                    let rawTotal = searchMin - travelMin - leadMin;
                                                    while (rawTotal < 0) rawTotal += 24 * 60;

                                                    // Snap to nearest scheduled departure time from route's schedule
                                                    let displayTime = result.matchedMasterTime;
                                                    if (durationMin && result.pickupLeadHours && Array.isArray(result.departureTimes) && result.departureTimes.length > 0) {
                                                        let bestTime = result.departureTimes[0];
                                                        let bestDiff = Infinity;
                                                        for (const dt of result.departureTimes) {
                                                            const [dh, dm] = dt.split(':').map(Number);
                                                            const dtMin = (dh || 0) * 60 + (dm || 0);
                                                            // Circular distance (handle midnight wrap)
                                                            const rawDiff = Math.abs(dtMin - rawTotal);
                                                            const diff = Math.min(rawDiff, 24 * 60 - rawDiff);
                                                            if (diff < bestDiff) {
                                                                bestDiff = diff;
                                                                bestTime = dt;
                                                            }
                                                        }
                                                        displayTime = bestTime;
                                                    } else if (durationMin && result.pickupLeadHours) {
                                                        const hh = String(Math.floor(rawTotal / 60) % 24).padStart(2, '0');
                                                        const mm = String(rawTotal % 60).padStart(2, '0');
                                                        displayTime = `${hh}:${mm}`;
                                                    }

                                                    return (
                                                        <Tag color="blue" style={{ fontWeight: 600 }}>
                                                            {displayTime} Yolculuğu
                                                        </Tag>
                                                    );
                                                })() : (result.matchedMasterTime && <Tag color="blue" style={{fontWeight:600}}>{result.matchedMasterTime} Yolculuğu</Tag>)}
                                                <Space><UserOutlined /> {result.capacity} Yolcu</Space>
                                                <Space><SafetyCertificateOutlined /> {result.luggage} Bavul</Space>
                                                {result.features?.includes('WiFi') && <Space><WifiOutlined /> WiFi</Space>}
                                                <Space><ClockCircleOutlined /> Süre: {result.isShuttle && typeof routeStats?.duration === 'string' ? routeStats.duration : result.estimatedDuration}</Space>
                                            </div>
                                            <Tag icon={<CheckCircleOutlined />} color="green">Ücretsiz İptal</Tag>
                                        </Col>
                                        <Col xs={24} md={6} style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                            <Text type="secondary" delete>{formatPrice(Math.round(result.price * 1.2), result.currency)}</Text>
                                            <Title level={2} style={{ color: '#667eea', margin: '4px 0 16px', fontSize: 28 }}>{formatPrice(result.price, result.currency)}</Title>
                                            <Button type="primary" size="large" block onClick={() => handleBook(result.id, result.matchedMasterTime)} style={{ background: roundTripStep === 'return' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>
                                                {isRoundTrip ? (roundTripStep === 'outbound' ? 'Gidiş Seç →' : 'Dönüş Seç ✓') : 'Hemen Seç'}
                                            </Button>
                                        </Col>
                                    </Row>
                                </Card>
                            ))}
                        </Col>
                    </Row>
                )}
            </Content>

            <Modal title="Aramayı Düzenle" open={isEditModalVisible} onCancel={() => setIsEditModalVisible(false)} footer={null} destroyOnHidden={true}>
                <Form form={form} layout="vertical" onFinish={handleEditSubmit}>
                    <Form.Item name="pickupLat" noStyle><Input type="hidden" /></Form.Item>
                    <Form.Item name="pickupLng" noStyle><Input type="hidden" /></Form.Item>
                    <Form.Item name="dropoffLat" noStyle><Input type="hidden" /></Form.Item>
                    <Form.Item name="dropoffLng" noStyle><Input type="hidden" /></Form.Item>

                    <Form.Item name="pickup" label="Alış Noktası" rules={[{ required: true }]}>
                        <DynamicLocationSearchInput 
                            placeholder="Nereden?" 
                            onSelect={(val, lat, lng) => {
                                form.setFieldsValue({ pickup: val, pickupLat: lat, pickupLng: lng });
                            }} 
                        />
                    </Form.Item>
                    <Form.Item name="dropoff" label="Bırakış Noktası" rules={[{ required: true }]}>
                        <DynamicLocationSearchInput 
                            placeholder="Nereye?" 
                            onSelect={(val, lat, lng) => {
                                form.setFieldsValue({ dropoff: val, dropoffLat: lat, dropoffLng: lng });
                            }}
                        />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="date" label="Tarih" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabledDate={(current) => current && current < dayjs().startOf('day')} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="time" label="Saat" rules={[{ required: true }]}><TimePicker style={{ width: '100%' }} format="HH:mm" /></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="passengers" label="Yolcu Sayısı" rules={[{ required: true }]}><Input type="number" min={1} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="type" label="Transfer Tipi"><Select><Select.Option value="ONE_WAY">Tek Yön</Select.Option><Select.Option value="ROUND_TRIP">Gidiş - Dönüş</Select.Option></Select></Form.Item></Col>
                    </Row>
                    <div style={{ textAlign: 'right', marginTop: 16 }}><Button onClick={() => setIsEditModalVisible(false)} style={{ marginRight: 8 }}>İptal</Button><Button type="primary" htmlType="submit">Güncelle ve Ara</Button></div>
                </Form>
            </Modal>
            <Footer style={{ textAlign: 'center', background: '#fff' }}>SmartTransfer ©2026</Footer>
        </Layout>
    );
};

const TransferSearchPage: React.FC = () => {
    return (
        <Suspense fallback={<div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 16 }}>Yükleniyor...</div></div>}>
            <TransferSearchContent />
        </Suspense>
    );
};

export default TransferSearchPage;
