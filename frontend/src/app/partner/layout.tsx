'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import trTR from 'antd/locale/tr_TR';
import PartnerGuard from './PartnerGuard';
import PartnerLayout from './PartnerLayout';
import './partner-theme.css';

export default function PartnerRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={trTR}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 8,
          fontFamily: "var(--font-outfit), -apple-system, 'Segoe UI', sans-serif",
        },
        components: {
          Button: { borderRadius: 8 },
          Card:   { borderRadiusLG: 14 },
          Input:  { borderRadius: 8 },
          Select: { borderRadius: 8 },
        },
      }}
    >
      <PartnerGuard>
        <PartnerLayout>{children}</PartnerLayout>
      </PartnerGuard>
    </ConfigProvider>
  );
}
