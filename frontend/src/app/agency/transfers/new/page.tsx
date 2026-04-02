'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Input, Typography, message, DatePicker, InputNumber, Row, Col, Spin, Alert, Tag, Space, Divider, Radio, Select, TimePicker, Checkbox, Collapse, Modal, Tooltip } from 'antd';
import { SearchOutlined, ArrowRightOutlined, ArrowLeftOutlined, CarOutlined, UserOutlined, SafetyCertificateOutlined, WifiOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../../AgencyLayout';
import AgencyGuard from '../../AgencyGuard';
import HereLocationSearchInput from '@/app/components/HereLocationSearchInput';
import MapPickerModal from '@/app/components/MapPickerModal';
import PassengerSelector from '@/app/components/PassengerSelector';
import BookingVoucher from '@/app/components/BookingVoucher';
import { getRouteDetails } from '@/lib/routing';
import rawCountries from 'world-countries';

const { Title, Text, Paragraph } = Typography;

interface TransferResult {
    id: string;
    vehicleType: string;
    vendor: string;
    price: number;
    basePrice?: number;
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

const AgencyNewTransferPage = () => {
    // Top level state
    const [currentStep, setCurrentStep] = useState<'search' | 'results' | 'details' | 'success'>('search');
    const [loading, setLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState<any>(null);

    // Step 1: Search State
    const [pickup, setPickup] = useState('');
    const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [dropoff, setDropoff] = useState('');
    const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [date, setDate] = useState<Dayjs | null>(null);
    const [pickupHour, setPickupHour] = useState<string>('12');
    const [pickupMinute, setPickupMinute] = useState<string>('00');
    const [passengerCounts, setPassengerCounts] = useState({ adults: 1, children: 0, babies: 0 });
    const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ONE_WAY');

    // Map Modal State
    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [mapModalType, setMapModalType] = useState<'pickup' | 'dropoff'>('pickup');

    // Step 2: Results State
    const [results, setResults] = useState<TransferResult[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [routeStats, setRouteStats] = useState<{ distance: string | number; duration: string | number } | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<TransferResult | null>(null);

    // Step 3: Extra Services & Form
    const [form] = Form.useForm();
    const [extraServicesList, setExtraServicesList] = useState<any[]>([]);
    const [loadingExtraServices, setLoadingExtraServices] = useState(false);
    const [agencyBalance, setAgencyBalance] = useState<number>(0);
    const [agencyInfo, setAgencyInfo] = useState<any>(null);
    const [tenantInfo, setTenantInfo] = useState<any>(null);
    const [hasActivePOS, setHasActivePOS] = useState<boolean>(false);
    const [paymentHtml, setPaymentHtml] = useState<string | null>(null);
    const [paymentModalVisible, setPaymentModalVisible] = useState(false);

    // Initial Data Fetch (Agency, Tenant & Payment Providers)
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Agency Settings & Balance
                const resAgency = await apiClient.get('/api/agency/settings');
                if (resAgency.data?.success && resAgency.data?.data) {
                    setAgencyBalance(Number(resAgency.data.data.balance || 0));
                    setAgencyInfo(resAgency.data.data);
                }

                // Fetch Public Tenant Info for Voucher
                const resTenant = await apiClient.get('/api/tenant/info');
                if (resTenant.data?.success && resTenant.data?.data?.tenant) {
                    setTenantInfo(resTenant.data.data.tenant);
                }

                // Check if tenant has an active Virtual POS provider
                try {
                    const resProviders = await apiClient.get('/api/tenant/payment-providers');
                    if (resProviders.data?.success && resProviders.data?.data?.paymentProviders) {
                        const providers = resProviders.data.data.paymentProviders;
                        const anyActive = Object.values(providers).some((p: any) => p?.enabled === true);
                        setHasActivePOS(anyActive);
                    }
                } catch {
                    setHasActivePOS(false);
                }
            } catch (err) {
                console.error('Failed to fetch initial data', err);
            }
        };
        fetchData();
    }, []);

    // Full Country List (Turkey at top) generated from world-countries
    const COUNTRIES = React.useMemo(() => {
        let list = rawCountries.map((c: any) => ({
            code: c.cca2,
            name: c.name.common,
            dial: c.idd?.root ? (c.idd.root + (c.idd.suffixes?.[0] || '')) : '',
            flag: c.flag
        }));

        // Sort alphabetically
        list.sort((a: any, b: any) => a.name.localeCompare(b.name));

        // Extract Turkey and put it at the top
        const trIndex = list.findIndex((c: any) => c.code === 'TR');
        if (trIndex > -1) {
            const tr = list.splice(trIndex, 1)[0];
            tr.name = 'Turkey (Türkiye)'; // Localized name
            list.unshift(tr);
        }
        return list;
    }, []);

    // Reset step if search params change to prevent stale data
    useEffect(() => {
        if (currentStep === 'results' && results.length === 0) {
            setCurrentStep('search');
        }
    }, []);

    const openMapModal = (type: 'pickup' | 'dropoff') => {
        setMapModalType(type);
        setMapModalVisible(true);
    };

    const handleMapConfirm = (address: string, lat: number, lng: number) => {
        if (mapModalType === 'pickup') {
            setPickup(address);
            setPickupLocation({ lat, lng });
        } else {
            setDropoff(address);
            setDropoffLocation({ lat, lng });
        }
    };

    const handleSearch = async () => {
        if (!pickup || !dropoff || !date) {
            message.warning('Lütfen alış noktası, bırakış noktası ve tarihi doldurun.');
            return;
        }

        try {
            setLoading(true);
            setSearchError(null);

            const totalPassengers = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
            const pickupDateTime = `${date.format('YYYY-MM-DD')}T${pickupHour}:${pickupMinute}:00.000Z`;

            let distance: number | undefined;
            let encodedPolyline: string | undefined;
            if (pickup && dropoff) {
                try {
                    const route = await getRouteDetails(pickup, dropoff);
                    if (route) {
                        distance = route.distanceKm;
                        encodedPolyline = route.encodedPolyline;
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
                passengers: totalPassengers || 1,
                transferType: tripType,
                distance,
                encodedPolyline,
                pickupLat: pickupLocation?.lat,
                pickupLng: pickupLocation?.lng
            };

            const res = await apiClient.post('/api/transfer/search', payload);

            if (res.data.success) {
                setResults(res.data.data.results);
                setCurrentStep('results');
            } else {
                setSearchError('Arama sonuçları alınamadı.');
            }
        } catch (err: any) {
            console.error('Search error:', err);
            setSearchError(err.response?.data?.error || 'Arama sırasında bir hata oluştu');
            setCurrentStep('results'); // Still move to show the error state
        } finally {
            setLoading(false);
        }
    };

    const fetchExtraServices = async () => {
        try {
            setLoadingExtraServices(true);
            const res = await apiClient.get('/api/extra-services');
            if (res.data.success) {
                // If it's a shuttle, filter out those excluded from shuttle
                const services = res.data.data.filter((s: any) =>
                    selectedVehicle?.isShuttle ? !s.excludeFromShuttle : true
                );
                // add default quantity 0 to each
                setExtraServicesList(services.map((s: any) => ({ ...s, quantity: 0 })));
            }
        } catch (error) {
            console.error('Error fetching extra services:', error);
        } finally {
            setLoadingExtraServices(false);
        }
    };

    const handleSelectVehicle = (vehicle: TransferResult) => {
        setSelectedVehicle(vehicle);
        setCurrentStep('details');

        // Fetch services in background when vehicle selected
        fetchExtraServices();

        const fullDate = date?.hour(parseInt(pickupHour)).minute(parseInt(pickupMinute)).second(0);
        const totalPax = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;

        // Form'u yolcu listesi ile başlat (1. yolcu ana formda)
        const otherPax = Math.max(0, totalPax - 1);
        const initialPassengers = Array.from({ length: otherPax }, () => ({
            firstName: '', lastName: '', nationality: ''
        }));

        form.setFieldsValue({
            startDate: fullDate,
            passengers: totalPax,
            amount: vehicle.price,
            passengersList: initialPassengers,
            wantsInvoice: false,
            paymentMethod: 'BALANCE',
            contactNationality: 'TR'
        });
    };

    const handleSave = async (values: any) => {
        if (!selectedVehicle) return;

        try {
            setLoading(true);

            // B2B Pre-validation
            if (values.paymentMethod === 'BALANCE') {
                const b2bCost = selectedVehicle.basePrice || selectedVehicle.price;
                if (agencyBalance < b2bCost) {
                    message.error(`Yetersiz bakiye. Bu işlem için minimum ${b2bCost} ${selectedVehicle.currency} bakiye gerekmektedir.`);
                    setLoading(false);
                    return;
                }
            }

            // B2B payload
            // Construct the correct startDate using the date + pickupHour + pickupMinute from state
            const startDateWithTime = date
                ? date.hour(parseInt(pickupHour, 10)).minute(parseInt(pickupMinute, 10)).second(0).millisecond(0)
                : (values.startDate || null);

            const payload = {
                ...values,
                type: 'TRANSFER',
                pickup,
                dropoff,
                startDate: startDateWithTime ? startDateWithTime.toISOString() : undefined,
                vehicleId: selectedVehicle.id,
                vehicleType: selectedVehicle.vehicleType,
                providerPrice: selectedVehicle.basePrice || selectedVehicle.price,
                amount: values.amount,
                passengers: values.passengers || (passengerCounts.adults + passengerCounts.children + passengerCounts.babies),
                passengersList: values.passengersList,
                contactEmail: values.contactEmail || 'guest@example.com',
                metadata: {
                    pickup,
                    dropoff,
                    vehicleType: selectedVehicle.vehicleType,
                    contactNationality: values.contactNationality,
                    flightNumber: values.flightNumber,
                    customerNotes: values.customerNotes,
                    wantsInvoice: values.wantsInvoice,
                    agencyNotes: values.agencyNotes,
                    paymentMethod: values.paymentMethod,
                    extraServices: extraServicesList.filter((s: any) => s.quantity > 0)
                }
            };

            const response = await apiClient.post('/api/agency/bookings', payload);
            const booking = response.data.data;

            // Virtual POS Integration - Credit Card Payment
            if (values.paymentMethod === 'CREDIT_CARD') {
                try {
                    const paymentRes = await apiClient.post('/api/payment/init', {
                        amount: values.amount,
                        currency: selectedVehicle.currency || 'TRY',
                        orderId: booking.bookingNumber,
                        user: {
                            email: values.contactEmail || 'guest@example.com',
                            name: values.contactName,
                            phone: values.contactPhone
                        },
                        basket: [
                            { name: `Transfer: ${pickup} - ${dropoff}`, price: values.amount, category: 'Transfer' }
                        ]
                    });

                    if (paymentRes.data.success && paymentRes.data.data?.html) {
                        setPaymentHtml(paymentRes.data.data.html);
                        setPaymentModalVisible(true);
                        setBookingResult(booking);
                        return; // Show Virtual POS modal, halt further steps
                    } else {
                        // Payment init returned a non-success but no HTML
                        message.error('Ödeme sistemi başlatılamadı: ' + (paymentRes.data.error || 'Bilinmeyen hata'));
                        // Still show success screen so user can see their booking number
                        setBookingResult(booking);
                        setCurrentStep('success');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        return;
                    }
                } catch (paymentErr: any) {
                    const errMsg = paymentErr.response?.data?.error || paymentErr.message || 'Ödeme sistemi hatası';
                    console.error('Virtual POS Init Error:', paymentErr);
                    message.error(`Ödeme başlatılamadı: ${errMsg}. Rezervasyonunuz kaydedildi, yöneticinizle iletişime geçin.`);
                    setBookingResult(booking);
                    setCurrentStep('success');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
            }

            message.success('Transfer talebi başarıyla oluşturuldu.');
            setBookingResult(booking);
            setCurrentStep('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error: any) {
            console.error('Create transfer error:', error);
            const errorMsg = error.response?.data?.error || 'Transfer oluşturulurken hata meydana geldi.';
            message.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    // Render Steps
    const renderSearchStep = () => (
        <Card variant="borderless" style={{ maxWidth: 900, margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                <Title level={3} style={{ margin: 0, color: '#1a1a2e' }}>Yeni Transfer Arayın</Title>
                <Text type="secondary">Müşteriniz için en uygun rotayı ve aracı bulun.</Text>
            </div>

            <Row gutter={[16, 24]}>
                <Col xs={24} md={12}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Nereden</Text>
                    <HereLocationSearchInput
                        size="large"
                        placeholder="Havaalanı, Adres, Otel"
                        value={pickup}
                        onChange={setPickup}
                        onSelect={(val, lat, lng) => {
                            setPickup(val);
                            if (lat && lng) setPickupLocation({ lat, lng });
                        }}
                        onMapClick={() => openMapModal('pickup')}
                        country="TUR"
                    />
                </Col>
                <Col xs={24} md={12}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Nereye</Text>
                    <HereLocationSearchInput
                        size="large"
                        placeholder="Havaalanı, Adres, Otel"
                        value={dropoff}
                        onChange={setDropoff}
                        onSelect={(val, lat, lng) => {
                            setDropoff(val);
                            if (lat && lng) setDropoffLocation({ lat, lng });
                        }}
                        onMapClick={() => openMapModal('dropoff')}
                        country="TUR"
                    />
                </Col>

                <Col xs={24} md={6}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Alış Tarihi</Text>
                    <DatePicker
                        size="large"
                        style={{ width: '100%' }}
                        format="DD.MM.YYYY"
                        placeholder="Tarih seçin"
                        value={date}
                        onChange={setDate}
                    />
                </Col>
                <Col xs={24} md={6}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Alış Saati</Text>
                    <Space.Compact style={{ width: '100%' }}>
                        <Select
                            size="large"
                            value={pickupHour}
                            onChange={setPickupHour}
                            style={{ width: '50%' }}
                            options={Array.from({ length: 24 }, (_, i) => ({
                                value: i.toString().padStart(2, '0'),
                                label: i.toString().padStart(2, '0')
                            }))}
                        />
                        <Select
                            size="large"
                            value={pickupMinute}
                            onChange={setPickupMinute}
                            style={{ width: '50%' }}
                            options={['00', '15', '30', '45'].map(m => ({ value: m, label: m }))}
                        />
                    </Space.Compact>
                </Col>
                <Col xs={24} md={6}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Yolcular</Text>
                    <PassengerSelector
                        size="large"
                        value={passengerCounts}
                        onChange={setPassengerCounts}
                    />
                </Col>
                <Col xs={24} md={6}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Transfer Tipi</Text>
                    <Radio.Group
                        value={tripType}
                        onChange={(e) => setTripType(e.target.value)}
                        style={{ width: '100%', display: 'flex' }}
                        size="large"
                    >
                        <Radio.Button value="ONE_WAY" style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>Tek Yön</Radio.Button>
                        <Radio.Button value="ROUND_TRIP" style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>Çift Yön</Radio.Button>
                    </Radio.Group>
                </Col>
            </Row>

            <Button
                type="primary"
                size="large"
                block
                icon={<SearchOutlined />}
                loading={loading}
                onClick={handleSearch}
                style={{ marginTop: 32, height: 50, fontSize: 16 }}
            >
                Araçları Listele
            </Button>
        </Card>
    );

    const renderResultsStep = () => (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep('search')}>
                    Aramaya Dön
                </Button>
                <Title level={4} style={{ margin: 0 }}>
                    {pickup} <ArrowRightOutlined style={{ fontSize: 16, color: '#999', margin: '0 8px' }} /> {dropoff}
                </Title>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '100px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>Araçlar aranıyor...</div>
                </div>
            ) : searchError ? (
                <Alert message="Hata" description={searchError} type="error" showIcon />
            ) : results.length === 0 ? (
                <Alert message="Sonuç Bulunamadı" description="Seçtiğiniz kriterlere uygun araç bulunamadı." type="warning" showIcon />
            ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {results.map((result) => (
                        <Card key={result.id} hoverable styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
                            <Row>
                                <Col xs={24} md={6} style={{ background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, position: 'relative' }}>
                                    {result.image ? (
                                        <img src={result.image} alt={result.vehicleType} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px' }} />
                                    ) : (
                                        <CarOutlined style={{ fontSize: 60, color: '#d9d9d9' }} />
                                    )}
                                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                                        <Tag color="cyan">{result.vehicleType}</Tag>
                                    </div>
                                </Col>
                                <Col xs={24} md={12} style={{ padding: '20px' }}>
                                    <Title level={5} style={{ margin: 0 }}>{result.vehicleType}</Title>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>by {result.vendor}</Text>

                                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                        <Space size="large">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><UserOutlined /> {result.capacity} Yolcu</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SafetyCertificateOutlined /> {result.luggage} Bavul</span>
                                        </Space>
                                        {!result.isShuttle && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ClockCircleOutlined /> Tahmini: {result.estimatedDuration || routeStats?.duration || 'Bilinmiyor'}</span>
                                        )}
                                        {result.features?.includes('WiFi') && (
                                            <Tag icon={<WifiOutlined />} color="blue" bordered={false}>Ücretsiz WiFi</Tag>
                                        )}
                                    </Space>
                                </Col>
                                <Col xs={24} md={6} style={{
                                    padding: '20px',
                                    borderLeft: '1px solid #f0f0f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    background: '#fafafa'
                                }}>
                                    <Text type="secondary">Önerilen Satış</Text>
                                    <Title level={3} style={{ marginTop: 4, marginBottom: 0, color: '#2b6cb0' }}>
                                        {result.currency === 'EUR' ? '€' : '₺'}{result.price}
                                    </Title>
                                    {(result.basePrice && result.basePrice !== result.price) && (
                                        <Text type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
                                            B2B Net: {result.currency === 'EUR' ? '€' : '₺'}{result.basePrice}
                                        </Text>
                                    )}
                                    <Button type="primary" size="large" onClick={() => handleSelectVehicle(result)} block style={{ marginTop: (result.basePrice && result.basePrice !== result.price) ? 0 : 16 }}>
                                        Seç ve İlerle
                                    </Button>
                                </Col>
                            </Row>
                        </Card>
                    ))}
                </Space>
            )}
        </div>
    );

    const renderDetailsStep = () => (
        <Card bordered={false} style={{ maxWidth: 800, margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep('results')}>
                    Araçlara Dön
                </Button>
                <Title level={4} style={{ margin: 0 }}>Müşteri & Tutar Bilgisi</Title>
            </div>

            {selectedVehicle && (
                <Alert
                    title={`Seçilen Araç: ${selectedVehicle.vehicleType} (${selectedVehicle.vendor})`}
                    description={
                        <div style={{ marginTop: 8 }}>
                            <Row>
                                <Col span={12}>
                                    <div><Text type="secondary">Rota:</Text> {pickup} ➔ {dropoff}</div>
                                    <div><Text type="secondary">Tarih:</Text> {date?.format('DD.MM.YYYY')} - {pickupHour}:{pickupMinute}</div>
                                </Col>
                                <Col span={12}>
                                    <div style={{ textAlign: 'right' }}>
                                        <Text type="secondary">B2B Alış Fiyatınız:</Text> <Text strong>{selectedVehicle.basePrice || selectedVehicle.price} {selectedVehicle.currency}</Text>
                                        <br />
                                        <Text type="secondary">Önerilen Satış Fiyatı:</Text> <Text strong style={{ color: '#2b6cb0' }}>{selectedVehicle.price} {selectedVehicle.currency}</Text>
                                    </div>
                                </Col>
                            </Row>
                        </div>
                    }
                    type="info"
                    style={{ marginBottom: 24 }}
                    showIcon
                    icon={<CarOutlined />}
                />
            )}

            <Form form={form} layout="vertical" onFinish={handleSave}>
                <Title level={5}>Yolcu Bilgileri</Title>

                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Form.Item name="contactName" label="Ad Soyad" rules={[{ required: true, message: 'Ad soyad zorunludur' }]}>
                            <Input prefix={<UserOutlined />} placeholder="Adınız Soyadınız" size="large" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item name="contactPhone" label="Telefon Numarası" rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                            <Input
                                addonBefore={
                                    <Select
                                        defaultValue="TR"
                                        style={{ width: 120 }}
                                        popupMatchSelectWidth={false}
                                        showSearch
                                        filterOption={(input, option) =>
                                            (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={COUNTRIES.map((c: any) => ({
                                            label: `${c.flag} ${c.code} (${c.dial})`,
                                            value: c.code
                                        }))}
                                    />
                                }
                                placeholder="555 123 45 67"
                                size="large"
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Form.Item name="contactEmail" label="E-posta Adresi" rules={[{ required: true, type: 'email', message: 'Geçerli bir e-posta giriniz' }]}>
                            <Input placeholder="ornek@email.com" size="large" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item name="contactNationality" label="Uyruk" rules={[{ required: true, message: 'Uyruk zorunludur' }]}>
                            <Select
                                placeholder="Uyruk Seçiniz"
                                size="large"
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                                }
                                options={COUNTRIES.map((c: any) => ({
                                    label: `${c.name}`,
                                    value: c.code
                                }))}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item name="startDate" label="Transfer Tarihi" rules={[{ required: true }]}>
                            <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" size="large" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="passengers" label="Yolcu Sayısı" rules={[{ required: true }]}>
                            <InputNumber
                                min={1}
                                max={currentStep === 'details' && selectedVehicle ? selectedVehicle.capacity : 50}
                                style={{ width: '100%' }}
                                size="large"
                                onChange={(val) => {
                                    if (!val) return;
                                    const currentList = form.getFieldValue('passengersList') || [];
                                    const newList = Array.from({ length: Math.max(0, val - 1) }, (_, i) => {
                                        return currentList[i] || { firstName: '', lastName: '', nationality: '' };
                                    });
                                    form.setFieldsValue({ passengersList: newList });
                                }}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Form.Item name="flightNumber" label="Uçuş Numarası (Opsiyonel)">
                            <Input placeholder="Örn: TK1234" size="large" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item name="customerNotes" label="Sürücüye Not (Opsiyonel)">
                            <Input placeholder="Örn: Bebek koltuğu istiyorum" size="large" />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider />

                <Title level={5}>Diğer Yolcular</Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Lütfen diğer yolcunun kimlik bilgilerini giriniz.</Text>

                <Form.List name="passengersList">
                    {(fields) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {fields.map(({ key, name, ...restField }, index) => (
                                <Card size="small" key={key} title={`${index + 1}. Yolcu`} styles={{ header: { backgroundColor: '#fafafa' } }}>
                                    <Row gutter={16}>
                                        <Col xs={24} md={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'firstName']}
                                                rules={[{ required: true, message: 'Ad giriniz' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="Adı" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'lastName']}
                                                rules={[{ required: true, message: 'Soyad giriniz' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="Soyadı" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'nationality']}
                                                rules={[{ required: true, message: 'Uyruk seçiniz' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Select
                                                    showSearch
                                                    placeholder="Uyruk Seçiniz"
                                                    optionFilterProp="children"
                                                    filterOption={(input, option) =>
                                                        (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())
                                                    }
                                                    options={COUNTRIES.map((country: any) => ({
                                                        value: country.code,
                                                        label: `${country.name} (${country.code})`
                                                    }))}
                                                />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Card>
                            ))}
                        </div>
                    )}
                </Form.List>

                <Divider />

                <Title level={5}>Fatura Bilgileri</Title>
                <Form.Item name="wantsInvoice" valuePropName="checked">
                    <Checkbox>Fatura İstiyorum</Checkbox>
                </Form.Item>

                <Title level={5}>Notlarınız</Title>
                <Form.Item name="agencyNotes">
                    <Input.TextArea rows={3} placeholder="Varsa ek istekleriniz..." />
                </Form.Item>

                <Collapse
                    ghost
                    expandIconPlacement="end"
                    items={[{
                        key: '1',
                        label: <Text strong>Ekstra Hizmetler (Opsiyonel)</Text>,
                        children: (
                            loadingExtraServices ? <Spin size="small" /> :
                                extraServicesList.length === 0 ? <Text type="secondary">Bu araç için ekstra hizmet bulunmuyor.</Text> :
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {extraServicesList.map((service, index) => (
                                            <div key={service.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < extraServicesList.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    {service.image && <img src={service.image} alt={service.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />}
                                                    <div>
                                                        <Text strong style={{ display: 'block' }}>{service.name}</Text>
                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                            {service.price} {service.currency} {service.isPerPerson ? '(Kişi Başı)' : '(Adet)'}
                                                        </Text>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Button
                                                        size="small"
                                                        shape="circle"
                                                        disabled={service.quantity <= 0}
                                                        onClick={() => {
                                                            const newList = [...extraServicesList];
                                                            newList[index].quantity -= 1;
                                                            setExtraServicesList(newList);

                                                            // Auto-adjust form amount
                                                            const currentAmount = form.getFieldValue('amount') || selectedVehicle?.price || 0;
                                                            form.setFieldValue('amount', Math.max(selectedVehicle?.price || 0, currentAmount - service.price));
                                                        }}
                                                    >-</Button>
                                                    <Text style={{ width: 24, textAlign: 'center' }}>{service.quantity}</Text>
                                                    <Button
                                                        size="small"
                                                        shape="circle"
                                                        onClick={() => {
                                                            let maxQty = service.isPerPerson ? passengerCounts.adults + passengerCounts.children + passengerCounts.babies : 10;
                                                            if (service.quantity >= maxQty) return;

                                                            const newList = [...extraServicesList];
                                                            newList[index].quantity += 1;
                                                            setExtraServicesList(newList);

                                                            // Auto-adjust form amount
                                                            const currentAmount = form.getFieldValue('amount') || selectedVehicle?.price || 0;
                                                            form.setFieldValue('amount', currentAmount + service.price);
                                                        }}
                                                    >+</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                        )
                    }]}
                    style={{ background: '#fafafa', borderRadius: 8, marginBottom: 24, border: '1px solid #f0f0f0' }}
                />

                <Title level={5}>Ödeme Yöntemi</Title>
                <Form.Item name="paymentMethod" initialValue="BALANCE">
                    <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Radio value="BALANCE">
                            Cari Hesaptan Öde <Text type="secondary">(Mevcut Bakiye: {agencyBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })})</Text>
                        </Radio>
                        <Tooltip
                            title={!hasActivePOS ? 'Yönetici Paneli\'nde aktif bir Sanal POS tanımlanmamış. Kredi kartı ile ödeme için lütfen yöneticinizle iletişime geçin.' : undefined}
                        >
                            <span style={{ cursor: !hasActivePOS ? 'not-allowed' : 'inherit' }}>
                                <Radio value="CREDIT_CARD" disabled={!hasActivePOS}>
                                    Online Kredi Kartı ile Öde
                                    <Tag color={hasActivePOS ? 'blue' : 'default'} style={{ marginLeft: 8 }}>
                                        {hasActivePOS ? 'Müşteri Öder' : 'Tanımsız'}
                                    </Tag>
                                </Radio>
                            </span>
                        </Tooltip>
                    </Radio.Group>
                </Form.Item>

                <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => prevValues.paymentMethod !== currentValues.paymentMethod}
                >
                    {({ getFieldValue }) => {
                        const method = getFieldValue('paymentMethod');
                        if (method === 'CREDIT_CARD') {
                            return (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Anında 3D Güvenli Ödeme & Kâr Transferi"
                                    description="Bu seçenekte rezervasyonu tamamlarken ekranınızda güvenli Sanal POS açılır. Müşterinizin kart bilgileri girilip ödeme çekildiğinde, belirlediğiniz satış fiyatı ile B2B alış fiyatı arasındaki KÂR MARJI anında Cari Bakiyenize yatırılır."
                                    style={{ marginTop: 16 }}
                                />
                            );
                        }
                        return null;
                    }}
                </Form.Item>

                <Divider />

                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: 16, borderRadius: 8, marginBottom: 24 }}>
                    <Text strong style={{ color: '#389e0d', display: 'block', marginBottom: 8 }}>Satış Bilgileri (Müşteriye Sunulan)</Text>
                    <Form.Item
                        name="amount"
                        label="Acente Satış Tutarı (Müşteriden Alınacak Fiyat)"
                        rules={[{ required: true, message: 'Satış tutarı zorunludur' }]}
                        style={{ marginBottom: 0 }}
                        extra="Bu tutar sizin müşterinize sattığınız fiyattır."
                    >
                        <InputNumber min={selectedVehicle?.price || 0} style={{ width: '100%' }} size="large" addonAfter={selectedVehicle?.currency || 'TRY'} />
                    </Form.Item>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <Button type="primary" htmlType="submit" loading={loading} size="large" style={{ minWidth: 200, backgroundColor: '#623ce4' }}>
                        Rezervasyonu Tamamla
                    </Button>
                </div>
            </Form>
        </Card>
    );

    const renderSuccessStep = () => {
        // Use the pickupHour/pickupMinute state (not date.format which is always 00:00)
        const pickupTimeStr = `${pickupHour}:${pickupMinute}`;

        let calculatedPickup = pickupTimeStr;
        let durationText = routeStats?.duration || selectedVehicle?.estimatedDuration || 'Yolculuk süresi';

        // Very basic estimated pickup calculation for display
        if (dropoff.toLowerCase().includes('havalimanı') || dropoff.toLowerCase().includes('airport')) {
            if (date) {
                // assume 2 hours before flight + 1 hour travel time conservatively if duration not numeric
                calculatedPickup = date.hour(parseInt(pickupHour, 10)).minute(parseInt(pickupMinute, 10)).subtract(3, 'hour').format('HH:mm');
            }
        }

        return (
            <Card bordered={false} style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', padding: '40px 0', borderTop: '4px solid #52c41a' }}>
                <CheckCircleOutlined style={{ fontSize: 72, color: '#52c41a', marginBottom: 24 }} />
                <Title level={3}>Rezervasyonunuz Başarıyla Alındı!</Title>
                <Text type="secondary" style={{ fontSize: 16, display: 'block', marginBottom: 32 }}>
                    Rezervasyon Numaranız: <Text strong>{bookingResult?.bookingNumber || 'Yükleniyor...'}</Text>. Detaylar e-posta adresinize gönderilmiştir.
                </Text>

                <Space size="middle" style={{ marginBottom: 40 }}>
                    <Button type="primary" size="large" style={{ backgroundColor: '#623ce4' }} onClick={() => {
                        // Reset wizard first, then push to home to avoid keeping user locked
                        form.resetFields();
                        setCurrentStep('search');
                        setPickup('');
                        setDropoff('');
                        setDate(null);
                        setSelectedVehicle(null);
                    }}>
                        Anasayfaya Dön
                    </Button>
                    <Button size="large" onClick={() => window.open('/agency/transfers', '_blank')}>
                        Hesabıma Git
                    </Button>
                    <Button size="large" id="voucher-print-btn" onClick={() => {
                        // Open the voucher in a new print-dedicated window for reliability
                        const voucherEl = document.getElementById('print-voucher-container');
                        if (!voucherEl) return;
                        const printWindow = window.open('', '_blank', 'width=900,height=700');
                        if (!printWindow) { window.alert('Pop-up engelleyiciyi kapatın'); return; }
                        printWindow.document.write(`
                            <!DOCTYPE html><html><head>
                            <meta charset="utf-8">
                            <title>Transfer Voucher</title>
                            <style>
                                body { margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; -webkit-print-color-adjust: exact; }
                                @media print { @page { size: A4 portrait; margin: 10mm; } }
                            </style>
                            </head><body>${voucherEl.innerHTML}</body></html>
                        `);
                        printWindow.document.close();
                        printWindow.focus();
                        printWindow.print();
                    }}>
                        Yazdır (Voucher)
                    </Button>
                </Space>

                {/* Voucher: hidden on screen via CSS, visible during print */}
                <div
                    id="print-voucher-container"
                    className="print-only-voucher"
                    style={{ position: 'absolute', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }}
                >
                    <BookingVoucher booking={bookingResult} tenant={tenantInfo} agency={agencyInfo} pickup={pickup} dropoff={dropoff} />
                </div>

                <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', padding: 24, borderRadius: 8, textAlign: 'left', maxWidth: 600, margin: '0 auto' }}>
                    <Title level={5} style={{ color: '#0050b3', marginTop: 0 }}><ClockCircleOutlined /> Önerilen Alınış Saati</Title>
                    <Text>Belirtilen saatiniz <Text strong>{pickupTimeStr}</Text> olarak kabul edilmiştir.</Text>
                    <br />
                    {(dropoff.toLowerCase().includes('havalimanı') || dropoff.toLowerCase().includes('airport')) && (
                        <Text>Uçuşunuzdan 2 saat önce havalimanında olmanız ve <Text strong>{durationText}</Text> yolculuk süresi dikkate alınarak;</Text>
                    )}
                    <br />
                    <Text style={{ fontSize: 16, marginTop: 12, display: 'block' }}>Aracımızın sizi alacağı saat: <Text strong>{calculatedPickup}</Text></Text>
                </div>
            </Card>
        );
    };

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="new-transfer">
                <MapPickerModal
                    visible={mapModalVisible}
                    onCancel={() => setMapModalVisible(false)}
                    onConfirm={handleMapConfirm}
                    initialAddress={mapModalType === 'pickup' ? pickup : dropoff}
                    title={mapModalType === 'pickup' ? "Alış Noktası" : "Bırakış Noktası"}
                    country="tr"
                />

                <div style={{ padding: '24px 0' }}>
                    {currentStep === 'search' && renderSearchStep()}
                    {currentStep === 'results' && renderResultsStep()}
                    {currentStep === 'details' && renderDetailsStep()}
                    {currentStep === 'success' && renderSuccessStep()}
                </div>

                {/* Virtual POS Modal */}
                <Modal
                    title="Güvenli Ödeme Ekranı"
                    open={paymentModalVisible}
                    footer={null}
                    onCancel={() => {
                        setPaymentModalVisible(false);
                        message.warning('Ödeme tamamlanmadan ekrandan çıktınız. Rezervasyon Bekliyor statüsündedir.');
                        setCurrentStep('success');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    width={600}
                    destroyOnHidden
                >
                    {paymentHtml ? (
                        <div
                            dangerouslySetInnerHTML={{ __html: paymentHtml }}
                            style={{ width: '100%', minHeight: 450, borderRadius: 8, overflow: 'hidden' }}
                        />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '50px 0' }}>Ödeme ekranı yükleniyor...</div>
                    )}
                </Modal>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyNewTransferPage;
