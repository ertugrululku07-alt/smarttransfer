'use client';

import React, { useState, useEffect } from 'react';
import { Button, Space, Typography, Select, Drawer } from 'antd';
import { MenuOutlined, UserOutlined, PhoneOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useBranding } from '../context/BrandingContext';
import { useTheme } from '../context/ThemeContext';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

interface NavPage {
  title: string;
  slug: string;
  menuOrder: number;
}

const TopBar: React.FC = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const { currencies, selectedCurrency, setCurrency, loading: currencyLoading } = useCurrency();
  const { branding, fullName } = useBranding();
  const { theme } = useTheme();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuPages, setMenuPages] = useState<NavPage[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/pages`, {
          headers: { 'X-Tenant-Slug': TENANT_SLUG }
        });
        if (res.data.success) {
          const pages = res.data.data.pages
            .filter((p: any) => p.showInMenu)
            .sort((a: any, b: any) => (a.menuOrder || 0) - (b.menuOrder || 0));
          setMenuPages(pages);
        }
      } catch (e) {
        // Silently fail - pages are optional
      }
    };
    fetchPages();
  }, []);

  const handleLoginClick = () => router.push('/login');

  const handleLogoutClick = () => {
    logout();
    router.push('/');
  };

  // Kullanıcı giriş yapmışsa panele gönder
  const getPanelRoute = () => {
    if (!user) return null;
    const type = (user.role?.type || '').toUpperCase();
    const code = (user.role?.code || '').toUpperCase();
    const combined = type + ' ' + code;

    if (combined.includes('AGENCY')) return '/agency';
    if (combined.includes('PARTNER')) return '/partner';
    if (combined.includes('DRIVER')) return '/driver';

    // Admin, SUPER_ADMIN, TENANT_ADMIN, PLATFORM_OPS, Staff vs. → hepsini /admin'e gönder
    return '/admin';
  };

  const panelRoute = getPanelRoute();

  const navLinkStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.85)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 6,
    transition: 'all 0.2s',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <>
      <div
        style={{
          width: '100%',
          padding: scrolled ? '10px 32px' : '14px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: scrolled ? 'rgba(15, 23, 42, 0.97)' : 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          color: 'white',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          transition: 'all 0.3s ease',
          boxShadow: scrolled ? '0 4px 20px rgba(0,0,0,0.15)' : 'none',
          borderBottom: scrolled ? 'none' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 20,
            letterSpacing: '-0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={() => router.push('/')}
        >
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={fullName}
              style={{ maxHeight: 36, maxWidth: 160, objectFit: 'contain' }}
            />
          ) : (
            <>
              <span style={{
                color: theme.primaryColor,
                fontWeight: 800,
                fontSize: 22,
              }}>{branding.siteNameHighlight}</span>
              <span style={{ fontWeight: 600, color: '#fff', fontSize: 22 }}>{branding.siteName}</span>
            </>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
          className="topbar-nav-desktop"
        >
          <a href="/" style={navLinkStyle}>Ana Sayfa</a>
          {menuPages.map(page => (
            <a
              key={page.slug}
              href={`/sayfa/${page.slug}`}
              style={navLinkStyle}
            >
              {page.title}
            </a>
          ))}
        </nav>

        {/* Right Side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(!authLoading && !currencyLoading) && (
            <>
              {currencies.length > 0 && (
                <Select
                  value={selectedCurrency}
                  onChange={setCurrency}
                  style={{ width: 100, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '6px' }}
                  size="small"
                  variant="borderless"
                  styles={{ popup: { root: { zIndex: 9999, minWidth: 120 } } }}
                  optionLabelProp="label"
                >
                  {currencies.map(c => (
                    <Option
                      key={c.code}
                      value={c.code}
                      label={<span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.symbol} {c.code}</span>}
                    >
                      <Space>
                        <span style={{ fontWeight: 'bold' }}>{c.symbol}</span>
                        <span>{c.code}</span>
                      </Space>
                    </Option>
                  ))}
                </Select>
              )}

              {user ? (
                <Space size="small" className="topbar-user-desktop">
                  <span
                    onClick={() => panelRoute && router.push(panelRoute)}
                    style={{
                      color: 'rgba(255,255,255,0.9)',
                      cursor: panelRoute ? 'pointer' : 'default',
                      userSelect: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <UserOutlined style={{ marginRight: 4 }} />
                    {user.fullName || user.email}
                  </span>
                  <Button
                    size="small"
                    danger
                    onClick={handleLogoutClick}
                    style={{ fontSize: 12 }}
                  >
                    Çıkış
                  </Button>
                </Space>
              ) : (
                <Button
                  size="small"
                  onClick={handleLoginClick}
                  style={{
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    borderRadius: 6,
                    fontSize: 13,
                    padding: '0 16px',
                  }}
                >
                  Giriş Yap
                </Button>
              )}
            </>
          )}

          {/* Mobile Menu Button */}
          <Button
            type="text"
            icon={<MenuOutlined style={{ color: '#fff', fontSize: 18 }} />}
            onClick={() => setMobileMenuOpen(true)}
            className="topbar-mobile-btn"
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Mobile Drawer */}
      <Drawer
        title={fullName}
        placement="right"
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        size="default"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a href="/" style={{ padding: '10px 0', color: '#333', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>Ana Sayfa</a>
          {menuPages.map(page => (
            <a
              key={page.slug}
              href={`/sayfa/${page.slug}`}
              style={{ padding: '10px 0', color: '#333', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}
            >
              {page.title}
            </a>
          ))}
        </div>
      </Drawer>

      {/* Responsive CSS */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .topbar-nav-desktop { display: none !important; }
          .topbar-user-desktop { display: none !important; }
          .topbar-mobile-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
};

export default TopBar;
