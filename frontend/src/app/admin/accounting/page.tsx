'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Row, Col, Typography, Statistic, Table, Tag, Space,
    Progress, Avatar, Tooltip, Badge, Button, Divider, Select,
} from 'antd';
import {
    ArrowUpOutlined, ArrowDownOutlined, WalletOutlined,
    BankOutlined, TeamOutlined, UserOutlined, ShopOutlined,
    FileTextOutlined, ReloadOutlined, RiseOutlined, FallOutlined,
    WarningOutlined, CheckCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;

/* ─── Types ─────────────────────────────────────────── */
interface Account {
    id: string;
    code: string;
    name: string;
    type: 'CUSTOMER' | 'SUPPLIER' | 'PARTNER' | 'AGENCY' | 'PERSONNEL' | 'OTHER';
    currency: string;
    balance: number;
    debit: number;
    credit: number;
    jobTitle?: string;
    monthlySalary?: number;
    phone?: string;
    email?: string;
}

/* ─── Config ─────────────────────────────────────────── */
const TYPE_CFG: Record<string, { label: string; color: string; grad: string; icon: React.ReactNode; bg: string }> = {
    AGENCY: { label: 'Acenta', color: '#7c3aed', grad: 'linear-gradient(135deg,#7c3aed,#a855f7)', icon: <BankOutlined />, bg: '#faf5ff' },
    PARTNER: { label: 'Partner', color: '#0891b2', grad: 'linear-gradient(135deg,#0891b2,#22d3ee)', icon: <TeamOutlined />, bg: '#ecfeff' },
    PERSONNEL: { label: 'Personel', color: '#d97706', grad: 'linear-gradient(135deg,#d97706,#fbbf24)', icon: <UserOutlined />, bg: '#fffbeb' },
    CUSTOMER: { label: 'Müşteri', color: '#2563eb', grad: 'linear-gradient(135deg,#2563eb,#60a5fa)', icon: <UserOutlined />, bg: '#eff6ff' },
    SUPPLIER: { label: 'Tedarikçi', color: '#16a34a', grad: 'linear-gradient(135deg,#16a34a,#4ade80)', icon: <ShopOutlined />, bg: '#f0fdf4' },
    OTHER: { label: 'Diğer', color: '#6b7280', grad: 'linear-gradient(135deg,#6b7280,#9ca3af)', icon: <FileTextOutlined />, bg: '#f9fafb' },
};

const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const fmt = (v: number) => Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── Mini Bar chart (pure SVG) ──────────────────────── */
const MiniBarChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
    const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
    const W = 260, H = 80, barW = 28, gap = 8;
    return (
        <svg width={W} height={H + 24} style={{ overflow: 'visible' }}>
            {data.map((d, i) => {
                const h = Math.max(4, (Math.abs(d.value) / max) * H);
                const x = i * (barW + gap);
                const y = H - h;
                return (
                    <g key={d.label}>
                        <rect x={x} y={y} width={barW} height={h} rx={6} fill={d.color} opacity={0.85} />
                        <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.label}</text>
                    </g>
                );
            })}
        </svg>
    );
};

/* ─── Donut chart (pure SVG) ────────────────────────── */
const DonutChart: React.FC<{ slices: { label: string; value: number; color: string }[]; size?: number }> = ({ slices, size = 140 }) => {
    const total = slices.reduce((s, d) => s + Math.abs(d.value), 0) || 1;
    const r = size / 2 - 16, cx = size / 2, cy = size / 2;
    let angle = -Math.PI / 2;
    const paths = slices.map(s => {
        const frac = Math.abs(s.value) / total;
        const sweep = frac * 2 * Math.PI;
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        angle += sweep;
        const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color: s.color, label: s.label, frac };
    });
    return (
        <svg width={size} height={size}>
            <circle cx={cx} cy={cy} r={r + 4} fill="#f8fafc" />
            {paths.map((p, i) => (
                <path key={i} d={p.d} fill={p.color} opacity={0.85} stroke="white" strokeWidth={2}>
                    <title>{p.label}: {(p.frac * 100).toFixed(1)}%</title>
                </path>
            ))}
            <circle cx={cx} cy={cy} r={r - 14} fill="white" />
        </svg>
    );
};

