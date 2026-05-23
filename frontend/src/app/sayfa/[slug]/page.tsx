'use client';
import { API_URL, getImageUrl } from '@/lib/api-client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Layout, Typography, Spin, Result, Button, Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import axios from 'axios';
import TopBar from '../../components/TopBar';
import SiteFooter from '../../components/SiteFooter';
import { useBranding } from '../../context/BrandingContext';
import { useTheme } from '../../context/ThemeContext';

const { Content } = Layout;
const { Title, Text } = Typography;

const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

interface PageData {
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    heroImage: string;
    metaTitle: string;
    metaDescription: string;
    category: string;
}

const DynamicPage: React.FC = () => {
    const params = useParams();
    const router = useRouter();
    const { branding } = useBranding();
    const { theme } = useTheme();
    const slug = params.slug as string;

    const [page, setPage] = useState<PageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchPage = async () => {
            try {
                setLoading(true);
                setError(false);
                const pageRes = await axios.get(`${API_URL}/api/pages/${slug}`, { headers: { 'X-Tenant-Slug': TENANT_SLUG } });
                if (pageRes.data.success) {
                    setPage(pageRes.data.data.page);
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error('Fetch page error:', err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        if (slug) fetchPage();
    }, [slug]);

    if (loading) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
                <TopBar />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: 120 }}>
                    <Spin size="large" />
                </div>
            </Layout>
        );
    }

    if (error || !page) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
                <TopBar />
                <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, paddingTop: 80 }}>
                    <Result
                        status="404"
                        title="Sayfa Bulunamadı"
                        subTitle="Aradığınız sayfa mevcut değil veya kaldırılmış olabilir."
                        extra={<Button type="primary" onClick={() => router.push('/')}>Ana Sayfaya Dön</Button>}
                    />
                </Content>
            </Layout>
        );
    }

    const heroStyle: React.CSSProperties = page.heroImage
        ? {
            position: 'relative',
            backgroundImage: `url(${getImageUrl(page.heroImage)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        }
        : {
            background: theme.heroGradient || `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.accentColor} 100%)`,
        };

    return (
        <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <TopBar />

            {/* ─── Hero ─── */}
            <div style={{ ...heroStyle, paddingTop: 80 }}>
                {page.heroImage && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(to bottom, rgba(15,23,42,0.65) 0%, rgba(15,23,42,0.45) 100%)',
                    }} />
                )}
                <div style={{
                    position: 'relative', zIndex: 1,
                    maxWidth: 900, margin: '0 auto', padding: 'clamp(60px, 8vw, 100px) 24px clamp(50px, 7vw, 80px)',
                    textAlign: 'center',
                }}>
                    <Breadcrumb
                        style={{ marginBottom: 20, justifyContent: 'center', display: 'flex' }}
                        items={[
                            { title: <a href="/" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}><HomeOutlined /> Ana Sayfa</a> },
                            { title: <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{page.title}</span> }
                        ]}
                    />
                    <Title
                        level={1}
                        style={{
                            color: '#fff', marginBottom: page.excerpt ? 16 : 0,
                            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 800,
                            textShadow: '0 2px 20px rgba(0,0,0,0.3)', lineHeight: 1.2,
                        }}
                    >
                        {page.title}
                    </Title>
                    {page.excerpt && (
                        <Text style={{
                            color: 'rgba(255,255,255,0.82)', fontSize: 'clamp(15px, 2vw, 18px)',
                            lineHeight: 1.7, display: 'block', maxWidth: 640, margin: '0 auto',
                            textShadow: '0 1px 8px rgba(0,0,0,0.2)',
                        }}>
                            {page.excerpt}
                        </Text>
                    )}
                </div>
            </div>

            {/* ─── Content ─── */}
            <Content style={{ background: '#fff' }}>
                <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) 24px clamp(64px, 8vw, 100px)' }}>
                    <style>{`
                        .st-page-content { font-size: 16px; line-height: 1.85; color: #374151; }
                        .st-page-content h1, .st-page-content h2, .st-page-content h3,
                        .st-page-content h4, .st-page-content h5 {
                            color: #111827; font-weight: 700; margin: 2em 0 0.7em; line-height: 1.3;
                        }
                        .st-page-content h1 { font-size: 2rem; }
                        .st-page-content h2 { font-size: 1.6rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
                        .st-page-content h3 { font-size: 1.25rem; }
                        .st-page-content p { margin: 0 0 1.4em; }
                        .st-page-content ul, .st-page-content ol { padding-left: 1.6em; margin: 0 0 1.4em; }
                        .st-page-content li { margin-bottom: 0.5em; }
                        .st-page-content strong, .st-page-content b { color: #111827; font-weight: 600; }
                        .st-page-content a { color: ${theme.primaryColor}; text-decoration: none; border-bottom: 1px solid ${theme.primaryColor}30; transition: border-color 0.2s; }
                        .st-page-content a:hover { border-bottom-color: ${theme.primaryColor}; }
                        .st-page-content blockquote {
                            border-left: 4px solid ${theme.primaryColor};
                            margin: 1.5em 0; padding: 16px 20px;
                            background: #f8faff; border-radius: 0 8px 8px 0;
                            color: #4b5563; font-style: italic;
                        }
                        .st-page-content img { max-width: 100%; border-radius: 12px; margin: 12px 0; }
                        .st-page-content table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
                        .st-page-content th { background: ${theme.primaryColor}15; color: #111827; font-weight: 600; }
                        .st-page-content th, .st-page-content td { padding: 12px 16px; border: 1px solid #e5e7eb; text-align: left; }
                        .st-page-content tr:nth-child(even) td { background: #f9fafb; }
                        .st-page-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
                    `}</style>
                    <div
                        className="st-page-content"
                        dangerouslySetInnerHTML={{ __html: page.content }}
                    />
                </div>
            </Content>

            <SiteFooter />
        </Layout>
    );
};

export default DynamicPage;
