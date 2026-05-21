'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Progress, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, DeleteOutlined, PieChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const CATS = [
  { value: 'FUEL', label: 'Yakıt' },
  { value: 'MAINTENANCE', label: 'Bakım-Onarım' },
  { value: 'INSURANCE', label: 'Sigorta' },
  { value: 'TAX', label: 'Vergi' },
  { value: 'SALARY', label: 'Maaş' },
  { value: 'ADVANCE', label: 'Avans' },
  { value: 'BONUS', label: 'Prim' },
  { value: 'TOLL', label: 'HGS/OGS' },
  { value: 'PARKING', label: 'Otopark' },
  { value: 'CLEANING', label: 'Temizlik' },
  { value: 'SPARE_PARTS', label: 'Yedek Parça' },
  { value: 'TIRE', label: 'Lastik' },
  { value: 'RENT', label: 'Kira' },
  { value: 'PENALTY', label: 'Ceza' },
  { value: 'OTHER_EXPENSE', label: 'Diğer Gider' },
];

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`;
}

export default function BudgetPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<any>(dayjs());
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/partner-accounting/budgets', { params: { periodYear: period.year(), periodMonth: period.month() + 1 } });
      if (res.data?.success) setRows(res.data.data.rows || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [period]);

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const res = await apiClient.post('/api/partner-accounting/budgets', {
        periodYear: period.year(),
        periodMonth: period.month() + 1,
        category: v.category,
        plannedAmount: Number(v.plannedAmount),
        currency: v.currency || 'TRY',
        notes: v.notes || null,
      });
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen(false); form.resetFields(); load(); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    }
  };

  const onDel = async (id: string) => {
    if (id.startsWith('unplanned-')) return;
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/budgets/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const totals = rows.reduce(
    (acc, r) => ({ planned: acc.planned + Number(r.plannedAmount || 0), actual: acc.actual + Number(r.actual || 0) }),
    { planned: 0, actual: 0 }
  );

  const cols: any[] = [
    { title: 'Kategori', dataIndex: 'category', render: (v: string) => <Tag>{CATS.find(c=>c.value===v)?.label || v}</Tag> },
    { title: 'Bütçe', dataIndex: 'plannedAmount', width: 160, align: 'right', render: (v: number, r:any) => fmt(Number(v), r.currency) },
    { title: 'Gerçekleşen', dataIndex: 'actual', width: 160, align: 'right', render: (v: number) => fmt(Number(v)) },
    { title: 'Fark', dataIndex: 'variance', width: 140, align: 'right', render: (v: number) => <b style={{ color: Number(v) >= 0 ? '#10b981' : '#ef4444' }}>{fmt(Number(v))}</b> },
    { title: 'Kullanım %', dataIndex: 'usagePct', width: 200, render: (v: number, r:any) => (
      <Progress percent={Math.min(200, Number(v))} size="small" strokeColor={r.usagePct > 100 ? '#ef4444' : r.usagePct > 80 ? '#f59e0b' : '#10b981'} />
    ) },
    { title: 'Not', dataIndex: 'notes' },
    { title: '', width: 50, fixed: 'right', render: (_:any,r:any) => !r.unplanned ? <Button size="small" danger icon={<DeleteOutlined />} onClick={()=>onDel(r.id)} /> : <Tag color="default">otomatik</Tag> },
  ];

  return (
    <>
      <Card title={<span><PieChartOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Bütçe Yönetimi</span>} size="small"
        extra={
          <Space>
            <DatePicker picker="month" value={period} onChange={(v)=>setPeriod(v || dayjs())} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Yeni Bütçe</Button>
          </Space>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div className="ps-kpi"><div className="ps-kpi__label">Planlanan</div><div className="ps-kpi__value">{fmt(totals.planned)}</div></div>
          <div className="ps-kpi"><div className="ps-kpi__label">Gerçekleşen</div><div className="ps-kpi__value">{fmt(totals.actual)}</div></div>
          <div className="ps-kpi">
            <div className="ps-kpi__label">Kalan / Aşım</div>
            <div className="ps-kpi__value" style={{ color: totals.planned - totals.actual >= 0 ? '#10b981' : '#ef4444' }}>{fmt(totals.planned - totals.actual)}</div>
          </div>
        </div>

        <Table rowKey="id" columns={cols} dataSource={rows} loading={loading} size="small" pagination={false} />
      </Card>

      <Modal title="Bütçe Kaydı" open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={onSave} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <Form.Item label="Kategori" name="category" rules={[{ required: true }]}>
            <Select options={CATS} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item label="Planlanan Tutar" name="plannedAmount" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{value:'TRY'},{value:'USD'},{value:'EUR'}]} /></Form.Item>
          <Form.Item label="Not" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
