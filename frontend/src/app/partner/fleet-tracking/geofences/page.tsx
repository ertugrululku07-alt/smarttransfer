'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tag, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, WarningOutlined, BorderOutlined } from '@ant-design/icons';
import dynamic from 'next/dynamic';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import type { FleetGeofence } from '../FleetLiveMap';

const FleetLiveMap = dynamic(() => import('../FleetLiveMap'), { ssr: false, loading: () => <Spin /> });

const ALERT_OPTIONS = [
  { value: 'EXIT', label: 'Çıkışta uyar' },
  { value: 'ENTER', label: 'Girişte uyar' },
  { value: 'BOTH', label: 'Giriş + Çıkış' },
];

export default function FleetGeofencesPage() {
  const [geofences, setGeofences] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [summary, setSummary] = useState({ activeCount: 0, recentViolations: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; edit?: any }>({ open: false });
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

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ type: 'CIRCLE', alertOn: 'EXIT', radiusM: 1000, color: '#6366f1', isActive: true });
    setModal({ open: true });
  };

  const openEdit = (row: any) => {
    form.setFieldsValue({
      ...row,
      polygon: row.polygon ? JSON.stringify(row.polygon) : undefined,
      vehicleIds: Array.isArray(row.vehicleIds) ? row.vehicleIds : undefined,
    });
    setModal({ open: true, edit: row });
  };

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      let polygon = v.polygon;
      if (v.type === 'POLYGON' && typeof polygon === 'string') {
        polygon = JSON.parse(polygon);
      }
      const payload = {
        ...v,
        polygon,
        vehicleIds: v.vehicleIds?.length ? v.vehicleIds : null,
      };
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
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>Yenile</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Bölge</Button></Space>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div className="ps-kpi"><div className="ps-kpi__label">Aktif Bölge</div><div className="ps-kpi__value">{summary.activeCount}</div></div>
          <div className="ps-kpi" style={{ borderLeft: '3px solid #ef4444' }}><div className="ps-kpi__label">Son 7 Gün İhlal</div><div className="ps-kpi__value">{summary.recentViolations}</div></div>
        </div>

        <Alert showIcon type="info" style={{ marginBottom: 12 }}
          message="Araç tanımlı bölge dışına çıktığında (veya girdiğinde) otomatik ihlal kaydı oluşur."
          description="Telemetri verisi geldiğinde sistem anlık kontrol yapar. E-posta/WhatsApp bildirimi için Ayarlar > Tanımlamalar bölümünü kullanın." />

        {mapGeofences.length > 0 && (
          <FleetLiveMap markers={[]} geofences={mapGeofences} height={320} />
        )}

        {geofences.length === 0 ? <Empty description="Henüz geofence tanımlanmamış" /> : (
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

      <Modal title={modal.edit ? 'Geofence Düzenle' : 'Yeni Geofence'} open={modal.open} onCancel={() => setModal({ open: false })} onOk={onSave} okText="Kaydet" cancelText="Vazgeç" width={560}>
        <Form form={form} layout="vertical">
          <Form.Item label="Bölge Adı" name="name" rules={[{ required: true }]}><Input placeholder="Depo · Antalya Merkez" /></Form.Item>
          <Form.Item label="Tip" name="type" rules={[{ required: true }]}>
            <Select options={[{ value: 'CIRCLE', label: 'Daire (merkez + yarıçap)' }, { value: 'POLYGON', label: 'Poligon (koordinat listesi)' }]} />
          </Form.Item>
          {type === 'CIRCLE' && (
            <>
              <Space style={{ width: '100%' }} align="start">
                <Form.Item label="Merkez Enlem" name="centerLat" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} step={0.0001} placeholder="36.8969" /></Form.Item>
                <Form.Item label="Merkez Boylam" name="centerLng" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} step={0.0001} placeholder="30.7133" /></Form.Item>
              </Space>
              <Form.Item label="Yarıçap (metre)" name="radiusM" rules={[{ required: true }]}><InputNumber min={50} style={{ width: '100%' }} /></Form.Item>
            </>
          )}
          {type === 'POLYGON' && (
            <Form.Item label="Poligon Koordinatları (JSON)" name="polygon" rules={[{ required: true }]}
              help='Örn: [[36.89,30.71],[36.90,30.72],[36.88,30.73]]'>
              <Input.TextArea rows={4} placeholder="[[lat,lng],[lat,lng],...]" />
            </Form.Item>
          )}
          <Form.Item label="Uyarı Tipi" name="alertOn"><Select options={ALERT_OPTIONS} /></Form.Item>
          <Form.Item label="Belirli Araçlar (boş = tüm filo)" name="vehicleIds">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={vehicles.map((v: any) => ({ value: v.id, label: v.plate }))} />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item label="Renk" name="color"><Input type="color" style={{ width: 80, padding: 2 }} /></Form.Item>
            <Form.Item label="Aktif" name="isActive" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
