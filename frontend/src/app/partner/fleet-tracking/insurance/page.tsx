'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { SafetyOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import DocUpload from '../DocUpload';

const TYPES = [
  { value: 'TRAFIK', label: 'Trafik Sigortası' },
  { value: 'KASKO', label: 'Kasko' },
  { value: 'ZMSS', label: 'ZMSS (Karayolu Taş.)' },
  { value: 'IMSS', label: 'İMSS' },
  { value: 'COVERAGE', label: 'Kapsamlı' },
  { value: 'HEALTH_DRIVER', label: 'Şoför Sağlık' },
];

const STATUS = [
  { value: 'ACTIVE', label: 'Aktif', color: 'green' },
  { value: 'EXPIRED', label: 'Süresi Geçti', color: 'red' },
  { value: 'CANCELLED', label: 'İptal', color: 'default' },
  { value: 'PENDING', label: 'Beklemede', color: 'orange' },
];

function fmt(v: number, c = 'TRY') { return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`; }

export default function InsurancePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form] = Form.useForm();
  const [filter, setFilter] = useState<{ vehicleId?: string; type?: string; status?: string }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter.vehicleId) params.vehicleId = filter.vehicleId;
      if (filter.type) params.type = filter.type;
      if (filter.status) params.status = filter.status;
      const [r, v] = await Promise.all([
        apiClient.get('/api/partner-fleet/insurances', { params }),
        apiClient.get('/api/partner-fleet/vehicles'),
      ]);
      if (r.data?.success) setRows(r.data.data || []);
      if (v.data?.success) setVehicles(v.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => { form.resetFields(); setModalOpen({ open: true }); };
  const openEdit = (r: any) => {
    form.setFieldsValue({
      ...r,
      startDate: r.startDate ? dayjs(r.startDate) : undefined,
      endDate: r.endDate ? dayjs(r.endDate) : undefined,
    });
    setModalOpen({ open: true, editing: r });
  };
  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = { ...v, startDate: v.startDate?.toISOString(), endDate: v.endDate?.toISOString() };
      const res = modalOpen.editing
        ? await apiClient.put(`/api/partner-fleet/insurances/${modalOpen.editing.id}`, payload)
        : await apiClient.post('/api/partner-fleet/insurances', payload);
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen({ open: false }); load(); }
    } catch (e: any) { if (e?.errorFields) return; message.error(e?.response?.data?.error || 'Hata'); }
  };
  const onDel = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return;
    try { const r = await apiClient.delete(`/api/partner-fleet/insurances/${id}`); if (r.data?.success) { message.success('Silindi'); load(); } } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Araç', dataIndex: 'vehicle', render: (v: any, r: any) => v ? `${v.plate}` : r.vehicleId },
    { title: 'Tür', dataIndex: 'type', width: 160, render: (t: string) => <Tag>{TYPES.find(x => x.value === t)?.label || t}</Tag> },
    { title: 'Poliçe No', dataIndex: 'policyNo', width: 140 },
    { title: 'Sigorta Şirketi', dataIndex: 'company', width: 160 },
    { title: 'Başlangıç', dataIndex: 'startDate', width: 100, render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Bitiş', dataIndex: 'endDate', width: 100, render: (d: string, r: any) => {
      const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
      const color = days < 0 ? 'red' : days < 30 ? 'orange' : 'green';
      return <Tag color={color}>{dayjs(d).format('DD.MM.YYYY')} ({days < 0 ? `${Math.abs(days)} gün geçti` : `${days} gün`})</Tag>;
    } },
    { title: 'Tutar', dataIndex: 'premium', width: 130, align: 'right', render: (v: number, r: any) => v ? fmt(Number(v), r.currency) : '-' },
    { title: 'Durum', dataIndex: 'status', width: 110, render: (s: string) => { const x = STATUS.find(y => y.value === s); return <Tag color={x?.color}>{x?.label || s}</Tag>; } },
    { title: '', width: 90, fixed: 'right', render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDel(r.id)} />
      </Space>
    ) },
  ];

  return (
    <>
      <Card size="small" title={<span><SafetyOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Sigorta Takibi</span>}
        extra={
          <Space>
            <Select placeholder="Araç" allowClear style={{ width: 160 }} value={filter.vehicleId} onChange={(v) => { setFilter({ ...filter, vehicleId: v }); setTimeout(load, 0); }}
              options={vehicles.map((x: any) => ({ value: x.id, label: x.plate }))} showSearch optionFilterProp="label" />
            <Select placeholder="Tür" allowClear style={{ width: 170 }} value={filter.type} onChange={(v) => { setFilter({ ...filter, type: v }); setTimeout(load, 0); }} options={TYPES} />
            <Select placeholder="Durum" allowClear style={{ width: 130 }} value={filter.status} onChange={(v) => { setFilter({ ...filter, status: v }); setTimeout(load, 0); }} options={STATUS.map(s => ({ value: s.value, label: s.label }))} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Poliçe</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={rows} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 1100 }} />
      </Card>

      <Modal title={modalOpen.editing ? 'Poliçe Düzenle' : 'Yeni Poliçe'} open={modalOpen.open} onCancel={() => setModalOpen({ open: false })} onOk={onSave} width={700} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Araç" name="vehicleId" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={vehicles.map((x: any) => ({ value: x.id, label: `${x.plate} · ${x.brand || ''} ${x.model || ''}` }))} />
            </Form.Item>
            <Form.Item label="Tür" name="type" initialValue="TRAFIK" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
            <Form.Item label="Poliçe No" name="policyNo"><Input /></Form.Item>
            <Form.Item label="Sigorta Şirketi" name="company"><Input placeholder="Aksigorta, Allianz vb." /></Form.Item>
            <Form.Item label="Acente Adı" name="agentName"><Input /></Form.Item>
            <Form.Item label="Acente Telefon" name="agentPhone"><Input /></Form.Item>
            <Form.Item label="Acente E-Posta" name="agentEmail"><Input /></Form.Item>
            <Form.Item label="Durum" name="status" initialValue="ACTIVE"><Select options={STATUS.map(s => ({ value: s.value, label: s.label }))} /></Form.Item>
            <Form.Item label="Başlangıç" name="startDate" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
            <Form.Item label="Bitiş" name="endDate" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
            <Form.Item label="Prim Tutarı" name="premium"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{ value: 'TRY' }, { value: 'USD' }, { value: 'EUR' }]} /></Form.Item>
            <Form.Item label="Poliçe Belgesi" name="documentUrl" style={{ gridColumn: '1 / 3' }}><DocUpload /></Form.Item>
            <Form.Item label="Notlar" name="notes" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
