'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import axios from 'axios';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

export interface SiteTheme {
  key: string;
  name: string;
  heroGradient: string;
  heroOverlay: string;
  primaryColor: string;
  accentColor: string;
  buttonGradient: string;
  buttonShadow: string;
  searchCardBg: string;
  searchCardBorder: string;
  sectionAccent: string;
  statsGradient: string;
  ctaGradient: string;
  stepCircleGradient: string;
  featureBg: string;
  testimonialBg: string;
  navBg: string;
  footerBg: string;
  labelColor: string;
  heroTitle: string;
  heroSubtitle: string;
  decorationEmoji?: string;
  decorationCss?: string;
}

export const THEMES: Record<string, SiteTheme> = {
  default: {
    key: 'default',
    name: 'Varsayılan',
    heroGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    heroOverlay: 'rgba(0,0,0,0.45)',
    primaryColor: '#667eea',
    accentColor: '#764ba2',
    buttonGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    buttonShadow: '0 8px 25px rgba(102,126,234,0.4)',
    searchCardBg: 'rgba(255,255,255,0.95)',
    searchCardBorder: '1px solid rgba(255,255,255,0.3)',
    sectionAccent: '#667eea',
    statsGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    ctaGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    stepCircleGradient: 'linear-gradient(135deg, #667eea, #764ba2)',
    featureBg: 'linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)',
    testimonialBg: 'linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)',
    navBg: 'rgba(15, 23, 42, 0.95)',
    footerBg: '#0f172a',
    labelColor: '#334155',
    heroTitle: 'Güvenilir Transfer Hizmeti',
    heroSubtitle: 'Havalimanı transferinden şehirler arası ulaşıma, konforlu ve güvenli yolculuk',
  },
  newyear: {
    key: 'newyear',
    name: 'Yılbaşı',
    heroGradient: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 40%, #b91c1c 100%)',
    heroOverlay: 'rgba(26,10,46,0.55)',
    primaryColor: '#dc2626',
    accentColor: '#f59e0b',
    buttonGradient: 'linear-gradient(135deg, #dc2626 0%, #f59e0b 100%)',
    buttonShadow: '0 8px 25px rgba(220,38,38,0.4)',
    searchCardBg: 'rgba(255,255,255,0.92)',
    searchCardBorder: '1px solid rgba(245,158,11,0.3)',
    sectionAccent: '#dc2626',
    statsGradient: 'linear-gradient(135deg, #dc2626 0%, #9f1239 100%)',
    ctaGradient: 'linear-gradient(135deg, #dc2626 0%, #f59e0b 100%)',
    stepCircleGradient: 'linear-gradient(135deg, #dc2626, #f59e0b)',
    featureBg: 'linear-gradient(135deg, #fef2f2 0%, #fffbeb 100%)',
    testimonialBg: 'linear-gradient(135deg, #fef2f2 0%, #fefce8 100%)',
    navBg: 'rgba(26,10,46,0.95)',
    footerBg: '#1a0a2e',
    labelColor: '#7f1d1d',
    heroTitle: 'Yeni Yıla Özel Transfer',
    heroSubtitle: 'Yılbaşı kutlamalarına konforlu ve güvenli ulaşım',
    decorationEmoji: '✨',
    decorationCss: `
      @keyframes snowfall {
        0% { transform: translateY(-10vh) translateX(0) rotate(0deg); opacity: 1; }
        25% { transform: translateY(22vh) translateX(15px) rotate(90deg); opacity: 0.9; }
        50% { transform: translateY(50vh) translateX(-10px) rotate(180deg); opacity: 0.8; }
        75% { transform: translateY(75vh) translateX(20px) rotate(270deg); opacity: 0.6; }
        100% { transform: translateY(105vh) translateX(-5px) rotate(360deg); opacity: 0; }
      }
      .theme-snowflakes { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999; overflow: hidden; }
      .theme-snowflakes .sf {
        position: absolute; top: -20px; color: #fff; opacity: 0;
        animation: snowfall linear infinite;
        text-shadow: 0 0 4px rgba(255,255,255,0.6);
      }
      .theme-snowflakes .sf:nth-child(1)  { left: 3%;  font-size: 14px; animation-duration: 8s;  animation-delay: 0s;   opacity: 0.9; }
      .theme-snowflakes .sf:nth-child(2)  { left: 10%; font-size: 10px; animation-duration: 12s; animation-delay: 1s;   opacity: 0.7; }
      .theme-snowflakes .sf:nth-child(3)  { left: 18%; font-size: 16px; animation-duration: 9s;  animation-delay: 3s;   opacity: 0.8; }
      .theme-snowflakes .sf:nth-child(4)  { left: 25%; font-size: 8px;  animation-duration: 14s; animation-delay: 0.5s; opacity: 0.6; }
      .theme-snowflakes .sf:nth-child(5)  { left: 33%; font-size: 18px; animation-duration: 7s;  animation-delay: 2s;   opacity: 0.85; }
      .theme-snowflakes .sf:nth-child(6)  { left: 40%; font-size: 12px; animation-duration: 11s; animation-delay: 4s;   opacity: 0.7; }
      .theme-snowflakes .sf:nth-child(7)  { left: 48%; font-size: 20px; animation-duration: 10s; animation-delay: 1.5s; opacity: 0.75; }
      .theme-snowflakes .sf:nth-child(8)  { left: 55%; font-size: 9px;  animation-duration: 13s; animation-delay: 3.5s; opacity: 0.65; }
      .theme-snowflakes .sf:nth-child(9)  { left: 63%; font-size: 15px; animation-duration: 8.5s;animation-delay: 0.8s; opacity: 0.8; }
      .theme-snowflakes .sf:nth-child(10) { left: 70%; font-size: 11px; animation-duration: 15s; animation-delay: 2.5s; opacity: 0.6; }
      .theme-snowflakes .sf:nth-child(11) { left: 78%; font-size: 17px; animation-duration: 9.5s;animation-delay: 5s;   opacity: 0.85; }
      .theme-snowflakes .sf:nth-child(12) { left: 85%; font-size: 13px; animation-duration: 11.5s;animation-delay: 1.8s;opacity: 0.7; }
      .theme-snowflakes .sf:nth-child(13) { left: 92%; font-size: 10px; animation-duration: 10.5s;animation-delay: 4.2s;opacity: 0.65; }
      .theme-snowflakes .sf:nth-child(14) { left: 7%;  font-size: 19px; animation-duration: 7.5s;animation-delay: 6s;   opacity: 0.9; }
      .theme-snowflakes .sf:nth-child(15) { left: 52%; font-size: 8px;  animation-duration: 16s; animation-delay: 3.2s; opacity: 0.55; }
      .theme-snowflakes .sf:nth-child(16) { left: 96%; font-size: 14px; animation-duration: 9s;  animation-delay: 7s;   opacity: 0.7; }
      .theme-snowflakes .sf:nth-child(17) { left: 15%; font-size: 6px;  animation-duration: 18s; animation-delay: 2.8s; opacity: 0.5; }
      .theme-snowflakes .sf:nth-child(18) { left: 37%; font-size: 22px; animation-duration: 8s;  animation-delay: 5.5s; opacity: 0.8; }
      .theme-snowflakes .sf:nth-child(19) { left: 60%; font-size: 7px;  animation-duration: 14s; animation-delay: 6.5s; opacity: 0.6; }
      .theme-snowflakes .sf:nth-child(20) { left: 82%; font-size: 16px; animation-duration: 10s; animation-delay: 8s;   opacity: 0.75; }
    `,
  },
  autumn: {
    key: 'autumn',
    name: 'Sonbahar',
    heroGradient: 'linear-gradient(135deg, #451a03 0%, #78350f 40%, #c2410c 100%)',
    heroOverlay: 'rgba(69,26,3,0.5)',
    primaryColor: '#c2410c',
    accentColor: '#d97706',
    buttonGradient: 'linear-gradient(135deg, #c2410c 0%, #d97706 100%)',
    buttonShadow: '0 8px 25px rgba(194,65,12,0.4)',
    searchCardBg: 'rgba(255,255,255,0.93)',
    searchCardBorder: '1px solid rgba(217,119,6,0.25)',
    sectionAccent: '#c2410c',
    statsGradient: 'linear-gradient(135deg, #c2410c 0%, #92400e 100%)',
    ctaGradient: 'linear-gradient(135deg, #c2410c 0%, #d97706 100%)',
    stepCircleGradient: 'linear-gradient(135deg, #c2410c, #d97706)',
    featureBg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    testimonialBg: 'linear-gradient(135deg, #fff7ed 0%, #fefce8 100%)',
    navBg: 'rgba(69,26,3,0.95)',
    footerBg: '#451a03',
    labelColor: '#78350f',
    heroTitle: 'Sonbaharın Sıcaklığında Yolculuk',
    heroSubtitle: 'Altın yapraklar eşliğinde konforlu transfer deneyimi',
    decorationEmoji: '🍂',
    decorationCss: `
      @keyframes leaffall {
        0%   { transform: translateY(-10vh) translateX(0) rotate(0deg) scale(1); opacity: 0.9; }
        15%  { transform: translateY(10vh) translateX(25px) rotate(45deg) scale(0.95); }
        30%  { transform: translateY(25vh) translateX(-15px) rotate(110deg) scale(1.05); }
        50%  { transform: translateY(45vh) translateX(30px) rotate(180deg) scale(0.9); opacity: 0.75; }
        70%  { transform: translateY(65vh) translateX(-20px) rotate(260deg) scale(1); }
        85%  { transform: translateY(82vh) translateX(10px) rotate(310deg) scale(0.95); opacity: 0.5; }
        100% { transform: translateY(105vh) translateX(-5px) rotate(360deg) scale(0.9); opacity: 0; }
      }
      @keyframes leafsway {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(12px); }
      }
      .theme-leaves { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999; overflow: hidden; }
      .theme-leaves .lf {
        position: absolute; top: -30px; opacity: 0;
        animation: leaffall ease-in-out infinite;
        filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.15));
      }
      .theme-leaves .lf:nth-child(1)  { left: 5%;  font-size: 20px; animation-duration: 10s; animation-delay: 0s;   opacity: 0.85; }
      .theme-leaves .lf:nth-child(2)  { left: 12%; font-size: 16px; animation-duration: 13s; animation-delay: 1.5s; opacity: 0.7; }
      .theme-leaves .lf:nth-child(3)  { left: 20%; font-size: 22px; animation-duration: 9s;  animation-delay: 3s;   opacity: 0.8; }
      .theme-leaves .lf:nth-child(4)  { left: 28%; font-size: 14px; animation-duration: 15s; animation-delay: 0.8s; opacity: 0.6; }
      .theme-leaves .lf:nth-child(5)  { left: 35%; font-size: 24px; animation-duration: 8s;  animation-delay: 4s;   opacity: 0.85; }
      .theme-leaves .lf:nth-child(6)  { left: 43%; font-size: 18px; animation-duration: 12s; animation-delay: 2s;   opacity: 0.7; }
      .theme-leaves .lf:nth-child(7)  { left: 50%; font-size: 26px; animation-duration: 11s; animation-delay: 5.5s; opacity: 0.75; }
      .theme-leaves .lf:nth-child(8)  { left: 58%; font-size: 13px; animation-duration: 14s; animation-delay: 1s;   opacity: 0.6; }
      .theme-leaves .lf:nth-child(9)  { left: 65%; font-size: 20px; animation-duration: 9.5s;animation-delay: 3.5s; opacity: 0.8; }
      .theme-leaves .lf:nth-child(10) { left: 73%; font-size: 15px; animation-duration: 16s; animation-delay: 6s;   opacity: 0.55; }
      .theme-leaves .lf:nth-child(11) { left: 80%; font-size: 22px; animation-duration: 10s; animation-delay: 2.5s; opacity: 0.8; }
      .theme-leaves .lf:nth-child(12) { left: 88%; font-size: 17px; animation-duration: 13.5s;animation-delay: 7s;  opacity: 0.65; }
      .theme-leaves .lf:nth-child(13) { left: 95%; font-size: 19px; animation-duration: 11s; animation-delay: 4.5s; opacity: 0.7; }
      .theme-leaves .lf:nth-child(14) { left: 8%;  font-size: 25px; animation-duration: 8.5s;animation-delay: 8s;   opacity: 0.85; }
      .theme-leaves .lf:nth-child(15) { left: 55%; font-size: 12px; animation-duration: 17s; animation-delay: 1.2s; opacity: 0.5; }
      .theme-leaves .lf:nth-child(16) { left: 38%; font-size: 21px; animation-duration: 10.5s;animation-delay: 6.5s;opacity: 0.75; }
    `,
  },
  winter: {
    key: 'winter',
    name: 'Kış',
    heroGradient: 'linear-gradient(135deg, #0c4a6e 0%, #155e75 40%, #164e63 100%)',
    heroOverlay: 'rgba(12,74,110,0.5)',
    primaryColor: '#0891b2',
    accentColor: '#06b6d4',
    buttonGradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
    buttonShadow: '0 8px 25px rgba(8,145,178,0.4)',
    searchCardBg: 'rgba(255,255,255,0.93)',
    searchCardBorder: '1px solid rgba(6,182,212,0.25)',
    sectionAccent: '#0891b2',
    statsGradient: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
    ctaGradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
    stepCircleGradient: 'linear-gradient(135deg, #0891b2, #06b6d4)',
    featureBg: 'linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%)',
    testimonialBg: 'linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%)',
    navBg: 'rgba(12,74,110,0.95)',
    footerBg: '#0c4a6e',
    labelColor: '#155e75',
    heroTitle: 'Kış Masalında Yolculuk',
    heroSubtitle: 'Soğuk havalarda sıcacık ve güvenli transfer hizmeti',
    decorationEmoji: '❄️',
    decorationCss: `
      .theme-decoration::before { content: '❄️'; position: fixed; top: 80px; right: 30px; font-size: 40px; opacity: 0.15; pointer-events: none; z-index: 0; }
      .theme-decoration::after { content: '⛄'; position: fixed; bottom: 30px; left: 30px; font-size: 40px; opacity: 0.12; pointer-events: none; z-index: 0; }
    `,
  },
};

