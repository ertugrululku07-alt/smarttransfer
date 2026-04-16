'use client';

import React, { useState, useEffect } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
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
    const { currencies: defCurrencies } = useDefinitions();
    const getCurrencySymbol = (code: string) => {
        const c = defCurrencies.find(cur => cur.code === code);
        return c?.symbol || code + ' ';
    };

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
    const [flightTimeValue, setFlightTimeValue] = useState<Dayjs | null>(null);
    const [passengerCounts, setPassengerCounts] = useState({ adults: 1, children: 0, babies: 0 });
    const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ONE_WAY');

    // Airport Transfer Detection
    const AIRPORT_KEYWORDS = [
        'havaliman', 'havaalani', 'airport', 'hava liman', 'hava alan',
        'ayt', 'ist', 'saw', 'esb', 'adnan menderes', 'atatürk', 'sabiha',
        'gazipasa', 'gazipaşa', 'gazipasha', 'dalaman', 'bodrum', 'milas'
    ];
    const isAirportTransfer = AIRPORT_KEYWORDS.some(kw =>
        pickup?.toLowerCase().includes(kw) || dropoff?.toLowerCase().includes(kw)
    );
    const isAirportPickup = AIRPORT_KEYWORDS.some(kw => pickup?.toLowerCase().includes(kw));
    const isAirportDropoff = AIRPORT_KEYWORDS.some(kw => dropoff?.toLowerCase().includes(kw));

    const getDurationMinutes = (duration: unknown): number | null => {
        if (typeof duration === 'number' && Number.isFinite(duration)) return Math.max(0, Math.round(duration));
        if (typeof duration === 'string') {
            let mins = 0;
            const hourMatch = duration.match(/(\d+)\s*(hour|saat)/i);
            const minMatch = duration.match(/(\d+)\s*(min|dk)/i);
            if (hourMatch) mins += parseInt(hourMatch[1], 10) * 60;
            if (minMatch) mins += parseInt(minMatch[1], 10);
            return mins > 0 ? mins : null;
        }
        return null;
    };

    const floorToNearest5 = (d: dayjs.Dayjs) => {
        const m = d.minute();
        const r = m % 5;
        return r ? d.subtract(r, 'minute') : d;
    };

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
        if (isAirportTransfer && !flightTimeValue) {
            message.warning('Havalimanı transferi için uçuş saati gereklidir.');
            return;
        }

        try {
            setLoading(true);
            setSearchError(null);

            const totalPassengers = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
            let pickupDateTime = `${date.format('YYYY-MM-DD')}T${pickupHour}:${pickupMinute}:00.000`;
            if (isAirportTransfer && flightTimeValue) {
                // For airport pickup (airport -> city), default pickup time = flight time.
                // For airport dropoff (city -> airport), we will compute a better pickup time after we have route duration.
                pickupDateTime = `${date.format('YYYY-MM-DD')}T${flightTimeValue.format('HH:mm')}:00.000`;
            }

            let distance: number | undefined;
            let encodedPolyline: string | undefined;
            if (pickup && dropoff) {
                try {
                    const route = await getRouteDetails(pickup, dropoff);
                    if (route) {
                        distance = route.distanceKm;
                        encodedPolyline = route.encodedPolyline;
                        setRouteStats({ distance: route.distanceKm, duration: route.durationMin });

                        // If going TO airport, convert flight time into recommended pickup time (default buffer=2h + 30m).
                        if (isAirportDropoff && flightTimeValue) {
                            const durationMinutes = getDurationMinutes(route.durationMin);
                            if (durationMinutes) {
                                const totalBuffer = durationMinutes + (2 * 60) + 30;
                                const flightDate = dayjs(`${date.format('YYYY-MM-DD')}T${flightTimeValue.format('HH:mm')}`);
                                const recommendedPickup = floorToNearest5(flightDate.subtract(totalBuffer, 'minute'));
                                pickupDateTime = recommendedPickup.format('YYYY-MM-DDTHH:mm:00.000');
                                setPickupHour(recommendedPickup.format('HH'));
                                setPickupMinute(recommendedPickup.format('mm'));
                            }
                        } else if (isAirportPickup && flightTimeValue) {
                            // Airport pickup: keep pickupHour/minute aligned to flight time for consistency
                            setPickupHour(flightTimeValue.format('HH'));
                            setPickupMinute(flightTimeValue.format('mm'));
                        }
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
            contactNationality: 'TR',
            ...(isAirportTransfer && flightTimeValue ? { flightTime: flightTimeValue } : {})
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
            // Construct the correct startDate (pickup time)
            let startDateWithTime = date
                ? date.hour(parseInt(pickupHour, 10)).minute(parseInt(pickupMinute, 10)).second(0).millisecond(0)
                : (values.startDate || null);

            // If airport transfer + flight time present, compute pickup time properly.
            const flightTimeToSend = values.flightTime ? values.flightTime.format('HH:mm') : (flightTimeValue ? flightTimeValue.format('HH:mm') : undefined);
            if (date && flightTimeToSend) {
                if (isAirportDropoff) {
                    const durationMinutes = getDurationMinutes(routeStats?.duration ?? selectedVehicle?.estimatedDuration);
                    if (durationMinutes) {
                        const isShuttle = !!selectedVehicle?.isShuttle;
                        const bufferHours = isShuttle ? 3 : 2;
                        const totalBuffer = durationMinutes + (bufferHours * 60) + 30;
                        const flightDate = dayjs(`${date.format('YYYY-MM-DD')}T${flightTimeToSend}`);
                        const recommendedPickup = floorToNearest5(flightDate.subtract(totalBuffer, 'minute'));
                        startDateWithTime = recommendedPickup.second(0).millisecond(0);
                    }
                } else if (isAirportPickup) {
                    // Airport pickup: pickup time = flight time (landing time)
                    startDateWithTime = dayjs(`${date.format('YYYY-MM-DD')}T${flightTimeToSend}`).second(0).millisecond(0);
                }
            }

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
                    flightTime: flightTimeToSend,
                    customerNotes: values.customerNotes || (flightTimeToSend ? `Uçuş Saati: ${flightTimeToSend}` : undefined),
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
                        currency: selectedVehicle.currency,
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
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
            {/* Hero Header */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: 'rgba(98,60,228,0.12)', borderRadius: 50,
                    padding: '6px 20px', marginBottom: 20
                }}>
                    <span style={{ fontSize: 18 }}>✈️</span>
                    <span style={{ color: '#623ce4', fontWeight: 600, fontSize: 13, letterSpacing: 1 }}>VIP TRANSFER ARAMA</span>
                </div>
                <h1 style={{
                    margin: 0, fontSize: 38, fontWeight: 800,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #623ce4 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text', lineHeight: 1.2
                }}>Yeni Transfer Arayın</h1>
                <p style={{ color: '#64748b', fontSize: 16, marginTop: 12, marginBottom: 0 }}>
                    Müşteriniz için en uygun rotayı ve aracı saniyeler içinde bulun
                </p>
            </div>

            {/* Glassmorphism Search Card */}
            <div style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 24,
                padding: '36px 40px',
                boxShadow: '0 20px 60px rgba(98,60,228,0.12), 0 4px 20px rgba(0,0,0,0.06)',
                border: '1px solid rgba(255,255,255,0.8)'
            }}>
                {/* Route Row */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            🛫 Nereden
                        </label>
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
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #623ce4, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(98,60,228,0.35)', flexShrink: 0
                        }}>
                            <ArrowRightOutlined style={{ color: '#fff', fontSize: 16 }} />
                        </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            🛬 Nereye
                        </label>
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
                    </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #e5e7eb, transparent)', margin: '8px 0 24px' }} />

                {/* Details Row */}
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
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        {!isAirportTransfer ? (
                            <>
                                <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>🕐 Saat</label>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Select size="large" value={pickupHour} onChange={setPickupHour} style={{ width: '50%' }}
                                        options={Array.from({ length: 24 }, (_, i) => ({ value: i.toString().padStart(2, '0'), label: i.toString().padStart(2, '0') }))}
                                    />
                                    <Select size="large" value={pickupMinute} onChange={setPickupMinute} style={{ width: '50%' }}
                                        options={['00', '15', '30', '45'].map(m => ({ value: m, label: m }))}
                                    />
                                </Space.Compact>
                            </>
                        ) : (
                            <>
                                <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>✈️ Uçuş Saati</label>
                                <TimePicker
                                    size="large"
                                    style={{ width: '100%' }}
                                    format="HH:mm"
                                    value={flightTimeValue}
                                    onChange={(v) => setFlightTimeValue(v)}
                                    placeholder="Örn: 14:30"
                                />
                            </>
                        )}
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>👥 Yolcular</label>
                        <PassengerSelector size="large" value={passengerCounts} onChange={setPassengerCounts} />
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>🔄 Tip</label>
                        <Radio.Group value={tripType} onChange={(e) => setTripType(e.target.value)} style={{ width: '100%', display: 'flex' }} size="large">
                            <Radio.Button value="ONE_WAY" style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>Tek Yön</Radio.Button>
                            <Radio.Button value="ROUND_TRIP" style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>Çift Yön</Radio.Button>
                        </Radio.Group>
                    </Col>
                </Row>

                {/* Search Button */}
                <button
                    onClick={handleSearch}
                    disabled={loading}
                    style={{
                        marginTop: 28, width: '100%', height: 58, fontSize: 17, fontWeight: 700,
                        border: 'none', borderRadius: 14, cursor: loading ? 'not-allowed' : 'pointer',
                        background: loading ? '#9ca3af' : 'linear-gradient(135deg, #623ce4 0%, #8b5cf6 50%, #a78bfa 100%)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        boxShadow: loading ? 'none' : '0 8px 30px rgba(98,60,228,0.4)',
                        transition: 'all 0.3s ease', letterSpacing: 0.5
                    }}
                >
                    {loading ? <><span style={{ display: 'inline-block', width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Aranıyor...</> : <><SearchOutlined /> Araçları Listele</>}
                </button>
            </div>

            {/* Feature Badges */}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
                {[['⚡', 'Anlık Fiyatlar'], ['🛡️', 'Güvenli Ödeme'], ['🌍', '7/24 Destek'], ['💎', 'VIP Araçlar']].map(([icon, text]) => (
                    <div key={text} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
                        background: 'rgba(255,255,255,0.7)', borderRadius: 50,
                        border: '1px solid rgba(98,60,228,0.15)', fontSize: 13, color: '#374151', fontWeight: 500
                    }}>
                        <span>{icon}</span><span>{text}</span>
                    </div>
                ))}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );

    const renderResultsStep = () => (
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {/* Top Bar */}
            <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <button onClick={() => setCurrentStep('search')} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                    background: 'rgba(255,255,255,0.9)', border: '1px solid #e5e7eb',
                    borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#374151'
                }}>
                    <ArrowLeftOutlined /> Aramaya Dön
                </button>
                <div style={{
                    background: 'rgba(255,255,255,0.9)', borderRadius: 14, padding: '12px 24px',
                    border: '1px solid rgba(98,60,228,0.15)', display: 'flex', alignItems: 'center', gap: 16,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>🛫</span>
                        <span style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickup}</span>
                    </div>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #623ce4, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <ArrowRightOutlined style={{ color: '#fff', fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>🛬</span>
                        <span style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoff}</span>
                    </div>
                </div>
                {!loading && !searchError && results.length > 0 && (
                    <div style={{ background: 'linear-gradient(135deg, #623ce4, #8b5cf6)', color: '#fff', borderRadius: 50, padding: '8px 18px', fontSize: 14, fontWeight: 700 }}>
                        {results.length} Araç Bulundu
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '100px 0' }}>
                    <div style={{ fontSize: 60, marginBottom: 20 }}>🔍</div>
                    <Spin size="large" />
                    <div style={{ marginTop: 20, color: '#623ce4', fontWeight: 600, fontSize: 16 }}>Araçlar aranıyor...</div>
                    <div style={{ color: '#9ca3af', marginTop: 6 }}>En iyi fiyatları buluyoruz</div>
                </div>
            ) : searchError ? (
                <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 40, textAlign: 'center', border: '1px solid #fee2e2' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Arama Hatası</div>
                    <div style={{ color: '#6b7280' }}>{searchError}</div>
                </div>
            ) : results.length === 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🚗</div>
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Sonuç Bulunamadı</div>
                    <div style={{ color: '#6b7280' }}>Seçtiğiniz kriterlere uygun araç bulunamadı.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {results.map((result, idx) => (
                        <div
                            key={result.id}
                            style={{
                                background: 'rgba(255,255,255,0.95)',
                                borderRadius: 20,
                                overflow: 'hidden',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
                                border: '1px solid rgba(255,255,255,0.9)',
                                display: 'flex',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 40px rgba(98,60,228,0.15)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.07)'; }}
                        >
                            {/* Vehicle Image */}
                            <div style={{
                                width: 200, minHeight: 160, flexShrink: 0,
                                background: 'linear-gradient(135deg, #f8f7ff 0%, #ede9fe 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative', overflow: 'hidden'
                            }}>
                                {result.image ? (
                                    <img src={result.image} alt={result.vehicleType} style={{ width: '90%', height: '80%', objectFit: 'contain' }} />
                                ) : (
                                    <CarOutlined style={{ fontSize: 64, color: '#8b5cf6', opacity: 0.5 }} />
                                )}
                                <div style={{
                                    position: 'absolute', top: 12, left: 12,
                                    background: 'linear-gradient(135deg, #623ce4, #8b5cf6)',
                                    color: '#fff', borderRadius: 50, padding: '4px 12px',
                                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5
                                }}>
                                    {result.vehicleType}
                                </div>
                                {idx === 0 && (
                                    <div style={{
                                        position: 'absolute', top: 12, right: 12,
                                        background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                                        color: '#fff', borderRadius: 50, padding: '4px 10px',
                                        fontSize: 11, fontWeight: 700
                                    }}>⭐ Önerilen</div>
                                )}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, padding: '24px 28px' }}>
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>{result.vehicleType}</div>
                                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>Sağlayıcı: {result.vendor}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 10, padding: '6px 14px' }}>
                                        <UserOutlined style={{ color: '#623ce4' }} />
                                        <span style={{ fontSize: 13, fontWeight: 600 }}>{result.capacity} Yolcu</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 10, padding: '6px 14px' }}>
                                        <SafetyCertificateOutlined style={{ color: '#623ce4' }} />
                                        <span style={{ fontSize: 13, fontWeight: 600 }}>{result.luggage} Bavul</span>
                                    </div>
                                    {!result.isShuttle && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 10, padding: '6px 14px' }}>
                                            <ClockCircleOutlined style={{ color: '#623ce4' }} />
                                            <span style={{ fontSize: 13, fontWeight: 600 }}>~{result.estimatedDuration || routeStats?.duration || '?'}</span>
                                        </div>
                                    )}
                                    {result.features?.includes('WiFi') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', borderRadius: 10, padding: '6px 14px' }}>
                                            <WifiOutlined style={{ color: '#3b82f6' }} />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>Ücretsiz WiFi</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Price & CTA */}
                            <div style={{
                                width: 200, flexShrink: 0, padding: '24px 20px',
                                borderLeft: '1px solid #f3f4f6',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'center', alignItems: 'center',
                                background: 'linear-gradient(180deg, #fafafa 0%, #f5f3ff 100%)'
                            }}>
                                <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Önerilen Satış</div>
                                <div style={{
                                    fontSize: 34, fontWeight: 900, color: '#623ce4', lineHeight: 1.1,
                                    background: 'linear-gradient(135deg, #623ce4, #8b5cf6)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                                }}>
                                    {getCurrencySymbol(result.currency)}{result.price}
                                </div>
                                {(result.basePrice && result.basePrice !== result.price) && (
                                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                                        B2B Net: {getCurrencySymbol(result.currency)}{result.basePrice}
                                    </div>
                                )}
                                <button
                                    onClick={() => handleSelectVehicle(result)}
                                    style={{
                                        marginTop: 16, width: '100%', padding: '12px 0',
                                        background: 'linear-gradient(135deg, #623ce4, #8b5cf6)',
                                        color: '#fff', border: 'none', borderRadius: 12,
                                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                        boxShadow: '0 4px 16px rgba(98,60,228,0.3)',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                >
                                    Seç ve İlerle →
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
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

                {isAirportTransfer && (
                    <Alert
                        type="info"
                        showIcon
                        message="✈️ Havalimanı Transferi Tespit Edildi"
                        description="Hata yapmamak için uçuş saatini ve uçuş numarasını doğru girmeniz zorunludur."
                        style={{ marginBottom: 16 }}
                    />
                )}
                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Form.Item
                            name="flightNumber"
                            label="Uçuş Numarası (Opsiyonel)"
                        >
                            <Input placeholder="Örn: TK1234" size="large" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        {isAirportTransfer ? (
                            <Form.Item
                                name="flightTime"
                                label="Uçuş Saatiniz"
                                tooltip="Uçuşunuzun kalkış veya varış saatini giriniz. Şoförümüz bu saate göre sizi alır."
                                rules={[{ required: true, message: 'Havalimanı transferi için uçuş saati zorunludur' }]}
                            >
                                <TimePicker
                                    size="large"
                                    format="HH:mm"
                                    style={{ width: '100%' }}
                                    placeholder="Uçuş Saatiniz (ÖR: 14:30)"
                                    minuteStep={5}
                                />
                            </Form.Item>
                        ) : null}
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col xs={24}>
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
                    defaultActiveKey={['1']}
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
                        <Radio value="PAY_IN_VEHICLE">
                            Araçta Nakit Ödeme <Tag color="orange" style={{ marginLeft: 8 }}>Geçici Bakiye Yansımaz</Tag>
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
                        } else if (method === 'PAY_IN_VEHICLE') {
                            return (
                                <Alert
                                    type="warning"
                                    showIcon
                                    message="Cari Hesaba Sonradan Yansıtma İşlemi"
                                    description="Anında bakiye düşümü yapılmaz. Transfer tamamlanıp, şoför/operasyon tahsil edilen işlem tutarını sisteme girdiğinde B2B alış fiyatınız sisteme aktarılır, satış fiyatı ile arasındaki kâr farkı cari bakiyenize alacak olarak yansıtılır."
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
        const durationText = routeStats?.duration || selectedVehicle?.estimatedDuration || 'Yolculuk süresi';
        const flightTimeStr = bookingResult?.metadata?.flightTime || bookingResult?.flightTime || (form.getFieldValue('flightTime')?.format?.('HH:mm') ?? null);
        let suggestedPickup: string | null = null;

        // Compute suggested pickup only when going TO airport (dropoff airport) and we have flightTime + duration.
        if (isAirportDropoff && date && flightTimeStr) {
            const durationMinutes = getDurationMinutes(routeStats?.duration ?? selectedVehicle?.estimatedDuration);
            if (durationMinutes) {
                const isShuttle = !!selectedVehicle?.isShuttle;
                const bufferHours = isShuttle ? 3 : 2;
                const totalBuffer = durationMinutes + (bufferHours * 60) + 30;
                const flightDate = dayjs(`${date.format('YYYY-MM-DD')}T${flightTimeStr}`);
                suggestedPickup = floorToNearest5(flightDate.subtract(totalBuffer, 'minute')).format('HH:mm');
            }
        }

        return (
            <div style={{ maxWidth: 780, margin: '0 auto' }}>
                {/* Success Hero */}
                <div style={{
                    background: 'linear-gradient(135deg, #623ce4 0%, #8b5cf6 50%, #a78bfa 100%)',
                    borderRadius: 28, padding: '52px 40px', textAlign: 'center', marginBottom: 24,
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(98,60,228,0.35)'
                }}>
                    {/* Decorative circles */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
                    <div style={{ position: 'absolute', bottom: -50, left: -30, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

                    <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
                    <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5 }}>Rezervasyon Tamamlandı!</h2>
                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, margin: '0 0 28px' }}>
                        Müşterinizin transferi başarıyla oluşturuldu.
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

                {/* Info Cards Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: '24px 28px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', border: '1px solid rgba(255,255,255,0.9)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🗺️</div>
                            <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>Rota Bilgisi</div>
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
                            <div>🛫 <strong>{pickup}</strong></div>
                            <div style={{ marginLeft: 8, color: '#d1d5db' }}>↓</div>
                            <div>🛬 <strong>{dropoff}</strong></div>
                        </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: '24px 28px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', border: '1px solid rgba(255,255,255,0.9)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🕐</div>
                            <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>Alınış Zamanı</div>
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
                            <div>📅 <strong>{date?.format('DD MMMM YYYY')}</strong></div>
                            <div>⏰ Alınış: <strong style={{ color: '#623ce4', fontSize: 15 }}>{pickupTimeStr}</strong></div>
                            {isAirportTransfer && flightTimeStr && (
                                <div>✈️ Uçuş: <strong>{flightTimeStr}</strong></div>
                            )}
                            {suggestedPickup && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: '#e6f7ff', borderRadius: 12, border: '1px solid #91d5ff', color: '#003a8c', fontSize: 12, lineHeight: 1.5 }}>
                                    <div style={{ fontWeight: 800, marginBottom: 4 }}>🚀 Önerilen Alınış Saati</div>
                                    <div>
                                        Uçuşunuz <strong>{flightTimeStr}</strong>, yolculuk <strong>{String(durationText)}</strong> ve <strong>30 dk güvenlik payı</strong> dikkate alınarak
                                        önerilen alınış saati: <strong>{suggestedPickup}</strong>
                                    </div>
                                </div>
                            )}
                            {(isAirportDropoff) && (
                                <div style={{ marginTop: 6, padding: '6px 10px', background: '#fefce8', borderRadius: 8, color: '#92400e', fontSize: 12 }}>
                                    ⚠️ Havalimanı: {durationText} süre hesaplanmaktadır
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Voucher hidden */}
                <div id="print-voucher-container" className="print-only-voucher" style={{ position: 'absolute', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }}>
                    <BookingVoucher booking={bookingResult} tenant={tenantInfo} agency={agencyInfo} pickup={pickup} dropoff={dropoff} />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => {
                        form.resetFields(); setCurrentStep('search');
                        setPickup(''); setDropoff(''); setDate(null); setSelectedVehicle(null);
                    }} style={{
                        padding: '14px 32px', borderRadius: 14, border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #623ce4, #8b5cf6)', color: '#fff',
                        fontWeight: 700, fontSize: 15, boxShadow: '0 6px 20px rgba(98,60,228,0.35)'
                    }}>➕ Yeni Transfer</button>
                    <button onClick={() => window.open('/agency/transfers', '_blank')} style={{
                        padding: '14px 32px', borderRadius: 14, border: '1px solid #e5e7eb', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.95)', color: '#374151', fontWeight: 700, fontSize: 15
                    }}>📋 Transferlerim</button>
                    <button id="voucher-print-btn" onClick={() => {
                        const voucherEl = document.getElementById('print-voucher-container');
                        if (!voucherEl) return;
                        const printWindow = window.open('', '_blank', 'width=900,height=700');
                        if (!printWindow) { window.alert('Pop-up engelleyiciyi kapatın'); return; }
                        printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transfer Voucher</title><style>body { margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; -webkit-print-color-adjust: exact; } @media print { @page { size: A4 portrait; margin: 10mm; } }</style></head><body>${voucherEl.innerHTML}</body></html>`);
                        printWindow.document.close(); printWindow.focus(); printWindow.print();
                    }} style={{
                        padding: '14px 32px', borderRadius: 14, border: '1px solid #e5e7eb', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.95)', color: '#374151', fontWeight: 700, fontSize: 15
                    }}>🖨️ Voucher Yazdır</button>
                </div>
            </div>
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

                <div style={{
                    minHeight: '100vh',
                    background: currentStep === 'search'
                        ? 'linear-gradient(160deg, #f5f3ff 0%, #ede9fe 30%, #e0f2fe 70%, #f0fdf4 100%)'
                        : currentStep === 'success'
                        ? 'linear-gradient(160deg, #f0fdf4 0%, #dcfce7 30%, #f5f3ff 100%)'
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
