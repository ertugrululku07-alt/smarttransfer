'use client';

import React from 'react';

interface PartnerPageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PartnerPageHeader({ title, subtitle, action }: PartnerPageHeaderProps) {
  return (
    <header className="partner-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
