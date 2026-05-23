'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layout,
  Typography,
  Row,
  Col,
  Card,
  DatePicker,
  TimePicker,
  Radio,
  Button,
  Modal,
  Checkbox,
  message,
  Space,
  Form,
  Input,
  Carousel,
  Spin,
  Collapse,
  Rate,
  Divider,
  Select,
  Segmented
} from 'antd';
import {
  CarOutlined,
  SearchOutlined,
  ArrowRightOutlined,
  GlobalOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  SafetyOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  PhoneOutlined,
  MailOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  HeartOutlined,
  SwapOutlined,
  FacebookOutlined,
  InstagramOutlined,
  TwitterOutlined,
  YoutubeOutlined,
  LinkedinOutlined,
  WhatsAppOutlined,
  SendOutlined,
  CustomerServiceOutlined,
  StarOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiClient, { getImageUrl } from '@/lib/api-client';

// ─── Havalimanı Tespiti ───
const AIRPORT_CODES = [
  'AYT', 'DLM', 'GZP', 'BJV', 'IST', 'SAW', 'ESB', 'ADB', 'ADA',
  'TZX', 'MSR', 'ASR', 'VAS', 'KYA', 'KSY', 'MLX', 'ERZ', 'EZS',
  'DIY', 'GZT', 'HTY', 'SZF', 'KCM', 'NAV', 'AFY', 'USQ', 'BAL',
  'IGL', 'ONQ', 'MQM', 'SIC', 'YEI', 'TEQ', 'EDO', 'CKZ', 'KZR',
  'AOE', 'KIF', 'AJI', 'NOP', 'IGD', 'VAN', 'BXN',
];

// Türkçe "havalimanı" kelimesi VEYA IATA kodu içeriyorsa havalimanı sayılır
const isAirportLocation = (text: string): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase();
  const upper = text.toUpperCase();
  // Türkçe/İngilizce havalimanı anahtar kelimeleri
  const keywords = ['havalimanı', 'havalimani', 'hava limanı', 'airport', 'airfield', 'hava alanı', 'havaalanı'];
  if (keywords.some(kw => lower.includes(kw))) return true;
  // IATA kodu kontrolü (kelime sınırıyla)
  return AIRPORT_CODES.some(code => {
    const regex = new RegExp(`(^|[\\s\\(\\-\/])${code}([\\s\\)\\-\/]|$)`);
    return regex.test(upper);
  });
};
import TopBar from './components/TopBar';
import DynamicLocationSearchInput from './components/DynamicLocationSearchInput';
import MapPickerModal from './components/MapPickerModal';
import PassengerSelector from './components/PassengerSelector';
import { useTheme } from './context/ThemeContext';
import { useBranding } from './context/BrandingContext';
import { useLanguage } from './context/LanguageContext';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

interface TransferOption {
  id: number;
  vehicleType: string;
  vendor: string;
  price: number;
  capacity: number;
  cancellationPolicy: string;
  features: string[];
}


