'use client';

import React, { useState, useEffect } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import { useCurrency } from '@/app/context/CurrencyContext';
import { Card, Button, Form, Input, Typography, message, DatePicker, InputNumber, Row, Col, Spin, Alert, Tag, Space, Divider, Radio, Select, TimePicker, Checkbox, Collapse, Modal, Tooltip } from 'antd';
import { SearchOutlined, ArrowRightOutlined, ArrowLeftOutlined, CarOutlined, UserOutlined, SafetyCertificateOutlined, WifiOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../../AgencyLayout';
import AgencyGuard from '../../AgencyGuard';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';
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
    const { currencies: ctxCurrencies } = useCurrency();
    // Use defCurrencies primarily, fall back to CurrencyContext rates
    const activeCurrencies = defCurrencies.length > 0 ? defCurrencies : ctxCurrencies.map(c => ({ ...c, id: c.code }));
    const getCurrencySymbol = (code: string) => {
        const c = activeCurrencies.find(cur => cur.code === code);
        return c?.symbol || code + ' ';
    };

    // Top level state
    const [currentStep, setCurrentStep] = useState<'search' | 'results' | 'return-results' | 'details' | 'success'>('search');
    const [loading, setLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState<any>(null);

    // Step 1: Search State
    const [pickup, setPickup] = useState('');
    const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [dropoff, setDropoff] = useState('');
    const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [date, setDate] = useState<Dayjs | null>(null);
    const [pickupTimeValue, setPickupTimeValue] = useState<Dayjs | null>(dayjs().hour(12).minute(0));
    const [flightTimeValue, setFlightTimeValue] = useState<Dayjs | null>(null);
    const [returnDate, setReturnDate] = useState<Dayjs | null>(null);
    const [returnTimeValue, setReturnTimeValue] = useState<Dayjs | null>(dayjs().hour(12).minute(0));
    const [returnFlightTimeValue, setReturnFlightTimeValue] = useState<Dayjs | null>(null);
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
    const [returnSelectedVehicle, setReturnSelectedVehicle] = useState<TransferResult | null>(null);
    const [returnResults, setReturnResults] = useState<TransferResult[]>([]);
    const [returnSearchLoading, setReturnSearchLoading] = useState(false);

    // Step 3: Extra Services & Form
    const [form] = Form.useForm();
    const [extraServicesList, setExtraServicesList] = useState<any[]>([]);
    const [loadingExtraServices, setLoadingExtraServices] = useState(false);
    const [computedB2BCost, setComputedB2BCost] = useState(0);
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
            let pickupDateTime = date.hour(pickupTimeValue ? pickupTimeValue.hour() : 12).minute(pickupTimeValue ? pickupTimeValue.minute() : 0).second(0).format();
            if (isAirportTransfer && flightTimeValue) {
                // For airport pickup (airport -> city), default pickup time = flight time.
                // For airport dropoff (city -> airport), we will compute a better pickup time after we have route duration.
                pickupDateTime = date.hour(flightTimeValue.hour()).minute(flightTimeValue.minute()).second(0).format();
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
                                pickupDateTime = recommendedPickup.format();
                                setPickupTimeValue(recommendedPickup);
                            }
                        } else if (isAirportPickup && flightTimeValue) {
                            // Airport pickup: keep pickupHour/minute aligned to flight time for consistency
                            setPickupTimeValue(flightTimeValue);
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
                returnDateTime: tripType === 'ROUND_TRIP' && returnDate ? returnDate.hour(returnTimeValue ? returnTimeValue.hour() : 12).minute(returnTimeValue ? returnTimeValue.minute() : 0).second(0).format() : undefined,
                passengers: totalPassengers || 1,
                transferType: tripType,
                distance,
                encodedPolyline,
                pickupLat: pickupLocation?.lat,
                pickupLng: pickupLocation?.lng,
                dropoffLat: dropoffLocation?.lat,
                dropoffLng: dropoffLocation?.lng
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

    // Get agency markup rate (e.g. 20 means 20%)
    const agencyMarkupRate = Number(agencyInfo?.markup || 0);

    // Calculate the marked-up price for an extra service in the booking's currency
    const getExtraServiceDisplayPrice = (service: any) => {
        const rawPrice = Number(service.price || 0);
        return Math.round(rawPrice * (1 + agencyMarkupRate / 100) * 100) / 100;
    };

    // Convert amount from one currency to another using tenant exchange rates
    // Rates are in TRY terms (e.g. EUR rate=50 means 1 EUR = 50 TRY)
    const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string) => {
        if (fromCurrency === toCurrency) return amount;
        const fromRate = activeCurrencies.find(c => c.code === fromCurrency)?.rate || 1;
        const toRate = activeCurrencies.find(c => c.code === toCurrency)?.rate || 1;
        // Convert: amount in fromCurrency → TRY → toCurrency
        const inTRY = amount * fromRate;
        return Math.round((inTRY / toRate) * 100) / 100;
    };

    // Get the effective price addition for an extra service converted to booking currency
    const getExtraServiceEffectivePrice = (service: any) => {
        const markedUpPrice = getExtraServiceDisplayPrice(service);
        const serviceCurrency = service.currency || 'TRY';
        const bookingCurrency = selectedVehicle?.currency || 'TRY';
        return convertCurrency(markedUpPrice, serviceCurrency, bookingCurrency);
    };

    // Get the B2B (raw, no markup) price of an extra service in booking currency
    const getExtraServiceB2BPrice = (service: any) => {
        const rawPrice = Number(service.price || 0);
        const serviceCurrency = service.currency || 'TRY';
        const bookingCurrency = selectedVehicle?.currency || 'TRY';
        return convertCurrency(rawPrice, serviceCurrency, bookingCurrency);
    };

    // Calculate total B2B cost dynamically based on current passengers and extras
    const calcB2BCost = (paxCount?: number, extrasOverride?: any[]) => {
        const originalPax = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
        const pax = paxCount || originalPax;
        const extras = extrasOverride || extraServicesList;

        // Vehicle cost
        let vehicleCost = selectedVehicle?.basePrice || selectedVehicle?.price || 0;
        if (selectedVehicle?.isShuttle) {
            const perPerson = vehicleCost / (originalPax || 1);
            vehicleCost = Math.round(perPerson * pax * 100) / 100;
        }

        // Return vehicle cost
        if (returnSelectedVehicle) {
            let returnCost = returnSelectedVehicle.basePrice || returnSelectedVehicle.price || 0;
            if (returnSelectedVehicle.isShuttle) {
                const perPerson = returnCost / (originalPax || 1);
                returnCost = Math.round(perPerson * pax * 100) / 100;
            }
            vehicleCost += returnCost;
        }

        // Extras B2B cost (raw price, no markup)
        let extrasCost = 0;
        extras.forEach((s: any) => {
            if (s.quantity > 0) {
                extrasCost += getExtraServiceB2BPrice(s) * s.quantity;
            }
        });

        return Math.round((vehicleCost + extrasCost) * 100) / 100;
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

    const handleSelectReturnVehicle = (vehicle: TransferResult) => {
        setReturnSelectedVehicle(vehicle);
        proceedToDetails(selectedVehicle!, vehicle);
    };

    const searchReturnVehicles = async () => {
        try {
            setReturnSearchLoading(true);
            const totalPassengers = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
            let returnPickupDateTime = returnDate!.hour(returnTimeValue ? returnTimeValue.hour() : 12).minute(returnTimeValue ? returnTimeValue.minute() : 0).second(0).format();
            if (isAirportTransfer && returnFlightTimeValue) {
                returnPickupDateTime = returnDate!.hour(returnFlightTimeValue.hour()).minute(returnFlightTimeValue.minute()).second(0).format();
            }
            const payload = {
                pickup: dropoff,
                dropoff: pickup,
                pickupDateTime: returnPickupDateTime,
                passengers: totalPassengers || 1,
                transferType: 'ONE_WAY',
                pickupLat: dropoffLocation?.lat,
                pickupLng: dropoffLocation?.lng,
                dropoffLat: pickupLocation?.lat,
                dropoffLng: pickupLocation?.lng
            };
            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                setReturnResults(res.data.data.results);
            }
        } catch (err) {
            console.error('Return search error:', err);
            setReturnResults([]);
        } finally {
            setReturnSearchLoading(false);
        }
    };

    const handleSelectVehicle = (vehicle: TransferResult) => {
        setSelectedVehicle(vehicle);
        if (tripType === 'ROUND_TRIP' && returnDate) {
            setCurrentStep('return-results');
            searchReturnVehicles();
            return;
        }
        proceedToDetails(vehicle, null);
    };

    const proceedToDetails = (outboundVehicle: TransferResult, returnVehicle: TransferResult | null) => {
        setCurrentStep('details');

        // Fetch services in background when vehicle selected
        fetchExtraServices();

        const fullDate = date?.hour(pickupTimeValue?.hour() ?? 12).minute(pickupTimeValue?.minute() ?? 0).second(0);
        const totalPax = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;

        // Form'u yolcu listesi ile başlat (1. yolcu ana formda)
        const otherPax = Math.max(0, totalPax - 1);
        const initialPassengers = Array.from({ length: otherPax }, () => ({
            firstName: '', lastName: '', nationality: ''
        }));

        // Calculate total price including return if applicable
        const outboundPrice = outboundVehicle.price;
        const returnPrice = returnVehicle ? returnVehicle.price : 0;
        const totalPrice = outboundPrice + returnPrice;

        // Initialize B2B cost (no extras yet at this point)
        const initialB2B = (outboundVehicle.basePrice || outboundVehicle.price || 0) + (returnVehicle ? (returnVehicle.basePrice || returnVehicle.price || 0) : 0);
        setComputedB2BCost(initialB2B);

        form.setFieldsValue({
            startDate: fullDate,
            passengers: totalPax,
            amount: totalPrice,
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
                const b2bCost = computedB2BCost;
                if (agencyBalance < b2bCost) {
                    message.error(`Yetersiz bakiye. Bu işlem için minimum ${b2bCost} ${selectedVehicle.currency} bakiye gerekmektedir.`);
                    setLoading(false);
                    return;
                }
            }

            // B2B payload
            // Construct the correct startDate (pickup time)
            let startDateWithTime = date
                ? date.hour(pickupTimeValue?.hour() ?? 12).minute(pickupTimeValue?.minute() ?? 0).second(0).millisecond(0)
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

            // Use the dynamically computed B2B cost (includes passenger-adjusted shuttle pricing + extras)
            const totalProviderPrice = computedB2BCost;

            // ── Round-trip price split ──
            // Outbound = outbound vehicle B2B + extras (extras only on outbound).
            // Return  = return vehicle B2B (no extras).
            const totalCustomerPrice = Number(values.amount) || totalProviderPrice;
            const isRound = tripType === 'ROUND_TRIP' && !!returnSelectedVehicle;
            let outboundProvider = totalProviderPrice;
            let outboundAmount = totalCustomerPrice;
            let returnProvider = 0;
            let returnAmount = 0;

            if (isRound) {
                const origPax = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
                const curPax = Number(values.passengers) || origPax;

                // Recompute per-leg B2B (passenger-adjusted for shuttles)
                let outboundVehicleCost = selectedVehicle?.basePrice || selectedVehicle?.price || 0;
                if (selectedVehicle?.isShuttle) {
                    const perPerson = outboundVehicleCost / (origPax || 1);
                    outboundVehicleCost = Math.round(perPerson * curPax * 100) / 100;
                }
                let returnVehicleCost = returnSelectedVehicle!.basePrice || returnSelectedVehicle!.price || 0;
                if (returnSelectedVehicle!.isShuttle) {
                    const perPerson = returnVehicleCost / (origPax || 1);
                    returnVehicleCost = Math.round(perPerson * curPax * 100) / 100;
                }

                let extrasCost = 0;
                extraServicesList.forEach((s: any) => {
                    if (s.quantity > 0) extrasCost += getExtraServiceB2BPrice(s) * s.quantity;
                });

                outboundProvider = Math.round((outboundVehicleCost + extrasCost) * 100) / 100;
                returnProvider = Math.round(returnVehicleCost * 100) / 100;

                // Split customer price proportionally to provider cost (preserve markup)
                const totalProv = outboundProvider + returnProvider;
                if (totalProv > 0) {
                    outboundAmount = Math.round(totalCustomerPrice * (outboundProvider / totalProv) * 100) / 100;
                    returnAmount = Math.round((totalCustomerPrice - outboundAmount) * 100) / 100;
                } else {
                    outboundAmount = totalCustomerPrice;
                    returnAmount = 0;
                }
            }

            // Compute return startDate honoring airport buffer logic (reversed direction)
            const computeReturnStartDate = () => {
                if (!isRound || !returnDate) return null;
                const baseTime = returnTimeValue || returnFlightTimeValue || dayjs().hour(12).minute(0);
                let returnStart = returnDate
                    .hour(baseTime.hour())
                    .minute(baseTime.minute())
                    .second(0)
                    .millisecond(0);

                // For return: pickup = original dropoff, dropoff = original pickup.
                // Airport-dropoff for the return leg ↔ original pickup is airport.
                const returnFlightTime = returnFlightTimeValue ? returnFlightTimeValue.format('HH:mm') : undefined;
                if (returnFlightTime) {
                    if (isAirportPickup) {
                        // Return is going TO the airport → subtract buffer
                        const durationMinutes = getDurationMinutes(routeStats?.duration ?? returnSelectedVehicle?.estimatedDuration);
                        if (durationMinutes) {
                            const isShuttle = !!returnSelectedVehicle?.isShuttle;
                            const bufferHours = isShuttle ? 3 : 2;
                            const totalBuffer = durationMinutes + (bufferHours * 60) + 30;
                            const flightDate = dayjs(`${returnDate.format('YYYY-MM-DD')}T${returnFlightTime}`);
                            returnStart = floorToNearest5(flightDate.subtract(totalBuffer, 'minute')).second(0).millisecond(0);
                        }
                    } else if (isAirportDropoff) {
                        // Return is coming FROM the airport → pickup = landing time
                        returnStart = dayjs(`${returnDate.format('YYYY-MM-DD')}T${returnFlightTime}`).second(0).millisecond(0);
                    }
                }
                return returnStart;
            };
            const returnStartDate = computeReturnStartDate();

            const payload = {
                ...values,
                type: 'TRANSFER',
                pickup,
                dropoff,
                pickupLat: pickupLocation?.lat,
                pickupLng: pickupLocation?.lng,
                dropoffLat: dropoffLocation?.lat,
                dropoffLng: dropoffLocation?.lng,
                startDate: startDateWithTime ? startDateWithTime.toISOString() : undefined,
                vehicleId: selectedVehicle.id,
                vehicleType: selectedVehicle.vehicleType,
                providerPrice: outboundProvider,
                currency: selectedVehicle.currency,
                amount: outboundAmount,
                passengers: values.passengers || (passengerCounts.adults + passengerCounts.children + passengerCounts.babies),
                passengersList: values.passengersList,
                contactEmail: values.contactEmail || 'guest@example.com',
                metadata: {
                    pickup,
                    dropoff,
                    pickupLat: pickupLocation?.lat,
                    pickupLng: pickupLocation?.lng,
                    dropoffLat: dropoffLocation?.lat,
                    dropoffLng: dropoffLocation?.lng,
                    vehicleType: selectedVehicle.vehicleType,
                    contactNationality: values.contactNationality,
                    flightNumber: values.flightNumber,
                    flightTime: flightTimeToSend,
                    returnFlightTime: returnFlightTimeValue ? returnFlightTimeValue.format('HH:mm') : undefined,
                    customerNotes: values.customerNotes || (flightTimeToSend ? `Uçuş Saati: ${flightTimeToSend}` : undefined),
                    wantsInvoice: values.wantsInvoice,
                    agencyNotes: values.agencyNotes,
                    paymentMethod: values.paymentMethod,
                    extraServices: extraServicesList.filter((s: any) => s.quantity > 0),
                    isRoundTrip: tripType === 'ROUND_TRIP',
                    returnVehicle: returnSelectedVehicle ? {
                        vehicleType: returnSelectedVehicle.vehicleType,
                        price: returnSelectedVehicle.price,
                        basePrice: returnSelectedVehicle.basePrice,
                        currency: returnSelectedVehicle.currency
                    } : undefined,
                    returnDate: returnDate ? returnDate.hour(returnTimeValue?.hour() ?? 12).minute(returnTimeValue?.minute() ?? 0).second(0).toISOString() : undefined
                },
                ...(isRound && returnSelectedVehicle && returnStartDate ? {
                    returnLeg: {
                        startDate: returnStartDate.toISOString(),
                        vehicleId: returnSelectedVehicle.id,
                        vehicleType: returnSelectedVehicle.vehicleType,
                        providerPrice: returnProvider,
                        amount: returnAmount,
                        // Reversed direction
                        pickup: dropoff,
                        dropoff: pickup,
                        pickupLat: dropoffLocation?.lat,
                        pickupLng: dropoffLocation?.lng,
                        dropoffLat: pickupLocation?.lat,
                        dropoffLng: pickupLocation?.lng,
                        flightNumber: values.returnFlightNumber || undefined,
                        flightTime: returnFlightTimeValue ? returnFlightTimeValue.format('HH:mm') : undefined,
                    }
                } : {})
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
                        <DynamicLocationSearchInput
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
                        <DynamicLocationSearchInput
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
                            disabledDate={(current) => current && current < dayjs().startOf('day')}
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        {!isAirportTransfer ? (
                            <>
                                <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>🕐 Saat</label>
                                <TimePicker
                                    size="large"
                                    style={{ width: '100%' }}
                                    format="HH:mm"
                                    minuteStep={5}
                                    value={pickupTimeValue}
                                    onChange={(v) => setPickupTimeValue(v)}
                                    placeholder="Saat seçin"
                                    needConfirm={false}
                                    showNow={false}
                                />
                            </>
                        ) : (
                            <>
                                <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>✈️ Uçuş Saati</label>
                                <TimePicker
                                    size="large"
                                    style={{ width: '100%' }}
                                    format="HH:mm"
                                    minuteStep={5}
                                    value={flightTimeValue}
                                    onChange={(v) => setFlightTimeValue(v)}
                                    placeholder="Örn: 14:30"
                                    needConfirm={false}
                                    showNow={false}
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
                
                {tripType === 'ROUND_TRIP' && (
                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                        <Col xs={24} md={6}>
                            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>📅 Dönüş Tarihi</label>
                            <DatePicker
                                size="large"
                                style={{ width: '100%' }}
                                format="DD.MM.YYYY"
                                placeholder="Dönüş tarihi seçin"
                                value={returnDate}
                                onChange={setReturnDate}
                                disabledDate={(current) => current && (!date || current < date.startOf('day'))}
                            />
                        </Col>
                        <Col xs={24} md={6}>
                            {!isAirportTransfer ? (
                                <>
                                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>🕐 Dönüş Saati</label>
                                    <TimePicker
                                        size="large"
                                        style={{ width: '100%' }}
                                        format="HH:mm"
                                        minuteStep={5}
                                        value={returnTimeValue}
                                        onChange={(v) => setReturnTimeValue(v)}
                                        placeholder="Saat seçin"
                                        needConfirm={false}
                                        showNow={false}
                                    />
                                </>
                            ) : (
                                <>
                                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>✈️ Dönüş Uçuş Saati</label>
                                    <TimePicker
                                        size="large"
                                        style={{ width: '100%' }}
                                        format="HH:mm"
                                        minuteStep={5}
                                        value={returnFlightTimeValue}
                                        onChange={(v) => setReturnFlightTimeValue(v)}
                                        placeholder="Örn: 14:30"
                                        needConfirm={false}
                                        showNow={false}
                                    />
                                </>
                            )}
                        </Col>
                    </Row>
                )}

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
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
            {/* Dark Route Header */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f1f3d 100%)',
                borderRadius: 20, padding: '20px 28px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
            }}>
                <button onClick={() => setCurrentStep('search')} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: 13,
                    flexShrink: 0
                }}>
                    ← Yeni Arama
                </button>

                {/* Route Timeline */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, minWidth: 280 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 200 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>NEREDEN</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickup}</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 90 }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
                            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(99,102,241,0.3), rgba(99,102,241,1))' }} />
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✈</div>
                            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(99,102,241,1), rgba(99,102,241,0.3))' }} />
                        </div>
                        {routeStats && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.08)', padding: '2px 9px', borderRadius: 50 }}>
                                    📍 {typeof routeStats.distance === 'number' ? `${routeStats.distance.toFixed(0)} km` : `${routeStats.distance} km`}
                                </span>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.08)', padding: '2px 9px', borderRadius: 50 }}>
                                    ⏱ {routeStats.duration} dk
                                </span>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 200 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>NEREYE</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoff}</div>
                    </div>
                </div>

                {/* Meta Chips */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Tarih</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{date?.format('DD MMM YYYY')}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Saat</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{(flightTimeValue || pickupTimeValue)?.format('HH:mm')}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Yolcular</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{passengerCounts.adults + passengerCounts.children + passengerCounts.babies} Kişi</div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, #6366f1, #818cf8)', borderRadius: 10, padding: '7px 14px', textAlign: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Bulunan</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{results.length} Araç</div>
                    </div>
                </div>
            </div>
            {/* Vehicle List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: '#6366f1', fontWeight: 600, fontSize: 15 }}>Araçlar aranıyor...</div>
                    <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 13 }}>En uygun seçenekler listeleniyor</div>
                </div>
            ) : searchError ? (
                <div style={{ background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', border: '1px solid #fee2e2' }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
                    <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 18 }}>Arama Hatası</div>
                    <div style={{ color: '#64748b', marginTop: 8 }}>{searchError}</div>
                </div>
            ) : results.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>🚗</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>Uygun Araç Bulunamadı</div>
                    <div style={{ color: '#64748b', marginTop: 8 }}>Arama kriterlerinizi değiştirerek tekrar deneyin</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {results.map((result, idx) => (
                        <div key={result.id} style={{
                            background: '#fff', borderRadius: 18, overflow: 'hidden',
                            border: '1px solid #f1f5f9', display: 'flex',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.05)', transition: 'all 0.22s ease'
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(99,102,241,0.14)';
                            (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(99,102,241,0.25)';
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
                                background: result.isShuttle
                                    ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                                    : 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative', overflow: 'hidden'
                            }}>
                                {result.image
                                    ? <img src={result.image} alt={result.vehicleType} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                                    : <CarOutlined style={{ fontSize: 54, color: result.isShuttle ? '#059669' : '#7c3aed', opacity: 0.25 }} />}
                                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <span style={{
                                        background: result.isShuttle ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                                        color: '#fff', padding: '3px 11px', borderRadius: 50,
                                        fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
                                    }}>{result.vehicleType}</span>
                                    {idx === 0 && <span style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: '#fff', padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700 }}>⭐ Önerilen</span>}
                                </div>
                            </div>

                            {/* Middle Info */}
                            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>{result.vehicleType}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                        Sağlayıcı: <span style={{ color: '#475569', fontWeight: 600 }}>{result.vendor}</span>
                                        {result.isShuttle && <span style={{ marginLeft: 8, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '1px 8px', borderRadius: 50, fontSize: 11 }}>Paylaşımlı</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151' }}>
                                        👤 {result.capacity} Yolcu
                                    </span>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151' }}>
                                        🧳 {result.luggage} Bavul
                                    </span>
                                    {routeStats && !result.isShuttle && (
                                        <span style={{ display:'flex', alignItems:'center', gap:5, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#2563eb' }}>
                                            ⏱ ~{routeStats.duration} dk
                                        </span>
                                    )}
                                    {result.features?.includes('WiFi') && (
                                        <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#16a34a' }}>
                                            📶 Ücretsiz WiFi
                                        </span>
                                    )}
                                    {result.isShuttle && result.departureTimes && result.departureTimes.length > 0 && (
                                        <span style={{ display:'flex', alignItems:'center', gap:5, background:'#fefce8', border:'1px solid #fde68a', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#92400e' }}>
                                            🕐 {result.departureTimes.slice(0,3).join(', ')}{result.departureTimes.length > 3 && ` +${result.departureTimes.length-3}`}
                                        </span>
                                    )}
                                </div>
                                {routeStats && (
                                    <div style={{ fontSize: 12, color: '#94a3b8', display:'flex', alignItems:'center', gap:6 }}>
                                        <span>📍 {typeof routeStats.distance === 'number' ? `${routeStats.distance.toFixed(0)} km` : `${routeStats.distance} km`} mesafe</span>
                                        <span style={{ color:'#e2e8f0' }}>•</span>
                                        <span>Kapıdan kapıya özel transfer</span>
                                    </div>
                                )}
                            </div>

                            {/* Price Panel */}
                            <div style={{
                                width: 195, flexShrink: 0,
                                background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'center', alignItems: 'center',
                                padding: '20px 16px', gap: 2
                            }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:1, marginBottom: 2 }}>Önerilen Satış</div>
                                <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                                    {getCurrencySymbol(result.currency)}{result.price.toLocaleString('tr-TR')}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>{result.currency}</div>
                                <button onClick={() => handleSelectVehicle(result)} style={{
                                    width: '100%', padding: '10px 0',
                                    background: 'linear-gradient(135deg,#6366f1,#818cf8)',
                                    color: '#fff', border: 'none', borderRadius: 11,
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(99,102,241,0.45)', transition: 'all 0.18s'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                                    Seç ve İlerle →
                                </button>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                                    B2B: {getCurrencySymbol(result.currency)}{(result.basePrice || result.price).toLocaleString('tr-TR')}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderReturnResultsStep = () => (
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f1f3d 100%)',
                borderRadius: 20, padding: '20px 28px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
            }}>
                <button onClick={() => setCurrentStep('results')} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: 13
                }}>
                    ← Gidiş Araçları
                </button>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, minWidth: 280 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 200 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>DÖNÜŞ: NEREDEN</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoff}</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>↩</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 200 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>NEREYE</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickup}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Dönüş</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{returnDate?.format('DD MMM YYYY')}</div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', borderRadius: 10, padding: '7px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Gidiş</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{getCurrencySymbol(selectedVehicle?.currency || 'TRY')}{selectedVehicle?.price.toLocaleString('tr-TR')}</div>
                    </div>
                </div>
            </div>

            {/* Info Banner */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>↩️</span>
                <div>
                    <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>Dönüş Aracı Seçin</div>
                    <div style={{ fontSize: 12, color: '#a16207' }}>Gidiş aracınız seçildi. Şimdi dönüş için araç seçin.</div>
                </div>
            </div>

            {/* Return Vehicle List */}
            {returnSearchLoading ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: '#f59e0b', fontWeight: 600, fontSize: 15 }}>Dönüş araçları aranıyor...</div>
                </div>
            ) : returnResults.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>🚗</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>Dönüş İçin Uygun Araç Bulunamadı</div>
                    <div style={{ color: '#64748b', marginTop: 8 }}>Farklı tarih veya saat deneyin</div>
                    <Button type="primary" style={{ marginTop: 16 }} onClick={() => { proceedToDetails(selectedVehicle!, null); }}>
                        Dönüş Olmadan Devam Et
                    </Button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {returnResults.map((result, idx) => (
                        <div key={result.id} style={{
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
                                background: result.isShuttle ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative', overflow: 'hidden'
                            }}>
                                {result.image
                                    ? <img src={result.image} alt={result.vehicleType} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                                    : <CarOutlined style={{ fontSize: 54, color: result.isShuttle ? '#059669' : '#f59e0b', opacity: 0.25 }} />}
                                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <span style={{
                                        background: result.isShuttle ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                                        color: '#fff', padding: '3px 11px', borderRadius: 50, fontSize: 10, fontWeight: 800
                                    }}>{result.vehicleType}</span>
                                    <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700 }}>↩ Dönüş</span>
                                </div>
                            </div>

                            {/* Middle Info */}
                            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>{result.vehicleType}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                        Sağlayıcı: <span style={{ color: '#475569', fontWeight: 600 }}>{result.vendor}</span>
                                        {result.isShuttle && <span style={{ marginLeft: 8, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '1px 8px', borderRadius: 50, fontSize: 11 }}>Paylaşımlı</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151' }}>
                                        👤 {result.capacity} Yolcu
                                    </span>
                                    <span style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:9, padding:'5px 12px', fontSize:12, fontWeight:600, color:'#374151' }}>
                                        🧳 {result.luggage} Bavul
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
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:1, marginBottom: 2 }}>Dönüş Fiyatı</div>
                                <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                                    {getCurrencySymbol(result.currency)}{result.price.toLocaleString('tr-TR')}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{result.currency}</div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                                    Toplam: {getCurrencySymbol(result.currency)}{((selectedVehicle?.price || 0) + result.price).toLocaleString('tr-TR')}
                                </div>
                                <button onClick={() => handleSelectReturnVehicle(result)} style={{
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
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f1f3d 100%)',
                    borderRadius: 20, padding: '20px 28px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.22)'
                }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(returnSelectedVehicle ? 'return-results' : 'results')}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', borderRadius: 10, flexShrink: 0 }}>
                        Araçlara Dön
                    </Button>
                    <div style={{ width: 72, height: 52, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedVehicle.image
                            ? <img src={selectedVehicle.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            : <CarOutlined style={{ fontSize: 28, color: 'rgba(255,255,255,0.4)' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', padding: '2px 11px', borderRadius: 50, fontSize: 11, fontWeight: 700 }}>{selectedVehicle.vehicleType}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>· {selectedVehicle.vendor}</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 3 }}>
                            📍 <span style={{ fontWeight: 600 }}>{pickup}</span>
                            <span style={{ color: '#6366f1', margin: '0 8px' }}>→</span>
                            <span style={{ fontWeight: 600 }}>{dropoff}</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'flex', gap: 14 }}>
                            <span>📅 {date?.format('DD MMM YYYY')}</span>
                            <span>⏰ {pickupTimeValue?.format('HH:mm')}</span>
                            {routeStats && <span>📍 {typeof routeStats.distance === 'number' ? `${routeStats.distance.toFixed(0)} km` : `${routeStats.distance} km`}</span>}
                            {routeStats && <span>⏱ {routeStats.duration} dk</span>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>
                            {returnSelectedVehicle ? 'Toplam B2B' : 'B2B Fiyat'}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#818cf8', lineHeight: 1.1 }}>
                            {getCurrencySymbol(selectedVehicle.currency)}{((selectedVehicle.price || 0) + (returnSelectedVehicle?.price || 0)).toLocaleString('tr-TR')}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                            {selectedVehicle.currency}
                            {returnSelectedVehicle && ' (Gidiş + Dönüş)'}
                        </div>
                    </div>
                </div>
            )}

            <Form form={form} layout="vertical" onFinish={handleSave}>
                {/* Section 1: Passenger Info */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>👤</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Yolcu Bilgileri</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Ana yolcu iletişim bilgileri</div>
                        </div>
                    </div>
                    <Row gutter={[20, 0]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactName" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Ad Soyad</span>} rules={[{ required: true, message: 'Ad soyad zorunludur' }]}>
                                <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Müşterinizin adı soyadı" size="large" style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactPhone" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Telefon</span>} rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                                <Input addonBefore={
                                    <Select defaultValue="TR" style={{ width: 110 }} popupMatchSelectWidth={false} showSearch
                                        filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                                        options={COUNTRIES.map((c: any) => ({ label: `${c.flag} ${c.code} (${c.dial})`, value: c.code }))}
                                    />
                                } placeholder="555 123 45 67" size="large" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactEmail" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>E-posta</span>} rules={[{ required: true, type: 'email', message: 'Geçerli e-posta giriniz' }]}>
                                <Input placeholder="ornek@email.com" size="large" style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="contactNationality" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Uyruk</span>} rules={[{ required: true, message: 'Uyruk zorunludur' }]}>
                                <Select placeholder="Uyruk Seçiniz" size="large" showSearch
                                    filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                                    options={COUNTRIES.map((c: any) => ({ label: c.name, value: c.code }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>

                {/* Section 2: Transfer Details */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>🗓</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Transfer Detayları</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Tarih, saat ve yolcu bilgileri</div>
                        </div>
                    </div>
                    <Row gutter={[20, 0]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="startDate" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Transfer Tarihi & Saati</span>} rules={[{ required: true }]}>
                                <DatePicker showTime style={{ width: '100%', borderRadius: 10 }} format="YYYY-MM-DD HH:mm" size="large" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="passengers" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Yolcu Sayısı</span>} rules={[{ required: true }]}>
                                <InputNumber min={1} max={selectedVehicle?.isShuttle ? 50 : (selectedVehicle?.capacity || 50)} style={{ width: '100%', borderRadius: 10 }} size="large"
                                    onChange={(val) => {
                                        if (!val) return;
                                        const currentList = form.getFieldValue('passengersList') || [];
                                        const newList = Array.from({ length: Math.max(0, val - 1) }, (_, i) => currentList[i] || { firstName: '', lastName: '', nationality: '' });
                                        form.setFieldsValue({ passengersList: newList });

                                        // Recalculate price for shuttle (per-person pricing)
                                        if (selectedVehicle?.isShuttle) {
                                            const originalPax = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
                                            const pricePerPerson = (selectedVehicle.price || 0) / (originalPax || 1);
                                            let newPrice = Math.round(pricePerPerson * val * 100) / 100;
                                            // Add return vehicle price if round trip
                                            if (returnSelectedVehicle?.isShuttle) {
                                                const returnPricePerPerson = (returnSelectedVehicle.price || 0) / (originalPax || 1);
                                                newPrice += Math.round(returnPricePerPerson * val * 100) / 100;
                                            } else if (returnSelectedVehicle) {
                                                newPrice += returnSelectedVehicle.price;
                                            }
                                            // Add current extras cost (with markup) to the new amount
                                            let extrasCustTotal = 0;
                                            extraServicesList.forEach(s => {
                                                if (s.quantity > 0) extrasCustTotal += getExtraServiceEffectivePrice(s) * s.quantity;
                                            });
                                            form.setFieldsValue({ amount: newPrice + extrasCustTotal });
                                        }
                                        // Always recalculate B2B cost for new passenger count
                                        setComputedB2BCost(calcB2BCost(val));
                                    }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    {isAirportTransfer && (
                        <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 22 }}>✈️</span>
                            <div>
                                <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13 }}>Havalimanı Transferi Tespit Edildi</div>
                                <div style={{ color: '#3b82f6', fontSize: 12 }}>Uçuş saati ve numarasını doğru girmeniz çok önemlidir</div>
                            </div>
                        </div>
                    )}
                    <Row gutter={[20, 0]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="flightNumber" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Uçuş Numarası <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Opsiyonel)</span></span>}>
                                <Input placeholder="Örn: TK1234" size="large" style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Col>
                        {isAirportTransfer && (
                            <Col xs={24} md={12}>
                                <Form.Item name="flightTime" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Uçuş Saati</span>}
                                    tooltip="Uçuşunuzun kalkış veya varış saatini giriniz"
                                    rules={[{ required: true, message: 'Havalimanı transferi için zorunludur' }]}>
                                    <TimePicker size="large" format="HH:mm" style={{ width: '100%', borderRadius: 10 }} placeholder="14:30" minuteStep={5} />
                                </Form.Item>
                            </Col>
                        )}
                    </Row>
                    <Form.Item name="customerNotes" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Sürücüye Not <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Opsiyonel)</span></span>} style={{ marginBottom: 0 }}>
                        <Input placeholder="Bebek koltuğu, özel istek vb." size="large" style={{ borderRadius: 10 }} />
                    </Form.Item>
                </div>

                {/* Section 3: Other Passengers */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>👥</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Diğer Yolcular</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Yolcu sayısını artırdığınızda burası otomatik dolar</div>
                        </div>
                    </div>
                    <Form.List name="passengersList">
                        {(fields) => (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {fields.length === 0
                                    ? <div style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', padding: '12px 0', border: '1px dashed #e2e8f0', borderRadius: 10 }}>Henüz ek yolcu yok</div>
                                    : fields.map(({ key, name, ...restField }, index) => (
                                        <div key={key} style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 18px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{index + 1}. Yolcu</div>
                                            <Row gutter={[12, 0]}>
                                                <Col xs={24} md={8}>
                                                    <Form.Item {...restField} name={[name, 'firstName']} rules={[{ required: true, message: 'Ad giriniz' }]} style={{ marginBottom: 0 }}>
                                                        <Input placeholder="Adı" style={{ borderRadius: 8 }} />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} md={8}>
                                                    <Form.Item {...restField} name={[name, 'lastName']} rules={[{ required: true, message: 'Soyad giriniz' }]} style={{ marginBottom: 0 }}>
                                                        <Input placeholder="Soyadı" style={{ borderRadius: 8 }} />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} md={8}>
                                                    <Form.Item {...restField} name={[name, 'nationality']} rules={[{ required: true, message: 'Uyruk seçiniz' }]} style={{ marginBottom: 0 }}>
                                                        <Select placeholder="Uyruk" showSearch
                                                            filterOption={(input, option) => (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())}
                                                            options={COUNTRIES.map((country: any) => ({ value: country.code, label: `${country.name} (${country.code})` }))}
                                                        />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </Form.List>
                </div>

                {/* Section 4: Extras + Notes + Invoice */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#10b981,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>✨</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Ekstra Hizmetler</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Opsiyonel ek hizmetler seçin</div>
                        </div>
                    </div>
                    {loadingExtraServices ? <Spin size="small" /> :
                        extraServicesList.length === 0
                            ? <div style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', padding: '10px 0', border: '1px dashed #e2e8f0', borderRadius: 10, marginBottom: 16 }}>Ekstra hizmet tanımlı değil</div>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                {extraServicesList.map((service, index) => (
                                    <div key={service.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: service.quantity > 0 ? '#f0fdf4' : '#f8fafc',
                                        border: `1px solid ${service.quantity > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                                        borderRadius: 12, padding: '11px 16px', transition: 'all 0.2s'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            {service.image && <img src={service.image} alt={service.name} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 8 }} />}
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{service.name}</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                                    {getExtraServiceDisplayPrice(service)} {service.currency}
                                                    {service.currency !== (selectedVehicle?.currency || 'TRY') && (
                                                        <span style={{ color: '#6366f1', fontWeight: 600, marginLeft: 4 }}>≈ {getExtraServiceEffectivePrice(service)} {selectedVehicle?.currency}</span>
                                                    )}
                                                    {service.isPerPerson ? ' / kişi' : ' / adet'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <button type="button" disabled={service.quantity <= 0}
                                                onClick={() => {
                                                    const nl = [...extraServicesList]; nl[index].quantity -= 1; setExtraServicesList(nl);
                                                    const effectivePrice = getExtraServiceEffectivePrice(service);
                                                    const newB2B = calcB2BCost(form.getFieldValue('passengers'), nl);
                                                    setComputedB2BCost(newB2B);
                                                    form.setFieldValue('amount', Math.max(newB2B, (form.getFieldValue('amount') || selectedVehicle?.price || 0) - effectivePrice));
                                                }}
                                                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: service.quantity <= 0 ? '#f1f5f9' : '#fff', cursor: service.quantity <= 0 ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                            <span style={{ width: 24, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{service.quantity}</span>
                                            <button type="button"
                                                onClick={() => {
                                                    const maxQty = service.isPerPerson ? passengerCounts.adults + passengerCounts.children + passengerCounts.babies : 10;
                                                    if (service.quantity >= maxQty) return;
                                                    const nl = [...extraServicesList]; nl[index].quantity += 1; setExtraServicesList(nl);
                                                    const effectivePrice = getExtraServiceEffectivePrice(service);
                                                    const newB2B = calcB2BCost(form.getFieldValue('passengers'), nl);
                                                    setComputedB2BCost(newB2B);
                                                    form.setFieldValue('amount', (form.getFieldValue('amount') || selectedVehicle?.price || 0) + effectivePrice);
                                                }}
                                                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#10b981,#34d399)', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                    }
                    <Form.Item name="agencyNotes" label={<span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>Acente Notu <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Opsiyonel)</span></span>} style={{ marginBottom: 12 }}>
                        <Input.TextArea rows={2} placeholder="Dahili acente notları..." style={{ borderRadius: 10 }} />
                    </Form.Item>
                    <Form.Item name="wantsInvoice" valuePropName="checked" style={{ marginBottom: 0 }}>
                        <Checkbox><span style={{ fontWeight: 600, color: '#374151' }}>Fatura İstiyorum</span></Checkbox>
                    </Form.Item>
                </div>

                {/* Section 5: Payment */}
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
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>💵 Araçta Nakit Ödeme <Tag color="orange" style={{ marginLeft: 6 }}>Geçici</Tag></div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>Transfer sonrası cari hesaba yansıtılır</div>
                                    </div>
                                </Radio>
                                <Tooltip title={!hasActivePOS ? 'Sanal POS tanımlı değil — yöneticinizle iletişime geçin' : undefined}>
                                    <span>
                                        <Radio value="CREDIT_CARD" disabled={!hasActivePOS}>
                                            <div style={{ paddingLeft: 6 }}>
                                                <div style={{ fontWeight: 700, color: hasActivePOS ? '#0f172a' : '#94a3b8', fontSize: 14 }}>💳 Online Kredi Kartı <Tag color={hasActivePOS ? 'blue' : 'default'} style={{ marginLeft: 6 }}>{hasActivePOS ? 'Canlı POS' : 'Tanımsız'}</Tag></div>
                                                <div style={{ fontSize: 12, color: '#64748b' }}>Müşteri 3D güvenli ödeme yapar, kâr anında yatırılır</div>
                                            </div>
                                        </Radio>
                                    </span>
                                </Tooltip>
                            </div>
                        </Radio.Group>
                    </Form.Item>
                </div>

                {/* Section 6: Sale Price */}
                <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 28px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>💰</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Satış Tutarı</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Müşterinize satacağınız fiyatı belirleyin</div>
                        </div>
                    </div>
                    <Form.Item name="amount"
                        label={<span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 13 }}>Müşteriden Alınacak Tutar</span>}
                        rules={[{ required: true, message: 'Satış tutarı zorunludur' }]}
                        extra={<span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>B2B maliyet: {getCurrencySymbol(selectedVehicle?.currency || 'TRY')}{computedB2BCost.toLocaleString('tr-TR')}{returnSelectedVehicle ? ' (Gidiş+Dönüş)' : ''}</span>}
                        style={{ marginBottom: 0 }}>
                        <InputNumber min={computedB2BCost} style={{ width: '100%', borderRadius: 10 }} size="large"
                            addonAfter={<span style={{ fontWeight: 700, color: '#fff' }}>{selectedVehicle?.currency || 'TRY'}</span>} />
                    </Form.Item>
                </div>

                <div style={{ textAlign: 'center', paddingBottom: 32 }}>
                    <Button type="primary" htmlType="submit" loading={loading} size="large" style={{
                        minWidth: 260, height: 52, fontSize: 15, fontWeight: 700,
                        background: 'linear-gradient(135deg,#6366f1,#818cf8)', border: 'none', borderRadius: 14,
                        boxShadow: '0 8px 24px rgba(99,102,241,0.4)'
                    }}>
                        🎯 Rezervasyonu Tamamla
                    </Button>
                </div>
            </Form>
        </div>
    );

    const renderSuccessStep = () => {
        // Use the pickupTimeValue state
        const pickupTimeStr = pickupTimeValue?.format('HH:mm') || '12:00';
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
                            <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>Gidiş Rotası</div>
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
                            <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>Gidiş Alınış Zamanı</div>
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

                {/* Return Leg Info Cards (only for round trip) */}
                {bookingResult?.returnBooking && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: '24px 28px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', border: '1px solid #fde68a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>↩️</div>
                                <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>Dönüş Rotası</div>
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
                                <div>🛫 <strong>{dropoff}</strong></div>
                                <div style={{ marginLeft: 8, color: '#d1d5db' }}>↓</div>
                                <div>🛬 <strong>{pickup}</strong></div>
                                <div style={{ marginTop: 8, fontSize: 11, color: '#92400e' }}>
                                    Rez. No: <strong>{bookingResult.returnBooking.bookingNumber}</strong>
                                </div>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: '24px 28px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', border: '1px solid #fde68a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🕐</div>
                                <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>Dönüş Alınış Zamanı</div>
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
                                <div>📅 <strong>{dayjs(bookingResult.returnBooking.startDate).format('DD MMMM YYYY')}</strong></div>
                                <div>⏰ Alınış: <strong style={{ color: '#d97706', fontSize: 15 }}>{dayjs(bookingResult.returnBooking.startDate).format('HH:mm')}</strong></div>
                                {bookingResult.returnBooking.metadata?.flightTime && (
                                    <div>✈️ Uçuş: <strong>{bookingResult.returnBooking.metadata.flightTime}</strong></div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Voucher hidden */}
                <div id="print-voucher-container" className="print-only-voucher" style={{ position: 'absolute', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }}>
                    <BookingVoucher booking={bookingResult} tenant={tenantInfo} agency={agencyInfo} pickup={pickup} dropoff={dropoff} />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => {
                        form.resetFields(); setCurrentStep('search');
                        setPickup(''); setDropoff(''); setDate(null); setSelectedVehicle(null); setReturnSelectedVehicle(null);
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
                    {currentStep === 'return-results' && renderReturnResultsStep()}
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
