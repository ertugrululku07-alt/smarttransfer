'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button, Space, Typography, Drawer } from 'antd';
import { MenuOutlined, UserOutlined, CaretDownOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useBranding } from '../context/BrandingContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { localeLabels, supportedLocales, SupportedLocale } from '../locales';
import axios from 'axios';
import { API_URL, getImageUrl } from '@/lib/api-client';

const { Text } = Typography;


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
  const { locale, setLocale, t } = useLanguage();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuPages, setMenuPages] = useState<NavPage[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [currOpen, setCurrOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const currRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
      if (currRef.current && !currRef.current.contains(e.target as Node)) setCurrOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    if (combined.includes('CUSTOMER')) return '/account';

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

  const pillStyle: React.CSSProperties = {
    background: scrolled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.2s',
    userSelect: 'none' as const,
    position: 'relative' as const,
    whiteSpace: 'nowrap' as const,
  };

  return (
    <>
      <style>{`
        .tb-pill:hover { background: rgba(255,255,255,0.2) !important; border-color: rgba(255,255,255,0.35) !important; }
        .tb-dropdown { position: absolute; top: calc(100% + 8px); right: 0; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; min-width: 150px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5); z-index: 9999; animation: tbDropFade 0.15s ease; }
        .tb-dropdown-item { padding: 10px 16px; color: rgba(255,255,255,0.75); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.15s; }
        .tb-dropdown-item:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .tb-dropdown-item.tb-active { color: ${theme.sectionAccent}; font-weight: 700; }
        @keyframes tbDropFade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div
        style={{
          width: '100%',
          padding: scrolled ? '10px 32px' : '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: scrolled ? 'rgba(15,23,42,0.97)' : 'transparent',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
          color: 'white',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          transition: 'all 0.4s ease',
          boxShadow: scrolled ? '0 4px 24px rgba(0,0,0,0.25)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
      >
        {/* Logo + Desktop Navigation grouped on the left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 20,
              letterSpacing: '-0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
            onClick={() => router.push('/')}
          >
            {branding.logoUrl ? (
              <img
                src={getImageUrl(branding.logoVariants?.header || branding.logoUrl)}
                alt={fullName}
                style={{ height: 44, maxWidth: 200, objectFit: 'contain' }}
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

          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="topbar-nav-desktop">
            <a href="/" style={navLinkStyle}>{t('nav.home')}</a>
            {menuPages.map(page => (
              <a key={page.slug} href={`/sayfa/${page.slug}`} style={navLinkStyle}>
                {page.title}
              </a>
            ))}
            <a href="/track" style={navLinkStyle}>Rezervasyon Sorgula</a>
            <a href="/contact" style={navLinkStyle}>İletişim</a>
          </nav>
        </div>

        {/* Right Side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(!authLoading && !currencyLoading) && (
            <>
              {/* Language Pill */}
              <div ref={langRef} style={{ position: 'relative' }}>
                <div className="tb-pill" style={pillStyle} onClick={() => { setLangOpen(o => !o); setCurrOpen(false); }}>
                  <span>{localeLabels[locale]?.flag}</span>
                  <span>{locale.toUpperCase()}</span>
                  <CaretDownOutlined style={{ fontSize: 10, opacity: 0.7, transform: langOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
                {langOpen && (
                  <div className="tb-dropdown">
                    {supportedLocales.map(lc => (
                      <div
                        key={lc}
                        className={`tb-dropdown-item${locale === lc ? ' tb-active' : ''}`}
                        onClick={() => { setLocale(lc); setLangOpen(false); }}
                      >
                        <span>{localeLabels[lc].flag}</span>
                        <span>{localeLabels[lc].label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Currency Pill */}
              {currencies.length > 0 && (
                <div ref={currRef} style={{ position: 'relative' }}>
                  <div className="tb-pill" style={pillStyle} onClick={() => { setCurrOpen(o => !o); setLangOpen(false); }}>
                    <span>{currencies.find(c => c.code === selectedCurrency)?.symbol || selectedCurrency}</span>
                    <span>{selectedCurrency}</span>
                    <CaretDownOutlined style={{ fontSize: 10, opacity: 0.7, transform: currOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                  {currOpen && (
                    <div className="tb-dropdown">
                      {currencies.map(c => (
                        <div
                          key={c.code}
                          className={`tb-dropdown-item${selectedCurrency === c.code ? ' tb-active' : ''}`}
                          onClick={() => { setCurrency(c.code); setCurrOpen(false); }}
                        >
                          <span style={{ fontWeight: 700, width: 20, textAlign: 'center' }}>{c.symbol}</span>
                          <span>{c.code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                    {t('nav.logout')}
                  </Button>
                </Space>
              ) : (
                <Space size="small" className="topbar-auth-desktop">
                  <Button
                    size="small"
                    onClick={() => router.push('/register')}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.3)',
                      color: '#fff',
                      fontWeight: 600,
                      borderRadius: 6,
                      fontSize: 13,
                      padding: '0 14px',
                    }}
                  >
                    {t('nav.register')}
                  </Button>
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
                    {t('nav.login')}
                  </Button>
                </Space>
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
          <a href="/" style={{ padding: '10px 0', color: '#333', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>{t('nav.home')}</a>
          {menuPages.map(page => (
            <a
              key={page.slug}
              href={`/sayfa/${page.slug}`}
              style={{ padding: '10px 0', color: '#333', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}
            >
              {page.title}
            </a>
          ))}
          <a href="/track" style={{ padding: '10px 0', color: '#333', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>Rezervasyon Sorgula</a>
          <a href="/contact" style={{ padding: '10px 0', color: '#333', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>İletişim</a>

          {/* Mobile Language Selector */}
          <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
            <select
              value={locale}
              onChange={e => setLocale(e.target.value as SupportedLocale)}
              style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, padding: '0 12px', background: '#fff', color: '#111827' }}
            >
              {supportedLocales.map(lc => (
                <option key={lc} value={lc}>{localeLabels[lc].flag} {localeLabels[lc].label}</option>
              ))}
            </select>
          </div>

          {/* Mobile auth actions */}
          {!authLoading && !user && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button
                block
                onClick={() => { setMobileMenuOpen(false); router.push('/register'); }}
                style={{ height: 44, borderRadius: 10, fontWeight: 600 }}
              >
                {t('nav.register')}
              </Button>
              <Button
                type="primary"
                block
                onClick={() => { setMobileMenuOpen(false); router.push('/login'); }}
                style={{
                  height: 44, borderRadius: 10, fontWeight: 600,
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: 'none',
                }}
              >
                {t('nav.login')}
              </Button>
            </div>
          )}
          {!authLoading && user && panelRoute && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button
                type="primary"
                block
                onClick={() => { setMobileMenuOpen(false); router.push(panelRoute); }}
                style={{ height: 44, borderRadius: 10, fontWeight: 600 }}
              >
                {t('nav.goToPanel')}
              </Button>
              <Button
                danger
                block
                onClick={() => { setMobileMenuOpen(false); handleLogoutClick(); }}
                style={{ height: 44, borderRadius: 10, fontWeight: 600 }}
              >
                {t('nav.logout')}
              </Button>
            </div>
          )}
        </div>
      </Drawer>

      {/* Responsive CSS */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .topbar-nav-desktop { display: none !important; }
          .topbar-user-desktop { display: none !important; }
          .topbar-auth-desktop { display: none !important; }
          .topbar-mobile-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
};

export default TopBar;
