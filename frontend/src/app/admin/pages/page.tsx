'use client';

import React, { useState, useEffect } from 'react';
import {
    Card,
    Typography,
    Button,
    Table,
    Modal,
    Form,
    Input,
    Switch,
    Select,
    Space,
    Tag,
    message,
    Popconfirm,
    InputNumber,
    Tabs,
    Row,
    Col,
    Tooltip,
    Divider,
    Badge,
    Empty
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    FileTextOutlined,
    GlobalOutlined,
    MenuOutlined,
    SaveOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ShareAltOutlined,
    LinkOutlined,
    CopyOutlined,
    FacebookOutlined,
    InstagramOutlined,
    TwitterOutlined,
    YoutubeOutlined,
    LinkedinOutlined,
    WhatsAppOutlined,
    SendOutlined
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import RichTextEditor from '../../components/RichTextEditor';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── Social Media Platform Definitions ───
interface SocialPlatform {
    key: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    placeholder: string;
    prefix: string;
}

const SOCIAL_PLATFORMS: SocialPlatform[] = [
    { key: 'facebook', label: 'Facebook', icon: <FacebookOutlined />, color: '#1877F2', placeholder: 'https://facebook.com/isletmeniz', prefix: 'facebook.com/' },
    { key: 'instagram', label: 'Instagram', icon: <InstagramOutlined />, color: '#E4405F', placeholder: 'https://instagram.com/isletmeniz', prefix: 'instagram.com/' },
    { key: 'twitter', label: 'X (Twitter)', icon: <TwitterOutlined />, color: '#000000', placeholder: 'https://x.com/isletmeniz', prefix: 'x.com/' },
    { key: 'youtube', label: 'YouTube', icon: <YoutubeOutlined />, color: '#FF0000', placeholder: 'https://youtube.com/@isletmeniz', prefix: 'youtube.com/' },
    { key: 'linkedin', label: 'LinkedIn', icon: <LinkedinOutlined />, color: '#0A66C2', placeholder: 'https://linkedin.com/company/isletmeniz', prefix: 'linkedin.com/' },
    { key: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppOutlined />, color: '#25D366', placeholder: 'https://wa.me/905XXXXXXXXX', prefix: 'wa.me/' },
    { key: 'telegram', label: 'Telegram', icon: <SendOutlined />, color: '#229ED9', placeholder: 'https://t.me/isletmeniz', prefix: 't.me/' },
    { key: 'tiktok', label: 'TikTok', icon: <span style={{ fontWeight: 700, fontSize: 14 }}>♪</span>, color: '#000000', placeholder: 'https://tiktok.com/@isletmeniz', prefix: 'tiktok.com/' },
    { key: 'pinterest', label: 'Pinterest', icon: <span style={{ fontWeight: 700, fontSize: 14 }}>P</span>, color: '#BD081C', placeholder: 'https://pinterest.com/isletmeniz', prefix: 'pinterest.com/' },
    { key: 'tripadvisor', label: 'TripAdvisor', icon: <span style={{ fontWeight: 700, fontSize: 13 }}>TA</span>, color: '#34E0A1', placeholder: 'https://tripadvisor.com/...', prefix: 'tripadvisor.com/' },
];

interface PageItem {
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    icon: string;
    isPublished: boolean;
    showInMenu: boolean;
    showInFooter: boolean;
    menuOrder: number;
    category: string;
    metaTitle: string;
    metaDescription: string;
    createdAt: string;
    updatedAt: string;
}

const PAGE_TEMPLATES = [
    { key: 'hakkimizda', title: 'Hakkımızda', slug: 'hakkimizda', category: 'corporate', icon: 'InfoCircleOutlined', excerpt: 'Şirketimiz hakkında bilgi edinin.' },
    { key: 'iletisim', title: 'Bize Ulaşın', slug: 'iletisim', category: 'corporate', icon: 'PhoneOutlined', excerpt: 'Bizimle iletişime geçin.' },
    { key: 'seyahat-rehberi', title: 'Seyahat Rehberi', slug: 'seyahat-rehberi', category: 'guide', icon: 'CompassOutlined', excerpt: 'Seyahat ipuçları ve rehber bilgileri.' },
    { key: 'sss', title: 'Sıkça Sorulan Sorular', slug: 'sss', category: 'support', icon: 'QuestionCircleOutlined', excerpt: 'Merak edilen sorular ve cevapları.' },
    { key: 'gizlilik', title: 'Gizlilik Politikası', slug: 'gizlilik-politikasi', category: 'legal', icon: 'LockOutlined', excerpt: 'Kişisel veri koruma politikamız.' },
    { key: 'kullanim-kosullari', title: 'Kullanım Koşulları', slug: 'kullanim-kosullari', category: 'legal', icon: 'FileProtectOutlined', excerpt: 'Hizmet kullanım şartları.' },
    { key: 'iptal-iade', title: 'İptal ve İade Politikası', slug: 'iptal-iade-politikasi', category: 'legal', icon: 'RollbackOutlined', excerpt: 'Rezervasyon iptal ve iade koşulları.' },
    { key: 'transfer-hizmetleri', title: 'Transfer Hizmetleri', slug: 'transfer-hizmetleri', category: 'service', icon: 'CarOutlined', excerpt: 'Sunduğumuz transfer hizmetleri.' },
];

const CATEGORY_OPTIONS = [
    { value: 'corporate', label: 'Kurumsal' },
    { value: 'guide', label: 'Rehber' },
    { value: 'support', label: 'Destek' },
    { value: 'legal', label: 'Yasal' },
    { value: 'service', label: 'Hizmet' },
    { value: 'general', label: 'Genel' },
];

const CATEGORY_COLORS: Record<string, string> = {
    corporate: 'blue',
    guide: 'green',
    support: 'orange',
    legal: 'red',
    service: 'purple',
    general: 'default',
};

const PagesManagement: React.FC = () => {
    const [pages, setPages] = useState<PageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingPage, setEditingPage] = useState<PageItem | null>(null);
    const [form] = Form.useForm();
    const [activeTab, setActiveTab] = useState('list');

    // Social Media
    const [socialMedia, setSocialMedia] = useState<Record<string, string>>({});
    const [socialLoading, setSocialLoading] = useState(false);
    const [socialSaving, setSocialSaving] = useState(false);

    useEffect(() => {
        fetchPages();
        fetchSocialMedia();
    }, []);

    const fetchSocialMedia = async () => {
        try {
            setSocialLoading(true);
            const res = await apiClient.get('/api/tenant/settings');
            if (res.data.success) {
                const sm = res.data.data?.settings?.socialMedia || {};
                setSocialMedia(sm);
            }
        } catch (error) {
            console.error('Fetch social media error:', error);
        } finally {
            setSocialLoading(false);
        }
    };

    const handleSaveSocialMedia = async () => {
        try {
            setSocialSaving(true);
            // Filter out empty values
            const cleaned: Record<string, string> = {};
            Object.entries(socialMedia).forEach(([k, v]) => {
                if (v && v.trim()) cleaned[k] = v.trim();
            });
            const res = await apiClient.put('/api/tenant/settings', { socialMedia: cleaned });
            if (res.data.success) {
                message.success('Sosyal medya hesapları kaydedildi');
                setSocialMedia(cleaned);
            }
        } catch (error) {
            message.error('Kaydetme sırasında hata oluştu');
        } finally {
            setSocialSaving(false);
        }
    };

    const fetchPages = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/pages/all');
            if (res.data.success) {
                setPages(res.data.data.pages || []);
            }
        } catch (error) {
            console.error('Fetch pages error:', error);
            message.error('Sayfalar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingPage(null);
        form.resetFields();
        form.setFieldsValue({
            isPublished: true,
            showInMenu: true,
            showInFooter: false,
            menuOrder: 0,
            category: 'general'
        });
        setModalVisible(true);
    };

    const handleEdit = (page: PageItem) => {
        setEditingPage(page);
        form.setFieldsValue(page);
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await apiClient.delete(`/api/pages/${id}`);
            if (res.data.success) {
                message.success('Sayfa silindi');
                fetchPages();
            }
        } catch (error) {
            message.error('Sayfa silinemedi');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (editingPage) {
                const res = await apiClient.put(`/api/pages/${editingPage.id}`, values);
                if (res.data.success) {
                    message.success('Sayfa güncellendi');
                }
            } else {
                const res = await apiClient.post('/api/pages', values);
                if (res.data.success) {
                    message.success('Sayfa oluşturuldu');
                }
            }

            setModalVisible(false);
            fetchPages();
        } catch (error: any) {
            if (error.response?.data?.error) {
                message.error(error.response.data.error);
            } else {
                message.error('İşlem sırasında hata oluştu');
            }
        }
    };

    const TEMPLATE_CONTENTS: Record<string, string> = {
        'hakkimizda': `<h2>Hakkımızda</h2>
<p>Firmamız, yılların deneyimi ile havalimanı transferi ve şehirler arası ulaşım hizmetleri sunmaktadır. Müşteri memnuniyetini en ön planda tutarak, güvenli, konforlu ve zamanında hizmet anlayışıyla çalışmaktayız.</p>
<h3>Misyonumuz</h3>
<p>Yolcularımıza en güvenli, en konforlu ve en uygun fiyatlı transfer hizmetini sunmak. Her yolculuğu özel kılarak, müşterilerimizin seyahat deneyimini mükemmelleştirmek için çalışıyoruz.</p>
<h3>Vizyonumuz</h3>
<p>Türkiye'nin lider transfer hizmeti sağlayıcısı olmak ve hizmet kalitemizi uluslararası standartlara taşımak. Teknolojiyi en etkin şekilde kullanarak, sektörde yenilikçi çözümler üretmeye devam ediyoruz.</p>
<h3>Neden Bizi Tercih Etmelisiniz?</h3>
<ul>
<li><strong>Profesyonel Şoförler:</strong> Deneyimli, lisanslı ve güler yüzlü şoför kadromuz</li>
<li><strong>Geniş Araç Filosu:</strong> Sedan, VIP, minibüs ve otobüs seçenekleri</li>
<li><strong>7/24 Hizmet:</strong> Gece gündüz kesintisiz müşteri desteği</li>
<li><strong>Uygun Fiyat:</strong> Rekabetçi fiyatlarla kaliteli hizmet</li>
<li><strong>Sigortalı Yolculuk:</strong> Tüm yolculuklarımız tam sigorta kapsamındadır</li>
</ul>`,
        'iletisim': `<h2>Bize Ulaşın</h2>
<p>Sorularınız, önerileriniz veya rezervasyon talepleriniz için bizimle iletişime geçebilirsiniz. Ekibimiz size en kısa sürede dönüş yapacaktır.</p>
<h3>İletişim Bilgilerimiz</h3>
<ul>
<li><strong>Telefon:</strong> +90 (XXX) XXX XX XX</li>
<li><strong>WhatsApp:</strong> +90 (XXX) XXX XX XX</li>
<li><strong>E-posta:</strong> info@firmaadi.com</li>
<li><strong>Adres:</strong> Merkez Mahallesi, Atatürk Caddesi No:1, İstanbul</li>
</ul>
<h3>Çalışma Saatlerimiz</h3>
<p><strong>Rezervasyon:</strong> 7/24 (Online veya telefonla)</p>
<p><strong>Ofis:</strong> Pazartesi - Cumartesi: 09:00 - 18:00</p>
<h3>Bize Yazın</h3>
<p>Aşağıdaki formu doldurarak bize mesaj gönderebilirsiniz. En kısa sürede size geri dönüş yapacağız.</p>`,
        'seyahat-rehberi': `<h2>Seyahat Rehberi</h2>
<p>Türkiye'ye seyahat planı yapanlar için faydalı bilgiler ve ipuçları derledik.</p>
<h3>Havalimanı Transfer İpuçları</h3>
<ul>
<li><strong>Önceden Rezervasyon:</strong> Havalimanı transferinizi en az 24 saat önceden rezerve edin</li>
<li><strong>Uçuş Bilgisi:</strong> Rezervasyon sırasında uçuş numaranızı paylaşın, gecikmeler takip edilsin</li>
<li><strong>Buluşma Noktası:</strong> Şoförünüz çıkış kapısında isim tabelasıyla sizi karşılayacaktır</li>
<li><strong>Bagaj:</strong> Büyük bagajlarınız için uygun araç tipi seçmeyi unutmayın</li>
</ul>
<h3>Popüler Destinasyonlar</h3>
<p><strong>Antalya:</strong> Türkiye'nin turizm başkenti. Kemer, Belek, Side, Alanya gibi tatil beldelerine transfer hizmeti sunuyoruz.</p>
<p><strong>İstanbul:</strong> Tarihi ve modern yüzüyle büyüleyen şehir. Havalimanından şehir merkezine konforlu ulaşım.</p>
<p><strong>Bodrum:</strong> Ege'nin incisi. Havalimanından yarımadanın her noktasına transfer.</p>
<p><strong>Dalaman / Fethiye:</strong> Doğa harikası koylar ve plajlarıyla ünlü bölge.</p>
<h3>Genel Seyahat Tavsiyeleri</h3>
<ul>
<li>Pasaport ve kimlik belgelerinizi yanınızda bulundurun</li>
<li>Yerel para birimi (Türk Lirası) bulundurun</li>
<li>Güneş kremi ve şapka gibi koruyucu malzemeler alın</li>
<li>Acil durumlar için otel ve transfer firma numaralarını kaydedin</li>
</ul>`,
        'sss': `<h2>Sıkça Sorulan Sorular</h2>
<h3>Rezervasyon ile İlgili</h3>
<p><strong>Nasıl rezervasyon yapabilirim?</strong></p>
<p>Web sitemiz üzerinden online olarak, telefonla veya WhatsApp üzerinden rezervasyon yapabilirsiniz.</p>
<p><strong>Rezervasyonumu nasıl iptal edebilirim?</strong></p>
<p>Transfer saatinizden 24 saat öncesine kadar ücretsiz iptal yapabilirsiniz. Detaylar için iptal politikamızı inceleyebilirsiniz.</p>
<p><strong>Rezervasyonumu değiştirebilir miyim?</strong></p>
<p>Evet, transfer saatinden 12 saat öncesine kadar tarih ve saat değişikliği yapabilirsiniz.</p>
<h3>Ödeme ile İlgili</h3>
<p><strong>Hangi ödeme yöntemlerini kabul ediyorsunuz?</strong></p>
<p>Kredi kartı, banka kartı, havale/EFT ve araç içi nakit ödeme seçeneklerimiz mevcuttur.</p>
<p><strong>Fiyatlara KDV dahil mi?</strong></p>
<p>Evet, web sitemizdeki tüm fiyatlara KDV dahildir.</p>
<h3>Transfer Hizmeti ile İlgili</h3>
<p><strong>Şoför beni nasıl bulacak?</strong></p>
<p>Şoförünüz havalimanı çıkışında isminizin yazılı olduğu tabela ile sizi karşılayacaktır.</p>
<p><strong>Uçuşum gecikirse ne olur?</strong></p>
<p>Uçuş bilgilerinizi takip ediyoruz. Gecikme durumunda şoförünüz sizi bekler, ek ücret talep edilmez.</p>
<p><strong>Bebek koltuğu temin edebilir misiniz?</strong></p>
<p>Evet, rezervasyon sırasında bebek koltuğu talebinizi belirtmeniz yeterlidir. Ücretsiz olarak temin edilmektedir.</p>`,
        'gizlilik': `<h2>Gizlilik Politikası</h2>
<p>Bu gizlilik politikası, kişisel verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklamaktadır. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında haklarınız saklıdır.</p>
<h3>Toplanan Bilgiler</h3>
<ul>
<li><strong>Kişisel Bilgiler:</strong> Ad, soyad, telefon numarası, e-posta adresi</li>
<li><strong>Rezervasyon Bilgileri:</strong> Transfer güzergahı, tarih, saat, yolcu sayısı</li>
<li><strong>Ödeme Bilgileri:</strong> Kredi kartı bilgileri (güvenli ödeme altyapısı üzerinden)</li>
<li><strong>Teknik Bilgiler:</strong> IP adresi, tarayıcı bilgisi, çerezler</li>
</ul>
<h3>Bilgilerin Kullanımı</h3>
<p>Toplanan bilgiler yalnızca aşağıdaki amaçlarla kullanılmaktadır:</p>
<ul>
<li>Rezervasyon işlemlerinin gerçekleştirilmesi</li>
<li>Müşteri desteği sağlanması</li>
<li>Hizmet kalitesinin iyileştirilmesi</li>
<li>Yasal yükümlülüklerin yerine getirilmesi</li>
</ul>
<h3>Bilgi Güvenliği</h3>
<p>Kişisel verileriniz, endüstri standardı güvenlik önlemleri ile korunmaktadır. SSL şifreleme, güvenli sunucular ve erişim kontrolü uygulanmaktadır.</p>
<h3>Haklarınız</h3>
<p>KVKK kapsamında kişisel verilerinize erişme, düzeltme, silme ve işlenmesine itiraz etme haklarınız bulunmaktadır. Bu haklarınızı kullanmak için bizimle iletişime geçebilirsiniz.</p>`,
        'kullanim-kosullari': `<h2>Kullanım Koşulları</h2>
<p>Web sitemizi ve hizmetlerimizi kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.</p>
<h3>Hizmet Kapsamı</h3>
<p>Firmamız, havalimanı transferi, şehir içi ve şehirler arası özel transfer hizmetleri sunmaktadır. Hizmetlerimiz, web sitesi üzerinden veya telefonla yapılan rezervasyonlar kapsamında gerçekleştirilir.</p>
<h3>Rezervasyon Koşulları</h3>
<ul>
<li>Rezervasyonlar, ödeme onayı ile kesinleşir</li>
<li>Doğru ve eksiksiz bilgi verilmesi yolcunun sorumluluğundadır</li>
<li>Rezervasyon saatinde hazır bulunulması gerekmektedir</li>
</ul>
<h3>Sorumluluk Sınırları</h3>
<p>Doğal afet, terör, grev gibi mücbir sebepler nedeniyle hizmetin sağlanamaması durumunda firmamız sorumluluk kabul etmez. Bu durumlarda ödeme iadesi yapılır.</p>
<h3>Fikri Mülkiyet</h3>
<p>Web sitemizdeki tüm içerik, tasarım ve görseller firmamıza aittir. İzinsiz kopyalanması veya kullanılması yasaktır.</p>`,
        'iptal-iade': `<h2>İptal ve İade Politikası</h2>
<p>Müşteri memnuniyeti önceliğimizdir. Aşağıdaki koşullar çerçevesinde iptal ve iade işlemleri gerçekleştirilmektedir.</p>
<h3>İptal Koşulları</h3>
<ul>
<li><strong>24 saat öncesine kadar:</strong> Ücretsiz iptal</li>
<li><strong>12-24 saat arası:</strong> %50 kesinti ile iptal</li>
<li><strong>12 saatten az:</strong> İptal durumunda iade yapılmaz</li>
</ul>
<h3>İade Süreci</h3>
<p>İptal onayından sonra iade işlemi 5-10 iş günü içinde gerçekleştirilir. İade, ödemenin yapıldığı yöntem üzerinden yapılır.</p>
<h3>Değişiklik Talebi</h3>
<p>Transfer tarih ve saatinde değişiklik, transferden en az 12 saat önce ücretsiz olarak yapılabilir.</p>
<h3>Hizmet Kalitesi Garantisi</h3>
<p>Hizmet kalitemizden memnun kalmamanız durumunda, 48 saat içinde müşteri hizmetlerimize başvurarak şikayetinizi iletebilirsiniz. Her şikayet titizlikle değerlendirilir.</p>`,
        'transfer-hizmetleri': `<h2>Transfer Hizmetlerimiz</h2>
<p>Geniş araç filomuz ve profesyonel şoför kadromuz ile her türlü transfer ihtiyacınıza çözüm sunuyoruz.</p>
<h3>Havalimanı Transferi</h3>
<p>Türkiye'nin tüm önemli havalimanlarından otellerinize veya istediğiniz adrese güvenli ve konforlu transfer hizmeti. Uçuş takip sistemi ile gecikmeleriniz otomatik takip edilir.</p>
<h3>Şehirler Arası Transfer</h3>
<p>Şehirler arasında özel araç ile konforlu ve güvenli yolculuk. Esnek saatlerde, kapıdan kapıya hizmet.</p>
<h3>VIP Transfer</h3>
<p>Lüks araçlarımız ile özel günlerinizde veya iş seyahatlerinizde prestijli bir yolculuk deneyimi yaşayın.</p>
<h3>Grup Transferi</h3>
<p>Büyük gruplar için minibüs ve otobüs seçenekleri ile toplu transfer hizmeti. Düğün, organizasyon ve tur grupları için özel fiyatlar.</p>
<h3>Araç Tiplerimiz</h3>
<ul>
<li><strong>Ekonomi:</strong> Sedan araçlar (1-3 yolcu)</li>
<li><strong>Konfor:</strong> Geniş sedan ve SUV (1-4 yolcu)</li>
<li><strong>VIP:</strong> Mercedes Vito, V-Class (1-6 yolcu)</li>
<li><strong>Minibüs:</strong> Sprinter (7-14 yolcu)</li>
<li><strong>Otobüs:</strong> Midibüs ve otobüs (15-50 yolcu)</li>
</ul>`,
    };

    const handleTemplateCreate = (template: typeof PAGE_TEMPLATES[0]) => {
        setEditingPage(null);
        form.resetFields();
        form.setFieldsValue({
            title: template.title,
            slug: template.slug,
            excerpt: template.excerpt,
            icon: template.icon,
            category: template.category,
            isPublished: true,
            showInMenu: true,
            showInFooter: true,
            menuOrder: 0,
            content: TEMPLATE_CONTENTS[template.key] || `<h2>${template.title}</h2>\n<p>${template.excerpt}</p>`
        });
        setModalVisible(true);
    };

    const generateSlug = (title: string) => {
        return title
            .toLowerCase()
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
            .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    };

    const columns = [
        {
            title: 'Sayfa',
            dataIndex: 'title',
            key: 'title',
            render: (title: string, record: PageItem) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${CATEGORY_COLORS[record.category] === 'blue' ? '#e6f4ff' : CATEGORY_COLORS[record.category] === 'green' ? '#f6ffed' : CATEGORY_COLORS[record.category] === 'red' ? '#fff2f0' : CATEGORY_COLORS[record.category] === 'purple' ? '#f9f0ff' : CATEGORY_COLORS[record.category] === 'orange' ? '#fff7e6' : '#f5f5f5'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: CATEGORY_COLORS[record.category] === 'blue' ? '#1677ff' : CATEGORY_COLORS[record.category] === 'green' ? '#52c41a' : CATEGORY_COLORS[record.category] === 'red' ? '#ff4d4f' : CATEGORY_COLORS[record.category] === 'purple' ? '#722ed1' : CATEGORY_COLORS[record.category] === 'orange' ? '#fa8c16' : '#8c8c8c',
                    }}>
                        <FileTextOutlined />
                    </div>
                    <div>
                        <Text strong style={{ fontSize: 14, display: 'block' }}>{title}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>/sayfa/{record.slug}</Text>
                    </div>
                </div>
            )
        },
        {
            title: 'Kategori',
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (cat: string) => (
                <Tag color={CATEGORY_COLORS[cat] || 'default'} style={{ borderRadius: 6, fontWeight: 500 }}>
                    {CATEGORY_OPTIONS.find(c => c.value === cat)?.label || cat}
                </Tag>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'isPublished',
            key: 'isPublished',
            width: 100,
            render: (published: boolean) => (
                <Tag
                    icon={published ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                    color={published ? 'success' : 'warning'}
                    style={{ borderRadius: 6, fontWeight: 500 }}
                >
                    {published ? 'Yayında' : 'Taslak'}
                </Tag>
            )
        },
        {
            title: 'Görünürlük',
            key: 'menu',
            width: 160,
            render: (_: any, record: PageItem) => (
                <Space size={4}>
                    {record.showInMenu && <Tag color="blue" style={{ borderRadius: 6, fontSize: 11 }}>Üst Menü</Tag>}
                    {record.showInFooter && <Tag color="cyan" style={{ borderRadius: 6, fontSize: 11 }}>Footer</Tag>}
                    {!record.showInMenu && !record.showInFooter && <Text type="secondary" style={{ fontSize: 12 }}>—</Text>}
                </Space>
            )
        },
        {
            title: 'Sıra',
            dataIndex: 'menuOrder',
            key: 'menuOrder',
            width: 60,
            align: 'center' as const,
            sorter: (a: PageItem, b: PageItem) => a.menuOrder - b.menuOrder,
            render: (order: number) => <Badge count={order} showZero style={{ backgroundColor: '#f0f0f0', color: '#595959', fontWeight: 600 }} />
        },
        {
            title: 'İşlemler',
            key: 'actions',
            width: 160,
            render: (_: any, record: PageItem) => (
                <Space size={0}>
                    <Tooltip title="Önizle">
                        <Button type="text" icon={<EyeOutlined />} onClick={() => window.open(`/sayfa/${record.slug}`, '_blank')} />
                    </Tooltip>
                    <Tooltip title="Düzenle">
                        <Button type="text" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => handleEdit(record)} />
                    </Tooltip>
                    <Popconfirm
                        title="Bu sayfayı silmek istediğinize emin misiniz?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Evet"
                        cancelText="Hayır"
                    >
                        <Tooltip title="Sil">
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const filledSocialCount = Object.values(socialMedia).filter(v => v && v.trim()).length;

    const tabItems = [
        {
            key: 'list',
            label: <span><FileTextOutlined style={{ marginRight: 6 }} />Sayfalarım</span>,
            children: (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                Toplam <Text strong>{pages.length}</Text> sayfa
                            </Text>
                        </div>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreate}
                            style={{ borderRadius: 8, fontWeight: 600, height: 40, boxShadow: '0 2px 8px rgba(22,119,255,0.2)' }}
                        >
                            Yeni Sayfa Oluştur
                        </Button>
                    </div>
                    <Table
                        columns={columns}
                        dataSource={pages}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={<Text type="secondary">Henüz sayfa oluşturulmamış</Text>}
                                >
                                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                                        İlk Sayfanızı Oluşturun
                                    </Button>
                                </Empty>
                            )
                        }}
                    />
                </div>
            )
        },
        {
            key: 'templates',
            label: <span><GlobalOutlined style={{ marginRight: 6 }} />Hazır Şablonlar</span>,
            children: (
                <div>
                    <div style={{
                        background: 'linear-gradient(135deg, #667eea15, #764ba215)',
                        borderRadius: 12, padding: '16px 20px', marginBottom: 24,
                        border: '1px solid #667eea20'
                    }}>
                        <Text style={{ fontSize: 14 }}>
                            Bir transfer sitesinde olması gereken standart sayfaları tek tıkla oluşturun.
                            İçerikler hazır gelir, dilediğiniz gibi düzenleyebilirsiniz.
                        </Text>
                    </div>
                    <Row gutter={[16, 16]}>
                        {PAGE_TEMPLATES.map(tpl => {
                            const exists = pages.some(p => p.slug === tpl.slug);
                            return (
                                <Col xs={24} sm={12} md={8} lg={6} key={tpl.key}>
                                    <Card
                                        hoverable={!exists}
                                        style={{
                                            height: '100%', borderRadius: 14,
                                            opacity: exists ? 0.65 : 1,
                                            borderColor: exists ? '#52c41a' : '#f0f0f0',
                                            transition: 'all 0.2s',
                                        }}
                                        styles={{ body: { padding: '20px 16px', textAlign: 'center' } }}
                                    >
                                        <div style={{
                                            width: 52, height: 52, borderRadius: 14,
                                            background: exists ? '#f6ffed' : 'linear-gradient(135deg, #667eea15, #764ba215)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 14px', fontSize: 24,
                                            color: exists ? '#52c41a' : '#667eea',
                                        }}>
                                            {exists ? <CheckCircleOutlined /> : <FileTextOutlined />}
                                        </div>
                                        <Title level={5} style={{ marginBottom: 4, fontSize: 14 }}>
                                            {tpl.title}
                                        </Title>
                                        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                                            {tpl.excerpt}
                                        </Text>
                                        <Tag color={CATEGORY_COLORS[tpl.category]} style={{ borderRadius: 6, marginBottom: 14 }}>
                                            {CATEGORY_OPTIONS.find(c => c.value === tpl.category)?.label}
                                        </Tag>
                                        <Button
                                            type={exists ? 'default' : 'primary'}
                                            block
                                            disabled={exists}
                                            onClick={() => handleTemplateCreate(tpl)}
                                            style={{ borderRadius: 8, fontWeight: 500, height: 36 }}
                                        >
                                            {exists ? '✓ Mevcut' : 'Oluştur'}
                                        </Button>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                </div>
            )
        },
        {
            key: 'social',
            label: (
                <span>
                    <ShareAltOutlined style={{ marginRight: 6 }} />
                    Sosyal Medya
                    {filledSocialCount > 0 && (
                        <Badge count={filledSocialCount} size="small" style={{ marginLeft: 8, backgroundColor: '#52c41a' }} />
                    )}
                </span>
            ),
            children: (
                <div>
                    <div style={{
                        background: 'linear-gradient(135deg, #667eea10, #764ba210)',
                        borderRadius: 12, padding: '20px 24px', marginBottom: 28,
                        border: '1px solid #667eea15'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <ShareAltOutlined style={{ fontSize: 20, color: '#667eea' }} />
                            <Text strong style={{ fontSize: 16 }}>Sosyal Medya Hesapları</Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            İşletmenizin sosyal medya hesaplarını ekleyin. Bu hesaplar web sitenizin footer bölümünde ikon olarak görünecektir.
                        </Text>
                    </div>

                    <Row gutter={[20, 16]}>
                        {SOCIAL_PLATFORMS.map(platform => {
                            const hasValue = !!(socialMedia[platform.key] && socialMedia[platform.key].trim());
                            return (
                                <Col xs={24} sm={12} key={platform.key}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        background: hasValue ? '#fafafa' : '#fff',
                                        border: `1px solid ${hasValue ? platform.color + '30' : '#f0f0f0'}`,
                                        borderRadius: 12, padding: '14px 18px',
                                        transition: 'all 0.2s',
                                    }}>
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 12,
                                            background: hasValue ? platform.color : '#f5f5f5',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: hasValue ? '#fff' : '#bfbfbf',
                                            fontSize: 20, flexShrink: 0,
                                            transition: 'all 0.2s',
                                            boxShadow: hasValue ? `0 4px 12px ${platform.color}30` : 'none',
                                        }}>
                                            {platform.icon}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <Text strong style={{ display: 'block', fontSize: 13, marginBottom: 4, color: hasValue ? '#262626' : '#8c8c8c' }}>
                                                {platform.label}
                                            </Text>
                                            <Input
                                                placeholder={platform.placeholder}
                                                value={socialMedia[platform.key] || ''}
                                                onChange={(e) => setSocialMedia(prev => ({ ...prev, [platform.key]: e.target.value }))}
                                                variant="borderless"
                                                style={{
                                                    padding: 0, fontSize: 13, height: 24,
                                                    color: hasValue ? '#1677ff' : undefined,
                                                }}
                                                suffix={
                                                    hasValue ? (
                                                        <Tooltip title="Bağlantıyı aç">
                                                            <LinkOutlined
                                                                style={{ color: '#1677ff', cursor: 'pointer' }}
                                                                onClick={() => window.open(socialMedia[platform.key], '_blank')}
                                                            />
                                                        </Tooltip>
                                                    ) : null
                                                }
                                            />
                                        </div>
                                        {hasValue && (
                                            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16, flexShrink: 0 }} />
                                        )}
                                    </div>
                                </Col>
                            );
                        })}
                    </Row>

                    <Divider />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            {filledSocialCount} / {SOCIAL_PLATFORMS.length} platform bağlı
                        </Text>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSaveSocialMedia}
                            loading={socialSaving}
                            style={{ borderRadius: 8, fontWeight: 600, height: 42, paddingInline: 32, boxShadow: '0 2px 8px rgba(22,119,255,0.2)' }}
                        >
                            Kaydet
                        </Button>
                    </div>
                </div>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="pages">
                {/* ─── Page Header ─── */}
                <div style={{
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    borderRadius: 16, padding: 'clamp(20px, 3vw, 32px)',
                    marginBottom: 28, position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                    <div style={{ position: 'absolute', bottom: -40, right: 60, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FileTextOutlined style={{ fontSize: 24, color: '#fff' }} />
                            </div>
                            <div>
                                <Title level={3} style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
                                    Sayfa Yönetimi
                                </Title>
                                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                                    Web sitenizin sayfalarını, şablonlarını ve sosyal medya hesaplarını yönetin
                                </Text>
                            </div>
                        </div>
                        {/* Quick Stats */}
                        <Row gutter={24} style={{ marginTop: 20 }}>
                            {[
                                { label: 'Toplam Sayfa', value: pages.length, icon: <FileTextOutlined /> },
                                { label: 'Yayında', value: pages.filter(p => p.isPublished).length, icon: <CheckCircleOutlined /> },
                                { label: 'Menüde', value: pages.filter(p => p.showInMenu).length, icon: <MenuOutlined /> },
                                { label: 'Sosyal Medya', value: filledSocialCount, icon: <ShareAltOutlined /> },
                            ].map((stat, i) => (
                                <Col xs={12} sm={6} key={i}>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)',
                                        borderRadius: 12, padding: '12px 16px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>{stat.icon}</span>
                                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{stat.label}</Text>
                                        </div>
                                        <Title level={3} style={{ color: '#fff', margin: '4px 0 0', fontWeight: 800 }}>
                                            {stat.value}
                                        </Title>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </div>
                </div>

                {/* ─── Tabs ─── */}
                <Card style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }} styles={{ body: { padding: '8px 24px 24px' } }}>
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={tabItems}
                        style={{ marginBottom: 0 }}
                    />
                </Card>

                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: editingPage ? '#e6f4ff' : 'linear-gradient(135deg, #667eea15, #764ba215)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: editingPage ? '#1677ff' : '#667eea',
                            }}>
                                {editingPage ? <EditOutlined /> : <PlusOutlined />}
                            </div>
                            <span>{editingPage ? 'Sayfayı Düzenle' : 'Yeni Sayfa Oluştur'}</span>
                        </div>
                    }
                    open={modalVisible}
                    onOk={handleSubmit}
                    onCancel={() => setModalVisible(false)}
                    width={800}
                    okText={editingPage ? 'Güncelle' : 'Oluştur'}
                    cancelText="İptal"
                    okButtonProps={{ style: { borderRadius: 8, fontWeight: 600, height: 38 } }}
                    cancelButtonProps={{ style: { borderRadius: 8, height: 38 } }}
                >
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col span={16}>
                                <Form.Item
                                    label="Sayfa Başlığı"
                                    name="title"
                                    rules={[{ required: true, message: 'Başlık gerekli' }]}
                                >
                                    <Input
                                        placeholder="Örn: Hakkımızda"
                                        onChange={(e) => {
                                            if (!editingPage) {
                                                form.setFieldsValue({ slug: generateSlug(e.target.value) });
                                            }
                                        }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    label="URL Slug"
                                    name="slug"
                                    rules={[{ required: true, message: 'Slug gerekli' }]}
                                >
                                    <Input placeholder="hakkimizda" addonBefore="/sayfa/" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item label="Kısa Açıklama" name="excerpt">
                            <Input placeholder="Sayfa hakkında kısa bir açıklama" />
                        </Form.Item>

                        <Form.Item label="Sayfa İçeriği" name="content">
                            <RichTextEditor
                                placeholder="Sayfa içeriğinizi buraya yazın..."
                                height={350}
                            />
                        </Form.Item>

                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item label="Kategori" name="category">
                                    <Select options={CATEGORY_OPTIONS} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="Menü Sırası" name="menuOrder">
                                    <InputNumber style={{ width: '100%' }} min={0} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="İkon" name="icon">
                                    <Input placeholder="Örn: PhoneOutlined" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item label="Yayında" name="isPublished" valuePropName="checked">
                                    <Switch checkedChildren="Evet" unCheckedChildren="Taslak" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="Üst Menüde Göster" name="showInMenu" valuePropName="checked">
                                    <Switch checkedChildren="Evet" unCheckedChildren="Hayır" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="Footer'da Göster" name="showInFooter" valuePropName="checked">
                                    <Switch checkedChildren="Evet" unCheckedChildren="Hayır" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Card size="small" title={<span><GlobalOutlined style={{ marginRight: 6 }} />SEO Ayarları</span>} style={{ marginTop: 8, borderRadius: 10, border: '1px solid #f0f0f0' }}>
                            <Form.Item label="Meta Başlık" name="metaTitle">
                                <Input placeholder="SEO başlığı (boş bırakılırsa sayfa başlığı kullanılır)" />
                            </Form.Item>
                            <Form.Item label="Meta Açıklama" name="metaDescription">
                                <TextArea rows={2} placeholder="SEO açıklaması" />
                            </Form.Item>
                        </Card>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default PagesManagement;
