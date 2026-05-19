'use client';

import React from 'react';
import { CarOutlined } from '@ant-design/icons';

export interface VehicleCapacityInfo {
  totalVehicles: number;
  busyVehicles: number;
  availableSlots: number;
}

export interface VehicleChip {
  id: string;
  plateNumber: string;
  isBusy?: boolean;
  activeBooking?: { bookingNumber?: string };
}

interface PartnerCapacityBannerProps {
  capacity: VehicleCapacityInfo;
  vehicles: VehicleChip[];
}

export default function PartnerCapacityBanner({ capacity, vehicles }: PartnerCapacityBannerProps) {
  if (capacity.totalVehicles <= 0) return null;

  const allBusy = capacity.availableSlots === 0;
  const alertClass = allBusy ? 'partner-alert partner-alert--danger' : 'partner-alert partner-alert--success';

  return (
    <div className={alertClass}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
        <CarOutlined style={{ fontSize: 20 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {allBusy ? 'Tüm araçlarınız meşgul' : `${capacity.availableSlots} araç müsait`}
          </div>
          <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
            {capacity.totalVehicles} araç • {capacity.busyVehicles} meşgul • {capacity.availableSlots} boş
          </div>
        </div>
      </div>
      {allBusy && (
        <span style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.06)' }}>
          Havuz gizli
        </span>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', marginTop: 8 }}>
        {vehicles.map((v) => (
          <span
            key={v.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: v.isBusy ? 'var(--partner-warning-bg)' : 'var(--partner-success-bg)',
              color: v.isBusy ? 'var(--partner-warning)' : 'var(--partner-success)',
            }}
          >
            <CarOutlined style={{ fontSize: 11 }} />
            {v.plateNumber}
            {v.isBusy ? ` · ${v.activeBooking?.bookingNumber || 'Meşgul'}` : ' · Boş'}
          </span>
        ))}
      </div>
    </div>
  );
}
