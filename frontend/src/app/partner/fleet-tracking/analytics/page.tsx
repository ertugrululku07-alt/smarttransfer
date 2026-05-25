'use client';

import React, { useEffect, useState } from 'react';
import { Card, Empty, Select, Space, Spin, Table, Tag } from 'antd';
import { BarChartOutlined, CarOutlined, FireOutlined, ToolOutlined, SafetyOutlined, AuditOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ position: 'relative', height: 18, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  );
}

export default function FleetAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get(`/api/partner-fleet/analytics/overview?months=${months}`);
      if (r.data?.success) setData(r.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [months]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Veri yok" />;

  const t = data.totals;
  const maxMonth = Math.max(1, ...data.monthly.map((m: any) => m.total));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card size="small" title={<span><BarChartOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Filo Maliyet Analizi</span>}
        extra={
          <Select value={months} onChange={(v) => setMonths(v)} style={{ width: 130 }} options={[
            { value: 3, label: 'Son 3 ay' }, { value: 6, label: 'Son 6 ay' }, { value: 12, label: 'Son 12 ay' }, { value: 24, label: 'Son 24 ay' }, { value: 36, label: 'Son 36 ay' },
          ]} />
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #10b981' }}><div className="ps-kpi__label"><FireOutlined /> Yakıt</div><div className="ps-kpi__value">{fmt(t.fuel)}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid var(--brand-primary)' }}><div className="ps-kpi__label"><ToolOutlined /> Bakım & Onarım</div><div className="ps-kpi__value">{fmt(t.maintenance)}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #f59e0b' }}><div className="ps-kpi__label"><AuditOutlined /> Muayene</div><div className="ps-kpi__value">{fmt(t.inspection)}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #ef4444' }}><div className="ps-kpi__label"><SafetyOutlined /> Sigorta</div><div className="ps-kpi__value">{fmt(t.insurance)}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #0f172a', background: '#f8fafc' }}><div className="ps-kpi__label">Genel Toplam</div><div className="ps-kpi__value">{fmt(t.grand)}</div></div>
        </div>
      </Card>

      <Card size="small" title="Aylık Gider Dağılımı">
        {data.monthly.length === 0 ? <Empty /> : (
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px', rowGap: 8, columnGap: 12, alignItems: 'center' }}>
            {data.monthly.map((m: any) => (
              <React.Fragment key={m.month}>
                <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{m.month}</div>
                <div style={{ display: 'grid', gap: 3 }}>
                  {m.fuel > 0 && <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px', gap: 8, alignItems: 'center', fontSize: 11 }}><span>Yakıt</span><Bar value={m.fuel} max={maxMonth} color="#10b981" /><span style={{ textAlign: 'right' }}>{fmt(m.fuel)}</span></div>}
                  {m.maintenance > 0 && <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px', gap: 8, alignItems: 'center', fontSize: 11 }}><span>Bakım</span><Bar value={m.maintenance} max={maxMonth} color="var(--brand-primary)" /><span style={{ textAlign: 'right' }}>{fmt(m.maintenance)}</span></div>}
                  {m.inspection > 0 && <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px', gap: 8, alignItems: 'center', fontSize: 11 }}><span>Muayene</span><Bar value={m.inspection} max={maxMonth} color="#f59e0b" /><span style={{ textAlign: 'right' }}>{fmt(m.inspection)}</span></div>}
                  {m.insurance > 0 && <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px', gap: 8, alignItems: 'center', fontSize: 11 }}><span>Sigorta</span><Bar value={m.insurance} max={maxMonth} color="#ef4444" /><span style={{ textAlign: 'right' }}>{fmt(m.insurance)}</span></div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{fmt(m.total)}</div>
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      <Card size="small" title={<span><CarOutlined style={{ marginRight: 8 }} /> Araç Bazında Maliyet</span>}>
        <Table
          rowKey="vehicleId"
          size="small"
          pagination={false}
          dataSource={data.perVehicle}
          columns={[
            { title: 'Araç', dataIndex: 'vehicle', render: (v: any, r: any) => v ? `${v.plate} ${v.brand || ''}`.trim() : r.vehicleId },
            { title: 'Yakıt', dataIndex: 'fuelTotal', align: 'right', render: (v: number) => fmt(Number(v)) },
            { title: 'Bakım', dataIndex: 'maintenanceTotal', align: 'right', render: (v: number) => fmt(Number(v)) },
            { title: 'Muayene', dataIndex: 'inspectionTotal', align: 'right', render: (v: number) => fmt(Number(v)) },
            { title: 'Sigorta', dataIndex: 'insuranceTotal', align: 'right', render: (v: number) => fmt(Number(v)) },
            { title: 'Toplam', dataIndex: 'totalCost', align: 'right', render: (v: number) => <b>{fmt(Number(v))}</b> },
            { title: 'KM Aralığı', dataIndex: 'kmRange', align: 'right', render: (v: number) => v ? `${Number(v).toLocaleString('tr-TR')} km` : '-' },
            { title: 'Maliyet/km', dataIndex: 'costPerKm', align: 'right', render: (v: number) => v ? <Tag color="blue">{fmt(Number(v))}</Tag> : '-' },
            { title: 'Ort. Tüketim', dataIndex: 'avgConsumption', align: 'right', render: (v: number) => v ? <Tag color={v < 8 ? 'green' : v < 12 ? 'gold' : 'red'}>{Number(v).toFixed(2)} L/100km</Tag> : '-' },
          ]}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        <Card size="small" title="Bakım Tipi Dağılımı">
          {data.maintenanceByType.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.maintenanceByType.map((m: any) => (
                <div key={m.type} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <Tag>{m.type}</Tag>
                  <Bar value={m.total} max={data.maintenanceByType[0].total || 1} color="var(--brand-primary)" />
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small" title="En Çok Harcanan Servisler">
          {data.topVendors.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.topVendors.map((v: any, i: number) => (
                <div key={v.vendor} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 100px 60px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>{i + 1}</span>
                  <span style={{ fontWeight: 600 }}>{v.vendor}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{fmt(v.total)}</span>
                  <Tag style={{ textAlign: 'center' }}>{v.count}</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small" title="En Çok Yakıt Aldığım İstasyonlar">
          {data.topStations.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.topStations.map((s: any, i: number) => (
                <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 100px 80px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>{i + 1}</span>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{fmt(s.total)}</span>
                  <span style={{ color: '#64748b', textAlign: 'right', fontSize: 11 }}>{s.liters.toFixed(0)} L</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
