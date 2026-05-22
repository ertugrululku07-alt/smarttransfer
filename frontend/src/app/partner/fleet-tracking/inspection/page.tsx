'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { AuditOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import DocUpload from '../DocUpload';

const TYPES = [
  { value: 'TUV', label: 'Araç Muayenesi' },
  { value: 'EMISSION', label: 'Egzoz Emisyon' },
  { value: 'TACHOGRAPH', label: 'Takograf' },
  { value: 'EXHAUST', label: 'Egzoz Kontrolü' },
  { value: 'WEIGHT', label: 'Tartı' },
  { value: 'OTHER', label: 'Diğer' },
];
const RESULTS = [
  { value: 'PASSED', label: 'Geçti', color: 'green' },
  { value: 'PASSED_WITH_DEFECT', label: 'Hafif Kusurlu', color: 'gold' },
  { value: 'FAILED', label: 'Kaldı', color: 'red' },
  { value: 'PENDING', label: 'Beklemede', color: 'default' },
];

function fmt(v: number, c = 'TRY') { return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`; }

export default function InspectionPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form] = Form.useForm();
  const [filter, setFilter] = useState<{ vehicleId?: string; type?: string }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter.vehicleId) params.vehicleId = filter.vehicleId;
      if (filter.type) params.type = filter.type;
      const [r, v] = await Promise.all([
        apiClient.get('/api/partner-fleet/inspections', { params }),
        apiClient.get('/api/partner-fleet/vehicles'),
      ]);
      if (r.data?.success) setRows(r.data.data || []);
      if (v.data?.success) setVehicles(v.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => { form.resetFields(); form.setFieldsValue({ inspectionDate: dayjs(), type: 'TUV', result: 'PASSED' }); setModalOpen({ open: true }); };
  const openEdit = (r: any) => { form.setFieldsValue({ ...r, inspectionDate: r.inspectionDate ? dayjs(r.inspectionDate) : undefined, expiryDate: r.expiryDate ? dayjs(r.expiryDate) : undefined }); setModalOpen({ open: true, editing: r }); };
  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = { ...v, inspectionDate: v.inspectionDate?.toISOString(), expiryDate: v.expiryDate?.toISOString() };
      const res = modalOpen.editing
        ? await apiClient.put(`/api/partner-fleet/inspections/${modalOpen.editing.id}`, payload)
        : await apiClient.post('/api/partner-fleet/inspections', payload);
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen({ open: false }); load(); }
    } catch (e: any) { if (e?.errorFields) return; message.error(e?.response?.data?.error || 'Hata'); }
  };
  const onDel = async (id: string) => { if (!window.confirm('Silinsin mi?')) return; try { const r = await apiClient.delete(`/api/partner-fleet/inspections/${id}`); if (r.data?.success) { message.success('Silindi'); load(); } } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); } };

  const cols: any[] = [
    { title: 'Araç', dataIndex: 'vehicle', render: (v: any, r: any) => v ? v.plate : r.vehicleId },
    { title: 'Tür', dataIndex: 'type', width: 140, render: (t: string) => <Tag>{TYPES.find(x => x.value === t)?.label || t}</Tag> },
    { title: 'Muayene Tarihi', dataIndex: 'inspectionDate', width: 130, render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Sonuç', dataIndex: 'result', width: 130, render: (r: string) => { const x = RESULTS.find(y => y.value === r); return <Tag color={x?.color}>{x?.label || r}</Tag>; } },
    { title: 'İstasyon', dataIndex: 'stationName', width: 160 },
    { title: 'KM', dataIndex: 'kmAtInspection', width: 100, align: 'right', render: (v: number) => v ? Number(v).toLocaleString('tr-TR') : '-' },
    { title: 'Tutar', dataIndex: 'cost', width: 110, align: 'right', render: (v: number, r: any) => v ? fmt(Number(v), r.currency) : '-' },
    { title: 'Sonraki Vade', dataIndex: 'expiryDate', width: 150, render: (d: string) => {
      if (!d) return '-';
      const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
      const color = days < 0 ? 'red' : days < 30 ? 'orange' : 'green';
      return <Tag color={color}>{dayjs(d).format('DD.MM.YYYY')} ({days < 0 ? `${Math.abs(days)} gün geçti` : `${days} gün`})</Tag>;
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
      <Card size="small" title={<span><AuditOutlined style={{ marginRight: 8, color: '#f59e0b' }} /> Araç Muayene</span>}
        extra={
          <Space>
            <Select placeholder="Araç" allowClear style={{ width: 160 }} value={filter.vehicleId} onChange={(v) => { setFilter({ ...filter, vehicleId: v }); setTimeout(load, 0); }} options={vehicles.map((x: any) => ({ value: x.id, label: x.plate }))} showSearch optionFilterProp="label" />
            <Select placeholder="Tür" allowClear style={{ width: 170 }} value={filter.type} onChange={(v) => { setFilter({ ...filter, type: v }); setTimeout(load, 0); }} options={TYPES} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Kayıt</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={rows} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 1200 }} />
      </Card>

      <Modal title={modalOpen.editing ? 'Muayene Düzenle' : 'Yeni Muayene'} open={modalOpen.open} onCancel={() => setModalOpen({ open: false })} onOk={onSave} width={700} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Araç" name="vehicleId" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={vehicles.map((x: any) => ({ value: x.id, label: `${x.plate} · ${x.brand || ''} ${x.model || ''}` }))} />
            </Form.Item>
            <Form.Item label="Tür" name="type" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
            <Form.Item label="Muayene Tarihi" name="inspectionDate" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
            <Form.Item label="Sonraki Vade" name="expiryDate"><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
            <Form.Item label="Sonuç" name="result" initialValue="PASSED"><Select options={RESULTS.map(r => ({ value: r.value, label: r.label }))} /></Form.Item>
            <Form.Item label="Rapor No" name="reportNo"><Input /></Form.Item>
            <Form.Item label="İstasyon" name="stationName"><Input placeholder="TÜVTÜRK..." /></Form.Item>
            <Form.Item label="Şehir" name="stationCity"><Input /></Form.Item>
            <Form.Item label="KM" name="kmAtInspection"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Tutar" name="cost"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{ value: 'TRY' }, { value: 'USD' }, { value: 'EUR' }]} /></Form.Item>
            <Form.Item label="Muayene Belgesi" name="documentUrl" style={{ gridColumn: '1 / 3' }}><DocUpload /></Form.Item>
            <Form.Item label="Not" name="notes" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
