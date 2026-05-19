'use client';

import React from 'react';

type PillVariant = 'success' | 'warning' | 'danger' | 'neutral';

interface PartnerStatusPillProps {
  children: React.ReactNode;
  variant?: PillVariant;
  dot?: boolean;
}

export default function PartnerStatusPill({
  children,
  variant = 'neutral',
  dot = true,
}: PartnerStatusPillProps) {
  return (
    <span className={`partner-pill partner-pill--${variant}`}>
      {dot && <span className="partner-pill-dot" aria-hidden />}
      {children}
    </span>
  );
}
