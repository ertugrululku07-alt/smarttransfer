'use client';

import React, { useState, useEffect } from 'react';
import {
    Card,
    Typography,
    Switch,
    Button,
    Input,
    Space,
    message,
    Tabs,
    Form,
    Row,
    Col,
    Image,
    Tag,
    Radio
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    SaveOutlined,
    AppstoreOutlined,
    PictureOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    EnvironmentOutlined,
    FormatPainterOutlined,
    ShopOutlined,
    UploadOutlined,
    OrderedListOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    FileTextOutlined
} from '@ant-design/icons';
import Upload from 'antd/es/upload';
import { THEMES } from '@/app/context/ThemeContext';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

const SiteSettingsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [modules, setModules] = useState<any>({});
    const [heroImages, setHeroImages] = useState<string[]>([]);
    const [newImageUrl, setNewImageUrl] = useState('');
    const [googleMapsSettings, setGoogleMapsSettings] = useState<{ enabled: boolean; country: string; apiKey?: string }>({ enabled: false, country: 'tr', apiKey: '' });
    const [heroBackground, setHeroBackground] = useState({ type: 'image', videoUrl: '' });
    const [currentTheme, setCurrentTheme] = useState<string>('default');
    const [themeSaving, setThemeSaving] = useState(false);

    // Branding state
    const [brandingData, setBrandingData] = useState({
        companyName: 'SmartTransfer',
        siteName: 'Transfer',
        siteNameHighlight: 'Smart',
        slogan: 'Güvenilir, konforlu ve profesyonel transfer hizmetleri',
        logoUrl: '',
        faviconUrl: '',
        phone: '+90 (212) XXX XX XX',
        email: 'info@smarttransfer.com',
    });
    const [brandingSaving, setBrandingSaving] = useState(false);
    const [logoUploading, setLogoUploading] = useState(false);

    // Homepage sections state
    const ALL_SECTIONS: { key: string; label: string; desc: string }[] = [
        { key: 'howItWorks', label: 'Nasıl Çalışır?', desc: '3 adım açıklaması' },
        { key: 'whyUs', label: 'Neden Biz?', desc: 'Avantajlar bölümü' },
        { key: 'stats', label: 'İstatistikler', desc: 'Sayısal veriler bandı' },
        { key: 'popularRoutes', label: 'Popüler Rotalar', desc: 'En çok tercih edilen güzergahlar' },
        { key: 'testimonials', label: 'Müşteri Yorumları', desc: 'Müşteri değerlendirmeleri' },
        { key: 'faq', label: 'Sıkça Sorulan Sorular', desc: 'SSS bölümü' },
        { key: 'cta', label: 'Aksiyon Çağrısı (CTA)', desc: 'Hemen Rezervasyon Yapın bandı' },
    ];
    const [activeSections, setActiveSections] = useState<string[]>(['howItWorks', 'whyUs', 'stats', 'popularRoutes', 'testimonials', 'faq', 'cta']);
    const [sectionsSaving, setSectionsSaving] = useState(false);

    // Dynamic homepage content
    const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([
        { question: 'Rezervasyonumu nasıl iptal edebilirim?', answer: 'Rezervasyonunuzu transfer saatinizden 24 saat öncesine kadar ücretsiz olarak iptal edebilirsiniz.' },
        { question: 'Ödeme nasıl yapılır?', answer: 'Kredi kartı, banka kartı veya nakit ödeme seçeneklerimiz mevcuttur.' },
        { question: 'Bebek koltuğu temin edebilir misiniz?', answer: 'Evet, rezervasyon sırasında bebek koltuğu talebinizi belirtmeniz yeterlidir. Ücretsiz olarak temin edilmektedir.' },
        { question: 'Uçuşum gecikirse ne olur?', answer: 'Uçuş bilgilerinizi takip ediyoruz. Uçuşunuz gecikirse şoförünüz sizi bekler, ek ücret alınmaz.' },
        { question: 'Havalimanında beni nasıl bulacaklar?', answer: 'Şoförünüz isminizin yazılı olduğu bir tabela ile çıkış kapısında sizi karşılayacaktır.' },
    ]);
    const [statsItems, setStatsItems] = useState<{ num: string; label: string }[]>([
        { num: '50,000+', label: 'Mutlu Yolcu' },
        { num: '200+', label: 'Profesyonel Şoför' },
        { num: '50+', label: 'Hizmet Bölgesi' },
        { num: '4.9/5', label: 'Müşteri Puanı' },
    ]);
    const [routeItems, setRouteItems] = useState<{ from: string; to: string; img: string; price: string }[]>([
        { from: 'Antalya Havalimanı', to: 'Kemer', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=250&fit=crop', price: '35' },
        { from: 'İstanbul Havalimanı', to: 'Taksim', img: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=400&h=250&fit=crop', price: '45' },
        { from: 'Dalaman Havalimanı', to: 'Fethiye', img: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=400&h=250&fit=crop', price: '55' },
        { from: 'Bodrum Havalimanı', to: 'Bodrum', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=250&fit=crop', price: '40' },
    ]);
    const [featureItems, setFeatureItems] = useState<{ title: string; desc: string; color: string }[]>([
        { title: 'Güvenilir Hizmet', desc: 'Lisanslı şoförler, sigortalı araçlar ve güvenli yolculuk garantisi.', color: '#667eea' },
        { title: '7/24 Müşteri Desteği', desc: 'Gece gündüz demeden ulaşabileceğiniz destek ekibi.', color: '#00b96b' },
        { title: 'Anında Onay', desc: 'Rezervasyonunuz anında onaylanır, bekleme yok.', color: '#faad14' },
        { title: 'Premium Araçlar', desc: 'Konforlu, bakımlı ve lüks araç filosu.', color: '#764ba2' },
        { title: 'Geniş Kapsama Alanı', desc: 'Havalimanı, otel ve şehirler arası geniş hizmet ağı.', color: '#13c2c2' },
        { title: 'Müşteri Memnuniyeti', desc: 'Yüksek müşteri memnuniyeti ile kaliteli hizmet.', color: '#eb2f96' },
    ]);
    const [contentSaving, setContentSaving] = useState(false);

    // Custom theme state
    const [customTheme, setCustomTheme] = useState({
        name: '',
        primaryColor: '#667eea',
        accentColor: '#764ba2',
        footerBg: '#0f172a',
        heroTitle: '',
        heroSubtitle: '',
    });
    const [customThemeSaving, setCustomThemeSaving] = useState(false);

    // Fetch settings on load
    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const [modulesRes, imagesRes, infoRes] = await Promise.all([
                apiClient.get('/api/tenant/modules'),
                apiClient.get('/api/tenant/hero-images'),
                apiClient.get('/api/tenant/info')
            ]);

            if (modulesRes.data.success) {
                setModules(modulesRes.data.data.modules);
            }
            if (imagesRes.data.success) {
                setHeroImages(imagesRes.data.data.heroImages || []);
            }
            if (infoRes.data.success && infoRes.data.data.tenant.settings) {
                const settings = infoRes.data.data.tenant.settings;
                if (settings.googleMaps) {
                    setGoogleMapsSettings(settings.googleMaps);
                } else {
                    // Initialize with empty if not present
                    setGoogleMapsSettings({ enabled: false, country: 'tr', apiKey: '' });
                }
                if (settings.heroBackground) {
                    setHeroBackground(settings.heroBackground);
                }
                if (settings.siteTheme) {
                    setCurrentTheme(settings.siteTheme);
                }
                if (settings.branding) {
                    setBrandingData(prev => ({ ...prev, ...settings.branding }));
                }
                if (settings.homepageSections) {
                    setActiveSections(settings.homepageSections);
                }
                // Load dynamic homepage content
                if (settings.homepageFaq?.length > 0) {
                    setFaqItems(settings.homepageFaq);
                }
                if (settings.homepageStats?.length > 0) {
                    setStatsItems(settings.homepageStats);
                }
                if (settings.homepageRoutes?.length > 0) {
                    setRouteItems(settings.homepageRoutes);
                }
                if (settings.homepageFeatures?.length > 0) {
                    setFeatureItems(settings.homepageFeatures);
                }
                if (settings.customTheme) {
                    setCustomTheme(settings.customTheme);
                }
            }
        } catch (error) {
            console.error('Fetch settings error:', error);
            message.error('Ayarlar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveContent = async () => {
        try {
            setContentSaving(true);
            const res = await apiClient.put('/api/tenant/settings', {
                homepageFaq: faqItems,
                homepageStats: statsItems,
                homepageRoutes: routeItems,
                homepageFeatures: featureItems,
            });
            if (res.data.success) {
                message.success('İçerikler güncellendi');
            }
        } catch (error) {
            console.error('Save content error:', error);
            message.error('İçerikler güncellenemedi');
        } finally {
            setContentSaving(false);
        }
    };

    const handleSaveCustomTheme = async () => {
        try {
            setCustomThemeSaving(true);
            const res = await apiClient.put('/api/tenant/settings', {
                customTheme: customTheme,
                siteTheme: 'custom'
            });
            if (res.data.success) {
                setCurrentTheme('custom');
                message.success('Özel tema kaydedildi ve aktif edildi');
            }
        } catch (error) {
            console.error('Save custom theme error:', error);
            message.error('Tema kaydedilemedi');
        } finally {
            setCustomThemeSaving(false);
        }
    };

    const addFaqItem = () => {
        setFaqItems([...faqItems, { question: '', answer: '' }]);
    };

    const updateFaqItem = (idx: number, field: 'question' | 'answer', value: string) => {
        const arr = [...faqItems];
        arr[idx] = { ...arr[idx], [field]: value };
        setFaqItems(arr);
    };

    const removeFaqItem = (idx: number) => {
        setFaqItems(faqItems.filter((_, i) => i !== idx));
    };

    const addStatItem = () => {
        setStatsItems([...statsItems, { num: '0', label: '' }]);
    };

    const updateStatItem = (idx: number, field: 'num' | 'label', value: string) => {
        const arr = [...statsItems];
        arr[idx] = { ...arr[idx], [field]: value };
        setStatsItems(arr);
    };

    const removeStatItem = (idx: number) => {
        setStatsItems(statsItems.filter((_, i) => i !== idx));
    };

    const addRouteItem = () => {
        setRouteItems([...routeItems, { from: '', to: '', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=250&fit=crop', price: '' }]);
    };

    const updateRouteItem = (idx: number, field: 'from' | 'to' | 'img' | 'price', value: string) => {
        const arr = [...routeItems];
        arr[idx] = { ...arr[idx], [field]: value };
        setRouteItems(arr);
    };

    const removeRouteItem = (idx: number) => {
        setRouteItems(routeItems.filter((_, i) => i !== idx));
    };

    const addFeatureItem = () => {
        setFeatureItems([...featureItems, { title: '', desc: '', color: '#667eea' }]);
    };

    const updateFeatureItem = (idx: number, field: 'title' | 'desc' | 'color', value: string) => {
        const arr = [...featureItems];
        arr[idx] = { ...arr[idx], [field]: value };
        setFeatureItems(arr);
    };

    const removeFeatureItem = (idx: number) => {
        setFeatureItems(featureItems.filter((_, i) => i !== idx));
    };

    const handleSaveGoogleMaps = async () => {
        try {
            const res = await apiClient.put('/api/tenant/settings', {
                googleMaps: googleMapsSettings
            });

            if (res.data.success) {
                message.success('Google Maps ayarları güncellendi');
            }
        } catch (error) {
            console.error('Update settings error:', error);
            message.error('Ayarlar güncellenemedi');
        }
    };

    const handleSaveBackgroundSettings = async () => {
        try {
            // Extract video ID if it's a full URL
            let finalVideoUrl = heroBackground.videoUrl;
            if (heroBackground.type === 'video' && finalVideoUrl) {
                // Determine if it is a URL or just ID
                if (finalVideoUrl.includes('youtube.com') || finalVideoUrl.includes('youtu.be')) {
                    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                    const match = finalVideoUrl.match(regExp);
                    if (match && match[2].length === 11) {
                        finalVideoUrl = match[2]; // Store only ID
                    }
                }
            }

            const res = await apiClient.put('/api/tenant/settings', {
                heroBackground: { ...heroBackground, videoUrl: finalVideoUrl }
            });

            if (res.data.success) {
                message.success('Arka plan ayarları güncellendi');
                setHeroBackground({ ...heroBackground, videoUrl: finalVideoUrl });
            }
        } catch (error) {
            console.error('Update settings error:', error);
            message.error('Ayarlar güncellenemedi');
        }
    };

    const handleModuleToggle = async (moduleName: string, checked: boolean) => {
        try {
            const updatedModules = { ...modules, [moduleName]: checked };
            setModules(updatedModules); // Optimistic update

            const res = await apiClient.put('/api/tenant/modules', updatedModules);

            if (res.data.success) {
                message.success(`${moduleName.toUpperCase()} durumu güncellendi`);
            } else {
                throw new Error(res.data.error);
            }
        } catch (error) {
            console.error('Update module error:', error);
            message.error('Güncelleme başarısız');
            fetchSettings(); // Revert on error
        }
    };

    const handleAddImage = async () => {
        if (!newImageUrl) return;

        try {
            const updatedImages = [...heroImages, newImageUrl];
            setHeroImages(updatedImages); // Optimistic update
            setNewImageUrl('');

            const res = await apiClient.put('/api/tenant/hero-images', {
                images: updatedImages
            });

            if (res.data.success) {
                message.success('Görsel eklendi');
            } else {
                throw new Error(res.data.error);
            }
        } catch (error) {
            console.error('Add image error:', error);
            message.error('Görsel eklenemedi');
            fetchSettings();
        }
    };

    const handleRemoveImage = async (index: number) => {
        try {
            const updatedImages = heroImages.filter((_, i) => i !== index);
            setHeroImages(updatedImages);

            const res = await apiClient.put('/api/tenant/hero-images', {
                images: updatedImages
            });

            if (res.data.success) {
                message.success('Görsel silindi');
            }
        } catch (error) {
            console.error('Remove image error:', error);
            message.error('Görsel silinemedi');
            fetchSettings();
        }
    };

    const handleSaveBranding = async () => {
        try {
            setBrandingSaving(true);
            const res = await apiClient.put('/api/tenant/settings', { branding: brandingData });
            if (res.data.success) {
                message.success('Firma bilgileri güncellendi');
            }
        } catch (error) {
            console.error('Update branding error:', error);
            message.error('Firma bilgileri güncellenemedi');
        } finally {
            setBrandingSaving(false);
        }
    };

    const handleLogoUpload = async (file: File) => {
        try {
            setLogoUploading(true);
            const formData = new FormData();
            formData.append('file', file);
            const res = await apiClient.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                setBrandingData(prev => ({ ...prev, logoUrl: res.data.data.url }));
                message.success('Logo yüklendi');
            }
        } catch (error) {
            console.error('Logo upload error:', error);
            message.error('Logo yüklenemedi');
        } finally {
            setLogoUploading(false);
        }
        return false;
    };

    const handleSaveSections = async () => {
        try {
            setSectionsSaving(true);
            const res = await apiClient.put('/api/tenant/settings', { homepageSections: activeSections });
            if (res.data.success) {
                message.success('Ana sayfa bölümleri güncellendi');
            }
        } catch (error) {
            console.error('Update sections error:', error);
            message.error('Bölümler güncellenemedi');
        } finally {
            setSectionsSaving(false);
        }
    };

    const moveSectionUp = (idx: number) => {
        if (idx === 0) return;
        const arr = [...activeSections];
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        setActiveSections(arr);
    };

    const moveSectionDown = (idx: number) => {
        if (idx >= activeSections.length - 1) return;
        const arr = [...activeSections];
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        setActiveSections(arr);
    };

    const toggleSection = (key: string) => {
        if (activeSections.includes(key)) {
            setActiveSections(activeSections.filter(s => s !== key));
        } else {
            setActiveSections([...activeSections, key]);
        }
    };

    const handleSaveTheme = async (themeKey: string) => {
        try {
            setThemeSaving(true);
            setCurrentTheme(themeKey);
            const res = await apiClient.put('/api/tenant/settings', { siteTheme: themeKey });
            if (res.data.success) {
                message.success(`Tema "${THEMES[themeKey]?.name || themeKey}" olarak güncellendi`);
            }
        } catch (error) {
            console.error('Update theme error:', error);
            message.error('Tema güncellenemedi');
        } finally {
            setThemeSaving(false);
        }
    };

    const tabItems = [
        {
            key: 'branding',
            label: (
                <span>
                    <ShopOutlined />
                    Firma Bilgileri
                </span>
            ),
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <Card title="Ticari Bilgiler" variant="borderless">
                        <Form layout="vertical">
                            <Row gutter={[24, 0]}>
                                <Col xs={24} md={12}>
                                    <Form.Item label="Ticari Ünvan" extra="Firma resmi ticari ünvanı (örn: SmartTransfer Turizm A.Ş.)">
                                        <Input
                                            size="large"
                                            placeholder="Firma Ticari Ünvanı"
                                            value={brandingData.companyName}
                                            onChange={(e) => setBrandingData(prev => ({ ...prev, companyName: e.target.value }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Form.Item label="Site Adı (Vurgulu Kısım)" extra="Logo'nun renkli/vurgulu kısmı">
                                        <Input
                                            size="large"
                                            placeholder="Smart"
                                            value={brandingData.siteNameHighlight}
                                            onChange={(e) => setBrandingData(prev => ({ ...prev, siteNameHighlight: e.target.value }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                    <Form.Item label="Site Adı (Normal Kısım)" extra="Logo'nun normal kısmı">
                                        <Input
                                            size="large"
                                            placeholder="Transfer"
                                            value={brandingData.siteName}
                                            onChange={(e) => setBrandingData(prev => ({ ...prev, siteName: e.target.value }))}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item label="Slogan / Kısa Tanıtım" extra="Ana sayfada ve footer'da görünecek kısa tanıtım yazısı">
                                <Input.TextArea
                                    rows={2}
                                    placeholder="Güvenilir, konforlu ve profesyonel transfer hizmetleri"
                                    value={brandingData.slogan}
                                    onChange={(e) => setBrandingData(prev => ({ ...prev, slogan: e.target.value }))}
                                />
                            </Form.Item>
                            <Row gutter={[24, 0]}>
                                <Col xs={24} md={12}>
                                    <Form.Item label="Telefon" extra="İletişim numarası">
                                        <Input
                                            size="large"
                                            placeholder="+90 (212) XXX XX XX"
                                            value={brandingData.phone}
                                            onChange={(e) => setBrandingData(prev => ({ ...prev, phone: e.target.value }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item label="E-posta" extra="İletişim e-posta adresi">
                                        <Input
                                            size="large"
                                            placeholder="info@firmaadi.com"
                                            value={brandingData.email}
                                            onChange={(e) => setBrandingData(prev => ({ ...prev, email: e.target.value }))}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </Card>

                    <Card title="Firma Logosu" variant="borderless">
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                                    Firma logonuzu yükleyin. Logo, site başlığında (TopBar), footer ve belgelerde kullanılacaktır.
                                    Önerilen boyut: 200x60 piksel, PNG veya SVG formatı.
                                </Text>
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => { handleLogoUpload(file); return false; }}
                                >
                                    <Button icon={<UploadOutlined />} loading={logoUploading} size="large">
                                        Logo Yükle
                                    </Button>
                                </Upload>
                                <div style={{ marginTop: 12 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>veya URL girin:</Text>
                                    <Input
                                        style={{ marginTop: 4 }}
                                        placeholder="https://...logo.png"
                                        value={brandingData.logoUrl}
                                        onChange={(e) => setBrandingData(prev => ({ ...prev, logoUrl: e.target.value }))}
                                    />
                                </div>
                            </Col>
                            <Col xs={24} md={12}>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Önizleme:</Text>
                                <div style={{
                                    background: '#0f172a', borderRadius: 12, padding: '20px 24px',
                                    display: 'flex', alignItems: 'center', gap: 12, minHeight: 70
                                }}>
                                    {brandingData.logoUrl ? (
                                        <img
                                            src={brandingData.logoUrl}
                                            alt="Logo"
                                            style={{ maxHeight: 40, maxWidth: 180, objectFit: 'contain' }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{
                                                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                fontWeight: 800, fontSize: 22,
                                            }}>{brandingData.siteNameHighlight}</span>
                                            <span style={{ color: '#fff', fontWeight: 600, fontSize: 22 }}>{brandingData.siteName}</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{
                                    background: '#fff', borderRadius: 12, padding: '20px 24px', marginTop: 8,
                                    display: 'flex', alignItems: 'center', gap: 12, minHeight: 70,
                                    border: '1px solid #e5e7eb'
                                }}>
                                    {brandingData.logoUrl ? (
                                        <img
                                            src={brandingData.logoUrl}
                                            alt="Logo"
                                            style={{ maxHeight: 40, maxWidth: 180, objectFit: 'contain' }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{
                                                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                fontWeight: 800, fontSize: 22,
                                            }}>{brandingData.siteNameHighlight}</span>
                                            <span style={{ color: '#0f172a', fontWeight: 600, fontSize: 22 }}>{brandingData.siteName}</span>
                                        </div>
                                    )}
                                </div>
                            </Col>
                        </Row>
                    </Card>

                    <div style={{ textAlign: 'right' }}>
                        <Button
                            type="primary"
                            size="large"
                            icon={<SaveOutlined />}
                            onClick={handleSaveBranding}
                            loading={brandingSaving}
                        >
                            Firma Bilgilerini Kaydet
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: 'modules',
            label: (
                <span>
                    <AppstoreOutlined />
                    Hizmet Modülleri
                </span>
            ),
            children: (
                <Card title="Aktif Hizmetler" variant="borderless">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {[
                            { key: 'transfer', title: 'Transfer Hizmeti', desc: 'Havalimanı ve şehir içi transferler' },
                            { key: 'tour', title: 'Tur Hizmeti', desc: 'Rehberli turlar ve geziler' },
                            { key: 'hotel', title: 'Otel Rezervasyonu', desc: 'Konaklama seçenekleri' },
                            { key: 'flight', title: 'Uçak Bileti', desc: 'Uçuş arama ve rezervasyon' },
                            { key: 'car', title: 'Araç Kiralama', desc: 'Rent a car hizmetleri' },
                            { key: 'cruise', title: 'Cruise Turları', desc: 'Gemi turları' },
                        ].map((item, index, arr) => (
                            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: index !== arr.length - 1 ? 16 : 0, borderBottom: index !== arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                                    <div style={{ color: '#888', fontSize: 13 }}>{item.desc}</div>
                                </div>
                                <Switch
                                    checked={modules[item.key]}
                                    onChange={(checked) => handleModuleToggle(item.key, checked)}
                                    checkedChildren={<CheckCircleOutlined />}
                                    unCheckedChildren={<CloseCircleOutlined />}
                                />
                            </div>
                        ))}
                    </div>
                </Card>
            ),
        },
        {
            key: 'images',
            label: (
                <span>
                    <PictureOutlined />
                    Arka Plan Görselleri
                </span>
            ),
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
                    <Card title="Arka Plan Tipi" variant="borderless">
                        <Radio.Group
                            value={heroBackground.type}
                            onChange={(e) => setHeroBackground({ ...heroBackground, type: e.target.value })}
                            buttonStyle="solid"
                        >
                            <Radio.Button value="image">Resim Slayt</Radio.Button>
                            <Radio.Button value="video">Video (YouTube)</Radio.Button>
                        </Radio.Group>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSaveBackgroundSettings}
                            style={{ float: 'right' }}
                        >
                            Kaydet
                        </Button>
                    </Card>

                    {heroBackground.type === 'video' ? (
                        <Card title="YouTube Video Ayarları" variant="borderless">
                            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                                Arka planda oynatılacak YouTube videosunun linkini veya ID'sini giriniz.
                                Video otomatik olarak sessiz bir şekilde oynatılacaktır.
                            </Text>
                            <Space.Compact style={{ width: '100%' }}>
                                <Input
                                    placeholder="YouTube Video URL veya ID (örn: dqw4w9wgxcq)"
                                    value={heroBackground.videoUrl}
                                    onChange={(e) => setHeroBackground({ ...heroBackground, videoUrl: e.target.value })}
                                />
                            </Space.Compact>
                            {heroBackground.videoUrl && (
                                <div style={{ marginTop: 24, borderRadius: 8, overflow: 'hidden' }}>
                                    <iframe
                                        width="100%"
                                        height="400"
                                        src={`https://www.youtube.com/embed/${heroBackground.videoUrl}?autoplay=0&controls=1&showinfo=0&rel=0`}
                                        title="YouTube video player"
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    ></iframe>
                                </div>
                            )}
                        </Card>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
                            <Card title="Yeni Görsel Ekle" variant="borderless">
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        placeholder="Görsel URL (https://...)"
                                        value={newImageUrl}
                                        onChange={(e) => setNewImageUrl(e.target.value)}
                                        onPressEnter={handleAddImage}
                                    />
                                    <Button type="primary" onClick={handleAddImage} icon={<PlusOutlined />}>Ekle</Button>
                                </Space.Compact>
                            </Card>

                            <Card title="Mevcut Görseller" variant="borderless">
                                <Row gutter={[16, 16]}>
                                    {heroImages.map((url, index) => (
                                        <Col xs={24} sm={12} md={8} key={index}>
                                            <Card
                                                cover={
                                                    <div style={{ height: 200, overflow: 'hidden' }}>
                                                        <Image
                                                            src={url}
                                                            alt={`Hero ${index}`}
                                                            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                                                        />
                                                    </div>
                                                }
                                                actions={[
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => handleRemoveImage(index)}
                                                    >
                                                        Sil
                                                    </Button>
                                                ]}
                                            >
                                                <Card.Meta title={`Görsel ${index + 1}`} description={<Text ellipsis>{url}</Text>} />
                                            </Card>
                                        </Col>
                                    ))}
                                </Row>
                            </Card>
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'theme',
            label: (
                <span>
                    <FormatPainterOutlined />
                    Site Teması
                </span>
            ),
            children: (
                <Card title="Site Teması Seçin" variant="borderless" extra={<Tag color="blue">Aktif: {THEMES[currentTheme]?.name || 'Varsayılan'}</Tag>}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                        Aşağıdaki temalardan birini seçerek sitenizin görünümünü değiştirin. Seçtiğiniz tema anında uygulanır.
                    </Text>
                    <Row gutter={[16, 16]}>
                        {Object.values(THEMES).map((t) => (
                            <Col xs={24} sm={12} md={6} key={t.key}>
                                <Card
                                    hoverable
                                    style={{
                                        borderRadius: 12,
                                        border: currentTheme === t.key ? `2px solid ${t.primaryColor}` : '2px solid transparent',
                                        overflow: 'hidden',
                                        transition: 'all 0.3s',
                                    }}
                                    styles={{ body: { padding: 0 } }}
                                    onClick={() => handleSaveTheme(t.key)}
                                >
                                    <div style={{
                                        height: 100,
                                        background: t.heroGradient,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                    }}>
                                        {t.decorationEmoji && (
                                            <span style={{ fontSize: 28, opacity: 0.8 }}>{t.decorationEmoji}</span>
                                        )}
                                        {currentTheme === t.key && (
                                            <div style={{
                                                position: 'absolute', top: 8, right: 8,
                                                background: '#fff', borderRadius: '50%',
                                                width: 24, height: 24, display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <CheckCircleOutlined style={{ color: t.primaryColor, fontSize: 16 }} />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: '12px 14px' }}>
                                        <Text strong style={{ display: 'block', marginBottom: 4 }}>{t.name}</Text>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: t.primaryColor }} />
                                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: t.accentColor }} />
                                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: t.footerBg, border: '1px solid #eee' }} />
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Card>
            ),
        },
        {
            key: 'sections',
            label: (
                <span>
                    <OrderedListOutlined />
                    Ana Sayfa Bölümleri
                </span>
            ),
            children: (
                <Card title="Ana Sayfa Bölüm Yönetimi" variant="borderless" extra={
                    <Button type="primary" icon={<SaveOutlined />} loading={sectionsSaving} onClick={handleSaveSections}>
                        Kaydet
                    </Button>
                }>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                        Ana sayfada görünecek bölümleri açıp kapatabilir ve sırasını değiştirebilirsiniz. Aktif bölümler yukarıdan aşağıya doğru sıralanır.
                    </Text>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Active sections - sortable */}
                        {activeSections.map((key, idx) => {
                            const sec = ALL_SECTIONS.find(s => s.key === key);
                            if (!sec) return null;
                            return (
                                <div key={key} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px', borderRadius: 10,
                                    background: '#f0f7ff', border: '1px solid #d0e3ff',
                                    transition: 'all 0.2s',
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveSectionUp(idx)} style={{ padding: '0 4px', height: 20, fontSize: 11 }} />
                                        <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === activeSections.length - 1} onClick={() => moveSectionDown(idx)} style={{ padding: '0 4px', height: 20, fontSize: 11 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Text strong style={{ fontSize: 14 }}>{sec.label}</Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12 }}>{sec.desc}</Text>
                                    </div>
                                    <Tag color="blue" style={{ margin: 0 }}>#{idx + 1}</Tag>
                                    <Button size="small" danger icon={<EyeInvisibleOutlined />} onClick={() => toggleSection(key)}>
                                        Gizle
                                    </Button>
                                </div>
                            );
                        })}

                        {/* Inactive sections */}
                        {ALL_SECTIONS.filter(s => !activeSections.includes(s.key)).map(sec => (
                            <div key={sec.key} style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 16px', borderRadius: 10,
                                background: '#fafafa', border: '1px dashed #d9d9d9',
                                opacity: 0.7,
                            }}>
                                <div style={{ width: 28 }} />
                                <div style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, color: '#999' }}>{sec.label}</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>{sec.desc}</Text>
                                </div>
                                <Tag style={{ margin: 0 }}>Gizli</Tag>
                                <Button size="small" type="primary" ghost icon={<EyeOutlined />} onClick={() => toggleSection(sec.key)}>
                                    Göster
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            ),
        },
        {
            key: 'content',
            label: (
                <span>
                    <FileTextOutlined />
                    İçerik Yönetimi
                </span>
            ),
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <Card title="Sıkça Sorulan Sorular (SSS)" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addFaqItem}>SSS Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Ana sayfadaki "Sıkça Sorulan Sorular" bölümünde gösterilecek soru-cevapları yönetin.
                        </Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {faqItems.map((faq, idx) => (
                                <Card key={idx} size="small" style={{ background: '#fafafa' }}>
                                    <Row gutter={[16, 12]}>
                                        <Col xs={24} md={10}>
                                            <Form.Item label="Soru" style={{ marginBottom: 0 }}>
                                                <Input value={faq.question} onChange={e => updateFaqItem(idx, 'question', e.target.value)} placeholder="Soru metni..." />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item label="Cevap" style={{ marginBottom: 0 }}>
                                                <Input.TextArea value={faq.answer} onChange={e => updateFaqItem(idx, 'answer', e.target.value)} rows={2} placeholder="Cevap metni..." />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={2} style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <Button danger icon={<DeleteOutlined />} onClick={() => removeFaqItem(idx)} />
                                        </Col>
                                    </Row>
                                </Card>
                            ))}
                            {faqItems.length === 0 && (
                                <Text type="secondary" style={{ textAlign: 'center', padding: 24 }}>Henüz SSS eklenmemiş. "SSS Ekle" butonu ile ekleyin.</Text>
                            )}
                        </div>
                    </Card>

                    <Card title="İstatistikler" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addStatItem}>İstatistik Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Ana sayfadaki istatistik bandında gösterilecek verileri yönetin (örn: 50,000+ Mutlu Yolcu).
                        </Text>
                        <Row gutter={[16, 16]}>
                            {statsItems.map((stat, idx) => (
                                <Col xs={24} sm={12} md={6} key={idx}>
                                    <Card size="small" style={{ background: '#fafafa' }}>
                                        <Row gutter={8} align="middle">
                                            <Col span={10}>
                                                <Input value={stat.num} onChange={e => updateStatItem(idx, 'num', e.target.value)} placeholder="50,000+" style={{ fontWeight: 'bold', textAlign: 'center' }} />
                                            </Col>
                                            <Col span={12}>
                                                <Input value={stat.label} onChange={e => updateStatItem(idx, 'label', e.target.value)} placeholder="Mutlu Yolcu" />
                                            </Col>
                                            <Col span={2}>
                                                <Button danger icon={<DeleteOutlined />} size="small" onClick={() => removeStatItem(idx)} />
                                            </Col>
                                        </Row>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                        {statsItems.length === 0 && (
                            <Text type="secondary" style={{ textAlign: 'center', padding: 24 }}>Henüz istatistik eklenmemiş. "İstatistik Ekle" butonu ile ekleyin.</Text>
                        )}
                    </Card>

                    <Card title="Popüler Rotalar" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addRouteItem}>Rota Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Ana sayfada gösterilecek popüler transfer rotalarını yönetin.
                        </Text>
                        <Row gutter={[16, 16]}>
                            {routeItems.map((route, idx) => (
                                <Col xs={24} sm={12} key={idx}>
                                    <Card size="small" style={{ background: '#fafafa' }}>
                                        <Row gutter={[8, 8]}>
                                            <Col span={11}>
                                                <Form.Item label="Başlangıç" style={{ marginBottom: 0 }}>
                                                    <Input value={route.from} onChange={e => updateRouteItem(idx, 'from', e.target.value)} placeholder="Antalya Havalimanı" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={11}>
                                                <Form.Item label="Varış" style={{ marginBottom: 0 }}>
                                                    <Input value={route.to} onChange={e => updateRouteItem(idx, 'to', e.target.value)} placeholder="Kemer" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={2} style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                <Button danger icon={<DeleteOutlined />} size="small" onClick={() => removeRouteItem(idx)} />
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item label="Görsel URL" style={{ marginBottom: 0 }}>
                                                    <Input value={route.img} onChange={e => updateRouteItem(idx, 'img', e.target.value)} placeholder="https://..." />
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item label="Fiyat (EUR)" style={{ marginBottom: 0 }}>
                                                    <Input value={route.price} onChange={e => updateRouteItem(idx, 'price', e.target.value)} placeholder="35" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                        {routeItems.length === 0 && (
                            <Text type="secondary" style={{ textAlign: 'center', padding: 24 }}>Henüz rota eklenmemiş. "Rota Ekle" butonu ile ekleyin.</Text>
                        )}
                    </Card>

                    <Card title="Neden Biz? (Özellikler)" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addFeatureItem}>Özellik Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Ana sayfadaki "Neden Biz?" bölümünde gösterilecek avantajları/özellikleri yönetin.
                        </Text>
                        <Row gutter={[16, 16]}>
                            {featureItems.map((feature, idx) => (
                                <Col xs={24} sm={12} md={8} key={idx}>
                                    <Card size="small" style={{ background: '#fafafa' }}>
                                        <Row gutter={8} align="middle">
                                            <Col span={20}>
                                                <Form.Item label="Başlık" style={{ marginBottom: 8 }}>
                                                    <Input value={feature.title} onChange={e => updateFeatureItem(idx, 'title', e.target.value)} placeholder="Güvenilir Hizmet" />
                                                </Form.Item>
                                                <Form.Item label="Açıklama" style={{ marginBottom: 8 }}>
                                                    <Input.TextArea value={feature.desc} onChange={e => updateFeatureItem(idx, 'desc', e.target.value)} rows={2} placeholder="Açıklama metni..." />
                                                </Form.Item>
                                                <Form.Item label="Renk" style={{ marginBottom: 0 }}>
                                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                        {['#667eea', '#00b96b', '#faad14', '#764ba2', '#13c2c2', '#eb2f96', '#f5222d', '#1890ff'].map(c => (
                                                            <div key={c} onClick={() => updateFeatureItem(idx, 'color', c)} style={{
                                                                width: 24, height: 24, borderRadius: '50%', background: c,
                                                                border: feature.color === c ? '2px solid #000' : '2px solid transparent',
                                                                cursor: 'pointer'
                                                            }} />
                                                        ))}
                                                    </div>
                                                </Form.Item>
                                            </Col>
                                            <Col span={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                <Button danger icon={<DeleteOutlined />} size="small" onClick={() => removeFeatureItem(idx)} />
                                            </Col>
                                        </Row>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                        {featureItems.length === 0 && (
                            <Text type="secondary" style={{ textAlign: 'center', padding: 24 }}>Henüz özellik eklenmemiş. "Özellik Ekle" butonu ile ekleyin.</Text>
                        )}
                    </Card>

                    <div style={{ textAlign: 'right' }}>
                        <Button type="primary" size="large" icon={<SaveOutlined />} onClick={handleSaveContent} loading={contentSaving}>
                            Tüm İçerikleri Kaydet
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: 'custom-theme',
            label: (
                <span>
                    <FormatPainterOutlined />
                    Özel Tema
                </span>
            ),
            children: (
                <Card title="Özel Tema Oluştur" variant="borderless" extra={
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveCustomTheme} loading={customThemeSaving}>
                        Tema Kaydet
                    </Button>
                }>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                        Kendi renklerinizi seçerek tamamen size özel bir tema oluşturun. Kaydettiğiniz tema otomatik olarak aktif olacaktır.
                    </Text>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} md={12}>
                            <Form layout="vertical">
                                <Form.Item label="Tema Adı">
                                    <Input value={customTheme.name} onChange={e => setCustomTheme({ ...customTheme, name: e.target.value })} placeholder="Örn: Benim Temam" />
                                </Form.Item>
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item label="Ana Renk">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <Input type="color" value={customTheme.primaryColor} onChange={e => setCustomTheme({ ...customTheme, primaryColor: e.target.value })} style={{ width: 60, padding: 0, height: 32 }} />
                                                <Input value={customTheme.primaryColor} onChange={e => setCustomTheme({ ...customTheme, primaryColor: e.target.value })} placeholder="#667eea" />
                                            </div>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item label="Vurgu Rengi">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <Input type="color" value={customTheme.accentColor} onChange={e => setCustomTheme({ ...customTheme, accentColor: e.target.value })} style={{ width: 60, padding: 0, height: 32 }} />
                                                <Input value={customTheme.accentColor} onChange={e => setCustomTheme({ ...customTheme, accentColor: e.target.value })} placeholder="#764ba2" />
                                            </div>
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item label="Footer Arkaplanı">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <Input type="color" value={customTheme.footerBg} onChange={e => setCustomTheme({ ...customTheme, footerBg: e.target.value })} style={{ width: 60, padding: 0, height: 32 }} />
                                        <Input value={customTheme.footerBg} onChange={e => setCustomTheme({ ...customTheme, footerBg: e.target.value })} placeholder="#0f172a" />
                                    </div>
                                </Form.Item>
                                <Form.Item label="Hero Başlık">
                                    <Input value={customTheme.heroTitle} onChange={e => setCustomTheme({ ...customTheme, heroTitle: e.target.value })} placeholder="Güvenilir Transfer Hizmeti" />
                                </Form.Item>
                                <Form.Item label="Hero Alt Başlık">
                                    <Input.TextArea value={customTheme.heroSubtitle} onChange={e => setCustomTheme({ ...customTheme, heroSubtitle: e.target.value })} rows={2} placeholder="Havalimanı transferinden şehirler arası ulaşıma..." />
                                </Form.Item>
                            </Form>
                        </Col>
                        <Col xs={24} md={12}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Önizleme:</Text>
                            <div style={{
                                height: 120,
                                background: `linear-gradient(135deg, ${customTheme.primaryColor}33 0%, ${customTheme.accentColor}33 100%)`,
                                borderRadius: 12,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 20,
                                border: `2px solid ${customTheme.primaryColor}66`
                            }}>
                                <div style={{ color: customTheme.primaryColor, fontWeight: 'bold', fontSize: 20, marginBottom: 8 }}>{customTheme.heroTitle || 'Hero Başlık'}</div>
                                <div style={{ color: '#666', fontSize: 14, textAlign: 'center' }}>{customTheme.heroSubtitle || 'Alt başlık metni burada görünecek'}</div>
                            </div>
                            <div style={{
                                height: 60,
                                background: customTheme.footerBg,
                                borderRadius: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: 12
                            }}>
                                <div style={{ color: '#fff', fontSize: 14 }}>Footer Önizleme</div>
                            </div>
                        </Col>
                    </Row>
                </Card>
            ),
        },
        {
            key: 'googleMaps',
            label: (
                <span>
                    <EnvironmentOutlined />
                    Google Maps
                </span>
            ),
            children: (
                <Card title="Google Maps Ayarları" variant="borderless">
                    <Form layout="vertical">
                        <Form.Item label="Google Maps Kullanımı">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Switch
                                    checked={googleMapsSettings.enabled}
                                    onChange={(checked) => setGoogleMapsSettings({ ...googleMapsSettings, enabled: checked })}
                                    checkedChildren="Aktif"
                                    unCheckedChildren="Pasif"
                                />
                                <Typography.Text type="secondary">
                                    Aktif edilirse arama kutularında (Nereden / Nereye) Here yerine Google Maps altyapısı kullanılır.
                                </Typography.Text>
                            </div>
                        </Form.Item>

                        <Form.Item
                            label="Google Maps API Anahtarı"
                            extra="Google Cloud Console'dan alacağınız sınırsız veya domain kısıtlamalı API anahtarı."
                        >
                            <Input.Password
                                placeholder="AIza..."
                                value={(googleMapsSettings as any).apiKey || ''}
                                onChange={(e) => setGoogleMapsSettings({ ...googleMapsSettings, apiKey: e.target.value } as any)}
                            />
                        </Form.Item>

                        <Form.Item
                            label="Ülke Sınırlaması (ISO Kodu)"
                            extra="Boş bırakırsanız tüm dünya, 'tr' yazarsanız sadece Türkiye sonuçları çıkar."
                        >
                            <Space.Compact style={{ width: '100%' }}>
                                <Input
                                    placeholder="örn: tr, us, gb"
                                    value={googleMapsSettings.country}
                                    onChange={(e) => setGoogleMapsSettings({ ...googleMapsSettings, country: e.target.value })}
                                />
                                <Button type="primary" onClick={handleSaveGoogleMaps} icon={<SaveOutlined />}>Kaydet</Button>
                            </Space.Compact>
                        </Form.Item>
                    </Form>
                </Card>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="site-settings">
                <div style={{ marginBottom: 24 }}>
                    <Title level={2}>Site Ayarları</Title>
                    <Text type="secondary">
                        Web sitesi görünürlük ayarlarını ve arka plan görsellerini yönetin.
                    </Text>
                </div>

                <Tabs defaultActiveKey="branding" items={tabItems} />
            </AdminLayout>
        </AdminGuard>
    );
};

export default SiteSettingsPage;
