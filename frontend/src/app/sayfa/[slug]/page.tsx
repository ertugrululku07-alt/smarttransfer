'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Layout, Typography, Spin, Result, Button, Breadcrumb } from 'antd';
import { HomeOutlined, FileTextOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import TopBar from '../../components/TopBar';
import { useBranding } from '../../context/BrandingContext';

const { Content, Footer } = Layout;
const { Title, Text } = Typography;

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

interface PageData {
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    category: string;
}

const DynamicPage: React.FC = () => {
    const params = useParams();
    const router = useRouter();
    const { branding } = useBranding();
    const slug = params.slug as string;

    const [page, setPage] = useState<PageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [menuPages, setMenuPages] = useState<any[]>([]);

    useEffect(() => {
        const fetchPage = async () => {
            try {
                setLoading(true);
                setError(false);
                const [pageRes, pagesRes] = await Promise.all([
                    axios.get(`${API_URL}/api/pages/${slug}`, {
                        headers: { 'X-Tenant-Slug': TENANT_SLUG }
                    }),
                    axios.get(`${API_URL}/api/pages`, {
                        headers: { 'X-Tenant-Slug': TENANT_SLUG }
                    })
                ]);

                if (pageRes.data.success) {
                    setPage(pageRes.data.data.page);
                } else {
                    setError(true);
                }

                if (pagesRes.data.success) {
                    setMenuPages(pagesRes.data.data.pages.filter((p: any) => p.showInFooter));
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
            <Layout style={{ minHeight: '100vh' }}>
                <TopBar />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Spin size="large" />
                </div>
            </Layout>
        );
    }

    if (error || !page) {
        return (
            <Layout style={{ minHeight: '100vh' }}>
                <TopBar />
                <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <Result
                        status="404"
                        title="Sayfa Bulunamadı"
                        subTitle="Aradığınız sayfa mevcut değil veya kaldırılmış olabilir."
                        extra={
                            <Button type="primary" onClick={() => router.push('/')}>
                                Ana Sayfaya Dön
                            </Button>
                        }
                    />
                </Content>
            </Layout>
        );
    }

    return (
        <Layout style={{ minHeight: '100vh', background: '#fff' }}>
            <TopBar />

            {/* Page Header */}
            <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '60px 24px 50px',
                textAlign: 'center'
            }}>
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <Breadcrumb
                        style={{ marginBottom: 16 }}
                        items={[
                            { title: <a href="/" style={{ color: 'rgba(255,255,255,0.7)' }}><HomeOutlined /> Ana Sayfa</a> },
                            { title: <span style={{ color: '#fff' }}>{page.title}</span> }
                        ]}
                    />
                    <Title level={1} style={{ color: '#fff', marginBottom: 8, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
                        {page.title}
                    </Title>
                    {page.excerpt && (
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}>
                            {page.excerpt}
                        </Text>
                    )}
                </div>
            </div>

            {/* Page Content */}
            <Content style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px', width: '100%' }}>
                <div
                    className="page-content"
                    dangerouslySetInnerHTML={{ __html: page.content }}
                    style={{
                        fontSize: 16,
                        lineHeight: 1.8,
                        color: '#374151',
                    }}
                />
            </Content>

            {/* Footer */}
            <Footer style={{
                background: '#0f172a',
                color: '#fff',
                padding: '48px 24px 32px'
            }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, marginBottom: 32 }}>
                        <div style={{ flex: '1 1 250px' }}>
                            <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>{branding.companyName}</Title>
                            <Text style={{ color: 'rgba(255,255,255,0.6)' }}>
                                {branding.slogan}
                            </Text>
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <Title level={5} style={{ color: '#fff', marginBottom: 16 }}>Sayfalar</Title>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {menuPages.map(p => (
                                    <a
                                        key={p.slug}
                                        href={`/sayfa/${p.slug}`}
                                        style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}
                                    >
                                        {p.title}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, textAlign: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                            {branding.companyName} &copy;{new Date().getFullYear()} - Tüm hakları saklıdır
                        </Text>
                    </div>
                </div>
            </Footer>
        </Layout>
    );
};

export default DynamicPage;
