'use client';

import React from 'react';

interface PartnerStatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
  variant?: 'default' | 'accent';
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function PartnerStatCard({
  label,
  value,
  hint,
  variant = 'default',
  icon,
  style,
}: PartnerStatCardProps) {
  const className = `partner-stat-card${variant === 'accent' ? ' partner-stat-card--accent' : ''}`;
  return (
    <div className={className} style={style}>
      <div className="partner-stat-label">
        {icon}
        {label}
      </div>
      <div className="partner-stat-value">{value}</div>
      {hint && <div className="partner-stat-hint">{hint}</div>}
    </div>
  );
}