const HomePage: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { branding, fullName } = useBranding();
  const { t } = useLanguage();

  const [configLoading, setConfigLoading] = useState(true);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [googleMapsSettings, setGoogleMapsSettings] = useState<{ country?: string }>({});
  const [heroBackground, setHeroBackground] = useState<{ type: 'image' | 'video', videoUrl: string }>({ type: 'image', videoUrl: '' });
  const [homepageSections, setHomepageSections] = useState<string[]>(['howItWorks', 'whyUs', 'stats', 'popularRoutes', 'bookingLookup', 'testimonials', 'faq', 'cta']);

  // Dynamic homepage content from tenant settings
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([]);
  const [statsItems, setStatsItems] = useState<{ num: string; label: string }[]>([]);
  const [routeItems, setRouteItems] = useState<{ from: string; to: string; img: string; price: string }[]>([]);
  const [socialMedia, setSocialMedia] = useState<Record<string, string>>({});
  const [featureItems, setFeatureItems] = useState<{ title: string; desc: string; color: string }[]>([]);
  const [testimonialItems, setTestimonialItems] = useState<{ name: string; text: string; rating: number; city: string }[]>([]);
  const [tursab, setTursab] = useState<{ enabled: boolean; belgeNo: string; verificationUrl: string }>({ enabled: false, belgeNo: '', verificationUrl: '' });

  // Search mode: transfer or hourly
  const [searchMode, setSearchMode] = useState<'transfer' | 'hourly'>('transfer');

  // Hourly state
  const [hourlyPickup, setHourlyPickup] = useState('');
  const [hourlyPickupLocation, setHourlyPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hourlyDate, setHourlyDate] = useState<Dayjs | null>(null);
  const [hourlyTime, setHourlyTime] = useState<Dayjs | null>(dayjs().hour(12).minute(0).second(0));
  const [hourlyHours, setHourlyHours] = useState<number>(2);

  // Transfer state
  const [pickup, setPickup] = useState('');
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupDate, setPickupDate] = useState<Dayjs | null>(null);
  const [pickupTime, setPickupTime] = useState<Dayjs | null>(dayjs().hour(12).minute(0).second(0));
  const [returnDate, setReturnDate] = useState<Dayjs | null>(null);
  const [returnTime, setReturnTime] = useState<Dayjs | null>(dayjs().hour(12).minute(0).second(0));
  const [tripType, setTripType] = useState<'oneway' | 'return'>('oneway');
  const [passengerCounts, setPassengerCounts] = useState({ adults: 1, children: 0, babies: 0 });
  const [passengers, setPassengers] = useState<number>(1);
  const [childAges, setChildAges] = useState<number[]>([]);
  const [babySeatRequired, setBabySeatRequired] = useState(false);
  const [babySeatModalVisible, setBabySeatModalVisible] = useState(false);

  // Map Modal
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [mapModalType, setMapModalType] = useState<'pickup' | 'dropoff' | 'hourly-pickup'>('pickup');

  // Search & Booking
  const [searchLoading, setSearchLoading] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferOption | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [form] = Form.useForm();

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState<{ discount: number; name: string; code: string; newTotal: number } | null>(null);
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
        orderAmount: selectedTransfer?.price || 0,
        vehicleType: selectedTransfer?.vehicleType || '',
      });
      if (res.data.success) setCouponResult(res.data.data);
    } catch (e: any) {
      setCouponError(e?.response?.data?.error || 'Ge\u00e7ersiz kupon');
      setCouponResult(null);
    } finally {
      setCouponLoading(false);
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [imagesRes, infoRes] = await Promise.all([
          apiClient.get('/api/tenant/hero-images'),
          apiClient.get('/api/tenant/info')
        ]);

        if (infoRes.data.success && infoRes.data.data.tenant.settings?.googleMaps) {
          setGoogleMapsSettings(infoRes.data.data.tenant.settings.googleMaps);
        }
        if (infoRes.data.success && infoRes.data.data.tenant.settings?.heroBackground) {
          setHeroBackground(infoRes.data.data.tenant.settings.heroBackground);
        }
        if (infoRes.data.success && infoRes.data.data.tenant.settings?.homepageSections) {
          setHomepageSections(infoRes.data.data.tenant.settings.homepageSections);
        }
        // Load dynamic homepage content
        if (infoRes.data.success) {
          const settings = infoRes.data.data.tenant.settings;
          if (settings?.homepageFaq?.length > 0) setFaqItems(settings.homepageFaq);
          if (settings?.homepageStats?.length > 0) setStatsItems(settings.homepageStats);
          if (settings?.homepageRoutes?.length > 0) setRouteItems(settings.homepageRoutes);
          if (settings?.homepageFeatures?.length > 0) setFeatureItems(settings.homepageFeatures);
          if (settings?.homepageTestimonials?.length > 0) setTestimonialItems(settings.homepageTestimonials);
          if (settings?.tursab) setTursab(settings.tursab);
          if (settings?.socialMedia) setSocialMedia(settings.socialMedia);
        }

        if (imagesRes.data.success && imagesRes.data.data.heroImages?.length > 0) {
          setHeroImages(imagesRes.data.data.heroImages);
        } else {
          setHeroImages([
            'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?ixlib=rb-4.0.3&auto=format&fit=crop&w=2021&q=80',
            'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80'
          ]);
        }
      } catch (error) {
        console.error('Config load error:', error);
      } finally {
        setConfigLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const openMapModal = (type: 'pickup' | 'dropoff') => {
    setMapModalType(type);
    setMapModalVisible(true);
  };

  const handleMapConfirm = (address: string, lat: number, lng: number) => {
    if (mapModalType === 'hourly-pickup') {
      setHourlyPickup(address);
      setHourlyPickupLocation({ lat, lng });
    } else if (mapModalType === 'pickup') {
      setPickup(address);
      setPickupLocation({ lat, lng });
    } else {
      setDropoff(address);
      setDropoffLocation({ lat, lng });
    }
  };

  // Swap pickup ↔ dropoff (location text + coordinates)
  const handleSwapLocations = () => {
    setPickup(dropoff);
    setDropoff(pickup);
    setPickupLocation(dropoffLocation);
    setDropoffLocation(pickupLocation);
  };

  const isAirportTransfer = isAirportLocation(pickup) || isAirportLocation(dropoff);
  const timeLabel = isAirportTransfer ? t('search.flightTime') : t('search.pickupTime');

  // For return trip, the direction is reversed: pickup becomes dropoff and vice versa
  const isReturnAirportTransfer = isAirportLocation(dropoff) || isAirportLocation(pickup);
  const returnTimeLabel = isReturnAirportTransfer ? t('search.returnFlightTime') : t('search.returnPickupTime');

  const handleHourlySearch = () => {
    if (!hourlyPickup || !hourlyDate) {
      message.warning('Konum ve tarih seçmelisiniz');
      return;
    }
    const timeHour = hourlyTime ? hourlyTime.hour().toString().padStart(2, '0') : '12';
    const timeMin = hourlyTime ? hourlyTime.minute().toString().padStart(2, '0') : '00';
    const params = new URLSearchParams();
    params.set('pickup', hourlyPickup);
    params.set('date', hourlyDate.format('YYYY-MM-DD'));
    params.set('time', `${timeHour}:${timeMin}`);
    params.set('hours', hourlyHours.toString());
    params.set('passengers', passengers.toString());
    if (hourlyPickupLocation) {
      params.set('pickupLat', hourlyPickupLocation.lat.toString());
      params.set('pickupLng', hourlyPickupLocation.lng.toString());
    }
    router.push(`/transfer/hourly-results?${params.toString()}`);
  };

  const handleTransferSearch = () => {
    if (!pickup || !dropoff || !pickupDate) {
      message.warning(t('search.fillRequired'));
      return;
    }
    if (tripType === 'return' && !returnDate) {
      message.warning(t('search.selectReturnDate'));
      return;
    }
    const timeHour = pickupTime ? pickupTime.hour().toString().padStart(2, '0') : '12';
    const timeMin = pickupTime ? pickupTime.minute().toString().padStart(2, '0') : '00';
    const params = new URLSearchParams();
    params.set('pickup', pickup);
    params.set('dropoff', dropoff);
    params.set('date', pickupDate.format('YYYY-MM-DD'));
    params.set('time', `${timeHour}:${timeMin}`);
    if (isAirportTransfer) {
      params.set('flightTime', `${timeHour}:${timeMin}`);
    }
    const totalPassengers = passengerCounts.adults + passengerCounts.children + passengerCounts.babies;
    params.set('passengers', totalPassengers.toString());
    params.set('adults', passengerCounts.adults.toString());
    params.set('children', passengerCounts.children.toString());
    params.set('babies', passengerCounts.babies.toString());
    params.set('type', tripType === 'return' ? 'ROUND_TRIP' : 'ONE_WAY');
    if (tripType === 'return' && returnDate) {
      params.set('returnDate', returnDate.format('YYYY-MM-DD'));
      const rTimeHour = returnTime ? returnTime.hour().toString().padStart(2, '0') : '12';
      const rTimeMin = returnTime ? returnTime.minute().toString().padStart(2, '0') : '00';
      params.set('returnTime', `${rTimeHour}:${rTimeMin}`);
    }
    if (pickupLocation) {
      params.set('pickupLat', pickupLocation.lat.toString());
      params.set('pickupLng', pickupLocation.lng.toString());
    }
    if (dropoffLocation) {
      params.set('dropoffLat', dropoffLocation.lat.toString());
      params.set('dropoffLng', dropoffLocation.lng.toString());
    }
    router.push(`/transfer/search?${params.toString()}`);
  };

  const handleBookingSubmit = async () => {
    try {
      const values = await form.validateFields();
      setBookingLoading(true);
      if (selectedTransfer) {
        if (!pickupDate) { message.error(t('booking.missingDate')); return; }
        const tHour = pickupTime ? pickupTime.hour() : 12;
        const tMin = pickupTime ? pickupTime.minute() : 0;
        const pickupDateTime = dayjs(pickupDate).hour(tHour).minute(tMin).second(0).millisecond(0).toISOString();
        let returnDateTime: string | null = null;
        if (tripType === 'return' && returnDate) {
          returnDateTime = dayjs(returnDate).hour(tHour).minute(tMin).second(0).millisecond(0).toISOString();
        }
        const payload = {
          vehicleType: selectedTransfer.vehicleType, vendor: selectedTransfer.vendor,
          price: selectedTransfer.price, passengers, capacity: selectedTransfer.capacity,
          pickup, dropoff, pickupDateTime, returnDateTime,
          fullName: values.fullName, email: values.email, phone: values.phone,
          flightNumber: values.flightNumber || null, flightArrivalTime: null,
          meetAndGreet: values.meetAndGreet || false, notes: values.notes || '',
          childAges, babySeat: babySeatRequired,
          couponCode: couponResult?.code || undefined,
        };
        const res = await apiClient.post('/api/bookings', payload);
        if (res.data?.success) {
          message.success(t('booking.success'));
          setBookingModalVisible(false);
        } else {
          message.error(res.data?.message || t('booking.error'));
        }
      }
    } catch (err: any) {
      console.error('handleBookingSubmit error:', err);
      message.error(t('booking.error'));
    } finally {
      setBookingLoading(false);
    }
  };

  if (configLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  // ─── HOURLY SEARCH FORM ───
  const hourlySearchForm = (
    <div className="st-rental-row">
      <div className="st-rental-field st-rental-field-location">
        <div className="st-detail-label">
          <EnvironmentOutlined className="st-detail-label-icon" />
          Başlangıç Konumu
        </div>
        <DynamicLocationSearchInput
          size="middle"
          placeholder="Adres, havalimanı, otel, ..."
          value={hourlyPickup}
          onChange={setHourlyPickup}
          onSelect={(val, lat, lng) => { setHourlyPickup(val); if (lat && lng) setHourlyPickupLocation({ lat, lng }); }}
          onMapClick={() => { setMapModalType('hourly-pickup'); setMapModalVisible(true); }}
          country={googleMapsSettings.country || 'tr,cy'}
          style={{ borderRadius: 10 }}
        />
      </div>
      <div className="st-rental-field st-rental-field-date">
        <div className="st-detail-label">
          <CalendarOutlined className="st-detail-label-icon" />
          Kalkış Tarihi
        </div>
        <DatePicker
          size="middle" style={{ width: '100%', borderRadius: 10 }}
          format="DD.MM.YYYY" placeholder="Tarih Seç"
          value={hourlyDate} onChange={setHourlyDate}
          disabledDate={(c) => c && c < dayjs().startOf('day')}
        />
      </div>
      <div className="st-rental-field st-rental-field-time">
        <div className="st-detail-label">
          <ClockCircleOutlined className="st-detail-label-icon" />
          Saat
        </div>
        <TimePicker
          size="middle" style={{ width: '100%', borderRadius: 10 }}
          format="HH:mm" minuteStep={5}
          value={hourlyTime} onChange={setHourlyTime}
          needConfirm={false} showNow={false}
        />
      </div>
      <div className="st-rental-field st-rental-field-duration">
        <div className="st-detail-label">
          <ClockCircleOutlined className="st-detail-label-icon" />
          Süre
        </div>
        <Select
          size="middle" style={{ width: '100%' }}
          value={hourlyHours} onChange={setHourlyHours}
          options={[1,2,3,4,5,6,8,10,12].map(h => ({ value: h, label: `${h} Saat` }))}
        />
      </div>
      <Button
        type="primary" icon={<SearchOutlined />}
        onClick={handleHourlySearch}
        className="st-rental-search-btn"
        style={{
          height: 32, fontWeight: 600, fontSize: 13,
          background: '#111827', border: 'none', borderRadius: 10,
          boxShadow: '0 2px 8px rgba(17,24,39,0.15)',
        }}
      >
        Ara
      </Button>
    </div>
  );

  // ─── TRANSFER SEARCH FORM ───
  const transferSearchForm = (
    <div>
      {/* Route Section */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, padding: '0 2px' }}>
          <span className="st-detail-label">
            <EnvironmentOutlined className="st-detail-label-icon" /> {t('search.from')}
          </span>
          <span className="st-detail-label">
            <EnvironmentOutlined className="st-detail-label-icon" /> {t('search.to')}
          </span>
        </div>
        <div className="st-route-inputs">
          <div style={{ flex: 1 }}>
            <DynamicLocationSearchInput
              size="middle"
              placeholder={t('search.fromPlaceholder')}
              value={pickup}
              onChange={setPickup}
              onSelect={(val, lat, lng) => { setPickup(val); if (lat && lng) setPickupLocation({ lat, lng }); }}
              onMapClick={() => openMapModal('pickup')}
              country={googleMapsSettings.country || 'tr,cy'}
              style={{ borderRadius: 10 }}
            />
          </div>
          <button
            type="button"
            aria-label="Yerleri değiştir"
            title="Yerleri değiştir"
            onClick={handleSwapLocations}
            className="st-swap-btn"
          >
            <SwapOutlined style={{ fontSize: 10 }} />
          </button>
          <div style={{ flex: 1 }}>
            <DynamicLocationSearchInput
              size="middle"
              placeholder={t('search.toPlaceholder')}
              value={dropoff}
              onChange={setDropoff}
              onSelect={(val, lat, lng) => { setDropoff(val); if (lat && lng) setDropoffLocation({ lat, lng }); }}
              onMapClick={() => openMapModal('dropoff')}
              country={googleMapsSettings.country || 'tr,cy'}
              style={{ borderRadius: 10 }}
            />
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div
        className={`st-details-grid ${tripType === 'return' ? 'st-details-grid--return' : ''}`}
      >
        <div className="st-grid-gtarih">
          <div className="st-detail-label">
            <CalendarOutlined className="st-detail-label-icon" /> {t('search.date')}
          </div>
          <DatePicker
            size="middle"
            style={{ width: '100%', borderRadius: 10 }}
            format="DD.MM.YYYY"
            placeholder={t('search.datePlaceholder')}
            value={pickupDate}
            onChange={(date) => setPickupDate(date)}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
          />
        </div>
        <div className="st-grid-gsaat">
          <div className="st-detail-label">
            <ClockCircleOutlined className="st-detail-label-icon" /> {timeLabel}
          </div>
          <TimePicker
            size="middle"
            style={{ width: '100%', borderRadius: 10 }}
            format="HH:mm" minuteStep={5}
            value={pickupTime}
            onChange={(time) => setPickupTime(time)}
            placeholder={t('search.timePlaceholder')}
            needConfirm={false} showNow={false}
          />
        </div>
        {tripType === 'return' && (
          <>
            <div className="st-grid-dtarih">
              <div className="st-detail-label">
                <CalendarOutlined className="st-detail-label-icon" /> {t('search.returnDate')}
              </div>
              <DatePicker
                size="middle"
                style={{ width: '100%', borderRadius: 10 }}
                format="DD.MM.YYYY"
                placeholder={t('search.returnDatePlaceholder')}
                value={returnDate}
                onChange={(date) => setReturnDate(date)}
                disabledDate={(current) => {
                  if (!pickupDate) return current && current < dayjs().startOf('day');
                  return current && current < pickupDate.startOf('day');
                }}
              />
            </div>
            <div className="st-grid-dsaat">
              <div className="st-detail-label">
                <ClockCircleOutlined className="st-detail-label-icon" /> {returnTimeLabel}
              </div>
              <TimePicker
                size="middle"
                style={{ width: '100%', borderRadius: 10 }}
                format="HH:mm" minuteStep={5}
                value={returnTime}
                onChange={(time) => setReturnTime(time)}
                placeholder={t('search.returnTimePlaceholder')}
                needConfirm={false} showNow={false}
              />
            </div>
          </>
        )}
        <div className="st-grid-yolcu">
          <div className="st-detail-label">
            {t('search.passengers')}
          </div>
          <PassengerSelector
            size="middle"
            value={passengerCounts}
            onChange={(counts) => { setPassengerCounts(counts); setPassengers(counts.adults + counts.children + counts.babies); }}
          />
        </div>
        <div className="st-grid-tip">
          <div className="st-detail-label">
            {t('search.transferType')}
          </div>
          <div className="st-type-toggle">
            <button
              type="button"
              onClick={() => setTripType('oneway')}
              className={`st-type-option ${tripType === 'oneway' ? 'st-type-option--active' : ''}`}
            >
              {t('search.oneWay')}
            </button>
            <button
              type="button"
              onClick={() => setTripType('return')}
              className={`st-type-option ${tripType === 'return' ? 'st-type-option--active' : ''}`}
            >
              {t('search.roundTrip')}
            </button>
          </div>
        </div>
      </div>

      {/* Search Button */}
      <Button
        type="primary" block size="large" icon={<SearchOutlined />}
        onClick={handleTransferSearch} loading={searchLoading}
        style={{
          height: 44, fontSize: 13, fontWeight: 600,
          background: theme.buttonGradient || '#111827', border: 'none',
          boxShadow: theme.buttonShadow || '0 2px 8px rgba(17,24,39,0.15)',
          borderRadius: 10, color: '#fff', letterSpacing: 0.2,
        }}
      >
        {t('search.searchButton')}
      </Button>
    </div>
  );

  // ─── HERO SECTION ───
  const heroContent = (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      zIndex: 10, padding: '80px 16px 0',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 760 }}>
        {/* Premium badge */}
        {(theme.decorationEmoji || branding.slogan) && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
            color: '#fbbf24', padding: '6px 20px', borderRadius: 100,
            fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            marginBottom: 24, backdropFilter: 'blur(10px)',
          }}>
            <span>{theme.decorationEmoji || '✦'}</span>
            {branding.slogan || 'Premium Transfer Deneyimi'}
          </div>
        )}
        <Title level={1} style={{
          color: '#fff', fontSize: 'clamp(2rem, 5vw, 4rem)', marginBottom: 16,
          fontWeight: 700, fontFamily: 'var(--font-playfair, Georgia, serif)',
          textShadow: '0 4px 20px rgba(0,0,0,0.45)', letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>
          {theme.heroTitle}
        </Title>
        <Text style={{
          color: 'rgba(255,255,255,0.78)', fontSize: 'clamp(0.95rem, 2vw, 1.18rem)',
          textShadow: '0 2px 8px rgba(0,0,0,0.4)', fontWeight: 300, display: 'block', lineHeight: 1.75,
        }}>
          {theme.heroSubtitle}
        </Text>
      </div>
      <div className="st-search-card">
        {/* Tabs */}
        <div className="st-tabs">
          <button
            type="button"
            onClick={() => setSearchMode('transfer')}
            className={`st-tab ${searchMode === 'transfer' ? 'st-tab--active' : ''}`}
          >
            <SwapOutlined style={{ fontSize: 11 }} />
            Transfer
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('hourly')}
            className={`st-tab ${searchMode === 'hourly' ? 'st-tab--active' : ''}`}
          >
            <ClockCircleOutlined style={{ fontSize: 11 }} />
            Saatlik Kiralama
          </button>
        </div>
        {searchMode === 'transfer' ? transferSearchForm : hourlySearchForm}
      </div>
      {/* Search Card Styles */}
      <style>{`
        .st-search-card {
          width: 100%; max-width: 720px;
          background: #ffffff; border-radius: 16px;
          border: 1px solid #e8eaed;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
          padding: clamp(20px, 3vw, 28px) clamp(20px, 3vw, 32px);
        }
        .st-tabs { display: flex; gap: 4px; margin-bottom: 20px; justify-content: center; }
        .st-tab {
          padding: 8px 20px; border-radius: 8px; border: none;
          background: transparent; color: #6b7280;
          font-family: inherit; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.2s ease;
          display: flex; align-items: center; gap: 6px;
        }
        .st-tab:hover { background: #f3f4f6; color: #374151; }
        .st-tab--active {
          background: #ffffff; color: #111827; font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          border: 1px solid #e5e7eb;
        }
        .st-detail-label {
          font-size: 11px; font-weight: 500; color: #6b7280;
          margin-bottom: 4px; display: flex; align-items: center; gap: 4px;
        }
        .st-detail-label-icon { color: #9ca3af; font-size: 10px; }
        .st-route-inputs { display: flex; align-items: center; gap: 8px; }
        .st-swap-btn {
          width: 28px; height: 28px; border: 1px solid #e5e7eb;
          background: #fff; border-radius: 50%; cursor: pointer;
          color: #9ca3af; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0; transition: all 0.2s ease;
        }
        .st-swap-btn:hover { border-color: #d1d5db; color: #6b7280; transform: rotate(180deg); }
        .st-details-grid {
          display: grid; grid-template-columns: repeat(4, 1fr);
          grid-template-areas: "gtarih gsaat yolcu tip";
          gap: 12px; margin-bottom: 18px;
        }
        .st-details-grid--return {
          grid-template-areas: "gtarih gsaat dtarih dsaat" "yolcu yolcu tip tip";
        }
        .st-grid-gtarih { grid-area: gtarih; }
        .st-grid-gsaat  { grid-area: gsaat; }
        .st-grid-dtarih { grid-area: dtarih; animation: stFadeIn 0.25s ease; }
        .st-grid-dsaat  { grid-area: dsaat; animation: stFadeIn 0.25s ease; }
        .st-grid-yolcu  { grid-area: yolcu; }
        .st-grid-tip    { grid-area: tip; }
        @keyframes stFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .st-type-toggle {
          display: flex; background: #fafafa; border-radius: 10px;
          padding: 3px; border: 1px solid #e5e7eb;
        }
        .st-type-option {
          flex: 1; padding: 7px 4px; border: none;
          background: transparent; border-radius: 7px;
          font-family: inherit; font-size: 11px; font-weight: 500;
          color: #6b7280; cursor: pointer; transition: all 0.2s ease;
          text-align: center; white-space: nowrap;
        }
        .st-type-option--active {
          background: #fff; color: #111827;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          border: 1px solid #e5e7eb;
        }
        .st-rental-row { display: flex; align-items: flex-end; gap: 8px; }
        .st-rental-field { display: flex; flex-direction: column; gap: 4px; }
        .st-rental-field-location { flex: 2.2; min-width: 180px; }
        .st-rental-field-date { flex: 1; min-width: 100px; }
        .st-rental-field-time { width: 85px; flex-shrink: 0; }
        .st-rental-field-duration { width: 90px; flex-shrink: 0; }
        .st-rental-search-btn { flex-shrink: 0; white-space: nowrap; margin-bottom: 1px; }
        @media (max-width: 640px) {
          .st-search-card { padding: 20px; }
          .st-details-grid { grid-template-columns: repeat(2, 1fr); }
          .st-details-grid:not(.st-details-grid--return) {
            grid-template-areas: "gtarih gsaat" "yolcu tip";
          }
          .st-details-grid--return {
            grid-template-areas: "gtarih gsaat" "dtarih dsaat" "yolcu tip";
          }
          .st-route-inputs { flex-direction: column; }
          .st-swap-btn { transform: rotate(90deg); margin: 4px 0; }
          .st-swap-btn:hover { transform: rotate(270deg); }
          .st-rental-row { flex-wrap: wrap; gap: 10px; }
          .st-rental-field-location { flex: 1 1 100%; min-width: auto; }
          .st-rental-field-date,
          .st-rental-field-time,
          .st-rental-field-duration { flex: 1 1 30%; min-width: auto; }
          .st-rental-search-btn { width: 100%; }
        }
      `}</style>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <MapPickerModal
        visible={mapModalVisible}
        onCancel={() => setMapModalVisible(false)}
        onConfirm={handleMapConfirm}
        initialAddress={mapModalType === 'pickup' ? pickup : mapModalType === 'hourly-pickup' ? hourlyPickup : dropoff}
        title={mapModalType === 'pickup' ? t('map.pickupTitle') : t('map.dropoffTitle')}
        country={googleMapsSettings.country || 'tr,cy'}
        key={`map-modal-${googleMapsSettings.country || 'tr,cy'}`}
      />
      <TopBar />

      <Content>
        {/* ─── HERO ─── */}
        {heroBackground.type === 'video' && heroBackground.videoUrl ? (
          <div style={{ position: 'relative', minHeight: 'clamp(600px, 85vh, 800px)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
              <iframe
                width="100%" height="100%"
                src={`https://www.youtube-nocookie.com/embed/${heroBackground.videoUrl}?autoplay=1&mute=1&controls=0&loop=1&playlist=${heroBackground.videoUrl}&showinfo=0&rel=0&iv_load_policy=3&disablekb=1&playsinline=1&enablejsapi=1&modestbranding=1`}
                title="Background Video" frameBorder="0"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                style={{ width: '100vw', height: '56.25vw', minHeight: '100%', minWidth: '177.77vh', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', border: 'none' }}
              />
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: theme.heroOverlay, zIndex: 1 }} />
            </div>
            {heroContent}
          </div>
        ) : heroImages.length > 0 ? (
          <div style={{ position: 'relative', minHeight: 'clamp(600px, 85vh, 800px)', overflow: 'hidden' }}>
            <Carousel autoplay effect="fade" autoplaySpeed={5000} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              {heroImages.map((img, index) => (
                <div key={index}>
                  <div style={{
                    minHeight: 'clamp(600px, 85vh, 800px)',
                    backgroundImage: `url(${getImageUrl(img) || img})`, backgroundSize: 'cover', backgroundPosition: 'center',
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: theme.heroOverlay }} />
                  </div>
                </div>
              ))}
            </Carousel>
            {heroContent}
          </div>
        ) : (
          <div style={{ position: 'relative', minHeight: 'clamp(600px, 85vh, 800px)', background: theme.heroGradient }}>
            {heroContent}
          </div>
        )}

        {/* ─── DYNAMIC SECTIONS ─── */}
        {homepageSections.map((sectionKey) => {
          switch (sectionKey) {
            case 'howItWorks':
              return (
                <div key="howItWorks" style={{ background: '#f8fafc', padding: 'clamp(56px, 8vw, 96px) 16px' }}>
                  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                      <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: theme.sectionAccent, marginBottom: 14, position: 'relative' as const }}>
                        {t('howItWorks.badge')}
                        <div style={{ width: 40, height: 2, background: theme.sectionAccent, margin: '10px auto 0' }} />
                      </div>
                      <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#0f172a', marginBottom: 10, marginTop: 0 }}>{t('howItWorks.title')}</Title>
                      <Text style={{ color: '#64748b', fontSize: 16, lineHeight: 1.7, fontWeight: 400 }}>{t('howItWorks.subtitle')}</Text>
                    </div>
                    <Row gutter={[40, 40]}>
                      {[
                        { icon: <SearchOutlined />, num: '01', title: t('howItWorks.step1.title'), desc: t('howItWorks.step1.desc') },
                        { icon: <CarOutlined />, num: '02', title: t('howItWorks.step2.title'), desc: t('howItWorks.step2.desc') },
                        { icon: <CheckCircleOutlined />, num: '03', title: t('howItWorks.step3.title'), desc: t('howItWorks.step3.desc') },
                      ].map((step, i) => (
                        <Col xs={24} sm={8} key={i}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{
                              width: 72, height: 72, borderRadius: 20,
                              background: `linear-gradient(135deg, ${theme.primaryColor}18, ${theme.primaryColor}08)`,
                              border: `1px solid ${theme.primaryColor}28`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              margin: '0 auto 18px', fontSize: 26, color: theme.primaryColor,
                              transition: 'all 0.3s',
                            }}>
                              {step.icon}
                            </div>
                            <Text style={{ color: theme.sectionAccent, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>{step.num}</Text>
                            <Title level={4} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', marginTop: 6, marginBottom: 8, color: '#0f172a' }}>{step.title}</Title>
                            <Text style={{ color: '#64748b', fontSize: 14, lineHeight: 1.75, fontWeight: 400 }}>{step.desc}</Text>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'whyUs': {
              const featureIconList = [<SafetyOutlined />, <CustomerServiceOutlined />, <CheckCircleOutlined />, <TrophyOutlined />, <GlobalOutlined />, <HeartOutlined />];
              const whyUsFeatures = featureItems.length > 0 ? featureItems : [
                { title: t('whyUs.feature1.title'), desc: t('whyUs.feature1.desc'), color: theme.primaryColor },
                { title: t('whyUs.feature2.title'), desc: t('whyUs.feature2.desc'), color: theme.primaryColor },
                { title: t('whyUs.feature3.title'), desc: t('whyUs.feature3.desc'), color: theme.primaryColor },
                { title: t('whyUs.feature4.title'), desc: t('whyUs.feature4.desc'), color: theme.primaryColor },
                { title: t('whyUs.feature5.title'), desc: t('whyUs.feature5.desc'), color: theme.primaryColor },
                { title: t('whyUs.feature6.title'), desc: t('whyUs.feature6.desc'), color: theme.primaryColor },
              ];
              return (
                <div key="whyUs" style={{ background: '#0f172a', padding: 'clamp(56px, 8vw, 96px) 16px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-30%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${theme.primaryColor}0d 0%, transparent 70%)`, pointerEvents: 'none' }} />
                  <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                      <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: theme.sectionAccent, marginBottom: 14 }}>
                        {t('whyUs.badge')}
                        <div style={{ width: 40, height: 2, background: theme.sectionAccent, margin: '10px auto 0' }} />
                      </div>
                      <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', marginBottom: 10, marginTop: 0 }}>{t('whyUs.title', { name: fullName })}</Title>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, lineHeight: 1.7, fontWeight: 300 }}>{t('whyUs.subtitle')}</Text>
                    </div>
                    <style>{`
                      .hp-feature-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 2.5rem; transition: all 0.4s ease; }
                      .hp-feature-card:hover { background: rgba(255,255,255,0.06); border-color: ${theme.primaryColor}33; transform: translateY(-5px); box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
                      .hp-feature-icon { width: 56px; height: 56px; background: linear-gradient(135deg, ${theme.primaryColor}26, ${theme.primaryColor}0d); border: 1px solid ${theme.primaryColor}33; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: ${theme.sectionAccent}; font-size: 1.25rem; margin-bottom: 1.5rem; transition: all 0.3s; }
                      .hp-feature-card:hover .hp-feature-icon { background: linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor}); color: white; box-shadow: 0 8px 25px ${theme.primaryColor}50; border-color: transparent; }
                    `}</style>
                    <Row gutter={[20, 20]}>
                      {whyUsFeatures.map((item, i) => (
                        <Col xs={24} sm={12} md={8} key={i}>
                          <div className="hp-feature-card">
                            <div className="hp-feature-icon">
                              {featureIconList[i % featureIconList.length]}
                            </div>
                            <Title level={4} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: '#fff', marginBottom: 10, marginTop: 0, fontSize: '1.15rem' }}>{item.title}</Title>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.75, fontWeight: 300 }}>{item.desc}</Text>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            }
            case 'stats': {
              const statsData = statsItems.length > 0 ? statsItems : [
                { num: '50,000+', label: t('stats.passengers') },
                { num: '200+', label: t('stats.drivers') },
                { num: '50+', label: t('stats.zones') },
                { num: '4.9/5', label: t('stats.rating') },
              ];
              return (
                <div key="stats" style={{ background: theme.statsGradient, padding: 'clamp(48px, 6vw, 72px) 16px' }}>
                  <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <Row gutter={[24, 32]}>
                      {statsData.map((stat, i) => (
                        <Col xs={12} md={6} key={i} style={{ textAlign: 'center' }}>
                          <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: '#fff', marginBottom: 6, fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.02em' }}>{stat.num}</Title>
                          <div style={{ width: 32, height: 2, background: 'rgba(255,255,255,0.35)', margin: '0 auto 10px' }} />
                          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>{stat.label}</Text>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            }
            case 'popularRoutes': {
              const routesData = routeItems.length > 0 ? routeItems : [
                { from: 'Antalya Havalimanı', to: 'Kemer', img: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=800&auto=format&fit=crop', price: '35' },
                { from: 'İstanbul Havalimanı', to: 'Taksim', img: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=800&auto=format&fit=crop', price: '45' },
                { from: 'Dalaman Havalimanı', to: 'Fethiye', img: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?q=80&w=800&auto=format&fit=crop', price: '55' },
                { from: 'Bodrum Havalimanı', to: 'Bodrum', img: 'https://images.unsplash.com/photo-1573790389818-adb13b9d4742?q=80&w=800&auto=format&fit=crop', price: '40' },
              ];
              return (
                <div key="popularRoutes" style={{ background: '#f8fafc', padding: 'clamp(32px, 4vw, 48px) 16px' }}>
                  <style>{`
                    .hp-route-card { position: relative; border-radius: 20px; overflow: hidden; aspect-ratio: 4/5; cursor: pointer; box-shadow: 0 10px 40px rgba(0,0,0,0.08); transition: all 0.5s cubic-bezier(0.4,0,0.2,1); }
                    .hp-route-card:hover { transform: translateY(-8px); box-shadow: 0 25px 60px rgba(0,0,0,0.15); }
                    .hp-route-card img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.7s ease; }
                    .hp-route-card:hover img { transform: scale(1.08); }
                    .hp-route-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.25) 50%, transparent 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 1.75rem; }
                    .hp-route-price { position: absolute; top: 1.25rem; right: 1.25rem; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); padding: 6px 14px; border-radius: 100px; font-size: 13px; font-weight: 700; color: #0f172a; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                    .hp-route-dest { color: white; font-family: var(--font-playfair, Georgia, serif); font-size: 1.2rem; font-weight: 600; margin-bottom: 4px; }
                    .hp-route-from { color: rgba(255,255,255,0.72); font-size: 14px; display: flex; align-items: center; gap: 6px; }
                  `}</style>
                  <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                      <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#0f172a', marginBottom: 0, marginTop: 0 }}>{t('routes.title')}</Title>
                    </div>
                    <Row gutter={[20, 20]}>
                      {routesData.map((route, i) => (
                        <Col xs={12} sm={12} md={6} key={i}>
                          <div className="hp-route-card">
                            <img src={route.img && !route.img.startsWith('http') ? getImageUrl(route.img) : route.img} alt={route.to} loading="lazy" />
                            <div className="hp-route-overlay">
                              <div className="hp-route-price">{route.price} EUR {t('routes.from')}</div>
                              <div className="hp-route-dest">{route.to}</div>
                              <div className="hp-route-from">
                                <ArrowRightOutlined style={{ fontSize: 11, color: theme.sectionAccent }} />
                                {route.from}
                              </div>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            }
            case 'testimonials':
              return (
                <div key="testimonials" style={{ background: '#fff', padding: 'clamp(56px, 8vw, 96px) 16px' }}>
                  <style>{`
                    .hp-testimonial-card { background: #fff; border-radius: 20px; padding: 2.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.04); border: 1px solid #f1f5f9; transition: all 0.4s ease; position: relative; height: 100%; }
                    .hp-testimonial-card::before { content: '\\201C'; position: absolute; top: 1.5rem; right: 2rem; font-family: var(--font-playfair, Georgia, serif); font-size: 4rem; color: ${theme.sectionAccent}; opacity: 0.25; line-height: 1; pointer-events: none; }
                    .hp-testimonial-card:hover { transform: translateY(-5px); box-shadow: 0 20px 50px rgba(0,0,0,0.08); border-color: ${theme.sectionAccent}; }
                    .hp-stars { color: #fbbf24; font-size: 13px; letter-spacing: 3px; margin-bottom: 1.25rem; }
                    .hp-author-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-playfair, Georgia, serif); font-weight: 600; font-size: 1.1rem; color: white; flex-shrink: 0; }
                  `}</style>
                  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                      <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: theme.sectionAccent, marginBottom: 14 }}>
                        {t('testimonials.badge')}
                        <div style={{ width: 40, height: 2, background: theme.sectionAccent, margin: '10px auto 0' }} />
                      </div>
                      <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#0f172a', marginBottom: 0, marginTop: 0 }}>{t('testimonials.title')}</Title>
                    </div>
                    <Row gutter={[24, 24]}>
                      {(testimonialItems.length > 0 ? testimonialItems : [
                        { name: 'Ahmet Y.', text: t('testimonials.review1'), rating: 5, city: 'İstanbul' },
                        { name: 'Maria S.', text: t('testimonials.review2'), rating: 5, city: 'Berlin' },
                        { name: 'Fatma K.', text: t('testimonials.review3', { name: fullName }), rating: 5, city: 'Ankara' },
                      ]).map((review, i) => (
                        <Col xs={24} md={8} key={i}>
                          <div className="hp-testimonial-card">
                            <div className="hp-stars">{'★'.repeat(review.rating)}</div>
                            <Paragraph style={{ fontSize: 15, color: '#334155', lineHeight: 1.8, marginBottom: 24, fontWeight: 400, minHeight: 80 }}>
                              &ldquo;{review.text}&rdquo;
                            </Paragraph>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
                              <div className="hp-author-avatar" style={{ background: theme.stepCircleGradient }}>
                                {review.name.charAt(0)}
                              </div>
                              <div>
                                <Text strong style={{ display: 'block', fontSize: 14, color: '#0f172a' }}>{review.name}</Text>
                                <Text style={{ fontSize: 13, color: '#64748b' }}>{review.city}</Text>
                              </div>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'faq': {
              const faqData = faqItems.length > 0 ? faqItems : [
                { question: t('faq.q1'), answer: t('faq.a1') },
                { question: t('faq.q2'), answer: t('faq.a2') },
                { question: t('faq.q3'), answer: t('faq.a3') },
                { question: t('faq.q4'), answer: t('faq.a4') },
                { question: t('faq.q5'), answer: t('faq.a5') },
              ];
              return (
                <div key="faq" style={{ background: 'linear-gradient(to bottom, #f8fafc, #fff)', padding: 'clamp(56px, 8vw, 96px) 16px' }}>
                  <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                      <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: theme.sectionAccent, marginBottom: 14 }}>
                        {t('faq.badge')}
                        <div style={{ width: 40, height: 2, background: theme.sectionAccent, margin: '10px auto 0' }} />
                      </div>
                      <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#0f172a', marginBottom: 0, marginTop: 0 }}>{t('faq.title')}</Title>
                    </div>
                    <Collapse accordion expandIconPlacement="end"
                      style={{ background: 'transparent', border: 'none' }}
                      styles={{ header: { fontSize: 16, fontWeight: 500, color: '#0f172a', padding: '22px 0' }, body: { padding: '0 0 22px', color: '#64748b', lineHeight: 1.8, fontSize: 15 } }}
                      items={faqData.map((faq, idx) => ({
                        key: idx.toString(),
                        label: <span style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 500, color: '#0f172a', fontSize: 16 }}>{faq.question}</span>,
                        children: <span style={{ color: '#64748b', lineHeight: 1.8, fontSize: 15 }}>{faq.answer}</span>,
                        style: { borderBottom: '1px solid #e2e8f0', borderRadius: 0 }
                      }))}
                    />
                  </div>
                </div>
              );
            }
            case 'cta':
              return (
                <div key="cta" style={{ background: theme.ctaGradient, padding: 'clamp(56px, 6vw, 80px) 16px', textAlign: 'center' }}>
                  <div style={{ maxWidth: 650, margin: '0 auto' }}>
                    <Title level={2} style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: '#fff', marginBottom: 14, fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>{t('cta.title')}</Title>
                    <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 16, display: 'block', marginBottom: 32, lineHeight: 1.7, fontWeight: 300 }}>
                      {t('cta.subtitle')}
                    </Text>
                    <Button size="large" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      style={{ height: 54, padding: '0 40px', fontSize: 15, fontWeight: 600, borderRadius: 14, background: '#fff', color: theme.primaryColor, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.18)', letterSpacing: '0.02em' }}>
                      {t('cta.button')} <ArrowRightOutlined />
                    </Button>
                  </div>
                </div>
              );
            case 'bookingLookup':
              return (
                <div key="bookingLookup" style={{ background: theme.testimonialBg, padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>Rezervasyon Takip</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Rezervasyonunuzu Sorgulayın</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>Rezervasyon numaranızı ve e-posta adresinizi girerek transferinizin durumunu, atanan şoförü ve aracı öğrenin.</Text>
                    </div>
                    <Card style={{ borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.07)', border: 'none' }} styles={{ body: { padding: '32px 36px' } }}>
                      <Form
                        layout="vertical"
                        onFinish={(vals: any) => {
                          const id = String(vals.identifier || '').trim();
                          const bn = String(vals.bookingNumber || '').trim();
                          if (!bn || !id) { message.warning('Rezervasyon numarası ve e-posta / telefon gerekli'); return; }
                          const params = new URLSearchParams({ bookingNumber: bn });
                          if (id.includes('@')) params.set('email', id);
                          else params.set('phone4', id.replace(/\D/g, '').slice(-4));
                          router.push(`/track?${params.toString()}`);
                        }}
                      >
                        <Row gutter={[16, 0]}>
                          <Col xs={24} sm={10}>
                            <Form.Item name="bookingNumber" label="Rezervasyon Numarası" rules={[{ required: true, message: 'Rezervasyon numarası girin' }]}>
                              <Input size="large" placeholder="TR-20260501-1234" prefix={<CheckCircleOutlined style={{ color: '#9ca3af' }} />} allowClear />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={10}>
                            <Form.Item name="identifier" label="E-posta veya Telefon Son 4 Hanesi" rules={[{ required: true, message: 'E-posta veya telefon son 4 hanesi girin' }]}>
                              <Input size="large" placeholder="ornek@email.com veya 4567" prefix={<SearchOutlined style={{ color: '#9ca3af' }} />} allowClear />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={4} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                            <Button type="primary" htmlType="submit" size="large" icon={<ArrowRightOutlined />} block style={{ background: theme.primaryColor, borderColor: theme.primaryColor, borderRadius: 8 }}>
                              Sorgula
                            </Button>
                          </Col>
                        </Row>
                      </Form>
                    </Card>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}

        {/* ─── MODALS ─── */}
        <Modal title={t('babySeat.title')} open={babySeatModalVisible}
          onOk={() => { setBabySeatRequired(true); setBabySeatModalVisible(false); message.success(t('babySeat.added')); }}
          onCancel={() => { setBabySeatRequired(false); setBabySeatModalVisible(false); }}
          okText={t('babySeat.yes')} cancelText={t('babySeat.no')}>
          <Text>{t('babySeat.message')}</Text>
        </Modal>

        <Modal
          title={<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><CheckCircleOutlined style={{ fontSize: 24, color: theme.primaryColor }} /><span>{t('booking.title')}</span></div>}
          open={bookingModalVisible} onOk={handleBookingSubmit} confirmLoading={bookingLoading}
          onCancel={() => setBookingModalVisible(false)} okText={t('booking.submit')} cancelText={t('booking.cancel')} width={600}>
          {selectedTransfer && (
            <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('booking.selectedVehicle')}</Text>
              <Space>
                <CarOutlined style={{ color: theme.primaryColor }} />
                <Text>{selectedTransfer.vehicleType} - {selectedTransfer.vendor}</Text>
                <Text strong style={{ color: theme.primaryColor }}>&euro;{selectedTransfer.price.toFixed(2)}</Text>
              </Space>
            </div>
          )}
          <Form layout="vertical" form={form}>
            <Form.Item label={t('booking.fullName')} name="fullName" rules={[{ required: true, message: t('booking.fullNameRequired') }]}>
              <Input size="large" placeholder={t('booking.fullNamePlaceholder')} />
            </Form.Item>
            <Form.Item label={t('booking.email')} name="email" rules={[{ required: true, message: t('booking.emailRequired') }, { type: 'email', message: t('booking.emailInvalid') }]}>
              <Input size="large" placeholder={t('booking.emailPlaceholder')} />
            </Form.Item>
            <Form.Item label={t('booking.phone')} name="phone" rules={[{ required: true, message: t('booking.phoneRequired') }]}>
              <Input size="large" placeholder={t('booking.phonePlaceholder')} />
            </Form.Item>
            {selectedTransfer && (
              <>
                <Form.Item label={t('booking.flightNumber')} name="flightNumber"><Input size="large" placeholder={t('booking.flightNumberPlaceholder')} /></Form.Item>
                <Form.Item name="meetAndGreet" valuePropName="checked"><Checkbox>{t('booking.meetAndGreet')}</Checkbox></Form.Item>
              </>
            )}
            <Form.Item label={t('booking.notes')} name="notes"><Input.TextArea rows={3} placeholder={t('booking.notesPlaceholder')} /></Form.Item>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13, color: '#4f46e5' }}>Kupon Kodu</Text>
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={couponCode}
                onChange={e => { setCouponCode(e.target.value); setCouponResult(null); setCouponError(''); }}
                placeholder="SUMMER25"
                style={{ textTransform: 'uppercase' }}
                allowClear
              />
              <Button type="primary" loading={couponLoading} onClick={validateCoupon}
                style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>Uygula</Button>
            </Space.Compact>
            {couponResult && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <Text style={{ color: '#059669', fontWeight: 600 }}>
                  \u2714 {couponResult.name} \u2014 {couponResult.discount.toFixed(2)}\u20ac indirim
                </Text>
              </div>
            )}
            {couponError && (
              <div style={{ marginTop: 8 }}><Text type="danger" style={{ fontSize: 13 }}>{couponError}</Text></div>
            )}
          </Form>
        </Modal>
      </Content>

      {/* ─── FOOTER ─── */}
      <footer style={{ background: '#020617', color: '#fff', padding: 'clamp(48px, 6vw, 72px) 16px 0', position: 'relative', overflow: 'hidden' }}>
        {/* Top gradient border line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${theme.sectionAccent}55, transparent)` }} />
        <style>{`
          .hp-footer-link { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; transition: all 0.3s; display: inline-block; }
          .hp-footer-link:hover { color: ${theme.sectionAccent}; transform: translateX(4px); }
          .hp-footer-social { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.6); text-decoration: none; transition: all 0.3s; font-size: 16px; }
          .hp-footer-social:hover { background: ${theme.primaryColor}; border-color: ${theme.primaryColor}; color: white; transform: translateY(-3px); }
        `}</style>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Row gutter={[48, 40]} style={{ marginBottom: 56 }}>
            <Col xs={24} md={10}>
              <div style={{ marginBottom: 20 }}>
                {branding.logoUrl ? (
                  <img src={getImageUrl(branding.logoUrl)} alt={fullName} style={{ maxHeight: 38, maxWidth: 180, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 26, fontWeight: 700 }}>
                    <span style={{ color: theme.sectionAccent }}>{branding.siteNameHighlight}</span>
                    <span style={{ color: '#fff' }}>{branding.siteName}</span>
                  </span>
                )}
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.8, display: 'block', marginBottom: 20, fontWeight: 300 }}>
                {branding.slogan}. {t('footer.available')}
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Space size={8}><PhoneOutlined style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }} /><Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>{branding.phone}</Text></Space>
                <Space size={8}><MailOutlined style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }} /><Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>{branding.email}</Text></Space>
              </div>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Text strong style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 20 }}>{t('footer.quickLinks')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a href="/" className="hp-footer-link">{t('footer.home')}</a>
                <a href="/sayfa/hakkimizda" className="hp-footer-link">{t('footer.about')}</a>
                <a href="/contact" className="hp-footer-link">{t('footer.contact')}</a>
                <a href="/sayfa/seyahat-rehberi" className="hp-footer-link">{t('footer.travelGuide')}</a>
              </div>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Text strong style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 20 }}>{t('footer.legal')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a href="/sayfa/gizlilik-politikasi" className="hp-footer-link">{t('footer.privacy')}</a>
                <a href="/sayfa/kullanim-kosullari" className="hp-footer-link">{t('footer.terms')}</a>
                <a href="/sayfa/iptal-iade-politikasi" className="hp-footer-link">{t('footer.refund')}</a>
              </div>
            </Col>
            <Col xs={24} sm={8} md={5}>
              <Text strong style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 20 }}>{t('footer.services')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span className="hp-footer-link">{t('footer.vipTransfer')}</span>
                <span className="hp-footer-link">{t('footer.airportTransfer')}</span>
                <span className="hp-footer-link">{t('footer.intercityTransfer')}</span>
                <span className="hp-footer-link">{t('footer.groupTransfer')}</span>
              </div>
            </Col>
          </Row>
          {/* TÜRSAB Badge */}
          {tursab.enabled && tursab.belgeNo && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '20px 0' }}>
              <a
                href={tursab.verificationUrl || 'https://www.tursab.org.tr/tr/dds'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 10, padding: '10px 18px', textDecoration: 'none', transition: 'all 0.3s', border: '2px solid #e5e7eb' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900, fontSize: 16, color: '#dc2626', letterSpacing: 2, lineHeight: 1 }}>TÜRSAB</span>
                  <span style={{ fontSize: 7, color: '#666', fontWeight: 600, letterSpacing: 0.5, marginTop: 2 }}>DİJİTAL DOĞRULAMA</span>
                </div>
                <div style={{ width: 1, height: 32, background: '#e5e7eb' }} />
                <div>
                  <div style={{ fontSize: 10, color: '#888' }}>Belge No</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{tursab.belgeNo}</div>
                </div>
              </a>
            </div>
          )}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '20px 0 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.32)', fontSize: 13 }}>&copy; {new Date().getFullYear()} {branding.companyName}. {t('footer.rights')}</Text>
            <div style={{ display: 'flex', gap: 10 }}>
              {socialMedia.facebook && <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><FacebookOutlined /></a>}
              {socialMedia.instagram && <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><InstagramOutlined /></a>}
              {socialMedia.twitter && <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><TwitterOutlined /></a>}
              {socialMedia.youtube && <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><YoutubeOutlined /></a>}
              {socialMedia.linkedin && <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><LinkedinOutlined /></a>}
              {socialMedia.whatsapp && <a href={socialMedia.whatsapp} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><WhatsAppOutlined /></a>}
              {socialMedia.telegram && <a href={socialMedia.telegram} target="_blank" rel="noopener noreferrer" className="hp-footer-social"><SendOutlined /></a>}
              {!Object.values(socialMedia).some(v => v) && (
                <>
                  <a href="#" className="hp-footer-social"><FacebookOutlined /></a>
                  <a href="#" className="hp-footer-social"><InstagramOutlined /></a>
                  <a href="#" className="hp-footer-social"><TwitterOutlined /></a>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
    </Layout>
  );
};

export default HomePage;
