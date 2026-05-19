'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Modal, Spin, Tag, Tooltip, Progress,
} from 'antd';
import {
  ReloadOutlined, CarOutlined, UserOutlined, DollarOutlined,
  ClockCircleOutlined, CheckCircleOutlined, RightOutlined,
  ArrowUpOutlined, PhoneOutlined, EnvironmentOutlined,
  ThunderboltOutlined, CalendarOutlined, PlusOutlined,
  AppstoreOutlined, GlobalOutlined, FireOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

/* ── helpers ─────────────────────────────────────────────── */
function fmt(n: number) { return n.toLocaleString('tr-TR'); }
function fmtCur(n: number, cur = 'EUR') { return `${fmt(n)} ${cur}`; }
function relTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

/* ── sub-components ──────────────────────────────────────── */
function KpiCard({ label, value, sub, icon, color, bg, accent, trend }: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ReactNode; color: string; bg: string; accent: string;
  trend?: { pct: number; label: string };
}) {
  return (
    <div className="ps-kpi">
      <div className="ps-kpi__accent" style={{ background: accent }} />
      <div className="ps-kpi__header">
        <span className="ps-kpi__label">{label}</span>
        <span className="ps-kpi__icon" style={{ background: bg, color }}>{icon}</span>
      </div>
      <div className="ps-kpi__value">{value}</div>
      {sub && <div className="ps-kpi__sub">{sub}</div>}
      {trend && (
        <span className={`ps-kpi__trend ps-kpi__trend--${trend.pct >= 0 ? 'up' : 'down'}`}>
          <ArrowUpOutlined style={{ transform: trend.pct < 0 ? 'rotate(180deg)' : 'none', fontSize: 10 }} />
          {Math.abs(trend.pct)}% {trend.label}
        </span>
      )}
    </div>
  );
}