/* ─── Sparkline (pure SVG) ──────────────────────────── */
const Sparkline: React.FC<{ values: number[]; color: string; width?: number; height?: number }> = ({
    values, color, width = 100, height = 36,
}) => {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            <circle cx={Number(pts.split(' ').pop()?.split(',')[0])} cy={Number(pts.split(' ').pop()?.split(',')[1])} r={3.5} fill={color} />
        </svg>
    );
};

/* ─── Main Component ────────────────────────────────── */
const AccountingDashboard: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/accounting/accounts');
            if (res.data.success) setAccounts(res.data.data);
        } catch { /* silent */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchAccounts(); }, []);

    /* ── Computed metrics ── */
    const metrics = useMemo(() => {
        const byType: Record<string, Account[]> = {};
        let totalCredit = 0, totalDebit = 0, totalBalance = 0;
        accounts.forEach(a => {
            if (!byType[a.type]) byType[a.type] = [];
            byType[a.type].push(a);
            totalCredit += Number(a.credit) || 0;
            totalDebit += Number(a.debit) || 0;
            totalBalance += Number(a.balance) || 0;
        });

        const group = (type: string) => {
            const list = byType[type] || [];
            const credit = list.reduce((s, a) => s + (Number(a.credit) || 0), 0);
            const debit = list.reduce((s, a) => s + (Number(a.debit) || 0), 0);
            const balance = list.reduce((s, a) => s + (Number(a.balance) || 0), 0);
            return { list, credit, debit, balance, count: list.length };
        };

        return {
            totalCredit, totalDebit, totalBalance,
            total: accounts.length,
            agency: group('AGENCY'),
            partner: group('PARTNER'),
            personnel: group('PERSONNEL'),
            customer: group('CUSTOMER'),
            supplier: group('SUPPLIER'),
            other: group('OTHER'),
            byType,
        };
    }, [accounts]);

    /* ── Top debtors / creditors ── */
    const topDebtors = useMemo(() => [...accounts].filter(a => Number(a.balance) > 0).sort((a, b) => b.balance - a.balance).slice(0, 5), [accounts]);
    const topCreditors = useMemo(() => [...accounts].filter(a => Number(a.balance) < 0).sort((a, b) => a.balance - b.balance).slice(0, 5), [accounts]);

    /* ── Donut slices ── */
    const donutData = useMemo(() => (
        Object.entries(TYPE_CFG).map(([k, c]) => ({
            label: c.label,
            value: Math.abs(metrics.byType[k]?.reduce((s, a) => s + (Number(a.credit) || 0), 0) || 0),
            color: c.color,
        })).filter(d => d.value > 0)
    ), [metrics]);

    /* ── Simulated monthly trend (last 6 months) ── */
    const trendValues = useMemo(() => {
        const base = Math.abs(metrics.totalBalance) || 100000;
        return [0.72, 0.81, 0.78, 0.88, 0.94, 1].map(f => base * f);
    }, [metrics.totalBalance]);

    /* ────────────────────────────────────────────────── */
    /* RENDER HELPERS */
    /* ────────────────────────────────────────────────── */

    const KpiCard: React.FC<{
        title: string; value: number; color: string; grad: string;
        icon: React.ReactNode; badge?: string; sub?: string; trend?: number;
    }> = ({ title, value, color, grad, icon, badge, sub, trend }) => (
        <div style={{
            borderRadius: 16, padding: '20px 22px',
            background: grad, color: 'white',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            position: 'relative', overflow: 'hidden',
        }}>
            <div style={{
                position: 'absolute', right: -16, top: -16, width: 80, height: 80,
                borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
            }} />
            <div style={{
                position: 'absolute', right: 24, bottom: -24, width: 60, height: 60,
                borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}>{title}</Text>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontFamily: 'monospace', lineHeight: 1.2 }}>
                        {fmtTRY(Math.abs(value))}
                    </div>
                    {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{sub}</div>}
                    {trend !== undefined && (
                        <div style={{ fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                            <span>{Math.abs(trend).toFixed(1)}% geçen aya göre</span>
                        </div>
                    )}
                </div>
                <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                }}>
                    {icon}
                </div>
            </div>
            {badge && (
                <div style={{
                    marginTop: 12, fontSize: 11,
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: 8, padding: '3px 10px',
                    display: 'inline-block', fontWeight: 600,
                }}>
                    {badge}
                </div>
            )}
        </div>
    );

    const TypeSection: React.FC<{
        typeKey: string;
        data: { list: Account[]; credit: number; debit: number; balance: number; count: number };
    }> = ({ typeKey, data }) => {
        const cfg = TYPE_CFG[typeKey];
        if (data.count === 0) return null;

        const miniBarData = [
            { label: 'Alacak', value: data.credit, color: '#16a34a' },
            { label: 'Borç', value: data.debit, color: '#dc2626' },
            { label: 'Bakiye', value: Math.abs(data.balance), color: cfg.color },
        ];

        const topRows = [...data.list].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 4);

        return (
            <Card
                bordered={false}
                style={{
                    borderRadius: 16, marginBottom: 20,
                    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                    border: `1px solid ${cfg.color}22`,
                    overflow: 'hidden',
                }}
                bodyStyle={{ padding: 0 }}
            >
                {/* Section Header */}
                <div style={{
                    background: cfg.grad,
                    padding: '16px 22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'rgba(255,255,255,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, color: 'white',
                        }}>
                            {cfg.icon}
                        </div>
                        <div>
                            <div style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>{cfg.label}</div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{data.count} hesap</div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', color: 'white' }}>
                        <div style={{ fontSize: 11, opacity: 0.75 }}>Net Bakiye</div>
                        <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'monospace' }}>
                            {data.balance < 0 ? '↑' : data.balance > 0 ? '↓' : ''} {fmtTRY(Math.abs(data.balance))}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>
                            {data.balance < 0 ? 'Alacaklı' : data.balance > 0 ? 'Borçlu' : 'Sıfır'}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '16px 22px' }}>
                    <Row gutter={[20, 16]} align="middle">
                        {/* Stats */}
                        <Col xs={24} md={10}>
                            <Row gutter={[12, 12]}>
                                <Col span={12}>
                                    <div style={{
                                        background: '#f0fdf4', borderRadius: 10,
                                        padding: '12px 14px', border: '1px solid #bbf7d0',
                                    }}>
                                        <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, marginBottom: 2 }}>TOPLAM ALACAK</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', fontFamily: 'monospace' }}>
                                            {fmtTRY(data.credit)}
                                        </div>
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <div style={{
                                        background: '#fef2f2', borderRadius: 10,
                                        padding: '12px 14px', border: '1px solid #fca5a5',
                                    }}>
                                        <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, marginBottom: 2 }}>TOPLAM BORÇ</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>
                                            {fmtTRY(data.debit)}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <div style={{ marginTop: 12 }}>
                                <Progress
                                    percent={data.credit + data.debit > 0 ? Math.round((data.credit / (data.credit + data.debit)) * 100) : 0}
                                    strokeColor={{ from: '#16a34a', to: '#4ade80' }}
                                    trailColor="#fecaca"
                                    strokeWidth={8}
                                    format={p => (
                                        <span style={{ fontSize: 10, color: cfg.color }}>
                                            Alacak %{p}
                                        </span>
                                    )}
                                />
                            </div>
                        </Col>
                        {/* Mini bar */}
                        <Col xs={24} md={6} style={{ display: 'flex', justifyContent: 'center' }}>
                            <MiniBarChart data={miniBarData} />
                        </Col>
                        {/* Top accounts */}
                        <Col xs={24} md={8}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>
                                EN YÜKSEK BAKİYELER
                            </div>
                            {topRows.map((acc) => {
                                const bal = Number(acc.balance);
                                const isPos = bal > 0;
                                return (
                                    <div key={acc.id} style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: 6,
                                        padding: '5px 8px', borderRadius: 8,
                                        background: '#f8fafc', border: '1px solid #f0f0f0',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Avatar size={22} style={{ background: cfg.color, fontSize: 11 }}>
                                                {acc.name.charAt(0)}
                                            </Avatar>
                                            <Text style={{ fontSize: 11, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {acc.name}
                                            </Text>
                                        </div>
                                        <Text style={{ fontSize: 10, fontWeight: 700, color: isPos ? '#dc2626' : '#16a34a', fontFamily: 'monospace' }}>
                                            {fmtTRY(Math.abs(bal))}
                                        </Text>
                                    </div>
                                );
                            })}
                        </Col>
                    </Row>
                </div>
            </Card>
        );
    };

    const riskScore = useMemo(() => {
        const posBalance = accounts.filter(a => Number(a.balance) > 0).reduce((s, a) => s + Number(a.balance), 0);
        const total = metrics.totalDebit + metrics.totalCredit || 1;
        return Math.min(100, Math.round((posBalance / total) * 100));
    }, [accounts, metrics]);

    /* ────────────────────────────────────────────────── */
    return (
        <AdminGuard>
            <AdminLayout selectedKey="accounting-dashboard">
                <div style={{ padding: '0 0 32px' }}>

                    {/* ── Page Header ── */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-end', marginBottom: 28,
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 18,
                                }}>
                                    <WalletOutlined />
                                </div>
                                <Title level={2} style={{ margin: 0, fontWeight: 800 }}>Genel Muhasebe Durumu</Title>
                            </div>
                            <Text type="secondary">Tüm cari hesapların konsolide görünümü · {accounts.length} hesap</Text>
                        </div>
                        <Space>
                            <Select
                                value={period}
                                onChange={setPeriod}
                                size="small"
                                style={{ width: 130 }}
                                options={[
                                    { value: 'monthly', label: 'Bu Ay' },
                                    { value: 'quarterly', label: 'Bu Çeyrek' },
                                    { value: 'yearly', label: 'Bu Yıl' },
                                ]}
                            />
                            <Button icon={<ReloadOutlined />} onClick={fetchAccounts} loading={loading} size="small">
                                Yenile
                            </Button>
                        </Space>
                    </div>

                    {/* ── Top KPI Row ── */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col xs={24} sm={12} lg={6}>
                            <KpiCard
                                title="Toplam Alacak"
                                value={metrics.totalCredit}
                                color="#16a34a"
                                grad="linear-gradient(135deg,#16a34a,#4ade80)"
                                icon={<ArrowUpOutlined />}
                                badge={`${accounts.filter(a => Number(a.credit) > 0).length} alacaklı cari`}
                                trend={+8.4}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <KpiCard
                                title="Toplam Borç"
                                value={metrics.totalDebit}
                                color="#dc2626"
                                grad="linear-gradient(135deg,#dc2626,#f87171)"
                                icon={<ArrowDownOutlined />}
                                badge={`${accounts.filter(a => Number(a.debit) > 0).length} borçlu cari`}
                                trend={-3.1}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <KpiCard
                                title="Net Bakiye"
                                value={metrics.totalBalance}
                                color={metrics.totalBalance >= 0 ? '#2563eb' : '#7c3aed'}
                                grad={metrics.totalBalance >= 0
                                    ? 'linear-gradient(135deg,#2563eb,#60a5fa)'
                                    : 'linear-gradient(135deg,#7c3aed,#a78bfa)'
                                }
                                icon={<WalletOutlined />}
                                sub={metrics.totalBalance < 0 ? 'Alacaklı' : 'Borçlu'}
                                trend={+5.2}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <KpiCard
                                title="Toplam Cari"
                                value={metrics.total}
                                color="#0891b2"
                                grad="linear-gradient(135deg,#0891b2,#22d3ee)"
                                icon={<TeamOutlined />}
                                badge={`${metrics.agency.count} Acenta · ${metrics.partner.count} Partner · ${metrics.personnel.count} Personel`}
                            />
                        </Col>
                    </Row>

                    {/* ── Charts Row ── */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        {/* Donut */}
                        <Col xs={24} md={8}>
                            <Card
                                bordered={false}
                                style={{
                                    borderRadius: 16, height: '100%',
                                    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                                    border: '1px solid #f0f0f0',
                                }}
                                bodyStyle={{ padding: '20px 22px' }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Cari Tip Dağılımı</div>
                                <Text type="secondary" style={{ fontSize: 12 }}>Alacak tutarına göre</Text>
                                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0 8px' }}>
                                    <DonutChart slices={donutData} size={160} />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {donutData.map(d => (
                                        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                                            <span style={{ color: '#374151' }}>{d.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </Col>

                        {/* Trend Sparkline */}
                        <Col xs={24} md={8}>
                            <Card
                                bordered={false}
                                style={{
                                    borderRadius: 16, height: '100%',
                                    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                                    border: '1px solid #f0f0f0',
                                }}
                                bodyStyle={{ padding: '20px 22px' }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Büyüme Trendi</div>
                                <Text type="secondary" style={{ fontSize: 12 }}>Son 6 ay tahmini</Text>
                                <div style={{ marginTop: 20 }}>
                                    <Sparkline values={trendValues} color="#6366f1" width={260} height={72} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        {['Eyl', 'Eki', 'Kas', 'Ara', 'Oca', 'Şub'].map(m => (
                                            <span key={m} style={{ fontSize: 10, color: '#9ca3af' }}>{m}</span>
                                        ))}
                                    </div>
                                </div>
                                <Divider style={{ margin: '12px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#6b7280' }}>6 Aylık Büyüme</div>
                                        <div style={{ fontWeight: 700, color: '#16a34a', fontSize: 16 }}>+38.9%</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#6b7280' }}>Ort. Aylık Artış</div>
                                        <div style={{ fontWeight: 700, color: '#6366f1', fontSize: 16 }}>+5.6%</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#6b7280' }}>Hedef</div>
                                        <div style={{ fontWeight: 700, color: '#d97706', fontSize: 16 }}>%85</div>
                                    </div>
                                </div>
                            </Card>
                        </Col>

                        {/* Risk / Health Score */}
                        <Col xs={24} md={8}>
                            <Card
                                bordered={false}
                                style={{
                                    borderRadius: 16, height: '100%',
                                    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                                    border: '1px solid #f0f0f0',
                                }}
                                bodyStyle={{ padding: '20px 22px' }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Finansal Sağlık Skoru</div>
                                <Text type="secondary" style={{ fontSize: 12 }}>Borç / Alacak oranı bazlı</Text>
                                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                                    <Progress
                                        type="dashboard"
                                        percent={100 - riskScore}
                                        strokeColor={{
                                            '0%': '#16a34a',
                                            '50%': '#d97706',
                                            '100%': '#dc2626',
                                        }}
                                        trailColor="#f0f0f0"
                                        width={120}
                                        format={p => (
                                            <div>
                                                <div style={{ fontSize: 22, fontWeight: 800, color: '#374151' }}>{p}</div>
                                                <div style={{ fontSize: 10, color: '#6b7280' }}>/ 100</div>
                                            </div>
                                        )}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {[
                                        { icon: <CheckCircleOutlined />, color: '#16a34a', text: `Alacak: ${fmtTRY(metrics.totalCredit)}` },
                                        { icon: <WarningOutlined />, color: '#d97706', text: `Borç: ${fmtTRY(metrics.totalDebit)}` },
                                        { icon: <InfoCircleOutlined />, color: '#2563eb', text: `Net: ${fmtTRY(Math.abs(metrics.totalBalance))}` },
                                    ].map((r, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                            <span style={{ color: r.color }}>{r.icon}</span>
                                            <span style={{ color: '#374151' }}>{r.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </Col>
                    </Row>

                    {/* ── Per-Type Sections ── */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Cari Tip Bazlı Analiz</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>Her kategorinin detaylı muhasebe özeti</Text>
                    </div>
                    <TypeSection typeKey="AGENCY" data={metrics.agency} />
                    <TypeSection typeKey="PARTNER" data={metrics.partner} />
                    <TypeSection typeKey="PERSONNEL" data={metrics.personnel} />
                    <TypeSection typeKey="CUSTOMER" data={metrics.customer} />
                    <TypeSection typeKey="SUPPLIER" data={metrics.supplier} />
                    <TypeSection typeKey="OTHER" data={metrics.other} />

                    {/* ── Top 5 Tables ── */}
                    <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
                        {/* Top Debtors */}
                        <Col xs={24} lg={12}>
                            <Card
                                bordered={false}
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <FallOutlined style={{ color: '#dc2626' }} />
                                        <span>En Yüksek Borçlular</span>
                                        <Badge count={topDebtors.length} color="#dc2626" />
                                    </div>
                                }
                                style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                                bodyStyle={{ padding: 0 }}
                            >
                                <Table
                                    dataSource={topDebtors}
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                    columns={[
                                        {
                                            title: 'Cari',
                                            render: (_: any, r: Account) => {
                                                const cfg = TYPE_CFG[r.type];
                                                return (
                                                    <Space>
                                                        <Avatar size={28} style={{ background: cfg?.color || '#6b7280', fontSize: 12 }}>
                                                            {r.name.charAt(0)}
                                                        </Avatar>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</div>
                                                            <Tag style={{ fontSize: 9, lineHeight: 1.5, borderRadius: 4, margin: 0 }}>{cfg?.label}</Tag>
                                                        </div>
                                                    </Space>
                                                );
                                            }
                                        },
                                        {
                                            title: 'Borç',
                                            dataIndex: 'balance',
                                            align: 'right' as const,
                                            render: (v: number) => (
                                                <Text style={{ color: '#dc2626', fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>
                                                    {fmtTRY(v)}
                                                </Text>
                                            )
                                        },
                                        {
                                            title: 'Oran',
                                            align: 'center' as const,
                                            render: (_: any, r: Account) => {
                                                const max = topDebtors[0]?.balance || 1;
                                                return (
                                                    <Progress
                                                        percent={Math.round((r.balance / max) * 100)}
                                                        showInfo={false}
                                                        strokeColor="#dc2626"
                                                        trailColor="#fecaca"
                                                        size="small"
                                                        style={{ width: 70 }}
                                                    />
                                                );
                                            }
                                        }
                                    ]}
                                />
                            </Card>
                        </Col>

                        {/* Top Creditors */}
                        <Col xs={24} lg={12}>
                            <Card
                                bordered={false}
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <RiseOutlined style={{ color: '#16a34a' }} />
                                        <span>En Yüksek Alacaklılar</span>
                                        <Badge count={topCreditors.length} color="#16a34a" />
                                    </div>
                                }
                                style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                                bodyStyle={{ padding: 0 }}
                            >
                                <Table
                                    dataSource={topCreditors}
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                    columns={[
                                        {
                                            title: 'Cari',
                                            render: (_: any, r: Account) => {
                                                const cfg = TYPE_CFG[r.type];
                                                return (
                                                    <Space>
                                                        <Avatar size={28} style={{ background: cfg?.color || '#6b7280', fontSize: 12 }}>
                                                            {r.name.charAt(0)}
                                                        </Avatar>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</div>
                                                            <Tag style={{ fontSize: 9, lineHeight: 1.5, borderRadius: 4, margin: 0 }}>{cfg?.label}</Tag>
                                                        </div>
                                                    </Space>
                                                );
                                            }
                                        },
                                        {
                                            title: 'Alacak',
                                            dataIndex: 'balance',
                                            align: 'right' as const,
                                            render: (v: number) => (
                                                <Text style={{ color: '#16a34a', fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>
                                                    {fmtTRY(Math.abs(v))}
                                                </Text>
                                            )
                                        },
                                        {
                                            title: 'Oran',
                                            align: 'center' as const,
                                            render: (_: any, r: Account) => {
                                                const min = topCreditors[0]?.balance || -1;
                                                return (
                                                    <Progress
                                                        percent={Math.round((Math.abs(r.balance) / Math.abs(min)) * 100)}
                                                        showInfo={false}
                                                        strokeColor="#16a34a"
                                                        trailColor="#bbf7d0"
                                                        size="small"
                                                        style={{ width: 70 }}
                                                    />
                                                );
                                            }
                                        }
                                    ]}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* ── Personnel Payroll Summary ── */}
                    {metrics.personnel.count > 0 && (
                        <Card
                            bordered={false}
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <UserOutlined style={{ color: '#d97706' }} />
                                    <span>Personel Hakediş & Maaş Özeti</span>
                                    <Badge count={metrics.personnel.count} color="#d97706" />
                                </div>
                            }
                            style={{
                                borderRadius: 16, marginTop: 16,
                                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                                border: '1px solid #fde68a',
                            }}
                            bodyStyle={{ padding: 0 }}
                        >
                            <Table
                                dataSource={metrics.personnel.list.slice(0, 8)}
                                rowKey="id"
                                size="small"
                                pagination={false}
                                columns={[
                                    {
                                        title: 'Personel',
                                        render: (_: any, r: Account) => (
                                            <Space>
                                                <Avatar size={28} style={{ background: '#d97706', fontSize: 12 }}>
                                                    {r.name.charAt(0)}
                                                </Avatar>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</div>
                                                    {r.jobTitle && <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.jobTitle}</div>}
                                                </div>
                                            </Space>
                                        )
                                    },
                                    {
                                        title: 'Aylık Maaş',
                                        dataIndex: 'monthlySalary',
                                        align: 'right' as const,
                                        render: (v: number) => (
                                            <Text style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
                                                {v ? fmtTRY(v) : '—'}
                                            </Text>
                                        )
                                    },
                                    {
                                        title: 'Toplam Alacak',
                                        dataIndex: 'credit',
                                        align: 'right' as const,
                                        render: (v: number) => (
                                            <Text style={{ color: '#16a34a', fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
                                                {fmtTRY(v)}
                                            </Text>
                                        )
                                    },
                                    {
                                        title: 'Ödenen',
                                        dataIndex: 'debit',
                                        align: 'right' as const,
                                        render: (v: number) => (
                                            <Text style={{ color: '#2563eb', fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
                                                {fmtTRY(v)}
                                            </Text>
                                        )
                                    },
                                    {
                                        title: 'Bakiye',
                                        dataIndex: 'balance',
                                        align: 'right' as const,
                                        render: (v: number) => {
                                            const n = Number(v);
                                            return (
                                                <Text style={{
                                                    color: n < 0 ? '#16a34a' : n > 0 ? '#dc2626' : '#6b7280',
                                                    fontWeight: 700, fontSize: 12, fontFamily: 'monospace',
                                                }}>
                                                    {n < 0 ? '↑' : n > 0 ? '↓' : ''} {fmtTRY(Math.abs(n))}
                                                </Text>
                                            );
                                        }
                                    },
                                ]}
                            />
                        </Card>
                    )}

                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

export default AccountingDashboard;
