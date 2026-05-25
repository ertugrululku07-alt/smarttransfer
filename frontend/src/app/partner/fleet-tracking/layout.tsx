'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from 'antd';
import {
  AppstoreOutlined, SafetyOutlined, FireOutlined, AuditOutlined, ToolOutlined, CarOutlined,
  BarChartOutlined, AimOutlined, BorderOutlined, FileTextOutlined, TrophyOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const NAV = [
  { key: 'dashboard',  label: 'Genel Durum',   href: '/partner/fleet-tracking',             icon: <AppstoreOutlined />, alertKey: null },
  { key: 'insurance',  label: 'Sigorta Takibi', href: '/partner/fleet-tracking/insurance',  icon: <SafetyOutlined />,   alertKey: 'insurance' },
  { key: 'fuel',       label: 'Yakıt Giderleri', href: '/partner/fleet-tracking/fuel',      icon: <FireOutlined />,     alertKey: null },
  { key: 'inspection', label: 'Araç Muayene',  href: '/partner/fleet-tracking/inspection',  icon: <AuditOutlined />,    alertKey: 'inspection' },
  { key: 'maintenance',label: 'Bakım & Onarım', href: '/partner/fleet-tracking/maintenance', icon: <ToolOutlined />,    alertKey: 'maintenance' },
  { key: 'live',       label: 'Canlı Takip (GPS)', href: '/partner/fleet-tracking/live',     icon: <AimOutlined />,      alertKey: null },
  { key: 'geofences',  label: 'Geofence Alarmları', href: '/partner/fleet-tracking/geofences', icon: <BorderOutlined />,  alertKey: 'geofence' },
  { key: 'reports',    label: 'Sürüş Raporları',    href: '/partner/fleet-tracking/reports',   icon: <FileTextOutlined />, alertKey: null },
  { key: 'behavior',   label: 'Davranış Skoru',     href: '/partner/fleet-tracking/behavior',  icon: <TrophyOutlined />,   alertKey: null },
  { key: 'analytics',  label: 'Maliyet Analizi',  href: '/partner/fleet-tracking/analytics', icon: <BarChartOutlined />, alertKey: null },
];

export default function FleetTrackingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const [alerts, setAlerts] = useState<{ insurance: number; inspection: number; maintenance: number; geofence: number }>({ insurance: 0, inspection: 0, maintenance: 0, geofence: 0 });

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/partner-fleet/dashboard'),
      apiClient.get('/api/partner-fleet/geofences/summary'),
    ]).then(([dash, geo]) => {
      if (dash.data?.success) {
        const k = dash.data.data.kpis;
        setAlerts((prev) => ({
          ...prev,
          insurance: (k.insurancesExpiringSoonCount || 0) + (k.insurancesExpiredCount || 0),
          inspection: (k.inspectionsExpiringSoonCount || 0) + (k.inspectionsExpiredCount || 0),
          maintenance: (k.upcomingMaintenanceCount || 0) + (k.kmOverdueCount || 0),
        }));
      }
      if (geo.data?.success) {
        setAlerts((prev) => ({ ...prev, geofence: geo.data.data.recentViolations || 0 }));
      }
    }).catch(() => {});
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/partner/fleet-tracking') return pathname === '/partner/fleet-tracking';
    return pathname.startsWith(href);
  };

  return (
    <div className="partner-page" style={{ paddingTop: 0 }}>
      <style jsx global>{`
        .ft-shell { display: grid; grid-template-columns: 240px 1fr; gap: 18px; }
        @media (max-width: 992px) { .ft-shell { grid-template-columns: 1fr; } }
        .ft-side { background:#0f172a; color:#fff; border-radius: 16px; padding: 18px 12px; height: fit-content; position: sticky; top: 12px; }
        .ft-side h3 { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.55); margin: 0 12px 12px; letter-spacing: 0.4px; text-transform: uppercase; }
        .ft-side .ft-nav { display:flex; flex-direction:column; gap:2px; }
        .ft-side a { display:flex; align-items:center; gap:10px; padding: 10px 12px; border-radius: 10px; color: rgba(255,255,255,0.7); text-decoration:none; font-size: 13.5px; font-weight: 500; transition: all 0.15s ease; }
        .ft-side a:hover { background: rgba(255,255,255,0.06); color:#fff; }
        .ft-side a.active { background: linear-gradient(135deg, var(--brand-primary-18), var(--brand-primary-08)); color: #fff; box-shadow: inset 3px 0 0 var(--brand-primary); }
        .ft-side a .ft-ic { font-size: 16px; opacity: 0.9; }
      `}</style>

      <div className="ps-page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="ps-page-header__title">
            <CarOutlined style={{ color: 'var(--brand-primary)', marginRight: 8 }} />
            Araç Takip
          </h1>
          <p className="ps-page-header__subtitle">
            Sigorta · muayene · bakım · yakıt — vade hatırlatmaları ile filo yönetimi
          </p>
        </div>
      </div>

      <div className="ft-shell">
        <aside className="ft-side">
          <h3>Modüller</h3>
          <nav className="ft-nav">
            {NAV.map((item) => {
              const count = item.alertKey ? (alerts as any)[item.alertKey] : 0;
              return (
                <Link key={item.key} href={item.href} className={isActive(item.href) ? 'active' : ''}>
                  <span className="ft-ic">{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {count > 0 && <Badge count={count} style={{ background: '#ef4444' }} />}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
