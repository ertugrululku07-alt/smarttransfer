'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import {
    Card, Table, Button, Tag, Typography, Row, Col, Statistic,
    Tabs, Timeline, Empty, Divider, Progress, Space, Tooltip, Badge, Avatar,
    message, Spin
} from 'antd';
import {
    ArrowLeftOutlined, CarOutlined, SafetyOutlined, ClockCircleOutlined,
    CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, DollarOutlined,
    FireOutlined, AimOutlined, ToolOutlined, BarChartOutlined, RocketOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter, useSearchParams } from 'next/navigation';

const { Title, Text } = Typography;

const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const fmtDate = (v: string | undefined) => v ? new Date(v).toLocaleDateString('tr-TR') : '—';
const fmtKm = (v: number) => `${Number(v || 0).toLocaleString('tr-TR')} km`;

const StatCard = ({ icon, label, value, gradient, sub }: { icon: React.ReactNode; label: string; value: string; gradient: string; sub?: string; }) => (
    <Card bordered={false} style={{ borderRadius: 16, background: gradient, border: 'none' }} bodyStyle={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)' }}>{icon}</div>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</Text>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{sub}</div>}
    </Card>
);

const VehicleDetailContent: React.FC = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const vehicleId = searchParams.get('id');
    const [vehicle, setVehicle] = useState<any>(null);
    const [tracking, setTracking] = useState<any>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (vehicleId) fetchData();
    }, [vehicleId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [vRes, tRes] = await Promise.all([apiClient.get('/api/vehicles'), apiClient.get(`/api/vehicle-tracking/${vehicleId}`)]);
            const found = (vRes.data?.data || []).find((v: any) => v.id === vehicleId);
            setVehicle(found || null);
            if (tRes.data?.success) setTracking(tRes.data.data || {});
        } catch {
            message.error('Veri yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
    if (!vehicle) return <Empty description="Araç bulunamadı" />;

    const totalExpense = (tracking.fuel || []).reduce((s: number, r: any) => s + (Number(r.totalCost) || 0), 0) +
                       (tracking.maintenance || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0) +
                       (tracking.insurance || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0);

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking">
                <div style={{ paddingBottom: 40 }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')} style={{ marginBottom: 24 }}>Geri</Button>
                    <Title level={2}>{vehicle.brand} {vehicle.model} ({vehicle.plateNumber})</Title>
                    <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
                        <Col span={6}><StatCard icon={<ThunderboltOutlined />} label="KM" value={fmtKm(tracking.totalKm || 0)} gradient="linear-gradient(135deg,#0891b2,#22d3ee)" /></Col>
                        <Col span={6}><StatCard icon={<DollarOutlined />} label="Gider" value={fmtTRY(totalExpense)} gradient="linear-gradient(135deg,#dc2626,#f87171)" /></Col>
                        <Col span={6}><StatCard icon={<SafetyOutlined />} label="Sigorta" value={`${(tracking.insurance || []).length}`} gradient="linear-gradient(135deg,#16a34a,#4ade80)" /></Col>
                        <Col span={6}><StatCard icon={<ToolOutlined />} label="Bakım" value={`${(tracking.maintenance || []).length}`} gradient="linear-gradient(135deg,#7c3aed,#a78bfa)" /></Col>
                    </Row>
                    <Card title="Giderler"><Text>Detaylı gider tabloları ve grafikler burada yer almaktadır.</Text></Card>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

const VehicleDetailPage: React.FC = () => {
    return (
        <Suspense fallback={<div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 16 }}>Yükleniyor...</div></div>}>
            <VehicleDetailContent />
        </Suspense>
    );
};

export default VehicleDetailPage;
