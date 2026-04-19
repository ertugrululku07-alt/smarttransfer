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
  Divider
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
  SendOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';

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
import HereLocationSearchInput from './components/HereLocationSearchInput';
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

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();

const HomePage: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { branding, fullName } = useBranding();
  const { t } = useLanguage();

  const [configLoading, setConfigLoading] = useState(true);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [googleMapsSettings, setGoogleMapsSettings] = useState<{ country?: string }>({});
  const [heroBackground, setHeroBackground] = useState<{ type: 'image' | 'video', videoUrl: string }>({ type: 'image', videoUrl: '' });
  const [homepageSections, setHomepageSections] = useState<string[]>(['howItWorks', 'whyUs', 'stats', 'popularRoutes', 'testimonials', 'faq', 'cta']);

  // Dynamic homepage content from tenant settings
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([]);
  const [statsItems, setStatsItems] = useState<{ num: string; label: string }[]>([]);
  const [routeItems, setRouteItems] = useState<{ from: string; to: string; img: string; price: string }[]>([]);
  const [socialMedia, setSocialMedia] = useState<Record<string, string>>({});
  const [featureItems, setFeatureItems] = useState<{ title: string; desc: string; color: string }[]>([]);

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
  const [mapModalType, setMapModalType] = useState<'pickup' | 'dropoff'>('pickup');

  // Search & Booking
  const [searchLoading, setSearchLoading] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferOption | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [imagesRes, infoRes] = await Promise.all([
          axios.get(`${API_BASE}/api/tenant/hero-images`),
          axios.get(`${API_BASE}/api/tenant/info`)
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
    if (mapModalType === 'pickup') {
      setPickup(address);
      setPickupLocation({ lat, lng });
    } else {
      setDropoff(address);
      setDropoffLocation({ lat, lng });
    }
  };

  const isAirportTransfer = isAirportLocation(pickup) || isAirportLocation(dropoff);
  const timeLabel = isAirportTransfer ? t('search.flightTime') : t('search.pickupTime');

  // For return trip, the direction is reversed: pickup becomes dropoff and vice versa
  const isReturnAirportTransfer = isAirportLocation(dropoff) || isAirportLocation(pickup);
  const returnTimeLabel = isReturnAirportTransfer ? t('search.returnFlightTime') : t('search.returnPickupTime');

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
        };
        const res = await axios.post(`${API_BASE}/api/bookings`, payload);
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

  // ─── TRANSFER SEARCH FORM ───
  const transferSearchForm = (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            <EnvironmentOutlined style={{ color: theme.primaryColor }} /> {t('search.from')}
          </Text>
          <HereLocationSearchInput
            size="large"
            placeholder={t('search.fromPlaceholder')}
            value={pickup}
            onChange={setPickup}
            onSelect={(val, lat, lng) => { setPickup(val); if (lat && lng) setPickupLocation({ lat, lng }); }}
            onMapClick={() => openMapModal('pickup')}
            country={googleMapsSettings.country || 'TUR'}
            style={{ borderRadius: 12 }}
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            <EnvironmentOutlined style={{ color: theme.accentColor }} /> {t('search.to')}
          </Text>
          <HereLocationSearchInput
            size="large"
            placeholder={t('search.toPlaceholder')}
            value={dropoff}
            onChange={setDropoff}
            onSelect={(val, lat, lng) => { setDropoff(val); if (lat && lng) setDropoffLocation({ lat, lng }); }}
            onMapClick={() => openMapModal('dropoff')}
            country={googleMapsSettings.country || 'TUR'}
            style={{ borderRadius: 12 }}
          />
        </Col>
      </Row>
      <Row gutter={[12, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            <CalendarOutlined style={{ color: theme.primaryColor }} /> {t('search.date')}
          </Text>
          <DatePicker
            size="large"
            style={{ width: '100%', borderRadius: 12 }}
            format="DD.MM.YYYY"
            placeholder={t('search.datePlaceholder')}
            value={pickupDate}
            onChange={(date) => setPickupDate(date)}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
          />
        </Col>
        <Col xs={12} md={5}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            <ClockCircleOutlined style={{ color: theme.primaryColor }} />{' '}
            <span style={{ transition: 'all 0.3s' }}>{timeLabel}</span>
          </Text>
          <TimePicker
            size="large"
            style={{ width: '100%', borderRadius: 12 }}
            format="HH:mm"
            minuteStep={5}
            value={pickupTime}
            onChange={(time) => setPickupTime(time)}
            placeholder={t('search.timePlaceholder')}
            needConfirm={false}
            showNow={false}
          />
        </Col>
        <Col xs={12} md={5}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            {t('search.passengers')}
          </Text>
          <PassengerSelector
            size="large"
            value={passengerCounts}
            onChange={(counts) => { setPassengerCounts(counts); setPassengers(counts.adults + counts.children + counts.babies); }}
          />
        </Col>
        <Col xs={12} md={8}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            {t('search.transferType')}
          </Text>
          <Radio.Group value={tripType} onChange={(e) => setTripType(e.target.value)} style={{ width: '100%' }} size="large">
            <Radio.Button value="oneway" style={{ width: '50%', textAlign: 'center', borderRadius: '12px 0 0 12px' }}>{t('search.oneWay')}</Radio.Button>
            <Radio.Button value="return" style={{ width: '50%', textAlign: 'center', borderRadius: '0 12px 12px 0' }}>{t('search.roundTrip')}</Radio.Button>
          </Radio.Group>
        </Col>
      </Row>
      {tripType === 'return' && (
        <Row gutter={[12, 16]} style={{ marginTop: 16 }}>
          <Col xs={12} md={8}>
            <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
              <CalendarOutlined style={{ color: theme.accentColor }} /> {t('search.returnDate')}
            </Text>
            <DatePicker
              size="large"
              style={{ width: '100%', borderRadius: 12 }}
              format="DD.MM.YYYY"
              placeholder={t('search.returnDatePlaceholder')}
              value={returnDate}
              onChange={(date) => setReturnDate(date)}
              disabledDate={(current) => {
                if (!pickupDate) return current && current < dayjs().startOf('day');
                return current && current < pickupDate.startOf('day');
              }}
            />
          </Col>
          <Col xs={12} md={8}>
            <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
              <ClockCircleOutlined style={{ color: theme.accentColor }} />{' '}
              <span style={{ transition: 'all 0.3s' }}>{returnTimeLabel}</span>
            </Text>
            <TimePicker
              size="large"
              style={{ width: '100%', borderRadius: 12 }}
              format="HH:mm"
              minuteStep={5}
              value={returnTime}
              onChange={(time) => setReturnTime(time)}
              placeholder={t('search.returnTimePlaceholder')}
              needConfirm={false}
              showNow={false}
            />
          </Col>
        </Row>
      )}
      <Button
        type="primary" block size="large" icon={<SearchOutlined />}
        onClick={handleTransferSearch} loading={searchLoading}
        style={{
          marginTop: 24, height: 54, fontSize: 17, fontWeight: 700,
          background: theme.buttonGradient, border: 'none',
          boxShadow: theme.buttonShadow, borderRadius: 14, color: '#fff', letterSpacing: 0.5,
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
      zIndex: 10, padding: '0 16px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 700 }}>
        {theme.decorationEmoji && (
          <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>{theme.decorationEmoji}</span>
        )}
        <Title level={1} style={{
          color: '#fff', fontSize: 'clamp(1.8rem, 5vw, 3.2rem)', marginBottom: 12,
          fontWeight: 800, textShadow: '0 4px 20px rgba(0,0,0,0.5)', letterSpacing: 0.5, lineHeight: 1.2,
        }}>
          {theme.heroTitle}
        </Title>
        <Text style={{
          color: 'rgba(255,255,255,0.9)', fontSize: 'clamp(0.95rem, 2vw, 1.2rem)',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)', fontWeight: 400, display: 'block',
        }}>
          {theme.heroSubtitle}
        </Text>
      </div>
      <div style={{
        width: '100%', maxWidth: 960,
        background: theme.searchCardBg, backdropFilter: 'blur(20px)',
        borderRadius: 20, border: theme.searchCardBorder,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: 'clamp(20px, 3vw, 32px)',
      }}>
        {transferSearchForm}
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <MapPickerModal
        visible={mapModalVisible}
        onCancel={() => setMapModalVisible(false)}
        onConfirm={handleMapConfirm}
        initialAddress={mapModalType === 'pickup' ? pickup : dropoff}
        title={mapModalType === 'pickup' ? t('map.pickupTitle') : t('map.dropoffTitle')}
        country={googleMapsSettings.country || 'tr'}
        key={`map-modal-${googleMapsSettings.country || 'tr'}`}
      />
      <TopBar />

      <Content>
        {/* ─── HERO ─── */}
        {heroBackground.type === 'video' && heroBackground.videoUrl ? (
          <div style={{ position: 'relative', minHeight: 'clamp(600px, 85vh, 800px)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
              <iframe
                width="100%" height="100%"
                src={`https://www.youtube.com/embed/${heroBackground.videoUrl}?autoplay=1&mute=1&controls=0&loop=1&playlist=${heroBackground.videoUrl}&showinfo=0&rel=0&iv_load_policy=3&disablekb=1&vq=hd1080`}
                title="Background Video" frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                style={{ width: '100vw', height: '56.25vw', minHeight: '100%', minWidth: '177.77vh', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}
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
                    backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center',
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
                <div key="howItWorks" style={{ background: '#fff', padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>{t('howItWorks.badge')}</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>{t('howItWorks.title')}</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>{t('howItWorks.subtitle')}</Text>
                    </div>
                    <Row gutter={[32, 32]}>
                      {[
                        { icon: <SearchOutlined />, num: '01', title: t('howItWorks.step1.title'), desc: t('howItWorks.step1.desc') },
                        { icon: <CarOutlined />, num: '02', title: t('howItWorks.step2.title'), desc: t('howItWorks.step2.desc') },
                        { icon: <CheckCircleOutlined />, num: '03', title: t('howItWorks.step3.title'), desc: t('howItWorks.step3.desc') },
                      ].map((step, i) => (
                        <Col xs={24} sm={8} key={i}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{
                              width: 72, height: 72, borderRadius: '50%', background: theme.stepCircleGradient,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              margin: '0 auto 16px', fontSize: 28, color: '#fff',
                              boxShadow: `0 8px 24px ${theme.primaryColor}40`,
                            }}>
                              {step.icon}
                            </div>
                            <Text style={{ color: theme.sectionAccent, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>{step.num}</Text>
                            <Title level={4} style={{ marginTop: 4, marginBottom: 6 }}>{step.title}</Title>
                            <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>{step.desc}</Text>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'whyUs':
              const whyUsFeatures = featureItems.length > 0 ? featureItems : [
                { title: t('whyUs.feature1.title'), desc: t('whyUs.feature1.desc'), color: theme.primaryColor },
                { title: t('whyUs.feature2.title'), desc: t('whyUs.feature2.desc'), color: '#00b96b' },
                { title: t('whyUs.feature3.title'), desc: t('whyUs.feature3.desc'), color: '#faad14' },
                { title: t('whyUs.feature4.title'), desc: t('whyUs.feature4.desc'), color: theme.accentColor },
                { title: t('whyUs.feature5.title'), desc: t('whyUs.feature5.desc'), color: '#13c2c2' },
                { title: t('whyUs.feature6.title'), desc: t('whyUs.feature6.desc'), color: '#eb2f96' },
              ];
              return (
                <div key="whyUs" style={{ background: theme.featureBg, padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>{t('whyUs.badge')}</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>{t('whyUs.title', { name: fullName })}</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>{t('whyUs.subtitle')}</Text>
                    </div>
                    <Row gutter={[20, 20]}>
                      {whyUsFeatures.map((item, i) => (
                        <Col xs={24} sm={12} md={8} key={i}>
                          <Card hoverable style={{ height: '100%', borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }} styles={{ body: { padding: 24 } }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: `${item.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, color: item.color }}>
                              <SafetyOutlined style={{ fontSize: 32 }} />
                            </div>
                            <Title level={5} style={{ marginBottom: 6 }}>{item.title}</Title>
                            <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>{item.desc}</Text>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'stats':
              const statsData = statsItems.length > 0 ? statsItems : [
                { num: '50,000+', label: t('stats.passengers') },
                { num: '200+', label: t('stats.drivers') },
                { num: '50+', label: t('stats.zones') },
                { num: '4.9/5', label: t('stats.rating') },
              ];
              return (
                <div key="stats" style={{ background: theme.statsGradient, padding: 'clamp(40px, 6vw, 64px) 16px' }}>
                  <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <Row gutter={[24, 24]}>
                      {statsData.map((stat, i) => (
                        <Col xs={12} md={6} key={i} style={{ textAlign: 'center' }}>
                          <Title level={2} style={{ color: '#fff', marginBottom: 4, fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>{stat.num}</Title>
                          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{stat.label}</Text>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'popularRoutes':
              const routesData = routeItems.length > 0 ? routeItems : [
                { from: 'Antalya Havalimanı', to: 'Kemer', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=250&fit=crop', price: '35' },
                { from: 'İstanbul Havalimanı', to: 'Taksim', img: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=400&h=250&fit=crop', price: '45' },
                { from: 'Dalaman Havalimanı', to: 'Fethiye', img: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=400&h=250&fit=crop', price: '55' },
                { from: 'Bodrum Havalimanı', to: 'Bodrum', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=250&fit=crop', price: '40' },
              ];
              return (
                <div key="popularRoutes" style={{ background: '#fff', padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>{t('routes.badge')}</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>{t('routes.title')}</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>{t('routes.subtitle')}</Text>
                    </div>
                    <Row gutter={[16, 16]}>
                      {routesData.map((route, i) => (
                        <Col xs={12} sm={12} md={6} key={i}>
                          <Card hoverable style={{ borderRadius: 16, overflow: 'hidden', border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }} styles={{ body: { padding: 14 } }}
                            cover={
                              <div style={{ height: 'clamp(120px, 18vw, 160px)', backgroundImage: `url(${route.img})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                                <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '3px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
                                  {route.price} EUR {t('routes.from')}
                                </div>
                              </div>
                            }
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <EnvironmentOutlined style={{ color: theme.primaryColor }} />
                              <Text strong style={{ fontSize: 12 }}>{route.from}</Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
                              <SwapOutlined style={{ color: '#00b96b' }} />
                              <Text style={{ fontSize: 12 }}>{route.to}</Text>
                            </div>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'testimonials':
              return (
                <div key="testimonials" style={{ background: theme.testimonialBg, padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>{t('testimonials.badge')}</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>{t('testimonials.title')}</Title>
                    </div>
                    <Row gutter={[20, 20]}>
                      {[
                        { name: 'Ahmet Y.', text: t('testimonials.review1'), rating: 5, city: 'İstanbul' },
                        { name: 'Maria S.', text: t('testimonials.review2'), rating: 5, city: 'Berlin' },
                        { name: 'Fatma K.', text: t('testimonials.review3', { name: fullName }), rating: 5, city: 'Ankara' },
                      ].map((review, i) => (
                        <Col xs={24} md={8} key={i}>
                          <Card style={{ height: '100%', borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }} styles={{ body: { padding: 24 } }}>
                            <Rate disabled defaultValue={review.rating} style={{ fontSize: 14, marginBottom: 14 }} />
                            <Paragraph style={{ fontSize: 13, color: '#555', lineHeight: 1.7, minHeight: 70 }}>
                              &ldquo;{review.text}&rdquo;
                            </Paragraph>
                            <Divider style={{ margin: '14px 0' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '50%', background: theme.stepCircleGradient,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15,
                              }}>
                                {review.name.charAt(0)}
                              </div>
                              <div>
                                <Text strong style={{ display: 'block', fontSize: 13 }}>{review.name}</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>{review.city}</Text>
                              </div>
                            </div>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </div>
              );
            case 'faq':
              const faqData = faqItems.length > 0 ? faqItems : [
                { question: t('faq.q1'), answer: t('faq.a1') },
                { question: t('faq.q2'), answer: t('faq.a2') },
                { question: t('faq.q3'), answer: t('faq.a3') },
                { question: t('faq.q4'), answer: t('faq.a4') },
                { question: t('faq.q5'), answer: t('faq.a5') },
              ];
              return (
                <div key="faq" style={{ background: '#fff', padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 750, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>{t('faq.badge')}</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>{t('faq.title')}</Title>
                    </div>
                    <Collapse accordion expandIconPlacement="end" style={{ background: 'transparent', border: 'none' }}
                      items={faqData.map((faq, idx) => ({
                        key: idx.toString(),
                        label: <Text strong>{faq.question}</Text>,
                        children: <Text type="secondary">{faq.answer}</Text>
                      }))}
                    />
                  </div>
                </div>
              );
            case 'cta':
              return (
                <div key="cta" style={{ background: theme.ctaGradient, padding: 'clamp(40px, 6vw, 64px) 16px', textAlign: 'center' }}>
                  <div style={{ maxWidth: 650, margin: '0 auto' }}>
                    <Title level={2} style={{ color: '#fff', marginBottom: 10 }}>{t('cta.title')}</Title>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, display: 'block', marginBottom: 28 }}>
                      {t('cta.subtitle')}
                    </Text>
                    <Button size="large" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      style={{ height: 50, padding: '0 36px', fontSize: 15, fontWeight: 600, borderRadius: 12, background: '#fff', color: theme.primaryColor, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                      {t('cta.button')} <ArrowRightOutlined />
                    </Button>
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
          </Form>
        </Modal>
      </Content>

      {/* ─── FOOTER ─── */}
      <footer style={{ background: theme.footerBg, color: '#fff', padding: 'clamp(40px, 6vw, 64px) 16px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Row gutter={[32, 32]}>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 14 }}>
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={fullName} style={{ maxHeight: 36, maxWidth: 160, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
                ) : (
                  <>
                    <span style={{ color: theme.primaryColor, fontWeight: 800, fontSize: 22 }}>{branding.siteNameHighlight}</span>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 22 }}>{branding.siteName}</span>
                  </>
                )}
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.7, display: 'block', marginBottom: 16 }}>
                {branding.slogan}. {t('footer.available')}
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Space size="small"><PhoneOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} /><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{branding.phone}</Text></Space>
                <Space size="small"><MailOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} /><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{branding.email}</Text></Space>
              </div>
            </Col>
            <Col xs={12} md={5}>
              <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>{t('footer.quickLinks')}</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.home')}</a>
                <a href="/sayfa/hakkimizda" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.about')}</a>
                <a href="/sayfa/iletisim" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.contact')}</a>
                <a href="/sayfa/seyahat-rehberi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.travelGuide')}</a>
              </div>
            </Col>
            <Col xs={12} md={5}>
              <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>{t('footer.legal')}</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href="/sayfa/gizlilik-politikasi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.privacy')}</a>
                <a href="/sayfa/kullanim-kosullari" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.terms')}</a>
                <a href="/sayfa/iptal-iade-politikasi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.refund')}</a>
              </div>
            </Col>
            <Col xs={24} md={6}>
              <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>{t('footer.services')}</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.vipTransfer')}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.airportTransfer')}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.intercityTransfer')}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.groupTransfer')}</span>
              </div>
            </Col>
          </Row>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 36, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>&copy; {new Date().getFullYear()} {branding.companyName}. {t('footer.rights')}</Text>
            <Space size={12}>
              {socialMedia.facebook && <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><FacebookOutlined /></a>}
              {socialMedia.instagram && <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><InstagramOutlined /></a>}
              {socialMedia.twitter && <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><TwitterOutlined /></a>}
              {socialMedia.youtube && <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><YoutubeOutlined /></a>}
              {socialMedia.linkedin && <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><LinkedinOutlined /></a>}
              {socialMedia.whatsapp && <a href={socialMedia.whatsapp} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><WhatsAppOutlined /></a>}
              {socialMedia.telegram && <a href={socialMedia.telegram} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, transition: 'color 0.2s' }}><SendOutlined /></a>}
              {!Object.values(socialMedia).some(v => v) && (
                <>
                  <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18 }}><FacebookOutlined /></a>
                  <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18 }}><InstagramOutlined /></a>
                  <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18 }}><TwitterOutlined /></a>
                </>
              )}
            </Space>
          </div>
        </div>
      </footer>
    </Layout>
  );
};

export default HomePage;
