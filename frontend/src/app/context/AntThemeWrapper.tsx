'use client';

import React, { useMemo } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import trTR from 'antd/locale/tr_TR';
import { useTheme } from './ThemeContext';

/**
 * Global Ant Design theme bridge.
 *
 * Reads the active site theme (default / seasonal / custom) from ThemeContext
 * and applies the primary brand color to every Ant Design component across
 * the public site, admin panel, and partner panel. This means changing the
 * primary color in Admin → Site Ayarları → Özel Tema instantly recolors
 * buttons, links, inputs, table highlights, etc. — everywhere.
 */
export default function AntThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme: siteTheme } = useTheme();
  const primaryColor = siteTheme.primaryColor || '#667eea';

  const config = useMemo(
    () => ({
      algorithm: antTheme.defaultAlgorithm,
      token: {
        colorPrimary: primaryColor,
        colorLink: primaryColor,
        colorInfo: primaryColor,
        borderRadius: 8,
        fontFamily: "var(--font-outfit), -apple-system, 'Segoe UI', sans-serif",
      },
      components: {
        Button: { borderRadius: 8, primaryShadow: `0 4px 14px ${primaryColor}40` },
        Card: { borderRadiusLG: 14 },
        Input: { borderRadius: 8 },
        Select: { borderRadius: 8 },
        Menu: { itemSelectedColor: primaryColor, itemSelectedBg: `${primaryColor}18` },
        Tabs: { itemSelectedColor: primaryColor, inkBarColor: primaryColor },
        Switch: { colorPrimary: primaryColor },
        Checkbox: { colorPrimary: primaryColor },
        Radio: { colorPrimary: primaryColor },
      },
    }),
    [primaryColor]
  );

  return (
    <ConfigProvider locale={trTR} theme={config}>
      {children}
    </ConfigProvider>
  );
}
