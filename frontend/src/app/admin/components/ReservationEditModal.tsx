'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Input, InputNumber, Select, DatePicker, Tag, Typography, message, Spin, Radio, Button } from 'antd';
import {
    TeamOutlined, UserOutlined, PhoneOutlined, CarOutlined, CalendarOutlined,
    PlusOutlined, MinusOutlined, DollarOutlined, CheckCircleOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
import MapPickerModal from '@/app/components/MapPickerModal';

const { Text } = Typography;

export interface ReservationEditModalProps {
    open: boolean;
    booking: any | null;
    onClose: () => void;
    onSaved?: (updated: any) => void;
}

type Pax = { firstName: string; lastName: string; nationality: string; type: string };

const NATIONALITY_OPTIONS = [
    { value: 'TR', label: '🇹🇷 TR' }, { value: 'DE', label: '🇩🇪 DE' },
    { value: 'GB', label: '🇬🇧 GB' }, { value: 'US', label: '🇺🇸 US' },
    { value: 'FR', label: '🇫🇷 FR' }, { value: 'NL', label: '🇳🇱 NL' },
    { value: 'RU', label: '🇷🇺 RU' }, { value: 'UA', label: '🇺🇦 UA' },
    { value: 'SA', label: '🇸🇦 SA' }, { value: 'AE', label: '🇦🇪 AE' },
    { value: 'IR', label: '🇮🇷 IR' }, { value: 'IQ', label: '🇮🇶 IQ' },
    { value: 'AZ', label: '🇦🇿 AZ' }, { value: 'KZ', label: '🇰🇿 KZ' },
    { value: 'OTHER', label: 'Diğer' },
];

const ReservationEditModal: React.FC<ReservationEditModalProps> = ({ open, booking, onClose, onSaved }) => {
    // Pax counts
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [infants, setInfants] = useState(0);
    const [paxList, setPaxList] = useState<Pax[]>([]);
    // Pricing
    const [isPerPerson, setIsPerPerson] = useState(false);
    const [perSeatPrice, setPerSeatPrice] = useState(0);
    const [originalPrice, setOriginalPrice] = useState(0);
    const [originalPax, setOriginalPax] = useState(0);
    const [pricingMode, setPricingMode] = useState<'auto' | 'keep' | 'manual'>('keep');
    const [manualPrice, setManualPrice] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<'ADD_TO_BALANCE' | 'PAY_IN_VEHICLE'>('ADD_TO_BALANCE');
    // Reservation info
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [pickupDateTime, setPickupDateTime] = useState<dayjs.Dayjs | null>(null);
    const [pickupLocation, setPickupLocation] = useState('');
    const [dropoffLocation, setDropoffLocation] = useState('');
    const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [flightNumber, setFlightNumber] = useState('');
    const [notes, setNotes] = useState('');
    // Map picker
    const [mapModalOpen, setMapModalOpen] = useState(false);
    const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff' | null>(null);
    // UI state
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !booking) return;
        const a = booking.adults || 1;
        const c = booking.children || 0;
        const inf = booking.infants || 0;
        setAdults(a); setChildren(c); setInfants(inf);

        const md = booking.metadata || {};

        const existing = md.passengerDetails || md.passengersList || [];
        setPaxList(existing.map((p: any) => ({
            firstName: p.firstName || p.name?.split(' ')[0] || '',
            lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
            nationality: p.nationality || p.country || '',
            type: p.type || 'adult',
        })));

        const isPp = !!md.isShuttle || !!md.shuttleRouteId;
        const oPax = a + c + inf;
        const cur = Number(booking.price || booking.total || 0);
        const derivedPerSeat = oPax > 0 ? cur / oPax : 0;
        const seat = md.pricePerSeat ? Number(md.pricePerSeat) : derivedPerSeat;
        setIsPerPerson(isPp);
        setPerSeatPrice(seat);
        setOriginalPrice(cur);
        setOriginalPax(oPax);
        setPricingMode(isPp ? 'auto' : 'keep');
        setManualPrice(cur);
        setPaymentMethod('ADD_TO_BALANCE');

        setContactName(booking.contactName || booking.passengerName || booking.customer?.name || '');
        setContactPhone(booking.contactPhone || booking.passengerPhone || booking.customer?.phone || '');
        setContactEmail(booking.contactEmail || booking.customer?.email || '');
        setPickupDateTime(booking.pickupDateTime || booking.startDate ? dayjs(booking.pickupDateTime || booking.startDate) : null);
        setPickupLocation(md.pickup || booking.pickup || booking.pickupLocation || '');
        setDropoffLocation(md.dropoff || booking.dropoff || booking.dropoffLocation || '');
        setPickupCoords(md.pickupCoords || (md.pickupLat && md.pickupLng ? { lat: md.pickupLat, lng: md.pickupLng } : null));
        setDropoffCoords(md.dropoffCoords || (md.dropoffLat && md.dropoffLng ? { lat: md.dropoffLat, lng: md.dropoffLng } : null));
        setFlightNumber(booking.flightNumber || md.flightNumber || '');
        setNotes(booking.notes || md.specialRequests || '');
    }, [open, booking]);

    const totalPax = adults + children + infants;
    const computedNewPrice = (() => {
        if (pricingMode === 'auto' && isPerPerson) return Math.round(perSeatPrice * totalPax);
        if (pricingMode === 'manual') return manualPrice;
        return originalPrice;
    })();
    const priceDiff = computedNewPrice - originalPrice;

    const syncPaxList = (a: number, c: number, inf: number, cur: Pax[]) => {
        const types: string[] = [];
        for (let i = 0; i < a; i++) types.push('adult');
        for (let i = 0; i < c; i++) types.push('child');
        for (let i = 0; i < inf; i++) types.push('infant');
        return types.map((type, idx) => idx < cur.length ? { ...cur[idx], type } : { firstName: '', lastName: '', nationality: '', type });
    };

    const handlePaxCount = (field: 'adults' | 'children' | 'infants', delta: number) => {
        let a = adults, c = children, inf = infants;
        if (field === 'adults') a = Math.max(1, a + delta);
        if (field === 'children') c = Math.max(0, c + delta);
        if (field === 'infants') inf = Math.max(0, inf + delta);
        setAdults(a); setChildren(c); setInfants(inf);
        setPaxList(syncPaxList(a, c, inf, paxList));
    };

    const handlePaxField = (idx: number, field: string, value: string) => {
        setPaxList(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };

    const openMap = (target: 'pickup' | 'dropoff') => {
        setMapTarget(target);
        setMapModalOpen(true);
    };

    const handleMapConfirm = (address: string, lat: number, lng: number) => {
        if (mapTarget === 'pickup') {
            setPickupLocation(address);
            setPickupCoords({ lat, lng });
        } else if (mapTarget === 'dropoff') {
            setDropoffLocation(address);
            setDropoffCoords({ lat, lng });
        }
        setMapModalOpen(false);
        setMapTarget(null);
    };

    const handleSave = async () => {
        if (!booking) return;
        setSaving(true);
        try {
            const reflectPrice = priceDiff !== 0 && paymentMethod === 'ADD_TO_BALANCE';
            const payload: any = {
                adults, children, infants,
                contactName, contactPhone, contactEmail,
                pickupDateTime: pickupDateTime ? pickupDateTime.toISOString() : undefined,
                pickupLocation, dropoffLocation,
                flightNumber, notes,
                passengerDetails: paxList.map(p => ({
                    firstName: p.firstName, lastName: p.lastName,
                    name: `${p.firstName} ${p.lastName}`.trim(),
                    nationality: p.nationality, type: p.type,
                })),
            };
            if (reflectPrice) payload.price = Math.max(0, computedNewPrice);

            await apiClient.patch(`/api/transfer/bookings/${booking.id}`, payload);

            const updated: any = {
                ...booking,
                adults, children, infants,
                contactName, passengerName: contactName,
                contactPhone, passengerPhone: contactPhone,
                contactEmail,
                pickupDateTime: pickupDateTime ? pickupDateTime.toISOString() : booking.pickupDateTime,
                flightNumber, notes,
                metadata: {
                    ...(booking.metadata || {}),
                    pickup: pickupLocation,
                    dropoff: dropoffLocation,
                    pickupCoords, dropoffCoords,
                    flightNumber, specialRequests: notes,
                    passengerDetails: payload.passengerDetails,
                },
            };
            if (reflectPrice) {
                updated.price = Math.max(0, computedNewPrice);
                updated.total = updated.price;
            }
            if (priceDiff !== 0) {
                updated.metadata.paxChangeNote = `${paymentMethod === 'PAY_IN_VEHICLE' ? 'Araçta ödeme' : 'Bakiyeye eklendi'}: ${priceDiff > 0 ? '+' : ''}${priceDiff.toLocaleString('tr-TR')} ₺`;
                updated.metadata.paxPaymentMethod = paymentMethod;
            }
            message.success('Rezervasyon güncellendi');
            onSaved?.(updated);
            onClose();
        } catch (e: any) {
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Modal
                title={null}
                closable={false}
                open={open}
                onCancel={onClose}
                width={760}
                centered
                footer={null}
                styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' } }}
            >
                {booking && (
                    <div>
                        {/* Header */}
                        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)', padding: '16px 22px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <TeamOutlined style={{ fontSize: 16, color: '#fff' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Rezervasyonu Düzenle</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{booking.bookingNumber}</div>
                                    </div>
                                </div>
                                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', width: 28, height: 28, borderRadius: 6, color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                            </div>
                        </div>

                        <div style={{ padding: '16px 22px 14px', background: '#fafbfc' }}>
                            {/* Summary */}
                            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #e8ecf1', marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Müşteri</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <UserOutlined style={{ color: '#6366f1', marginRight: 4 }} />{contactName || '—'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Araç</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <CarOutlined style={{ color: '#6366f1', marginRight: 4 }} />{booking.metadata?.vehicleType || booking.vehicleType || '—'}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mevcut Fiyat</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#6366f1', marginTop: 2, fontFamily: 'monospace' }}>₺{originalPrice.toLocaleString('tr-TR')}</div>
                                </div>
                            </div>

                            {/* Customer */}
                            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e8ecf1', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                                    <UserOutlined style={{ color: '#6366f1', marginRight: 6 }} />Müşteri Bilgileri
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ad Soyad</Text>
                                        <Input value={contactName} onChange={e => setContactName(e.target.value)} prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Müşteri adı" />
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Telefon</Text>
                                        <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} placeholder="+90 5XX XXX XX XX" />
                                    </div>
                                    <div style={{ gridColumn: '1 / span 2' }}>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>E-posta</Text>
                                        <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="ornek@mail.com" type="email" />
                                    </div>
                                </div>
                            </div>

                            {/* Transfer details */}
                            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e8ecf1', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                                    <CalendarOutlined style={{ color: '#6366f1', marginRight: 6 }} />Transfer Detayları
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div style={{ gridColumn: '1 / span 2' }}>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Tarih & Saat</Text>
                                        <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD.MM.YYYY HH:mm" value={pickupDateTime} onChange={setPickupDateTime} style={{ width: '100%' }} placeholder="Transfer tarih ve saati" />
                                    </div>
                                    <div style={{ gridColumn: '1 / span 2' }}>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                                            <span style={{ color: '#10b981' }}>●</span> Alış Yeri
                                        </Text>
                                        <DynamicLocationSearchInput
                                            value={pickupLocation}
                                            onChange={(v) => setPickupLocation(v)}
                                            onSelect={(addr, lat, lng) => { setPickupLocation(addr); if (lat && lng) setPickupCoords({ lat, lng }); }}
                                            onMapClick={() => openMap('pickup')}
                                            placeholder="Alış noktasını ara veya haritada seç..."
                                            country="TUR"
                                        />
                                    </div>
                                    <div style={{ gridColumn: '1 / span 2' }}>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                                            <span style={{ color: '#ef4444' }}>●</span> Bırakış Yeri
                                        </Text>
                                        <DynamicLocationSearchInput
                                            value={dropoffLocation}
                                            onChange={(v) => setDropoffLocation(v)}
                                            onSelect={(addr, lat, lng) => { setDropoffLocation(addr); if (lat && lng) setDropoffCoords({ lat, lng }); }}
                                            onMapClick={() => openMap('dropoff')}
                                            placeholder="Bırakış noktasını ara veya haritada seç..."
                                            country="TUR"
                                        />
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Uçuş No</Text>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <Input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="TK1234" style={{ flex: 1 }} />
                                            <Button
                                                onClick={async () => {
                                                    if (!flightNumber) { message.warning('Önce uçuş numarası girin'); return; }
                                                    const date = pickupDateTime ? pickupDateTime.format('YYYY-MM-DD') : '';
                                                    const hide = message.loading('Uçuş bilgisi sorgulanıyor...', 0);
                                                    try {
                                                        const res = await apiClient.get('/api/driver/flight-status', {
                                                            params: { flightNumber, date }
                                                        });
                                                        hide();
                                                        if (res.data.success && res.data.data) {
                                                            const f = res.data.data;
                                                            const arrSched = f.arrival?.scheduled ? dayjs(f.arrival.scheduled).format('DD.MM.YYYY HH:mm') : '-';
                                                            const arrEst = f.arrival?.estimated ? dayjs(f.arrival.estimated).format('DD.MM.YYYY HH:mm') : (f.arrival?.actual ? dayjs(f.arrival.actual).format('DD.MM.YYYY HH:mm') : '-');
                                                            const delayLabel = f.computedDelayMin > 0 ? `🔴 ${f.computedDelayMin} dk gecikme` : (f.computedDelayMin < 0 ? `🟢 ${-f.computedDelayMin} dk erken` : '🟢 Zamanında');
                                                            Modal.info({
                                                                title: `✈️ ${f.flightNumber} - ${f.airline || ''}`,
                                                                width: 480,
                                                                content: (
                                                                    <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                                                                        <div><strong>Durum:</strong> {f.status}</div>
                                                                        <div><strong>Kalkış:</strong> {f.departure?.airport} ({f.departure?.iata})</div>
                                                                        <div><strong>Varış:</strong> {f.arrival?.airport} ({f.arrival?.iata})</div>
                                                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                                                                            <div><strong>Planlanan varış:</strong> {arrSched}</div>
                                                                            <div><strong>Tahmini/Gerçek:</strong> {arrEst}</div>
                                                                            <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14 }}>{delayLabel}</div>
                                                                        </div>
                                                                    </div>
                                                                ),
                                                            });
                                                        } else {
                                                            message.warning(res.data.message || 'Uçuş bulunamadı');
                                                        }
                                                    } catch (e: any) {
                                                        hide();
                                                        const errData = e?.response?.data;
                                                        if (errData?.needsConfiguration) {
                                                            Modal.warning({
                                                                title: 'Uçuş Takibi Yapılandırılmadı',
                                                                content: 'AviationStack API anahtarınızı Ayarlar → Personel Yönetimi → Ayarlar bölümünden girin.',
                                                            });
                                                        } else {
                                                            message.error(errData?.error || e.message);
                                                        }
                                                    }
                                                }}
                                                title="Uçuş Durumunu Kontrol Et"
                                                style={{ background: '#0ea5e9', color: '#fff', border: 'none' }}
                                            >
                                                ✈️ Kontrol
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notlar</Text>
                                        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Özel istek / not" />
                                    </div>
                                </div>
                            </div>

                            {/* Pricing badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: isPerPerson ? '#eff6ff' : '#f5f3ff', border: `1px solid ${isPerPerson ? '#bfdbfe' : '#ddd6fe'}`, borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                                <span style={{ fontSize: 16 }}>{isPerPerson ? '👥' : '🚗'}</span>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: 700, color: isPerPerson ? '#1d4ed8' : '#6d28d9' }}>{isPerPerson ? 'Kişi Başı Fiyatlı' : 'Sabit Araç Fiyatlı'}</span>
                                    <span style={{ color: '#64748b', marginLeft: 6 }}>
                                        {isPerPerson ? `Birim: ₺${perSeatPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} / kişi  ·  Mevcut: ${originalPax} kişi` : 'Yolcu sayısı değişse bile araç fiyatı sabit kalır'}
                                    </span>
                                </div>
                            </div>

                            {/* Pax counters */}
                            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e8ecf1', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Kişi Sayısı</span>
                                    <Tag color="purple" style={{ borderRadius: 999, margin: 0, fontWeight: 700 }}>Toplam: {totalPax} kişi</Tag>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                    {([
                                        { key: 'adults' as const, label: 'Yetişkin', sub: '13+ yaş', val: adults, min: 1, color: '#6366f1', bg: '#eef2ff' },
                                        { key: 'children' as const, label: 'Çocuk', sub: '3-12 yaş', val: children, min: 0, color: '#f59e0b', bg: '#fef3c7' },
                                        { key: 'infants' as const, label: 'Bebek', sub: '0-2 yaş', val: infants, min: 0, color: '#ec4899', bg: '#fce7f3' },
                                    ] as const).map(item => (
                                        <div key={item.key} style={{ background: item.bg, borderRadius: 10, padding: '8px 10px', border: `1px solid ${item.color}22` }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                                            <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 6 }}>{item.sub}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                                <button onClick={() => handlePaxCount(item.key, -1)} disabled={item.val <= item.min}
                                                    style={{ width: 26, height: 26, borderRadius: 6, background: '#fff', border: `1px solid ${item.color}66`, color: item.color, cursor: item.val <= item.min ? 'not-allowed' : 'pointer', opacity: item.val <= item.min ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                                                    <MinusOutlined style={{ fontSize: 11 }} />
                                                </button>
                                                <span style={{ fontSize: 18, fontWeight: 800, color: item.color, minWidth: 22, textAlign: 'center' }}>{item.val}</span>
                                                <button onClick={() => handlePaxCount(item.key, 1)}
                                                    style={{ width: 26, height: 26, borderRadius: 6, background: '#fff', border: `1px solid ${item.color}66`, color: item.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                                                    <PlusOutlined style={{ fontSize: 11 }} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Pax detail list */}
                            {paxList.length > 0 && (
                                <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e8ecf1', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Yolcu Bilgileri (Opsiyonel)</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {paxList.map((p, idx) => {
                                            const typeLabel = p.type === 'child' ? 'Çocuk' : p.type === 'infant' ? 'Bebek' : 'Yetişkin';
                                            const typeColor = p.type === 'child' ? '#f59e0b' : p.type === 'infant' ? '#ec4899' : '#6366f1';
                                            return (
                                                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#f9fafb', borderRadius: 8, padding: '6px 8px', border: '1px solid #f0f0f0' }}>
                                                    <Tag color={typeColor} style={{ borderRadius: 10, fontSize: 10, minWidth: 64, textAlign: 'center', margin: 0, fontWeight: 700 }}>{idx + 1}. {typeLabel}</Tag>
                                                    <Input size="small" placeholder="Ad" value={p.firstName} onChange={e => handlePaxField(idx, 'firstName', e.target.value)} style={{ flex: 1 }} />
                                                    <Input size="small" placeholder="Soyad" value={p.lastName} onChange={e => handlePaxField(idx, 'lastName', e.target.value)} style={{ flex: 1 }} />
                                                    <Select size="small" placeholder="Uyruk" value={p.nationality || undefined} onChange={v => handlePaxField(idx, 'nationality', v as string)} style={{ width: 90 }} showSearch optionFilterProp="label" options={NATIONALITY_OPTIONS} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Pricing mode + breakdown */}
                            <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: `2px solid ${priceDiff > 0 ? '#fca5a5' : priceDiff < 0 ? '#86efac' : '#e8ecf1'}`, marginBottom: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        <DollarOutlined style={{ color: '#6366f1', marginRight: 6 }} />Fiyat Hesaplama
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isPerPerson ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 6, marginBottom: 12 }}>
                                    {isPerPerson && (
                                        <button onClick={() => setPricingMode('auto')}
                                            style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: pricingMode === 'auto' ? '2px solid #6366f1' : '1px solid #e5e7eb', background: pricingMode === 'auto' ? '#eef2ff' : '#fff', color: pricingMode === 'auto' ? '#4f46e5' : '#64748b' }}>
                                            ⚡ Otomatik
                                            <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>Kişi başına yansıt</div>
                                        </button>
                                    )}
                                    <button onClick={() => setPricingMode('keep')}
                                        style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: pricingMode === 'keep' ? '2px solid #6366f1' : '1px solid #e5e7eb', background: pricingMode === 'keep' ? '#eef2ff' : '#fff', color: pricingMode === 'keep' ? '#4f46e5' : '#64748b' }}>
                                        🔒 Sabit Tut
                                        <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>Fiyatı değiştirme</div>
                                    </button>
                                    <button onClick={() => setPricingMode('manual')}
                                        style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: pricingMode === 'manual' ? '2px solid #6366f1' : '1px solid #e5e7eb', background: pricingMode === 'manual' ? '#eef2ff' : '#fff', color: pricingMode === 'manual' ? '#4f46e5' : '#64748b' }}>
                                        ✏️ Elle Gir
                                        <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>Yeni toplam</div>
                                    </button>
                                </div>

                                {pricingMode === 'manual' && (
                                    <div style={{ marginBottom: 10 }}>
                                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Yeni Toplam Fiyat (₺)</Text>
                                        <InputNumber value={manualPrice} onChange={v => setManualPrice(Number(v) || 0)} style={{ width: '100%' }} min={0}
                                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                            parser={v => Number(v?.replace(/\./g, '') || 0) as any}
                                            addonAfter="₺" />
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', background: '#f9fafb', borderRadius: 10, padding: '10px 14px' }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Eski Fiyat</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>₺{originalPrice.toLocaleString('tr-TR')}</div>
                                    </div>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: priceDiff > 0 ? '#fee2e2' : priceDiff < 0 ? '#dcfce7' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: priceDiff > 0 ? '#dc2626' : priceDiff < 0 ? '#16a34a' : '#94a3b8', fontSize: 14, fontWeight: 800 }}>
                                        {priceDiff > 0 ? '↑' : priceDiff < 0 ? '↓' : '='}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Yeni Fiyat</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: priceDiff > 0 ? '#dc2626' : priceDiff < 0 ? '#16a34a' : '#1e293b' }}>₺{computedNewPrice.toLocaleString('tr-TR')}</div>
                                    </div>
                                </div>

                                {priceDiff !== 0 && (
                                    <>
                                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: priceDiff > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${priceDiff > 0 ? '#fecaca' : '#bbf7d0'}`, fontSize: 12, fontWeight: 700, color: priceDiff > 0 ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>{priceDiff > 0 ? '+' : ''}{priceDiff.toLocaleString('tr-TR')} ₺ {priceDiff > 0 ? 'Ekstra Ücret' : 'İndirim'}</span>
                                            {isPerPerson && pricingMode === 'auto' && (
                                                <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>
                                                    ({totalPax - originalPax > 0 ? '+' : ''}{totalPax - originalPax} kişi × ₺{perSeatPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })})
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ marginTop: 10 }}>
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tahsilat Yöntemi</Text>
                                            <Radio.Group value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}>
                                                <Radio.Button value="ADD_TO_BALANCE" style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>💳 Fiyata Yansıt</Radio.Button>
                                                <Radio.Button value="PAY_IN_VEHICLE" style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>🚗 Araçta Ödeme</Radio.Button>
                                            </Radio.Group>
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                                                {paymentMethod === 'ADD_TO_BALANCE' ? 'Yeni fiyat rezervasyonun toplam tutarı olarak kaydedilecek.' : 'Rezervasyon toplamı değişmeyecek; fark şoför tarafından araçta tahsil edilecek.'}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 22px', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
                            <button onClick={onClose} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Vazgeç
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                style={{ height: 44, padding: '0 24px', borderRadius: 10, border: 'none', background: priceDiff !== 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(99,102,241,0.35)', opacity: saving ? 0.7 : 1 }}>
                                {saving ? <Spin size="small" /> : <CheckCircleOutlined />}
                                {priceDiff !== 0 ? `Kaydet  ·  ₺${computedNewPrice.toLocaleString('tr-TR')}` : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Map picker modal for picking pickup or dropoff coordinates */}
            <MapPickerModal
                visible={mapModalOpen}
                onCancel={() => { setMapModalOpen(false); setMapTarget(null); }}
                onConfirm={handleMapConfirm}
                initialLocation={mapTarget === 'pickup' ? pickupCoords : dropoffCoords}
                initialAddress={mapTarget === 'pickup' ? pickupLocation : dropoffLocation}
                title={mapTarget === 'pickup' ? 'Alış Yerini Haritada Seç' : 'Bırakış Yerini Haritada Seç'}
                country="TUR"
            />
        </>
    );
};

export default ReservationEditModal;
