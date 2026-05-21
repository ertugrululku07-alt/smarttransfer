'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, message,
} from 'antd';
import {
  BankOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileSearchOutlined, SearchOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

const TYPES = [
  { value: 'CUSTOMER', label: 'Müşteri' },
  { value: 'SUPPLIER', label: 'Tedarikçi' },
  { value: 'EMPLOYEE', label: 'Personel' },
  { value: 'DRIVER',   label: 'Şoför' },
  { value: 'BANK',     label: 'Banka' },
  { value: 'CASH',     label: 'Kasa' },
  { value: 'OTHER',    label: 'Diğer' },
];

const TYPE_COLOR: Record<string, string> = {
  CUSTOMER: 'blue', SUPPLIER: 'orange', EMPLOYEE: 'purple', DRIVER: 'cyan',
  BANK: 'geekblue', CASH: 'gold', OTHER: 'default',
};

export default function FinanceAccountsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (typeFilter) params.type = typeFilter;
      const res = await apiClient.get('/api/partner-accounting/accounts', { params });
      if (res.data?.success) setData(res.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onSearch = () => load();

  const openCreate = () => {
    form.resetFields();
    setModalOpen({ open: true });
  };

  const openEdit = (row: any) => {
    form.setFieldsValue(row);
    setModalOpen({ open: true, editing: row });
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = modalOpen.editing
        ? await apiClient.put(`/api/partner-accounting/accounts/${modalOpen.editing.id}`, values)
        : await apiClient.post('/api/partner-accounting/accounts', values);
      if (res.data?.success) {
        message.success(modalOpen.editing ? 'Cari güncellendi' : 'Cari oluşturuldu');
        setModalOpen({ open: false });
        load();
      } else { message.error(res.data?.error || 'Hata'); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setSaving(false); }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Cari silinsin mi? (Hareketi olan cariler pasifleştirilir)')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/accounts/${id}`);
      if (res.data?.success) { message.success(res.data?.archived ? 'Pasifleştirildi' : 'Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const columns: any[] = [
    { title: 'Kod', dataIndex: 'code', width: 110, render: (v: string) => <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:6, fontSize: 11 }}>{v}</code> },
    { title: 'Cari Adı', dataIndex: 'name', render: (v: string, r: any) => (
      <div>
        <div style={{ fontWeight: 700 }}>{v}</div>
        {r.taxNumber && <div style={{ fontSize: 11, color: '#64748b' }}>VKN: {r.taxNumber}</div>}
      </div>
    ) },
    { title: 'Tip', dataIndex: 'type', width: 110, render: (v: string) => <Tag color={TYPE_COLOR[v] || 'default'}>{TYPES.find(t=>t.value===v)?.label || v}</Tag> },
    { title: 'Telefon', dataIndex: 'phone', width: 140 },
    { title: 'Şehir', dataIndex: 'city', width: 120 },
    { title: 'Bakiye', dataIndex: 'balance', width: 160, align: 'right', render: (v: number, r: any) => (
      <span style={{ fontWeight: 700, color: Number(v) > 0 ? '#10b981' : Number(v) < 0 ? '#ef4444' : '#64748b' }}>
        {Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {r.currency}
      </span>
    ) },
    { title: 'Durum', dataIndex: 'isActive', width: 80, render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Aktif' : 'Pasif'}</Tag> },
    { title: 'İşlemler', width: 160, fixed: 'right', render: (_: any, r: any) => (
      <Space size={4}>
        <Tooltip title="Ekstre"><Link href={`/partner/finance/accounts/${r.id}`}><Button size="small" icon={<FileSearchOutlined />} /></Link></Tooltip>
        <Tooltip title="Düzenle"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
        <Tooltip title="Sil"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r.id)} /></Tooltip>
      </Space>
    ) },
  ];

  return (
    <>
      <Card
        title={<span><BankOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Cariler</span>}
        size="small"
        extra={
          <Space>
            <Input.Search placeholder="Ara: ad, kod, vkn" allowClear value={search} onChange={(e)=>setSearch(e.target.value)} onSearch={onSearch} style={{ width: 240 }} />
            <Select placeholder="Tüm tipler" allowClear style={{ width: 160 }} value={typeFilter} onChange={(v)=>{ setTypeFilter(v); setTimeout(load, 0); }} options={TYPES} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Cari</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          dataSource={data}
          columns={columns}
          loading={loading}
          size="small"
          pagination={{ pageSize: 25, size: 'small' }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={modalOpen.editing ? 'Cari Düzenle' : 'Yeni Cari'}
        open={modalOpen.open}
        onCancel={() => setModalOpen({ open: false })}
        onOk={onSave}
        confirmLoading={saving}
        width={680}
        okText={modalOpen.editing ? 'Güncelle' : 'Kaydet'}
        cancelText="Vazgeç"
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Cari Kodu" name="code"><Input placeholder="Otomatik" /></Form.Item>
            <Form.Item label="Tip" name="type" initialValue="CUSTOMER" rules={[{ required: true }]}>
              <Select options={TYPES} />
            </Form.Item>
            <Form.Item label="Cari Ünvanı" name="name" rules={[{ required: true }]} style={{ gridColumn: '1 / 3' }}>
              <Input placeholder="Şirket Adı / Ad Soyad" />
            </Form.Item>
            <Form.Item label="Vergi Dairesi" name="taxOffice"><Input /></Form.Item>
            <Form.Item label="VKN / TCKN" name="taxNumber"><Input /></Form.Item>
            <Form.Item label="E-Posta" name="email"><Input /></Form.Item>
            <Form.Item label="Telefon" name="phone"><Input /></Form.Item>
            <Form.Item label="Şehir" name="city"><Input /></Form.Item>
            <Form.Item label="İlçe" name="district"><Input /></Form.Item>
            <Form.Item label="Adres" name="address" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{value:'TRY',label:'TRY'},{value:'USD',label:'USD'},{value:'EUR',label:'EUR'}]} /></Form.Item>
            <Form.Item label="Vade (gün)" name="paymentTermDays"><Input type="number" /></Form.Item>
            <Form.Item label="Kredi Limiti" name="creditLimit"><Input type="number" step="0.01" /></Form.Item>
            <Form.Item label="Notlar" name="notes" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
