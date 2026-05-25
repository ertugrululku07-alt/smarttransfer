'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { ToolOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import DocUpload from '../DocUpload';

const TYPES = [
  { value: 'PERIODIC', label: 'Periyodik Bakım' },
  { value: 'REPAIR', label: 'Onarım' },
  { value: 'OIL_CHANGE', label: 'Yağ Değişimi' },
  { value: 'TIRE_CHANGE', label: 'Lastik Değişimi' },
  { value: 'BRAKE', label: 'Fren' },
  { value: 'BATTERY', label: 'Akü' },
  { value: 'AIR_FILTER', label: 'Hava Filtresi' },
  { value: 'COOLANT', label: 'Antifriz / Soğutucu' },
  { value: 'TIMING_BELT', label: 'Triger / Kayış' },
  { value: 'AC', label: 'Klima' },
  { value: 'BODY', label: 'Kaporta / Boya' },
  { value: 'ELECTRICAL', label: 'Elektrik' },
  { value: 'TRANSMISSION', label: 'Şanzıman' },
  { value: 'WASH', label: 'Yıkama / Temizlik' },
  { value: 'ACCESSORY', label: 'Aksesuar' },
  { value: 'WARRANTY', label: 'Garanti' },
  { value: 'OTHER', label: 'Diğer' },
];

function fmt(v: number, c = 'TRY') { return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`; }

export default function MaintenancePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form] = Form.useForm();
  const [filter, setFilter] = useState<{ vehicleId?: string; type?: string; from?: any; to?: any }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter.vehicleId) params.vehicleId = filter.vehicleId;
      if (filter.type) params.type = filter.type;
      if (filter.from) params.from = filter.from.toISOString();
      if (filter.to) params.to = filter.to.toISOString();
      const [r, v] = await Promise.all([
        apiClient.get('/api/partner-fleet/maintenance', { params }),
        apiClient.get('/api/partner-fleet/vehicles'),
      ]);
      if (r.data?.success) setRows(r.data.data || []);
      if (v.data?.success) setVehicles(v.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => { form.resetFields(); form.setFieldsValue({ serviceDate: dayjs(), type: 'PERIODIC', currency: 'TRY' }); setModalOpen({ open: true }); };
  const openEdit = (r: any) => { form.setFieldsValue({ ...r, serviceDate: r.serviceDate ? dayjs(r.serviceDate) : undefined, nextDate: r.nextDate ? dayjs(r.nextDate) : undefined }); setModalOpen({ open: true, editing: r }); };
  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = { ...v, serviceDate: v.serviceDate?.toISOString(), nextDate: v.nextDate?.toISOString() };
      const res = modalOpen.editing
        ? await apiClient.put(`/api/partner-fleet/maintenance/${modalOpen.editing.id}`, payload)
        : await apiClient.post('/api/partner-fleet/maintenance', payload);
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen({ open: false }); load(); }
    } catch (e: any) { if (e?.errorFields) return; message.error(e?.response?.data?.error || 'Hata'); }
  };
  const onDel = async (id: string) => { if (!window.confirm('Silinsin mi?')) return; try { const r = await apiClient.delete(`/api/partner-fleet/maintenance/${id}`); if (r.data?.success) { message.success('Silindi'); load(); } } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); } };

  const cols: any[] = [
    { title: 'Tarih', dataIndex: 'serviceDate', width: 100, render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Araç', dataIndex: 'vehicle', render: (v: any, r: any) => v ? v.plate : r.vehicleId },
    { title: 'Tür', dataIndex: 'type', width: 160, render: (t: string) => <Tag>{TYPES.find(x => x.value === t)?.label || t}</Tag> },
    { title: 'Açıklama', dataIndex: 'description', ellipsis: true },
    { title: 'Servis / Tedarikçi', dataIndex: 'vendor', width: 160 },
    { title: 'KM', dataIndex: 'kmAtService', width: 100, align: 'right', render: (v: number) => v ? Number(v).toLocaleString('tr-TR') : '-' },
    { title: 'Tutar', dataIndex: 'cost', width: 130, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v || 0), r.currency)}</b> },
    { title: 'Sonraki Bakım', width: 180, render: (_: any, r: any) => {
      const parts: any[] = [];
      if (r.nextDate) {
        const days = Math.ceil((new Date(r.nextDate).getTime() - Date.now()) / 86400000);
        parts.push(<Tag key="d" color={days < 0 ? 'red' : days < 30 ? 'gold' : 'green'} style={{ margin: 0 }}>{dayjs(r.nextDate).format('DD.MM')}</Tag>);
      }
      if (r.nextKm) parts.push(<Tag key="km" color="blue" style={{ margin: 0, marginLeft: 4 }}>{Number(r.nextKm).toLocaleString('tr-TR')} km</Tag>);
      return parts.length ? <span>{parts}</span> : '-';
    } },
    { title: '', width: 90, fixed: 'right', render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDel(r.id)} />
      </Space>
    ) },
  ];

  return (
    <>
      <Card size="small" title={<span><ToolOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Bakım & Onarım</span>}
        extra={
          <Space>
            <Select placeholder="Araç" allowClear style={{ width: 160 }} value={filter.vehicleId} onChange={(v) => { setFilter({ ...filter, vehicleId: v }); setTimeout(load, 0); }} options={vehicles.map((x: any) => ({ value: x.id, label: x.plate }))} showSearch optionFilterProp="label" />
            <Select placeholder="Tür" allowClear style={{ width: 180 }} value={filter.type} onChange={(v) => { setFilter({ ...filter, type: v }); setTimeout(load, 0); }} options={TYPES} />
            <DatePicker.RangePicker value={[filter.from, filter.to]} onChange={(v) => { setFilter({ ...filter, from: v?.[0], to: v?.[1] }); setTimeout(load, 0); }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Bakım</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={rows} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 1300 }} />
      </Card>

      <Modal title={modalOpen.editing ? 'Bakım Düzenle' : 'Yeni Bakım'} open={modalOpen.open} onCancel={() => setModalOpen({ open: false })} onOk={onSave} width={760} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Araç" name="vehicleId" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={vehicles.map((x: any) => ({ value: x.id, label: `${x.plate} · ${x.brand || ''} ${x.model || ''}` }))} />
            </Form.Item>
            <Form.Item label="Bakım Tipi" name="type" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
            <Form.Item label="Bakım Tarihi" name="serviceDate" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
            <Form.Item label="Yapılan KM" name="kmAtService"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Açıklama" name="description" style={{ gridColumn: '1 / 3' }}><Input placeholder="Yağ + filtre değişimi, balata vb." /></Form.Item>
            <Form.Item label="Servis / Tedarikçi" name="vendor"><Input /></Form.Item>
            <Form.Item label="Servis Telefon" name="vendorPhone"><Input /></Form.Item>
            <Form.Item label="Fatura No" name="invoiceNo"><Input /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{ value: 'TRY' }, { value: 'USD' }, { value: 'EUR' }]} /></Form.Item>
            <Form.Item label="İşçilik" name="laborCost"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Parça" name="partsCost"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Toplam Tutar" name="cost"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <div />
            <Form.Item label="Sonraki Bakım Tarihi" name="nextDate"><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
            <Form.Item label="Sonraki Bakım KM" name="nextKm"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Bakım Belgesi / Fatura" name="documentUrl" style={{ gridColumn: '1 / 3' }}><DocUpload /></Form.Item>
            <Form.Item label="Not" name="notes" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
