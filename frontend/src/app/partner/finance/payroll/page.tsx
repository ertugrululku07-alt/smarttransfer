'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { UserOutlined, CheckCircleOutlined, PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import { exportResource } from '../exportHelper';

const TYPES = [
  { value: 'SALARY', label: 'Maaş' },
  { value: 'ADVANCE', label: 'Avans' },
  { value: 'BONUS', label: 'Prim' },
  { value: 'OVERTIME', label: 'Mesai' },
  { value: 'DEDUCTION', label: 'Kesinti' },
  { value: 'REIMBURSEMENT', label: 'Masraf İade' },
  { value: 'TIP', label: 'Bahşiş' },
];
const TYPE_COLOR: Record<string, string> = {
  SALARY: 'blue', ADVANCE: 'orange', BONUS: 'green', OVERTIME: 'cyan',
  DEDUCTION: 'red', REIMBURSEMENT: 'purple', TIP: 'gold',
};

function fmt(v: number, c = 'TRY') { return `${Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ${c}`; }

export default function PayrollPage() {
  const [data, setData] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string | undefined>();
  const [paid, setPaid] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (type) params.type = type;
      if (paid !== undefined) params.paid = paid;
      const [pr, em] = await Promise.all([
        apiClient.get('/api/partner-accounting/payroll', { params }),
        apiClient.get('/api/partner-accounting/employees'),
      ]);
      if (pr.data?.success) setData(pr.data.data || []);
      if (em.data?.success) setEmployees(em.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const res = await apiClient.post('/api/partner-accounting/payroll', {
        ...v,
        amount: Number(v.amount),
        date: v.date?.toISOString(),
      });
      if (res.data?.success) { message.success('Eklendi'); setModalOpen(false); form.resetFields(); load(); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setSaving(false); }
  };

  const onPay = async (id: string) => {
    try {
      const res = await apiClient.post(`/api/partner-accounting/payroll/${id}/pay`, { accountKey: 'CASH_TRY' });
      if (res.data?.success) { message.success('Ödendi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const onDel = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/payroll/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Tarih', dataIndex: 'date', width: 110, render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
    { title: 'Personel', dataIndex: 'employee', render: (e: any) => e ? `${e.firstName} ${e.lastName}` : '-' },
    { title: 'Görev', dataIndex: 'employee', width: 120, render: (e:any) => e?.jobTitle && <Tag>{e.jobTitle}</Tag> },
    { title: 'Tür', dataIndex: 'type', width: 110, render: (v: string) => <Tag color={TYPE_COLOR[v]}>{TYPES.find(t=>t.value===v)?.label||v}</Tag> },
    { title: 'Dönem', width: 110, render: (_:any,r:any)=> r.periodYear ? `${r.periodMonth}/${r.periodYear}` : '-' },
    { title: 'Tutar', dataIndex: 'amount', width: 140, align: 'right', render: (v: number, r:any) => <b>{fmt(Number(v), r.currency)}</b> },
    { title: 'Ödendi', dataIndex: 'paid', width: 90, render: (v: boolean) => v ? <Tag color="green">Evet</Tag> : <Tag color="orange">Hayır</Tag> },
    { title: 'Açıklama', dataIndex: 'description' },
    { title: '', width: 130, fixed: 'right', render: (_:any,r:any)=>(
      <Space size={4}>
        {!r.paid && <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={()=>onPay(r.id)}>Öde</Button>}
        {!r.paid && <Button size="small" danger icon={<DeleteOutlined />} onClick={()=>onDel(r.id)} />}
      </Space>
    ) },
  ];

  return (
    <>
      <Card title={<span><UserOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Hakediş & Maaş</span>} size="small"
        extra={
          <Space>
            <Select placeholder="Tüm türler" allowClear style={{ width: 140 }} value={type} onChange={(v)=>{ setType(v); setTimeout(load, 0); }} options={TYPES} />
            <Select placeholder="Ödeme" allowClear style={{ width: 130 }} value={paid} onChange={(v)=>{ setPaid(v); setTimeout(load, 0); }} options={[{value:'true',label:'Ödendi'},{value:'false',label:'Bekliyor'}]} />
            <Button icon={<DownloadOutlined />} onClick={() => exportResource('payroll', 'hakedis-maas')}>CSV</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ type: 'SALARY', date: dayjs(), periodYear: dayjs().year(), periodMonth: dayjs().month()+1 }); setModalOpen(true); }}>Yeni Bordro</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 1100 }} />
      </Card>

      <Modal title="Yeni Bordro" open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={onAdd} confirmLoading={saving} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <Form.Item label="Personel" name="employeeId" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={employees.map((e:any)=>({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.jobTitle||'-'})` }))} />
          </Form.Item>
          <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Tür" name="type" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
            <Form.Item label="Tutar" name="amount" rules={[{ required: true }]}><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Dönem Yılı" name="periodYear"><InputNumber min={2000} max={2100} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Dönem Ayı" name="periodMonth"><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Tarih" name="date"><DatePicker style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{value:'TRY'},{value:'USD'},{value:'EUR'}]} /></Form.Item>
            <Form.Item label="Açıklama" name="description" style={{ gridColumn: '1 / 3' }}><Input /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
