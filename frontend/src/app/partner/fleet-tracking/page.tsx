'use client';

import React, { useEffect, useState } from 'react';
import { Card, Empty, Progress, Spin, Tag } from 'antd';
import {
  CarOutlined, SafetyOutlined, AuditOutlined, ToolOutlined, FireOutlined,
  WarningOutlined, AlertOutlined, ClockCircleOutlined, FallOutlined, RiseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="ps-card" style={{ padding: 16, borderTop: `3px solid ${accent || 'var(--brand-primary)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand-primary-08)', color: 'var(--brand-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export default function FleetDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/api/partner-fleet/dashboard').then((r) => {
      if (r.data?.success) setData(r.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Veri yok" />;

  const k = data.kpis;
  const a = data.alerts;

  const renderAlertList = (rows: any[], dateKey: string, dangerIfOverdue = true) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.slice(0, 8).map((r: any) => {
        const overdue = (r.days || 0) < 0;
        return (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: dangerIfOverdue && overdue ? '#fef2f2' : '#fffbeb', borderRadius: 8, fontSize: 12.5 }}>
            <span>
              <b>{r.vehicle?.plate || r.vehicleId}</b>
              {r.vehicle?.brand && <span style={{ color: '#64748b', marginLeft: 4 }}>{r.vehicle.brand} {r.vehicle.model}</span>}
              {' · '}
              <Tag color={dangerIfOverdue && overdue ? 'red' : 'gold'} style={{ fontSize: 10, margin: 0, marginLeft: 4 }}>{r.type}</Tag>
            </span>
            <span style={{ color: overdue ? '#b91c1c' : '#92400e' }}>
              {dayjs(r[dateKey] || r.date).format('DD.MM.YYYY')} · <b>{overdue ? `${Math.abs(r.days)} gün geçti` : `${r.days} gün`}</b>
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Kpi icon={<CarOutlined />} label="Araç Sayısı" value={`${k.activeVehicles} / ${k.vehicleCount}`} sub="aktif / toplam" accent="var(--brand-primary)" />
        <Kpi icon={<SafetyOutlined />} label="Sigorta Uyarısı" value={(k.insurancesExpiringSoonCount || 0) + (k.insurancesExpiredCount || 0)} sub={`${k.insurancesExpiredCount} süresi geçti`} accent="#ef4444" />
        <Kpi icon={<AuditOutlined />} label="Muayene Uyarısı" value={(k.inspectionsExpiringSoonCount || 0) + (k.inspectionsExpiredCount || 0)} sub={`${k.inspectionsExpiredCount} süresi geçti`} accent="#f59e0b" />
        <Kpi icon={<ToolOutlined />} label="Bakım Yaklaşan" value={k.upcomingMaintenanceCount + k.kmOverdueCount} sub={`${k.kmOverdueCount} km doldu`} accent="#0ea5e9" />
        <Kpi icon={<FireOutlined />} label="Bu Ay Yakıt" value={fmt(k.fuelMonthTotal)} sub={`${k.fuelMonthLiters.toFixed(1)} L · ${k.fuelMonthCount} dolum`} accent="#10b981" />
        <Kpi icon={<ToolOutlined />} label="Bu Ay Bakım" value={fmt(k.maintenanceMonthTotal)} sub={`${k.maintenanceMonthCount} işlem`} accent="var(--brand-accent)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
        {(a.insurancesExpired.length + a.insurancesExpiringSoon.length) > 0 && (
          <Card size="small" title={<span style={{ color: '#b91c1c' }}><WarningOutlined /> Sigorta Uyarıları</span>}>
            {a.insurancesExpired.length > 0 && <>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 700 }}>SÜRESİ GEÇMİŞ ({a.insurancesExpired.length})</div>
              {renderAlertList(a.insurancesExpired, 'date')}
            </>}
            {a.insurancesExpiringSoon.length > 0 && <>
              <div style={{ fontSize: 11, color: '#64748b', margin: '10px 0 4px', fontWeight: 700 }}>30 GÜN İÇİNDE ({a.insurancesExpiringSoon.length})</div>
              {renderAlertList(a.insurancesExpiringSoon, 'date', false)}
            </>}
          </Card>
        )}

        {(a.inspectionsExpired.length + a.inspectionsExpiringSoon.length) > 0 && (
          <Card size="small" title={<span style={{ color: '#92400e' }}><AlertOutlined /> Muayene Uyarıları</span>}>
            {a.inspectionsExpired.length > 0 && <>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 700 }}>SÜRESİ GEÇMİŞ ({a.inspectionsExpired.length})</div>
              {renderAlertList(a.inspectionsExpired, 'date')}
            </>}
            {a.inspectionsExpiringSoon.length > 0 && <>
              <div style={{ fontSize: 11, color: '#64748b', margin: '10px 0 4px', fontWeight: 700 }}>30 GÜN İÇİNDE ({a.inspectionsExpiringSoon.length})</div>
              {renderAlertList(a.inspectionsExpiringSoon, 'date', false)}
            </>}
          </Card>
        )}

        {a.upcomingMaintenance.length > 0 && (
          <Card size="small" title={<span><ClockCircleOutlined /> Yaklaşan Bakım ({a.upcomingMaintenance.length})</span>}>
            {renderAlertList(a.upcomingMaintenance, 'date', false)}
          </Card>
        )}

        {a.kmOverdue.length > 0 && (
          <Card size="small" title={<span><AlertOutlined /> Km Bazlı Bakım ({a.kmOverdue.length})</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {a.kmOverdue.slice(0, 8).map((m: any) => {
                const total = m.nextKm || 0;
                const cur = m.currentKm || 0;
                const pct = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;
                return (
                  <div key={m.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <b>{m.vehicle?.plate || m.vehicleId}</b>
                      <Tag color={m.remaining <= 0 ? 'red' : m.remaining <= 500 ? 'orange' : 'green'} style={{ margin: 0 }}>{m.type}</Tag>
                    </div>
                    <Progress percent={pct} size="small" status={pct >= 100 ? 'exception' : 'active'} format={() => `${(cur || 0).toLocaleString('tr-TR')} / ${(total || 0).toLocaleString('tr-TR')} km`} />
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
        <Card size="small" title={<span><FireOutlined style={{ color: '#10b981', marginRight: 8 }} /> Son Yakıt Kayıtları</span>}>
          {!data.recent.fuel?.length ? <Empty description="Kayıt yok" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.recent.fuel.map((f: any) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                  <span><b>{f.vehicle?.plate || f.vehicleId}</b> · <Tag style={{ fontSize: 10, margin: 0 }}>{f.fuelType}</Tag> {dayjs(f.date).format('DD.MM.YYYY')}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(f.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small" title={<span><ToolOutlined style={{ color: 'var(--brand-primary)', marginRight: 8 }} /> Son Bakımlar</span>}>
          {!data.recent.maintenance?.length ? <Empty description="Kayıt yok" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.recent.maintenance.map((m: any) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                  <span><b>{m.vehicle?.plate || m.vehicleId}</b> · <Tag style={{ fontSize: 10, margin: 0 }}>{m.type}</Tag> {dayjs(m.serviceDate).format('DD.MM.YYYY')}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(m.cost)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
