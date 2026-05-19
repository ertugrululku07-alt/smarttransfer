'use client';

import React from 'react';

interface PartnerEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PartnerEmptyState({
  icon,
  title,
  description,
  action,
}: PartnerEmptyStateProps) {
  return (
    <div className="partner-empty">
      {icon && <div className="partner-empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}
