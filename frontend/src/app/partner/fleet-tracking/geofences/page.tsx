'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Table, Tag, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, WarningOutlined, BorderOutlined } from '@ant-design/icons';
import dynamic from 'next/dynamic';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import type { FleetGeofence } from '../FleetLiveMap';
import type { GeofenceDrawValue } from '../FleetGeofenceDrawer';

const FleetLiveMap = dynamic(() => import('../FleetLiveMap'), { ssr: false, loading: () => <Spin /> });
const FleetGeofenceDrawer = dynamic(() => import('../FleetGeofenceDrawer'), { ssr: false, loading: () => <Spin /> });

const ALERT_OPTIONS = [
  { value: 'EXIT', label: 'Çıkışta uyar' },
  { value: 'ENTER', label: 'Girişte uyar' },
  { value: 'BOTH', label: 'Giriş + Çıkış' },
];

const DEFAULT_DRAW: GeofenceDrawValue = {
  type: 'CIRCLE',
  centerLat: 36.8969,
  centerLng: 30.7133,
  radiusM: 1000,
  polygon: [],
  color: '#6366f1',
};

export default function FleetGeofencesPage() {
  const [geofences, setGeofences] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [summary, setSummary] = useState({ activeCount: 0, recentViolations: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; edit?: any }>({ open: false });
  const [drawValue, setDrawValue] = useState<GeofenceDrawValue>(DEFAULT_DRAW);
  const [form] = Form.useForm();
  const type = Form.useWatch('type', form);

  const load = async () => {
    setLoading(true);
    try {
      const [g, v, veh, s] = await Promise.all([
        apiClient.get('/api/partner-fleet/geofences'),
        apiClient.get('/api/partner-fleet/geofences/violations?limit=50'),
        apiClient.get('/api/partner-fleet/vehicles'),
        apiClient.get('/api/partner-fleet/geofences/summary'),
      ]);
      if (g.data?.success) setGeofences(g.data.data || []);
      if (v.data?.success) setViolations(v.data.data || []);
      if (veh.data?.success) setVehicles(veh.data.data || []);
      if (s.data?.success) setSummary(s.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!modal.open) return;
    setDrawValue((prev) => ({
      ...prev,
      type: type || 'CIRCLE',
      color: form.getFieldValue('color') || prev.color,
    }));
  }, [type, modal.open, form]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ type: 'CIRCLE', alertOn: 'EXIT', color: '#6366f1', isActive: true });
    setDrawValue(DEFAULT_DRAW);
    setModal({ open: true });
  };

  const openEdit = (row: any) => {
    form.setFieldsValue({
      ...row,
      vehicleIds: Array.isArray(row.vehicleIds) ? row.vehicleIds : undefined,
    });
    setDrawValue({
      type: row.type,
      centerLat: row.centerLat ?? DEFAULT_DRAW.centerLat,
      centerLng: row.centerLng ?? DEFAULT_DRAW.centerLng,
      radiusM: row.radiusM ?? DEFAULT_DRAW.radiusM,
      polygon: Array.isArray(row.polygon) ? row.polygon : [],
      color: row.color || '#6366f1',
    });
    setModal({ open: true, edit: row });
  };

  const onDrawChange = (v: GeofenceDrawValue) => {
    setDrawValue(v);
    form.setFieldsValue({
      type: v.type,
      centerLat: v.centerLat,
      centerLng: v.centerLng,
      radiusM: v.radiusM,
      polygon: v.polygon,
      color: v.color,
    });
  };

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = {
        name: v.name,
        type: drawValue.type,
        centerLat: drawValue.type === 'CIRCLE' ? drawValue.centerLat : null,
        centerLng: drawValue.type === 'CIRCLE' ? drawValue.centerLng : null,
        radiusM: drawValue.type === 'CIRCLE' ? drawValue.radiusM : null,
        polygon: drawValue.type === 'POLYGON' ? drawValue.polygon : null,
        alertOn: v.alertOn,
        vehicleIds: v.vehicleIds?.length ? v.vehicleIds : null,
        color: v.color || drawValue.color,
        isActive: v.isActive !== false,
      };
      if (drawValue.type === 'POLYGON' && (!drawValue.polygon || drawValue.polygon.length < 3)) {
        message.warning('Poligon en az 3 nokta içermeli');
        return;
      }
      if (modal.edit) {
        await apiClient.patch(`/api/partner-fleet/geofences/${modal.edit.id}`, payload);
        message.success('Güncellendi');
      } else {
        await apiClient.post('/api/partner-fleet/geofences', payload);
        message.success('Oluşturuldu');
      }
      setModal({ open: false });
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Geofence silinsin mi?')) return;
    try {
      await apiClient.delete(`/api/partner-fleet/geofences/${id}`);
      message.success('Silindi');
      load();
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;

  const mapGeofences: FleetGeofence[] = geofences.filter((g) => g.isActive);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card size="small" title={<span><BorderOutlined style={{ marginRight: 8, color: '#ef4444' }} /> Geofence Bölgeleri</span>}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>Yenile</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Haritada Çiz</Button></Space>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div className="ps-kpi"><div className="ps-kpi__label">Aktif Bölge</div><div className="ps-kpi__value">{summary.activeCount}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #ef4444' }}><div className="ps-kpi__label">Son 7 Gün İhlal</div><div className="ps-kpi__value">{summary.recentViolations}</div></div>
        </div>

        <Alert showIcon type="info" style={{ marginBottom: 12 }}
          message="Harita üzerinde tıklayarak daire veya poligon bölge çizebilirsiniz."
          description="Daire modunda merkeze tıklayın ve yarıçapı kaydırın. Poligon modunda köşe noktalarını tıklayın, en az 3 noktadan sonra Tamamla." />

        {mapGeofences.length > 0 && (
          <FleetLiveMap markers={[]} geofences={mapGeofences} height={320} />
        )}

        {geofences.length === 0 ? <Empty description="Henüz geofence tanımlanmamış — Haritada Çiz ile başlayın" /> : (
          <Table rowKey="id" size="small" style={{ marginTop: 14 }} pagination={{ pageSize: 10, size: 'small' }} dataSource={geofences}
            columns={[
              { title: 'Ad', dataIndex: 'name', render: (n: string, r: any) => <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: r.color || '#6366f1', marginRight: 8 }} />{n}</span> },
              { title: 'Tip', dataIndex: 'type', width: 90, render: (t: string) => <Tag>{t === 'CIRCLE' ? 'DAİRE' : 'POLİGON'}</Tag> },
              { title: 'Uyarı', dataIndex: 'alertOn', width: 110, render: (a: string) => ALERT_OPTIONS.find((x) => x.value === a)?.label || a },
              { title: 'Araç', dataIndex: 'vehicleIds', render: (ids: string[] | null) => !ids?.length ? <Tag>TÜM FİLO</Tag> : <Tag>{ids.length} araç</Tag> },
              { title: 'Durum', dataIndex: 'isActive', width: 90, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Aktif' : 'Pasif'}</Tag> },
              { title: '', width: 90, render: (_: any, r: any) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r.id)} />
                </Space>
              ) },
            ]}
          />
        )}
      </Card>

      <Card size="small" title={<span><WarningOutlined style={{ marginRight: 8, color: '#f59e0b' }} /> Son İhlaller</span>}>
        {violations.length === 0 ? <Empty description="İhlal kaydı yok" /> : (
          <Table rowKey="id" size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={violations}
            columns={[
              { title: 'Zaman', dataIndex: 'timestamp', width: 140, render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm') },
              { title: 'Bölge', render: (_: any, r: any) => r.geofence?.name || '-' },
              { title: 'Araç', render: (_: any, r: any) => r.vehicle?.plate || '-' },
              { title: 'Olay', dataIndex: 'eventType', width: 100, render: (t: string) => <Tag color={t === 'EXIT' ? 'red' : 'blue'}>{t === 'EXIT' ? 'ÇIKIŞ' : 'GİRİŞ'}</Tag> },
              { title: 'Hız', dataIndex: 'speed', width: 90, render: (s: number) => s != null ? `${Math.round(s)} km/sa` : '-' },
              { title: 'Konum', render: (_: any, r: any) => r.lat != null ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` : '-' },
            ]}
          />
        )}
      </Card>

      <Modal
        title={modal.edit ? 'Geofence Düzenle' : 'Haritada Geofence Çiz'}
        open={modal.open}
        onCancel={() => setModal({ open: false })}
        onOk={onSave}
        okText="Kaydet"
        cancelText="Vazgeç"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Bölge Adı" name="name" rules={[{ required: true }]}><Input placeholder="Depo · Antalya Merkez" /></Form.Item>
          <Form.Item label="Tip" name="type" rules={[{ required: true }]}>
            <Select
              options={[{ value: 'CIRCLE', label: 'Daire — haritaya tıkla' }, { value: 'POLYGON', label: 'Poligon — köşe noktaları ekle' }]}
              onChange={(t) => setDrawValue((prev) => ({ ...prev, type: t }))}
            />
          </Form.Item>

          <FleetGeofenceDrawer
            value={{ ...drawValue, type: type || drawValue.type }}
            onChange={onDrawChange}
            height={360}
          />

          <Form.Item label="Uyarı Tipi" name="alertOn" style={{ marginTop: 12 }}><Select options={ALERT_OPTIONS} /></Form.Item>
          <Form.Item label="Belirli Araçlar (boş = tüm filo)" name="vehicleIds">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={vehicles.map((v: any) => ({ value: v.id, label: v.plate }))} />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item label="Renk" name="color"><Input type="color" style={{ width: 80, padding: 2 }} onChange={(e) => setDrawValue((p) => ({ ...p, color: e.target.value }))} /></Form.Item>
            <Form.Item label="Aktif" name="isActive" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
