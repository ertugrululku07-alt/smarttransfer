'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppstoreOutlined,
  BankOutlined,
  FileTextOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
  CalendarOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  PieChartOutlined,
} from '@ant-design/icons';

type NavItem = { key: string; label: string; href: string; icon: React.ReactNode };

const NAV: NavItem[] = [
  { key: 'dashboard',   label: 'Genel Durum',          href: '/partner/finance',              icon: <AppstoreOutlined /> },
  { key: 'accounts',    label: 'Cariler',              href: '/partner/finance/accounts',     icon: <BankOutlined /> },
  { key: 'invoices',    label: 'Faturalar',            href: '/partner/finance/invoices',     icon: <FileTextOutlined /> },
  { key: 'cash',        label: 'Kasa & Banka',         href: '/partner/finance/cash',         icon: <WalletOutlined /> },
  { key: 'collections', label: 'Şoför Tahsilatları',   href: '/partner/finance/collections',  icon: <DollarOutlined /> },
  { key: 'employees',   label: 'Personel',             href: '/partner/finance/employees',    icon: <TeamOutlined /> },
  { key: 'payroll',     label: 'Hakediş & Maaş',       href: '/partner/finance/payroll',      icon: <UserOutlined /> },
  { key: 'leaves',      label: 'İzinler',              href: '/partner/finance/leaves',       icon: <CalendarOutlined /> },
  { key: 'timesheets',  label: 'Puantaj',              href: '/partner/finance/timesheets',   icon: <ClockCircleOutlined /> },
  { key: 'budgets',     label: 'Bütçe',                href: '/partner/finance/budgets',      icon: <PieChartOutlined /> },
  { key: 'reports',     label: 'Raporlar',             href: '/partner/finance/reports',      icon: <BarChartOutlined /> },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';

  const isActive = (href: string) => {
    if (href === '/partner/finance') return pathname === '/partner/finance';
    return pathname.startsWith(href);
  };

  return (
    <div className="partner-page" style={{ paddingTop: 0 }}>
      <style jsx global>{`
        .pa-shell { display: grid; grid-template-columns: 240px 1fr; gap: 18px; }
        @media (max-width: 992px) { .pa-shell { grid-template-columns: 1fr; } }
        .pa-side { background:#0f172a; color:#fff; border-radius: 16px; padding: 18px 12px; height: fit-content; position: sticky; top: 12px; }
        .pa-side h3 { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.55); margin: 0 12px 12px; letter-spacing: 0.4px; text-transform: uppercase; }
        .pa-side .pa-nav { display:flex; flex-direction:column; gap:2px; }
        .pa-side a { display:flex; align-items:center; gap:10px; padding: 10px 12px; border-radius: 10px; color: rgba(255,255,255,0.7); text-decoration:none; font-size: 13.5px; font-weight: 500; transition: all 0.15s ease; }
        .pa-side a:hover { background: rgba(255,255,255,0.06); color:#fff; }
        .pa-side a.active { background: linear-gradient(135deg, var(--brand-primary-18), var(--brand-primary-08)); color: #fff; box-shadow: inset 3px 0 0 var(--brand-primary); }
        .pa-side a .pa-ic { font-size: 16px; opacity: 0.9; }
        .pa-content { min-width: 0; }
        @media (max-width: 992px) {
          .pa-side { position: relative; top: 0; padding: 12px; }
          .pa-side .pa-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px; }
        }
      `}</style>

      <div className="ps-page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="ps-page-header__title">
            <SafetyCertificateOutlined style={{ color: 'var(--brand-primary)', marginRight: 8 }} />
            Muhasebe & Finans
          </h1>
          <p className="ps-page-header__subtitle">
            Cari hesaplar, faturalar, kasa, şoför tahsilatları, personel hakediş ve izin yönetimi — tek panelden
          </p>
        </div>
      </div>

      <div className="pa-shell">
        <aside className="pa-side">
          <h3>Modüller</h3>
          <nav className="pa-nav">
            {NAV.map((item) => (
              <Link key={item.key} href={item.href} className={isActive(item.href) ? 'active' : ''}>
                <span className="pa-ic">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="pa-content">{children}</div>
      </div>
    </div>
  );
}
