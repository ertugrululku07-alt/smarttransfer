'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { TeamOutlined, EditOutlined, DeleteOutlined, PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import { exportResource } from '../exportHelper';

const JOB_TITLES = [
  { value: 'DRIVER', label: 'Şoför' },
  { value: 'DISPATCHER', label: 'Operasyon / Dispatcher' },
  { value: 'GREETER', label: 'Karşılamacı' },
  { value: 'ACCOUNTANT', label: 'Muhasebe' },
  { value: 'MANAGER', label: 'Yönetici' },
  { value: 'OFFICE', label: 'Ofis' },
];
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Aktif', ON_LEAVE: 'İzinli', TERMINATED: 'Ayrıldı', PASSIVE: 'Pasif' };
const STATUS_COLOR: Record<string, string> = { ACTIVE:'green', ON_LEAVE:'orange', TERMINATED:'red', PASSIVE:'default' };

export default function EmployeesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const res = await apiClient.get('/api/partner-accounting/employees', { params });
      if (res.data?.success) setData(res.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { form.resetFields(); setModalOpen({ open: true }); };
  const openEdit = (r: any) => {
    form.setFieldsValue({
      ...r,
      birthDate: r.birthDate ? dayjs(r.birthDate) : undefined,
      hireDate: r.hireDate ? dayjs(r.hireDate) : undefined,
      sgkStartDate: r.sgkStartDate ? dayjs(r.sgkStartDate) : undefined,
    });
    setModalOpen({ open: true, editing: r });
  };

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const payload = {
        ...v,
        birthDate: v.birthDate?.toISOString(),
        hireDate: v.hireDate?.toISOString(),
        sgkStartDate: v.sgkStartDate?.toISOString(),
        baseSalary: v.baseSalary ? Number(v.baseSalary) : null,
      };
      const res = modalOpen.editing
        ? await apiClient.put(`/api/partner-accounting/employees/${modalOpen.editing.id}`, payload)
        : await apiClient.post('/api/partner-accounting/employees', payload);
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen({ open: false }); load(); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setSaving(false); }
  };

  const onDel = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/employees/${id}`);
      if (res.data?.success) { message.success(res.data?.archived ? 'Arşivlendi' : 'Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Ad Soyad', render: (_:any,r:any) => (
      <div><b>{r.firstName} {r.lastName}</b><div style={{ fontSize: 11, color: '#64748b' }}>{r.identityNo}</div></div>
    ) },
    { title: 'Görev', dataIndex: 'jobTitle', width: 140, render: (v: string) => <Tag>{JOB_TITLES.find(j=>j.value===v)?.label || v || '-'}</Tag> },
    { title: 'Departman', dataIndex: 'department', width: 140 },
    { title: 'Telefon', dataIndex: 'phone', width: 140 },
    { title: 'Maaş', dataIndex: 'baseSalary', width: 130, align: 'right', render: (v: number, r:any) => v ? `${Number(v).toLocaleString('tr-TR')} ${r.salaryCurrency||'TRY'}` : '-' },
    { title: 'İşe Giriş', dataIndex: 'hireDate', width: 110, render: (v: string) => v ? dayjs(v).format('DD.MM.YYYY') : '-' },
    { title: 'Durum', dataIndex: 'status', width: 110, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '', width: 100, fixed: 'right', render: (_:any,r:any)=>(
      <Space size={4}>
        <Button size="small" icon={<EditOutlined />} onClick={()=>openEdit(r)} />
        <Button size="small" danger icon={<DeleteOutlined />} onClick={()=>onDel(r.id)} />
      </Space>
    ) },
  ];

  return (
    <>
      <Card title={<span><TeamOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Personel</span>} size="small"
        extra={
          <Space>
            <Input.Search placeholder="Ara" allowClear value={search} onChange={(e)=>setSearch(e.target.value)} onSearch={load} style={{ width: 180 }} />
            <Select placeholder="Tüm durumlar" allowClear style={{ width: 140 }} value={status} onChange={(v)=>{ setStatus(v); setTimeout(load, 0); }} options={Object.keys(STATUS_LABELS).map(k=>({value:k,label:STATUS_LABELS[k]}))} />
            <Button icon={<DownloadOutlined />} onClick={() => exportResource('employees', 'personel')}>CSV</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Personel</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 1100 }} />
      </Card>

      <Modal title={modalOpen.editing ? 'Personel Düzenle' : 'Yeni Personel'} open={modalOpen.open} onCancel={()=>setModalOpen({ open: false })} onOk={onSave} confirmLoading={saving} width={760} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Form.Item label="Ad" name="firstName" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="Soyad" name="lastName" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="TCKN" name="identityNo"><Input maxLength={11} /></Form.Item>
            <Form.Item label="Görev" name="jobTitle"><Select allowClear options={JOB_TITLES} /></Form.Item>
            <Form.Item label="Departman" name="department"><Input /></Form.Item>
            <Form.Item label="Doğum Tarihi" name="birthDate"><DatePicker style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Telefon" name="phone"><Input /></Form.Item>
            <Form.Item label="E-Posta" name="email"><Input /></Form.Item>
            <Form.Item label="Cinsiyet" name="gender"><Select allowClear options={[{value:'MALE',label:'Erkek'},{value:'FEMALE',label:'Kadın'},{value:'OTHER',label:'Diğer'}]} /></Form.Item>
            <Form.Item label="Adres" name="address" style={{ gridColumn: '1 / 4' }}><Input.TextArea rows={2} /></Form.Item>
            <Form.Item label="İşe Giriş" name="hireDate"><DatePicker style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Sözleşme" name="contractType" initialValue="FULL_TIME"><Select options={[{value:'FULL_TIME',label:'Tam Zamanlı'},{value:'PART_TIME',label:'Yarı Zamanlı'},{value:'HOURLY',label:'Saatlik'},{value:'FREELANCE',label:'Serbest'}]} /></Form.Item>
            <Form.Item label="Durum" name="status" initialValue="ACTIVE"><Select options={Object.keys(STATUS_LABELS).map(k=>({value:k,label:STATUS_LABELS[k]}))} /></Form.Item>
            <Form.Item label="Maaş" name="baseSalary"><InputNumber min={0} step={0.01} style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="salaryCurrency" initialValue="TRY"><Select options={[{value:'TRY'},{value:'USD'},{value:'EUR'}]} /></Form.Item>
            <Form.Item label="Ödeme Günü" name="paymentDay"><InputNumber min={1} max={31} style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="IBAN" name="iban" style={{ gridColumn: '1 / 3' }}><Input /></Form.Item>
            <Form.Item label="Banka" name="bankName"><Input /></Form.Item>
            <Form.Item label="SGK No" name="sgkNumber"><Input /></Form.Item>
            <Form.Item label="SGK Giriş" name="sgkStartDate"><DatePicker style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Notlar" name="notes" style={{ gridColumn: '1 / 4' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