function DriverStatusCard({ driver }: { driver: any }) {
  const status = driver.isOnline ? (driver.activeBooking ? 'busy' : 'online') : 'offline';
  const labels: Record<string, string> = { online: 'Müsait', busy: 'Seferde', offline: 'Çevrimdışı' };
  const badgeClass: Record<string, string> = { online: 'ps-badge--success', busy: 'ps-badge--warning', offline: 'ps-badge--neutral' };
  const initials = `${(driver.firstName || '')[0] || ''}${(driver.lastName || '')[0] || ''}`.toUpperCase() || '?';
  return (
    <div className="ps-driver-card">
      <div className="ps-driver-avatar">
        {initials}
        <span className={`ps-driver-avatar__status ps-driver-avatar__status--${status}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ps-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {driver.firstName} {driver.lastName}
        </div>
        {driver.activeBooking ? (
          <div style={{ fontSize: 11, color: 'var(--ps-text-3)', marginTop: 2 }}>
            {driver.activeBooking.bookingNumber} · {driver.activeBooking.pickup}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--ps-text-3)', marginTop: 2 }}>
            {driver.phone || 'Telefon yok'}
          </div>
        )}
      </div>
      <span className={`ps-badge ${badgeClass[status]}`}>
        <span className="ps-badge__dot" />
        {labels[status]}
      </span>
    </div>
  );
}

function ReservationCard({ res, onAccept, onReject, onDetail, loading }: {
  res: any; loading: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onDetail: (id: string) => void;
}) {
  const isPending = res.status === 'PENDING' || res.status === 'WAITING';
  const stripe = isPending ? '#f59e0b' : '#10b981';
  const initials = (res.customer?.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="ps-job">
      <div className="ps-job__stripe" style={{ background: stripe }} />
      <div className="ps-job__body">
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: isPending ? '#fef3c7' : '#d1fae5',
              color: isPending ? '#92400e' : '#065f46',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13,
            }}>{initials}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ps-text)' }}>{res.customer?.name}</div>
              {res.customer?.phone && (
                <div style={{ fontSize: 12, color: 'var(--ps-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <PhoneOutlined style={{ fontSize: 10 }} /> {res.customer.phone}
                </div>
              )}
            </div>
          </div>
          <span className={`ps-badge ${isPending ? 'ps-badge--warning' : 'ps-badge--success'}`}>
            <span className="ps-badge__dot" />
            {isPending ? 'Bekliyor' : 'Aktif'}
          </span>
        </div>

        {/* Route */}
        <div className="ps-route" style={{ marginBottom: 14 }}>
          <div className="ps-route__line">
            <div className="ps-route__dot ps-route__dot--from" />
            <div className="ps-route__connector" />
            <div className="ps-route__dot ps-route__dot--to" />
          </div>
          <div className="ps-route__detail">
            <div className="ps-route__from">
              <div className="ps-route__label">Alış</div>
              <div className="ps-route__address">{res.pickup?.location}</div>
              <div className="ps-route__time">
                <CalendarOutlined style={{ marginRight: 3 }} />{res.pickup?.time}
              </div>
            </div>
            <div>
              <div className="ps-route__label">Varış</div>
              <div className="ps-route__address">{res.dropoff?.location}</div>
              {res.dropoff?.dist && res.dropoff.dist !== '0 km' && (
                <div className="ps-route__time"><CarOutlined style={{ marginRight: 3 }} />{res.dropoff.dist}</div>
              )}
            </div>
          </div>
        </div>

        {/* Chips + price */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <span className="ps-badge ps-badge--neutral">{res.vehicle?.type}</span>
          <span className="ps-badge ps-badge--neutral"><UserOutlined style={{ fontSize: 10, marginRight: 3 }} />{res.vehicle?.pax} kişi</span>
          {res.partnerVehiclePlate && <span className="ps-badge ps-badge--accent">{res.partnerVehiclePlate}</span>}
          <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 17, color: 'var(--ps-text)', fontVariantNumeric: 'tabular-nums' }}>
            {res.price?.amount} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ps-text-3)' }}>{res.price?.currency}</span>
          </span>
        </div>

        {/* Actions */}
        {!isPending ? (
          <Button type="primary" block onClick={() => onDetail(res.id)} style={{ borderRadius: 8 }}>
            Detay / İşlemler <RightOutlined />
          </Button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8 }}>
            <Button danger ghost onClick={() => onReject(res.id)} style={{ borderRadius: 8 }}>Reddet</Button>
            <Button onClick={() => onDetail(res.id)} style={{ borderRadius: 8 }}>Detay</Button>
            <Button type="primary" loading={loading} onClick={() => onAccept(res.id)} style={{ borderRadius: 8 }}>
              Kabul Et
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────── */
export default function PartnerDashboard() {
  const router = useRouter();

  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [stats, setStats] = useState({ pending: 0, today: 0, completed: 0, revenue: 0, revCurrency: 'EUR' });
  const [reservations, setReservations] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleCap, setVehicleCap] = useState({ total: 0, busy: 0, available: 0 });
  const [recentCompleted, setRecentCompleted] = useState<any[]>([]);
  const [myVehicles, setMyVehicles] = useState<any[]>([]);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const [statsRes, activeRes, vehicleRes, driverRes, completedRes] = await Promise.allSettled([
        apiClient.get('/api/transfer/partner/stats'),
        apiClient.get('/api/transfer/partner/active-bookings'),
        apiClient.get('/api/transfer/partner/my-vehicles'),
        apiClient.get('/api/users?role=DRIVER&limit=10'),
        apiClient.get('/api/transfer/partner/completed-bookings?limit=5'),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value.data?.success) {
        const d = statsRes.value.data.data;
        setStats({ pending: d.pending ?? 0, today: d.today ?? 0, completed: d.completed ?? 0, revenue: d.revenue ?? 0, revCurrency: d.currency ?? 'EUR' });
      }

      if (activeRes.status === 'fulfilled' && activeRes.value.data?.success) {
        setReservations(activeRes.value.data.data || []);
      }

      if (vehicleRes.status === 'fulfilled' && vehicleRes.value.data?.success) {
        const d = vehicleRes.value.data.data;
        setMyVehicles(d.vehicles || []);
        setVehicles(d.vehicles || []);
        setVehicleCap({ total: d.totalVehicles ?? 0, busy: d.busyVehicles ?? 0, available: d.availableSlots ?? 0 });
      }

      if (driverRes.status === 'fulfilled' && driverRes.value.data?.success) {
        setDrivers(driverRes.value.data.data || []);
      }

      if (completedRes.status === 'fulfilled' && completedRes.value.data?.success) {
        setRecentCompleted(completedRes.value.data.data || []);
      }
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (id: string, vehicleId?: string) => {
    const avail = myVehicles.filter(v => !v.isBusy);
    if (avail.length > 1 && !vehicleId) {
      setPendingAcceptId(id);
      setVehicleModalVisible(true);
      return;
    }
    const selVehicleId = vehicleId || (avail.length === 1 ? avail[0].id : undefined);
    setActionLoading(id);
    try {
      const res = await apiClient.put(`/api/transfer/bookings/${id}/status`, {
        status: 'CONFIRMED', subStatus: 'IN_OPERATION',
        ...(selVehicleId ? { partnerVehicleId: selVehicleId } : {}),
      });
      if (res.data.success) {
        setVehicleModalVisible(false);
        setPendingAcceptId(null);
        load();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (id: string) => {
    setReservations(prev => prev.filter(r => r.id !== id));
  };

  const onlineDrivers = drivers.filter(d => d.isOnline).length;
  const busyDrivers = drivers.filter(d => d.isOnline && d.activeBooking).length;
  const allBusy = vehicleCap.total > 0 && vehicleCap.available === 0;

  const quickActions = [
    { icon: <PlusOutlined />, label: 'Yeni İş', color: '#6366f1', bg: '#eef2ff', path: '/partner/bookings/new' },
    { icon: <CompassOutlined />, label: 'Canlı Takip', color: '#10b981', bg: '#ecfdf5', path: '/partner/dispatch' },
    { icon: <GlobalOutlined />, label: 'Pazar Yeri', color: '#f59e0b', bg: '#fffbeb', path: '/partner/marketplace' },
    { icon: <AppstoreOutlined />, label: 'Transferler', color: '#3b82f6', bg: '#eff6ff', path: '/partner/pool' },
  ];

  return (
    <div>
      {/* ── Page header ─────────────────────────────────── */}
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">Dashboard</h1>
          <p className="ps-page-header__subtitle">Operasyon özeti ve canlı durum</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={fetching}>
          Yenile
        </Button>
      </div>

      {/* ── KPI row ──────────────────────────────────────── */}
      <div className="ps-kpi-grid">
        <KpiCard
          label="Bekleyen"
          value={fetching ? <Spin size="small" /> : fmt(stats.pending)}
          sub="transfer"
          icon={<ClockCircleOutlined />}
          color="#6366f1" bg="#eef2ff" accent="linear-gradient(90deg,#6366f1,#8b5cf6)"
        />
        <KpiCard
          label="Bugün"
          value={fetching ? <Spin size="small" /> : fmt(stats.today)}
          sub="transfer"
          icon={<CalendarOutlined />}
          color="#10b981" bg="#ecfdf5" accent="linear-gradient(90deg,#10b981,#059669)"
        />
        <KpiCard
          label="Tamamlanan"
          value={fetching ? <Spin size="small" /> : fmt(stats.completed)}
          sub="toplam"
          icon={<CheckCircleOutlined />}
          color="#3b82f6" bg="#eff6ff" accent="linear-gradient(90deg,#3b82f6,#6366f1)"
        />
        <KpiCard
          label="Gelir"
          value={fetching ? <Spin size="small" /> : fmtCur(stats.revenue, stats.revCurrency)}
          sub="bu ay"
          icon={<DollarOutlined />}
          color="#f59e0b" bg="#fffbeb" accent="linear-gradient(90deg,#f59e0b,#f97316)"
        />
      </div>

      {/* ── Vehicle capacity banner ───────────────────────── */}
      {vehicleCap.total > 0 && (
        <div className={`ps-alert ${allBusy ? 'ps-alert--danger' : 'ps-alert--success'}`}>
          <CarOutlined style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {allBusy ? 'Tüm araçlarınız meşgul' : `${vehicleCap.available} araç müsait`}
            </div>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
              {vehicleCap.total} araç · {vehicleCap.busy} meşgul · {vehicleCap.available} boş
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {vehicles.map((v: any) => (
                <span key={v.id} className={`ps-badge ${v.isBusy ? 'ps-badge--warning' : 'ps-badge--success'}`}>
                  <CarOutlined style={{ fontSize: 9, marginRight: 3 }} />
                  {v.plateNumber} {v.isBusy ? '· Meşgul' : '· Boş'}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────── */}
      <div className="ps-dash-grid">
        {/* LEFT — Active transfers */}
        <div>
          <div className="ps-card" style={{ marginBottom: 20 }}>
            <div className="ps-card-header">
              <h3 className="ps-card-title">
                <FireOutlined style={{ color: '#f59e0b' }} />
                Aktif & Bekleyen Transferler
              </h3>
              <Button size="small" type="link" onClick={() => router.push('/partner/pool')} style={{ fontWeight: 600 }}>
                Tümünü gör <RightOutlined />
              </Button>
            </div>
            <div style={{ padding: '16px 16px 8px' }}>
              {fetching ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Spin />
                  <p style={{ color: 'var(--ps-text-3)', marginTop: 12, fontSize: 13 }}>Yükleniyor…</p>
                </div>
              ) : reservations.length === 0 ? (
                <div className="ps-empty">
                  <div className="ps-empty__icon"><AppstoreOutlined /></div>
                  <p className="ps-empty__title">Aktif transfer yok</p>
                  <p className="ps-empty__desc">Yeni transferler buraya düşecek</p>
                </div>
              ) : (
                <div className="ps-job-grid">
                  {reservations.slice(0, 4).map(res => (
                    <ReservationCard
                      key={res.id} res={res}
                      loading={actionLoading === res.id}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      onDetail={id => router.push(`/partner/booking/${id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="ps-card">
            <div className="ps-card-header">
              <h3 className="ps-card-title"><ThunderboltOutlined style={{ color: '#6366f1' }} /> Hızlı İşlemler</h3>
            </div>
            <div className="ps-card-body">
              <div className="ps-quick-grid">
                {quickActions.map(qa => (
                  <button key={qa.path} type="button" className="ps-quick-btn" onClick={() => router.push(qa.path)}>
                    <span className="ps-quick-btn__icon" style={{ background: qa.bg, color: qa.color }}>{qa.icon}</span>
                    <span className="ps-quick-btn__label">{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Drivers + recent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Driver status */}
          <div className="ps-card">
            <div className="ps-card-header">
              <h3 className="ps-card-title">
                <UserOutlined style={{ color: '#3b82f6' }} />
                Sürücü Durumu
              </h3>
              <Button size="small" type="link" onClick={() => router.push('/partner/fleet/drivers')} style={{ fontWeight: 600 }}>
                Yönet <RightOutlined />
              </Button>
            </div>
            <div style={{ padding: '12px 16px 4px' }}>
              {/* Summary */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <span className="ps-badge ps-badge--success"><span className="ps-badge__dot" />{onlineDrivers} Online</span>
                <span className="ps-badge ps-badge--warning"><span className="ps-badge__dot" />{busyDrivers} Seferde</span>
                <span className="ps-badge ps-badge--neutral"><span className="ps-badge__dot" />{drivers.length - onlineDrivers} Offline</span>
              </div>

              {/* Utilisation bar */}
              {drivers.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ps-text-3)', marginBottom: 4 }}>
                    <span>Kullanım</span>
                    <span>{drivers.length > 0 ? Math.round((busyDrivers / drivers.length) * 100) : 0}%</span>
                  </div>
                  <Progress
                    percent={drivers.length > 0 ? Math.round((busyDrivers / drivers.length) * 100) : 0}
                    showInfo={false}
                    strokeColor="#6366f1"
                    size="small"
                  />
                </div>
              )}

              {fetching ? (
                <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>
              ) : drivers.length === 0 ? (
                <div className="ps-empty" style={{ padding: '24px 16px' }}>
                  <p className="ps-empty__title">Sürücü yok</p>
                  <p className="ps-empty__desc">Sürücü eklemek için Filom menüsünü kullanın</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
                  {drivers.slice(0, 6).map((d: any) => (
                    <DriverStatusCard key={d.id} driver={d} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent completed */}
          <div className="ps-card">
            <div className="ps-card-header">
              <h3 className="ps-card-title">
                <CheckCircleOutlined style={{ color: '#10b981' }} />
                Son Tamamlananlar
              </h3>
              <Button size="small" type="link" onClick={() => router.push('/partner/completed')} style={{ fontWeight: 600 }}>
                Tümü <RightOutlined />
              </Button>
            </div>
            <div style={{ padding: '8px 16px' }}>
              {fetching ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
              ) : recentCompleted.length === 0 ? (
                <p style={{ color: 'var(--ps-text-3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                  Henüz tamamlanan transfer yok
                </p>
              ) : (
                <div className="ps-activity">
                  {recentCompleted.map((b: any) => (
                    <div key={b.id} className="ps-activity__item" role="button" tabIndex={0}
                      onClick={() => router.push(`/partner/booking/${b.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="ps-activity__dot" style={{ background: '#ecfdf5', color: '#10b981' }}>
                        <CheckCircleOutlined />
                      </div>
                      <div className="ps-activity__content">
                        <div className="ps-activity__title">{b.customer?.name || b.bookingNumber}</div>
                        <div className="ps-activity__meta">
                          <EnvironmentOutlined style={{ marginRight: 4 }} />
                          {b.pickup?.location} → {b.dropoff?.location}
                        </div>
                        <div className="ps-activity__meta">{b.createdAt ? relTime(b.createdAt) : ''}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ps-text)', flexShrink: 0, marginLeft: 8 }}>
                        {b.price?.amount} <span style={{ fontSize: 11, color: 'var(--ps-text-3)' }}>{b.price?.currency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Vehicle selection modal ───────────────────────── */}
      <Modal
        open={vehicleModalVisible}
        title="Araç Seçin"
        footer={null}
        onCancel={() => { setVehicleModalVisible(false); setPendingAcceptId(null); }}
        centered
        width={400}
      >
        <p style={{ color: 'var(--ps-text-3)', marginBottom: 16, fontSize: 13 }}>
          Bu transferi hangi aracınızla yapacaksınız?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {myVehicles.filter(v => !v.isBusy).map(v => (
            <button
              key={v.id} type="button"
              onClick={() => pendingAcceptId && handleAccept(pendingAcceptId, v.id)}
              disabled={actionLoading !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                border: '1.5px solid var(--ps-border)',
                borderRadius: 10, background: '#fff',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                textAlign: 'left', width: '100%', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--ps-border)')}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eef2ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CarOutlined style={{ fontSize: 18 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{v.plateNumber}</div>
                <div style={{ fontSize: 12, color: 'var(--ps-text-3)', marginTop: 2 }}>
                  {v.name} · {v.vehicleType} · {v.capacity} kişi
                </div>
              </div>
              <RightOutlined style={{ color: 'var(--ps-text-3)' }} />
            </button>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ps-text-3)', marginTop: 12 }}>
          Sadece boş araçlar listeleniyor
        </p>
      </Modal>
    </div>
  );
}

// Keep CompassOutlined import used inside quickActions
function CompassOutlined(props: any) {
  return (
    <svg viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor" {...props}>
      <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372zm224-596.6L442.4 382.8a32.07 32.07 0 00-19.6 19.6L337 667.6c-9.4 28.2 17.2 54.8 45.4 45.4l265.2-85.8a32.07 32.07 0 0019.6-19.6l85.8-265.2c9.4-28.2-17.2-54.8-45.4-45.4zm-357.8 347.8l74.6-230.8 230.8-74.6-74.6 230.8-230.8 74.6z" />
    </svg>
  );
}
