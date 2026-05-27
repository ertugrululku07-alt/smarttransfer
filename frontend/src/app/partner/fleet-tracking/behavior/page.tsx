'use client';

import React, { useEffect, useState } from 'react';
import { Card, Empty, Progress, Select, Space, Spin, Table, Tag } from 'antd';
import { TrophyOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';

export default function FleetBehaviorPage() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [speedLimit, setSpeedLimit] = useState(120);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/api/partner-fleet/driver-behavior', { params: { days, speedLimit } });
      if (r.data?.success) setData(r.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [days, speedLimit]);

  const fleet = data?.fleetGrade;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card size="small" title={<span><TrophyOutlined style={{ marginRight: 8, color: '#f59e0b' }} /> Sürücü Davranış Skoru</span>}
        extra={
          <Space wrap>
            <Select value={days} onChange={setDays} style={{ width: 130 }}
              options={[7, 14, 30, 60, 90].map((d) => ({ value: d, label: `Son ${d} gün` }))} />
            <Select value={speedLimit} onChange={setSpeedLimit} style={{ width: 160 }}
              options={[90, 100, 110, 120, 130].map((v) => ({ value: v, label: `Limit ${v} km/sa` }))} />
            <a onClick={load}><ReloadOutlined /> Yenile</a>
          </Space>
        }
      >
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div> : !data ? (
          <Empty description="Veri yok" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
              <div className="ps-kpi" style={{ borderLeft: `4px solid ${fleet?.color || '#6366f1'}` }}>
                <div className="ps-kpi__label">Filo Skoru</div>
                <div className="ps-kpi__value">{data.fleetScore}/100</div>
                <Tag color={fleet?.color} style={{ marginTop: 6 }}>{fleet?.grade} · {fleet?.label}</Tag>
              </div>
              <div className="ps-kpi"><div className="ps-kpi__label">Analiz Edilen Araç</div><div className="ps-kpi__value">{data.vehicleScores?.length || 0}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Sürücü / Araç Kaydı</div><div className="ps-kpi__value">{data.driverScores?.length || 0}</div></div>
            </div>

            <AlertStrip />

            <h4 style={{ margin: '8px 0 10px', fontSize: 14 }}>Araç Bazlı Skor</h4>
            <Table rowKey="vehicleId" size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={data.vehicleScores || []}
              columns={[
                { title: 'Araç', render: (_: any, r: any) => <b>{r.vehicle?.plate || r.vehicleId}</b> },
                { title: 'Skor', dataIndex: 'score', width: 180, render: (s: number, r: any) => (
                  <div>
                    <Progress percent={s} size="small" strokeColor={r.grade?.color} format={() => `${s}`} />
                    <Tag color={r.grade?.color} style={{ marginTop: 4 }}>{r.grade?.grade}</Tag>
                  </div>
                ) },
                { title: 'Mesafe', dataIndex: 'distanceKm', width: 90, render: (v: number) => `${v} km` },
                { title: 'Hız İhlali', dataIndex: 'speedViolations', width: 100 },
                { title: 'Ani Fren', dataIndex: 'harshBrakes', width: 90 },
                { title: 'Ani Hızlanma', dataIndex: 'harshAccels', width: 110 },
                { title: 'Maks. Hız', dataIndex: 'maxSpeed', width: 90, render: (v: number) => `${v} km/sa` },
              ]}
            />

            <h4 style={{ margin: '18px 0 10px', fontSize: 14 }}>Sürücü / Araç Detay</h4>
            <Table rowKey={(r) => r.driverId || r.vehicleId} size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={data.driverScores || []}
              columns={[
                { title: 'Kaynak', dataIndex: 'label' },
                { title: 'Skor', dataIndex: 'score', width: 180, render: (s: number, r: any) => (
                  <Progress percent={s} size="small" strokeColor={r.grade?.color} format={() => `${s}`} />
                ) },
                { title: 'Mesafe', dataIndex: 'distanceKm', width: 90, render: (v: number) => `${v} km` },
                { title: 'Hız İhlali', dataIndex: 'speedViolations', width: 100 },
                { title: 'Ani Fren', dataIndex: 'harshBrakes', width: 90 },
                { title: 'Ani Hızlanma', dataIndex: 'harshAccels', width: 110 },
              ]}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function AlertStrip() {
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
      <WarningOutlined style={{ marginRight: 6 }} />
      Skor hesabı: 100 üzerinden; hız ihlali (−2), ani fren (−5), ani hızlanma (−3) puan düşürür. GPS cihazınız <code>payload.harshBrake</code> / <code>harshAccel</code> gönderebilir; aksi halde hız farkından otomatik tespit edilir.
    </div>
  );
}
