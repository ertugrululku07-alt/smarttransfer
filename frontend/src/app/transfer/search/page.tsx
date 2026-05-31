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
    FilterOutlined,
    EnvironmentOutlined,
    SwapOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient, { getImageUrl } from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import BookingMap from '@/app/components/BookingMap';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
import { getRouteDetails } from '@/lib/routing';
import { useCurrency } from '@/app/context/CurrencyContext';
import { useBranding } from '@/app/context/BrandingContext';
import { useLanguage } from '@/app/context/LanguageContext';
import TranslatedText from '@/app/components/TranslatedText';

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
    const { branding } = useBranding();
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [results, setResults] = useState<TransferResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [routeStats, setRouteStats] = useState<{ distance: string | number; duration: string | number } | null>(null);
    const [durationMin, setDurationMin] = useState<number | null>(null);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editType, setEditType] = useState<string>('ONE_WAY');
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
                    } else {
                        // No drivable land route → don't pretend we can price it.
                        setResults([]);
                        setRouteStats(null);
                        setError(t('search.noRouteFound'));
                        setLoading(false);
                        return;
                    }
                } catch (e) {
                    console.error('Distance calculation failed:', e);
                    setResults([]);
                    setError(t('search.routeCalculationFailed'));
                    setLoading(false);
                    return;
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
                setError(t('search.searchResultsFailed'));
            }
        } catch (err: any) {
            setError(err.response?.data?.error || t('search.searchError'));
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
            message.error(t('search.returnSearchFailed'));
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
        const currentType = type || 'ONE_WAY';
        setEditType(currentType);
        form.setFieldsValue({
            pickup,
            dropoff,
            date: date ? dayjs(date) : null,
            time: time ? dayjs(time, 'HH:mm') : null,
            returnDate: returnDate ? dayjs(returnDate) : null,
            returnTime: returnTime ? dayjs(returnTime, 'HH:mm') : null,
            passengers: Number(passengers) || 1,
            type: currentType,
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
        if (values.type === 'ROUND_TRIP' && values.returnDate) {
            params.set('returnDate', values.returnDate.format('YYYY-MM-DD'));
            if (values.returnTime) params.set('returnTime', values.returnTime.format('HH:mm'));
        }
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

            {/* ── Premium Hero Header ── */}
            <div style={{
                paddingTop: 72,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative blobs */}
                <div style={{ position: 'absolute', top: -40, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(59,130,246,0.08)', filter: 'blur(60px)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -40, left: -60, width: 250, height: 250, borderRadius: '50%', background: 'rgba(99,102,241,0.07)', filter: 'blur(50px)', pointerEvents: 'none' }} />

                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 28px' }}>
                    <Row gutter={[24, 16]} align="middle">
                        <Col xs={24} md={17}>
                            {/* Route */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>{pickup}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)' }}>
                                    <ArrowRightOutlined style={{ color: '#60a5fa', fontSize: 12 }} />
                                </div>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>{dropoff}</span>
                            </div>
                            {/* Meta chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 14px' }}>
                                    <ClockCircleOutlined style={{ color: '#93c5fd', fontSize: 12 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }} suppressHydrationWarning>{dayjs(date).format('DD MMMM YYYY')} {time}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 14px' }}>
                                    <UserOutlined style={{ color: '#93c5fd', fontSize: 12 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{passengers} {t('search.passenger')}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: type === 'ONE_WAY' ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)', border: `1px solid ${type === 'ONE_WAY' ? 'rgba(59,130,246,0.35)' : 'rgba(139,92,246,0.35)'}`, borderRadius: 20, padding: '5px 14px' }}>
                                    <Text style={{ color: type === 'ONE_WAY' ? '#93c5fd' : '#c4b5fd', fontSize: 13, fontWeight: 600 }}>{type === 'ONE_WAY' ? '✈ ' + t('search.oneWay') : '↔ ' + t('search.roundTrip')}</Text>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} md={7} style={{ textAlign: 'right' }}>
                            <Button
                                icon={<FilterOutlined />}
                                onClick={showEditModal}
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                    border: 'none',
                                    color: '#fff',
                                    fontWeight: 600,
                                    height: 40,
                                    borderRadius: 10,
                                    padding: '0 20px',
                                    boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                                }}
                            >
                                {t('search.editSearch')}
                            </Button>
                        </Col>
                    </Row>
                </div>
            </div>

            <Content style={{ maxWidth: 1200, margin: '24px auto', padding: '0 24px', width: '100%' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>{t('search.searching')}</div>
                    </div>
                ) : error ? (
                    <Alert message={t('common.error')} description={error} type="error" showIcon action={<Button size="small" type="primary" onClick={searchTransfers}>{t('common.retry')}</Button>} />
                ) : (
                    <Row gutter={[24, 24]}>
                        <Col xs={24} lg={6}>
                            <Card title={t('common.filter')} size="small">
                                <div style={{ marginBottom: 16 }}>
                                    <Text strong>{t('search.vehicleType')}</Text>
                                    <div style={{ marginTop: 8 }}>
                                        <Tag>Sedan</Tag><Tag>Hatchback</Tag><Tag>Minivan</Tag>
                                    </div>
                                </div>
                            </Card>
                            <Card title={t('search.routeInfo')} size="small" style={{ marginTop: 24 }}>
                                <div style={{ marginBottom: 16, height: 200, borderRadius: 8, overflow: 'hidden' }}>
                                    <BookingMap pickup={pickup} dropoff={dropoff} onDistanceCalculated={(dist, dur) => setRouteStats({ distance: dist, duration: dur })} />
                                </div>
                                <Divider style={{ margin: '12px 0' }} />
                                <Row gutter={16}>
                                    <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>{t('search.distance')}</Text><div style={{ fontWeight: 500, fontSize: 16 }}>{routeStats?.distance}</div></Col>
                                    <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>{t('search.duration')}</Text><div style={{ fontWeight: 500, fontSize: 16 }}>{routeStats?.duration}</div></Col>
                                </Row>
                            </Card>
                        </Col>
                        <Col xs={24} lg={18}>
                            {/* Round-trip step indicator */}
                            {isRoundTrip && (
                                <div style={{
                                    marginBottom: 20, padding: '16px 20px', borderRadius: 14,
                                    background: roundTripStep === 'outbound'
                                        ? 'linear-gradient(135deg, var(--brand-primary-20), var(--brand-accent-20))'
                                        : 'linear-gradient(135deg, #10b98120, #059669 20)',
                                    border: roundTripStep === 'outbound' ? '1px solid var(--brand-primary-40)' : '1px solid #10b98140',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
                                }}>
                                    <div>
                                        <Text strong style={{ fontSize: 15, color: roundTripStep === 'outbound' ? 'var(--brand-primary)' : '#059669' }}>
                                            {roundTripStep === 'outbound' ? '1️⃣ ' + t('search.selectOutbound') : '2️⃣ ' + t('search.selectReturn')}
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
                                            ← {t('search.backToOutbound')}
                                        </Button>
                                    )}
                                </div>
                            )}
                            <div style={{ marginBottom: 16 }}>
                                <Text strong>
                                    {roundTripStep === 'return' ? `${returnResults.length} ` + t('search.returnVehiclesFound') : `${results.length} ` + t('search.vehiclesFound')}
                                </Text>
                            </div>
                            {returnLoading ? (
                                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                    <Spin size="large" />
                                    <div style={{ marginTop: 16 }}>{t('search.searchingReturn')}</div>
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
                                            <div style={{ position: 'absolute', top: 12, left: 12 }}><Tag color="cyan"><TranslatedText text={result.vehicleType} /></Tag></div>
                                        </Col>
                                        <Col xs={24} md={10} style={{ padding: 24 }}>
                                            <Title level={4} style={{ marginTop: 0 }}><TranslatedText text={result.vehicleType} /></Title>
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}><TranslatedText text={result.vendor} /></Text>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 16 }}>
                                                {result.isShuttle && <Tag color="purple">{t('search.sharedShuttle')}</Tag>}
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
                                                            {displayTime} {t('search.departure')}
                                                        </Tag>
                                                    );
                                                })() : (result.matchedMasterTime && <Tag color="blue" style={{fontWeight:600}}>{result.matchedMasterTime} {t('search.departure')}</Tag>)}
                                                <Space><UserOutlined /> {result.capacity} {t('search.passenger')}</Space>
                                                <Space><SafetyCertificateOutlined /> {result.luggage} {t('search.luggage')}</Space>
                                                {result.features?.includes('WiFi') && <Space><WifiOutlined /> WiFi</Space>}
                                                <Space><ClockCircleOutlined /> {t('search.duration')}: {result.isShuttle && typeof routeStats?.duration === 'string' ? routeStats.duration : <TranslatedText text={result.estimatedDuration} />}</Space>
                                            </div>
                                            <Tag icon={<CheckCircleOutlined />} color="green">{t('search.freeCancellation')}</Tag>
                                        </Col>
                                        <Col xs={24} md={6} style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                            <Text type="secondary" delete>{formatPrice(Math.round(result.price * 1.2), result.currency)}</Text>
                                            <Title level={2} style={{ color: 'var(--brand-primary)', margin: '4px 0 16px', fontSize: 28 }}>{formatPrice(result.price, result.currency)}</Title>
                                            <Button type="primary" size="large" block onClick={() => handleBook(result.id, result.matchedMasterTime)} style={{ background: roundTripStep === 'return' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 100%)', border: 'none' }}>
                                                {isRoundTrip ? (roundTripStep === 'outbound' ? t('search.selectOutboundBtn') : t('search.selectReturnBtn')) : t('search.selectNow')}
                                            </Button>
                                        </Col>
                                    </Row>
                                </Card>
                            ))}
                        </Col>
                    </Row>
                )}
            </Content>

            <Modal
                open={isEditModalVisible}
                onCancel={() => setIsEditModalVisible(false)}
                footer={null}
                destroyOnHidden={true}
                width={500}
                styles={{ body: { padding: 0 } }}
                style={{ borderRadius: 16, overflow: 'hidden' }}
                closable={false}
            >
                {/* Compact Premium Header */}
                <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)', padding: '14px 20px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', filter: 'blur(30px)', pointerEvents: 'none' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SwapOutlined style={{ color: '#60a5fa', fontSize: 14 }} />
                            </div>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{t('search.editSearch')}</div>
                        </div>
                        <button onClick={() => setIsEditModalVisible(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', width: 26, height: 26, borderRadius: 7, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    </div>
                </div>

                {/* Form Body */}
                <div style={{ padding: '14px 18px 14px', background: '#fff' }}>
                    <Form form={form} layout="vertical" onFinish={handleEditSubmit} requiredMark={false} size="middle">
                        <Form.Item name="pickupLat" noStyle><Input type="hidden" /></Form.Item>
                        <Form.Item name="pickupLng" noStyle><Input type="hidden" /></Form.Item>
                        <Form.Item name="dropoffLat" noStyle><Input type="hidden" /></Form.Item>
                        <Form.Item name="dropoffLng" noStyle><Input type="hidden" /></Form.Item>

                        {/* Row 1: Type + Passengers */}
                        <Row gutter={10} style={{ marginBottom: 10 }}>
                            <Col span={16}>
                                <Form.Item name="type" style={{ marginBottom: 0 }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {[{ val: 'ONE_WAY', label: '→ ' + t('search.oneWay') }, { val: 'ROUND_TRIP', label: '⇄ ' + t('search.roundTrip') }].map(opt => (
                                            <button key={opt.val} type="button"
                                                onClick={() => { form.setFieldsValue({ type: opt.val }); setEditType(opt.val); }}
                                                style={{ flex: 1, padding: '6px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, border: editType === opt.val ? '2px solid #3b82f6' : '2px solid #e2e8f0', background: editType === opt.val ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#f8fafc', color: editType === opt.val ? '#1d4ed8' : '#64748b' }}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="passengers" label={<span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{t('search.passenger').toUpperCase()}</span>} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                    <Input type="number" min={1} max={20} style={{ borderRadius: 8 }} prefix={<UserOutlined style={{ color: '#94a3b8', fontSize: 12 }} />} />
                                </Form.Item>
                            </Col>
                        </Row>

                        {/* Locations */}
                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px 4px', border: '1px solid #e2e8f0', marginBottom: 10 }}>
                            <Form.Item name="pickup" label={<span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{t('search.from').toUpperCase()}</span>} rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                                <DynamicLocationSearchInput placeholder={t('search.pickupPlaceholder')} onSelect={(val, lat, lng) => { form.setFieldsValue({ pickup: val, pickupLat: lat, pickupLng: lng }); }} />
                            </Form.Item>
                            <div style={{ height: 1, background: '#e2e8f0', marginBottom: 8 }} />
                            <Form.Item name="dropoff" label={<span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{t('booking.to')}</span>} rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                                <DynamicLocationSearchInput placeholder={t('booking.dropoffPlaceholder')} onSelect={(val, lat, lng) => { form.setFieldsValue({ dropoff: val, dropoffLat: lat, dropoffLng: lng }); }} />
                            </Form.Item>
                        </div>

                        {/* Dates Card — gidiş + dönüş aynı kart */}
                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px 4px', border: '1px solid #e2e8f0', marginBottom: 14 }}>
                            {/* Gidiş */}
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>{editType === 'ROUND_TRIP' ? t('booking.departure') : t('booking.dateAndTime')}</div>
                            <Row gutter={8} style={{ marginBottom: editType === 'ROUND_TRIP' ? 8 : 4 }}>
                                <Col span={14}><Form.Item name="date" rules={[{ required: true }]} style={{ marginBottom: 0 }}><DatePicker style={{ width: '100%', borderRadius: 7 }} format="DD.MM.YYYY" disabledDate={(c) => c && c < dayjs().startOf('day')} /></Form.Item></Col>
                                <Col span={10}><Form.Item name="time" rules={[{ required: true }]} style={{ marginBottom: 0 }}><TimePicker style={{ width: '100%', borderRadius: 7 }} format="HH:mm" minuteStep={15} /></Form.Item></Col>
                            </Row>
                            {/* Dönüş — sadece ROUND_TRIP */}
                            {editType === 'ROUND_TRIP' && (<>
                                <div style={{ height: 1, background: '#bae6fd', margin: '8px 0 6px' }} />
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', marginBottom: 6 }}>{t('booking.returnLabel')}</div>
                                <Row gutter={8} style={{ marginBottom: 4 }}>
                                    <Col span={14}><Form.Item name="returnDate" rules={[{ required: true, message: t('booking.returnDateRequired') }]} style={{ marginBottom: 0 }}><DatePicker style={{ width: '100%', borderRadius: 7 }} format="DD.MM.YYYY" disabledDate={(c) => { const ob = form.getFieldValue('date'); return c && c < (ob || dayjs()).startOf('day'); }} /></Form.Item></Col>
                                    <Col span={10}><Form.Item name="returnTime" style={{ marginBottom: 0 }}><TimePicker style={{ width: '100%', borderRadius: 7 }} format="HH:mm" minuteStep={15} /></Form.Item></Col>
                                </Row>
                            </>)}
                        </div>

                        {/* Footer Buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button onClick={() => setIsEditModalVisible(false)} style={{ flex: 1, height: 40, borderRadius: 9, fontWeight: 600, border: '1.5px solid #e2e8f0', color: '#64748b' }}>{t('common.cancel')}</Button>
                            <Button htmlType="submit" style={{ flex: 2, height: 40, borderRadius: 9, fontWeight: 700, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>{t('booking.updateAndSearch')}</Button>
                        </div>
                    </Form>
                </div>
            </Modal>
            <Footer style={{ textAlign: 'center', background: '#fff' }}>{branding.companyName} ©{new Date().getFullYear()}</Footer>
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
