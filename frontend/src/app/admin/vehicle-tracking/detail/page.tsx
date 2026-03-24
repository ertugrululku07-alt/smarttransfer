'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Table, Button, Tag, Typography, Row, Col, Statistic,
    Tabs, Timeline, Empty, Divider, Progress, Space, Tooltip, Badge, Avatar,
    message, Spin
} from 'antd';
import {
    ArrowLeftOutlined, CarOutlined, SafetyOutlined, ExperimentOutlined,
    ToolOutlined, ThunderboltOutlined, BarChartOutlined, ClockCircleOutlined,
    CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, CalendarOutlined,
    DollarOutlined, FireOutlined, AimOutlined, RocketOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter, useSearchParams } from 'next/navigation';

const { Title, Text } = Typography;

/* ─── Formatters ──────────────────────────────────── */
const fmtTRY = (v: number) =>
    Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const fmtDate = (v: string | undefined) =>
    v ? new Date(v).toLocaleDateString('tr-TR') : '—';
const fmtKm = (v: number) =>
    `${Number(v || 0).toLocaleString('tr-TR')} km`;

/* ─── Colors / Styles ────────────────────────────── */
const CARD_STYLE = {
    borderRadius: 16,
    border: '1px solid #f0f0f0',
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};
const GRAD = {
    insurance: 'linear-gradient(135deg,#16a34a 0%,#4ade80 100%)',
    fuel: 'linear-gradient(135deg,#d97706 0%,#fbbf24 100%)',
    inspection: 'linear-gradient(135deg,#2563eb 0%,#60a5fa 100%)',
    maintenance: 'linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%)',
    km: 'linear-gradient(135deg,#0891b2 0%,#22d3ee 100%)',
    total: 'linear-gradient(135deg,#dc2626 0%,#f87171 100%)',
};

/* ─── Status helpers ─────────────────────────────── */
const now = new Date();
const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const insStatus = (r: any) => {
    if (!r.endDate) return { label: 'Belirsiz', color: '#6b7280', bg: '#f9fafb', icon: <ClockCircleOutlined /> };
    const end = new Date(r.endDate);
    if (end < now) return { label: 'Süresi Doldu', color: '#dc2626', bg: '#fef2f2', icon: <CloseCircleOutlined /> };
    if (end < in7) return { label: 'Kritik', color: '#b91c1c', bg: '#fef2f2', icon: <CloseCircleOutlined /> };
    if (end < in30) return { label: 'Yakında Bitiyor', color: '#d97706', bg: '#fffbeb', icon: <WarningOutlined /> };
    return { label: 'Geçerli', color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleOutlined /> };
};

const inspStatus = (r: any) => {
    if (!r.nextDate) return { label: 'Bilinmiyor', color: '#6b7280' };
    const next = new Date(r.nextDate);
    if (next < now) return { label: 'Gecikmiş', color: '#dc2626' };
    if (next < in30) return { label: 'Yaklaşıyor', color: '#d97706' };
    return { label: 'Tamam', color: '#16a34a' };
};

/* ─── Mini Stat Card ─────────────────────────────── */
const StatCard = ({ icon, label, value, gradient, sub }: {
    icon: React.ReactNode; label: string; value: string; gradient: string; sub?: string;
}) => (
    <Card
        bordered={false}
        style={{ ...CARD_STYLE, background: gradient, border: 'none' }}
        bodyStyle={{ padding: '16px 20px' }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)' }}>{icon}</div>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</Text>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{sub}</div>}
    </Card>
);

/* ─── Section Header ─────────────────────────────── */
const SectionHeader = ({ icon, title, color, count }: { icon: React.ReactNode; title: string; color: string; count?: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>
            {icon}
        </div>
        <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{title}</div>
            {count !== undefined && <div style={{ fontSize: 11, color: '#6b7280' }}>{count} kayıt</div>}
        </div>
    </div>
);

/* ─── Expense Bar ────────────────────────────────── */
const ExpenseBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
    const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#374151' }}>{label}</Text>
                <Text style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>{fmtTRY(value)}</Text>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>{pct.toFixed(1)}%</Text>
        </div>
    );
};

