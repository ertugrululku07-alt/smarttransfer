'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Spin } from 'antd';
import {
    CarOutlined, CheckCircleOutlined, ClockCircleOutlined,
    SyncOutlined, TeamOutlined, WalletOutlined,
    RiseOutlined, ReadOutlined, ReloadOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AgencyGuard from './AgencyGuard';
import AgencyLayout from './AgencyLayout';
import { useAuth } from '../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardStats {
    totalTransfers: number;
    completedTransfers: number;
    pendingTransfers: number;
    inProgressTransfers: number;
    cancelledTransfers: number;
    staffCount: number;
    balance: number;
    companyName?: string;
    monthlyChart: { month: number; label: string; count: number }[];
}

interface NewsItem {
    title: string;
    link: string;
    pubDate: string;
    description: string;
    imageUrl?: string;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard = ({
    title, value, icon, gradient, textColor, subtitle
}: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    gradient: string;
    textColor: string;
    subtitle?: string;
}) => (
    <div style={{
        background: gradient,
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
    }}
        onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.14)';
        }}
        onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)';
        }}
    >
        {/* decorative circle */}
        <div style={{
            position: 'absolute', top: -20, right: -20,
            width: 100, height: 100,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)'
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: textColor, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {title}
            </span>
            <span style={{ fontSize: 22, color: textColor, opacity: 0.75 }}>{icon}</span>
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: textColor, lineHeight: 1.1 }}>
            {value}
        </div>
        {subtitle && (
            <div style={{ fontSize: 12, color: textColor, opacity: 0.65 }}>{subtitle}</div>
        )}
    </div>
);

// ─── Custom Tooltip for Bar Chart ────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div style={{
                background: '#1e2a3a', color: '#fff', borderRadius: 10,
                padding: '10px 16px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
            }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{label}</p>
                <p style={{ margin: 0, color: '#6dc8ff' }}>{payload[0].value} Transfer</p>
            </div>
        );
    }
    return null;
};

// ─── News Card ────────────────────────────────────────────────────────────────