interface ThemeContextType {
  theme: SiteTheme;
  themeKey: string;
  setThemeKey: (key: string) => void;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeKey, setThemeKey] = useState<string>('default');
  const [customThemeData, setCustomThemeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/tenant/info`, {
          headers: { 'X-Tenant-Slug': TENANT_SLUG }
        });
        if (res.data.success) {
          const savedTheme = res.data.data.tenant.settings?.siteTheme;
          const savedCustomTheme = res.data.data.tenant.settings?.customTheme;
          
          if (savedTheme && (THEMES[savedTheme] || savedTheme === 'custom')) {
            setThemeKey(savedTheme);
          }
          if (savedCustomTheme) {
            setCustomThemeData(savedCustomTheme);
          }
        }
      } catch (e) {
        // Use default theme
      } finally {
        setLoading(false);
      }
    };
    fetchTheme();
  }, []);

  // Build theme object
  const baseTheme = THEMES[themeKey] || THEMES.default;
  const theme: SiteTheme = useMemo(() => {
    if (themeKey === 'custom' && customThemeData) {
      return {
        ...baseTheme,
        primaryColor: customThemeData.primaryColor || baseTheme.primaryColor,
        accentColor: customThemeData.accentColor || baseTheme.accentColor,
        footerBg: customThemeData.footerBg || baseTheme.footerBg,
        heroTitle: customThemeData.heroTitle || baseTheme.heroTitle,
        heroSubtitle: customThemeData.heroSubtitle || baseTheme.heroSubtitle,
        buttonGradient: `linear-gradient(135deg, ${customThemeData.primaryColor || baseTheme.primaryColor} 0%, ${customThemeData.accentColor || baseTheme.accentColor} 100%)`,
        statsGradient: `linear-gradient(135deg, ${customThemeData.primaryColor || baseTheme.primaryColor} 0%, ${customThemeData.accentColor || baseTheme.accentColor} 100%)`,
        ctaGradient: `linear-gradient(135deg, ${customThemeData.primaryColor || baseTheme.primaryColor} 0%, ${customThemeData.accentColor || baseTheme.accentColor} 100%)`,
        stepCircleGradient: `linear-gradient(135deg, ${customThemeData.primaryColor || baseTheme.primaryColor}, ${customThemeData.accentColor || baseTheme.accentColor})`,
      };
    }
    return baseTheme;
  }, [themeKey, customThemeData, baseTheme]);

  const renderParticles = () => {
    if (themeKey === 'newyear') {
      const flakes = '❄,❅,❆,✦,❄,❅,❆,✧,❄,❅,❆,❄,❅,❆,✦,❄,❅,❆,✧,❄'.split(',');
      return (
        <div className="theme-snowflakes" aria-hidden="true">
          {flakes.map((f, i) => <span key={i} className="sf">{f}</span>)}
        </div>
      );
    }
    if (themeKey === 'autumn') {
      const leaves = '🍂,🍁,🍃,🍂,🍁,🍃,🍂,🍁,🍃,🍂,🍁,🍃,🍂,🍁,🍃,🍂'.split(',');
      return (
        <div className="theme-leaves" aria-hidden="true">
          {leaves.map((l, i) => <span key={i} className="lf">{l}</span>)}
        </div>
      );
    }
    return null;
  };

  return (
    <ThemeContext.Provider value={{ theme, themeKey, setThemeKey, loading }}>
      {theme.decorationCss && (
        <style dangerouslySetInnerHTML={{ __html: theme.decorationCss }} />
      )}
      {renderParticles()}
      <div className={theme.decorationCss ? 'theme-decoration' : ''}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
};
