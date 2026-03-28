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
import HereLocationSearchInput from '@/app/components/HereLocationSearchInput';
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
    departureTimes?: string[];
}

const TransferSearchContent: React.FC = () => {
    const { formatPrice } = useCurrency();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [results, setResults] = useState<TransferResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [routeStats, setRouteStats] = useState<{ distance: string | number; duration: string | number } | null>(null);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [form] = Form.useForm();

    const pickup = searchParams.get('pickup') || '';
    const dropoff = searchParams.get('dropoff') || '';
    const date = searchParams.get('date') || '';
    const time = searchParams.get('time') || '';
    const passengers = searchParams.get('passengers') || '1';
    const type = searchParams.get('type') || 'ONE_WAY';
    const pickupLat = searchParams.get('pickupLat') || '';
    const pickupLng = searchParams.get('pickupLng') || '';

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
                pickupDateTime = `${date}T${time}:00.000Z`;
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
                pickupLat,
                pickupLng
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

    const handleBook = (vehicleId: string) => {
        const currentDistance = routeStats?.distance;
        if (currentDistance) sessionStorage.setItem('routeDistance', currentDistance.toString());
        const params = new URLSearchParams(searchParams.toString());
        params.set('vehicleId', vehicleId);
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
            type: type || 'ONE_WAY'
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
                            <div style={{ marginBottom: 16 }}><Text strong>{results.length} araç bulundu</Text></div>
                            {results.map((result) => (
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
                                                <Space><UserOutlined /> {result.capacity} Yolcu</Space>
                                                <Space><SafetyCertificateOutlined /> {result.luggage} Bavul</Space>
                                                {result.features?.includes('WiFi') && <Space><WifiOutlined /> WiFi</Space>}
                                                <Space><ClockCircleOutlined /> Süre: {result.estimatedDuration}</Space>
                                            </div>
                                            <Tag icon={<CheckCircleOutlined />} color="green">Ücretsiz İptal</Tag>
                                        </Col>
                                        <Col xs={24} md={6} style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                            <Text type="secondary" delete>{formatPrice(Math.round(result.price * 1.2), result.currency)}</Text>
                                            <Title level={2} style={{ color: '#667eea', margin: '4px 0 16px', fontSize: 28 }}>{formatPrice(result.price, result.currency)}</Title>
                                            <Button type="primary" size="large" block onClick={() => handleBook(result.id)} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>Hemen Seç</Button>
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
                    <Form.Item name="pickup" label="Alış Noktası" rules={[{ required: true }]}><HereLocationSearchInput placeholder="Nereden?" /></Form.Item>
                    <Form.Item name="dropoff" label="Bırakış Noktası" rules={[{ required: true }]}><HereLocationSearchInput placeholder="Nereye?" /></Form.Item>
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
