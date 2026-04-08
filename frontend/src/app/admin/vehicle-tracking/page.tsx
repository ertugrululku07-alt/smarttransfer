'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Row, Col, Typography, Table, Tag, Space, Button,
    Badge, Progress, Avatar, Tooltip, Statistic, Alert, Divider,
} from 'antd';
import {
    CarOutlined, SafetyOutlined, FireOutlined, ToolOutlined,
    CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
    ReloadOutlined, DashboardOutlined, RiseOutlined,
    ThunderboltOutlined, ExperimentOutlined, AimOutlined,
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient, { getImageUrl } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

/* ─── Types ─────────────────────────────────────────── */
interface VehicleSummary {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    year: number;
    color: string;
    status: string;
    isActive: boolean;
    vehicleClass: string;
    imageUrl?: string;
    vehicleType: string;
    // Insurance
    insuranceStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
    insuranceExpiry?: string;
    insuranceCompany?: string;
    // Inspection
    inspectionStatus: 'OK' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN';
    inspectionNextDate?: string;
    // KM
    totalKm: number;
    transferKm: number;
    transferCount: number;
    // Costs
    totalFuelCost: number;
    totalMaintCost: number;
    totalInsCost: number;
    totalFuelLiters: number;
    totalExpense: number;
    // Dates
    lastFuelDate?: string;
    lastMaintDate?: string;
    // Counts
    insuranceCount: number;
    fuelCount: number;
    inspectionCount: number;
    maintenanceCount: number;
}

/* ─── Helpers ─────────────────────────────────────────── */
const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const fmtKm = (v: number) => `${Number(v || 0).toLocaleString('tr-TR')} km`;

const INS_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    VALID: { label: 'Geçerli', color: '#16a34a', icon: <CheckCircleOutlined /> },
    EXPIRING_SOON: { label: 'Yakında Bitiyor', color: '#d97706', icon: <WarningOutlined /> },
    EXPIRED: { label: 'Süresi Doldu', color: '#dc2626', icon: <CloseCircleOutlined /> },
};
const INS_COLORS: Record<string, string> = {
    VALID: '#16a34a', EXPIRING_SOON: '#d97706', EXPIRED: '#dc2626',
};

const INSP_STATUS: Record<string, { label: string; color: string }> = {
    OK: { label: 'Muayene Tamam', color: '#16a34a' },
    DUE_SOON: { label: 'Muayene Yaklaşıyor', color: '#d97706' },
    OVERDUE: { label: 'Muayene Gecikmiş', color: '#dc2626' },
    UNKNOWN: { label: 'Bilinmiyor', color: '#6b7280' },
};

/* ─── Mini SVG Bar ───────────────────────────────────── */
const MiniBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <Text style={{ fontSize: 10, color: '#6b7280', minWidth: 30 }}>{pct.toFixed(0)}%</Text>
        </div>
    );
};

