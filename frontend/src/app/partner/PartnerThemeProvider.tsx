'use client';

import React, { useEffect, useMemo } from 'react';
import { ConfigProvider, theme } from 'antd';
import trTR from 'antd/locale/tr_TR';
import { useTheme } from '../context/ThemeContext';

interface PartnerThemeProviderProps {
  children: React.ReactNode;
}

const COASTAL_ACCENT = '#1a5f7a';

export default function PartnerThemeProvider({ children }: PartnerThemeProviderProps) {
  const { theme: siteTheme } = useTheme();

  const accent = siteTheme.primaryColor || COASTAL_ACCENT;

  useEffect(() => {
    const root = document.querySelector('.partner-shell') as HTMLElement | null;
    if (!root) return;
    root.style.setProperty('--partner-accent', accent);
    root.style.setProperty('--partner-accent-hover', adjustBrightness(accent, -12));
    root.style.setProperty('--partner-accent-muted', `${accent}18`);
    root.style.setProperty('--partner-accent-subtle', `${accent}22`);
    root.style.setProperty('--partner-shadow-accent', `0 8px 24px ${accent}38`);
  }, [accent]);

  const antTheme = useMemo(
    () => ({
      algorithm: theme.defaultAlgorithm,
      token: {
        colorPrimary: accent,
        borderRadius: 10,
        fontFamily: "var(--font-outfit), 'Segoe UI', system-ui, sans-serif",
        colorBgContainer: '#fdfcfa',
        colorBgLayout: '#f4f1ec',
      },
      components: {
        Button: {
          primaryShadow: `0 4px 14px ${accent}40`,
          borderRadius: 10,
        },
        Card: {
          borderRadiusLG: 16,
        },
        Table: {
          borderRadius: 12,
        },
      },
    }),
    [accent]
  );

  return (
    <ConfigProvider locale={trTR} theme={antTheme}>
      {children}
    </ConfigProvider>
  );
}

function adjustBrightness(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
