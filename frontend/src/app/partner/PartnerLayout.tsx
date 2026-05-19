'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import apiClient from '@/lib/api-client';
import { getImageUrl } from '@/lib/api-client';
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
} from '@ant-design/icons';

interface PartnerLayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  exact?: boolean;
  section: 'main' | 'fleet' | 'finance' | 'system';
  badge?: number;
};

const PartnerLayout: React.FC<PartnerLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { branding } = useBranding();
  const { user, logout } = useAuth();
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await apiClient.get('/api/transfer/partner/active-bookings');
        if (res.data?.success) setActiveCount(res.data.data?.length ?? 0);
      } catch {
        /* ignore */
      }
    };
    fetchCount();
  }, [pathname]);

  const toggleSidebar = () => setIsSidebarOpen((o) => !o);
  const closeSidebar = () => setIsSidebarOpen(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems: NavItem[] = [
    { key: 'home', label: 'Ana Sayfa', icon: <HomeOutlined />, path: '/partner', exact: true, section: 'main' },
    {
      key: 'pool',
      label: 'Transferlerim',
      icon: <CarOutlined />,
      path: '/partner/pool',
      badge: activeCount > 0 ? activeCount : undefined,
      section: 'main',
    },
    { key: 'dispatch', label: 'Canlı Takip', icon: <CompassOutlined />, path: '/partner/dispatch', section: 'main' },
    { key: 'new-booking', label: 'Yeni İş Ekle', icon: <PlusCircleOutlined />, path: '/partner/bookings/new', section: 'main' },
    { key: 'marketplace', label: 'Pazar Yeri', icon: <GlobalOutlined />, path: '/partner/marketplace', section: 'main' },
    { key: 'completed', label: 'Tamamlanmış', icon: <CheckCircleOutlined />, path: '/partner/completed', section: 'main' },
    { key: 'fleet-vehicles', label: 'Araçlarım', icon: <CarOutlined />, path: '/partner/fleet/vehicles', section: 'fleet' },
    { key: 'fleet-drivers', label: 'Sürücülerim', icon: <UserOutlined />, path: '/partner/fleet/drivers', section: 'fleet' },
    { key: 'zones', label: 'Bölgeler & Fiyat', icon: <EnvironmentOutlined />, path: '/partner/zones', section: 'fleet' },
    { key: 'uetds', label: 'UETDS', icon: <SafetyCertificateOutlined />, path: '/partner/uetds', section: 'fleet' },
    { key: 'finance', label: 'Muhasebe', icon: <WalletOutlined />, path: '/partner/finance', section: 'finance' },
    { key: 'earnings', label: 'Kazancım', icon: <DollarOutlined />, path: '/partner/earnings', section: 'finance' },
    { key: 'settings', label: 'Ayarlar', icon: <SettingOutlined />, path: '/partner/settings', section: 'system' },
  ];

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return Boolean(pathname?.startsWith(path));
  };

  const navigateTo = (path: string) => {
    router.push(path);
    closeSidebar();
  };

  const userInitials = user
    ? `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase() || 'P'
    : 'P';

  const logoSrc =
    getImageUrl(branding.logoVariants?.header) ||
    getImageUrl(branding.logoUrl) ||
    getImageUrl(branding.faviconUrl);

  const companyInitial = (branding.companyName || branding.siteName || 'P')[0]?.toUpperCase() || 'P';

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path, item.exact);
    return (
      <div
        key={item.key}
        role="button"
        tabIndex={0}
        onClick={() => navigateTo(item.path)}
        onKeyDown={(e) => e.key === 'Enter' && navigateTo(item.path)}
        className={`partner-nav-item${active ? ' partner-nav-item--active' : ''}`}
      >
        <span className="partner-nav-icon">{item.icon}</span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge != null && item.badge > 0 && <span className="partner-nav-badge">{item.badge}</span>}
      </div>
    );
  };

  const mobileNavKeys = ['home', 'pool', 'earnings', 'settings'];

  return (
    <div className="partner-shell">
      <header className="partner-mobile-bar">
        <button type="button" className="partner-mobile-toggle" onClick={toggleSidebar} aria-label="Menü">
          {isSidebarOpen ? <CloseOutlined /> : <MenuOutlined />}
        </button>
        <div className="partner-brand-row">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="partner-brand-logo" style={{ width: 32, height: 32 }} />
          ) : (
            <span className="partner-brand-fallback" style={{ width: 32, height: 32, fontSize: 14 }}>
              {companyInitial}
            </span>
          )}
          <span className="partner-brand-title" style={{ fontSize: 15 }}>
            {branding.companyName || 'Partner'}
          </span>
        </div>
        <span className="partner-user-avatar" style={{ width: 36, height: 36, fontSize: 12 }}>
          {userInitials}
        </span>
      </header>

      <div
        className={`partner-overlay${isSidebarOpen ? ' open' : ''}`}
        onClick={closeSidebar}
        aria-hidden={!isSidebarOpen}
      />

      <aside className={`partner-sidebar${isSidebarOpen ? ' open' : ''}`}>
        <div className="partner-brand">
          <div className="partner-brand-row">
            {logoSrc ? (
              <img src={logoSrc} alt={branding.companyName} className="partner-brand-logo" />
            ) : (
              <span className="partner-brand-fallback">{companyInitial}</span>
            )}
            <div>
              <div className="partner-brand-title">{branding.companyName || 'Partner Panel'}</div>
              <div className="partner-brand-sub">Operasyon merkezi</div>
            </div>
          </div>
        </div>

        <div className="partner-user-card">
          <span className="partner-user-avatar">{userInitials}</span>
          <div style={{ minWidth: 0 }}>
            <div className="partner-user-name">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="partner-user-role">Partner</div>
          </div>
        </div>

        <nav className="partner-nav">
          <div className="partner-nav-label">Menü</div>
          {navItems.filter((i) => i.section === 'main').map(renderNavItem)}

          <div className="partner-nav-label">Filom & İşletme</div>
          {navItems.filter((i) => i.section === 'fleet').map(renderNavItem)}

          <div className="partner-nav-label">Finans</div>
          {navItems.filter((i) => i.section === 'finance').map(renderNavItem)}

          <div className="partner-nav-label">Sistem</div>
          {navItems.filter((i) => i.section === 'system').map(renderNavItem)}
        </nav>

        <button type="button" className="partner-logout" onClick={handleLogout}>
          <LogoutOutlined />
          Çıkış Yap
        </button>
      </aside>

      <main className="partner-main">{children}</main>

      <nav className="partner-mobile-bottom" aria-label="Hızlı menü">
        {navItems
          .filter((i) => mobileNavKeys.includes(i.key))
          .map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                className={`partner-mobile-nav-item${active ? ' partner-mobile-nav-item--active' : ''}`}
                onClick={() => navigateTo(item.path)}
                onKeyDown={(e) => e.key === 'Enter' && navigateTo(item.path)}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span>{item.label.split(' ')[0]}</span>
              </div>
            );
          })}
      </nav>
    </div>
  );
};

export default PartnerLayout;
