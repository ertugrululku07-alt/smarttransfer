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
    FileTextOutlined,
    PhoneOutlined,
    GlobalOutlined,
    SafetyCertificateOutlined,
    StarOutlined
} from '@ant-design/icons';
import Upload from 'antd/es/upload';
import { THEMES } from '@/app/context/ThemeContext';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient, { getImageUrl } from '@/lib/api-client';
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
        companyName: '',
        siteName: '',
        siteNameHighlight: '',
        slogan: '',
        logoUrl: '',
        logoVariants: null as any,
        faviconUrl: '',
        phone: '',
        email: '',
    });
    const [brandingSaving, setBrandingSaving] = useState(false);
    const [logoUploading, setLogoUploading] = useState(false);
    const [heroImageUploading, setHeroImageUploading] = useState(false);

    // Homepage sections state
    const ALL_SECTIONS: { key: string; label: string; desc: string }[] = [
        { key: 'howItWorks', label: 'Nasıl Çalışır?', desc: '3 adım açıklaması' },
        { key: 'whyUs', label: 'Neden Biz?', desc: 'Avantajlar bölümü' },
        { key: 'stats', label: 'İstatistikler', desc: 'Sayısal veriler bandı' },
        { key: 'popularRoutes', label: 'Popüler Rotalar', desc: 'En çok tercih edilen güzergahlar' },
        { key: 'bookingLookup', label: 'Rezervasyon Sorgulama', desc: 'Rezervasyon numarası ile durum sorgulama' },
        { key: 'testimonials', label: 'Müşteri Yorumları', desc: 'Müşteri değerlendirmeleri' },
        { key: 'faq', label: 'Sıkça Sorulan Sorular', desc: 'SSS bölümü' },
        { key: 'cta', label: 'Aksiyon Çağrısı (CTA)', desc: 'Hemen Rezervasyon Yapın bandı' },
    ];
    const [activeSections, setActiveSections] = useState<string[]>(['howItWorks', 'whyUs', 'stats', 'popularRoutes', 'bookingLookup', 'testimonials', 'faq', 'cta']);
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
    const [testimonialItems, setTestimonialItems] = useState<{ name: string; text: string; rating: number; city: string }[]>([
        { name: 'Ahmet Y.', text: 'Harika bir transfer deneyimi yaşadık. Şoförümüz çok ilgili ve araç tertemizdi.', rating: 5, city: 'İstanbul' },
        { name: 'Maria S.', text: 'Zamanında geldiler, çok profesyonel bir hizmet aldık. Kesinlikle tavsiye ederim!', rating: 5, city: 'Berlin' },
        { name: 'Fatma K.', text: 'Fiyat-performans açısından en iyi transfer hizmeti. Bir daha kullanacağım.', rating: 5, city: 'Ankara' },
    ]);
    const [tursab, setTursab] = useState({ enabled: false, belgeNo: '', verificationUrl: '' });
    const [tursabSaving, setTursabSaving] = useState(false);
    const [routeImgUploading, setRouteImgUploading] = useState<number | null>(null);
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

    // Contact page state
    const [contactPage, setContactPage] = useState({
        heroTitle: 'Bizimle İletişime Geçin',
        heroSubtitle: 'Sorularınız, önerileriniz veya iş birliği talepleriniz için aşağıdaki kanallardan bize ulaşabilirsiniz.',
        heroImage: '',
        phone: '',
        phoneHours: 'Hafta içi 09:00 - 18:00',
        email: '',
        emailNote: '7/24 e-posta desteği',
        address: '',
        workingHours: ['Pzt - Cmt: 09:00 - 19:00', 'Pazar: 10:00 - 16:00'],
        branches: [] as { name: string; badge: string; address: string; phone: string; hours: string; mapEmbedUrl: string }[],
        mainMapUrl: '',
        formSubjects: [
            { value: 'genel', label: 'Genel Bilgi' },
            { value: 'destek', label: 'Teknik Destek' },
            { value: 'isbirligi', label: 'İş Birliği' },
            { value: 'sikayet', label: 'Şikayet / Öneri' },
            { value: 'diger', label: 'Diğer' },
        ],
    });
    const [contactSaving, setContactSaving] = useState(false);

    // Track page state
    const [trackPage, setTrackPage] = useState({ heroImage: '' });
    const [trackPageImgUploading, setTrackPageImgUploading] = useState(false);
    const [trackPageSaving, setTrackPageSaving] = useState(false);

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
                if (settings.homepageTestimonials?.length > 0) {
                    setTestimonialItems(settings.homepageTestimonials);
                }
                if (settings.tursab) {
                    setTursab(prev => ({ ...prev, ...settings.tursab }));
                }
                if (settings.customTheme) {
                    setCustomTheme(settings.customTheme);
                }
                if (settings.trackPage) {
                    setTrackPage(prev => ({ ...prev, ...settings.trackPage }));
                }
                if (settings.contactPage) {
                    const cp = { ...settings.contactPage };
                    const extractSrc = (v: string) => {
                        if (!v) return v;
                        const t = v.trim();
                        if (t.startsWith('<')) { const m = t.match(/src=["']([^"']+)["']/); return m ? m[1] : t; }
                        return t;
                    };
                    if (cp.mainMapUrl) cp.mainMapUrl = extractSrc(cp.mainMapUrl);
                    if (Array.isArray(cp.branches)) {
                        cp.branches = cp.branches.map((b: any) => ({ ...b, mapEmbedUrl: extractSrc(b.mapEmbedUrl || '') }));
                    }
                    setContactPage(prev => ({ ...prev, ...cp }));
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
                homepageTestimonials: testimonialItems,
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

    const addTestimonialItem = () => {
        setTestimonialItems([...testimonialItems, { name: '', text: '', rating: 5, city: '' }]);
    };

    const updateTestimonialItem = (idx: number, field: 'name' | 'text' | 'rating' | 'city', value: any) => {
        const arr = [...testimonialItems];
        arr[idx] = { ...arr[idx], [field]: value };
        setTestimonialItems(arr);
    };

    const removeTestimonialItem = (idx: number) => {
        setTestimonialItems(testimonialItems.filter((_, i) => i !== idx));
    };

    const handleSaveTursab = async () => {
        try {
            setTursabSaving(true);
            const res = await apiClient.put('/api/tenant/settings', { tursab });
            if (res.data.success) message.success('TÜRSAB ayarları kaydedildi');
        } catch (error) {
            message.error('TÜRSAB ayarları kaydedilemedi');
        } finally {
            setTursabSaving(false);
        }
    };

    const handleRouteImageUpload = async (file: File, idx: number) => {
        try {
            setRouteImgUploading(idx);
            const formData = new FormData();
            formData.append('file', file);
            const res = await apiClient.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                updateRouteItem(idx, 'img', res.data.data.url);
                message.success('Görsel yüklendi');
            }
        } catch {
            message.error('Görsel yüklenemedi');
        } finally {
            setRouteImgUploading(null);
        }
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

    const handleHeroImageUpload = async (file: File) => {
        try {
            setHeroImageUploading(true);
            const formData = new FormData();
            formData.append('file', file);
            const res = await apiClient.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                const imageUrl = res.data.data.url;
                const updatedImages = [...heroImages, imageUrl];
                setHeroImages(updatedImages);
                const saveRes = await apiClient.put('/api/tenant/hero-images', { images: updatedImages });
                if (saveRes.data.success) {
                    message.success('Görsel yüklendi ve eklendi');
                }
            }
        } catch (error) {
            console.error('Hero image upload error:', error);
            message.error('Görsel yüklenemedi');
        } finally {
            setHeroImageUploading(false);
        }
        return false;
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
            const res = await apiClient.post('/api/upload/logo', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                const { url, variants } = res.data.data;
                setBrandingData(prev => ({
                    ...prev,
                    logoUrl: url,
                    logoVariants: variants || null,
                    faviconUrl: variants?.favicon || prev.faviconUrl
                }));
                message.success('Logo optimize edildi ve yüklendi');
            }
        } catch (error) {
            console.error('Logo upload error:', error);
            message.error('Logo yüklenemedi');
        } finally {
            setLogoUploading(false);
        }
        return false;
    };

    const saveSections = async (sections: string[]) => {
        try {
            setSectionsSaving(true);
            await apiClient.put('/api/tenant/settings', { homepageSections: sections });
        } catch (error) {
            console.error('Update sections error:', error);
            message.error('Bölümler güncellenemedi');
        } finally {
            setSectionsSaving(false);
        }
    };

    const handleSaveSections = () => saveSections(activeSections);

    const moveSectionUp = (idx: number) => {
        if (idx === 0) return;
        const arr = [...activeSections];
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        setActiveSections(arr);
        saveSections(arr);
    };

    const moveSectionDown = (idx: number) => {
        if (idx >= activeSections.length - 1) return;
        const arr = [...activeSections];
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        setActiveSections(arr);
        saveSections(arr);
    };

    const toggleSection = (key: string) => {
        const updated = activeSections.includes(key)
            ? activeSections.filter(s => s !== key)
            : [...activeSections, key];
        setActiveSections(updated);
        saveSections(updated);
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

    const handleTrackPageImageUpload = async (file: File) => {
        try {
            setTrackPageImgUploading(true);
            const formData = new FormData();
            formData.append('file', file);
            const res = await apiClient.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                setTrackPage(prev => ({ ...prev, heroImage: res.data.data.url }));
                message.success('Görsel yüklendi');
            }
        } catch {
            message.error('Görsel yüklenemedi');
        } finally {
            setTrackPageImgUploading(false);
        }
    };

    const handleSaveTrackPage = async () => {
        try {
            setTrackPageSaving(true);
            const res = await apiClient.put('/api/tenant/settings', { trackPage });
            if (res.data.success) message.success('Rezervasyon sayfası görseli kaydedildi');
        } catch {
            message.error('Kaydedilemedi');
        } finally {
            setTrackPageSaving(false);
        }
    };

    const handleSaveContact = async () => {
        try {
            setContactSaving(true);
            const res = await apiClient.put('/api/tenant/settings', { contactPage });
            if (res.data.success) {
                message.success('İletişim sayfası ayarları güncellendi');
            }
        } catch (error) {
            console.error('Save contact error:', error);
            message.error('İletişim ayarları kaydedilemedi');
        } finally {
            setContactSaving(false);
        }
    };

    const addBranch = () => {
        setContactPage(prev => ({
            ...prev,
            branches: [...prev.branches, { name: '', badge: '', address: '', phone: '', hours: '', mapEmbedUrl: '' }]
        }));
    };

    const updateBranch = (idx: number, field: string, value: string) => {
        setContactPage(prev => {
            const branches = [...prev.branches];
            branches[idx] = { ...branches[idx], [field]: value };
            return { ...prev, branches };
        });
    };

    const removeBranch = (idx: number) => {
        setContactPage(prev => ({
            ...prev,
            branches: prev.branches.filter((_, i) => i !== idx)
        }));
    };

    const addFormSubject = () => {
        setContactPage(prev => ({
            ...prev,
            formSubjects: [...prev.formSubjects, { value: '', label: '' }]
        }));
    };

    const updateFormSubject = (idx: number, field: string, value: string) => {
        setContactPage(prev => {
            const subjects = [...prev.formSubjects];
            subjects[idx] = { ...subjects[idx], [field]: value };
            return { ...prev, formSubjects: subjects };
        });
    };

    const removeFormSubject = (idx: number) => {
        setContactPage(prev => ({
            ...prev,
            formSubjects: prev.formSubjects.filter((_, i) => i !== idx)
        }));
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
                                    <Form.Item label="Ticari Ünvan" extra="Firma resmi ticari ünvanı (örn: ABC Turizm A.Ş.)">
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
                                    Firma logonuzu yükleyin. Logo otomatik olarak tüm kullanım alanlarına uygun boyutlara optimize edilir.
                                    Herhangi bir boyutta yükleyebilirsiniz — sistem otomatik hizalar.
                                </Text>
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => { handleLogoUpload(file); return false; }}
                                >
                                    <Button icon={<UploadOutlined />} loading={logoUploading} size="large">
                                        {logoUploading ? 'Optimize ediliyor...' : 'Logo Yükle'}
                                    </Button>
                                </Upload>
                                {brandingData.logoVariants && (
                                    <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
                                        <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 6 }}>✓ Logo optimize edildi — tüm varyantlar oluşturuldu:</Text>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {[
                                                { key: 'header', label: 'Site Başlığı (200×60)' },
                                                { key: 'voucher', label: 'Voucher (300×80)' },
                                                { key: 'email', label: 'E-posta (200×50)' },
                                                { key: 'favicon', label: 'Favicon (64×64)' },
                                            ].map(v => brandingData.logoVariants[v.key] && (
                                                <span key={v.key} style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>{v.label}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
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
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 90
                                }}>
                                    {brandingData.logoUrl ? (
                                        <img
                                            src={getImageUrl(brandingData.logoVariants?.header || brandingData.logoUrl)}
                                            alt="Logo"
                                            style={{ height: 60, maxWidth: 280, objectFit: 'contain' }}
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
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 90,
                                    border: '1px solid #e5e7eb'
                                }}>
                                    {brandingData.logoUrl ? (
                                        <img
                                            src={getImageUrl(brandingData.logoVariants?.header || brandingData.logoUrl)}
                                            alt="Logo"
                                            style={{ height: 60, maxWidth: 280, objectFit: 'contain' }}
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div>
                                        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                                            Bilgisayarınızdan görsel yükleyin:
                                        </Text>
                                        <Upload
                                            accept="image/*"
                                            showUploadList={false}
                                            beforeUpload={(file) => { handleHeroImageUpload(file); return false; }}
                                        >
                                            <Button icon={<UploadOutlined />} loading={heroImageUploading} size="large" type="primary">
                                                {heroImageUploading ? 'Yükleniyor...' : 'Görsel Yükle'}
                                            </Button>
                                        </Upload>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                                            Veya URL ile ekleyin:
                                        </Text>
                                        <Space.Compact style={{ width: '100%' }}>
                                            <Input
                                                placeholder="Görsel URL (https://...)"
                                                value={newImageUrl}
                                                onChange={(e) => setNewImageUrl(e.target.value)}
                                                onPressEnter={handleAddImage}
                                            />
                                            <Button type="primary" onClick={handleAddImage} icon={<PlusOutlined />}>Ekle</Button>
                                        </Space.Compact>
                                    </div>
                                </div>
                            </Card>

                            <Card title="Mevcut Görseller" variant="borderless">
                                <Row gutter={[16, 16]}>
                                    {heroImages.map((url, index) => (
                                        <Col xs={24} sm={12} md={8} key={index}>
                                            <Card
                                                cover={
                                                    <div style={{ height: 200, overflow: 'hidden' }}>
                                                        <Image
                                                            src={getImageUrl(url) || url}
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
                        <Card title="Rezervasyon Sorgula Sayfası — Hero Görseli" variant="borderless" extra={
                        <Button type="primary" icon={<SaveOutlined />} loading={trackPageSaving} onClick={handleSaveTrackPage}>Kaydet</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Rezervasyon sorgulama sayfasının üst hero bölümünde gösterilecek arka plan görselini yükleyin.
                        </Text>
                        <Row gutter={16} align="middle">
                            <Col xs={24} md={16}>
                                <Form.Item label="Hero Arka Plan Görseli" style={{ marginBottom: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        <Upload showUploadList={false} accept="image/*" beforeUpload={(file) => { handleTrackPageImageUpload(file); return false; }}>
                                            <Button icon={<UploadOutlined />} loading={trackPageImgUploading}>Görsel Yükle</Button>
                                        </Upload>
                                        <Input
                                            value={trackPage.heroImage}
                                            onChange={e => setTrackPage(prev => ({ ...prev, heroImage: e.target.value }))}
                                            placeholder="https://... veya yükle"
                                            style={{ flex: 1, minWidth: 200 }}
                                            allowClear
                                        />
                                    </div>
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                {trackPage.heroImage && (
                                    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', maxHeight: 120 }}>
                                        <img src={trackPage.heroImage.startsWith('http') ? trackPage.heroImage : getImageUrl(trackPage.heroImage)} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>Hero Önİzleme</Text>
                                        </div>
                                    </div>
                                )}
                            </Col>
                        </Row>
                    </Card>

                    <Card title="Hero Bölümü (Ana Sayfa Üst Banner)" variant="borderless">
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Ana sayfanın en üstünde görünen başlık ve alt yazıyı düzenleyin. Bu alanlar &quot;Özel Tema&quot; sekmesindeki başlık/alt başlık alanları ile aynı veriyi kullanır.
                        </Text>
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item label="Hero Başlık" extra="Ör: Güvenilir Transfer Hizmeti">
                                    <Input
                                        value={customTheme.heroTitle}
                                        onChange={e => setCustomTheme(prev => ({ ...prev, heroTitle: e.target.value }))}
                                        placeholder="Güvenilir Transfer Hizmeti"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label="Hero Alt Yazı" extra="Ör: Havalimanı transferinden şehirler arası...">
                                    <Input.TextArea
                                        value={customTheme.heroSubtitle}
                                        onChange={e => setCustomTheme(prev => ({ ...prev, heroSubtitle: e.target.value }))}
                                        placeholder="Havalimanı transferinden şehirler arası ulaşıma..."
                                        rows={2}
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveCustomTheme} loading={customThemeSaving}>
                            Hero Başlıklarını Kaydet
                        </Button>
                    </Card>

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
                                            <Col span={16}>
                                                <Form.Item label="Görsel" style={{ marginBottom: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <Upload showUploadList={false} accept="image/*" beforeUpload={(file) => { handleRouteImageUpload(file, idx); return false; }}>
                                                            <Button icon={<UploadOutlined />} size="small" loading={routeImgUploading === idx}>Yükle</Button>
                                                        </Upload>
                                                        {route.img && <img src={route.img.startsWith('http') ? route.img : getImageUrl(route.img)} alt="" style={{ height: 40, width: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />}
                                                        <Input value={route.img} onChange={e => updateRouteItem(idx, 'img', e.target.value)} placeholder="https://... veya yükle" size="small" style={{ flex: 1, minWidth: 120 }} />
                                                    </div>
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
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

                    <Card title="Müşteri Yorumları" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addTestimonialItem}>Yorum Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Ana sayfadaki &quot;Müşteri Yorumları&quot; bölümünde gösterilecek referansları yönetin.
                        </Text>
                        <Row gutter={[16, 16]}>
                            {testimonialItems.map((item, idx) => (
                                <Col xs={24} md={8} key={idx}>
                                    <Card size="small" style={{ background: '#fafafa' }}>
                                        <Row gutter={[8, 8]}>
                                            <Col span={12}>
                                                <Form.Item label="İsim" style={{ marginBottom: 8 }}>
                                                    <Input value={item.name} onChange={e => updateTestimonialItem(idx, 'name', e.target.value)} placeholder="Ahmet Y." />
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item label="Şehir" style={{ marginBottom: 8 }}>
                                                    <Input value={item.city} onChange={e => updateTestimonialItem(idx, 'city', e.target.value)} placeholder="İstanbul" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={24}>
                                                <Form.Item label="Yorum Metni" style={{ marginBottom: 8 }}>
                                                    <Input.TextArea value={item.text} onChange={e => updateTestimonialItem(idx, 'text', e.target.value)} rows={3} placeholder="Transfer deneyiminiz hakkında..." />
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item label="Puan" style={{ marginBottom: 0 }}>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        {[1, 2, 3, 4, 5].map(r => (
                                                            <StarOutlined
                                                                key={r}
                                                                onClick={() => updateTestimonialItem(idx, 'rating', r)}
                                                                style={{ fontSize: 18, color: r <= item.rating ? '#fbbf24' : '#d9d9d9', cursor: 'pointer' }}
                                                            />
                                                        ))}
                                                    </div>
                                                </Form.Item>
                                            </Col>
                                            <Col span={12} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                                                <Button danger icon={<DeleteOutlined />} size="small" onClick={() => removeTestimonialItem(idx)}>Sil</Button>
                                            </Col>
                                        </Row>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                        {testimonialItems.length === 0 && (
                            <Text type="secondary" style={{ textAlign: 'center', padding: 24 }}>Henüz yorum eklenmemiş. &quot;Yorum Ekle&quot; butonu ile ekleyin.</Text>
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
            key: 'tursab',
            label: (
                <span>
                    <SafetyCertificateOutlined />
                    Tanımlar / TÜRSAB
                </span>
            ),
            children: (
                <Card title="TÜRSAB Dijital Doğrulama Sistemi" variant="borderless" extra={
                    <Button type="primary" icon={<SaveOutlined />} loading={tursabSaving} onClick={handleSaveTursab}>
                        Kaydet
                    </Button>
                }>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                        TÜRSAB dijital doğrulama badge&apos;ini footer&apos;da göstermek için aşağıdaki bilgileri doldurun.
                        Badge sadece &quot;Aktif&quot; olduğunda görünür.
                    </Text>
                    <Form layout="vertical">
                        <Form.Item label="TÜRSAB Badge Durumu">
                            <Switch
                                checked={tursab.enabled}
                                onChange={checked => setTursab(prev => ({ ...prev, enabled: checked }))}
                                checkedChildren="Aktif"
                                unCheckedChildren="Pasif"
                            />
                        </Form.Item>
                        <Row gutter={16}>
                            <Col xs={24} md={8}>
                                <Form.Item label="Belge No" extra="TÜRSAB kayıt belge numaranız">
                                    <Input
                                        value={tursab.belgeNo}
                                        onChange={e => setTursab(prev => ({ ...prev, belgeNo: e.target.value }))}
                                        placeholder="10728"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={16}>
                                <Form.Item label="Doğrulama URL" extra="TÜRSAB dijital doğrulama bağlantı adresi">
                                    <Input
                                        value={tursab.verificationUrl}
                                        onChange={e => setTursab(prev => ({ ...prev, verificationUrl: e.target.value }))}
                                        placeholder="https://www.tursab.org.tr/tr/dds"
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        {tursab.enabled && tursab.belgeNo && (
                            <div style={{ padding: 20, background: '#fafafa', borderRadius: 12, border: '1px solid #e5e7eb', maxWidth: 340 }}>
                                <Text strong style={{ display: 'block', marginBottom: 8 }}>Önizleme:</Text>
                                <div style={{ background: '#fff', border: '2px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <SafetyCertificateOutlined style={{ fontSize: 28, color: '#dc2626' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', letterSpacing: 1 }}>TÜRSAB</div>
                                        <div style={{ fontSize: 10, color: '#666', lineHeight: 1.3 }}>Dijital Doğrulama Sistemi</div>
                                        <div style={{ fontSize: 11, marginTop: 2 }}>Belge No: <strong>{tursab.belgeNo}</strong></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Form>
                </Card>
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
        {
            key: 'contact',
            label: (
                <span>
                    <PhoneOutlined />
                    İletişim Sayfası
                </span>
            ),
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <Card title="İletişim Sayfası Ayarları" variant="borderless" extra={
                        <Button type="primary" icon={<SaveOutlined />} loading={contactSaving} onClick={handleSaveContact}>
                            Tümünü Kaydet
                        </Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                            İletişim sayfasında gösterilecek tüm bilgileri buradan yönetebilirsiniz. Değişiklikler kaydettikten sonra <a href="/contact" target="_blank">/contact</a> sayfasında görünecektir.
                        </Text>

                        <Title level={5} style={{ marginBottom: 12, marginTop: 24 }}>Sayfa Başlığı & Hero</Title>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item label="Ana Başlık" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.heroTitle} onChange={e => setContactPage(p => ({ ...p, heroTitle: e.target.value }))} placeholder="Bizimle İletişime Geçin" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label="Alt Başlık" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.heroSubtitle} onChange={e => setContactPage(p => ({ ...p, heroSubtitle: e.target.value }))} placeholder="Sorularınız için..." />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item label="Hero Arka Plan Görseli" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <Upload
                                    showUploadList={false}
                                    accept="image/*"
                                    beforeUpload={async (file) => {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        const res = await apiClient.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                                        if (res.data.success) { setContactPage(p => ({ ...p, heroImage: res.data.data.url })); message.success('Görsel yüklendi'); }
                                        return false;
                                    }}
                                >
                                    <Button icon={<UploadOutlined />}>Görsel Yükle</Button>
                                </Upload>
                                {contactPage.heroImage && (
                                    <>
                                        <img src={contactPage.heroImage} alt="hero" style={{ height: 60, borderRadius: 8, objectFit: 'cover', maxWidth: 160, border: '1px solid #e5e7eb' }} />
                                        <Button size="small" danger onClick={() => setContactPage(p => ({ ...p, heroImage: '' }))}>Kaldır</Button>
                                    </>
                                )}
                                {!contactPage.heroImage && <span style={{ color: '#999', fontSize: 13 }}>Yüklenmemiş — gradient kullanılır</span>}
                            </div>
                            <Input
                                style={{ marginTop: 8 }}
                                value={contactPage.heroImage}
                                onChange={e => setContactPage(p => ({ ...p, heroImage: e.target.value }))}
                                placeholder="https://... (veya yukarıdan yükle)"
                            />
                        </Form.Item>

                        <Title level={5} style={{ marginBottom: 12, marginTop: 24 }}>İletişim Bilgileri</Title>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <Form.Item label="Telefon" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.phone} onChange={e => setContactPage(p => ({ ...p, phone: e.target.value }))} placeholder="0850 123 45 67" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item label="Telefon Saatleri" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.phoneHours} onChange={e => setContactPage(p => ({ ...p, phoneHours: e.target.value }))} placeholder="Hafta içi 09:00 - 18:00" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item label="E-posta" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.email} onChange={e => setContactPage(p => ({ ...p, email: e.target.value }))} placeholder="info@sirketiniz.com" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item label="E-posta Notu" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.emailNote} onChange={e => setContactPage(p => ({ ...p, emailNote: e.target.value }))} placeholder="7/24 e-posta desteği" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={16}>
                                <Form.Item label="Merkez Ofis Adresi" style={{ marginBottom: 12 }}>
                                    <Input value={contactPage.address} onChange={e => setContactPage(p => ({ ...p, address: e.target.value }))} placeholder="Atatürk Mah. Cumhuriyet Cad. No:123..." />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Title level={5} style={{ marginBottom: 12, marginTop: 16 }}>Çalışma Saatleri</Title>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>Her satır ayrı bir çalışma saati olarak gösterilir.</Text>
                        {contactPage.workingHours.map((h, i) => (
                            <Space key={i} style={{ display: 'flex', marginBottom: 8 }}>
                                <Input
                                    value={h}
                                    onChange={e => {
                                        const wh = [...contactPage.workingHours];
                                        wh[i] = e.target.value;
                                        setContactPage(p => ({ ...p, workingHours: wh }));
                                    }}
                                    placeholder="Pzt - Cmt: 09:00 - 19:00"
                                    style={{ width: 300 }}
                                />
                                <Button danger icon={<DeleteOutlined />} onClick={() => setContactPage(p => ({ ...p, workingHours: p.workingHours.filter((_, idx) => idx !== i) }))} />
                            </Space>
                        ))}
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => setContactPage(p => ({ ...p, workingHours: [...p.workingHours, ''] }))} size="small">
                            Satır Ekle
                        </Button>

                        <Title level={5} style={{ marginBottom: 12, marginTop: 24 }}>Ana Harita (Google Maps Embed)</Title>
                        <Form.Item label="Harita Embed URL" extra="Google Maps → Paylaş → Haritayı yerleştir → iframe src URL'sini yapıştırın" style={{ marginBottom: 0 }}>
                            <Input
                                value={contactPage.mainMapUrl}
                                onChange={e => {
                                    let v = e.target.value.trim();
                                    if (v.startsWith('<')) { const m = v.match(/src=["']([^"']+)["']/); v = m ? m[1] : v; }
                                    setContactPage(p => ({ ...p, mainMapUrl: v }));
                                }}
                                placeholder="https://www.google.com/maps/embed?pb=..."
                            />
                        </Form.Item>
                    </Card>

                    <Card title="Şubeler" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addBranch}>Şube Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            İletişim sayfasında harita ile birlikte gösterilecek şubelerinizi ekleyin.
                        </Text>
                        {contactPage.branches.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                                <EnvironmentOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                                <br />
                                <Text type="secondary">Henüz şube eklenmemiş. "Şube Ekle" butonuna tıklayın.</Text>
                            </div>
                        )}
                        {contactPage.branches.map((branch, idx) => (
                            <Card
                                key={idx}
                                size="small"
                                style={{ marginBottom: 16, background: '#fafafa' }}
                                title={`Şube ${idx + 1}${branch.name ? ': ' + branch.name : ''}`}
                                extra={<Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeBranch(idx)}>Sil</Button>}
                            >
                                <Row gutter={[12, 12]}>
                                    <Col xs={24} md={8}>
                                        <Form.Item label="Şube Adı" style={{ marginBottom: 8 }}>
                                            <Input value={branch.name} onChange={e => updateBranch(idx, 'name', e.target.value)} placeholder="İstanbul - Şişli" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item label="Etiket / Badge" style={{ marginBottom: 8 }}>
                                            <Input value={branch.badge} onChange={e => updateBranch(idx, 'badge', e.target.value)} placeholder="Merkez Şube" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item label="Telefon" style={{ marginBottom: 8 }}>
                                            <Input value={branch.phone} onChange={e => updateBranch(idx, 'phone', e.target.value)} placeholder="0212 123 45 67" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item label="Adres" style={{ marginBottom: 8 }}>
                                            <Input value={branch.address} onChange={e => updateBranch(idx, 'address', e.target.value)} placeholder="Atatürk Mah. Cumhuriyet Cad. No:123" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item label="Çalışma Saatleri" style={{ marginBottom: 8 }}>
                                            <Input value={branch.hours} onChange={e => updateBranch(idx, 'hours', e.target.value)} placeholder="Her gün 09:00 - 19:00" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                        <Form.Item label="Google Maps Embed URL" extra="Google Maps → Paylaş → Haritayı yerleştir → iframe src URL'si" style={{ marginBottom: 8 }}>
                                            <Input
                                                value={branch.mapEmbedUrl}
                                                onChange={e => {
                                                    let v = e.target.value.trim();
                                                    if (v.startsWith('<')) { const m = v.match(/src=["']([^"']+)["']/); v = m ? m[1] : v; }
                                                    updateBranch(idx, 'mapEmbedUrl', v);
                                                }}
                                                placeholder="https://www.google.com/maps/embed?pb=..."
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Card>
                        ))}
                    </Card>

                    <Card title="İletişim Formu Konuları" variant="borderless" extra={
                        <Button icon={<PlusOutlined />} onClick={addFormSubject} size="small">Konu Ekle</Button>
                    }>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                            Ziyaretçilerin iletişim formunda seçebileceği konu başlıklarını belirleyin.
                        </Text>
                        {contactPage.formSubjects.map((subj, idx) => (
                            <Space key={idx} style={{ display: 'flex', marginBottom: 8 }}>
                                <Input value={subj.value} onChange={e => updateFormSubject(idx, 'value', e.target.value)} placeholder="Anahtar (örn: destek)" style={{ width: 150 }} />
                                <Input value={subj.label} onChange={e => updateFormSubject(idx, 'label', e.target.value)} placeholder="Görünen isim (örn: Teknik Destek)" style={{ width: 250 }} />
                                <Button danger icon={<DeleteOutlined />} onClick={() => removeFormSubject(idx)} />
                            </Space>
                        ))}
                    </Card>

                    <div style={{ textAlign: 'right' }}>
                        <Button type="primary" size="large" icon={<SaveOutlined />} loading={contactSaving} onClick={handleSaveContact}>
                            İletişim Sayfasını Kaydet
                        </Button>
                    </div>
                </div>
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
