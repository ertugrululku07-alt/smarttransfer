'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { getImageUrl } from '@/lib/api-client';
import apiClient from '@/lib/api-client';
import {
  HomeOutlined,
  CarOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  PlusCircleOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
  UserOutlined,
  GlobalOutlined,
  CompassOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  exact?: boolean;
  section: 'main' | 'fleet' | 'finance' | 'system';
  badge?: number;
}

const NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  { key: 'home',         label: 'Dashboard',        icon: <HomeOutlined />,            path: '/partner',               exact: true, section: 'main'    },
  { key: 'pool',         label: 'Transferlerim',     icon: <AppstoreOutlined />,        path: '/partner/pool',                       section: 'main'    },
  { key: 'dispatch',     label: 'Canlı Takip',       icon: <CompassOutlined />,         path: '/partner/dispatch',                   section: 'main'    },
  { key: 'new-booking',  label: 'Yeni İş Ekle',      icon: <PlusCircleOutlined />,      path: '/partner/bookings/new',               section: 'main'    },
  { key: 'marketplace',  label: 'Pazar Yeri',        icon: <GlobalOutlined />,          path: '/partner/marketplace',                section: 'main'    },
  { key: 'completed',    label: 'Tamamlanmış',       icon: <CheckCircleOutlined />,     path: '/partner/completed',                  section: 'main'    },
  { key: 'vehicles',     label: 'Araçlarım',         icon: <CarOutlined />,             path: '/partner/fleet/vehicles',             section: 'fleet'   },
  { key: 'drivers',      label: 'Sürücülerim',       icon: <UserOutlined />,            path: '/partner/fleet/drivers',              section: 'fleet'   },
  { key: 'zones',        label: 'Bölgeler & Fiyat',  icon: <EnvironmentOutlined />,     path: '/partner/zones',                      section: 'fleet'   },
  { key: 'uetds',        label: 'UETDS',             icon: <SafetyCertificateOutlined />,path: '/partner/uetds',                     section: 'fleet'   },
  { key: 'finance',      label: 'Muhasebe',          icon: <WalletOutlined />,          path: '/partner/finance',                    section: 'finance' },
  { key: 'earnings',     label: 'Kazancım',          icon: <DollarOutlined />,          path: '/partner/earnings',                   section: 'finance' },
  { key: 'settings',     label: 'Ayarlar',           icon: <SettingOutlined />,         path: '/partner/settings',                   section: 'system'  },
];

const BOTTOM_NAV_KEYS = ['home', 'pool', 'drivers', 'finance', 'settings'];

const SECTION_LABELS: Record<string, string> = {
  main:    'Operasyon',
  fleet:   'Filom & İşletme',
  finance: 'Finans',
  system:  'Sistem',
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { branding } = useBranding();

  useEffect(() => {
    apiClient.get('/api/transfer/partner/active-bookings')
      .then(r => { if (r.data?.success) setActiveCount(r.data.data?.length ?? 0); })
      .catch(() => {});
  }, [pathname]);

  const navItems: NavItem[] = NAV_ITEMS.map(item =>
    item.key === 'pool' ? { ...item, badge: activeCount || undefined } : item
  );

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : Boolean(pathname?.startsWith(path));

  const go = (path: string) => { router.push(path); setOpen(false); };

  const handleLogout = () => { logout(); router.push('/login'); };

  const initials = user
    ? (`${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`).toUpperCase() || 'P'
    : 'P';

  const logoSrc = getImageUrl(branding.logoVariants?.header) || getImageUrl(branding.logoUrl);
  const companyName = branding.companyName || branding.siteName || 'Partner';
  const companyInitial = companyName[0]?.toUpperCase() || 'P';

  const sections = ['main', 'fleet', 'finance', 'system'] as const;

  return (
    <div className="partner-root">
      {/* ── Mobile header ────────────────────────────────── */}
      <header className="ps-mobile-header">
        <button type="button" className="ps-mobile-header__btn" onClick={() => setOpen(o => !o)} aria-label="Menü">
          {open ? <CloseOutlined /> : <MenuOutlined />}
        </button>
        <span className="ps-mobile-header__title">{companyName}</span>
        <div className="ps-user__avatar" style={{ fontSize: 11 }}>{initials}</div>
      </header>

      {/* ── Overlay ──────────────────────────────────────── */}
      <div className={`ps-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden />

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className={`ps-sidebar${open ? ' open' : ''}`}>
        <div className="ps-sidebar__inner">
          {/* Brand */}
          <div className="ps-brand">
            <div className="ps-brand__row">
              {logoSrc
                ? <img src={logoSrc} alt="" className="ps-brand__logo" />
                : <div className="ps-brand__monogram">{companyInitial}</div>
              }
              <div>
                <div className="ps-brand__name">{companyName}</div>
                <div className="ps-brand__tag">Partner Paneli</div>
              </div>
            </div>
          </div>

          {/* User */}
          <div className="ps-user">
            <div className="ps-user__avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="ps-user__name">{user?.firstName} {user?.lastName}</div>
              <div className="ps-user__role">Partner</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="ps-nav">
            {sections.map(section => {
              const items = navItems.filter(i => i.section === section);
              if (!items.length) return null;
              return (
                <div key={section}>
                  <div className="ps-nav__group-label">{SECTION_LABELS[section]}</div>
                  {items.map(item => {
                    const active = isActive(item.path, item.exact);
                    return (
                      <div
                        key={item.key}
                        role="button"
                        tabIndex={0}
                        className={`ps-nav__item${active ? ' ps-nav__item--active' : ''}`}
                        onClick={() => go(item.path)}
                        onKeyDown={e => e.key === 'Enter' && go(item.path)}
                      >
                        <span className="ps-nav__icon">{item.icon}</span>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="ps-nav__badge">{item.badge}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Logout */}
          <button type="button" className="ps-logout" onClick={handleLogout}>
            <LogoutOutlined style={{ fontSize: 16 }} />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="ps-content">
        <main className="ps-page">
          {children}
        </main>
      </div>

      {/* ── Bottom navigation ─────────────────────────────── */}
      <nav className="ps-bottom-nav" aria-label="Hızlı menü">
        {navItems
          .filter(i => BOTTOM_NAV_KEYS.includes(i.key))
          .map(item => {
            const active = isActive(item.path, item.exact);
            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                className={`ps-bottom-nav__item${active ? ' ps-bottom-nav__item--active' : ''}`}
                onClick={() => go(item.path)}
                onKeyDown={e => e.key === 'Enter' && go(item.path)}
              >
                <span className="ps-bottom-nav__icon">{item.icon}</span>
                <span>{item.label.split(' ')[0]}</span>
              </div>
            );
          })}
      </nav>
    </div>
  );
}
