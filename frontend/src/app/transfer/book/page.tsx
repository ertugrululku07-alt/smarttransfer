'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Layout,
    Card,
    Row,
    Col,
    Typography,
    Form,
    Input,
    Button,
    Steps,
    Divider,
    Space,
    Radio,
    message,
    Spin,
    Result,
    Tag,
    Alert,
    Checkbox,
    Collapse,
    Select
} from 'antd';
import {
    CarOutlined,
    UserOutlined,
    CalendarOutlined,
    EnvironmentOutlined,
    CreditCardOutlined,
    RocketOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DashboardOutlined,
    ShoppingOutlined,
    PlusOutlined,
    MinusOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient, { getImageUrl } from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import BookingMap from '@/app/components/BookingMap';
import { useCurrency } from '@/app/context/CurrencyContext';
import { useBranding } from '@/app/context/BrandingContext';
import { useLanguage } from '@/app/context/LanguageContext';
import { countryList } from '@/lib/countryData';

const { Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

const TransferBookingContent: React.FC = () => {
    const { formatPrice, convertPrice, selectedCurrency } = useCurrency();
    const { branding } = useBranding();
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [form] = Form.useForm();

    // Billing State
    const [wantInvoice, setWantInvoice] = useState(false);
    const [invoiceType, setInvoiceType] = useState<'individual' | 'corporate'>('individual');
    const [notCitizen, setNotCitizen] = useState(false);


    const { Option } = Select;

    // Sort countries: Priority first, then alphabetical
    const priorityCodes = ['TR', 'DE', 'GB', 'RU', 'NL', 'UA', 'FR', 'US', 'SA', 'AE'];
    const sortedCountries = [
        ...countryList.filter(c => priorityCodes.includes(c.code)),
        ...countryList.filter(c => !priorityCodes.includes(c.code))
    ];

    const prefixSelector = (
        <Form.Item name="prefix" noStyle initialValue="+90">
            <Select
                style={{ width: 140 }}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                    // Search by label (Country Name) or Code (+90)
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                }
                popupMatchSelectWidth={300} // Wider dropdown to see names
            >
                {sortedCountries.map(c => (
                    <Option key={c.code} value={'+' + c.phone} label={c.label}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <img
                                src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`}
                                srcSet={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png 2x`}
                                width="20"
                                alt={c.code}
                                style={{ borderRadius: 2 }}
                            />
                            <span>{c.code} (+{c.phone})</span> {/* Show ISO code + Phone */}
                            <span style={{ color: '#999', fontSize: 12, marginLeft: 'auto' }}>{c.label}</span>
                        </div>
                    </Option>
                ))}
            </Select>
        </Form.Item>
    );

    const [loading, setLoading] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [bookingNumber, setBookingNumber] = useState<string | null>(null);

    // Payment methods availability
    const [paymentMethods, setPaymentMethods] = useState<{
        cashEnabled: boolean;
        bankTransferEnabled: boolean;
        onlineCreditCardEnabled: boolean;
        bankAccounts: Array<{ bankName: string; bankCode: string; accounts: Array<{ id: string; accountName: string; iban: string; currency: string; branchName: string }> }>;
    }>({ cashEnabled: true, bankTransferEnabled: false, onlineCreditCardEnabled: false, bankAccounts: [] });

    // Payment flow state
    const [paymentHtml, setPaymentHtml] = useState<string | null>(null);
    const [paymentFailed, setPaymentFailed] = useState(false);
    const [paymentError, setPaymentError] = useState('');
    const [pendingBookingNumber, setPendingBookingNumber] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<string>('cash');

    // Coupon
    const [couponCode, setCouponCode] = useState('');
    const [couponResult, setCouponResult] = useState<{ discount: number; name: string; code: string; newTotal: number; campaignId: string } | null>(null);
    const [couponLoading, setCouponLoading] = useState(false);
    const [couponError, setCouponError] = useState('');

    const validateCoupon = async () => {
        if (!couponCode.trim()) return;
        setCouponLoading(true);
        setCouponResult(null);
        setCouponError('');
        try {
            const res = await apiClient.post('/api/campaigns/validate', {
                code: couponCode.trim(),
                orderAmount: grandTotal || convertedVehiclePrice,
                vehicleType: vehicleDetails?.vehicleType || '',
            });
            if (res.data.success) setCouponResult(res.data.data);
        } catch (e: any) {
            setCouponError(e?.response?.data?.error || 'Ge\u00e7ersiz kupon kodu');
            setCouponResult(null);
        } finally {
            setCouponLoading(false);
        }
    };

    // Params
    const vehicleId = searchParams.get('vehicleId');
    const returnVehicleId = searchParams.get('returnVehicleId');
    const pickup = searchParams.get('pickup');
    const dropoff = searchParams.get('dropoff');
    const date = searchParams.get('date');
    const time = searchParams.get('time');
    const passengers = searchParams.get('passengers');
    const adultsParam = searchParams.get('adults');
    const childrenParam = searchParams.get('children');
    const babiesParam = searchParams.get('babies');
    const type = searchParams.get('type');
    const durationParam = searchParams.get('duration'); // Get duration from URL
    const shuttleMasterTime = searchParams.get('shuttleMasterTime');
    const returnShuttleMasterTime = searchParams.get('returnShuttleMasterTime');
    const returnDate = searchParams.get('returnDate');
    const returnTime = searchParams.get('returnTime');

    // Airport Transfer Detection: Check if pickup or dropoff contains airport keywords
    const AIRPORT_KEYWORDS = [
        'havaliman', 'havaalani', 'airport', 'hava liman', 'hava alan',
        'ayt', 'ist', 'saw', 'esb', 'adnan menderes', 'atatürk', 'sabiha',
        'gazipasa', 'gazipaşa', 'gazipasha', 'dalaman', 'bodrum', 'milas'
    ];
    const isAirportTransfer = AIRPORT_KEYWORDS.some(kw =>
        pickup?.toLowerCase().includes(kw) || dropoff?.toLowerCase().includes(kw)
    );

    // Note: In a real app, we should fetch vehicle details from API using vehicleId
    // For MVP, we'll calculate/display based on assumptions or params
    // Or re-fetch search to get the specific vehicle details
    const [vehicleDetails, setVehicleDetails] = useState<any>(null);
    const [returnVehicleDetails, setReturnVehicleDetails] = useState<any>(null);
    const [tripStats, setTripStats] = useState({ distance: 'Calculating...', duration: 'Calculating...' });
    const isRoundTrip = type === 'ROUND_TRIP' && returnVehicleId;

    const handleDistanceCalculated = (distance: string, duration: string) => {
        setTripStats({ distance, duration });
    };

    // Fetch available payment methods
    useEffect(() => {
        (async () => {
            try {
                const res = await apiClient.get('/api/tenant/payment-methods');
                if (res.data.success) {
                    setPaymentMethods(res.data.data);
                }
            } catch { /* silently fail — defaults are safe */ }
        })();
    }, []);

    useEffect(() => {
        if (!vehicleId) {
            router.push('/');
            return;
        }
        // Fetch outbound vehicle details
        fetchVehicleDetails();
        // Fetch return vehicle details if round trip
        if (returnVehicleId) {
            fetchReturnVehicleDetails();
        }
    }, [vehicleId, returnVehicleId]);

    // Auto-fill traveller info from logged-in customer profile
    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) return;
        (async () => {
            try {
                const res = await apiClient.get('/api/customer/me');
                if (!res.data?.success) return;
                const d = res.data.data || {};
                // Parse stored phone "+90 555 123 45 67" → prefix + number
                const raw = String(d.phone || '').trim();
                const savedCountry = (d.metadata?.phoneCountry || d.metadata?.nationality || '').toUpperCase();
                let prefix = '+90';
                let number = raw;
                const m = raw.match(/^\+(\d{1,4})\s*(.*)$/);
                if (m) {
                    prefix = '+' + m[1];
                    number = m[2].trim();
                } else if (savedCountry) {
                    const c = countryList.find((x: any) => x.code === savedCountry);
                    if (c) prefix = '+' + c.phone;
                }
                form.setFieldsValue({
                    fullName: d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || undefined,
                    email: d.email || undefined,
                    prefix,
                    phone: number || undefined,
                });
            } catch {
                // Not logged in or fetch failed — silently skip auto-fill
            }
        })();
    }, [form]);

    // Initialize passenger list form with correct types
    useEffect(() => {
        if (passengers) {
            const totalAdults = Number(adultsParam) || Number(passengers) || 1;
            const totalChildren = Number(childrenParam) || 0;
            const totalInfants = Number(babiesParam) || 0;
            const remainingAdults = Math.max(0, totalAdults - 1); // -1 for main contact
            const count = remainingAdults + totalChildren + totalInfants;
            const list = [];
            for (let i = 0; i < remainingAdults; i++) {
                list.push({ firstName: '', lastName: '', nationality: undefined, type: 'adult' });
            }
            for (let i = 0; i < totalChildren; i++) {
                list.push({ firstName: '', lastName: '', nationality: undefined, type: 'child' });
            }
            for (let i = 0; i < totalInfants; i++) {
                list.push({ firstName: '', lastName: '', nationality: undefined, type: 'infant' });
            }
            form.setFieldsValue({ passengerList: list });
        }
    }, [passengers, adultsParam, childrenParam, babiesParam, form]);

    const fetchVehicleDetails = async () => {
        try {
            const pickupDateTime = time ? `${date}T${time}:00.000` : date;
            const pickupLat = searchParams.get('pickupLat');
            const pickupLng = searchParams.get('pickupLng');
            
            const distance = sessionStorage.getItem('routeDistance');
            const encodedPolyline = sessionStorage.getItem('lastEncodedPolyline');
            
            const cleanDistance = distance ? parseFloat(String(distance).replace(/[^0-9.]/g, '')) : undefined;

            const dropoffLat = searchParams.get('dropoffLat');
            const dropoffLng = searchParams.get('dropoffLng');

            const payload = {
                pickup,
                dropoff,
                pickupDateTime,
                passengers: Number(passengers),
                transferType: 'ONE_WAY',
                pickupLat,
                pickupLng,
                dropoffLat,
                dropoffLng,
                distance: cleanDistance,
                encodedPolyline: encodedPolyline || undefined,
                shuttleMasterTime: shuttleMasterTime || undefined
            };

            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                const found = res.data.data.results.find((v: any) => String(v.id) === vehicleId);
                if (found) {
                    setVehicleDetails(found);
                } else {
                    message.error('Gidiş aracı artık müsait değil.');
                    router.back();
                }
            }
        } catch (err) {
            console.error('Vehicle details error:', err);
        }
    };

    const fetchReturnVehicleDetails = async () => {
        try {
            // For return trip, swap pickup and dropoff
            const returnPickupDateTime = returnTime ? `${returnDate}T${returnTime}:00.000` : returnDate;
            const pickupLat = searchParams.get('pickupLat');
            const pickupLng = searchParams.get('pickupLng');
            const dropoffLat = searchParams.get('dropoffLat');
            const dropoffLng = searchParams.get('dropoffLng');

            // Calculate route for reversed direction (needed for zone matching)
            let returnDistance: number | undefined;
            let returnPolyline: string | undefined;
            try {
                const { getRouteDetails } = await import('@/lib/routing');
                const route = await getRouteDetails(dropoff as string, pickup as string);
                if (route) {
                    returnDistance = route.distanceKm;
                    returnPolyline = route.encodedPolyline;
                }
            } catch (e) {
                console.error('Return route calculation failed:', e);
            }
            
            const payload = {
                pickup: dropoff, // Reverse direction
                dropoff: pickup,
                pickupDateTime: returnPickupDateTime,
                passengers: Number(passengers),
                transferType: 'ONE_WAY',
                distance: returnDistance,
                encodedPolyline: returnPolyline,
                pickupLat: dropoffLat,
                pickupLng: dropoffLng,
                dropoffLat: pickupLat,
                dropoffLng: pickupLng,
                shuttleMasterTime: returnShuttleMasterTime || undefined
            };

            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                const found = res.data.data.results.find((v: any) => String(v.id) === returnVehicleId);
                if (found) {
                    setReturnVehicleDetails(found);
                } else {
                    message.error('Dönüş aracı artık müsait değil.');
                }
            }
        } catch (err) {
            console.error('Return vehicle details error:', err);
        }
    };

    // Extra Services State
    const [extraServices, setExtraServices] = useState<any[]>([]);
    const [selectedServices, setSelectedServices] = useState<Map<string, number>>(new Map());
    const [servicesLoading, setServicesLoading] = useState(false);
    const [addServicesToReturn, setAddServicesToReturn] = useState(true);

    useEffect(() => {
        // Fetch Extra Services
        const fetchExtraServices = async () => {
            try {
                setServicesLoading(true);
                const res = await apiClient.get('/api/extra-services');
                if (res.data.success) {
                    setExtraServices(res.data.data);
                }
            } catch (error) {
                console.error('Error fetching extra services:', error);
            } finally {
                setServicesLoading(false);
            }
        };

        fetchExtraServices();
    }, []);

    const handleServiceChange = (serviceId: string, quantity: number, isPerPerson: boolean) => {
        const newSelected = new Map(selectedServices);
        if (quantity > 0) {
            newSelected.set(serviceId, quantity);
        } else {
            newSelected.delete(serviceId);
        }
        setSelectedServices(newSelected);
    };

    const calculateServicesTotal = () => {
        let total = 0;
        selectedServices.forEach((qty, id) => {
            const service = extraServices.find(s => s.id === id);
            if (service) {
                // Determine currency value (Mock conversion if needed, assuming EUR for services)
                // For simplicity, assuming 1 EUR = 35 TRY if booking is in TRY, or just adding raw value if currencies match
                // In a real app, we need proper currency conversion.
                // For MVP: Let's assume services are priced in EUR and we convert to booking currency (TRY/EUR)
                // If booking is in EUR, direct add. If TRY, x35.

                // Better approach for MVP: Display service price in its own currency, but add to total in booking currency
                // We'll stick to a simple conversion rate for now or just display separately.

                // Let's assume standard conversion for display
                const price = Number(service.price);
                total += price * qty;
            }
        });
        return total;
    };

    // Calculate Grand Total (includes return vehicle for round trips)
    const vehiclePrice = vehicleDetails ? Number(vehicleDetails.price) : 0;
    const convertedVehiclePrice = vehicleDetails ? convertPrice(vehiclePrice, vehicleDetails.currency, selectedCurrency) : 0;
    
    const returnVehiclePrice = returnVehicleDetails ? Number(returnVehicleDetails.price) : 0;
    const convertedReturnVehiclePrice = returnVehicleDetails ? convertPrice(returnVehiclePrice, returnVehicleDetails.currency, selectedCurrency) : 0;

    const getConvertedServicePrice = () => {
        let total = 0;
        selectedServices.forEach((qty, id) => {
            const service = extraServices.find(s => s.id === id);
            if (service) {
                let price = Number(service.price);
                const converted = convertPrice(price, service.currency, selectedCurrency);
                total += converted * qty;
            }
        });
        return total;
    };

    const serviceMultiplier = (isRoundTrip && addServicesToReturn) ? 2 : 1;
    const grandTotal = convertedVehiclePrice + convertedReturnVehiclePrice + (getConvertedServicePrice() * serviceMultiplier);


    const onFinish = async (values: any) => {
        if (!vehicleDetails) return;

        try {
            setLoading(true);

            const pickupDateTime = time ? `${date}T${time}:00.000` : date;
            const fullPhone = values.phone ? `${values.prefix || '+90'} ${values.phone}` : values.phone;

            // Prepare Extra Services Data
            const selectedServicesList = Array.from(selectedServices.entries()).map(([id, qty]) => {
                const service = extraServices.find(s => s.id === id);
                return {
                    id: service?.id,
                    name: service?.name,
                    price: Number(service?.price),
                    currency: service?.currency,
                    quantity: qty,
                    total: Number(service?.price) * qty
                };
            });

            // Calculate pickup time logic using pickupLeadHours
            const calculatePickupTime = (targetDate: string, targetTime: string, tripDropoff: string, vDetails: any) => {
                let finalPickupDateTime = targetTime ? dayjs(`${targetDate}T${targetTime}`).format() : targetDate;
                let flightTimeToSend = targetTime || undefined;

                const isAirportDrop = [
                    'AYT', 'IST', 'GZP', 'HAVALIMANI', 'AIRPORT', 'HAVAALANI'
                ].some(code => tripDropoff?.toUpperCase().includes(code));

                const leadHours =
                    vDetails?.zonePriceConfig?.pickupLeadHours
                        ? Number(vDetails.zonePriceConfig.pickupLeadHours)
                        : vDetails?.pickupLeadHours
                            ? Number(vDetails.pickupLeadHours)
                            : null;

                const isShuttle = !!vDetails?.isShuttle;

                if ((isShuttle || isAirportDrop) && targetTime && leadHours && leadHours > 0) {
                    const flightDateStr = `${targetDate}T${targetTime}`;
                    const flightDjs = dayjs(flightDateStr);
                    let leadMinutes = Math.round(leadHours * 60);

                    // If it's a shuttle, check the add/subtract setting from metadata
                    const isSubtractLeadTime = vDetails?.metadata?.subtractLeadTime !== false; // defaults to true

                    let recommendedPickup;

                    if (isSubtractLeadTime) {
                        if (durationParam) {
                            let durationMinutes = 0;
                            const hourMatch = durationParam.match(/(\d+)\s*(hour|saat)/i);
                            const minMatch = durationParam.match(/(\d+)\s*(min|dk)/i);
                            if (hourMatch) durationMinutes += parseInt(hourMatch[1]) * 60;
                            if (minMatch) durationMinutes += parseInt(minMatch[1]);
                            leadMinutes += durationMinutes;
                        }
                        recommendedPickup = flightDjs.subtract(leadMinutes, 'minute');
                    } else {
                        // Eğer checkbox isaretsizse, ucus saatine direkt ekliyoruz (Gidise falan degil, direk gelis e.g. delay)
                        recommendedPickup = flightDjs.add(leadMinutes, 'minute');
                    }
                    
                    const mins = recommendedPickup.minute();
                    const remainder = mins % 5;
                    recommendedPickup = recommendedPickup.subtract(remainder, 'minute');

                    finalPickupDateTime = recommendedPickup.format();
                }
                
                return { finalPickupDateTime, flightTimeToSend };
            };

            const outboundTimes = calculatePickupTime(date as string, time as string, dropoff as string, vehicleDetails);
            const finalPickupDateTime = outboundTimes.finalPickupDateTime;
            let flightTimeToSend = outboundTimes.flightTimeToSend;

            // Map form payment method values to backend constants
            const paymentMethodMap: Record<string, string> = {
                'cash': 'PAY_IN_VEHICLE',
                'credit_card': 'CREDIT_CARD',
                'bank': 'BANK_TRANSFER',
            };
            const resolvedPaymentMethod = paymentMethodMap[values.paymentMethod] || 'PAY_IN_VEHICLE';

            // Build outbound payload (include coordinates for polygon-based zone detection)
            const outboundPayload = {
                vehicleType: vehicleDetails.vehicleType,
                pickup,
                dropoff,
                pickupLat: searchParams.get('pickupLat') || undefined,
                pickupLng: searchParams.get('pickupLng') || undefined,
                dropoffLat: searchParams.get('dropoffLat') || undefined,
                dropoffLng: searchParams.get('dropoffLng') || undefined,
                pickupDateTime: finalPickupDateTime,
                passengers: Number(passengers),
                adults: Number(adultsParam) || Number(passengers) || 1,
                children: Number(childrenParam) || 0,
                infants: Number(babiesParam) || 0,
                price: convertedVehiclePrice, // Only outbound price
                currency: selectedCurrency,
                paymentMethod: resolvedPaymentMethod,
                customerInfo: {
                    fullName: values.fullName,
                    email: values.email,
                    phone: fullPhone
                },
                flightNumber: values.flightNumber,
                flightTime: flightTimeToSend,
                notes: values.notes || undefined,
                passengerDetails: [
                    {
                        firstName: values.fullName.split(' ')[0],
                        lastName: values.fullName.split(' ').slice(1).join(' ') || '',
                        nationality: countryList.find(c => '+' + c.phone === (values.prefix || '+90'))?.code || 'TR',
                        type: 'adult'
                    },
                    ...(values.passengerList || []).map((p: any) => ({
                        ...p,
                        name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
                        type: p.type || 'adult'
                    }))
                ],
                extraServices: selectedServicesList,
                billingDetails: wantInvoice ? {
                    type: invoiceType,
                    fullName: invoiceType === 'individual' ? values.billingFullName : undefined,
                    tcNo: invoiceType === 'individual' && !notCitizen ? values.tcNo : undefined,
                    isCitizen: !notCitizen,
                    companyName: invoiceType === 'corporate' ? values.companyName : undefined,
                    taxOffice: invoiceType === 'corporate' ? values.taxOffice : undefined,
                    taxNo: invoiceType === 'corporate' ? values.taxNo : undefined,
                    address: values.billingAddress
                } : undefined,
                // Round trip info for linking
                isRoundTrip: isRoundTrip,
                tripLeg: 'OUTBOUND',
                couponCode: couponResult?.code || undefined,
            };

            // Build return payload if round trip
            const returnTimes = isRoundTrip && returnVehicleDetails ? calculatePickupTime(returnDate as string, returnTime as string, pickup as string, returnVehicleDetails) : null;

            const returnPayload = isRoundTrip && returnVehicleDetails ? {
                vehicleType: returnVehicleDetails.vehicleType,
                pickup: dropoff, // Reverse direction
                dropoff: pickup,
                // Reverse coordinates for accurate region detection on return leg
                pickupLat: searchParams.get('dropoffLat') || undefined,
                pickupLng: searchParams.get('dropoffLng') || undefined,
                dropoffLat: searchParams.get('pickupLat') || undefined,
                dropoffLng: searchParams.get('pickupLng') || undefined,
                pickupDateTime: returnTimes?.finalPickupDateTime || returnDate,
                passengers: Number(passengers),
                adults: Number(adultsParam) || Number(passengers) || 1,
                children: Number(childrenParam) || 0,
                infants: Number(babiesParam) || 0,
                price: convertedReturnVehiclePrice, // Only return price
                currency: selectedCurrency,
                paymentMethod: resolvedPaymentMethod,
                customerInfo: {
                    fullName: values.fullName,
                    email: values.email,
                    phone: fullPhone
                },
                flightNumber: values.returnFlightNumber || values.flightNumber,
                flightTime: returnTimes?.flightTimeToSend,
                notes: values.notes,
                passengerDetails: [
                    {
                        firstName: values.fullName.split(' ')[0],
                        lastName: values.fullName.split(' ').slice(1).join(' ') || '',
                        nationality: countryList.find(c => '+' + c.phone === (values.prefix || '+90'))?.code || 'TR',
                        type: 'adult'
                    },
                    ...(values.passengerList || []).map((p: any) => ({
                        ...p,
                        name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
                        type: p.type || 'adult'
                    }))
                ],
                extraServices: addServicesToReturn ? selectedServicesList : [],
                billingDetails: undefined, // Billing handled by outbound
                isRoundTrip: true,
                tripLeg: 'RETURN',
                linkedBookingNumber: null // Will be set by backend after outbound booking
            } : null;

            const payload = {
                outbound: outboundPayload,
                return: returnPayload,
                totalPrice: grandTotal
            };

            const res = await apiClient.post('/api/transfer/book', payload);

            if (res.data.success) {
                const bNumber = res.data.data.bookingNumber;
                setBookingNumber(bNumber);

                if (resolvedPaymentMethod === 'CREDIT_CARD') {
                    // Initiate online payment
                    setPendingBookingNumber(bNumber);
                    try {
                        const payRes = await apiClient.post('/api/payment/init', {
                            amount: couponResult ? grandTotal - couponResult.discount : grandTotal,
                            currency: selectedCurrency,
                            orderId: bNumber,
                            user: {
                                email: values.email,
                                name: values.fullName,
                                phone: `${values.prefix || '+90'} ${values.phone}`,
                                address: 'Transfer Rezervasyonu'
                            },
                            basket: [{ name: 'Transfer Hizmeti', price: couponResult ? grandTotal - couponResult.discount : grandTotal, category: 'Transfer' }]
                        });

                        if (payRes.data.success && payRes.data.data.html) {
                            if (payRes.data.data.redirectForm) {
                                // NestPay 3D: full page redirect
                                const w = window.open('', '_self');
                                if (w) w.document.write(payRes.data.data.html);
                            } else {
                                // PayTR/iyzico: iframe
                                setPaymentHtml(payRes.data.data.html);
                            }
                        } else {
                            setPaymentFailed(true);
                            setPaymentError(payRes.data.error || t('booking.payment') + ' başlatılamadı');
                        }
                    } catch (payErr: any) {
                        setPaymentFailed(true);
                        setPaymentError(payErr.response?.data?.error || t('booking.payment') + ' sistemi hatası');
                    }
                } else {
                    // cash or bank_transfer — show success directly
                    setPaymentMethod(resolvedPaymentMethod);
                    setBookingSuccess(true);
                    message.success('Rezervasyonunuz başarıyla oluşturuldu!');
                }
                window.scrollTo(0, 0);
            }
        } catch (err: any) {
            console.error('Booking error:', err);
            message.error(err.response?.data?.error || 'Rezervasyon oluşturulurken bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    // Retry payment for failed credit card payments
    const retryPayment = async () => {
        if (!pendingBookingNumber) return;
        setLoading(true);
        setPaymentFailed(false);
        setPaymentError('');
        try {
            const values = form.getFieldsValue();
            const payRes = await apiClient.post('/api/payment/init', {
                amount: couponResult ? grandTotal - couponResult.discount : grandTotal,
                currency: selectedCurrency,
                orderId: pendingBookingNumber,
                user: {
                    email: values.email,
                    name: values.fullName,
                    phone: `${values.prefix || '+90'} ${values.phone}`,
                    address: 'Transfer Rezervasyonu'
                },
                basket: [{ name: 'Transfer Hizmeti', price: couponResult ? grandTotal - couponResult.discount : grandTotal, category: 'Transfer' }]
            });

            if (payRes.data.success && payRes.data.data.html) {
                if (payRes.data.data.redirectForm) {
                    const w = window.open('', '_self');
                    if (w) w.document.write(payRes.data.data.html);
                } else {
                    setPaymentHtml(payRes.data.data.html);
                }
            } else {
                setPaymentFailed(true);
                setPaymentError(payRes.data.error || t('booking.payment') + ' başlatılamadı');
            }
        } catch (err: any) {
            setPaymentFailed(true);
            setPaymentError(err.response?.data?.error || t('booking.payment') + ' sistemi hatası');
        } finally {
            setLoading(false);
        }
    };


    // ── Payment iframe view (PayTR/iyzico) ──
    if (paymentHtml && !paymentFailed) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
                <TopBar />
                <Content style={{ padding: '24px', paddingTop: 96, maxWidth: 800, margin: '0 auto' }}>
                    <Card style={{ borderRadius: 12 }}>
                        <Title level={4} style={{ marginBottom: 16, textAlign: 'center' }}>
                            <CreditCardOutlined style={{ marginRight: 8 }} />
                            Online {t('booking.payment')}
                        </Title>
                        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
                            Rezervasyon No: {bookingNumber}
                        </Text>
                        <div dangerouslySetInnerHTML={{ __html: paymentHtml }} />
                    </Card>
                </Content>
            </Layout>
        );
    }

    // ── Payment failed view with retry ──
    if (paymentFailed) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
                <TopBar />
                <Content style={{ padding: '48px 24px', paddingTop: 96, maxWidth: 600, margin: '0 auto' }}>
                    <Result
                        status="error"
                        title={t('booking.payment') + ' Alınamadı'}
                        subTitle={paymentError || 'Kredi kartınızdan çekim yapılamadı. ' + t('common.tryAgain')}
                        extra={[
                            <Button type="primary" key="retry" size="large" loading={loading} onClick={retryPayment}
                                style={{ background: 'var(--brand-primary)', border: 'none' }}>
                                Tekrar Dene
                            </Button>,
                            <Button key="home" size="large" onClick={() => router.push('/')}>
                                Anasayfaya Dön
                            </Button>,
                        ]}
                    >
                        <div style={{ padding: '16px 0' }}>
                            <Alert
                                type="warning"
                                showIcon
                                message="Rezervasyonunuz oluşturuldu ancak ödeme alınamadı."
                                description={
                                    <div>
                                        <p style={{ margin: '8px 0' }}>Rezervasyon No: <strong>{pendingBookingNumber}</strong></p>
                                        <p style={{ margin: '8px 0', color: '#64748b' }}>Olası nedenler:</p>
                                        <ul style={{ paddingLeft: 20, color: '#64748b' }}>
                                            <li>Yetersiz bakiye veya limit</li>
                                            <li>Hatalı SMS (3D Secure) şifresi</li>
                                            <li>Kartın internet alışverişine kapalı olması</li>
                                        </ul>
                                    </div>
                                }
                            />
                        </div>
                    </Result>
                </Content>
            </Layout>
        );
    }

    if (bookingSuccess) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
                <TopBar />
                <Content style={{ padding: '48px 24px', paddingTop: 96, maxWidth: 800, margin: '0 auto' }}>
                    <Result
                        status="success"
                        title="Rezervasyonunuz Başarıyla Alındı!"
                        subTitle={`${t('booking.bookingNumber')}: ${bookingNumber}. Detaylar e-posta adresinize gönderilmiştir.`}
                        extra={[
                            <Button type="primary" key="home" onClick={() => router.push('/')}>
                                Anasayfaya Dön
                            </Button>,
                            <Button key="account" onClick={() => router.push('/login')}>
                                Hesabıma Git
                            </Button>,
                        ]}
                    >
                        {/* Pickup Time Calculation — both private transfer (zonePriceConfig) and shuttle (direct pickupLeadHours) */}
                        {(() => {
                            const isAirportDropoff = [
                                'AYT', 'IST', 'GZP', 'HAVALIMANI', 'AIRPORT', 'HAVAALANI'
                            ].some(code => dropoff?.toUpperCase().includes(code));

                            // Support both private (zonePriceConfig) and shuttle (direct field)
                            const leadHours =
                                vehicleDetails?.zonePriceConfig?.pickupLeadHours
                                    ? Number(vehicleDetails.zonePriceConfig.pickupLeadHours)
                                    : vehicleDetails?.pickupLeadHours
                                        ? Number(vehicleDetails.pickupLeadHours)
                                        : null;

                            const isShuttle = !!vehicleDetails?.isShuttle;

                            // For shuttles: always show if pickupLeadHours set (dropoff may or may not be airport)
                            // For private: only show for airport dropoffs
                            const shouldShow = leadHours && leadHours > 0 && time && (
                                isShuttle || isAirportDropoff
                            );

                            if (shouldShow) {
                                try {
                                    const flightDate = dayjs(`${date}T${time}`);
                                    let leadMinutes = Math.round(leadHours! * 60);
                                    let routeDurationText = '';
                                    let durationMinutesTotal = 0;

                                    const isSubtractLeadTime = vehicleDetails?.metadata?.subtractLeadTime !== false;

                                    let recommendedPickup;

                                    if (isSubtractLeadTime) {
                                        if (durationParam) {
                                            const hourMatch = durationParam.match(/(\d+)\s*(hour|saat)/i);
                                            const minMatch = durationParam.match(/(\d+)\s*(min|dk)/i);
                                            if (hourMatch) durationMinutesTotal += parseInt(hourMatch[1]) * 60;
                                            if (minMatch) durationMinutesTotal += parseInt(minMatch[1]);
                                            leadMinutes += durationMinutesTotal;
                                            routeDurationText = durationParam;
                                        }

                                        recommendedPickup = flightDate.subtract(leadMinutes, 'minute');
                                    } else {
                                        recommendedPickup = flightDate.add(leadMinutes, 'minute');
                                    }

                                    const mins = recommendedPickup.minute();
                                    const remainder = mins % 5;
                                    recommendedPickup = recommendedPickup.subtract(remainder, 'minute');

                                    const leadHoursInt = Math.floor(leadHours!);
                                    const leadHoursLabel = leadHoursInt === leadHours
                                        ? `${leadHoursInt} saat`
                                        : `${leadHours} saat`;

                                    return (
                                        <div style={{ marginTop: 24, padding: '16px 20px', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 10 }}>
                                            <Title level={5} style={{ marginTop: 0, color: '#0050b3', marginBottom: 8 }}>
                                                <ClockCircleOutlined /> Alınış Saati
                                            </Title>
                                            <Text style={{ lineHeight: 2 }}>
                                                {!isSubtractLeadTime ? (
                                                    <>
                                                        Uçuş saatiniz <strong>{time}</strong> olarak belirlenmiştir.<br />
                                                        Terminal çıkışınız zaman alacağı için.<br />
                                                        Aracımızın sizi alacağı {isShuttle ? '(Shuttle)' : '(Transfer)'} saati:{' '}
                                                        <strong style={{ fontSize: 16, color: '#0050b3' }}>{recommendedPickup.format('HH:mm')}</strong> olarak atanmıştır.
                                                    </>
                                                ) : (
                                                    <>
                                                        {isShuttle
                                                            ? <>Shuttle kalkış saatiniz <strong>{shuttleMasterTime || time}</strong> olarak belirlenmiştir.<br /></>
                                                            : <>Uçuş saatiniz <strong>{time}</strong> olarak kabul edilmiştir.<br /></>
                                                        }
                                                        Uçuştan <strong>2 saat</strong> önce havalimanında olmanız gerektiği için
                                                        {routeDurationText ? <>, <strong>{routeDurationText}</strong> {t('booking.journeyDuration')}</> : ''}
                                                        <br />
                                                        Aracımızın sizi alacağı {isShuttle ? '(Shuttle)' : '(Transfer)'} saati:{' '}
                                                        <strong style={{ fontSize: 16, color: '#0050b3' }}>{recommendedPickup.format('HH:mm')}</strong>
                                                    </>
                                                )}
                                            </Text>
                                        </div>
                                    );
                                } catch (e) {
                                    console.error('Pickup time calculation error:', e);
                                }
                            }
                            return null;
                        })()}

                        {/* Bank Transfer Details */}
                        {paymentMethod === 'BANK_TRANSFER' && paymentMethods.bankAccounts.length > 0 && (
                            <div style={{ marginTop: 24, padding: '20px 24px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 10, textAlign: 'left' }}>
                                <Title level={5} style={{ marginTop: 0, color: '#d48806', marginBottom: 12 }}>
                                    <CreditCardOutlined style={{ marginRight: 8 }} />
                                    {t('booking.bankTransfer')} Bilgileri
                                </Title>
                                <Text style={{ display: 'block', marginBottom: 12, color: '#8c6d1f' }}>
                                    Aşağıdaki hesap bilgilerinden birine tutarı gönderebilirsiniz. Açıklama kısmına <strong>{bookingNumber}</strong> yazmayı unutmayın.
                                </Text>
                                {paymentMethods.bankAccounts.map((bank, bi) => (
                                    <div key={bi} style={{ marginBottom: 12 }}>
                                        {bank.accounts.map((acc, ai) => (
                                            <div key={ai} style={{
                                                background: '#fff', borderRadius: 8, padding: '12px 16px',
                                                border: '1px solid #f0e6c0', marginBottom: 8
                                            }}>
                                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                                                    {bank.bankName} — {acc.accountName}
                                                    <Tag color="gold" style={{ marginLeft: 8 }}>{acc.currency}</Tag>
                                                </div>
                                                <div style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: 1, color: '#1a1a1a' }}>
                                                    IBAN: {acc.iban}
                                                </div>
                                                {acc.branchName && (
                                                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                                                        Şube: {acc.branchName}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Result>
                </Content>
            </Layout>
        );
    }

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
                <div style={{ position: 'absolute', top: -40, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(59,130,246,0.08)', filter: 'blur(60px)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -40, left: -60, width: 250, height: 250, borderRadius: '50%', background: 'rgba(99,102,241,0.07)', filter: 'blur(50px)', pointerEvents: 'none' }} />
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 28px' }}>
                    <Row gutter={[24, 16]} align="middle">
                        <Col xs={24} md={18}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>{pickup}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)' }}>
                                    <ArrowRightOutlined style={{ color: '#60a5fa', fontSize: 12 }} />
                                </div>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>{dropoff}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 14px' }}>
                                    <CalendarOutlined style={{ color: '#93c5fd', fontSize: 12 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }} suppressHydrationWarning>{dayjs(date).format('DD MMMM YYYY')} {time}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 14px' }}>
                                    <UserOutlined style={{ color: '#93c5fd', fontSize: 12 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{passengers + ' ' + t('booking.passenger')}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '5px 14px' }}>
                                    <CheckCircleOutlined style={{ color: '#4ade80', fontSize: 12 }} />
                                    <Text style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }}>{t('booking.vehicleSelected')}</Text>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} md={6} style={{ textAlign: 'right' }}>
                            <Steps
                                current={1}
                                direction="horizontal"
                                size="small"
                                style={{ filter: 'invert(1) brightness(2)' }}
                                items={[
                                    { title: <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Arama</span> },
                                    { title: <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>Rezervasyon</span> },
                                    { title: <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{t('booking.payment')}</span> },
                                ]}
                            />
                        </Col>
                    </Row>
                </div>
            </div>

            <Content style={{ maxWidth: 1200, margin: '24px auto', padding: '0 24px', width: '100%' }}>

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    initialValues={{ paymentMethod: 'cash' }}
                >
                    <Row gutter={24} style={{ marginTop: 24 }}>
                        {/* Booking Form */}
                        <Col xs={24} lg={16}>
                            <Card title={t('booking.passengerInfo')} style={{ borderRadius: 8, marginBottom: 24 }}>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="fullName"
                                            label={t('booking.fullName')}
                                            rules={[{ required: true, message: 'Lütfen ad soyad giriniz' }]}
                                        >
                                            <Input size="large" prefix={<UserOutlined />} placeholder="Adınız Soyadınız" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="phone"
                                            label={t('booking.phone') + ' Numarası'}
                                            rules={[{ required: true, message: 'Lütfen telefon numarası giriniz' }]}
                                        >
                                            <Space.Compact style={{ width: '100%' }}>
                                                {prefixSelector}
                                                <Form.Item
                                                    name="phone"
                                                    noStyle
                                                    rules={[{ required: true, message: 'Lütfen telefon numarası giriniz' }]}
                                                >
                                                    <Input size="large" placeholder="555 123 45 67" style={{ width: 'calc(100% - 140px)' }} />
                                                </Form.Item>
                                            </Space.Compact>
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Form.Item
                                    name="email"
                                    label={t('booking.email') + ' ' + t('booking.address') + 'i'}
                                    rules={[
                                        { required: true, message: 'Lütfen e-posta adresi giriniz' },
                                        { type: 'email', message: t('common.validEmail') + 'iz' }
                                    ]}
                                >
                                    <Input size="large" placeholder="ornek@email.com" />
                                </Form.Item>

                                {isAirportTransfer && (
                                    <Alert
                                        type="info"
                                        showIcon
                                        icon={<RocketOutlined />}
                                        message={t('booking.airportTransferDetected')}
                                        description={t('booking.pickupTimeAutoCalculated')}
                                        style={{ marginBottom: 16 }}
                                    />
                                )}
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="flightNumber"
                                            label={t('booking.flightNumber') + ' (Opsiyonel)'}
                                            tooltip="Havalimanı karşılaması için gereklidir"
                                        >
                                            <Input size="large" prefix={<RocketOutlined />} placeholder="TK1234" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="notes"
                                            label={t('booking.notes') + 'ınız'}
                                        >
                                            <Input size="large" placeholder="Varsa ek istekleriniz..." />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                {Number(passengers) > 1 && (
                                    <>
                                        <Divider />

                                        <Title level={5}>{t('booking.otherPassengers')}</Title>
                                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                                            {t('booking.otherPassengersInfo', { count: String(Number(passengers) - 1) })}
                                        </Text>

                                        <Form.List name="passengerList">
                                            {(fields) => (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                    {fields.map((field, index) => {
                                                        const pType = form.getFieldValue(['passengerList', field.name, 'type']);
                                                        const typeLabels: Record<string, { label: string; color: string }> = {
                                                            adult: { label: 'Yetişkin', color: '#10b981' },
                                                            child: { label: 'Çocuk (3-12 yaş)', color: '#f59e0b' },
                                                            infant: { label: 'Bebek (0-2 yaş)', color: '#ef4444' },
                                                        };
                                                        const tInfo = typeLabels[pType] || typeLabels.adult;
                                                        return (
                                                        <Card
                                                            key={field.key}
                                                            size="small"
                                                            title={
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span>{t('booking.passengerNum', { num: String(index + 2) })}</span>
                                                                    <span style={{
                                                                        fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10,
                                                                        background: `${tInfo.color}18`, color: tInfo.color, border: `1px solid ${tInfo.color}40`
                                                                    }}>{tInfo.label}</span>
                                                                </div>
                                                            }
                                                            type="inner"
                                                            styles={{ body: { padding: '16px 16px 0 16px' } }}
                                                        >
                                                            <Form.Item name={[field.name, 'type']} hidden><Input /></Form.Item>
                                                            <Row gutter={16}>
                                                                <Col xs={24} md={8}>
                                                                    <Form.Item
                                                                        {...field}
                                                                        name={[field.name, 'firstName']}
                                                                        label="Ad"
                                                                        rules={[{ required: true, message: 'Ad zorunludur' }]}
                                                                    >
                                                                        <Input placeholder="Ad" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={24} md={8}>
                                                                    <Form.Item
                                                                        {...field}
                                                                        name={[field.name, 'lastName']}
                                                                        label="Soyad"
                                                                        rules={[{ required: true, message: 'Soyad zorunludur' }]}
                                                                    >
                                                                        <Input placeholder="Soyad" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={24} md={8}>
                                                                    <Form.Item
                                                                        {...field}
                                                                        name={[field.name, 'nationality']}
                                                                        label="Uyruk"
                                                                        rules={[{ required: true, message: 'Uyruk zorunludur' }]}
                                                                    >
                                                                        <Select
                                                                            showSearch
                                                                            placeholder="Uyruk Seçiniz"
                                                                            optionFilterProp="children"
                                                                            filterOption={(input, option) =>
                                                                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                                                            }
                                                                            options={[
                                                                                // Custom ordered list: Turkey first
                                                                                ...countryList.filter(c => c.code === 'TR').map(c => ({ value: c.code, label: c.label })),
                                                                                ...countryList.filter(c => c.code !== 'TR').map(c => ({ value: c.code, label: c.label }))
                                                                            ]}
                                                                        />
                                                                    </Form.Item>
                                                                </Col>
                                                            </Row>
                                                        </Card>
                                                    );})}
                                                </div>
                                            )}
                                        </Form.List>
                                    </>
                                )}

                                <Divider />

                                <Title level={5}>{t('booking.billingInfo')}</Title>
                                <div style={{ marginBottom: 16 }}>
                                    <Checkbox
                                        onChange={(e) => setWantInvoice(e.target.checked)}
                                        checked={wantInvoice}
                                        style={{ fontSize: 16 }}
                                    >
                                        {t('booking.requestInvoice')}
                                    </Checkbox>
                                </div>

                                {wantInvoice && (
                                    <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                                        <Form.Item name="invoiceType" initialValue="individual" style={{ marginBottom: 16 }}>
                                            <Radio.Group onChange={(e) => setInvoiceType(e.target.value)} value={invoiceType}>
                                                <Radio.Button value="individual">{t('booking.individual')}</Radio.Button>
                                                <Radio.Button value="corporate">{t('booking.corporate')}</Radio.Button>
                                            </Radio.Group>
                                        </Form.Item>

                                        {invoiceType === 'individual' ? (
                                            <>
                                                <Row gutter={16}>
                                                    <Col xs={24} md={12}>
                                                        <Form.Item
                                                            name="billingFullName"
                                                            label={t('booking.fullName')}
                                                            rules={[{ required: true, message: 'Fatura için ' + t('booking.fullName') + ' zorunludur' }]}
                                                        >
                                                            <Input placeholder="Adınız Soyadınız" />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={24} md={12}>
                                                        {/* TC No field - only show if citizen */}
                                                        {!notCitizen && (
                                                            <Form.Item
                                                                name="tcNo"
                                                                label={t('booking.tckn')}
                                                                rules={[
                                                                    { required: true, message: 'TC Kimlik numarası zorunludur' },
                                                                    { len: 11, message: '11 haneli olmalıdır' }
                                                                ]}
                                                            >
                                                                <Input placeholder={'11 Haneli ' + t('booking.tckn')} maxLength={11} />
                                                            </Form.Item>
                                                        )}
                                                        <div style={{ marginTop: -8, marginBottom: 24 }}>
                                                            <Checkbox onChange={(e) => setNotCitizen(e.target.checked)} checked={notCitizen}>
                                                                {t('booking.notTCCitizen')}
                                                            </Checkbox>
                                                        </div>
                                                    </Col>
                                                </Row>
                                            </>
                                        ) : (
                                            <>
                                                <Form.Item
                                                    name="companyName"
                                                    label="Firma Adı"
                                                    rules={[{ required: true, message: 'Firma adı zorunludur' }]}
                                                >
                                                    <Input placeholder="Şirket Ünvanı" />
                                                </Form.Item>
                                                <Row gutter={16}>
                                                    <Col xs={24} md={12}>
                                                        <Form.Item
                                                            name="taxOffice"
                                                            label={t('booking.taxOffice')}
                                                            rules={[{ required: true, message: 'Vergi dairesi zorunludur' }]}
                                                        >
                                                            <Input placeholder={t('booking.taxOffice')} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={24} md={12}>
                                                        <Form.Item
                                                            name="taxNo"
                                                            label="Vergi Numarası"
                                                            rules={[{ required: true, message: 'Vergi numarası zorunludur' }]}
                                                        >
                                                            <Input placeholder={t('booking.taxNo')} />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                            </>
                                        )}

                                        <Form.Item
                                            name="billingAddress"
                                            label={'Fatura ' + t('booking.address') + 'i'}
                                            rules={[{ required: true, message: t('booking.address') + ' zorunludur' }]}
                                        >
                                            <Input.TextArea rows={2} placeholder="Tam adres" />
                                        </Form.Item>
                                    </div>
                                )}

                                <Divider />

                                {/* Extra Services Expandable Section */}
                                <div style={{ marginBottom: 24 }}>
                                    <Collapse
                                        ghost
                                        defaultActiveKey={['1']}
                                        expandIconPlacement="end"
                                        items={[
                                            {
                                                key: '1',
                                                label: <span style={{ fontWeight: 600, fontSize: 16 }}>{t('booking.extraServicesOptional')}</span>,
                                                children: (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                        {servicesLoading ? (
                                                            <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                                                        ) : extraServices.length === 0 ? (
                                                            <Text type="secondary">{t('booking.noExtraServices')}</Text>
                                                        ) : (
                                                            extraServices
                                                                .filter(service => {
                                                                    // Check if selected vehicle is a shuttle
                                                                    const isShuttle = vehicleDetails?.isShuttle === true;

                                                                    if (isShuttle && service.excludeFromShuttle) {
                                                                        return false;
                                                                    }
                                                                    return true;
                                                                })
                                                                .map(service => {
                                                                    const qty = selectedServices.get(service.id) || 0;
                                                                    return (
                                                                        <div key={service.id} style={{
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            padding: '12px',
                                                                            border: '1px solid #f0f0f0',
                                                                            borderRadius: 8,
                                                                            background: qty > 0 ? '#f6ffed' : '#fff',
                                                                            borderColor: qty > 0 ? '#b7eb8f' : '#f0f0f0'
                                                                        }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                                {service.image ? (
                                                                                    <img src={getImageUrl(service.image)} alt={service.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                                                                                ) : (
                                                                                    <div style={{ width: 48, height: 48, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                        <ShoppingOutlined style={{ fontSize: 20, color: '#999' }} />
                                                                                    </div>
                                                                                )}
                                                                                <div>
                                                                                    <Text strong>{service.name}</Text>
                                                                                    <div style={{ fontSize: 12, color: '#666' }}>
                                                                                        {formatPrice(Number(service.price), service.currency)}
                                                                                        {service.isPerPerson ? ' / kişi başı' : ' / adet'}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                <Button
                                                                                    size="small"
                                                                                    icon={<MinusOutlined />}
                                                                                    disabled={qty === 0}
                                                                                    onClick={() => handleServiceChange(service.id, qty - 1, service.isPerPerson)}
                                                                                />
                                                                                <span style={{ width: 24, textAlign: 'center', fontWeight: 600 }}>{qty}</span>
                                                                                <Button
                                                                                    size="small"
                                                                                    icon={<PlusOutlined />}
                                                                                    onClick={() => handleServiceChange(service.id, qty + 1, service.isPerPerson)}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                        )}
                                                        {isRoundTrip && selectedServices.size > 0 && (
                                                            <div style={{
                                                                marginTop: 12,
                                                                padding: '10px 12px',
                                                                background: '#e6f7ff',
                                                                border: '1px solid #91d5ff',
                                                                borderRadius: 8,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 8
                                                            }}>
                                                                <Checkbox
                                                                    checked={addServicesToReturn}
                                                                    onChange={(e) => setAddServicesToReturn(e.target.checked)}
                                                                />
                                                                <Text style={{ fontSize: 13 }}>Dönüş transferi için de aynı hizmetleri ekle</Text>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                        ]}
                                    />
                                </div>

                                <Divider />

                                <Title level={5}>{t('booking.couponCode')}</Title>
                                <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                                    <Input
                                        value={couponCode}
                                        onChange={e => { setCouponCode(e.target.value); setCouponResult(null); setCouponError(''); }}
                                        placeholder="SUMMER25"
                                        style={{ textTransform: 'uppercase' }}
                                        allowClear
                                    />
                                    <Button type="primary" loading={couponLoading} onClick={validateCoupon}
                                        style={{ background: 'var(--brand-accent)', borderColor: 'var(--brand-accent)' }}>{t('booking.apply')}</Button>
                                </Space.Compact>
                                {couponResult && (
                                    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                                        <Text style={{ color: '#059669', fontWeight: 600 }}>
                                            \u2714 {couponResult.name} \u2014 {formatPrice(couponResult.discount, selectedCurrency)} indirim
                                        </Text>
                                    </div>
                                )}
                                {couponError && (
                                    <div style={{ marginBottom: 16 }}><Text type="danger" style={{ fontSize: 13 }}>{couponError}</Text></div>
                                )}

                                <Title level={5}>{t('booking.payment') + ' Yöntemi'}</Title>
                                <Form.Item name="paymentMethod">
                                    <Radio.Group>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <Radio value="cash">
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Text>{t('booking.payInVehicle')}</Text>
                                                    <Text type="secondary">{t('booking.payInVehicleNote')}</Text>
                                                </div>
                                            </Radio>
                                            <Radio value="bank" disabled={!paymentMethods.bankTransferEnabled}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Text>{t('booking.bankTransfer')}</Text>
                                                    {!paymentMethods.bankTransferEnabled && <Tag style={{ marginLeft: 8 }}>{t('booking.comingSoon')}</Tag>}
                                                </div>
                                            </Radio>
                                            <Radio value="credit_card" disabled={!paymentMethods.onlineCreditCardEnabled}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Text>{t('booking.onlineCard')}</Text>
                                                    {paymentMethods.onlineCreditCardEnabled
                                                        ? <Tag color="green" style={{ marginLeft: 8 }}>3D Secure</Tag>
                                                        : <Tag style={{ marginLeft: 8 }}>{t('booking.comingSoon')}</Tag>
                                                    }
                                                </div>
                                            </Radio>
                                        </div>
                                    </Radio.Group>
                                </Form.Item>

                            </Card>
                    </Col>

                    {/* Trip Summary Info */}
                    <Col xs={24} lg={8}>
                        <Card
                            title={t('booking.bookingSummary')}
                            style={{ borderRadius: 8, position: 'sticky', top: 24, overflow: 'hidden' }}
                            styles={{ body: { padding: 0 } }}
                        >
                            {/* Map Section */}
                            {pickup && dropoff && (
                                <BookingMap
                                    pickup={pickup}
                                    dropoff={dropoff}
                                    onDistanceCalculated={handleDistanceCalculated}
                                />
                            )}

                            <div style={{ padding: 24 }}>
                                {!vehicleDetails ? (
                                    <div style={{ textAlign: 'center', padding: 20 }}>
                                        <Spin />
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ marginBottom: 16, borderLeft: '2px solid #1890ff', paddingLeft: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                                                <EnvironmentOutlined style={{ color: '#52c41a', marginRight: 8, fontSize: 16 }} />
                                                <Text strong style={{ fontSize: 16 }}>{pickup}</Text>
                                            </div>
                                            <div style={{ height: 20, borderLeft: '1px dashed #ccc', marginLeft: 7, margin: '4px 0' }}></div>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <EnvironmentOutlined style={{ color: '#f5576c', marginRight: 8, fontSize: 16 }} />
                                                <Text strong style={{ fontSize: 16 }}>{dropoff}</Text>
                                            </div>
                                        </div>

                                        {/* Trip Stats */}
                                        <div style={{ background: '#f0f5ff', padding: '12px 16px', borderRadius: 8, marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <DashboardOutlined style={{ color: '#1890ff' }} />
                                                <div>
                                                    <div style={{ fontSize: 10, color: '#666' }}>{t('booking.distance')}</div>
                                                    <div style={{ fontWeight: 600, color: '#1890ff' }}>
                                                        {tripStats.distance === 'Calculating...' ? '35 km' : tripStats.distance}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ width: 1, background: '#d6e4ff' }}></div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <ClockCircleOutlined style={{ color: '#1890ff' }} />
                                                <div>
                                                    <div style={{ fontSize: 10, color: '#666' }}>{t('booking.duration')}</div>
                                                    <div style={{ fontWeight: 600, color: '#1890ff' }}>
                                                        {tripStats.duration === 'Calculating...' ? '45 dk' : tripStats.duration}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Vehicle Info - Outbound */}
                                        {vehicleDetails && (
                                            <div style={{ marginBottom: 16 }}>
                                                <div style={{ background: '#f0f5ff', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                                                    <Text strong style={{ fontSize: 13, color: '#1677ff' }}>{'🚗 ' + t('booking.outbound')}</Text>
                                                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                                                        {vehicleDetails.image && (
                                                            <img
                                                                src={getImageUrl(vehicleDetails.image)}
                                                                alt={vehicleDetails.vehicleType}
                                                                style={{ width: '100%', borderRadius: 8, marginBottom: 8, objectFit: 'cover', maxHeight: 120 }}
                                                            />
                                                        )}
                                                        <Text strong style={{ fontSize: 14 }}>{vehicleDetails.vehicleType}</Text>
                                                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                                            {date} {time}
                                                        </div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#52c41a', marginTop: 4 }}>
                                                            {formatPrice(convertedVehiclePrice, selectedCurrency)}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Return Vehicle - Only for round trips */}
                                                {isRoundTrip && returnVehicleDetails && (
                                                    <div style={{ background: '#f6ffed', padding: 12, borderRadius: 8 }}>
                                                        <Text strong style={{ fontSize: 13, color: '#52c41a' }}>🚙 DÖNÜŞ</Text>
                                                        <div style={{ marginTop: 8, textAlign: 'center' }}>
                                                            {returnVehicleDetails.image && (
                                                                <img
                                                                    src={getImageUrl(returnVehicleDetails.image)}
                                                                    alt={returnVehicleDetails.vehicleType}
                                                                    style={{ width: '100%', borderRadius: 8, marginBottom: 8, objectFit: 'cover', maxHeight: 120 }}
                                                                />
                                                            )}
                                                            <Text strong style={{ fontSize: 14 }}>{returnVehicleDetails.vehicleType}</Text>
                                                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                                                {returnDate} {returnTime}
                                                            </div>
                                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#52c41a', marginTop: 4 }}>
                                                                {formatPrice(convertedReturnVehiclePrice, selectedCurrency)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {isRoundTrip && !returnVehicleDetails && (
                                                    <div style={{ background: '#fff7e6', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                                                        <Spin size="small" />
                                                        <Text style={{ fontSize: 12, marginLeft: 8 }}>Dönüş aracı yükleniyor...</Text>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <Divider style={{ margin: '16px 0' }} />
                                        <div style={{ marginTop: 8 }}>
                                            <Text strong style={{ fontSize: 12 }}>{t('booking.extraServices')}</Text>
                                            {Array.from(selectedServices.entries()).map(([id, qty]) => {
                                                const s = extraServices.find(srv => srv.id === id);
                                                if (!s) return null;
                                                const multiplier = (isRoundTrip && addServicesToReturn) ? 2 : 1;
                                                const label = (isRoundTrip && addServicesToReturn)
                                                    ? `${s.name} x ${qty} (Gidiş+Dönüş)`
                                                    : `${s.name} x ${qty}`;
                                                return (
                                                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginTop: 4 }}>
                                                        <span>{label}</span>
                                                        <span>{formatPrice(Number(s.price) * qty * multiplier, s.currency)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                <Divider style={{ margin: '12px 0' }} />

                                {/* Coupon Discount */}
                                {couponResult && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ color: '#059669', fontSize: 13 }}>Kupon ({couponResult.code})</Text>
                                        <Text style={{ color: '#059669', fontWeight: 700 }}>-{formatPrice(couponResult.discount, selectedCurrency)}</Text>
                                    </div>
                                )}

                                {/* Grand Total */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Title level={5} style={{ margin: 0 }}>{t('booking.totalAmount')}</Title>
                                    <Title level={3} style={{ margin: 0, color: '#52c41a' }}>
                                        {formatPrice(couponResult ? grandTotal - couponResult.discount : grandTotal, selectedCurrency)}
                                    </Title>
                                </div>

                                <Form.Item
                                    name="acceptTerms"
                                    valuePropName="checked"
                                    rules={[
                                        {
                                            validator: (_, value) =>
                                                value ? Promise.resolve() : Promise.reject(new Error('Devam etmek için sözleşmeleri onaylamanız gerekmektedir')),
                                        },
                                    ]}
                                    style={{ marginTop: 24, marginBottom: 0 }}
                                >
                                    <Checkbox style={{ fontSize: 13, color: '#666' }}>
                                        <a href="/sayfa/kvkk-aydinlatma-metni" target="_blank" onClick={(e) => e.stopPropagation()} style={{ color: '#1890ff', textDecoration: 'underline' }}>KVKK</a>, ön bilgilendirme ve <a href="/sayfa/kullanim-kosullari" target="_blank" onClick={(e) => e.stopPropagation()} style={{ color: '#1890ff', textDecoration: 'underline' }}>uzak mesafeli satış sözleşmesini</a> okudum ve onaylıyorum.
                                    </Checkbox>
                                </Form.Item>

                                <Button
                                    type="primary"
                                    size="large"
                                    block
                                    onClick={() => form.submit()}
                                    loading={loading}
                                    style={{ marginTop: 16, height: 48, fontSize: 16 }}
                                >
                                    {t('booking.submit')}
                                </Button>
                            </div>
                        </Card>
                    </Col>
                    </Row>
                </Form>
            </Content>

            <Footer style={{ textAlign: 'center' }}>{branding.companyName} ©{new Date().getFullYear()}</Footer>
        </Layout >
    );
};

const TransferBookingPage: React.FC = () => {
    return (
        <Suspense fallback={<div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 16 }}>Yükleniyor...</div></div>}>
            <TransferBookingContent />
        </Suspense>
    );
};

export default TransferBookingPage;
