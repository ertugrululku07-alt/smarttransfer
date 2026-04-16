'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Spin, Tag, Progress, Table, Badge, message } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import AdminGuard from './AdminGuard';
import AdminLayout from './AdminLayout';
import apiClient from '@/lib/api-client';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import dayjs from 'dayjs';

const { Text } = Typography;

// ── Types ──
interface KPIs {
  totalRevenue: number; revenueGrowth: number; todayRevenue: number;
  totalBookings: number; thisMonthBookings: number; bookingGrowth: number;
  todayBookings: number; pendingBookings: number; confirmedBookings: number;
  completedBookings: number; cancelledBookings: number; inProgressBookings: number;
  totalVehicles: number; activeVehicles: number; vehicleUtilization: number;
  totalDrivers: number; onlineDrivers: number; totalCustomers: number;
  totalAgencies: number; activeAgencies: number; totalPersonnel: number;
}

interface DashboardData {
  kpis: KPIs;
  charts: {
    revenueChart: any[]; weeklyChart: any[];
    bookingDistribution: any[]; vehicleTypes: any[]; topAgencies: any[];
  };
  recentBookings: any[];
}

// ── Mini KPI Card ──
const KpiCard = ({ icon, label, value, sub, growth, color, bg }: {
  icon: string; label: string; value: string | number; sub?: string;
  growth?: number; color: string; bg: string;
}) => (
  <div style={{
    background: bg, borderRadius: 16, padding: '20px 22px', position: 'relative',
    overflow: 'hidden', minHeight: 130, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.08)',
  }}>
    <div style={{ position: 'absolute', right: -8, top: -8, fontSize: 56, opacity: 0.12 }}>{icon}</div>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
    <div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {growth !== undefined && growth !== 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: growth > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
            color: growth > 0 ? '#6ee7b7' : '#fca5a5',
          }}>
            {growth > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(growth)}%
          </span>
        )}
        {sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{sub}</span>}
      </div>
    </div>
  </div>
);

// ── Section Card ──
const SectionCard = ({ title, extra, children, style }: { title?: string; extra?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: '#fff', borderRadius: 16, padding: '20px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
    border: '1px solid #f0f0f0', ...style,
  }}>
    {(title || extra) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        {title && <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{title}</div>}
        {extra}
      </div>
    )}
    {children}
  </div>
);

// ── Status Badge ──
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Bekleyen', color: '#f59e0b' },
  CONFIRMED: { label: 'Onaylanan', color: '#3b82f6' },
  IN_PROGRESS: { label: 'Devam Eden', color: '#8b5cf6' },
  COMPLETED: { label: 'Tamamlanan', color: '#10b981' },
  CANCELLED: { label: 'Iptal', color: '#ef4444' },
  NO_SHOW: { label: 'Gelmedi', color: '#6b7280' },
};