/* ─── Status Pill ────────────────────────────────────── */
const Pill: React.FC<{ label: string; color: string; icon?: React.ReactNode }> = ({ label, color, icon }) => (
    <span style={{
        background: color + '18', color, border: `1px solid ${color}44`,
        borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
        {icon}{label}
    </span>
);

/* ─── Main Component ─────────────────────────────────── */
const VehicleTrackingDashboard: React.FC = () => {
    const router = useRouter();
    const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/vehicle-tracking');
            if (res.data.success) setVehicles(res.data.data);
        } catch { /* silent */ }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    /* ─── Aggregates ─── */
    const agg = useMemo(() => {
        const total = vehicles.length;
        const active = vehicles.filter(v => v.isActive).length;
        const insExpired = vehicles.filter(v => v.insuranceStatus === 'EXPIRED').length;
        const insWarn = vehicles.filter(v => v.insuranceStatus === 'EXPIRING_SOON').length;
        const inspOverdue = vehicles.filter(v => v.inspectionStatus === 'OVERDUE').length;
        const inspSoon = vehicles.filter(v => v.inspectionStatus === 'DUE_SOON').length;
        const totalKm = vehicles.reduce((s, v) => s + v.totalKm, 0);
        const totalExpense = vehicles.reduce((s, v) => s + v.totalExpense, 0);
        const totalFuel = vehicles.reduce((s, v) => s + v.totalFuelCost, 0);
        const totalMaint = vehicles.reduce((s, v) => s + v.totalMaintCost, 0);
        const totalIns = vehicles.reduce((s, v) => s + v.totalInsCost, 0);
        const totalTransfers = vehicles.reduce((s, v) => s + v.transferCount, 0);
        const avgKm = total > 0 ? totalKm / total : 0;
        return {
            total, active, inactive: total - active,
            insExpired, insWarn, inspOverdue, inspSoon,
            totalKm, totalExpense, totalFuel, totalMaint, totalIns,
            totalTransfers, avgKm,
        };
    }, [vehicles]);

    const alerts = useMemo(() => {
        const list: { type: 'error' | 'warning'; message: string }[] = [];
        if (agg.insExpired > 0) list.push({ type: 'error', message: `${agg.insExpired} araçta sigorta süresi dolmuş!` });
        if (agg.insWarn > 0) list.push({ type: 'warning', message: `${agg.insWarn} araçta sigorta 30 gün içinde bitiyor.` });
        if (agg.inspOverdue > 0) list.push({ type: 'error', message: `${agg.inspOverdue} araçta muayene gecikmiş!` });
        if (agg.inspSoon > 0) list.push({ type: 'warning', message: `${agg.inspSoon} araçta muayene yaklaşıyor.` });
        return list;
    }, [agg]);

    const maxKm = useMemo(() => Math.max(...vehicles.map(v => v.totalKm), 1), [vehicles]);
    const maxExpense = useMemo(() => Math.max(...vehicles.map(v => v.totalExpense), 1), [vehicles]);

    /* ─── Table Columns ─── */
    const columns = [
        {
            title: 'Araç',
            key: 'vehicle',
            width: 220,
            fixed: 'left' as const,
            render: (_: any, r: VehicleSummary) => (
                <Space>
                    <Avatar
                        size={38}
                        src={getImageUrl(r.imageUrl)}
                        icon={<CarOutlined />}
                        style={{ background: r.isActive ? '#6366f1' : '#9ca3af' }}
                    />
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.brand} {r.model}</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <span style={{
                                background: '#1e1e2e', color: '#fff',
                                borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                            }}>{r.plateNumber}</span>
                            <Tag style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                                {r.year}
                            </Tag>
                        </div>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Sigorta',
            key: 'insurance',
            width: 150,
            render: (_: any, r: VehicleSummary) => {
                const cfg = INS_STATUS[r.insuranceStatus];
                return (
                    <div>
                        <Pill label={cfg.label} color={cfg.color} icon={cfg.icon} />
                        {r.insuranceExpiry && (
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                {new Date(r.insuranceExpiry).toLocaleDateString('tr-TR')}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Muayene',
            key: 'inspection',
            width: 160,
            render: (_: any, r: VehicleSummary) => {
                const cfg = INSP_STATUS[r.inspectionStatus];
                return (
                    <div>
                        <Pill label={cfg.label} color={cfg.color} />
                        {r.inspectionNextDate && (
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                {new Date(r.inspectionNextDate).toLocaleDateString('tr-TR')}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Toplam KM',
            key: 'km',
            width: 150,
            sorter: (a: VehicleSummary, b: VehicleSummary) => a.totalKm - b.totalKm,
            render: (_: any, r: VehicleSummary) => (
                <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{fmtKm(r.totalKm)}</div>
                    <MiniBar value={r.totalKm} max={maxKm} color="#6366f1" />
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.transferCount} transfer</div>
                </div>
            ),
        },
        {
            title: 'Yakıt Gid.',
            dataIndex: 'totalFuelCost',
            key: 'fuel',
            width: 120,
            align: 'right' as const,
            sorter: (a: VehicleSummary, b: VehicleSummary) => a.totalFuelCost - b.totalFuelCost,
            render: (v: number) => (
                <Text style={{ color: '#d97706', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                    {fmtTRY(v)}
                </Text>
            ),
        },
        {
            title: 'Bakım Gid.',
            dataIndex: 'totalMaintCost',
            key: 'maint',
            width: 120,
            align: 'right' as const,
            sorter: (a: VehicleSummary, b: VehicleSummary) => a.totalMaintCost - b.totalMaintCost,
            render: (v: number) => (
                <Text style={{ color: '#7c3aed', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                    {fmtTRY(v)}
                </Text>
            ),
        },
        {
            title: 'Toplam Gider',
            dataIndex: 'totalExpense',
            key: 'expense',
            width: 150,
            align: 'right' as const,
            sorter: (a: VehicleSummary, b: VehicleSummary) => a.totalExpense - b.totalExpense,
            render: (v: number, r: VehicleSummary) => (
                <div>
                    <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 13, fontFamily: 'monospace' }}>
                        {fmtTRY(v)}
                    </div>
                    <MiniBar value={v} max={maxExpense} color="#dc2626" />
                </div>
            ),
        },
        {
            title: 'İşlemler',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (_: any, r: VehicleSummary) => (
                <Button
                    size="small"
                    style={{ borderRadius: 6, fontSize: 11, background: '#6366f1', color: 'white', border: 'none', fontWeight: 600 }}
                    onClick={() => router.push(`/admin/vehicle-tracking/detail?id=${r.id}`)}
                >
                    Detay →
                </Button>
            ),
        },
    ];

    /* ─── KPI Cards ─── */
    const kpiCards = [
        {
            title: 'Toplam Araç', value: agg.total,
            icon: <CarOutlined />, grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            sub: `${agg.active} aktif · ${agg.inactive} pasif`,
        },
        {
            title: 'Toplam KM', value: null, rawStr: fmtKm(agg.totalKm),
            icon: <DashboardOutlined />, grad: 'linear-gradient(135deg,#0891b2,#22d3ee)',
            sub: `Ort. ${fmtKm(Math.round(agg.avgKm))} / araç`,
        },
        {
            title: 'Toplam Transfer', value: agg.totalTransfers,
            icon: <RiseOutlined />, grad: 'linear-gradient(135deg,#16a34a,#4ade80)',
            sub: `${vehicles.length > 0 ? Math.round(agg.totalTransfers / vehicles.length) : 0} ort. / araç`,
        },
        {
            title: 'Toplam Gider', value: null, rawStr: fmtTRY(agg.totalExpense),
            icon: <ThunderboltOutlined />, grad: 'linear-gradient(135deg,#dc2626,#f87171)',
            sub: `Yakıt: ${fmtTRY(agg.totalFuel)} · Bakım: ${fmtTRY(agg.totalMaint)}`,
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking-dashboard">
                <div style={{ padding: '0 0 32px' }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18,
                                }}>
                                    <AimOutlined />
                                </div>
                                <Title level={2} style={{ margin: 0, fontWeight: 800 }}>Araç Takip — Genel Durum</Title>
                            </div>
                            <Text type="secondary">{agg.total} araç · Sigorta, muayene, yakıt, bakım ve km takibi</Text>
                        </div>
                        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} size="small">Yenile</Button>
                    </div>

                    {/* ── Alerts ── */}
                    {alerts.map((a, i) => (
                        <Alert
                            key={i}
                            type={a.type}
                            showIcon
                            message={a.message}
                            style={{ marginBottom: 12, borderRadius: 10 }}
                        />
                    ))}

                    {/* ── KPI Cards ── */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        {kpiCards.map((k, i) => (
                            <Col key={i} xs={24} sm={12} lg={6}>
                                <div style={{
                                    borderRadius: 16, padding: '20px 22px',
                                    background: k.grad, color: 'white',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                                    position: 'relative', overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', right: -16, top: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 500 }}>{k.title}</div>
                                            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, fontFamily: 'monospace' }}>
                                                {k.rawStr ?? k.value}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{k.sub}</div>
                                        </div>
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 12,
                                            background: 'rgba(255,255,255,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                                        }}>
                                            {k.icon}
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        ))}
                    </Row>

                    {/* ── Status Overview ── */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        {/* Insurance status breakdown */}
                        <Col xs={24} md={8}>
                            <Card
                                variant="borderless"
                                title={<span><SafetyOutlined style={{ color: '#16a34a', marginRight: 6 }} />Sigorta Durumu</span>}
                                style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                                extra={<Button size="small" type="link" onClick={() => router.push('/admin/vehicle-tracking/insurance')}>Yönet</Button>}
                            >
                                {(['VALID', 'EXPIRING_SOON', 'EXPIRED'] as const).map(s => {
                                    const cnt = vehicles.filter(v => v.insuranceStatus === s).length;
                                    const cfg = INS_STATUS[s];
                                    return (
                                        <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Pill label={cfg.label} color={cfg.color} icon={cfg.icon} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Progress
                                                    percent={agg.total > 0 ? Math.round((cnt / agg.total) * 100) : 0}
                                                    showInfo={false}
                                                    strokeColor={cfg.color}
                                                    size="small"
                                                    style={{ width: 80 }}
                                                />
                                                <Badge count={cnt} color={cfg.color} showZero />
                                            </div>
                                        </div>
                                    );
                                })}
                            </Card>
                        </Col>
                        {/* Inspection status breakdown */}
                        <Col xs={24} md={8}>
                            <Card
                                variant="borderless"
                                title={<span><ToolOutlined style={{ color: '#2563eb', marginRight: 6 }} />Muayene Durumu</span>}
                                style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                                extra={<Button size="small" type="link" onClick={() => router.push('/admin/vehicle-tracking/inspection')}>Yönet</Button>}
                            >
                                {(['OK', 'DUE_SOON', 'OVERDUE', 'UNKNOWN'] as const).map(s => {
                                    const cnt = vehicles.filter(v => v.inspectionStatus === s).length;
                                    const cfg = INSP_STATUS[s];
                                    return (
                                        <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Pill label={cfg.label} color={cfg.color} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Progress
                                                    percent={agg.total > 0 ? Math.round((cnt / agg.total) * 100) : 0}
                                                    showInfo={false}
                                                    strokeColor={cfg.color}
                                                    size="small"
                                                    style={{ width: 80 }}
                                                />
                                                <Badge count={cnt} color={cfg.color} showZero />
                                            </div>
                                        </div>
                                    );
                                })}
                            </Card>
                        </Col>
                        {/* Expense breakdown */}
                        <Col xs={24} md={8}>
                            <Card
                                variant="borderless"
                                title={<span><ExperimentOutlined style={{ color: '#dc2626', marginRight: 6 }} />Gider Dağılımı</span>}
                                style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                            >
                                {[
                                    { label: 'Yakıt', value: agg.totalFuel, color: '#d97706', icon: <FireOutlined /> },
                                    { label: 'Bakım', value: agg.totalMaint, color: '#7c3aed', icon: <ToolOutlined /> },
                                    { label: 'Sigorta', value: agg.totalIns, color: '#16a34a', icon: <SafetyOutlined /> },
                                ].map(e => {
                                    const total = agg.totalExpense || 1;
                                    return (
                                        <div key={e.label} style={{ marginBottom: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 12, color: '#374151' }}>{e.icon} {e.label}</span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: e.color, fontFamily: 'monospace' }}>
                                                    {fmtTRY(e.value)}
                                                </span>
                                            </div>
                                            <Progress
                                                percent={Math.round((e.value / total) * 100)}
                                                strokeColor={e.color}
                                                trailColor="#f0f0f0"
                                                size="small"
                                                showInfo={false}
                                            />
                                        </div>
                                    );
                                })}
                            </Card>
                        </Col>
                    </Row>

                    {/* ── Main Table ── */}
                    <Card
                        variant="borderless"
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CarOutlined style={{ color: '#6366f1' }} />
                                <span>Tüm Araçlar — Detaylı Takip</span>
                                <Badge count={vehicles.length} color="#6366f1" />
                            </div>
                        }
                        style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                        bodyStyle={{ padding: 0 }}
                    >
                        <Table
                            columns={columns}
                            dataSource={vehicles}
                            rowKey="id"
                            loading={loading}
                            scroll={{ x: 1100 }}
                            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} araç` }}
                            rowClassName={(r) => {
                                if (r.insuranceStatus === 'EXPIRED' || r.inspectionStatus === 'OVERDUE') return 'row-danger';
                                if (r.insuranceStatus === 'EXPIRING_SOON' || r.inspectionStatus === 'DUE_SOON') return 'row-warning';
                                return '';
                            }}
                            size="middle"
                        />
                    </Card>

                    <style>{`
                        .row-danger td { background: #fff5f5 !important; }
                        .row-warning td { background: #fffbeb !important; }
                    `}</style>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

export default VehicleTrackingDashboard;