/* ─── Main Component ─────────────────────────────── */
const VehicleDetailPage: React.FC = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const vehicleId = searchParams.get('id');

    const [vehicle, setVehicle] = useState<any>(null);
    const [tracking, setTracking] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (vehicleId) {
            fetchData();
        }
    }, [vehicleId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [vehicleRes, trackingRes] = await Promise.all([
                apiClient.get('/api/vehicles'),
                apiClient.get(`/api/vehicle-tracking/${vehicleId}`),
            ]);

            const vehicleList = vehicleRes.data?.data || [];
            const found = vehicleList.find((v: any) => v.id === vehicleId);
            setVehicle(found || null);

            if (trackingRes.data?.success) {
                setTracking(trackingRes.data.data || {});
            }
        } catch {
            message.error('Araç verisi yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    /* ─── Derived data ─── */
    const insurance = tracking.insurance || [];
    const fuel = tracking.fuel || [];
    const inspection = tracking.inspection || [];
    const maintenance = tracking.maintenance || [];
    const totalKm = tracking.totalKm || 0;

    const activeIns = insurance.filter((r: any) => r.endDate && new Date(r.endDate) >= now);
    const latestIns = insurance.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const latestInsp = [...inspection].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const latestMaint = [...maintenance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const totalFuelCost = fuel.reduce((s: number, r: any) => s + (Number(r.totalCost) || 0), 0);
    const totalMaintCost = maintenance.reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0);
    const totalInsCost = insurance.reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0);
    const totalFuelLiters = fuel.reduce((s: number, r: any) => s + (Number(r.liters) || 0), 0);
    const totalExpense = totalFuelCost + totalMaintCost + totalInsCost;

    const avgFuelUnitPrice = fuel.length > 0
        ? fuel.reduce((s: number, r: any) => s + (Number(r.unitPrice) || 0), 0) / fuel.length
        : 0;

    /* ─── Timeline items ─── */
    const timelineItems = useMemo(() => {
        const all: { date: string; type: string; icon: React.ReactNode; color: string; title: string; sub: string }[] = [];
        insurance.forEach((r: any) => all.push({ date: r.createdAt, type: 'insurance', icon: <SafetyOutlined />, color: '#16a34a', title: `${r.company} Sigortası`, sub: `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}` }));
        fuel.forEach((r: any) => all.push({ date: r.date, type: 'fuel', icon: <FireOutlined />, color: '#d97706', title: `${r.liters}L Yakıt`, sub: `${fmtTRY(r.totalCost)} · ${r.station || ''}` }));
        inspection.forEach((r: any) => all.push({ date: r.date, type: 'inspection', icon: <AimOutlined />, color: '#2563eb', title: 'Muayene', sub: `${r.result || ''} · Sonraki: ${fmtDate(r.nextDate)}` }));
        maintenance.forEach((r: any) => all.push({ date: r.date, type: 'maintenance', icon: <ToolOutlined />, color: '#7c3aed', title: r.type || 'Bakım', sub: `${fmtTRY(r.cost)} · ${r.workshop || ''}` }));
        return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);
    }, [insurance, fuel, inspection, maintenance]);

    /* ─── Table columns ─── */
    const insColumns = [
        { title: 'Şirket / Poliçe', render: (_: any, r: any) => <div><div style={{ fontWeight: 600 }}>{r.company}</div><Text type="secondary" style={{ fontSize: 11 }}>{r.policyNo}</Text></div> },
        { title: 'Durum', render: (_: any, r: any) => { const s = insStatus(r); return <Tag style={{ borderRadius: 8, background: s.bg, border: `1px solid ${s.color}40`, color: s.color, fontWeight: 600 }}>{s.icon} {s.label}</Tag>; } },
        { title: 'Başlangıç', dataIndex: 'startDate', render: fmtDate },
        { title: 'Bitiş', dataIndex: 'endDate', render: fmtDate },
        { title: 'Tür', dataIndex: 'type', render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
        { title: 'Prim', dataIndex: 'cost', align: 'right' as const, render: (v: number) => <Text style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{fmtTRY(v)}</Text> },
        { title: 'Notlar', dataIndex: 'notes', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
    ];

    const fuelColumns = [
        { title: 'Tarih', dataIndex: 'date', render: fmtDate, sorter: (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime() },
        { title: 'Litre', dataIndex: 'liters', render: (v: number) => <Text style={{ fontWeight: 600 }}>{v} L</Text>, sorter: (a: any, b: any) => a.liters - b.liters },
        { title: 'Birim Fiyat', dataIndex: 'unitPrice', render: (v: number) => <Text style={{ color: '#d97706', fontFamily: 'monospace', fontWeight: 600 }}>{fmtTRY(v)}</Text> },
        { title: 'Toplam', dataIndex: 'totalCost', align: 'right' as const, render: (v: number) => <Text style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{fmtTRY(v)}</Text>, sorter: (a: any, b: any) => a.totalCost - b.totalCost },
        { title: 'KM', dataIndex: 'km', render: (v: number) => v ? fmtKm(v) : '—' },
        { title: 'İstasyon', dataIndex: 'station', render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Notlar', dataIndex: 'notes', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
    ];

    const inspColumns = [
        { title: 'Muayene Tarihi', dataIndex: 'date', render: fmtDate, sorter: (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime() },
        { title: 'Sonraki Muayene', dataIndex: 'nextDate', render: (v: string) => { const s = v ? (new Date(v) < now ? { color: '#dc2626' } : (new Date(v) < in30 ? { color: '#d97706' } : { color: '#16a34a' })) : {}; return <Text style={{ fontWeight: 600, fontFamily: 'monospace', ...s }}>{fmtDate(v)}</Text>; } },
        { title: 'İstasyon', dataIndex: 'station', render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Sonuç', dataIndex: 'result', render: (v: string) => v ? <Tag color={v === 'GECTI' || v === 'PASSED' ? 'green' : 'red'}>{v}</Tag> : '—' },
        { title: 'Maliyet', dataIndex: 'cost', align: 'right' as const, render: (v: number) => v ? <Text style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{fmtTRY(v)}</Text> : '—' },
        { title: 'Notlar', dataIndex: 'notes', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
    ];

    const maintColumns = [
        { title: 'Tarih', dataIndex: 'date', render: fmtDate, sorter: (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime() },
        { title: 'Tür', dataIndex: 'type', render: (v: string) => v ? <Tag color="purple">{v}</Tag> : '—' },
        { title: 'Açıklama', dataIndex: 'description', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text> },
        { title: 'KM', dataIndex: 'km', render: (v: number) => v ? fmtKm(v) : '—' },
        { title: 'Servis', dataIndex: 'workshop', render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Maliyet', dataIndex: 'cost', align: 'right' as const, render: (v: number) => <Text style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{fmtTRY(v)}</Text>, sorter: (a: any, b: any) => a.cost - b.cost },
        { title: 'Notlar', dataIndex: 'notes', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
    ];

    if (loading) return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking">
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                    <Spin size="large" tip="Araç verisi yükleniyor..." />
                </div>
            </AdminLayout>
        </AdminGuard>
    );

    if (!vehicle) return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking">
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
                    <Empty description="Araç bulunamadı" />
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')}>Geri Dön</Button>
                </div>
            </AdminLayout>
        </AdminGuard>
    );

    const tabItems = [
        {
            key: 'overview',
            label: (
                <span><BarChartOutlined /> Genel Bakış</span>
            ),
            children: (
                <div style={{ paddingTop: 8 }}>
                    <Row gutter={[16, 16]}>
                        {/* Expense distribution */}
                        <Col xs={24} lg={10}>
                            <Card bordered={false} style={CARD_STYLE} bodyStyle={{ padding: 24 }}>
                                <SectionHeader icon={<DollarOutlined />} title="Gider Dağılımı" color="linear-gradient(135deg,#dc2626,#f87171)" />
                                <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', fontFamily: 'monospace', marginBottom: 20 }}>
                                    {fmtTRY(totalExpense)}
                                </div>
                                <ExpenseBar label="🔥 Yakıt" value={totalFuelCost} total={totalExpense} color="#d97706" />
                                <ExpenseBar label="🔧 Bakım & Onarım" value={totalMaintCost} total={totalExpense} color="#7c3aed" />
                                <ExpenseBar label="🛡️ Sigorta Primleri" value={totalInsCost} total={totalExpense} color="#16a34a" />
                            </Card>
                        </Col>

                        {/* Quick stats */}
                        <Col xs={24} lg={14}>
                            <Row gutter={[12, 12]}>
                                <Col span={12}>
                                    <Card bordered={false} style={{ ...CARD_STYLE, background: '#f8faff', border: '1px solid #e0e7ff' }} bodyStyle={{ padding: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <SafetyOutlined style={{ color: '#16a34a', fontSize: 18 }} />
                                            <Text style={{ fontWeight: 700, color: '#374151' }}>Sigorta Durumu</Text>
                                        </div>
                                        {latestIns ? (
                                            <>
                                                <div style={{ fontWeight: 700, fontSize: 15 }}>{latestIns.company}</div>
                                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Poliçe: {latestIns.policyNo || '—'}</div>
                                                {(() => { const s = insStatus(latestIns); return <Tag style={{ marginTop: 6, borderRadius: 6, background: s.bg, color: s.color, border: `1px solid ${s.color}30`, fontWeight: 600 }}>{s.icon} {s.label}</Tag>; })()}
                                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Bitiş: {fmtDate(latestIns.endDate)}</div>
                                            </>
                                        ) : (
                                            <Text type="secondary" style={{ fontSize: 12 }}>Sigorta kaydı yok</Text>
                                        )}
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card bordered={false} style={{ ...CARD_STYLE, background: '#f8faff', border: '1px solid #dbeafe' }} bodyStyle={{ padding: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <AimOutlined style={{ color: '#2563eb', fontSize: 18 }} />
                                            <Text style={{ fontWeight: 700, color: '#374151' }}>Muayene Durumu</Text>
                                        </div>
                                        {latestInsp ? (
                                            <>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>Son: {fmtDate(latestInsp.date)}</div>
                                                {(() => { const s = inspStatus(latestInsp); return <Tag style={{ marginTop: 6, borderRadius: 6, color: s.color, border: `1px solid ${s.color}40`, fontWeight: 600 }}>{s.label}</Tag>; })()}
                                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Sonraki: {fmtDate(latestInsp.nextDate)}</div>
                                            </>
                                        ) : (
                                            <Text type="secondary" style={{ fontSize: 12 }}>Muayene kaydı yok</Text>
                                        )}
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card bordered={false} style={{ ...CARD_STYLE, background: '#fffbeb', border: '1px solid #fde68a' }} bodyStyle={{ padding: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <FireOutlined style={{ color: '#d97706', fontSize: 18 }} />
                                            <Text style={{ fontWeight: 700, color: '#374151' }}>Yakıt Özeti</Text>
                                        </div>
                                        <div style={{ fontWeight: 800, fontSize: 18, color: '#d97706', fontFamily: 'monospace' }}>{totalFuelLiters.toLocaleString('tr-TR')} L</div>
                                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{fuel.length} dolum · Ort. {fmtTRY(avgFuelUnitPrice)}/L</div>
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card bordered={false} style={{ ...CARD_STYLE, background: '#faf5ff', border: '1px solid #e9d5ff' }} bodyStyle={{ padding: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <ToolOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
                                            <Text style={{ fontWeight: 700, color: '#374151' }}>Son Bakım</Text>
                                        </div>
                                        {latestMaint ? (
                                            <>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{latestMaint.type || 'Bakım'}</div>
                                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{fmtDate(latestMaint.date)}</div>
                                                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', marginTop: 4, fontSize: 13 }}>{fmtTRY(latestMaint.cost)}</div>
                                            </>
                                        ) : (
                                            <Text type="secondary" style={{ fontSize: 12 }}>Bakım kaydı yok</Text>
                                        )}
                                    </Card>
                                </Col>
                            </Row>
                        </Col>
                    </Row>

                    {/* Timeline */}
                    <Card bordered={false} style={{ ...CARD_STYLE, marginTop: 16 }} bodyStyle={{ padding: 24 }}>
                        <SectionHeader icon={<ClockCircleOutlined />} title="Son Hareketler" color="linear-gradient(135deg,#0891b2,#22d3ee)" count={timelineItems.length} />
                        {timelineItems.length === 0 ? (
                            <Empty description="Henüz kayıt yok" />
                        ) : (
                            <Timeline
                                items={timelineItems.map(item => ({
                                    dot: (
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, marginTop: -4 }}>
                                            {item.icon}
                                        </div>
                                    ),
                                    children: (
                                        <div style={{ paddingBottom: 4 }}>
                                            <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{item.title}</div>
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>{item.sub}</div>
                                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmtDate(item.date)}</div>
                                        </div>
                                    )
                                }))}
                            />
                        )}
                    </Card>
                </div>
            )
        },
        {
            key: 'insurance',
            label: <span><SafetyOutlined /> Sigorta <Badge count={insurance.length} style={{ background: '#16a34a' }} /></span>,
            children: (
                <Card bordered={false} style={CARD_STYLE} bodyStyle={{ padding: 0 }}>
                    <div style={{ padding: '20px 24px 12px' }}>
                        <SectionHeader icon={<SafetyOutlined />} title="Sigorta Kayıtları" color={GRAD.insurance} count={insurance.length} />
                    </div>
                    <Table
                        columns={insColumns}
                        dataSource={[...insurance].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                        size="middle"
                        locale={{ emptyText: <Empty description="Sigorta kaydı yok" /> }}
                    />
                </Card>
            )
        },
        {
            key: 'fuel',
            label: <span><FireOutlined /> Yakıt <Badge count={fuel.length} style={{ background: '#d97706' }} /></span>,
            children: (
                <Card bordered={false} style={CARD_STYLE} bodyStyle={{ padding: 0 }}>
                    <div style={{ padding: '20px 24px 0' }}>
                        <SectionHeader icon={<FireOutlined />} title="Yakıt Giderleri" color={GRAD.fuel} count={fuel.length} />
                        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                            <Col xs={8}><div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 14px', border: '1px solid #fde68a' }}><div style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Toplam Yakıt</div><div style={{ fontWeight: 800, fontSize: 18, color: '#d97706', fontFamily: 'monospace' }}>{totalFuelLiters.toFixed(1)} L</div></div></Col>
                            <Col xs={8}><div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', border: '1px solid #fca5a5' }}><div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Toplam Gider</div><div style={{ fontWeight: 800, fontSize: 16, color: '#dc2626', fontFamily: 'monospace' }}>{fmtTRY(totalFuelCost)}</div></div></Col>
                            <Col xs={8}><div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', border: '1px solid #bbf7d0' }}><div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Ort. Litre Fiyatı</div><div style={{ fontWeight: 800, fontSize: 16, color: '#16a34a', fontFamily: 'monospace' }}>{fmtTRY(avgFuelUnitPrice)}</div></div></Col>
                        </Row>
                    </div>
                    <Table
                        columns={fuelColumns}
                        dataSource={[...fuel].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                        size="middle"
                        locale={{ emptyText: <Empty description="Yakıt kaydı yok" /> }}
                    />
                </Card>
            )
        },
        {
            key: 'inspection',
            label: <span><AimOutlined /> Muayene <Badge count={inspection.length} style={{ background: '#2563eb' }} /></span>,
            children: (
                <Card bordered={false} style={CARD_STYLE} bodyStyle={{ padding: 0 }}>
                    <div style={{ padding: '20px 24px 12px' }}>
                        <SectionHeader icon={<AimOutlined />} title="Muayene Kayıtları" color={GRAD.inspection} count={inspection.length} />
                    </div>
                    <Table
                        columns={inspColumns}
                        dataSource={[...inspection].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                        size="middle"
                        locale={{ emptyText: <Empty description="Muayene kaydı yok" /> }}
                    />
                </Card>
            )
        },
        {
            key: 'maintenance',
            label: <span><ToolOutlined /> Bakım <Badge count={maintenance.length} style={{ background: '#7c3aed' }} /></span>,
            children: (
                <Card bordered={false} style={CARD_STYLE} bodyStyle={{ padding: 0 }}>
                    <div style={{ padding: '20px 24px 0' }}>
                        <SectionHeader icon={<ToolOutlined />} title="Bakım & Onarım Kayıtları" color={GRAD.maintenance} count={maintenance.length} />
                        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                            <Col xs={12}><div style={{ background: '#faf5ff', borderRadius: 10, padding: '10px 14px', border: '1px solid #e9d5ff' }}><div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Toplam Bakım Gideri</div><div style={{ fontWeight: 800, fontSize: 18, color: '#7c3aed', fontFamily: 'monospace' }}>{fmtTRY(totalMaintCost)}</div></div></Col>
                            <Col xs={12}><div style={{ background: '#f5f3ff', borderRadius: 10, padding: '10px 14px', border: '1px solid #ddd6fe' }}><div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Toplam Kayıt</div><div style={{ fontWeight: 800, fontSize: 18, color: '#7c3aed' }}>{maintenance.length}</div></div></Col>
                        </Row>
                    </div>
                    <Table
                        columns={maintColumns}
                        dataSource={[...maintenance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                        size="middle"
                        locale={{ emptyText: <Empty description="Bakım kaydı yok" /> }}
                    />
                </Card>
            )
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking">
                <div style={{ paddingBottom: 40 }}>

                    {/* ─── Back + Header ─── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => router.push('/admin/vehicle-tracking')}
                            style={{ borderRadius: 8 }}
                        >
                            Geri
                        </Button>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                {/* Vehicle avatar */}
                                <div style={{
                                    width: 56, height: 56, borderRadius: 16,
                                    background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 26, boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                                }}>
                                    <CarOutlined />
                                </div>
                                <div>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: '-0.5px' }}>
                                        {vehicle.brand} {vehicle.model}
                                        <Tag
                                            style={{
                                                marginLeft: 10, borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                background: vehicle.isActive ? '#f0fdf4' : '#fef2f2',
                                                color: vehicle.isActive ? '#16a34a' : '#dc2626',
                                                border: `1px solid ${vehicle.isActive ? '#bbf7d0' : '#fca5a5'}`,
                                            }}
                                        >
                                            {vehicle.isActive ? '● Aktif' : '● Pasif'}
                                        </Tag>
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                                        <Tag style={{ borderRadius: 8, fontWeight: 700, fontSize: 13, background: '#1e293b', color: '#fff', border: 'none', letterSpacing: '1px' }}>
                                            {vehicle.plateNumber}
                                        </Tag>
                                        <Text type="secondary" style={{ fontSize: 13 }}>
                                            {[vehicle.year, vehicle.vehicleType, (vehicle.color && vehicle.color !== 'Unknown') ? vehicle.color : null]
                                                .filter(Boolean).join(' · ')}
                                        </Text>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <Button icon={<RocketOutlined />} onClick={fetchData} style={{ borderRadius: 8 }}>Yenile</Button>
                    </div>

                    {/* ─── Top Stats ─── */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                        <Col xs={12} sm={8} md={4}>
                            <StatCard icon={<ThunderboltOutlined />} label="Toplam KM" value={fmtKm(totalKm)} gradient={GRAD.km} sub={`${vehicle.year}`} />
                        </Col>
                        <Col xs={12} sm={8} md={4}>
                            <StatCard icon={<DollarOutlined />} label="Toplam Gider" value={fmtTRY(totalExpense)} gradient={GRAD.total} sub="Tüm kategoriler" />
                        </Col>
                        <Col xs={12} sm={8} md={4}>
                            <StatCard icon={<SafetyOutlined />} label="Sigorta" value={`${activeIns.length} Aktif`} gradient={GRAD.insurance} sub={`${insurance.length} toplam`} />
                        </Col>
                        <Col xs={12} sm={8} md={4}>
                            <StatCard icon={<FireOutlined />} label="Yakıt" value={`${totalFuelLiters.toFixed(0)} L`} gradient={GRAD.fuel} sub={`${fuel.length} dolum`} />
                        </Col>
                        <Col xs={12} sm={8} md={4}>
                            <StatCard icon={<AimOutlined />} label="Muayene" value={`${inspection.length}`} gradient={GRAD.inspection} sub={latestInsp ? `Son: ${fmtDate(latestInsp.nextDate)}` : 'Kayıt yok'} />
                        </Col>
                        <Col xs={12} sm={8} md={4}>
                            <StatCard icon={<ToolOutlined />} label="Bakım" value={fmtTRY(totalMaintCost)} gradient={GRAD.maintenance} sub={`${maintenance.length} kayıt`} />
                        </Col>
                    </Row>

                    {/* ─── Tabs ─── */}
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={tabItems}
                        style={{ fontSize: 14 }}
                        tabBarStyle={{
                            marginBottom: 16,
                            borderBottom: '2px solid #f0f0f0',
                        }}
                    />
                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

export default VehicleDetailPage;
