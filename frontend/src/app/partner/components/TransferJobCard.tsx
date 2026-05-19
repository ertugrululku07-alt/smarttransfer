'use client';

import React, { useState } from 'react';
import {
  PhoneOutlined,
  CalendarOutlined,
  CarOutlined,
  TeamOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import FlightTracker from '@/components/FlightTracker';
import BookingMap from '@/app/components/BookingMap';
import PartnerStatusPill from './PartnerStatusPill';

const DistanceCalculator = ({
  pickup,
  dropoff,
  onCalculated,
}: {
  pickup: string;
  dropoff: string;
  onCalculated: (dist: string, duration: string) => void;
}) => (
  <div style={{ display: 'none' }}>
    <BookingMap pickup={pickup} dropoff={dropoff} onDistanceCalculated={onCalculated} />
  </div>
);

export interface TransferJob {
  id: string;
  status: string;
  customer: { name: string; phone?: string; avatar?: string };
  pickup: { location: string; time: string; timeDate?: string };
  dropoff: { location: string; dist?: string; duration?: string };
  vehicle: { type: string; pax: number };
  price: { amount: number | string; currency: string };
  flightNumber?: string;
  partnerVehiclePlate?: string;
}

interface TransferJobCardProps {
  job: TransferJob;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDetail?: (id: string) => void;
  loading?: boolean;
}

export default function TransferJobCard({
  job,
  onAccept,
  onReject,
  onDetail,
  loading,
}: TransferJobCardProps) {
  const [stats, setStats] = useState({
    dist: job.dropoff.dist,
    duration: job.dropoff.duration,
  });
  const isPending = job.status === 'PENDING' || job.status === 'WAITING';

  const handleDistanceCalculated = (dist: string, duration: string) => {
    if (!stats.dist || stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok') {
      setStats({ dist, duration });
    }
  };

  const initials =
    job.customer.avatar ||
    job.customer.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  return (
    <article className="partner-job-card">
      <div className={`partner-job-accent${isPending ? ' partner-job-accent--pending' : ''}`} />

      {(stats.dist === '0 km' || stats.dist === 'KM Bilgisi Yok' || !stats.dist) && (
        <DistanceCalculator
          pickup={job.pickup.location}
          dropoff={job.dropoff.location}
          onCalculated={handleDistanceCalculated}
        />
      )}

      <div className="partner-job-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="partner-brand-fallback" style={{ width: 44, height: 44, fontSize: 13 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{job.customer.name}</div>
              {job.customer.phone && (
                <div style={{ fontSize: 12, color: 'var(--partner-text-muted)', marginTop: 2 }}>
                  <PhoneOutlined style={{ marginRight: 4 }} />
                  {job.customer.phone}
                </div>
              )}
            </div>
          </div>
          <PartnerStatusPill variant={isPending ? 'warning' : 'success'}>
            {isPending ? 'Bekliyor' : 'Aktif'}
          </PartnerStatusPill>
        </div>

        <div
          className="partner-card"
          style={{ padding: '14px 16px', marginBottom: 14, background: 'var(--partner-bg)' }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--partner-success)',
                }}
              />
              <div
                style={{
                  width: 2,
                  flex: 1,
                  minHeight: 28,
                  margin: '4px 0',
                  background: 'linear-gradient(to bottom, var(--partner-success), var(--partner-border))',
                }}
              />
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--partner-danger)',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--partner-text-muted)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Alış
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{job.pickup.location}</div>
                <div style={{ fontSize: 12, color: 'var(--partner-text-secondary)', marginTop: 4 }}>
                  <CalendarOutlined style={{ marginRight: 4 }} />
                  {job.pickup.time}
                </div>
                {job.flightNumber && (
                  <FlightTracker
                    flightNumber={job.flightNumber}
                    arrivalDate={job.pickup.timeDate || job.pickup.time}
                  />
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--partner-text-muted)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Varış
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{job.dropoff.location}</div>
                <div style={{ fontSize: 12, color: 'var(--partner-text-secondary)', marginTop: 4 }}>
                  <CarOutlined style={{ marginRight: 4 }} />
                  {stats.dist || '...'} · {stats.duration || '...'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span className="partner-pill partner-pill--neutral" style={{ textTransform: 'none', fontSize: 12 }}>
            <CarOutlined /> {job.vehicle.type}
          </span>
          <span className="partner-pill partner-pill--neutral" style={{ textTransform: 'none', fontSize: 12 }}>
            <TeamOutlined /> {job.vehicle.pax} kişi
          </span>
          {job.partnerVehiclePlate && (
            <span className="partner-pill partner-pill--neutral" style={{ textTransform: 'none', fontSize: 12 }}>
              {job.partnerVehiclePlate}
            </span>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {job.price.amount}{' '}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--partner-text-muted)' }}>
              {job.price.currency}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isPending ? '1fr 1fr 1fr' : '1fr', gap: 8 }}>
          {!isPending ? (
            <Button type="primary" size="large" block onClick={() => onDetail?.(job.id)}>
              Detay / İşlemler <RightOutlined />
            </Button>
          ) : (
            <>
              <Button danger onClick={() => onReject?.(job.id)}>
                Reddet
              </Button>
              <Button onClick={() => onDetail?.(job.id)}>Detay</Button>
              <Button type="primary" loading={loading} onClick={() => onAccept?.(job.id)}>
                Kabul Et
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