// ── Main Component ──
const AdminDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const { defaultCurrency } = useDefinitions();

  const currSymbol = defaultCurrency?.symbol || '₺';
  const currCode = defaultCurrency?.code || 'TRY';

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/dashboard/summary');
      if (res.data.success) setData(res.data.data);
    } catch (e: any) {
      console.error('Dashboard error:', e);
      message.error('Dashboard verisi yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  if (loading || !data) {
    return (
      <AdminGuard><AdminLayout selectedKey="dashboard">
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: 16 }}>
          <Spin size="large" />
          <Text type="secondary">Dashboard yükleniyor...</Text>
        </div>
      </AdminLayout></AdminGuard>
    );
  }

  const { kpis: k, charts: c, recentBookings } = data;

  const recentCols = [
    {
      title: 'Rezervasyon', dataIndex: 'bookingNumber', width: 130,
      render: (v: string) => <span style={{ fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{v}</span>
    },
    {
      title: 'Musteri', dataIndex: 'contactName', ellipsis: true,
      render: (v: string, r: any) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
          {r.agency && <div style={{ fontSize: 11, color: '#8b5cf6' }}>{r.agency.name}</div>}
        </div>
      )
    },
    {
      title: 'Tarih', dataIndex: 'startDate', width: 110,
      render: (v: string) => <span style={{ fontSize: 12, color: '#64748b' }}>{dayjs(v).format('DD.MM.YYYY')}</span>
    },
    {
      title: 'Tutar', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: number, r: any) => <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(v)} {r.currency}</span>
    },
    {
      title: 'Durum', dataIndex: 'status', width: 120,
      render: (s: string) => {
        const st = STATUS_MAP[s] || { label: s, color: '#94a3b8' };
        return <Tag style={{ borderRadius: 20, fontWeight: 600, fontSize: 11, border: 'none', background: st.color + '18', color: st.color }}>{st.label}</Tag>;
      }
    },
  ];

  return (
    <AdminGuard>
      <AdminLayout selectedKey="dashboard">
        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>Dashboard</h1>
            <Text type="secondary" style={{ fontSize: 14 }}>Sistemin genel durumu ve performans metrikleri</Text>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Tag icon={<CalendarOutlined />} style={{ borderRadius: 20, padding: '4px 14px', fontWeight: 600 }}>
              {dayjs().format('DD MMMM YYYY')}
            </Tag>
            <div onClick={fetchDashboard} style={{
              width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <ReloadOutlined style={{ color: '#64748b' }} />
            </div>
          </div>
        </div>

        {/* ── KPI Row 1 — Primary ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
          <KpiCard icon="$" label="Aylik Gelir" value={`${currSymbol}${fmt(k.totalRevenue)}`}
            sub={`Bugun: ${currSymbol}${fmt(k.todayRevenue)}`} growth={k.revenueGrowth}
            color="#6366f1" bg="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" />
          <KpiCard icon="B" label="Toplam Rezervasyon" value={fmt(k.totalBookings)}
            sub={`Bu ay: ${k.thisMonthBookings} | Bugun: ${k.todayBookings}`} growth={k.bookingGrowth}
            color="#ec4899" bg="linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)" />
          <KpiCard icon="U" label="Musteri" value={fmt(k.totalCustomers)}
            sub={`${k.totalAgencies} acenta (${k.activeAgencies} aktif)`}
            color="#0ea5e9" bg="linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)" />
          <KpiCard icon="C" label="Arac Filosu" value={`${k.activeVehicles} / ${k.totalVehicles}`}
            sub={`Kullanim: %${k.vehicleUtilization}`}
            color="#f59e0b" bg="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)" />
        </div>

        {/* ── KPI Row 2 — Booking Status Mini Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Bekleyen', value: k.pendingBookings, color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Onaylanan', value: k.confirmedBookings, color: '#3b82f6', bg: '#eff6ff' },
            { label: 'Devam Eden', value: k.inProgressBookings, color: '#8b5cf6', bg: '#f5f3ff' },
            { label: 'Tamamlanan', value: k.completedBookings, color: '#10b981', bg: '#ecfdf5' },
            { label: 'Iptal', value: k.cancelledBookings, color: '#ef4444', bg: '#fef2f2' },
            { label: 'Soforler', value: `${k.onlineDrivers}/${k.totalDrivers}`, color: '#6366f1', bg: '#eef2ff' },
          ].map((item, i) => (
            <div key={i} style={{
              background: item.bg, borderRadius: 12, padding: '14px 16px',
              border: `1px solid ${item.color}15`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: item.color, opacity: 0.75, marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* ── Charts Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Revenue Chart */}
          <SectionCard title="Gelir Trendi (Son 30 Gun)">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={c.revenueChart}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 14px' }}
                  formatter={(v: any) => [`${currSymbol}${fmt(v)}`, 'Gelir']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#gRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Booking Distribution Pie */}
          <SectionCard title="Rezervasyon Dagilimi">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={c.bookingDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                  {c.bookingDistribution.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, name: any) => [v, name]} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
                <Legend verticalAlign="bottom" height={44} iconType="circle" iconSize={8}
                  formatter={(value: string, entry: any) => <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{value} ({entry.payload.value})</span>} />
              </PieChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        {/* ── Bottom Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Weekly Revenue Bar */}
          <SectionCard title="Haftalik Gelir & Rezervasyon">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={c.weeklyChart} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#cbd5e1" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} name={`Gelir (${currCode})`} />
                <Bar yAxisId="right" dataKey="bookings" fill="#e0e7ff" radius={[6, 6, 0, 0]} name="Rezervasyon" />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Vehicle Types & Metrics */}
          <SectionCard title="Performans & Filo">
            <div style={{ marginBottom: 20 }}>
              {[
                { label: 'Arac Kullanim Orani', value: k.vehicleUtilization, color: '#6366f1' },
                { label: `Aktif Sofor (${k.onlineDrivers}/${k.totalDrivers})`, value: k.totalDrivers > 0 ? Math.round(k.onlineDrivers / k.totalDrivers * 100) : 0, color: '#10b981' },
                { label: `Onay Orani`, value: k.totalBookings > 0 ? Math.round((k.completedBookings + k.confirmedBookings + k.inProgressBookings) / k.totalBookings * 100) : 0, color: '#0ea5e9' },
              ].map((m, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{m.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>%{m.value}</span>
                  </div>
                  <Progress percent={m.value} showInfo={false} strokeColor={m.color} trailColor="#f1f5f9" size="small" />
                </div>
              ))}
            </div>
            {c.vehicleTypes.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Arac Tipleri</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {c.vehicleTypes.map((vt: any, i: number) => (
                    <Tag key={i} style={{ borderRadius: 20, padding: '4px 14px', fontWeight: 600, fontSize: 12, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      {vt.name} <Badge count={vt.count} style={{ backgroundColor: '#6366f1', marginLeft: 6 }} />
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {c.topAgencies.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>En Aktif Acentalar</div>
                {c.topAgencies.map((a: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>{i + 1}. {a.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{a.count} rez.</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Recent Bookings ── */}
        <SectionCard title="Son Rezervasyonlar" extra={
          <a href="/admin/transfers" style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Tumunu Gor &rarr;</a>
        }>
          <Table
            dataSource={recentBookings}
            columns={recentCols}
            rowKey="id"
            pagination={false}
            size="small"
            style={{ marginTop: -8 }}
          />
        </SectionCard>

        <div style={{ height: 24 }} />
      </AdminLayout>
    </AdminGuard>
  );
};

export default AdminDashboardPage;
