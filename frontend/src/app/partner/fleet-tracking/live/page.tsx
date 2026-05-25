'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal,
  Select, Space, Spin, Table, Tabs, Tag, Tooltip, message,
} from 'antd';
import {
  AimOutlined, ApiOutlined, ClockCircleOutlined, EnvironmentOutlined,
  PlusOutlined, DeleteOutlined, CopyOutlined, ReloadOutlined, EditOutlined,
  BorderOuterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import apiClient from '@/lib/api-client';
import type { FleetGeofence, FleetMapMarker } from '../FleetLiveMap';

const FleetLiveMap = dynamic(() => import('../FleetLiveMap'), { ssr: false, loading: () => <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div> });

export default function FleetLivePage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [partnerVehicles, setPartnerVehicles] = useState<any[]>([]);
  const [mapMarkers, setMapMarkers] = useState<FleetMapMarker[]>([]);
  const [geofences, setGeofences] = useState<FleetGeofence[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<FleetMapMarker | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [keyModal, setKeyModal] = useState<{ open: boolean; key?: string; name?: string }>({ open: false });
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [v, d, p, map] = await Promise.all([
        apiClient.get('/api/partner-fleet/telemetry/live'),
        apiClient.get('/api/partner-fleet/devices'),
        apiClient.get('/api/partner-fleet/vehicles'),
        apiClient.get('/api/partner-fleet/telemetry/map-data'),
      ]);
      if (v.data?.success) setVehicles(v.data.data || []);
      if (d.data?.success) setDevices(d.data.data || []);
      if (p.data?.success) setPartnerVehicles(p.data.data || []);
      if (map.data?.success) {
        setMapMarkers(map.data.data.markers || []);
        setGeofences(map.data.data.geofences || []);
      }
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const onCreateDevice = async () => {
    try {
      const v = await form.validateFields();
      const r = await apiClient.post('/api/partner-fleet/devices', v);
      if (r.data?.success) {
        setCreateModal(false);
        form.resetFields();
        load();
        setKeyModal({ open: true, key: r.data.data.apiKey, name: r.data.data.name });
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    }
  };

  const onDeleteDevice = async (id: string) => {
    if (!window.confirm('Cihaz silinsin mi?')) return;
    try {
      const r = await apiClient.delete(`/api/partner-fleet/devices/${id}`);
      if (r.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); message.success('Kopyalandı'); };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;

  const onlineCount = vehicles.filter((v) => v.lastTelemetry && v.lastTelemetry.minutesAgo < 10).length;

  const tableView = (
    <Table
      rowKey="id"
      size="small"
      pagination={{ pageSize: 20, size: 'small' }}
      dataSource={vehicles}
      onRow={(r) => ({
        onClick: () => {
          const m = mapMarkers.find((x) => x.id === r.id);
          if (m) setSelectedMarker(m);
        },
        style: { cursor: 'pointer' },
      })}
      columns={[
        { title: 'Araç', dataIndex: 'plate', render: (p: string, r: any) => (
          <div>
            <div style={{ fontWeight: 700 }}>{p}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{r.brand} {r.model}</div>
          </div>
        ) },
        { title: 'Durum', width: 110, render: (_: any, r: any) => {
          if (!r.lastTelemetry) return <Tag color="default">VERİ YOK</Tag>;
          const mins = r.lastTelemetry.minutesAgo;
          if (mins < 5) return <Tag color="green"><Badge dot status="success" /> CANLI</Tag>;
          if (mins < 60) return <Tag color="gold">{mins} dk önce</Tag>;
          if (mins < 1440) return <Tag color="orange">{Math.floor(mins / 60)} sa önce</Tag>;
          return <Tag color="default">{Math.floor(mins / 1440)} gün önce</Tag>;
        } },
        { title: 'Konum', render: (_: any, r: any) => {
          if (!r.lastTelemetry?.lat) return <span style={{ color: '#cbd5e1' }}>-</span>;
          const url = `https://www.google.com/maps/search/?api=1&query=${r.lastTelemetry.lat},${r.lastTelemetry.lng}`;
          return <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><EnvironmentOutlined /> {r.lastTelemetry.lat.toFixed(5)}, {r.lastTelemetry.lng.toFixed(5)}</a>;
        } },
        { title: 'Hız', width: 100, render: (_: any, r: any) => r.lastTelemetry?.speed != null ? <b>{Math.round(r.lastTelemetry.speed)} km/sa</b> : '-' },
        { title: 'KM', width: 120, align: 'right', render: (_: any, r: any) => {
          const km = r.lastTelemetry?.odometer || r.currentKm;
          return km ? <span>{Number(km).toLocaleString('tr-TR')}</span> : '-';
        } },
        { title: 'Yakıt', width: 110, render: (_: any, r: any) => r.lastTelemetry?.fuelLevel != null ? (
          <Tag color={r.lastTelemetry.fuelLevel < 20 ? 'red' : r.lastTelemetry.fuelLevel < 50 ? 'gold' : 'green'}>{Math.round(r.lastTelemetry.fuelLevel)}%</Tag>
        ) : '-' },
        { title: 'Motor', width: 100, render: (_: any, r: any) => {
          const s = r.lastTelemetry?.engineStatus;
          if (!s) return '-';
          const c = s === 'ON' ? 'green' : s === 'IDLE' ? 'gold' : 'default';
          return <Tag color={c}>{s}</Tag>;
        } },
        { title: 'Son Güncelleme', width: 140, render: (_: any, r: any) => r.lastTelemetry ? <span style={{ fontSize: 11 }}><ClockCircleOutlined /> {dayjs(r.lastTelemetry.timestamp).format('DD.MM HH:mm:ss')}</span> : <span style={{ color: '#cbd5e1' }}>-</span> },
      ]}
    />
  );

  const mapView = mapMarkers.length === 0 ? (
    <Empty description="Haritada gösterilecek konum verisi yok" style={{ padding: 40 }} />
  ) : (
    <FleetLiveMap
      markers={mapMarkers}
      geofences={geofences}
      selectedId={selectedMarker?.id}
      onSelect={setSelectedMarker}
      height={480}
    />
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card size="small" title={<span><AimOutlined style={{ marginRight: 8, color: '#10b981' }} /> Canlı Araç Takibi</span>}
        extra={
          <Space wrap>
            <Tag color={autoRefresh ? 'green' : 'default'}>
              <Badge dot status={autoRefresh ? 'success' : 'default'} /> Otomatik · {autoRefresh ? '15 sn' : 'KAPALI'}
            </Tag>
            <Button size="small" onClick={() => setAutoRefresh((x) => !x)}>{autoRefresh ? 'Durdur' : 'Başlat'}</Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => load()}>Yenile</Button>
          </Space>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div className="ps-kpi"><div className="ps-kpi__label">Filo</div><div className="ps-kpi__value">{vehicles.length}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #10b981' }}><div className="ps-kpi__label">Çevrimiçi</div><div className="ps-kpi__value">{onlineCount}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #94a3b8' }}><div className="ps-kpi__label">Haritada</div><div className="ps-kpi__value">{mapMarkers.length}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid var(--brand-primary)' }}><div className="ps-kpi__label">Geofence</div><div className="ps-kpi__value">{geofences.length}</div></div>
        </div>

        <Tabs
          defaultActiveKey="map"
          items={[
            { key: 'map', label: <span><EnvironmentOutlined /> Harita</span>, children: mapView },
            { key: 'table', label: <span><BorderOuterOutlined /> Tablo</span>, children: tableView },
          ]}
        />

        {selectedMarker && (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message={`Seçili: ${selectedMarker.plate}`}
            description={`${selectedMarker.brand || ''} ${selectedMarker.model || ''} · ${Math.round(selectedMarker.speed || 0)} km/sa · ${selectedMarker.lat.toFixed(5)}, ${selectedMarker.lng.toFixed(5)}`}
            closable
            onClose={() => setSelectedMarker(null)}
          />
        )}
      </Card>

      <Card size="small" title={<span><ApiOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> IoT Cihazları & API Anahtarları</span>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModal(true); }}>Yeni Cihaz</Button>}
      >
        <Alert showIcon type="info" style={{ marginBottom: 12 }} message="Telemetri ingestion endpoint"
          description={<div style={{ fontSize: 12 }}>GPS cihazı: <code>POST /api/partner-fleet/telemetry/ingest</code> · Header: <code>X-API-Key</code> · Body: lat, lng, speed, odometer, payload.harshBrake / harshAccel</div>} />
        {devices.length === 0 ? <Empty description="Henüz cihaz tanımlanmamış" /> : (
          <Table rowKey="id" size="small" pagination={false} dataSource={devices} columns={[
            { title: 'Ad', dataIndex: 'name' },
            { title: 'Bağlı Araç', dataIndex: 'vehicleId', render: (id: string) => {
              if (!id) return <Tag>BAĞIMSIZ</Tag>;
              const v = partnerVehicles.find((x: any) => x.id === id);
              return v ? `${v.plate} · ${v.brand} ${v.model}` : id;
            } },
            { title: 'Son Görülme', dataIndex: 'lastSeenAt', width: 160, render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY HH:mm') : <Tag>HİÇ</Tag> },
            { title: 'Durum', dataIndex: 'isActive', width: 90, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Aktif' : 'Pasif'}</Tag> },
            { title: '', width: 60, render: (_: any, r: any) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDeleteDevice(r.id)} /> },
          ]} />
        )}
      </Card>

      <Modal title="Yeni IoT Cihazı" open={createModal} onCancel={() => setCreateModal(false)} onOk={onCreateDevice} okText="Oluştur" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <Form.Item label="Cihaz Adı" name="name" rules={[{ required: true }]}><Input placeholder="07ABC123 GPS" /></Form.Item>
          <Form.Item label="Bağlı Araç (opsiyonel)" name="vehicleId">
            <Select allowClear showSearch optionFilterProp="label" options={partnerVehicles.map((v: any) => ({ value: v.id, label: `${v.plate} · ${v.brand || ''} ${v.model || ''}` }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="🔑 Cihaz API Anahtarı" open={keyModal.open} onCancel={() => setKeyModal({ open: false })} footer={null}>
        <Alert showIcon type="warning" style={{ marginBottom: 12 }} message="Bu anahtar SADECE BİR KEZ gösterilir!" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, color: '#fff', fontFamily: 'monospace', fontSize: 13 }}>
          <code style={{ flex: 1, wordBreak: 'break-all' }}>{keyModal.key}</code>
          <Button icon={<CopyOutlined />} onClick={() => copy(keyModal.key || '')}>Kopyala</Button>
        </div>
      </Modal>
    </div>
  );
}