const NewsCard = ({ item }: { item: NewsItem }) => {
    const [hovered, setHovered] = useState(false);
    return (
        <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{
                display: 'flex',
                gap: 14,
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                transition: 'opacity 0.2s',
                opacity: hovered ? 0.85 : 1,
            }}>
                {item.imageUrl && (
                    <img
                        src={item.imageUrl}
                        alt={item.title}
                        style={{
                            width: 72, height: 56, objectFit: 'cover',
                            borderRadius: 8, flexShrink: 0
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 13, fontWeight: 600, color: '#e8f4ff',
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        lineHeight: '1.45',
                    }}>
                        {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#8ba3bf', marginTop: 4 }}>
                        {new Date(item.pubDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            </div>
        </a>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AgencyDashboard = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loadingStats, setLoadingStats] = useState(true);
    const [loadingNews, setLoadingNews] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        try {
            setLoadingStats(true);
            const res = await apiClient.get('/api/agency/dashboard');
            if (res.data.success) setStats(res.data.data);
            else setError(res.data.error || 'İstatistikler yüklenemedi');
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Sunucuya bağlanılamadı');
        } finally {
            setLoadingStats(false);
        }
    }, []);

    const fetchNews = useCallback(async () => {
        try {
            setLoadingNews(true);
            // Use backend as a CORS-safe proxy for the RSS feed
            const res = await apiClient.get('/api/news/tourism');
            if (res.data.success && res.data.data.length > 0) {
                setNews(res.data.data);
            }
        } catch {
            // silently fail – news is non-critical
        } finally {
            setLoadingNews(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchNews();
    }, [fetchStats, fetchNews]);

    function extractImageFromContent(html: string) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        return match ? match[1] : undefined;
    }

    const BAR_COLORS = [
        '#3b82f6','#60a5fa','#2563eb','#7c3aed','#0ea5e9',
        '#06b6d4','#3b82f6','#60a5fa','#2563eb','#7c3aed','#0ea5e9','#06b6d4'
    ];

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="dashboard">
                {/* ── Header ─────────────────────────────────────────────── */}
                <div style={{ marginBottom: 24 }}>
                    <h1 style={{
                        fontSize: 24, fontWeight: 800,
                        color: '#0f172a', margin: 0, lineHeight: 1.2
                    }}>
                        Hoş Geldiniz, {user?.fullName} 👋
                    </h1>
                    <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>
                        B2B Acente Paneli &mdash; Transfer taleplerinizi ve personellerinizi buradan yönetebilirsiniz.
                    </p>
                </div>

                {/* ── Info Banner ─────────────────────────────────────────── */}
                <Alert
                    message="Bilgilendirme"
                    description="Acente paneli üzerinden yaptığınız tüm transfer talepleri, tarafımızca onaylandıktan sonra araca atanacaktır."
                    type="info"
                    showIcon
                    style={{ borderRadius: 12, marginBottom: 28, border: 'none', background: '#eff6ff' }}
                />

                {/* ── Error ───────────────────────────────────────────────── */}
                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ borderRadius: 12, marginBottom: 20 }}
                    />
                )}

                {/* ── Stat Cards ──────────────────────────────────────────── */}
                {loadingStats ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                        <Spin size="large" />
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(6, 1fr)',
                        gap: 16,
                        marginBottom: 28
                    }}>
                        <StatCard
                            title="Toplam Transfer"
                            value={stats?.totalTransfers ?? 0}
                            icon={<CarOutlined />}
                            gradient="linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)"
                            textColor="#ffffff"
                        />
                        <StatCard
                            title="Tamamlanan"
                            value={stats?.completedTransfers ?? 0}
                            icon={<CheckCircleOutlined />}
                            gradient="linear-gradient(135deg, #065f46 0%, #10b981 100%)"
                            textColor="#ffffff"
                            subtitle="Transfer"
                        />
                        <StatCard
                            title="Bekleyen"
                            value={stats?.pendingTransfers ?? 0}
                            icon={<ClockCircleOutlined />}
                            gradient="linear-gradient(135deg, #92400e 0%, #f59e0b 100%)"
                            textColor="#ffffff"
                            subtitle="Transfer"
                        />
                        <StatCard
                            title="Transfer Aşamasında"
                            value={stats?.inProgressTransfers ?? 0}
                            icon={<SyncOutlined spin={!!stats?.inProgressTransfers} />}
                            gradient="linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)"
                            textColor="#ffffff"
                            subtitle="Onaylandı"
                        />
                        {user?.role?.type === 'AGENCY_ADMIN' && (
                            <StatCard
                                title="Personel Sayısı"
                                value={stats?.staffCount ?? 0}
                                icon={<TeamOutlined />}
                                gradient="linear-gradient(135deg, #9d174d 0%, #ec4899 100%)"
                                textColor="#ffffff"
                                subtitle="Aktif çalışan"
                            />
                        )}
                        <StatCard
                            title="Bakiye"
                            value={`₺${(stats?.balance ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                            icon={<WalletOutlined />}
                            gradient="linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%)"
                            textColor="#ffffff"
                            subtitle="Güncel hesap"
                        />
                    </div>
                )}

                {/* ── Chart + News side by side ────────────────────────────── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 380px',
                    gap: 20,
                }}>
                    {/* Monthly Transfer Chart */}
                    <div style={{
                        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
                        borderRadius: 20,
                        padding: '24px 28px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <div>
                                <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>
                                    <RiseOutlined style={{ marginRight: 8, color: '#3b82f6' }} />
                                    Aylık Transfer Grafiği
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                                    {new Date().getFullYear()} yılı &bull; Aylık transfer dağılımı
                                </div>
                            </div>
                            <button
                                onClick={fetchStats}
                                style={{
                                    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                                    borderRadius: 8, padding: '6px 14px', color: '#93c5fd',
                                    cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6
                                }}
                            >
                                <ReloadOutlined /> Yenile
                            </button>
                        </div>

                        {loadingStats ? (
                            <div style={{ display: 'flex', justifyContent: 'center', height: 260, alignItems: 'center' }}>
                                <Spin />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={stats?.monthlyChart || []} barSize={28} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                                    <defs>
                                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={1} />
                                            <stop offset="95%" stopColor="#1e40af" stopOpacity={0.8} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="url(#barGrad)">
                                        {(stats?.monthlyChart || []).map((_, i) => (
                                            <Cell key={i} fill={new Date().getMonth() === i ? '#60a5fa' : 'url(#barGrad)'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}

                        {/* Stats summary row */}
                        {!loadingStats && stats && (
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
                                gap: 12, marginTop: 20, paddingTop: 20,
                                borderTop: '1px solid rgba(255,255,255,0.07)'
                            }}>
                                {[
                                    { label: 'Bu Ay', value: stats.monthlyChart[new Date().getMonth()]?.count ?? 0, color: '#60a5fa' },
                                    { label: 'Tamamlanan', value: stats.completedTransfers, color: '#34d399' },
                                    { label: 'Bekleyen', value: stats.pendingTransfers, color: '#fbbf24' },
                                ].map(s => (
                                    <div key={s.label} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tourism News Panel */}
                    <div style={{
                        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
                        borderRadius: 20,
                        padding: '24px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: 470,
                        overflow: 'hidden',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                                <ReadOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
                                Turizm Haberleri
                            </div>
                            <a
                                href="https://www.turizmguncel.com"
                                target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}
                            >
                                Tümünü gör →
                            </a>
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                            {loadingNews ? (
                                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
                                    <Spin />
                                </div>
                            ) : news.length === 0 ? (
                                <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
                                    Haberler yüklenemedi.
                                </p>
                            ) : (
                                news.map((item, i) => <NewsCard key={i} item={item} />)
                            )}
                        </div>
                    </div>
                </div>

                {/* Responsive mobile override */}
                <style>{`
                    @media (max-width: 900px) {
                        .agency-grid-main { grid-template-columns: 1fr !important; }
                    }
                `}</style>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyDashboard;
