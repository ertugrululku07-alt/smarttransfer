'use client';

import React, { useState, useEffect } from 'react';
import {
  ClockCircleOutlined,
  CalendarOutlined,
  CarOutlined,
  PhoneOutlined,
  ReloadOutlined,
  RightOutlined,
  TeamOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { Button, message, Spin, Tabs, Tag, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import {
  PartnerPageHeader,
  PartnerStatCard,
  PartnerEmptyState,
  PartnerCapacityBanner,
  TransferJobCard,
} from './components';

const PartnerDashboard = () => {
  const router = useRouter();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [stats, setStats] = useState({ pending: 0, today: 0 });
  const [myVehicles, setMyVehicles] = useState<any[]>([]);
  const [vehicleCapacity, setVehicleCapacity] = useState({
    totalVehicles: 0,
    busyVehicles: 0,
    availableSlots: 0,
    canAcceptMore: false,
  });
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
  const [poolRuns, setPoolRuns] = useState<any[]>([]);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/api/transfer/partner/stats');
      if (response.data.success) setStats(response.data.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchMyVehicles = async () => {
    try {
      const res = await apiClient.get('/api/transfer/partner/my-vehicles');
      if (res.data.success) {
        const d = res.data.data;
        setMyVehicles(d.vehicles || []);
        setVehicleCapacity({
          totalVehicles: d.totalVehicles || 0,
          busyVehicles: d.busyVehicles || 0,
          availableSlots: d.availableSlots || 0,
          canAcceptMore: d.canAcceptMore || false,
        });
        return d;
      }
    } catch (e) {
      console.error('Vehicle fetch error:', e);
    }
    return null;
  };

  const fetchBookings = async () => {
    setFetching(true);
    fetchStats();
    try {
      const [vehicleData, activeResponse] = await Promise.all([
        fetchMyVehicles(),
        apiClient.get('/api/transfer/partner/active-bookings'),
      ]);

      const activeBookings = activeResponse.data.success ? activeResponse.data.data : [];
      const availableSlots = vehicleData?.availableSlots ?? 0;
      const totalVehicles = vehicleData?.totalVehicles ?? 0;

      if (activeBookings.length > 0) {
        setReservations(activeBookings);
      } else {
        setReservations([]);
      }

      if (availableSlots > 0 || totalVehicles === 0) {
        const poolResponse = await apiClient.get('/api/transfer/pool-bookings');
        if (poolResponse.data.success) {
          const all = poolResponse.data.data || [];
          const runMap: Record<string, any[]> = {};
          const singles: any[] = [];
          all.forEach((b: any) => {
            if (b.poolRunKey) {
              if (!runMap[b.poolRunKey]) runMap[b.poolRunKey] = [];
              runMap[b.poolRunKey].push(b);
            } else {
              singles.push(b);
            }
          });
          if (activeBookings.length > 0) {
            setReservations([...activeBookings, ...singles]);
          } else {
            setReservations(singles);
          }
          setPoolRuns(
            Object.entries(runMap).map(([key, bookings]) => ({
              poolRunKey: key,
              routeName: bookings[0]?.poolRunName || 'Shuttle Sefer',
              departureTime: bookings[0]?.poolDepartureTime || '--:--',
              poolPrice: bookings[0]?.price?.amount || 0,
              currency: bookings[0]?.price?.currency || 'TRY',
              bookings,
            }))
          );
        }
      } else {
        setPoolRuns([]);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      message.error('Veriler yüklenirken hata oluştu');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleAccept = async (id: string, vehicleId?: string) => {
    const availableVehicles = myVehicles.filter((v) => !v.isBusy);
    if (availableVehicles.length > 1 && !vehicleId) {
      setPendingAcceptId(id);
      setVehicleModalVisible(true);
      return;
    }

    const selectedVehicleId =
      vehicleId || (availableVehicles.length === 1 ? availableVehicles[0].id : undefined);

    setLoading(id);
    try {
      const response = await apiClient.put(`/api/transfer/bookings/${id}/status`, {
        status: 'CONFIRMED',
        subStatus: 'IN_OPERATION',
        ...(selectedVehicleId ? { partnerVehicleId: selectedVehicleId } : {}),
      });
      if (response.data.success) {
        message.success('Rezervasyon kabul edildi!');
        setVehicleModalVisible(false);
        setPendingAcceptId(null);
        fetchBookings();
      } else {
        message.error(response.data.error || 'İşlem başarısız oldu');
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Bir hata oluştu');
    } finally {
      setLoading(null);
    }
  };

  const handleReject = (id: string) => {
    if (confirm('Bu rezervasyonu reddetmek istediğinize emin misiniz?')) {
      setReservations((prev) => prev.filter((r) => r.id !== id));
      message.info('Rezervasyon reddedildi');
    }
  };

  const hasActive = reservations.some((r) => r.status === 'ACCEPTED' || r.status === 'CONFIRMED');
  const allVehiclesBusy = vehicleCapacity.totalVehicles > 0 && vehicleCapacity.availableSlots === 0;
  const hasPool = reservations.some(
    (r) => r.status === 'PENDING' || r.status === 'WAITING' || r.status === 'POOL'
  );

  const pageTitle = allVehiclesBusy
    ? 'Aktif Transferler'
    : hasActive && hasPool
      ? 'Transfer Havuzu'
      : hasActive
        ? 'Aktif Transfer'
        : 'Transfer Havuzu';

  const pageSubtitle = allVehiclesBusy
    ? 'Tüm araçlarınız meşgul — havuz gizli'
    : hasActive
      ? 'Aktif transferleriniz ve bekleyen havuz'
      : 'Size atanan ve bekleyen transferler';

  const filters = [
    { key: 'all', label: 'Tümü', count: reservations.length },
    { key: 'vip', label: 'VIP Transfer' },
    { key: 'minibus', label: 'Minibüs' },
  ];

  return (
    <div className="partner-page">
      <PartnerPageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        action={
          <Button icon={<ReloadOutlined />} onClick={fetchBookings} loading={fetching}>
            Yenile
          </Button>
        }
      />

      <div className="partner-stat-grid">
        <PartnerStatCard
          variant="accent"
          icon={<ClockCircleOutlined />}
          label="Bekleyen"
          value={stats.pending}
          hint="transfer"
        />
        <PartnerStatCard
          icon={<CalendarOutlined />}
          label="Bugün"
          value={stats.today}
          hint="transfer"
        />
      </div>

      <PartnerCapacityBanner capacity={vehicleCapacity} vehicles={myVehicles} />

      <Tabs
        defaultActiveKey="private"
        size="large"
        items={[
          {
            key: 'private',
            label: <span style={{ fontWeight: 600 }}>Özel Transferler</span>,
            children: (
              <>
                <div className="partner-filter-row">
                  {filters.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={`partner-filter-chip${activeFilter === f.key ? ' partner-filter-chip--active' : ''}`}
                      onClick={() => setActiveFilter(f.key)}
                    >
                      {f.label}
                      {f.count !== undefined ? ` (${f.count})` : ''}
                    </button>
                  ))}
                </div>

                {fetching ? (
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                    <p style={{ color: 'var(--partner-text-muted)', marginTop: 12 }}>Yükleniyor...</p>
                  </div>
                ) : reservations.length === 0 ? (
                  <PartnerEmptyState
                    icon={<InboxOutlined />}
                    title="Henüz transfer yok"
                    description="Yeni özel transferler atandığında burada görünecektir"
                  />
                ) : (
                  <div className="partner-job-grid">
                    {reservations.map((res) => (
                      <TransferJobCard
                        key={res.id}
                        job={res}
                        loading={loading === res.id}
                        onAccept={handleAccept}
                        onReject={handleReject}
                        onDetail={(id) => router.push(`/partner/booking/${id}`)}
                      />
                    ))}
                  </div>
                )}
              </>
            ),
          },
          {
            key: 'shuttle',
            label: (
              <span style={{ fontWeight: 600 }}>
                Shuttle Seferleri
                {poolRuns.length > 0 && (
                  <Tag color="gold" style={{ marginLeft: 8 }}>
                    {poolRuns.length}
                  </Tag>
                )}
              </span>
            ),
            children: (
              <>
                {fetching ? (
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                  </div>
                ) : poolRuns.length === 0 ? (
                  <PartnerEmptyState
                    icon={<InboxOutlined />}
                    title="Henüz shuttle seferi yok"
                    description="Havuza atılan shuttle seferleri burada listelenir"
                  />
                ) : (
                  poolRuns.map((run) => (
                    <div key={run.poolRunKey} className="partner-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          padding: '16px 20px',
                          borderBottom: '1px solid var(--partner-border)',
                          background: 'var(--partner-surface-raised)',
                        }}
                      >
                        <div
                          style={{
                            border: '2px solid var(--partner-accent)',
                            color: 'var(--partner-accent)',
                            borderRadius: 12,
                            padding: '8px 16px',
                            fontSize: 22,
                            fontWeight: 900,
                            minWidth: 80,
                            textAlign: 'center',
                          }}
                        >
                          {run.departureTime}
                          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, textTransform: 'uppercase' }}>
                            Uçuş
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>{run.routeName}</div>
                          <div style={{ fontSize: 13, color: 'var(--partner-text-secondary)', marginTop: 4 }}>
                            <TeamOutlined /> {run.bookings.length} Yolcu
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--partner-text-muted)' }}>
                            Tüm Sefer Ücreti
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--partner-success)' }}>
                            {Number(run.poolPrice).toLocaleString('tr-TR')} {run.currency}
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '12px 16px' }}>
                        {run.bookings.map((b: any, i: number) => {
                          const isPaid = b.paymentStatus === 'PAID';
                          return (
                            <div
                              key={b.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                gap: 12,
                                padding: '12px 8px',
                                borderBottom:
                                  i < run.bookings.length - 1 ? '1px dashed var(--partner-border)' : 'none',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700 }}>{b.customer?.name}</div>
                                {b.customer?.phone && (
                                  <div style={{ fontSize: 12, color: 'var(--partner-text-secondary)' }}>
                                    <PhoneOutlined /> {b.customer.phone}
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: 12 }}>
                                {b.pickup?.location} → {b.dropoff?.location}
                              </div>
                              <div>
                                <Tag color={isPaid ? 'success' : 'warning'}>{isPaid ? 'Ödendi' : 'Araçta'}</Tag>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding: 16, borderTop: '1px solid var(--partner-border)', textAlign: 'right' }}>
                        <Button
                          type="primary"
                          icon={<RightOutlined />}
                          onClick={() => run.bookings.forEach((b: any) => handleAccept(b.id))}
                        >
                          Seferi Kabul Et
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </>
            ),
          },
        ]}
      />

      <Modal
        open={vehicleModalVisible}
        title="Araç Seçin"
        footer={null}
        onCancel={() => {
          setVehicleModalVisible(false);
          setPendingAcceptId(null);
        }}
        centered
        width={420}
      >
        <p style={{ color: 'var(--partner-text-secondary)', marginBottom: 16 }}>
          Bu transferi hangi aracınızla yapacaksınız?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {myVehicles
            .filter((v) => !v.isBusy)
            .map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => pendingAcceptId && handleAccept(pendingAcceptId, v.id)}
                disabled={loading !== null}
                className="partner-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 18px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  border: '2px solid var(--partner-border)',
                }}
              >
                <CarOutlined style={{ fontSize: 22, color: 'var(--partner-accent)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{v.plateNumber}</div>
                  <div style={{ fontSize: 12, color: 'var(--partner-text-secondary)' }}>
                    {v.name} · {v.vehicleType} · {v.capacity} kişi
                  </div>
                </div>
                <RightOutlined />
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
};

export default PartnerDashboard;
