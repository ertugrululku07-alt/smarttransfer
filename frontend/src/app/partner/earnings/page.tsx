'use client';

import React, { useState, useEffect } from 'react';
import { Spin, Progress, Select } from 'antd';
import {
  DollarOutlined, CarOutlined,
  CalendarOutlined, ArrowUpOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const { Option } = Select;

export default function EarningsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState('month');

  const fetchEarnings = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/transfer/partner/earnings?period=${period}`);
      if (res.data?.success) setData(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEarnings(); }, [period]);

  const currency = data?.currency || 'EUR';
  const fmt = (n: number) => Number(n || 0).toLocaleString('tr-TR');
  const fmtCur = (n: number) => `${fmt(n)} ${currency}`;

  return (
    <div>
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">Kazanç Raporu</h1>
          <p className="ps-page-header__subtitle">Gelir ve performans özeti</p>
        </div>
        <Select value={period} onChange={setPeriod} style={{ width: 160 }} size="large">
          <Option value="week">Bu Hafta</Option>
          <Option value="month">Bu Ay</Option>
          <Option value="quarter">Bu Çeyrek</Option>
          <Option value="year">Bu Yıl</Option>
        </Select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="ps-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <div className="ps-kpi">
              <div className="ps-kpi__accent" style={{ background: 'linear-gradient(90deg,#10b981,#059669)' }} />
              <div className="ps-kpi__header">
                <span className="ps-kpi__label">Toplam Gelir</span>
                <span className="ps-kpi__icon" style={{ background: '#ecfdf5', color: '#10b981' }}><DollarOutlined /></span>
              </div>
              <div className="ps-kpi__value" style={{ fontSize: '1.5rem' }}>{fmtCur(data?.totalRevenue)}</div>
              {data?.revenueGrowth != null && (
                <span className={`ps-kpi__trend ${data.revenueGrowth >= 0 ? 'ps-kpi__trend--up' : 'ps-kpi__trend--down'}`}>
                  <ArrowUpOutlined style={{ fontSize: 10, transform: data.revenueGrowth < 0 ? 'rotate(180deg)' : 'none' }} />
                  %{Math.abs(data.revenueGrowth)} önceki döneme göre
                </span>
              )}
            </div>
            <div className="ps-kpi">
              <div className="ps-kpi__accent" style={{ background: 'linear-gradient(90deg,var(--brand-primary),var(--brand-accent))' }} />
              <div className="ps-kpi__header">
                <span className="ps-kpi__label">Net Kazanç</span>
                <span className="ps-kpi__icon" style={{ background: 'var(--brand-primary-08)', color: 'var(--brand-primary)' }}><DollarOutlined /></span>
              </div>
              <div className="ps-kpi__value" style={{ fontSize: '1.5rem' }}>{fmtCur(data?.netEarnings)}</div>
              <div className="ps-kpi__sub">Komisyon sonrası</div>
            </div>
            <div className="ps-kpi">
              <div className="ps-kpi__accent" style={{ background: 'linear-gradient(90deg,#3b82f6,var(--brand-primary))' }} />
              <div className="ps-kpi__header">
                <span className="ps-kpi__label">Tamamlanan</span>
                <span className="ps-kpi__icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><CheckCircleOutlined /></span>
              </div>
              <div className="ps-kpi__value">{fmt(data?.completedTrips)}</div>
              <div className="ps-kpi__sub">transfer</div>
            </div>
            <div className="ps-kpi">
              <div className="ps-kpi__accent" style={{ background: 'linear-gradient(90deg,#f59e0b,#f97316)' }} />
              <div className="ps-kpi__header">
                <span className="ps-kpi__label">Ortalama Gelir</span>
                <span className="ps-kpi__icon" style={{ background: '#fffbeb', color: '#f59e0b' }}><CarOutlined /></span>
              </div>
              <div className="ps-kpi__value" style={{ fontSize: '1.5rem' }}>{fmtCur(data?.avgPerTrip)}</div>
              <div className="ps-kpi__sub">transfer başına</div>
            </div>
          </div>

          {/* Commission breakdown */}
          {data?.commissionRate != null && (
            <div className="ps-card" style={{ marginBottom: 20 }}>
              <div className="ps-card-header">
                <h3 className="ps-card-title"><DollarOutlined style={{ color: 'var(--brand-primary)' }} /> Komisyon Detayı</h3>
              </div>
              <div className="ps-card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--ps-text-2)' }}>Komisyon Oranı</span>
                  <span style={{ fontWeight: 700 }}>%{data.commissionRate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--ps-text-2)' }}>Toplam Gelir</span>
                  <span style={{ fontWeight: 700 }}>{fmtCur(data?.totalRevenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: 'var(--ps-text-2)' }}>Komisyon Kesintisi</span>
                  <span style={{ fontWeight: 700, color: 'var(--ps-danger-text)' }}>{fmtCur(data?.commissionAmount)}</span>
                </div>
                <Progress
                  percent={Math.round(100 - (data.commissionRate || 0))}
                  strokeColor="#10b981"
                  format={() => `Net %${Math.round(100 - (data.commissionRate || 0))}`}
                />
              </div>
            </div>
          )}

          {/* Per-vehicle breakdown */}
          {data?.byVehicle && data.byVehicle.length > 0 && (
            <div className="ps-card">
              <div className="ps-card-header">
                <h3 className="ps-card-title"><CarOutlined style={{ color: '#3b82f6' }} /> Araç Bazlı Gelir</h3>
              </div>
              <div style={{ padding: '8px 20px 16px' }}>
                {data.byVehicle.map((v: any) => (
                  <div key={v.vehicleId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: '1px solid var(--ps-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CarOutlined />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{v.plateNumber}</div>
                        <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>{v.tripCount} transfer</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtCur(v.revenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!data && (
            <div className="ps-empty">
              <div className="ps-empty__icon"><DollarOutlined /></div>
              <p className="ps-empty__title">Veri bulunamadı</p>
              <p className="ps-empty__desc">Seçilen dönem için kazanç verisi yok</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
