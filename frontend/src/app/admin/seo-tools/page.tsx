'use client';

import React, { useState, useEffect } from 'react';
import {
    Card, Typography, Button, Input, message, Row, Col,
    Table, Tag, Alert, Space, Progress, Tooltip, Tabs, Divider, List, Spin,
} from 'antd';
import {
    SearchOutlined, GlobalOutlined, FileTextOutlined, CheckCircleOutlined,
    CloseCircleOutlined, WarningOutlined, ReloadOutlined, LinkOutlined,
    ExperimentOutlined, BarChartOutlined, EyeOutlined, ThunderboltOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';

const { Title, Text, Paragraph } = Typography;

interface CheckItem {
    key: string;
    label: string;
    status: 'pass' | 'warn' | 'fail';
    detail?: string;
    weight: number;
}

interface SitemapEntry {
    url: string;
    lastmod?: string;
    priority?: string;
    changefreq?: string;
}

interface PagePreview {
    path: string;
    label: string;
    title?: string;
    description?: string;
    canonical?: string;
    status?: number;
    error?: string;
}

const SeoToolsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [siteUrl, setSiteUrl] = useState('');
    const [tenantSettings, setTenantSettings] = useState<any>({});
    const [sitemap, setSitemap] = useState<SitemapEntry[]>([]);
    const [robotsTxt, setRobotsTxt] = useState('');
    const [pagePreviews, setPagePreviews] = useState<PagePreview[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [checks, setChecks] = useState<CheckItem[]>([]);

    useEffect(() => { loadAll(); }, []);

    const detectSiteUrl = (settings: any): string => {
        const fromSettings = settings?.seo?.siteUrl;
        if (fromSettings) return fromSettings.replace(/\/$/, '');
        if (typeof window !== 'undefined') return window.location.origin;
        return '';
    };

    const loadAll = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/tenant/info');
            const settings = res.data?.data?.tenant?.settings || {};
            setTenantSettings(settings);
            const url = detectSiteUrl(settings);
            setSiteUrl(url);
            await Promise.all([
                loadSitemap(url),
                loadRobots(url),
            ]);
            runHealthChecks(settings, url);
        } catch (e) {
            console.error(e);
            message.error('Veriler alınamadı');
        } finally {
            setLoading(false);
        }
    };

    const loadSitemap = async (url: string) => {
        if (!url) return;
        try {
            const res = await fetch(`${url}/sitemap.xml`, { cache: 'no-store' });
            const xml = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'application/xml');
            const urls = Array.from(doc.querySelectorAll('url')).map(u => ({
                url: u.querySelector('loc')?.textContent || '',
                lastmod: u.querySelector('lastmod')?.textContent || undefined,
                priority: u.querySelector('priority')?.textContent || undefined,
                changefreq: u.querySelector('changefreq')?.textContent || undefined,
            }));
            setSitemap(urls);
        } catch (e) {
            console.error('Sitemap load error:', e);
        }
    };

    const loadRobots = async (url: string) => {
        if (!url) return;
        try {
            const res = await fetch(`${url}/robots.txt`, { cache: 'no-store' });
            setRobotsTxt(await res.text());
        } catch (e) {
            console.error('Robots load error:', e);
        }
    };

    const runHealthChecks = (settings: any, url: string) => {
        const seo = settings?.seo || {};
        const branding = settings?.branding || {};
        const items: CheckItem[] = [];

        items.push({
            key: 'siteUrl', label: 'Site URL ayarlandı',
            status: seo.siteUrl ? 'pass' : 'warn',
            detail: seo.siteUrl ? seo.siteUrl : `Otomatik tespit: ${url || 'localhost'}. Manuel girilmesi önerilir.`,
            weight: 8,
        });
        items.push({
            key: 'title', label: 'Varsayılan Title',
            status: seo.defaultTitle ? 'pass' : 'warn',
            detail: seo.defaultTitle ? seo.defaultTitle.length > 60 ? 'Title 60+ karakter — 50-60 ideal' : seo.defaultTitle : 'Boş — fallback kullanılıyor',
            weight: 10,
        });
        items.push({
            key: 'description', label: 'Varsayılan Description',
            status: seo.defaultDescription ? (seo.defaultDescription.length >= 120 && seo.defaultDescription.length <= 165 ? 'pass' : 'warn') : 'fail',
            detail: seo.defaultDescription ? `${seo.defaultDescription.length} karakter (120-160 ideal)` : 'BOŞ — Mutlaka doldurun',
            weight: 10,
        });
        items.push({
            key: 'keywords', label: 'Anahtar Kelimeler',
            status: (seo.keywords && seo.keywords.length >= 5) ? 'pass' : (seo.keywords && seo.keywords.length > 0 ? 'warn' : 'fail'),
            detail: seo.keywords ? `${seo.keywords.length} keyword` : 'BOŞ — En az 5 keyword ekleyin',
            weight: 6,
        });
        items.push({
            key: 'ogImage', label: 'Open Graph görseli',
            status: seo.ogImage ? 'pass' : 'warn',
            detail: seo.ogImage ? 'Set' : 'Logo kullanılıyor — 1200x630 özel görsel önerilir',
            weight: 6,
        });
        items.push({
            key: 'indexing', label: 'Arama motorlarınca indekslenebilir',
            status: seo.indexingEnabled !== false ? 'pass' : 'fail',
            detail: seo.indexingEnabled !== false ? 'Açık' : 'KAPALI — Site arama motorlarında görünmüyor',
            weight: 12,
        });
        items.push({
            key: 'gsc', label: 'Google Search Console doğrulama',
            status: seo.googleSiteVerification ? 'pass' : 'warn',
            detail: seo.googleSiteVerification ? 'Doğrulanmış' : 'Kayıtlı değil — search.google.com/search-console',
            weight: 8,
        });
        items.push({
            key: 'ga', label: 'Analytics (GA4 veya GTM)',
            status: (seo.gaId || seo.gtmId) ? 'pass' : 'warn',
            detail: seo.gaId ? `GA4: ${seo.gaId}` : seo.gtmId ? `GTM: ${seo.gtmId}` : 'Kayıtlı değil',
            weight: 6,
        });
        items.push({
            key: 'phone', label: 'Telefon (Schema için)',
            status: branding.phone ? 'pass' : 'warn',
            detail: branding.phone || 'Eksik',
            weight: 4,
        });
        items.push({
            key: 'logo', label: 'Logo (Schema için)',
            status: branding.logoUrl ? 'pass' : 'warn',
            detail: branding.logoUrl ? 'Set' : 'Eksik',
            weight: 4,
        });
        items.push({
            key: 'faq', label: 'Anasayfa FAQ (Rich Snippet)',
            status: (settings.homepageFaq && settings.homepageFaq.length >= 3) ? 'pass' : 'warn',
            detail: settings.homepageFaq ? `${settings.homepageFaq.length} FAQ` : 'Boş — FAQ ekleyin (FAQPage schema için en az 3)',
            weight: 8,
        });
        items.push({
            key: 'testimonials', label: 'Müşteri Yorumları (Review schema)',
            status: (settings.homepageTestimonials && settings.homepageTestimonials.length >= 3) ? 'pass' : 'warn',
            detail: settings.homepageTestimonials ? `${settings.homepageTestimonials.length} yorum` : 'Boş — Review schema için en az 3',
            weight: 6,
        });
        items.push({
            key: 'landingPages', label: 'Konum Landing Page sayısı',
            status: (seo.landingPages && seo.landingPages.length >= 3) ? 'pass' : 'warn',
            detail: `${(seo.landingPages || []).length} sayfa — Long-tail trafiği için en az 5 önerilir`,
            weight: 6,
        });
        items.push({
            key: 'blog', label: 'Blog Yazıları',
            status: (seo.blog?.posts && seo.blog.posts.filter((p: any) => p.status !== 'draft').length >= 3) ? 'pass'
                : (seo.blog?.posts && seo.blog.posts.length > 0 ? 'warn' : 'fail'),
            detail: `${(seo.blog?.posts || []).filter((p: any) => p.status !== 'draft').length} yayında, ${(seo.blog?.posts || []).filter((p: any) => p.status === 'draft').length} taslak`,
            weight: 6,
        });

        setChecks(items);
    };

    const checkPages = async () => {
        if (!siteUrl) return;
        setPreviewLoading(true);
        const pages: PagePreview[] = [
            { path: '/', label: 'Ana Sayfa' },
            { path: '/track', label: 'Rezervasyon Sorgula' },
            { path: '/contact', label: 'İletişim' },
            { path: '/transfer/book', label: 'Rezervasyon Formu' },
            { path: '/blog', label: 'Blog' },
        ];
        const results = await Promise.all(pages.map(async (p) => {
            try {
                const r = await fetch(`${siteUrl}${p.path}`, { cache: 'no-store', redirect: 'follow' });
                const html = await r.text();
                const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
                const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
                const canonMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
                return {
                    ...p,
                    status: r.status,
                    title: titleMatch?.[1],
                    description: descMatch?.[1],
                    canonical: canonMatch?.[1],
                };
            } catch (e: any) {
                return { ...p, error: e.message || 'Hata' };
            }
        }));
        setPagePreviews(results);
        setPreviewLoading(false);
    };

    const totalScore = (() => {
        if (checks.length === 0) return 0;
        const maxWeight = checks.reduce((a, c) => a + c.weight, 0);
        const earned = checks.reduce((a, c) => a + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0), 0);
        return Math.round((earned / maxWeight) * 100);
    })();

    const scoreColor = totalScore >= 80 ? '#10b981' : totalScore >= 60 ? '#f59e0b' : '#ef4444';

    const externalTools = [
        {
            title: 'Google Rich Results Test',
            description: 'JSON-LD schema doğrulama',
            url: (path: string) => `https://search.google.com/test/rich-results?url=${encodeURIComponent(`${siteUrl}${path}`)}`,
            icon: <ExperimentOutlined />,
            color: '#4285f4',
        },
        {
            title: 'PageSpeed Insights',
            description: 'Core Web Vitals + performans',
            url: (path: string) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`${siteUrl}${path}`)}`,
            icon: <ThunderboltOutlined />,
            color: '#ea4335',
        },
        {
            title: 'Mobile-Friendly Test',
            description: 'Mobil uyumluluk',
            url: (path: string) => `https://search.google.com/test/mobile-friendly?url=${encodeURIComponent(`${siteUrl}${path}`)}`,
            icon: <CheckCircleOutlined />,
            color: '#34a853',
        },
        {
            title: 'Search Console',
            description: 'Sitenizi Google\'a kayıt edin',
            url: () => 'https://search.google.com/search-console',
            icon: <SearchOutlined />,
            color: '#4285f4',
        },
        {
            title: 'Bing Webmaster',
            description: 'Bing arama motoru',
            url: () => 'https://www.bing.com/webmasters',
            icon: <GlobalOutlined />,
            color: '#0078d4',
        },
        {
            title: 'Yandex Webmaster',
            description: 'Yandex arama motoru',
            url: () => 'https://webmaster.yandex.com',
            icon: <GlobalOutlined />,
            color: '#fc3f1d',
        },
    ];

    const sitemapColumns = [
        { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
        {
            title: 'URL',
            dataIndex: 'url',
            key: 'url',
            render: (u: string) => <a href={u} target="_blank" rel="noopener noreferrer">{u.replace(siteUrl, '') || u}</a>,
        },
        { title: 'Öncelik', dataIndex: 'priority', key: 'priority', width: 80, align: 'center' as const },
        { title: 'Sıklık', dataIndex: 'changefreq', key: 'changefreq', width: 100, align: 'center' as const },
        { title: 'Son Güncelleme', dataIndex: 'lastmod', key: 'lastmod', width: 180, render: (d: string) => d ? new Date(d).toLocaleString('tr-TR') : '-' },
    ];

    const tabs = [
        {
            key: 'health',
            label: <span><BarChartOutlined /> Sağlık Skoru</span>,
            children: (
                <div>
                    <Card style={{ marginBottom: 16 }}>
                        <Row align="middle" gutter={24}>
                            <Col xs={24} md={6} style={{ textAlign: 'center' }}>
                                <Progress
                                    type="circle"
                                    percent={totalScore}
                                    size={140}
                                    strokeColor={scoreColor}
                                    format={() => <div><div style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>{totalScore}</div><div style={{ fontSize: 11, color: '#64748b' }}>/100</div></div>}
                                />
                            </Col>
                            <Col xs={24} md={18}>
                                <Title level={4} style={{ marginTop: 0 }}>SEO Sağlık Skoru</Title>
                                <Text type="secondary">{checks.filter(c => c.status === 'pass').length} başarılı, {checks.filter(c => c.status === 'warn').length} uyarı, {checks.filter(c => c.status === 'fail').length} başarısız</Text>
                                <div style={{ marginTop: 12 }}>
                                    <Space>
                                        <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>Yenile</Button>
                                        <Button type="primary" icon={<EyeOutlined />} onClick={checkPages} loading={previewLoading}>Sayfaları Test Et</Button>
                                    </Space>
                                </div>
                            </Col>
                        </Row>
                    </Card>

                    <List
                        dataSource={checks}
                        renderItem={(item) => (
                            <List.Item style={{ background: '#fff', borderRadius: 8, padding: '12px 16px', marginBottom: 8, border: '1px solid #f1f5f9' }}>
                                <Space>
                                    {item.status === 'pass' && <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />}
                                    {item.status === 'warn' && <WarningOutlined style={{ color: '#f59e0b', fontSize: 18 }} />}
                                    {item.status === 'fail' && <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 18 }} />}
                                    <div>
                                        <Text strong>{item.label}</Text>
                                        {item.detail && <div><Text type="secondary" style={{ fontSize: 13 }}>{item.detail}</Text></div>}
                                    </div>
                                </Space>
                                <Tag color={item.status === 'pass' ? 'green' : item.status === 'warn' ? 'orange' : 'red'}>+{item.weight} puan</Tag>
                            </List.Item>
                        )}
                    />
                </div>
            ),
        },
        {
            key: 'pages',
            label: <span><FileTextOutlined /> Sayfa Önizlemeleri</span>,
            children: (
                <div>
                    <Alert
                        type="info"
                        showIcon
                        message="Sayfalardan canlı meta veri çekiyor"
                        description="Bu test sitenizin gerçek HTML'inden title, description ve canonical değerlerini okur. Her sayfanın doğru şekilde tag'lendiğinden emin olun."
                        style={{ marginBottom: 16 }}
                    />
                    <div style={{ marginBottom: 16 }}>
                        <Button type="primary" icon={<EyeOutlined />} onClick={checkPages} loading={previewLoading}>Tüm Sayfaları Test Et</Button>
                    </div>
                    {previewLoading && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
                    {!previewLoading && pagePreviews.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                            "Tüm Sayfaları Test Et" butonuna basın
                        </div>
                    )}
                    {pagePreviews.map((p, i) => (
                        <Card key={i} size="small" style={{ marginBottom: 12 }} title={
                            <Space>
                                <Text strong>{p.label}</Text>
                                <Text type="secondary">{p.path}</Text>
                                {p.status === 200 && <Tag color="green">200 OK</Tag>}
                                {p.status && p.status !== 200 && <Tag color="orange">{p.status}</Tag>}
                                {p.error && <Tag color="red">{p.error}</Tag>}
                            </Space>
                        } extra={<Button size="small" href={`${siteUrl}${p.path}`} target="_blank">Aç</Button>}>
                            <Row gutter={8}>
                                <Col xs={24}>
                                    <Text strong style={{ fontSize: 12, color: '#64748b' }}>TITLE</Text>
                                    <div style={{ fontSize: 14, marginBottom: 8 }}>
                                        {p.title || <Text type="danger">Boş</Text>}
                                        {p.title && <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>({p.title.length} char)</Text>}
                                    </div>
                                </Col>
                                <Col xs={24}>
                                    <Text strong style={{ fontSize: 12, color: '#64748b' }}>DESCRIPTION</Text>
                                    <div style={{ fontSize: 14, marginBottom: 8 }}>
                                        {p.description || <Text type="danger">Boş</Text>}
                                        {p.description && <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>({p.description.length} char)</Text>}
                                    </div>
                                </Col>
                                <Col xs={24}>
                                    <Text strong style={{ fontSize: 12, color: '#64748b' }}>CANONICAL</Text>
                                    <div style={{ fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                        {p.canonical || <Text type="warning">Yok</Text>}
                                    </div>
                                </Col>
                            </Row>
                        </Card>
                    ))}
                </div>
            ),
        },
        {
            key: 'sitemap',
            label: <span><LinkOutlined /> Sitemap ({sitemap.length})</span>,
            children: (
                <div>
                    <Alert
                        type="success"
                        showIcon
                        message={`Toplam ${sitemap.length} URL sitemap.xml'de listeleniyor`}
                        description={<>Tam URL: <a href={`${siteUrl}/sitemap.xml`} target="_blank" rel="noopener noreferrer">{siteUrl}/sitemap.xml</a></>}
                        style={{ marginBottom: 16 }}
                    />
                    <Table
                        size="small"
                        dataSource={sitemap}
                        columns={sitemapColumns as any}
                        rowKey="url"
                        pagination={{ pageSize: 50 }}
                    />
                </div>
            ),
        },
        {
            key: 'robots',
            label: <span><FileTextOutlined /> Robots.txt</span>,
            children: (
                <div>
                    <Alert
                        type={tenantSettings?.seo?.indexingEnabled === false ? 'warning' : 'info'}
                        showIcon
                        message={tenantSettings?.seo?.indexingEnabled === false ? 'DİKKAT: İndekslenme KAPALI — Site Google\'da görünmez!' : 'İndeksleme açık'}
                        description={<>Tam URL: <a href={`${siteUrl}/robots.txt`} target="_blank" rel="noopener noreferrer">{siteUrl}/robots.txt</a></>}
                        style={{ marginBottom: 16 }}
                    />
                    <Card>
                        <pre style={{ fontFamily: 'monospace', fontSize: 13, background: '#f8fafc', padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 500, margin: 0 }}>
                            {robotsTxt || '(yükleniyor...)'}
                        </pre>
                    </Card>
                </div>
            ),
        },
        {
            key: 'tools',
            label: <span><ExperimentOutlined /> Test Araçları</span>,
            children: (
                <div>
                    <Alert
                        type="info"
                        showIcon
                        message="Harici Test Araçları"
                        description="Bu araçlar Google, Microsoft ve Yandex'in resmi araçlarıdır. Sitenizin SEO durumunu detaylı analiz etmek için kullanın."
                        style={{ marginBottom: 16 }}
                    />

                    <Row gutter={[16, 16]}>
                        {externalTools.map(t => (
                            <Col xs={24} sm={12} md={8} key={t.title}>
                                <Card hoverable style={{ height: '100%' }}>
                                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${t.color}15`, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                                                {t.icon}
                                            </div>
                                            <div>
                                                <Text strong style={{ fontSize: 15 }}>{t.title}</Text>
                                                <div><Text type="secondary" style={{ fontSize: 12 }}>{t.description}</Text></div>
                                            </div>
                                        </div>
                                        <Space wrap>
                                            {['/', '/track', '/contact', '/blog'].map(path => (
                                                <Button
                                                    key={path}
                                                    size="small"
                                                    href={t.url(path)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {path === '/' ? 'Ana Sayfa' : path}
                                                </Button>
                                            ))}
                                        </Space>
                                    </Space>
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    <Divider />

                    <Card title="Manuel URL Testi" extra={<Text type="secondary">Tek bir URL'i test etmek için</Text>}>
                        <ManualUrlTester siteUrl={siteUrl} tools={externalTools} />
                    </Card>
                </div>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="seo-tools">
                <div style={{ marginBottom: 24 }}>
                    <Title level={2} style={{ marginBottom: 4 }}>SEO Araçları & Test Merkezi</Title>
                    <Text type="secondary">Sitenizin arama motoru optimizasyonunu test edin, doğrulayın ve iyileştirin.</Text>
                </div>

                {!siteUrl && loading && <Spin />}
                {siteUrl && (
                    <Alert
                        type="info"
                        icon={<InfoCircleOutlined />}
                        message={<Space>Aktif Site URL: <a href={siteUrl} target="_blank" rel="noopener noreferrer">{siteUrl}</a></Space>}
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Tabs defaultActiveKey="health" items={tabs} />
            </AdminLayout>
        </AdminGuard>
    );
};

const ManualUrlTester: React.FC<{ siteUrl: string; tools: any[] }> = ({ siteUrl, tools }) => {
    const [path, setPath] = useState('/');
    const fullUrl = `${siteUrl}${path.startsWith('/') ? path : '/' + path}`;
    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Space.Compact style={{ width: '100%' }}>
                <Input
                    addonBefore={siteUrl}
                    value={path}
                    onChange={e => setPath(e.target.value)}
                    placeholder="/transfer/istanbul-havalimani"
                />
                <Button type="primary" href={fullUrl} target="_blank">Aç</Button>
            </Space.Compact>
            <Space wrap style={{ marginTop: 8 }}>
                {tools.slice(0, 3).map(t => (
                    <Button
                        key={t.title}
                        icon={t.icon}
                        href={t.url(path)}
                        target="_blank"
                    >
                        {t.title}
                    </Button>
                ))}
            </Space>
        </Space>
    );
};

export default SeoToolsPage;
