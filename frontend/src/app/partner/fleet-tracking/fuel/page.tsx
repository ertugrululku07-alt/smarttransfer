'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { FireOutlined, PlusOutlined, DeleteOutlined, EditOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import DocUpload from '../DocUpload';

const TYPES = [
  { value: 'DIESEL', label: 'Motorin (Dizel)' },
  { value: 'GASOLINE', label: 'Benzin' },
  { value: 'LPG', label: 'LPG' },
  { value: 'CNG', label: 'CNG' },
  { value: 'ELECTRIC', label: 'Elektrik' },
  { value: 'HYBRID', label: 'Hibrit' },
  { value: 'ADBLUE', label: 'AdBlue' },
];

const PAY = [
  { value: 'CASH', label: 'Nakit' },
  { value: 'CARD', label: 'Kredi Kartı' },
  { value: 'CORPORATE_CARD', label: 'Şirket Kartı' },
  { value: 'FUEL_VOUCHER', label: 'Akaryakıt Çeki' },
  { value: 'BANK_TRANSFER', label: 'Havale' },
];

function fmt(v: number, c = 'TRY') { return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`; }

export default function FuelPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [filter, setFilter] = useState<{ vehicleId?: string; fuelType?: string; from?: any; to?: any }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter.vehicleId) params.vehicleId = filter.vehicleId;
      if (filter.fuelType) params.fuelType = filter.fuelType;
      if (filter.from) params.from = filter.from.toISOString();
      if (filter.to) params.to = filter.to.toISOString();
      const [r, v, d, s] = await Promise.all([
        apiClient.get('/api/partner-fleet/fuel', { params }),
        apiClient.get('/api/partner-fleet/vehicles'),
        apiClient.get('/api/transfer/partner/my-drivers').catch(() => ({ data: { success: false } })),
        apiClient.get('/api/partner-fleet/fuel/stats', { params: filter.vehicleId ? { vehicleId: filter.vehicleId } : {} }),
      ]);
      if (r.data?.success) setRows(r.data.data || []);
      if (v.data?.success) setVehicles(v.data.data || []);
      if (d.data?.success) setDrivers(d.data.data || []);
      if (s.data?.success) setStats(s.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const total = (v.total !== undefined) ? Number(v.total) : (Number(v.liters || 0) * Number(v.unitPrice || 0));
      const payload = { ...v, total, date: v.date?.toISOString() };
      const res = await apiClient.post('/api/partner-fleet/fuel', payload);
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen(false); form.resetFields(); load(); }
    } catch (e: any) { if (e?.errorFields) return; message.error(e?.response?.data?.error || 'Hata'); }
  };
  const onDel = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return;
    try { const r = await apiClient.delete(`/api/partner-fleet/fuel/${id}`); if (r.data?.success) { message.success('Silindi'); load(); } } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Tarih', dataIndex: 'date', width: 100, render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Araç', dataIndex: 'vehicle', render: (v: any, r: any) => v ? v.plate : r.vehicleId },
    { title: 'Yakıt', dataIndex: 'fuelType', width: 100, render: (t: string) => <Tag>{TYPES.find(x => x.value === t)?.label || t}</Tag> },
    { title: 'Litre', dataIndex: 'liters', width: 80, align: 'right', render: (v: number) => v ? Number(v).toFixed(2) : '-' },
    { title: 'B. Fiyat', dataIndex: 'unitPrice', width: 90, align: 'right', render: (v: number, r: any) => v ? `${Number(v).toFixed(3)} ${r.currency}` : '-' },
    { title: 'Tutar', dataIndex: 'total', width: 120, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v), r.currency)}</b> },
    { title: 'KM', dataIndex: 'km', width: 90, align: 'right', render: (v: number) => v ? Number(v).toLocaleString('tr-TR') : '-' },
    { title: 'Tüketim', dataIndex: 'consumption', width: 100, align: 'right', render: (v: number) => v ? <Tag color={v < 8 ? 'green' : v < 12 ? 'gold' : 'red'}>{Number(v).toFixed(2)} L/100km</Tag> : '-' },
    { title: 'İstasyon', dataIndex: 'stationName', width: 130 },
    { title: 'Ödeme', dataIndex: 'paymentMethod', width: 120, render: (p: string) => <Tag>{PAY.find(x => x.value === p)?.label || p}</Tag> },
    { title: '', width: 50, fixed: 'right', render: (_: any, r: any) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDel(r.id)} /> },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small" title={<span><FireOutlined style={{ marginRight: 8, color: '#10b981' }} /> Yakıt Giderleri</span>}
        extra={
          <Space>
            <Select placeholder="Araç" allowClear style={{ width: 160 }} value={filter.vehicleId} onChange={(v) => { setFilter({ ...filter, vehicleId: v }); setTimeout(load, 0); }} options={vehicles.map((x: any) => ({ value: x.id, label: x.plate }))} showSearch optionFilterProp="label" />
            <Select placeholder="Yakıt" allowClear style={{ width: 140 }} value={filter.fuelType} onChange={(v) => { setFilter({ ...filter, fuelType: v }); setTimeout(load, 0); }} options={TYPES} />
            <DatePicker.RangePicker value={[filter.from, filter.to]} onChange={(v) => { setFilter({ ...filter, from: v?.[0], to: v?.[1] }); setTimeout(load, 0); }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ date: dayjs(), fuelType: 'DIESEL', paymentMethod: 'CASH', currency: 'TRY' }); setModalOpen(true); }}>Yeni Yakıt</Button>
          </Space>
        }
      >
        {stats?.perVehicle?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
            {stats.perVehicle.slice(0, 6).map((p: any) => (
              <div key={p.vehicleId} className="ps-card" style={{ padding: 10, borderLeft: '3px solid #10b981' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Araç</div>
                <div style={{ fontWeight: 700 }}>{p.vehicle?.plate || p.vehicleId}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
                  <span>{p.count} dolum</span>
                  <span>{p.liters.toFixed(0)} L</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>{fmt(p.total)}</span>
                  {p.avgConsumption && <Tag color={p.avgConsumption < 8 ? 'green' : p.avgConsumption < 12 ? 'gold' : 'red'} style={{ fontSize: 10, margin: 0 }}>{p.avgConsumption.toFixed(2)} L/100km</Tag>}
                </div>
              </div>
            ))}
          </div>
        )}
        <Table rowKey="id" columns={cols} dataSource={rows} loading={loading} size="small" pagination={{ pageSize: 30, size: 'small' }} scroll={{ x: 1200 }} />
      </Card>

      <Modal title="Yeni Yakıt Kaydı" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={onSave} width={700} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Araç" name="vehicleId" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={vehicles.map((x: any) => ({ value: x.id, label: `${x.plate} · ${x.brand || ''} ${x.model || ''}` }))} />
            </Form.Item>
            <Form.Item label="Şoför (opsiyonel)" name="driverId">
              <Select allowClear showSearch optionFilterProp="label" options={drivers.map((d: any) => ({ value: d.id, label: `${d.firstName} ${d.lastName}` }))} />
            </Form.Item>
            <Form.Item label="Tarih" name="date"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Yakıt Tipi" name="fuelType" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
            <Form.Item label="Litre" name="liters"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Birim Fiyat" name="unitPrice"><InputNumber min={0} step={0.001} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Tutar" name="total" rules={[{ required: true }]}><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{ value: 'TRY' }, { value: 'USD' }, { value: 'EUR' }]} /></Form.Item>
            <Form.Item label="KM (Kilometre)" name="km"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Ödeme" name="paymentMethod" initialValue="CASH"><Select options={PAY} /></Form.Item>
            <Form.Item label="İstasyon" name="stationName"><Input placeholder="Shell, Opet, BP..." /></Form.Item>
            <Form.Item label="Şehir" name="stationCity"><Input /></Form.Item>
            <Form.Item label="Fiş No" name="receiptNo"><Input /></Form.Item>
            <Form.Item label="Fiş / Belge" name="documentUrl"><DocUpload /></Form.Item>
            <Form.Item label="Not" name="notes" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
