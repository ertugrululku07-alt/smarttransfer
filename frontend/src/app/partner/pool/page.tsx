'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spin, Tabs, Tag } from 'antd';
import {
  ReloadOutlined, InboxOutlined, CarOutlined, UserOutlined,
  CalendarOutlined, PhoneOutlined, RightOutlined, TeamOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

function relTime(t: string) {
  const diff = Date.now() - new Date(t).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Az önce';
  if (m < 60) return `${m} dk önce`;
  return `${Math.floor(m / 60)} sa önce`;
}

function TransferRow({ t, onClick }: { t: any; onClick: () => void }) {
  const isPending = t.status === 'PENDING' || t.status === 'WAITING';
  const stripe = isPending ? '#f59e0b' : '#6366f1';
  const initials = (t.customer?.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="ps-job" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="ps-job__stripe" style={{ background: stripe }} />
      <div className="ps-job__body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9, background: '#eef2ff',
              color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>{initials}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.customer?.name}</div>
              {t.customer?.phone && (
                <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>
                  <PhoneOutlined style={{ fontSize: 10, marginRight: 3 }} />{t.customer.phone}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className={`ps-badge ${isPending ? 'ps-badge--warning' : 'ps-badge--accent'}`}>
              <span className="ps-badge__dot" />{isPending ? 'Bekliyor' : 'Aktif'}
            </span>
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ps-text)' }}>
              {t.price?.amount} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ps-text-3)' }}>{t.price?.currency}</span>
            </span>
          </div>
        </div>

        <div className="ps-route" style={{ marginBottom: 12 }}>
          <div className="ps-route__line">
            <div className="ps-route__dot ps-route__dot--from" />
            <div className="ps-route__connector" />
            <div className="ps-route__dot ps-route__dot--to" />
          </div>
          <div className="ps-route__detail">
            <div className="ps-route__from">
              <div className="ps-route__label">Alış</div>
              <div className="ps-route__address">{t.pickup?.location}</div>
              <div className="ps-route__time"><CalendarOutlined style={{ marginRight: 3 }} />{t.pickup?.time}</div>
            </div>
            <div>
              <div className="ps-route__label">Varış</div>
              <div className="ps-route__address">{t.dropoff?.location}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ps-badge ps-badge--neutral"><CarOutlined style={{ fontSize: 9, marginRight: 3 }} />{t.vehicle?.type}</span>
          <span className="ps-badge ps-badge--neutral"><UserOutlined style={{ fontSize: 9, marginRight: 3 }} />{t.vehicle?.pax} kişi</span>
          {t.partnerVehiclePlate && <span className="ps-badge ps-badge--accent">{t.partnerVehiclePlate}</span>}
          <Button size="small" type="primary" ghost onClick={e => { e.stopPropagation(); onClick(); }} style={{ marginLeft: 'auto', borderRadius: 7 }}>
            Detay <RightOutlined />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MyTransfersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [poolRuns, setPoolRuns] = useState<any[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [activeRes, poolRes] = await Promise.allSettled([
        apiClient.get('/api/transfer/partner/active-bookings'),
        apiClient.get('/api/transfer/pool-bookings'),
      ]);
      if (activeRes.status === 'fulfilled' && activeRes.value.data?.success) setTransfers(activeRes.value.data.data || []);
      if (poolRes.status === 'fulfilled' && poolRes.value.data?.success) {
        const all = poolRes.value.data.data || [];
        const runMap: Record<string, any[]> = {};
        all.forEach((b: any) => {
          if (b.poolRunKey) {
            if (!runMap[b.poolRunKey]) runMap[b.poolRunKey] = [];
            runMap[b.poolRunKey].push(b);
          }
        });
        setPoolRuns(Object.entries(runMap).map(([key, bookings]) => ({
          poolRunKey: key,
          routeName: bookings[0]?.poolRunName || 'Shuttle',
          departureTime: bookings[0]?.poolDepartureTime || '--:--',
          poolPrice: bookings[0]?.price?.amount || 0,
          currency: bookings[0]?.price?.currency || 'TRY',
          bookings,
        })));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  return (
    <div>
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">Transferlerim</h1>
          <p className="ps-page-header__subtitle">Aktif ve atanmış transferler</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {transfers.length > 0 && <span className="ps-badge ps-badge--accent">{transfers.length} Aktif</span>}
          <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>Yenile</Button>
        </div>
      </div>

      <Tabs
        size="large"
        items={[
          {
            key: 'active',
            label: <span style={{ fontWeight: 600 }}>Özel Transferler {transfers.length > 0 && <Tag color="purple" style={{ marginLeft: 4 }}>{transfers.length}</Tag>}</span>,
            children: (
              <>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : transfers.length === 0 ? (
                  <div className="ps-empty">
                    <div className="ps-empty__icon"><InboxOutlined /></div>
                    <p className="ps-empty__title">Aktif transfer yok</p>
                    <p className="ps-empty__desc">Kabul ettiğiniz transferler burada görünür</p>
                  </div>
                ) : (
                  <div className="ps-job-grid">
                    {transfers.map(t => (
                      <TransferRow key={t.id} t={t} onClick={() => router.push(`/partner/booking/${t.id}`)} />
                    ))}
                  </div>
                )}
              </>
            ),
          },
          {
            key: 'shuttle',
            label: <span style={{ fontWeight: 600 }}>Shuttle Seferleri {poolRuns.length > 0 && <Tag color="gold" style={{ marginLeft: 4 }}>{poolRuns.length}</Tag>}</span>,
            children: (
              <>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : poolRuns.length === 0 ? (
                  <div className="ps-empty">
                    <div className="ps-empty__icon"><InboxOutlined /></div>
                    <p className="ps-empty__title">Shuttle seferi yok</p>
                    <p className="ps-empty__desc">Havuza atılan shuttle seferleri burada listelenir</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {poolRuns.map(run => (
                      <div key={run.poolRunKey} className="ps-card" style={{ overflow: 'hidden' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 16,
                          padding: '16px 20px', borderBottom: '1px solid var(--ps-border)',
                          background: 'var(--ps-surface-2)',
                        }}>
                          <div style={{
                            border: '2px solid #6366f1', color: '#6366f1', borderRadius: 10,
                            padding: '6px 14px', textAlign: 'center', fontWeight: 900, fontSize: 20, minWidth: 72,
                          }}>
                            {run.departureTime}
                            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Uçuş</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{run.routeName}</div>
                            <div style={{ fontSize: 12, color: 'var(--ps-text-3)', marginTop: 3 }}>
                              <TeamOutlined style={{ marginRight: 4 }} />{run.bookings.length} yolcu
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--ps-text-3)', marginBottom: 2 }}>Sefer Ücreti</div>
                            <div style={{ fontWeight: 900, fontSize: 22, color: 'var(--ps-success)' }}>
                              {Number(run.poolPrice).toLocaleString('tr-TR')} {run.currency}
                            </div>
                          </div>
                        </div>
                        <div style={{ padding: '12px 20px' }}>
                          {run.bookings.map((b: any, i: number) => (
                            <div key={b.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 0',
                              borderBottom: i < run.bookings.length - 1 ? '1px dashed var(--ps-border)' : 'none',
                            }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ps-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ps-text-2)', flexShrink: 0 }}>{i + 1}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{b.customer?.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--ps-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {b.pickup?.location} → {b.dropoff?.location}
                                </div>
                              </div>
                              <Tag color={b.paymentStatus === 'PAID' ? 'success' : 'warning'} style={{ flexShrink: 0 }}>
                                {b.paymentStatus === 'PAID' ? 'Ödendi' : 'Araçta'}
                              </Tag>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
