'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Empty, Select, Space, Spin, Tag, message } from 'antd';
import { FilePdfOutlined, ReloadOutlined, CarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import apiClient, { API_URL } from '@/lib/api-client';

const FleetLiveMap = dynamic(() => import('../FleetLiveMap'), { ssr: false, loading: () => <Spin /> });

export default function FleetReportsPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [date, setDate] = useState(dayjs());
  const [speedLimit, setSpeedLimit] = useState(120);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get('/api/partner-fleet/vehicles').then((r) => {
      if (r.data?.success) {
        const list = r.data.data || [];
        setVehicles(list);
        if (list[0]) setVehicleId(list[0].id);
      }
    });
  }, []);

  const loadReport = async () => {
    if (!vehicleId) return message.warning('Araç seçin');
    setLoading(true);
    try {
      const r = await apiClient.get('/api/partner-fleet/driving-report', {
        params: { vehicleId, date: date.format('YYYY-MM-DD'), speedLimit },
      });
      if (r.data?.success) setReport(r.data.data);
      else message.error(r.data?.error || 'Rapor alınamadı');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (vehicleId) loadReport(); }, [vehicleId]);

  const openPdf = () => {
    if (!vehicleId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const q = new URLSearchParams({
      vehicleId,
      date: date.format('YYYY-MM-DD'),
      speedLimit: String(speedLimit),
    });
    fetch(`${API_URL}/api/partner-fleet/driving-report/pdf?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.text())
      .then((html) => {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      })
      .catch(() => message.error('PDF açılamadı'));
  };

  const rep = report?.report;
  const grade = rep?.grade;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card size="small" title={<span><FilePdfOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Günlük Sürüş Raporu</span>}
        extra={<Button icon={<ReloadOutlined />} onClick={loadReport} loading={loading}>Hesapla</Button>}
      >
        <Space wrap style={{ marginBottom: 14 }}>
          <Select style={{ width: 220 }} showSearch optionFilterProp="label" value={vehicleId} onChange={setVehicleId}
            options={vehicles.map((v: any) => ({ value: v.id, label: `${v.plate} · ${v.brand || ''} ${v.model || ''}` }))} />
          <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD.MM.YYYY" />
          <Select style={{ width: 160 }} value={speedLimit} onChange={setSpeedLimit}
            options={[90, 100, 110, 120, 130].map((v) => ({ value: v, label: `Hız limiti ${v} km/sa` }))} />
          <Button type="primary" icon={<FilePdfOutlined />} onClick={openPdf} disabled={!rep}>PDF / Yazdır</Button>
        </Space>

        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div> : !rep ? (
          <Empty description="Rapor için araç ve tarih seçin" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className="ps-kpi"><div className="ps-kpi__label">Mesafe</div><div className="ps-kpi__value">{rep.distanceKm} km</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Ort. Hız</div><div className="ps-kpi__value">{rep.avgSpeed} km/sa</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Maks. Hız</div><div className="ps-kpi__value">{rep.maxSpeed} km/sa</div></div>
              <div className="ps-kpi" style={{ borderLeft: `3px solid ${grade?.color || '#6366f1'}` }}>
                <div className="ps-kpi__label">Davranış Skoru</div>
                <div className="ps-kpi__value">{rep.score}/100 · {grade?.grade}</div>
              </div>
              <div className="ps-kpi"><div className="ps-kpi__label">Hız İhlali</div><div className="ps-kpi__value">{rep.speedViolations}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Ani Fren</div><div className="ps-kpi__value">{rep.harshBrakes}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Ani Hızlanma</div><div className="ps-kpi__value">{rep.harshAccels}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Yakıt</div><div className="ps-kpi__value">{rep.fuelLiters || 0} L · {Number(rep.fuelTotal || 0).toLocaleString('tr-TR')} ₺</div></div>
            </div>

            {rep.route?.length >= 2 ? (
              <FleetLiveMap markers={[]} route={rep.route} height={360} />
            ) : (
              <Empty description="Bu gün için rota noktası yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
              <CarOutlined /> {report.vehicle?.plate} · {rep.pointCount} telemetri noktası ·
              {rep.startAt ? ` ${dayjs(rep.startAt).format('HH:mm')}` : ''} – {rep.endAt ? dayjs(rep.endAt).format('HH:mm') : ''}
              {grade && <Tag color={grade.color} style={{ marginLeft: 8 }}>{grade.label}</Tag>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
