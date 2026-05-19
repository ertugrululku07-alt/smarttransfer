'use client';

import React from 'react';
import PartnerGuard from './PartnerGuard';
import PartnerLayout from './PartnerLayout';
import PartnerThemeProvider from './PartnerThemeProvider';
import './partner-theme.css';

export default function PartnerRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerGuard>
      <PartnerThemeProvider>
        <PartnerLayout>{children}</PartnerLayout>
      </PartnerThemeProvider>
    </PartnerGuard>
  );
}
