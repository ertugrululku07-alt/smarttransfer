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
  SwapOutlined
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

  const [configLoading, setConfigLoading] = useState(true);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [googleMapsSettings, setGoogleMapsSettings] = useState<{ country?: string }>({});
  const [heroBackground, setHeroBackground] = useState<{ type: 'image' | 'video', videoUrl: string }>({ type: 'image', videoUrl: '' });
  const [homepageSections, setHomepageSections] = useState<string[]>(['howItWorks', 'whyUs', 'stats', 'popularRoutes', 'testimonials', 'faq', 'cta']);

  // Dynamic homepage content from tenant settings
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([]);
  const [statsItems, setStatsItems] = useState<{ num: string; label: string }[]>([]);
  const [routeItems, setRouteItems] = useState<{ from: string; to: string; img: string; price: string }[]>([]);
  const [featureItems, setFeatureItems] = useState<{ title: string; desc: string; color: string }[]>([]);

  // Transfer state
  const [pickup, setPickup] = useState('');
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupDate, setPickupDate] = useState<Dayjs | null>(null);
  const [pickupTime, setPickupTime] = useState<Dayjs | null>(dayjs().hour(12).minute(0).second(0));
  const [returnDate, setReturnDate] = useState<Dayjs | null>(null);
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
  const timeLabel = isAirportTransfer ? 'Uçuş Saati' : 'Alınış Saati';

  const handleTransferSearch = () => {
    if (!pickup || !dropoff || !pickupDate) {
      message.warning('Lütfen nereden, nereye ve tarihi doldurun.');
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
    params.set('type', tripType === 'return' ? 'ROUND_TRIP' : 'ONE_WAY');
    if (tripType === 'return' && returnDate) {
      params.set('returnDate', returnDate.format('YYYY-MM-DD'));
    }
    if (pickupLocation) {
      params.set('pickupLat', pickupLocation.lat.toString());
      params.set('pickupLng', pickupLocation.lng.toString());
    }
    router.push(`/transfer/search?${params.toString()}`);
  };

  const handleBookingSubmit = async () => {
    try {
      const values = await form.validateFields();
      setBookingLoading(true);
      if (selectedTransfer) {
        if (!pickupDate) { message.error('Alış tarihi bulunamadı.'); return; }
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
          message.success('Rezervasyon başarıyla oluşturuldu!');
          setBookingModalVisible(false);
        } else {
          message.error(res.data?.message || 'Rezervasyon sırasında bir hata oluştu.');
        }
      }
    } catch (err: any) {
      console.error('handleBookingSubmit error:', err);
      message.error('Rezervasyon sırasında bir hata oluştu.');
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
            <EnvironmentOutlined style={{ color: theme.primaryColor }} /> Nereden
          </Text>
          <HereLocationSearchInput
            size="large"
            placeholder="Havaalanı, Adres, Otel yada Yer İsmi"
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
            <EnvironmentOutlined style={{ color: theme.accentColor }} /> Nereye
          </Text>
          <HereLocationSearchInput
            size="large"
            placeholder="Havaalanı, Adres, Otel yada Yer İsmi"
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
            <CalendarOutlined style={{ color: theme.primaryColor }} /> Tarih
          </Text>
          <DatePicker
            size="large"
            style={{ width: '100%', borderRadius: 12 }}
            format="DD.MM.YYYY"
            placeholder="Tarih seçin"
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
            placeholder="Saat seçin"
            needConfirm={false}
            showNow={false}
          />
        </Col>
        <Col xs={12} md={5}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            Yolcular
          </Text>
          <PassengerSelector
            size="large"
            value={passengerCounts}
            onChange={(counts) => { setPassengerCounts(counts); setPassengers(counts.adults + counts.children + counts.babies); }}
          />
        </Col>
        <Col xs={12} md={8}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: theme.labelColor, fontSize: 14 }}>
            Transfer Tipi
          </Text>
          <Radio.Group value={tripType} onChange={(e) => setTripType(e.target.value)} style={{ width: '100%' }} size="large">
            <Radio.Button value="oneway" style={{ width: '50%', textAlign: 'center', borderRadius: '12px 0 0 12px' }}>Tek Yön</Radio.Button>
            <Radio.Button value="return" style={{ width: '50%', textAlign: 'center', borderRadius: '0 12px 12px 0' }}>Gidiş-Dönüş</Radio.Button>
          </Radio.Group>
        </Col>
      </Row>
      <Button
        type="primary" block size="large" icon={<SearchOutlined />}
        onClick={handleTransferSearch} loading={searchLoading}
        style={{
          marginTop: 24, height: 54, fontSize: 17, fontWeight: 700,
          background: theme.buttonGradient, border: 'none',
          boxShadow: theme.buttonShadow, borderRadius: 14, color: '#fff', letterSpacing: 0.5,
        }}
      >
        Transfer Ara
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
        title={mapModalType === 'pickup' ? "Nereden Alınacaksınız?" : "Nereye Gideceksiniz?"}
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
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>Basit ve Hızlı</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Nasıl Çalışır?</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>3 kolay adımda transferinizi ayarlayın</Text>
                    </div>
                    <Row gutter={[32, 32]}>
                      {[
                        { icon: <SearchOutlined />, num: '01', title: 'Arama Yapın', desc: 'Alış ve bırakış noktanızı, tarih ve saatinizi girin.' },
                        { icon: <CarOutlined />, num: '02', title: 'Aracınızı Seçin', desc: 'Size uygun araç tipini ve fiyatı seçin.' },
                        { icon: <CheckCircleOutlined />, num: '03', title: 'Rezervasyon Yapın', desc: 'Bilgilerinizi girin ve anında onay alın.' },
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
                { title: 'Güvenilir Hizmet', desc: 'Lisanslı şoförler, sigortalı araçlar ve güvenli yolculuk garantisi.', color: theme.primaryColor },
                { title: '7/24 Müşteri Desteği', desc: 'Gece gündüz demeden ulaşabileceğiniz destek ekibi.', color: '#00b96b' },
                { title: 'Anında Onay', desc: 'Rezervasyonunuz anında onaylanır, bekleme yok.', color: '#faad14' },
                { title: 'Premium Araçlar', desc: 'Konforlu, bakımlı ve lüks araç filosu.', color: theme.accentColor },
                { title: 'Geniş Kapsama Alanı', desc: 'Havalimanı, otel ve şehirler arası geniş hizmet ağı.', color: '#13c2c2' },
                { title: 'Müşteri Memnuniyeti', desc: 'Yüksek müşteri memnuniyeti ile kaliteli hizmet.', color: '#eb2f96' },
              ];
              return (
                <div key="whyUs" style={{ background: theme.featureBg, padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>Avantajlarımız</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Neden {fullName}?</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>Binlerce müşterinin güvenle tercih ettiği platform</Text>
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
                { num: '50,000+', label: 'Mutlu Yolcu' },
                { num: '200+', label: 'Profesyonel Şoför' },
                { num: '50+', label: 'Hizmet Bölgesi' },
                { num: '4.9/5', label: 'Müşteri Puanı' },
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
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>En Çok Tercih Edilen</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Popüler Rotalar</Title>
                      <Text type="secondary" style={{ fontSize: 15 }}>Müşterilerimizin en çok tercih ettiği transfer güzergahları</Text>
                    </div>
                    <Row gutter={[16, 16]}>
                      {routesData.map((route, i) => (
                        <Col xs={12} sm={12} md={6} key={i}>
                          <Card hoverable style={{ borderRadius: 16, overflow: 'hidden', border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }} styles={{ body: { padding: 14 } }}
                            cover={
                              <div style={{ height: 'clamp(120px, 18vw, 160px)', backgroundImage: `url(${route.img})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                                <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '3px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
                                  {route.price} EUR&apos;dan
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
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>Yorumlar</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Müşterilerimiz Ne Diyor?</Title>
                    </div>
                    <Row gutter={[20, 20]}>
                      {[
                        { name: 'Ahmet Y.', text: 'Antalya havalimanından otelimize çok rahat bir yolculuk yaptık. Şoför çok nazik ve profesyoneldi.', rating: 5, city: 'İstanbul' },
                        { name: 'Maria S.', text: 'Very professional service! The car was clean and driver was on time. Highly recommended.', rating: 5, city: 'Berlin' },
                        { name: 'Fatma K.', text: `Ailecek transfer hizmetini kullandık, bebek koltuğu bile hazırdı. Teşekkürler ${fullName}!`, rating: 5, city: 'Ankara' },
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
                { question: 'Rezervasyonumu nasıl iptal edebilirim?', answer: 'Rezervasyonunuzu transfer saatinizden 24 saat öncesine kadar ücretsiz olarak iptal edebilirsiniz.' },
                { question: 'Ödeme nasıl yapılır?', answer: 'Kredi kartı, banka kartı veya nakit ödeme seçeneklerimiz mevcuttur.' },
                { question: 'Bebek koltuğu temin edebilir misiniz?', answer: 'Evet, rezervasyon sırasında bebek koltuğu talebinizi belirtmeniz yeterlidir.' },
                { question: 'Uçuşum gecikirse ne olur?', answer: 'Uçuş bilgilerinizi takip ediyoruz. Gecikme durumunda şoförünüz sizi bekler.' },
                { question: 'Havalimanında beni nasıl bulacaklar?', answer: 'Şoförünüz isminizin yazılı olduğu tabela ile çıkış kapısında sizi karşılayacaktır.' },
              ];
              return (
                <div key="faq" style={{ background: '#fff', padding: 'clamp(48px, 8vw, 80px) 16px' }}>
                  <div style={{ maxWidth: 750, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                      <Text style={{ color: theme.sectionAccent, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 2 }}>SSS</Text>
                      <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Sıkça Sorulan Sorular</Title>
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
                    <Title level={2} style={{ color: '#fff', marginBottom: 10 }}>Hemen Rezervasyon Yapın</Title>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, display: 'block', marginBottom: 28 }}>
                      Güvenli, konforlu ve uygun fiyatlı transfer hizmeti için hemen arama yapın.
                    </Text>
                    <Button size="large" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      style={{ height: 50, padding: '0 36px', fontSize: 15, fontWeight: 600, borderRadius: 12, background: '#fff', color: theme.primaryColor, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                      Transfer Ara <ArrowRightOutlined />
                    </Button>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}

        {/* ─── MODALS ─── */}
        <Modal title="Bebek Koltuğu Gerekli mi?" open={babySeatModalVisible}
          onOk={() => { setBabySeatRequired(true); setBabySeatModalVisible(false); message.success('Bebek koltuğu eklendi.'); }}
          onCancel={() => { setBabySeatRequired(false); setBabySeatModalVisible(false); }}
          okText="Evet, Gerekli" cancelText="Hayır">
          <Text>0-2 yaş arası çocuğunuz için bebek koltuğu eklemek ister misiniz?</Text>
        </Modal>

        <Modal
          title={<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><CheckCircleOutlined style={{ fontSize: 24, color: theme.primaryColor }} /><span>Rezervasyon Bilgileri</span></div>}
          open={bookingModalVisible} onOk={handleBookingSubmit} confirmLoading={bookingLoading}
          onCancel={() => setBookingModalVisible(false)} okText="Rezervasyonu Tamamla" cancelText="İptal" width={600}>
          {selectedTransfer && (
            <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Seçilen Araç:</Text>
              <Space>
                <CarOutlined style={{ color: theme.primaryColor }} />
                <Text>{selectedTransfer.vehicleType} - {selectedTransfer.vendor}</Text>
                <Text strong style={{ color: theme.primaryColor }}>&euro;{selectedTransfer.price.toFixed(2)}</Text>
              </Space>
            </div>
          )}
          <Form layout="vertical" form={form}>
            <Form.Item label="Ad Soyad" name="fullName" rules={[{ required: true, message: 'Lütfen ad soyad girin' }]}>
              <Input size="large" placeholder="Ad Soyad" />
            </Form.Item>
            <Form.Item label="E-posta" name="email" rules={[{ required: true, message: 'Lütfen e-posta girin' }, { type: 'email', message: 'Geçerli bir e-posta girin' }]}>
              <Input size="large" placeholder="ornek@mail.com" />
            </Form.Item>
            <Form.Item label="Telefon" name="phone" rules={[{ required: true, message: 'Lütfen telefon numarası girin' }]}>
              <Input size="large" placeholder="+90..." />
            </Form.Item>
            {selectedTransfer && (
              <>
                <Form.Item label="Uçuş Numarası" name="flightNumber"><Input size="large" placeholder="Örn: TK1234" /></Form.Item>
                <Form.Item name="meetAndGreet" valuePropName="checked"><Checkbox>Karşılama hizmeti (Meet &amp; Greet) istiyorum</Checkbox></Form.Item>
              </>
            )}
            <Form.Item label="Notlar" name="notes"><Input.TextArea rows={3} placeholder="İletmek istediğiniz ek notlar" /></Form.Item>
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
                {branding.slogan}. 7/24 hizmetinizdeyiz.
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Space size="small"><PhoneOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} /><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{branding.phone}</Text></Space>
                <Space size="small"><MailOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} /><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{branding.email}</Text></Space>
              </div>
            </Col>
            <Col xs={12} md={5}>
              <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>Hızlı Linkler</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>Ana Sayfa</a>
                <a href="/sayfa/hakkimizda" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>Hakkımızda</a>
                <a href="/sayfa/iletisim" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>Bize Ulaşın</a>
                <a href="/sayfa/seyahat-rehberi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>Seyahat Rehberi</a>
              </div>
            </Col>
            <Col xs={12} md={5}>
              <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>Yasal</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href="/sayfa/gizlilik-politikasi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>Gizlilik Politikası</a>
                <a href="/sayfa/kullanim-kosullari" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>Kullanım Koşulları</a>
                <a href="/sayfa/iptal-iade-politikasi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>İptal ve İade</a>
              </div>
            </Col>
            <Col xs={24} md={6}>
              <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>Hizmetlerimiz</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>VIP Transfer</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Havalimanı Transferi</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Şehirler Arası Transfer</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Grup Transferi</span>
              </div>
            </Col>
          </Row>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 36, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>&copy; {new Date().getFullYear()} {branding.companyName}. Tüm hakları saklıdır.</Text>
            <Space size="middle">
              <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Facebook</a>
              <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Instagram</a>
              <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Twitter</a>
            </Space>
          </div>
        </div>
      </footer>
    </Layout>
  );
};

export default HomePage;
