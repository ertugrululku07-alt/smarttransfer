'use client';

import React, { useState, useEffect } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import { useCurrency } from '@/app/context/CurrencyContext';
import { Card, Button, Form, Input, Typography, message, DatePicker, InputNumber, Row, Col, Spin, Alert, Tag, Space, Divider, Radio, Select, TimePicker, Checkbox, Modal, Tooltip } from 'antd';
import { SearchOutlined, ArrowLeftOutlined, CarOutlined, UserOutlined, ClockCircleOutlined, SendOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../../AgencyLayout';
import AgencyGuard from '../../AgencyGuard';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
import MapPickerModal from '@/app/components/MapPickerModal';
import BookingVoucher from '@/app/components/BookingVoucher';
import rawCountries from 'world-countries';

const { Title, Text } = Typography;

interface HourlyResult {
    vehicleTypeId: string;
    vehicleType: string;
    category: string;
    capacity: number;
    luggage: number;
    image?: string;
    features: string[];
    description?: string;
    currency: string;
    hourlyRate: number;
    totalPrice: number;
    hours: number;
}

const AgencyHourlyPage = () => {
    const { currencies: defCurrencies } = useDefinitions();
    const { currencies: ctxCurrencies } = useCurrency();
    const activeCurrencies = defCurrencies.length > 0 ? defCurrencies : ctxCurrencies.map(c => ({ ...c, id: c.code }));
    const getCurrencySymbol = (code: string) => {
        const c = activeCurrencies.find(cur => cur.code === code);
        return c?.symbol || code + ' ';
    };

    const [currentStep, setCurrentStep] = useState<'search' | 'results' | 'details' | 'success'>('search');
    const [loading, setLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState<any>(null);

    // Search State
    const [pickup, setPickup] = useState('');
    const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [date, setDate] = useState<Dayjs | null>(null);
    const [timeValue, setTimeValue] = useState<Dayjs | null>(dayjs().hour(10).minute(0));
    const [hours, setHours] = useState<number>(3);
    const [passengers, setPassengers] = useState<number>(1);

    // Results
    const [results, setResults] = useState<HourlyResult[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState<HourlyResult | null>(null);

    // Form & Agency info
    const [form] = Form.useForm();
    const [agencyBalance, setAgencyBalance] = useState<number>(0);
    const [agencyInfo, setAgencyInfo] = useState<any>(null);
    const [tenantInfo, setTenantInfo] = useState<any>(null);
    const [hasActivePOS, setHasActivePOS] = useState<boolean>(false);

    // Map Modal
    const [mapModalVisible, setMapModalVisible] = useState(false);

    // Countries
    const COUNTRIES = React.useMemo(() => {
        let list = rawCountries.map((c: any) => ({
            code: c.cca2,
            name: c.name.common,
            dial: c.idd?.root ? (c.idd.root + (c.idd.suffixes?.[0] || '')) : '',
            flag: c.flag
        }));
        list.sort((a: any, b: any) => a.name.localeCompare(b.name));
        const trIndex = list.findIndex((c: any) => c.code === 'TR');
        if (trIndex > -1) {
            const tr = list.splice(trIndex, 1)[0];
            tr.name = 'Turkey (Türkiye)';
            list.unshift(tr);
        }
        return list;
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const resAgency = await apiClient.get('/api/agency/settings');
                if (resAgency.data?.success && resAgency.data?.data) {
                    setAgencyBalance(Number(resAgency.data.data.balance || 0));
                    setAgencyInfo(resAgency.data.data);
                }
                const resTenant = await apiClient.get('/api/tenant/info');
                if (resTenant.data?.success && resTenant.data?.data?.tenant) {
                    setTenantInfo(resTenant.data.data.tenant);
                }
                try {
                    const resProviders = await apiClient.get('/api/tenant/payment-providers');
                    if (resProviders.data?.success && resProviders.data?.data?.paymentProviders) {
                        const providers = resProviders.data.data.paymentProviders;
                        const anyActive = Object.values(providers).some((p: any) => p?.enabled === true);
                        setHasActivePOS(anyActive);
                    }
                } catch { setHasActivePOS(false); }
            } catch (err) { console.error('Failed to fetch initial data', err); }
        };
        fetchData();
    }, []);

    const handleSearch = async () => {
        if (!pickup || !date) {
            message.warning('Lütfen alış noktası ve tarihi doldurun.');
            return;
        }
        try {
            setLoading(true);
            const res = await apiClient.get('/api/transfer/hourly-search', {
                params: { pickup, date: date.format('YYYY-MM-DD'), time: timeValue?.format('HH:mm') || '10:00', hours, passengers }
            });
            if (res.data.success) {
                setResults(res.data.data);
                setCurrentStep('results');
            } else {
                message.error('Arama sonuçları alınamadı.');
            }
        } catch (err: any) {
            message.error(err.response?.data?.error || 'Arama sırasında bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const agencyMarkupRate = Number(agencyInfo?.markup || 0);

    const handleSelectVehicle = (vehicle: HourlyResult) => {
        setSelectedVehicle(vehicle);
        setCurrentStep('details');

        const fullDate = date?.hour(timeValue?.hour() ?? 10).minute(timeValue?.minute() ?? 0).second(0);
        const markedUpPrice = Math.round(vehicle.totalPrice * (1 + agencyMarkupRate / 100) * 100) / 100;

        form.setFieldsValue({
            startDate: fullDate,
            passengers: passengers,
            amount: markedUpPrice,
            passengersList: [],
            wantsInvoice: false,
            paymentMethod: 'BALANCE',
            contactNationality: 'TR',
            hours: hours
        });
    };

    const handleSave = async (values: any) => {
        if (!selectedVehicle) return;
        try {
            setLoading(true);

            const b2bCost = selectedVehicle.totalPrice;
            if (values.paymentMethod === 'BALANCE' && agencyBalance < b2bCost) {
                message.error(`Yetersiz bakiye. Minimum ${b2bCost} ${selectedVehicle.currency} gerekli.`);
                setLoading(false);
                return;
            }

            const startDateWithTime = date
                ? date.hour(timeValue?.hour() ?? 10).minute(timeValue?.minute() ?? 0).second(0).millisecond(0)
                : (values.startDate || null);

            const payload = {
                ...values,
                type: 'HOURLY',
                pickup,
                dropoff: pickup,
                pickupLat: pickupLocation?.lat,
                pickupLng: pickupLocation?.lng,
                startDate: startDateWithTime ? startDateWithTime.toISOString() : undefined,
                vehicleId: selectedVehicle.vehicleTypeId,
                vehicleType: selectedVehicle.vehicleType,
                providerPrice: selectedVehicle.totalPrice,
                currency: selectedVehicle.currency,
                amount: values.amount,
                passengers: values.passengers || passengers,
                contactEmail: values.contactEmail || 'guest@example.com',
                metadata: {
                    pickup,
                    pickupLat: pickupLocation?.lat,
                    pickupLng: pickupLocation?.lng,
                    vehicleType: selectedVehicle.vehicleType,
                    contactNationality: values.contactNationality,
                    customerNotes: values.customerNotes,
                    wantsInvoice: values.wantsInvoice,
                    agencyNotes: values.agencyNotes,
                    paymentMethod: values.paymentMethod,
                    isHourly: true,
                    hours: hours,
                    hourlyRate: selectedVehicle.hourlyRate
                }
            };

            const response = await apiClient.post('/api/agency/bookings', payload);
            const booking = response.data.data;
            setBookingResult(booking);

            if (values.paymentMethod !== 'CREDIT_CARD') {
                setCurrentStep('success');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                try {
                    const resAgency = await apiClient.get('/api/agency/settings');
                    if (resAgency.data?.success) setAgencyBalance(Number(resAgency.data.data.balance || 0));
                } catch { }
            }
        } catch (err: any) {
            message.error(err.response?.data?.error || 'Rezervasyon oluşturulamadı');
        } finally {
            setLoading(false);
        }
    };

    const renderSearchStep = () => (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px',
                    background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', borderRadius: 50,
                    color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
                    textTransform: 'uppercase', marginBottom: 18
                }}>
                    <ClockCircleOutlined /> Saatlik Araç Kiralama
                </div>
                <h1 style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, margin: '0 0 10px', letterSpacing: -1 }}>
                    Saatlik Araç Kiralayın
                </h1>
                <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
                    İstediğiniz süre kadar şoförlü araç kiralayın
                </p>
            </div>

            <div style={{
                background: 'rgba(255,255,255,0.95)', borderRadius: 24,
                padding: '36px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
                border: '1px solid rgba(255,255,255,0.8)'
            }}>
                {/* Pickup */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>📍 Alış Noktası</label>
                    <DynamicLocationSearchInput
                        size="large"
                        placeholder="Otel, Adres, Havaalanı"
                        value={pickup}
                        onChange={setPickup}
                        onSelect={(val, lat, lng) => {
                            setPickup(val);
                            if (lat && lng) setPickupLocation({ lat, lng });
                        }}
                        onMapClick={() => setMapModalVisible(true)}
                        country="TUR"
                    />
                </div>

                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #e5e7eb, transparent)', margin: '8px 0 24px' }} />

                <Row gutter={[16, 16]}>
                    <Col xs={24} md={6}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>📅 Tarih</label>
                        <DatePicker
                            size="large"
                            style={{ width: '100%' }}
                            format="DD.MM.YYYY"
                            placeholder="Tarih seçin"
                            value={date}
                            onChange={setDate}
                            disabledDate={(current) => current && current < dayjs().startOf('day')}
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>🕐 Saat</label>
                        <TimePicker
                            size="large"
                            style={{ width: '100%' }}
                            format="HH:mm"
                            minuteStep={15}
                            value={timeValue}
                            onChange={(v) => setTimeValue(v)}
                            placeholder="Saat seçin"
                            needConfirm={false}
                            showNow={false}
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>⏱ Süre (Saat)</label>
                        <InputNumber
                            size="large"
                            min={1}
                            max={24}
                            style={{ width: '100%' }}
                            value={hours}
                            onChange={(v) => setHours(v || 1)}
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>👥 Yolcu</label>
                        <InputNumber
                            size="large"
                            min={1}
                            max={50}
                            style={{ width: '100%' }}
                            value={passengers}
                            onChange={(v) => setPassengers(v || 1)}
                        />
                    </Col>
                </Row>

                <div style={{ marginTop: 28 }}>
                    <button onClick={handleSearch} disabled={loading} style={{
                        width: '100%', padding: '16px 0',
                        background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                        color: '#fff', border: 'none', borderRadius: 14,
                        fontSize: 16, fontWeight: 800, cursor: loading ? 'wait' : 'pointer',
                        boxShadow: '0 8px 28px rgba(245,158,11,0.35)',
                        transition: 'all 0.2s', letterSpacing: 0.3
                    }}>
                        {loading ? 'Aranıyor...' : <><SearchOutlined /> Araçları Listele</>}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderResultsStep = () => (
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #78350f 0%, #92400e 60%, #b45309 100%)',
                borderRadius: 20, padding: '20px 28px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
            }}>
                <button onClick={() => setCurrentStep('search')} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: 13
                }}>
                    ← Yeni Arama
                </button>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Saatlik Kiralama</div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 2 }}>{pickup}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Tarih</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{date?.format('DD MMM YYYY')}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Süre</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{hours} Saat</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Yolcu</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{passengers} Kişi</div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Bulunan</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{results.length} Araç</div>
                    </div>
                </div>
            </div>

            {results.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>🚗</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>Uygun Araç Bulunamadı</div>
                    <div style={{ color: '#64748b', marginTop: 8 }}>Bu kriter için saatlik kiralama yapılabilecek araç yok</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {results.map((result, idx) => (
                        <div key={result.vehicleTypeId} style={{
                            background: '#fff', borderRadius: 18, overflow: 'hidden',
                            border: '1px solid #f1f5f9', display: 'flex',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.05)', transition: 'all 0.22s ease'
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(245,158,11,0.14)';
                            (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(245,158,11,0.25)';
                            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)';
                            (e.currentTarget as HTMLDivElement).style.border = '1px solid #f1f5f9';
                            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                        }}>
                            {/* Image */}
                            <div style={{
                                width: 210, flexShrink: 0, minHeight: 155,
                                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative', overflow: 'hidden'
                            }}>
                                {result.image
                                    ? <img src={result.image} alt={result.vehicleType} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                                    : <CarOutlined style={{ fontSize: 54, color: '#f59e0b', opacity: 0.25 }} />}
                                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <span style={{
                                        background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                                        color: '#fff', padding: '3px 11px', borderRadius: 50,
                                        fontSize: 10, fontWeight: 800
                                    }}>{result.vehicleType}</span>
                                    <span style={{
                                        background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '3px 10px',
                                        borderRadius: 50, fontSize: 10, fontWeight: 700
                                    }}>⏱ {hours} Saat</span>
                                </div>
                            </div>

                            {/* Middle Info */}
                            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>{result.vehicleType}</div>
                                    {result.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{result.description}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151' }}>
                                        👤 {result.capacity} Yolcu
                                    </span>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151' }}>
                                        🧳 {result.luggage} Bavul
                                    </span>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#92400e' }}>
                                        💰 {getCurrencySymbol(result.currency)}{result.hourlyRate}/saat
                                    </span>
                                </div>
                            </div>

                            {/* Price Panel */}
                            <div style={{
                                width: 195, flexShrink: 0,
                                background: 'linear-gradient(180deg, #78350f 0%, #92400e 100%)',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'center', alignItems: 'center',
                                padding: '20px 16px', gap: 2
                            }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:1, marginBottom: 2 }}>
                                    {hours} Saatlik Fiyat
                                </div>
                                <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                                    {getCurrencySymbol(result.currency)}{Math.round(result.totalPrice * (1 + agencyMarkupRate / 100)).toLocaleString('tr-TR')}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>{result.currency}</div>
                                <button onClick={() => handleSelectVehicle(result)} style={{
                                    width: '100%', padding: '10px 0',
                                    background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                                    color: '#fff', border: 'none', borderRadius: 11,
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(245,158,11,0.45)', transition: 'all 0.18s'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                                    Seç ve İlerle →
                                </button>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                                    B2B: {getCurrencySymbol(result.currency)}{result.totalPrice.toLocaleString('tr-TR')}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderDetailsStep = () => (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
            {/* Vehicle Summary Header */}
            {selectedVehicle && (
                <div style={{
                    background: 'linear-gradient(135deg, #78350f 0%, #92400e 60%, #b45309 100%)',
                    borderRadius: 20, padding: '20px 28px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.22)'
                }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep('results')}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', borderRadius: 10 }}>
                        Araçlara Dön
                    </Button>
                    <div style={{ width: 72, height: 52, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedVehicle.image
                            ? <img src={selectedVehicle.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            : <CarOutlined style={{ fontSize: 28, color: 'rgba(255,255,255,0.4)' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: '#fff', padding: '2px 11px', borderRadius: 50, fontSize: 11, fontWeight: 700 }}>{selectedVehicle.vehicleType}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>· Saatlik Kiralama</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                            📍 <span style={{ fontWeight: 600 }}>{pickup}</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex', gap: 14, marginTop: 3 }}>
                            <span>📅 {date?.format('DD MMM YYYY')}</span>
                            <span>⏰ {timeValue?.format('HH:mm')}</span>
                            <span>⏱ {hours} Saat</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>B2B Fiyat</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24', lineHeight: 1.1 }}>
                            {getCurrencySymbol(selectedVehicle.currency)}{selectedVehicle.totalPrice.toLocaleString('tr-TR')}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{selectedVehicle.currency}</div>
                    </div>
                </div>
            )}

            <Form form={form} layout="vertical" onFinish={handleSave}>
                {/* Section 1: Passenger Info */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>👤</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Yolcu Bilgileri</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Ana yolcu iletişim bilgileri</div>
                        </div>
                    </div>
                    <Row gutter={[20, 0]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactName" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Ad Soyad</span>} rules={[{ required: true, message: 'Ad soyad zorunludur' }]}>
                                <Input placeholder="Müşterinizin adı soyadı" size="large" style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactPhone" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Telefon</span>} rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                                <Input placeholder="555 123 45 67" size="large" style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactEmail" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>E-posta</span>} rules={[{ required: true, type: 'email' }]}>
                                <Input placeholder="ornek@email.com" size="large" style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactNationality" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Uyruk</span>} rules={[{ required: true }]}>
                                <Select placeholder="Uyruk Seçiniz" size="large" showSearch
                                    filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                                    options={COUNTRIES.map((c: any) => ({ label: c.name, value: c.code }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>

                {/* Section 2: Details */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <Row gutter={[20, 0]}>
                        <Col xs={24} md={8}>
                            <Form.Item name="startDate" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Başlangıç Tarihi & Saati</span>} rules={[{ required: true }]}>
                                <DatePicker showTime style={{ width: '100%', borderRadius: 10 }} format="YYYY-MM-DD HH:mm" size="large" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="hours" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Süre (Saat)</span>}>
                                <InputNumber min={1} max={24} style={{ width: '100%', borderRadius: 10 }} size="large" disabled />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="passengers" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Yolcu Sayısı</span>} rules={[{ required: true }]}>
                                <InputNumber min={1} max={selectedVehicle?.capacity || 50} style={{ width: '100%', borderRadius: 10 }} size="large" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="customerNotes" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Sürücüye Not <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Opsiyonel)</span></span>} style={{ marginBottom: 0 }}>
                        <Input placeholder="Özel istek, karşılama tabelası vb." size="large" style={{ borderRadius: 10 }} />
                    </Form.Item>
                </div>

                {/* Notes & Invoice */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <Form.Item name="agencyNotes" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Acente Notu <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Opsiyonel)</span></span>} style={{ marginBottom: 12 }}>
                        <Input.TextArea rows={2} placeholder="Dahili notlar..." style={{ borderRadius: 10 }} />
                    </Form.Item>
                    <Form.Item name="wantsInvoice" valuePropName="checked" style={{ marginBottom: 0 }}>
                        <Checkbox><span style={{ fontWeight: 600, color: '#374151' }}>Fatura İstiyorum</span></Checkbox>
                    </Form.Item>
                </div>

                {/* Payment */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#f43f5e,#fb7185)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>💳</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Ödeme Yöntemi</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Cari bakiye: {agencyBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</div>
                        </div>
                    </div>
                    <Form.Item name="paymentMethod" initialValue="BALANCE" style={{ marginBottom: 0 }}>
                        <Radio.Group style={{ width: '100%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Radio value="BALANCE">
                                    <div style={{ paddingLeft: 6 }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>🏦 Cari Hesaptan Öde</div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>Bakiye: {agencyBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</div>
                                    </div>
                                </Radio>
                                <Radio value="PAY_IN_VEHICLE">
                                    <div style={{ paddingLeft: 6 }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>💵 Araçta Nakit Ödeme</div>
                                    </div>
                                </Radio>
                            </div>
                        </Radio.Group>
                    </Form.Item>
                </div>

                {/* Sale Price */}
                <div style={{ background: 'linear-gradient(135deg,#78350f,#92400e)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 28px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>💰</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Satış Tutarı</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Müşterinize satacağınız fiyatı belirleyin</div>
                        </div>
                    </div>
                    <Form.Item name="amount"
                        label={<span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 13 }}>Müşteriden Alınacak Tutar</span>}
                        rules={[{ required: true, message: 'Satış tutarı zorunludur' }]}
                        extra={<span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>B2B maliyet: {getCurrencySymbol(selectedVehicle?.currency || 'TRY')}{(selectedVehicle?.totalPrice || 0).toLocaleString('tr-TR')}</span>}
                        style={{ marginBottom: 0 }}>
                        <InputNumber min={selectedVehicle?.totalPrice || 0} style={{ width: '100%', borderRadius: 10 }} size="large"
                            addonAfter={<span style={{ fontWeight: 700, color: '#fff' }}>{selectedVehicle?.currency || 'TRY'}</span>} />
                    </Form.Item>
                </div>

                <div style={{ textAlign: 'center', paddingBottom: 32 }}>
                    <Button type="primary" htmlType="submit" loading={loading} size="large" style={{
                        minWidth: 260, height: 52, fontSize: 15, fontWeight: 700,
                        background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', border: 'none', borderRadius: 14,
                        boxShadow: '0 8px 24px rgba(245,158,11,0.4)'
                    }}>
                        🎯 Rezervasyonu Tamamla
                    </Button>
                </div>
            </Form>
        </div>
    );

    const renderSuccessStep = () => (
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{
                background: 'linear-gradient(135deg, #78350f 0%, #b45309 50%, #f59e0b 100%)',
                borderRadius: 28, padding: '52px 40px', textAlign: 'center', marginBottom: 24,
                position: 'relative', overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(120,53,15,0.35)'
            }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
                <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
                <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 800, margin: '0 0 12px' }}>Kiralama Tamamlandı!</h2>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, margin: '0 0 28px' }}>
                    Saatlik araç kiralama rezervasyonu başarıyla oluşturuldu.
                </p>
                <div style={{
                    display: 'inline-block', background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(10px)', borderRadius: 16,
                    padding: '14px 32px', border: '1px solid rgba(255,255,255,0.25)'
                }}>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Rezervasyon No</div>
                    <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, letterSpacing: 2, marginTop: 4 }}>
                        {bookingResult?.bookingNumber || '...'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => {
                    form.resetFields(); setCurrentStep('search');
                    setPickup(''); setDate(null); setSelectedVehicle(null);
                }} style={{
                    padding: '14px 32px', borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff',
                    fontWeight: 700, fontSize: 15, boxShadow: '0 6px 20px rgba(245,158,11,0.35)'
                }}>➕ Yeni Kiralama</button>
                <button onClick={() => window.open('/agency/transfers', '_blank')} style={{
                    padding: '14px 32px', borderRadius: 14, border: '1px solid #e5e7eb', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.95)', color: '#374151', fontWeight: 700, fontSize: 15
                }}>📋 Transferlerim</button>
            </div>
        </div>
    );

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="hourly-rental">
                <MapPickerModal
                    visible={mapModalVisible}
                    onCancel={() => setMapModalVisible(false)}
                    onConfirm={(address: string, lat: number, lng: number) => {
                        setPickup(address);
                        setPickupLocation({ lat, lng });
                    }}
                    initialAddress={pickup}
                    title="Alış Noktası"
                    country="tr"
                />
                <div style={{
                    minHeight: '100vh',
                    background: currentStep === 'search'
                        ? 'linear-gradient(160deg, #fffbeb 0%, #fef3c7 30%, #fde68a 70%, #f0fdf4 100%)'
                        : currentStep === 'success'
                        ? 'linear-gradient(160deg, #f0fdf4 0%, #dcfce7 30%, #fffbeb 100%)'
                        : 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
                    padding: '40px 24px',
                    borderRadius: 16,
                    transition: 'background 0.6s ease'
                }}>
                    {currentStep === 'search' && renderSearchStep()}
                    {currentStep === 'results' && renderResultsStep()}
                    {currentStep === 'details' && renderDetailsStep()}
                    {currentStep === 'success' && renderSuccessStep()}
                </div>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyHourlyPage;
