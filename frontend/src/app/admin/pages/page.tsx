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
    Col
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    FileTextOutlined,
    GlobalOutlined,
    MenuOutlined,
    SaveOutlined
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import RichTextEditor from '../../components/RichTextEditor';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

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

    useEffect(() => {
        fetchPages();
    }, []);

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
                <div>
                    <Text strong>{title}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>/{record.slug}</Text>
                </div>
            )
        },
        {
            title: 'Kategori',
            dataIndex: 'category',
            key: 'category',
            render: (cat: string) => (
                <Tag color={CATEGORY_COLORS[cat] || 'default'}>
                    {CATEGORY_OPTIONS.find(c => c.value === cat)?.label || cat}
                </Tag>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'isPublished',
            key: 'isPublished',
            render: (published: boolean) => (
                <Tag color={published ? 'green' : 'orange'}>
                    {published ? 'Yayında' : 'Taslak'}
                </Tag>
            )
        },
        {
            title: 'Menü',
            key: 'menu',
            render: (_: any, record: PageItem) => (
                <Space>
                    {record.showInMenu && <Tag color="blue">Üst Menü</Tag>}
                    {record.showInFooter && <Tag color="cyan">Footer</Tag>}
                </Space>
            )
        },
        {
            title: 'Sıra',
            dataIndex: 'menuOrder',
            key: 'menuOrder',
            width: 60,
            sorter: (a: PageItem, b: PageItem) => a.menuOrder - b.menuOrder,
        },
        {
            title: 'İşlemler',
            key: 'actions',
            width: 200,
            render: (_: any, record: PageItem) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => window.open(`/sayfa/${record.slug}`, '_blank')}
                    >
                        Önizle
                    </Button>
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Düzenle
                    </Button>
                    <Popconfirm
                        title="Bu sayfayı silmek istediğinize emin misiniz?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Evet"
                        cancelText="Hayır"
                    >
                        <Button type="link" danger icon={<DeleteOutlined />}>Sil</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const tabItems = [
        {
            key: 'list',
            label: <span><FileTextOutlined /> Sayfalarım</span>,
            children: (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text type="secondary">{pages.length} sayfa bulundu</Text>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                            Yeni Sayfa Oluştur
                        </Button>
                    </div>
                    <Table
                        columns={columns}
                        dataSource={pages}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                </div>
            )
        },
        {
            key: 'templates',
            label: <span><GlobalOutlined /> Hazır Şablonlar</span>,
            children: (
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        Bir transfer sitesinde olması gereken standart sayfaları hızlıca oluşturun.
                    </Text>
                    <Row gutter={[16, 16]}>
                        {PAGE_TEMPLATES.map(tpl => {
                            const exists = pages.some(p => p.slug === tpl.slug);
                            return (
                                <Col xs={24} sm={12} md={8} lg={6} key={tpl.key}>
                                    <Card
                                        hoverable={!exists}
                                        style={{
                                            height: '100%',
                                            opacity: exists ? 0.6 : 1,
                                            borderColor: exists ? '#52c41a' : undefined
                                        }}
                                    >
                                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                            <FileTextOutlined style={{ fontSize: 32, color: '#667eea' }} />
                                        </div>
                                        <Title level={5} style={{ textAlign: 'center', marginBottom: 4 }}>
                                            {tpl.title}
                                        </Title>
                                        <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginBottom: 12 }}>
                                            {tpl.excerpt}
                                        </Text>
                                        <Tag color={CATEGORY_COLORS[tpl.category]} style={{ display: 'block', textAlign: 'center', margin: '0 auto 12px' }}>
                                            {CATEGORY_OPTIONS.find(c => c.value === tpl.category)?.label}
                                        </Tag>
                                        <Button
                                            type={exists ? 'default' : 'primary'}
                                            block
                                            disabled={exists}
                                            onClick={() => handleTemplateCreate(tpl)}
                                        >
                                            {exists ? 'Zaten Mevcut' : 'Oluştur'}
                                        </Button>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                </div>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="pages">
                <div style={{ marginBottom: 24 }}>
                    <Title level={2}><FileTextOutlined /> Sayfa Yönetimi</Title>
                    <Text type="secondary">
                        Web sitenizdeki sayfaları oluşturun ve yönetin. Sayfalar üst menüde ve footerda otomatik görünür.
                    </Text>
                </div>

                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

                <Modal
                    title={editingPage ? 'Sayfayı Düzenle' : 'Yeni Sayfa Oluştur'}
                    open={modalVisible}
                    onOk={handleSubmit}
                    onCancel={() => setModalVisible(false)}
                    width={800}
                    okText={editingPage ? 'Güncelle' : 'Oluştur'}
                    cancelText="İptal"
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

                        <Card size="small" title="SEO Ayarları" style={{ marginTop: 8 }}>
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
