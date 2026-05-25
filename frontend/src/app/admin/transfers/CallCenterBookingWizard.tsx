'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, Button, Tag, Radio, message, Spin, Row, Col, Alert, Select } from 'antd';
import {
    EnvironmentOutlined, CarOutlined, UserOutlined, PhoneOutlined, MailOutlined,
    CreditCardOutlined, DollarOutlined, ClockCircleOutlined, TeamOutlined,
    SearchOutlined, CheckCircleOutlined, ArrowLeftOutlined,
    SwapRightOutlined, CalendarOutlined, InfoCircleOutlined,
    SafetyCertificateOutlined, RocketOutlined,
    SwapOutlined, ArrowRightOutlined, MinusOutlined, PlusOutlined,
    LockOutlined, NotificationOutlined, ThunderboltOutlined, CustomerServiceOutlined,
    SafetyOutlined, CloseOutlined, ShoppingOutlined, GiftOutlined,
    BankOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
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
    const [tripType, setTripType] = useState<'oneWay' | 'roundTrip'>('oneWay');
    const [returnDateTime, setReturnDateTime] = useState<any>(dayjs().add(1, 'day').add(2, 'hour'));
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
    // Round-trip: return-leg search results and selection
    const [returnResults, setReturnResults] = useState<TransferResult[]>([]);
    const [returnSearching, setReturnSearching] = useState(false);
    const [returnSearchError, setReturnSearchError] = useState<string | null>(null);
    const [returnSelected, setReturnSelected] = useState<TransferResult | null>(null);
    // Selection phase: 'outbound' = picking outbound vehicle, 'return' = picking return vehicle
    const [selectionPhase, setSelectionPhase] = useState<'outbound' | 'return'>('outbound');
    const [customerForm] = Form.useForm();
    const [creating, setCreating] = useState(false);

    // Agency selection
    const [agencies, setAgencies] = useState<any[]>([]);
    const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
    const [loadingAgencies, setLoadingAgencies] = useState(false);

    // Extra services
    const [extraServices, setExtraServices] = useState<any[]>([]);
    const [selectedServices, setSelectedServices] = useState<Map<string, number>>(new Map());
    const [loadingExtras, setLoadingExtras] = useState(false);

    // Fetch agencies on mount
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            try {
                setLoadingAgencies(true);
                const res = await apiClient.get('/api/admin/agencies');
                if (!cancelled && res.data?.success) {
                    setAgencies((res.data.data || []).filter((a: any) => a.status !== 'INACTIVE'));
                }
            } catch (e) {
                console.warn('agencies fetch failed', e);
            } finally {
                if (!cancelled) setLoadingAgencies(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    // Fetch extra services when entering Step 2 with a selected vehicle
    useEffect(() => {
        if (step !== 1 || !selected) return;
        let cancelled = false;
        (async () => {
            try {
                setLoadingExtras(true);
                const res = await apiClient.get('/api/extra-services');
                if (!cancelled && res.data?.success) {
                    const list = (res.data.data || []).filter((s: any) =>
                        selected.isShuttle ? !s.excludeFromShuttle : true
                    );
                    setExtraServices(list);
                }
            } catch (e) {
                console.warn('extra-services fetch failed', e);
            } finally {
                if (!cancelled) setLoadingExtras(false);
            }
        })();
        return () => { cancelled = true; };
    }, [step, selected]);

    const totalPaxForExtras = adults + children + infants;

    const setServiceQty = (id: string, nextQty: number) => {
        const next = new Map(selectedServices);
        if (nextQty > 0) next.set(id, nextQty);
        else next.delete(id);
        setSelectedServices(next);
    };

    const extrasTotal = (() => {
        let total = 0;
        selectedServices.forEach((qty, id) => {
            const s = extraServices.find(x => x.id === id);
            if (s) total += Number(s.price) * qty;
        });
        return total;
    })();

    // Grand total = outbound + return (if roundtrip) + extras
    const grandTotal = (Number(selected?.price || 0))
        + (tripType === 'roundTrip' ? Number(returnSelected?.price || 0) : 0)
        + extrasTotal;

    // Keep return date >= pickup date (auto-adjust if user shifts pickup later)
    useEffect(() => {
        if (tripType !== 'roundTrip' || !pickupDateTime || !returnDateTime) return;
        if (returnDateTime.isBefore(pickupDateTime)) {
            setReturnDateTime(pickupDateTime.add(2, 'hour'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickupDateTime, tripType]);

    const resetAll = () => {
        setStep(0);
        setPickup(''); setDropoff('');
        setPickupCoords({}); setDropoffCoords({});
        setPickupDateTime(dayjs().add(2, 'hour'));
        setTripType('oneWay');
        setReturnDateTime(dayjs().add(1, 'day').add(2, 'hour'));
        setAdults(1); setChildren(0); setInfants(0);
        setResults([]); setSearchError(null); setRouteInfo(null);
        setSelected(null);
        setReturnResults([]); setReturnSelected(null);
        setReturnSearching(false); setReturnSearchError(null);
        setSelectionPhase('outbound');
        setSelectedAgencyId(null);
        setExtraServices([]); setSelectedServices(new Map());
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
                returnDateTime: tripType === 'roundTrip' && returnDateTime ? returnDateTime.toISOString() : undefined,
                passengers: Number(adults) + Number(children) + Number(infants) || 1,
                transferType: tripType === 'roundTrip' ? 'ROUND_TRIP' : 'ONE_WAY',
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

    // ── Search return leg (swapped pickup/dropoff, returnDateTime) ──
    const handleReturnSearch = async () => {
        if (!pickup || !dropoff || !returnDateTime) return;
        try {
            setReturnSearching(true);
            setReturnSearchError(null);
            setReturnResults([]);
            const payload = {
                pickup: dropoff,      // swapped
                dropoff: pickup,      // swapped
                pickupDateTime: returnDateTime.toISOString(),
                passengers: Number(adults) + Number(children) + Number(infants) || 1,
                transferType: 'ONE_WAY',
                pickupLat: dropoffCoords.lat,
                pickupLng: dropoffCoords.lng,
                dropoffLat: pickupCoords.lat,
                dropoffLng: pickupCoords.lng,
            };
            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                const list: TransferResult[] = res.data.data.results || [];
                if (list.length === 0) setReturnSearchError('Dönüş için uygun araç bulunamadı.');
                setReturnResults(list);
            } else {
                setReturnSearchError('Dönüş arama sonuçları alınamadı.');
            }
        } catch (err: any) {
            setReturnSearchError(err?.response?.data?.error || 'Dönüş arama hatası');
        } finally {
            setReturnSearching(false);
        }
    };

    const handleSelectVehicle = (r: TransferResult) => {
        // Round-trip: first select outbound, then trigger return search
        if (tripType === 'roundTrip' && selectionPhase === 'outbound') {
            setSelected(r);
            setSelectionPhase('return');
            handleReturnSearch();
            return;
        }
        // Round-trip: selecting return vehicle
        if (tripType === 'roundTrip' && selectionPhase === 'return') {
            setReturnSelected(r);
            setStep(1);
            customerForm.setFieldsValue({
                adults, children, infants,
                paymentMethod: 'PAY_IN_VEHICLE'
            });
            return;
        }
        // One-way: original flow
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

            // Build extras list for the payload (id/name/price/currency/qty/total)
            const extrasList = Array.from(selectedServices.entries()).map(([id, qty]) => {
                const s = extraServices.find(x => x.id === id);
                return s ? {
                    id: s.id,
                    name: s.name,
                    price: Number(s.price),
                    currency: s.currency || 'TRY',
                    quantity: qty,
                    total: Number(s.price) * qty,
                } : null;
            }).filter(Boolean) as Array<{ id: string; name: string; price: number; currency: string; quantity: number; total: number }>;

            const outboundPrice = Number(selected.price);
            const returnPrice = tripType === 'roundTrip' && returnSelected ? Number(returnSelected.price) : 0;
            const totalPrice = outboundPrice + returnPrice + extrasTotal;

            const payload = {
                passengerName: values.passengerName,
                passengerPhone: values.passengerPhone,
                passengerEmail: values.passengerEmail || '',
                pickup,
                dropoff,
                pickupDateTime: displayDateTime.toISOString(),
                vehicleType: selected.vehicleType,
                flightNumber: values.flightNumber || '',
                price: totalPrice,
                vehiclePrice: Number(selected.price),
                extrasTotal,
                extraServices: extrasList,
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
                agencyId: selectedAgencyId || undefined,
                agencyName: selectedAgencyId ? agencies.find((a: any) => a.id === selectedAgencyId)?.name : undefined,
                isShuttle: !!selected.isShuttle,
                shuttleRouteId: selected.isShuttle ? selected.id.replace('shuttle_', '') : null,
                shuttleMasterTime: shuttleMasterTime || selected.matchedMasterTime || null,
                passengerDetails: Array.isArray(values.passengerDetails) ? values.passengerDetails : [],
                // Round-trip return leg (backend creates a linked -D booking)
                returnLeg: (tripType === 'roundTrip' && returnSelected) ? {
                    pickup: dropoff,
                    dropoff: pickup,
                    pickupDateTime: returnDateTime.toISOString(),
                    vehicleType: returnSelected.vehicleType,
                    price: Number(returnSelected.price),
                    currency: returnSelected.currency || 'TRY',
                    pickupLat: dropoffCoords.lat, pickupLng: dropoffCoords.lng,
                    dropoffLat: pickupCoords.lat, dropoffLng: pickupCoords.lng,
                    isShuttle: !!returnSelected.isShuttle,
                    shuttleRouteId: returnSelected.isShuttle ? returnSelected.id.replace('shuttle_', '') : null,
                    shuttleMasterTime: returnSelected.matchedMasterTime || null,
                } : undefined,
                tripType: tripType === 'roundTrip' ? 'ROUND_TRIP' : 'ONE_WAY'
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

    const totalPax = adults + children + infants;

    return (
        <>
            <Modal
                open={open}
                onCancel={handleClose}
                width={840}
                footer={null}
                destroyOnClose
                closable={false}
                centered
                styles={{
                    body: { padding: 0, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' },
                }}
                className="cc-wizard-modal"
            >
                {/* ─── HEADER ─── */}
                <div style={{
                    background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 50%, var(--brand-primary) 100%)',
                    padding: '14px 22px 12px',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        position: 'absolute', top: -40, right: -40,
                        width: 140, height: 140, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.08)',
                    }} />
                    <div style={{
                        position: 'absolute', bottom: -20, left: 60,
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                    }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: 8,
                                    background: 'rgba(255,255,255,0.2)',
                                    backdropFilter: 'blur(10px)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <RocketOutlined style={{ fontSize: 14, color: '#fff' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                                        Yeni Rezervasyon
                                    </div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                        Call Center Hizli Kayit
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            style={{
                                background: 'rgba(255,255,255,0.15)', border: 'none',
                                width: 26, height: 26, borderRadius: 6,
                                color: '#fff', fontSize: 16, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                        >
                            x
                        </button>
                    </div>

                    {/* Step Indicator */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, position: 'relative', zIndex: 1 }}>
                        {[
                            { label: 'Rota & Arama', icon: <SearchOutlined style={{ fontSize: 12 }} />, idx: 0 },
                            { label: 'Musteri & Odeme', icon: <UserOutlined style={{ fontSize: 12 }} />, idx: 1 },
                        ].map(s => {
                            const active = step === s.idx;
                            const done = step > s.idx;
                            return (
                                <div key={s.idx} style={{
                                    flex: 1, padding: '7px 12px', borderRadius: 10,
                                    background: active ? 'rgba(255,255,255,0.22)' : done ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                                    backdropFilter: 'blur(10px)',
                                    border: active ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid transparent',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    cursor: done ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                }}
                                    onClick={() => { if (done) setStep(s.idx); }}
                                >
                                    <div style={{
                                        width: 26, height: 26, borderRadius: 8,
                                        background: active ? '#fff' : done ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                                        color: active ? 'var(--brand-primary)' : '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: 12,
                                    }}>
                                        {done ? <CheckCircleOutlined /> : s.icon}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            Adim {s.idx + 1}
                                        </div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{s.label}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ─── BODY ─── */}
                <div style={{ padding: '14px 20px 14px', background: '#fafbfc', minHeight: 200 }}>

                    {/* ─── STEP 1: Search ─── */}
                    {step === 0 && (
                        <div>
                            {/* Trip Type Segment */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                                <div style={{
                                    background: '#f3f4f6', borderRadius: 12, padding: 3,
                                    display: 'inline-flex', gap: 3,
                                }}>
                                    {[
                                        { val: 'oneWay', label: 'Tek Yön', icon: <ArrowRightOutlined /> },
                                        { val: 'roundTrip', label: 'Çift Yön', icon: <SwapOutlined /> },
                                    ].map(opt => {
                                        const active = tripType === opt.val;
                                        return (
                                            <button
                                                key={opt.val}
                                                onClick={() => setTripType(opt.val as any)}
                                                style={{
                                                    padding: '7px 18px', borderRadius: 10,
                                                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    border: 'none',
                                                    color: active ? '#fff' : '#6b7280',
                                                    background: active ? 'linear-gradient(135deg, var(--brand-accent) 0%, var(--brand-accent) 100%)' : 'transparent',
                                                    boxShadow: active ? '0 4px 15px rgba(79, 70, 229, 0.3)' : 'none',
                                                }}
                                            >
                                                {opt.icon}
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Route Section */}
                            <div style={{
                                background: 'rgba(249, 250, 251, 0.5)', borderRadius: 12,
                                padding: 12, border: '1px solid #f3f4f6', marginBottom: 10,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: 6,
                                        background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <EnvironmentOutlined style={{ fontSize: 12, color: '#2563eb' }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rota</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative' }}>
                                    {/* Nereden */}
                                    <div style={{
                                        background: '#fff', borderRadius: 12, padding: 10,
                                        border: '1px solid #e5e7eb',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                            <div style={{
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: '#22c55e', boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.2)',
                                            }} />
                                            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nereden</label>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ flex: 1 }}>
                                                <DynamicLocationSearchInput
                                                    placeholder="Havalimanı, otel, adres..."
                                                    value={pickup}
                                                    onChange={setPickup}
                                                    onSelect={(addr, lat, lng) => {
                                                        setPickup(addr);
                                                        if (lat != null && lng != null) setPickupCoords({ lat, lng });
                                                    }}
                                                    country="TUR"
                                                />
                                            </div>
                                            <button
                                                onClick={() => setMapOpen('pickup')}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    border: 'none', background: 'transparent',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#9ca3af', flexShrink: 0,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = 'var(--brand-accent)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
                                                title="Haritadan seç"
                                            >
                                                <EnvironmentOutlined style={{ fontSize: 15 }} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Swap Button */}
                                    <div style={{
                                        position: 'absolute', left: '50%', top: '50%',
                                        transform: 'translate(-50%, -50%)', zIndex: 5,
                                    }}>
                                        <button
                                            onClick={() => {
                                                const tmpAddr = pickup; const tmpCoords = pickupCoords;
                                                setPickup(dropoff); setPickupCoords(dropoffCoords);
                                                setDropoff(tmpAddr); setDropoffCoords(tmpCoords);
                                            }}
                                            style={{
                                                width: 44, height: 44, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                                                color: '#fff', border: '4px solid #fafbfc',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', boxShadow: '0 4px 15px var(--brand-primary-30)',
                                                transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.transform = 'rotate(180deg) scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 20px var(--brand-primary-40)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 15px var(--brand-primary-30)'; }}
                                            title="Yer değiştir"
                                        >
                                            <SwapOutlined style={{ fontSize: 16 }} />
                                        </button>
                                    </div>

                                    {/* Nereye */}
                                    <div style={{
                                        background: '#fff', borderRadius: 12, padding: 10,
                                        border: '1px solid #e5e7eb',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                            <div style={{
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: '#ef4444', boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.2)',
                                            }} />
                                            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nereye</label>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ flex: 1 }}>
                                                <DynamicLocationSearchInput
                                                    placeholder="Havalimanı, otel, adres..."
                                                    value={dropoff}
                                                    onChange={setDropoff}
                                                    onSelect={(addr, lat, lng) => {
                                                        setDropoff(addr);
                                                        if (lat != null && lng != null) setDropoffCoords({ lat, lng });
                                                    }}
                                                    country="TUR"
                                                />
                                            </div>
                                            <button
                                                onClick={() => setMapOpen('dropoff')}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    border: 'none', background: 'transparent',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#9ca3af', flexShrink: 0,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = 'var(--brand-accent)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
                                                title="Haritadan seç"
                                            >
                                                <EnvironmentOutlined style={{ fontSize: 15 }} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dates Flow: Gidiş → Dönüş */}
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 4px' }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: 6,
                                        background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <CalendarOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tarih Bilgileri</span>
                                    {tripType === 'roundTrip' && (
                                        <span style={{
                                            marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                                            color: 'var(--brand-accent)', background: 'var(--brand-primary-08)',
                                            padding: '4px 12px', borderRadius: 999,
                                        }}>Çift Yön</span>
                                    )}
                                </div>

                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                                    gap: 8, alignItems: 'stretch',
                                }}>
                                    {/* Gidiş */}
                                    <div style={{
                                        background: '#fff', borderRadius: 12, padding: 10,
                                        border: '2px solid var(--brand-primary-10)', position: 'relative', overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            position: 'absolute', top: -16, right: -16,
                                            width: 80, height: 80, borderRadius: '50%',
                                            background: 'linear-gradient(225deg, var(--brand-primary-08), transparent)',
                                        }} />
                                        <div style={{ position: 'relative', zIndex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                <div style={{
                                                    width: 24, height: 24, borderRadius: 6,
                                                    background: 'var(--brand-primary-10)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <RocketOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
                                                </div>
                                                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gidiş</label>
                                            </div>
                                            <DatePicker
                                                showTime={{ format: 'HH:mm' }}
                                                format="DD.MM.YYYY HH:mm"
                                                value={pickupDateTime}
                                                onChange={setPickupDateTime}
                                                disabledDate={(current) => current && current.isBefore(dayjs().startOf('day'))}
                                                style={{ width: '100%', borderRadius: 8, height: 36, fontWeight: 600 }}
                                            />
                                        </div>
                                    </div>

                                    {/* Flow Arrow */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            background: '#f3f4f6', border: '2px solid #fff',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <ArrowRightOutlined style={{ fontSize: 16, color: '#9ca3af' }} />
                                        </div>
                                    </div>

                                    {/* Dönüş */}
                                    <div style={{
                                        background: tripType === 'roundTrip'
                                            ? 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)'
                                            : '#fff',
                                        borderRadius: 12, padding: 10,
                                        border: tripType === 'roundTrip' ? '2px solid #fdba74' : '2px solid #e5e7eb',
                                        position: 'relative', overflow: 'hidden',
                                        opacity: tripType === 'oneWay' ? 0.55 : 1,
                                        filter: tripType === 'oneWay' ? 'grayscale(0.6)' : 'none',
                                        transform: tripType === 'oneWay' ? 'scale(0.98)' : 'scale(1)',
                                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: tripType === 'roundTrip' ? '0 4px 20px -5px rgba(249, 115, 22, 0.15)' : 'none',
                                    }}>
                                        <div style={{
                                            position: 'absolute', top: -16, right: -16,
                                            width: 80, height: 80, borderRadius: '50%',
                                            background: 'linear-gradient(225deg, #fff7ed, transparent)',
                                        }} />
                                        <div style={{ position: 'relative', zIndex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                <div style={{
                                                    width: 24, height: 24, borderRadius: 6,
                                                    background: tripType === 'roundTrip' ? '#fed7aa' : '#fef3c7',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <RocketOutlined style={{
                                                        fontSize: 12,
                                                        color: tripType === 'roundTrip' ? '#ea580c' : '#fbbf24',
                                                        transform: 'rotate(180deg)'
                                                    }} />
                                                </div>
                                                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dönüş</label>
                                            </div>
                                            <DatePicker
                                                showTime={{ format: 'HH:mm' }}
                                                format="DD.MM.YYYY HH:mm"
                                                value={returnDateTime}
                                                onChange={setReturnDateTime}
                                                disabled={tripType !== 'roundTrip'}
                                                disabledDate={(current) => {
                                                    if (!current || !pickupDateTime) return false;
                                                    return current.isBefore(pickupDateTime.startOf('day'));
                                                }}
                                                disabledTime={(current) => {
                                                    if (!current || !pickupDateTime || !current.isSame(pickupDateTime, 'day')) {
                                                        return {};
                                                    }
                                                    const ph = pickupDateTime.hour();
                                                    const pm = pickupDateTime.minute();
                                                    return {
                                                        disabledHours: () => Array.from({ length: ph }, (_, i) => i),
                                                        disabledMinutes: (selectedHour: number) =>
                                                            selectedHour === ph
                                                                ? Array.from({ length: pm }, (_, i) => i)
                                                                : [],
                                                    };
                                                }}
                                                style={{ width: '100%', borderRadius: 8, height: 36, fontWeight: 600 }}
                                            />
                                        </div>
                                        {tripType === 'oneWay' && (
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                background: 'rgba(243, 244, 246, 0.6)',
                                                backdropFilter: 'blur(1px)', borderRadius: 16,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                pointerEvents: 'none',
                                            }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{
                                                        width: 44, height: 44, borderRadius: '50%',
                                                        background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        margin: '0 auto 6px',
                                                    }}>
                                                        <LockOutlined style={{ fontSize: 16, color: '#9ca3af' }} />
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Çift yön seçin</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Passengers Card */}
                            <div style={{
                                background: '#fff', borderRadius: 12, padding: 10,
                                border: '1px solid #e5e7eb', marginBottom: 10,
                                transition: 'all 0.3s ease',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{
                                            width: 24, height: 24, borderRadius: 6,
                                            background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <TeamOutlined style={{ fontSize: 12, color: 'var(--brand-accent)' }} />
                                        </div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Yolcular</label>
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, color: 'var(--brand-accent)',
                                        background: 'var(--brand-primary-08)', padding: '4px 12px', borderRadius: 999,
                                    }}>{totalPax} Kişi</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                    {[
                                        { key: 'adult', label: 'Yetişkin', value: adults, set: setAdults, min: 1 },
                                        { key: 'child', label: 'Çocuk', value: children, set: setChildren, min: 0 },
                                        { key: 'infant', label: 'Bebek', value: infants, set: setInfants, min: 0 },
                                    ].map(p => (
                                        <div key={p.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 8px', background: '#f9fafb', borderRadius: 8 }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{p.label}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button
                                                    onClick={() => p.set(Math.max(p.min, p.value - 1))}
                                                    disabled={p.value <= p.min}
                                                    style={{
                                                        width: 24, height: 24, borderRadius: 6,
                                                        background: '#fff', border: '1px solid #e5e7eb',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#4b5563', cursor: p.value <= p.min ? 'not-allowed' : 'pointer',
                                                        opacity: p.value <= p.min ? 0.4 : 1, padding: 0,
                                                    }}
                                                >
                                                    <MinusOutlined style={{ fontSize: 10 }} />
                                                </button>
                                                <span style={{
                                                    minWidth: 18, textAlign: 'center', fontWeight: 700,
                                                    fontSize: 13, color: '#1f2937',
                                                }}>{p.value}</span>
                                                <button
                                                    onClick={() => p.set(Math.min(9, p.value + 1))}
                                                    disabled={p.value >= 9}
                                                    style={{
                                                        width: 24, height: 24, borderRadius: 6,
                                                        background: '#fff', border: '1px solid #e5e7eb',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#4b5563', cursor: p.value >= 9 ? 'not-allowed' : 'pointer',
                                                        opacity: p.value >= 9 ? 0.4 : 1, padding: 0,
                                                    }}
                                                >
                                                    <PlusOutlined style={{ fontSize: 10 }} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSearch}
                                disabled={searching}
                                style={{
                                    width: '100%', height: 44, borderRadius: 12,
                                    border: 'none', cursor: searching ? 'wait' : 'pointer',
                                    background: 'linear-gradient(135deg, var(--brand-accent) 0%, var(--brand-accent) 50%, var(--brand-accent) 100%)',
                                    backgroundSize: '200% 200%',
                                    color: '#fff', fontSize: 15, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                                    boxShadow: '0 10px 30px -8px rgba(124, 58, 237, 0.4)',
                                    transition: 'all 0.3s ease',
                                    opacity: searching ? 0.85 : 1,
                                    letterSpacing: '-0.2px',
                                }}
                                onMouseEnter={e => { if (!searching) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(124, 58, 237, 0.4)'; } }}
                                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 10px 30px -8px rgba(124, 58, 237, 0.4)'; }}
                            >
                                {searching ? <Spin size="small" style={{ filter: 'brightness(10)' }} /> : <SearchOutlined style={{ fontSize: 18 }} />}
                                {searching
                                    ? 'Aranıyor...'
                                    : tripType === 'roundTrip'
                                        ? 'Araçları Listele (Gidiş-Dönüş)'
                                        : 'Araçları Listele & Fiyat Al'}
                            </button>

                            {/* Trust badges */}
                            <div style={{
                                display: 'flex', justifyContent: 'center', gap: 18,
                                marginTop: 8, fontSize: 11, color: '#6b7280',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <SafetyOutlined style={{ fontSize: 14, color: '#22c55e' }} />
                                    <span>SSL Güvenli</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ThunderboltOutlined style={{ fontSize: 14, color: '#f59e0b' }} />
                                    <span>Anlık Fiyatlandırma</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CustomerServiceOutlined style={{ fontSize: 14, color: 'var(--brand-primary)' }} />
                                    <span>7/24 Destek</span>
                                </div>
                            </div>

                            {/* Route Info */}
                            {routeInfo && (
                                <div style={{
                                    display: 'flex', gap: 12, marginTop: 16,
                                }}>
                                    <div style={{
                                        flex: 1, padding: '12px 16px', borderRadius: 12,
                                        background: '#fff', border: '1px solid var(--brand-primary-10)',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}>
                                        <div style={{
                                            width: 34, height: 34, borderRadius: 9,
                                            background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <SwapRightOutlined style={{ fontSize: 14, color: 'var(--brand-primary)' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Mesafe</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{routeInfo.distance}</div>
                                        </div>
                                    </div>
                                    <div style={{
                                        flex: 1, padding: '12px 16px', borderRadius: 12,
                                        background: '#fff', border: '1px solid var(--brand-primary-10)',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}>
                                        <div style={{
                                            width: 34, height: 34, borderRadius: 9,
                                            background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <ClockCircleOutlined style={{ fontSize: 14, color: 'var(--brand-primary)' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Tahmini Sure</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{routeInfo.duration}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {searchError && (
                                <Alert type="warning" showIcon message={searchError}
                                    style={{ marginTop: 16, borderRadius: 12, border: '1px solid #fde68a' }}
                                />
                            )}

                            {searching && (
                                <div style={{
                                    textAlign: 'center', padding: '40px 20px',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                                }}>
                                    <Spin size="large" />
                                    <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Uygun araclar aranıyor...</div>
                                </div>
                            )}

                            {/* ── Outbound Selected Summary (in return phase) ── */}
                            {tripType === 'roundTrip' && selectionPhase === 'return' && selected && (
                                <div style={{
                                    marginTop: 20, padding: '12px 14px',
                                    background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                    border: '1.5px solid #86efac', borderRadius: 12,
                                    display: 'flex', alignItems: 'center', gap: 12,
                                }}>
                                    <div style={{
                                        width: 34, height: 34, borderRadius: 10,
                                        background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 16 }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Gidiş Aracı Seçildi
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                            {selected.vehicleType} · {formatPrice(selected.price, selected.currency)}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {pickup} → {dropoff} · {pickupDateTime?.format('DD.MM.YYYY HH:mm')}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setSelected(null); setSelectionPhase('outbound'); setReturnResults([]); setReturnSelected(null); }}
                                        style={{
                                            border: '1px solid #86efac', background: '#fff',
                                            color: '#16a34a', fontSize: 11, fontWeight: 700,
                                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                        }}
                                    >
                                        <ArrowLeftOutlined /> Değiştir
                                    </button>
                                </div>
                            )}

                            {/* ── Return phase loading/error ── */}
                            {tripType === 'roundTrip' && selectionPhase === 'return' && returnSearching && (
                                <div style={{ textAlign: 'center', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                    <Spin size="large" />
                                    <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Dönüş için araçlar aranıyor...</div>
                                </div>
                            )}
                            {tripType === 'roundTrip' && selectionPhase === 'return' && returnSearchError && (
                                <Alert type="warning" showIcon message={returnSearchError} style={{ marginTop: 12, borderRadius: 12 }} />
                            )}

                            {/* Vehicle Results (phase-aware) */}
                            {(() => {
                                const isReturnPhase = tripType === 'roundTrip' && selectionPhase === 'return';
                                const currentList = isReturnPhase ? returnResults : results;
                                const currentSearching = isReturnPhase ? returnSearching : searching;
                                if (currentSearching || currentList.length === 0) return null;
                                return (
                                <div style={{ marginTop: 20 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        marginBottom: 14,
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                            {isReturnPhase ? '🔄 Dönüş Aracı Seçin' : (tripType === 'roundTrip' ? '➡️ Gidiş Aracı Seçin' : 'Uygun Araclar')}
                                        </div>
                                        <Tag style={{
                                            borderRadius: 8, fontWeight: 700, fontSize: 12, margin: 0,
                                            background: isReturnPhase ? '#fef3c7' : 'var(--brand-primary-08)',
                                            color: isReturnPhase ? '#d97706' : 'var(--brand-primary)',
                                            border: `1px solid ${isReturnPhase ? '#fcd34d' : 'var(--brand-primary-15)'}`,
                                            padding: '2px 10px',
                                        }}>
                                            {currentList.length} sonuç
                                        </Tag>
                                    </div>
                                    <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
                                        {currentList.map((r, idx) => (
                                            <div
                                                key={r.id}
                                                onClick={() => handleSelectVehicle(r)}
                                                style={{
                                                    background: '#fff', borderRadius: 14, padding: 16,
                                                    border: '1.5px solid #e8ecf1',
                                                    marginBottom: idx < results.length - 1 ? 10 : 0,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex', alignItems: 'center', gap: 16,
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = 'var(--brand-primary-20)';
                                                    e.currentTarget.style.boxShadow = '0 4px 16px var(--brand-primary-10)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#e8ecf1';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                {/* Vehicle Image */}
                                                <div style={{
                                                    width: 100, height: 68, borderRadius: 10,
                                                    overflow: 'hidden', flexShrink: 0,
                                                    background: '#f8fafc', border: '1px solid #f0f0f0',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {r.image ? (
                                                        <img src={r.image} alt={r.vehicleType}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            onError={(e) => { (e.target as HTMLImageElement).src = r.isShuttle ? '/vehicles/sprinter.png' : '/vehicles/vito.png'; }}
                                                        />
                                                    ) : (
                                                        <CarOutlined style={{ fontSize: 28, color: '#cbd5e1' }} />
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.3px' }}>
                                                            {r.vehicleType}
                                                        </span>
                                                        {r.isShuttle && (
                                                            <Tag style={{
                                                                borderRadius: 6, fontSize: 10, fontWeight: 700, margin: 0,
                                                                background: '#f3e8ff', color: 'var(--brand-accent)', border: '1px solid var(--brand-primary-15)',
                                                                padding: '0 6px', lineHeight: '18px',
                                                            }}>
                                                                SHUTTLE
                                                            </Tag>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, marginBottom: 6 }}>
                                                        {r.vendor}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {r.matchedMasterTime && (
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: '#2563eb', background: '#eff6ff',
                                                                padding: '2px 8px', borderRadius: 6,
                                                                border: '1px solid #bfdbfe',
                                                            }}>
                                                                <ClockCircleOutlined style={{ marginRight: 3 }} />{r.matchedMasterTime}
                                                            </span>
                                                        )}
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600,
                                                            color: '#475569', background: '#f1f5f9',
                                                            padding: '2px 8px', borderRadius: 6,
                                                        }}>
                                                            <TeamOutlined style={{ marginRight: 3 }} />{r.capacity} kisi
                                                        </span>
                                                        {r.luggage > 0 && (
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: '#475569', background: '#f1f5f9',
                                                                padding: '2px 8px', borderRadius: 6,
                                                            }}>
                                                                {r.luggage} bavul
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Price + CTA */}
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{
                                                        fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px',
                                                        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                                                        WebkitBackgroundClip: 'text',
                                                        WebkitTextFillColor: 'transparent',
                                                        lineHeight: 1.1,
                                                    }}>
                                                        {formatPrice(r.price, r.currency)}
                                                    </div>
                                                    <div style={{
                                                        marginTop: 6, fontSize: 11, fontWeight: 700,
                                                        color: '#10b981', display: 'flex', alignItems: 'center',
                                                        justifyContent: 'flex-end', gap: 4,
                                                    }}>
                                                        Sec <SwapRightOutlined />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ─── STEP 2: Customer + Payment ─── */}
                    {step === 1 && selected && (
                        <div>
                            {/* Outbound Vehicle Summary */}
                            <div style={{
                                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                borderRadius: 14, padding: '14px 18px',
                                border: '1.5px solid #86efac',
                                marginBottom: tripType === 'roundTrip' && returnSelected ? 10 : 20,
                                display: 'flex', alignItems: 'center', gap: 14,
                            }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 11,
                                    background: '#dcfce7', border: '2px solid #86efac',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <ArrowRightOutlined style={{ fontSize: 16, color: '#16a34a' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {tripType === 'roundTrip' ? 'Gidiş Aracı' : 'Seçilen Araç'}
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                                        {selected.vehicleType}
                                        {selected.isShuttle && <Tag style={{ marginLeft: 6, borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#f3e8ff', color: 'var(--brand-accent)', border: 'none' }}>SHUTTLE</Tag>}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {pickup} <SwapRightOutlined style={{ margin: '0 4px', color: '#94a3b8' }} /> {dropoff}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                        {pickupDateTime?.format('DD.MM.YYYY HH:mm')}
                                        {routeInfo?.duration && ` · ${routeInfo.duration}`}
                                        {routeInfo?.distance && ` · ${routeInfo.distance}`}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: '#059669', letterSpacing: '-0.5px' }}>
                                        {formatPrice(selected.price, selected.currency)}
                                    </div>
                                    <button
                                        onClick={() => setStep(0)}
                                        style={{
                                            marginTop: 4, border: 'none', background: 'none',
                                            color: 'var(--brand-primary)', fontSize: 11, fontWeight: 600,
                                            cursor: 'pointer', padding: 0,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <ArrowLeftOutlined style={{ fontSize: 10 }} /> Değiştir
                                    </button>
                                </div>
                            </div>

                            {/* Return Vehicle Summary (round-trip) */}
                            {tripType === 'roundTrip' && returnSelected && (
                                <div style={{
                                    background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                                    borderRadius: 14, padding: '14px 18px',
                                    border: '1.5px solid #fcd34d',
                                    marginBottom: 20,
                                    display: 'flex', alignItems: 'center', gap: 14,
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 11,
                                        background: '#fef3c7', border: '2px solid #fcd34d',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <ArrowLeftOutlined style={{ fontSize: 16, color: '#d97706' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            Dönüş Aracı
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginTop: 1 }}>
                                            {returnSelected.vehicleType}
                                            {returnSelected.isShuttle && <Tag style={{ marginLeft: 6, borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#f3e8ff', color: 'var(--brand-accent)', border: 'none' }}>SHUTTLE</Tag>}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {dropoff} <SwapRightOutlined style={{ margin: '0 4px', color: '#94a3b8' }} /> {pickup}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                            {returnDateTime?.format('DD.MM.YYYY HH:mm')}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: '#d97706', letterSpacing: '-0.5px' }}>
                                            {formatPrice(returnSelected.price, returnSelected.currency)}
                                        </div>
                                        <button
                                            onClick={() => { setStep(0); setReturnSelected(null); setSelectionPhase('return'); }}
                                            style={{
                                                marginTop: 4, border: 'none', background: 'none',
                                                color: '#d97706', fontSize: 11, fontWeight: 600,
                                                cursor: 'pointer', padding: 0,
                                                display: 'flex', alignItems: 'center', gap: 4,
                                            }}
                                        >
                                            <ArrowLeftOutlined style={{ fontSize: 10 }} /> Değiştir
                                        </button>
                                    </div>
                                </div>
                            )}

                            <Form form={customerForm} layout="vertical" requiredMark={false}>
                                {/* Customer Info */}
                                <div style={{
                                    background: '#fff', borderRadius: 14, padding: '18px 20px',
                                    border: '1px solid #e8ecf1', marginBottom: 16,
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 8,
                                            background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <UserOutlined style={{ fontSize: 13, color: 'var(--brand-primary)' }} />
                                        </div>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Musteri Bilgileri</span>
                                    </div>

                                    {/* Agency Selection */}
                                    <div style={{
                                        background: selectedAgencyId ? '#f0fdf4' : '#f9fafb',
                                        borderRadius: 12, padding: '12px 14px',
                                        border: `1.5px solid ${selectedAgencyId ? '#86efac' : '#e5e7eb'}`,
                                        marginBottom: 14,
                                        transition: 'all 0.2s',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <BankOutlined style={{ fontSize: 14, color: selectedAgencyId ? '#16a34a' : 'var(--brand-primary)' }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Alt Acenta (Opsiyonel)</span>
                                            {selectedAgencyId && (
                                                <Tag color="success" style={{ fontSize: 10, borderRadius: 6, margin: 0 }}>Acenta Seçildi</Tag>
                                            )}
                                        </div>
                                        <Select
                                            allowClear
                                            showSearch
                                            placeholder="Acenta seçin (varsa)"
                                            value={selectedAgencyId}
                                            onChange={(val) => setSelectedAgencyId(val || null)}
                                            loading={loadingAgencies}
                                            style={{ width: '100%', borderRadius: 10 }}
                                            size="large"
                                            optionFilterProp="label"
                                            options={agencies.map((a: any) => ({
                                                value: a.id,
                                                label: a.name,
                                            }))}
                                        />
                                    </div>

                                    <Row gutter={14}>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="passengerName" label={<span style={{ fontWeight: 600, color: '#475569', fontSize: 12 }}>Ad Soyad</span>} rules={[{ required: true, message: 'Zorunlu' }]}>
                                                <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Ali Yilmaz" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="passengerPhone" label={<span style={{ fontWeight: 600, color: '#475569', fontSize: 12 }}>Telefon</span>} rules={[{ required: true, message: 'Zorunlu' }]}>
                                                <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} placeholder="+90 555 123 45 67" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item
                                                name="passengerEmail"
                                                label={<span style={{ fontWeight: 600, color: '#475569', fontSize: 12 }}>E-posta <span style={{ color: '#ef4444' }}>*</span></span>}
                                                rules={[
                                                    { required: true, message: 'E-posta zorunludur' },
                                                    { type: 'email', message: 'Geçerli bir e-posta girin' },
                                                ]}
                                            >
                                                <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="musteri@ornek.com" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="flightNumber" label={<span style={{ fontWeight: 600, color: '#475569', fontSize: 12 }}>Ucus No / PNR</span>}>
                                                <Input prefix={<SafetyCertificateOutlined style={{ color: '#94a3b8' }} />} placeholder="TK1234 / ABC123" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </div>

                                {/* Extra Services */}
                                <div style={{
                                    background: '#fff', borderRadius: 14, padding: '16px 20px',
                                    border: '1px solid #e8ecf1', marginBottom: 16,
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: 8,
                                                background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <GiftOutlined style={{ fontSize: 13, color: '#d97706' }} />
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Ekstra Hizmetler</span>
                                            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>(Opsiyonel)</span>
                                        </div>
                                        {extrasTotal > 0 && (
                                            <span style={{
                                                fontSize: 12, fontWeight: 700, color: '#059669',
                                                background: '#d1fae5', padding: '4px 10px', borderRadius: 999,
                                            }}>
                                                +{formatPrice(extrasTotal, selected.currency || 'TRY')}
                                            </span>
                                        )}
                                    </div>

                                    {loadingExtras ? (
                                        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
                                    ) : extraServices.length === 0 ? (
                                        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 }}>
                                            Bu araç için ekstra hizmet bulunmuyor.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                                            {extraServices.map(svc => {
                                                const qty = selectedServices.get(svc.id) || 0;
                                                const active = qty > 0;
                                                const maxQty = svc.isPerPerson ? Math.max(1, totalPaxForExtras) : 10;
                                                return (
                                                    <div key={svc.id} style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        gap: 8, padding: '8px 12px', borderRadius: 10,
                                                        background: active ? '#f0fdf4' : '#f9fafb',
                                                        border: `1px solid ${active ? '#86efac' : '#e5e7eb'}`,
                                                        transition: 'all 0.2s',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                                                            <div style={{
                                                                width: 28, height: 28, borderRadius: 6,
                                                                background: '#fff', border: '1px solid #e5e7eb',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                            }}>
                                                                <ShoppingOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
                                                            </div>
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {svc.name}
                                                                </div>
                                                                <div style={{ fontSize: 10, color: '#64748b' }}>
                                                                    {formatPrice(Number(svc.price), svc.currency || 'TRY')} {svc.isPerPerson ? '/ kişi' : '/ adet'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setServiceQty(svc.id, Math.max(0, qty - 1))}
                                                                disabled={qty <= 0}
                                                                style={{
                                                                    width: 22, height: 22, borderRadius: 5,
                                                                    background: '#fff', border: '1px solid #e5e7eb',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: '#475569', cursor: qty <= 0 ? 'not-allowed' : 'pointer',
                                                                    opacity: qty <= 0 ? 0.4 : 1, padding: 0,
                                                                }}
                                                            >
                                                                <MinusOutlined style={{ fontSize: 9 }} />
                                                            </button>
                                                            <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{qty}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setServiceQty(svc.id, Math.min(maxQty, qty + 1))}
                                                                disabled={qty >= maxQty}
                                                                style={{
                                                                    width: 22, height: 22, borderRadius: 5,
                                                                    background: '#fff', border: '1px solid #e5e7eb',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: '#475569', cursor: qty >= maxQty ? 'not-allowed' : 'pointer',
                                                                    opacity: qty >= maxQty ? 0.4 : 1, padding: 0,
                                                                }}
                                                            >
                                                                <PlusOutlined style={{ fontSize: 9 }} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Passengers + Payment side by side */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                    {/* Passengers */}
                                    <div style={{
                                        background: '#fff', borderRadius: 14, padding: '18px 20px',
                                        border: '1px solid #e8ecf1',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: 8,
                                                background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <TeamOutlined style={{ fontSize: 13, color: 'var(--brand-primary)' }} />
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Yolcu Sayisi</span>
                                        </div>
                                        <Row gutter={10}>
                                            <Col span={8}>
                                                <Form.Item name="adults" label={<span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>YETISKIN</span>} initialValue={adults}>
                                                    <InputNumber min={1} style={{ width: '100%', borderRadius: 8 }} />
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
                                                <Form.Item name="children" label={<span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>COCUK</span>} initialValue={children}>
                                                    <InputNumber min={0} style={{ width: '100%', borderRadius: 8 }} />
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
                                                <Form.Item name="infants" label={<span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>BEBEK</span>} initialValue={infants}>
                                                    <InputNumber min={0} style={{ width: '100%', borderRadius: 8 }} />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>

                                    {/* Payment */}
                                    <div style={{
                                        background: '#fff', borderRadius: 14, padding: '18px 20px',
                                        border: '1px solid #e8ecf1',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: 8,
                                                background: 'var(--brand-primary-08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <CreditCardOutlined style={{ fontSize: 13, color: 'var(--brand-primary)' }} />
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Odeme Yontemi</span>
                                        </div>
                                        <Form.Item name="paymentMethod" initialValue="PAY_IN_VEHICLE" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <Form.Item name="paymentMethod" noStyle>
                                                    <Radio.Group style={{ display: 'flex', gap: 10, width: '100%' }}>
                                                        {[
                                                            { value: 'PAY_IN_VEHICLE', label: 'Aracta Tahsilat', icon: <DollarOutlined />, color: '#f59e0b' },
                                                            { value: 'CREDIT_CARD', label: 'Kredi Karti', icon: <CreditCardOutlined />, color: 'var(--brand-primary)' },
                                                        ].map(pm => (
                                                            <Radio.Button key={pm.value} value={pm.value} style={{
                                                                flex: 1, height: 54, borderRadius: 10,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontWeight: 600, fontSize: 12,
                                                            }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                                    {React.cloneElement(pm.icon, { style: { fontSize: 16, color: pm.color } })}
                                                                    <span>{pm.label}</span>
                                                                </div>
                                                            </Radio.Button>
                                                        ))}
                                                    </Radio.Group>
                                                </Form.Item>
                                            </div>
                                        </Form.Item>
                                    </div>
                                </div>

                                {/* Price Breakdown */}
                                <div style={{
                                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                    borderRadius: 14, padding: '14px 18px',
                                    border: '1.5px solid #e2e8f0', marginBottom: 16,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <DollarOutlined style={{ fontSize: 13, color: '#16a34a' }} />
                                        </div>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Fiyat Özeti</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#475569' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #e2e8f0' }}>
                                            <span>{tripType === 'roundTrip' ? 'Gidiş aracı' : 'Araç ücreti'} ({selected.vehicleType})</span>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{formatPrice(Number(selected.price), selected.currency)}</span>
                                        </div>
                                        {tripType === 'roundTrip' && returnSelected && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #e2e8f0' }}>
                                                <span>Dönüş aracı ({returnSelected.vehicleType})</span>
                                                <span style={{ fontWeight: 700, color: '#1e293b' }}>{formatPrice(Number(returnSelected.price), returnSelected.currency)}</span>
                                            </div>
                                        )}
                                        {extrasTotal > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #e2e8f0' }}>
                                                <span>Ekstra hizmetler ({selectedServices.size} adet)</span>
                                                <span style={{ fontWeight: 700, color: '#1e293b' }}>{formatPrice(extrasTotal, selected.currency || 'TRY')}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 2px', alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Toplam</span>
                                            <span style={{ fontSize: 20, fontWeight: 900, color: '#059669', letterSpacing: '-0.5px' }}>
                                                {formatPrice(grandTotal, selected.currency || 'TRY')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div style={{
                                    background: '#fff', borderRadius: 14, padding: '16px 20px',
                                    border: '1px solid #e8ecf1', marginBottom: 20,
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                }}>
                                    <Form.Item name="notes" label={
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                                            <span style={{ fontWeight: 600, color: '#475569', fontSize: 12 }}>Ek Aciklama / Notlar</span>
                                        </div>
                                    } style={{ marginBottom: 0 }}>
                                        <Input.TextArea
                                            rows={2}
                                            placeholder="Ozel istekler, bebek koltugu, ekstra bagaj vb."
                                            style={{ borderRadius: 10, resize: 'none' }}
                                        />
                                    </Form.Item>
                                </div>
                            </Form>

                            {/* Footer Actions */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '16px 0 0',
                                borderTop: '1px solid #f0f0f0',
                            }}>
                                <button
                                    onClick={() => setStep(0)}
                                    style={{
                                        height: 44, padding: '0 20px', borderRadius: 10,
                                        border: '1.5px solid #e2e8f0', background: '#fff',
                                        color: '#475569', fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                >
                                    <ArrowLeftOutlined style={{ fontSize: 12 }} /> Geri
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating}
                                    style={{
                                        height: 48, padding: '0 28px', borderRadius: 12,
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: '#fff', fontSize: 15, fontWeight: 700,
                                        cursor: creating ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
                                        transition: 'all 0.2s',
                                        opacity: creating ? 0.8 : 1,
                                        letterSpacing: '-0.2px',
                                    }}
                                    onMouseEnter={e => { if (!creating) e.currentTarget.style.boxShadow = '0 6px 24px rgba(16,185,129,0.4)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,185,129,0.3)'; }}
                                >
                                    {creating ? <Spin size="small" style={{ filter: 'brightness(10)' }} /> : <CheckCircleOutlined style={{ fontSize: 16 }} />}
                                    Rezervasyonu Oluştur · {formatPrice(grandTotal, selected.currency)}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
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
                title={mapOpen === 'pickup' ? 'Alis Konumunu Secin' : 'Birakis Konumunu Secin'}
                country="TUR"
            />

            <style jsx global>{`
                .cc-wizard-modal .ant-modal-content {
                    border-radius: 20px !important;
                    overflow: hidden !important;
                    padding: 0 !important;
                }
            `}</style>
        </>
    );
};

export default CallCenterBookingWizard;
