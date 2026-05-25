'use client';

import React from 'react';
import PartnerGuard from './PartnerGuard';
import PartnerLayout from './PartnerLayout';
import PartnerThemeProvider from './PartnerThemeProvider';
import './partner-theme.css';

// Note: Ant Design ConfigProvider with the brand color is applied globally
// in the root layout (AntThemeWrapper). PartnerThemeProvider adds
// partner-specific overrides on top of it.
export default function PartnerRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerThemeProvider>
      <PartnerGuard>
        <PartnerLayout>{children}</PartnerLayout>
      </PartnerGuard>
    </PartnerThemeProvider>
  );
}
