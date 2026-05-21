'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DatePicker, Empty, Spin, Tabs, Tag, Tooltip } from 'antd';
import {
  ReloadOutlined, InboxOutlined, CarOutlined, UserOutlined,
  CalendarOutlined, PhoneOutlined, RightOutlined, TeamOutlined, EnvironmentOutlined,
  WhatsAppOutlined, MailOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import dayjs, { type Dayjs } from 'dayjs';

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
  const [shuttleRuns, setShuttleRuns] = useState<any[]>([]);
  const [shuttleDate, setShuttleDate] = useState<Dayjs>(dayjs());
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [activeRes, shuttleRes, fleetRes] = await Promise.allSettled([
        apiClient.get('/api/transfer/partner/active-bookings'),
        apiClient.get(`/api/transfer/partner/shuttle-runs?date=${shuttleDate.format('YYYY-MM-DD')}`),
        apiClient.get('/api/transfer/partner/operations/fleet'),
      ]);
      if (activeRes.status === 'fulfilled' && activeRes.value.data?.success) {
        // exclude shuttle bookings from "active" because they appear in shuttle tab
        const all = activeRes.value.data.data || [];
        setTransfers(all.filter((b: any) => {
          const vt = String(b.vehicle?.type || '').toLowerCase();
          return !vt.includes('shuttle') && !vt.includes('paylaşımlı');
        }));
      }
      if (shuttleRes.status === 'fulfilled' && shuttleRes.value.data?.success) setShuttleRuns(shuttleRes.value.data.data || []);
      if (fleetRes.status === 'fulfilled' && fleetRes.value.data?.success) {
        setDrivers(fleetRes.value.data.data?.drivers || []);
        setVehicles(fleetRes.value.data.data?.vehicles || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [shuttleDate]);

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
            label: <span style={{ fontWeight: 600 }}>Shuttle Seferleri {shuttleRuns.length > 0 && <Tag color="gold" style={{ marginLeft: 4 }}>{shuttleRuns.length}</Tag>}</span>,
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <DatePicker value={shuttleDate} onChange={(v) => v && setShuttleDate(v)} format="DD.MM.YYYY" />
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <span><b>{shuttleRuns.reduce((s, r) => s + (r.passengerCount || 0), 0)}</b> yolcu</span>
                    <span><b>{shuttleRuns.filter((r) => r.allReady).length}/{shuttleRuns.length}</b> hazır</span>
                  </div>
                </div>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : shuttleRuns.length === 0 ? (
                  <div className="ps-empty">
                    <div className="ps-empty__icon"><InboxOutlined /></div>
                    <p className="ps-empty__title">Shuttle seferi yok</p>
                    <p className="ps-empty__desc">{shuttleDate.format('DD.MM.YYYY')} tarihinde shuttle seferi bulunmuyor</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {shuttleRuns.map((run: any) => {
                      const t = run.tripType === 'ARV' ? { label: 'GELİŞ', color: 'green' } : run.tripType === 'DEP' ? { label: 'GİDİŞ', color: 'orange' } : { label: 'ARA', color: 'default' };
                      const driver = drivers.find((d) => d.id === run.driverId);
                      const vehicle = vehicles.find((v) => v.id === run.vehicleId);
                      return (
                        <div key={run.runKey} className="ps-card" style={{ overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--ps-border)', background: 'var(--ps-surface-2)', flexWrap: 'wrap' }}>
                            <div style={{ border: '2px solid #6366f1', color: '#4f46e5', borderRadius: 10, padding: '6px 14px', textAlign: 'center', fontWeight: 900, fontSize: 20, minWidth: 72 }}>
                              {run.departureTime}
                              <div style={{ fontSize: 9, fontWeight: 700, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>SEFER</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, fontSize: 16 }}>{run.routeName}</span>
                                <Tag color={t.color}>{t.label}</Tag>
                                {run.allReady ? <Tag color="green"><CheckCircleOutlined /> Hazır</Tag> : run.driverAssigned ? <Tag color="blue">Atandı</Tag> : <Tag>Atanmadı</Tag>}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--ps-text-3)', marginTop: 4 }}>
                                <TeamOutlined style={{ marginRight: 4 }} />{run.passengerCount} yolcu · {run.bookings.length} rezervasyon
                                {driver && <> · <UserOutlined style={{ marginLeft: 6, marginRight: 4 }} /> {driver.name}</>}
                                {vehicle && <> · <CarOutlined style={{ marginLeft: 6, marginRight: 4 }} /> {vehicle.plate}</>}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, color: 'var(--ps-text-3)', marginBottom: 2 }}>Toplam Tutar</div>
                              <div style={{ fontWeight: 900, fontSize: 22, color: 'var(--ps-success)' }}>
                                {Number(run.totalAmount || 0).toLocaleString('tr-TR')} {run.currency}
                              </div>
                            </div>
                          </div>
                          <div style={{ padding: '4px 16px 16px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  <th style={{ textAlign: 'left', padding: '8px 6px', width: 30 }}>#</th>
                                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Müşteri</th>
                                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Güzergah</th>
                                  <th style={{ textAlign: 'center', padding: '8px 6px', width: 70 }}>Saat</th>
                                  <th style={{ textAlign: 'center', padding: '8px 6px', width: 70 }}>Uçuş</th>
                                  <th style={{ textAlign: 'center', padding: '8px 6px', width: 60 }}>Pax</th>
                                  <th style={{ textAlign: 'center', padding: '8px 6px', width: 90 }}>Ödeme</th>
                                  <th style={{ textAlign: 'left', padding: '8px 6px', width: 120 }}>İletişim</th>
                                </tr>
                              </thead>
                              <tbody>
                                {run.bookings.map((b: any, i: number) => (
                                  <tr key={b.id} style={{ borderTop: '1px dashed var(--ps-border)' }}>
                                    <td style={{ padding: '8px 6px', color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                      <div style={{ fontWeight: 700 }}>{b.contactName}</div>
                                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.bookingNumber}</div>
                                    </td>
                                    <td style={{ padding: '8px 6px', maxWidth: 360 }}>
                                      <div style={{ fontSize: 11 }}><EnvironmentOutlined style={{ color: '#10b981', marginRight: 4 }} />{b.pickup}</div>
                                      <div style={{ fontSize: 11, marginTop: 2 }}><EnvironmentOutlined style={{ color: '#ef4444', marginRight: 4 }} />{b.dropoff}</div>
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{dayjs(b.pickupDateTime).format('HH:mm')}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600 }}>{b.flightTime || '-'}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>{(b.adults || 0) + (b.children || 0)}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                      <Tag color={b.paymentStatus === 'PAID' ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0 }}>
                                        {b.paymentStatus || 'PENDING'}
                                      </Tag>
                                    </td>
                                    <td style={{ padding: '8px 6px' }}>
                                      <div style={{ display: 'flex', gap: 4 }}>
                                        {b.contactPhone && (
                                          <Tooltip title={b.contactPhone}>
                                            <Button size="small" icon={<PhoneOutlined />} onClick={() => window.open(`tel:${b.contactPhone}`)} />
                                          </Tooltip>
                                        )}
                                        {b.contactPhone && (
                                          <Tooltip title="WhatsApp">
                                            <Button size="small" icon={<WhatsAppOutlined style={{ color: '#22c55e' }} />} onClick={() => window.open(`https://wa.me/${String(b.contactPhone || '').replace(/\D/g, '')}`)} />
                                          </Tooltip>
                                        )}
                                        {b.contactEmail && (
                                          <Tooltip title={b.contactEmail}>
                                            <Button size="small" icon={<MailOutlined />} onClick={() => window.open(`mailto:${b.contactEmail}`)} />
                                          </Tooltip>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
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
