'use client';

import React, { useEffect, useState } from 'react';
import {
  Button, Card, DatePicker, Form, Input, Modal, Select, Space, Spin, Table, Tag, message,
} from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

export default function AccountStatementPage() {
  const params = useParams<{ id: string }>();
  const accountId = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (range?.[0]) params.from = range[0].toISOString();
      if (range?.[1]) params.to = range[1].toISOString();
      const res = await apiClient.get(`/api/partner-accounting/accounts/${accountId}/statement`, { params });
      if (res.data?.success) setData(res.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (accountId) load(); }, [accountId]);

  const onAdd = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const res = await apiClient.post(`/api/partner-accounting/accounts/${accountId}/transactions`, {
        ...v,
        amount: Number(v.amount),
        date: v.date ? v.date.toISOString() : undefined,
      });
      if (res.data?.success) {
        message.success('Hareket eklendi');
        setModalOpen(false);
        form.resetFields();
        load();
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setSaving(false); }
  };

  const onDel = async (id: string) => {
    if (!window.confirm('Hareket silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/transactions/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return <div>Bulunamadı</div>;

  const account = data.account;
  const columns: any[] = [
    { title: 'Tarih', dataIndex: 'date', width: 130, render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
    { title: 'Açıklama', dataIndex: 'description', render: (v: string, r: any) => v || r.source },
    { title: 'Kaynak', dataIndex: 'source', width: 110, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Borç', dataIndex: 'amount', width: 130, align: 'right', render: (v: number, r: any) => !r.isCredit ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(Number(v), r.currency)}</span> : '-' },
    { title: 'Alacak', dataIndex: 'amount', width: 130, align: 'right', render: (v: number, r: any) => r.isCredit ? <span style={{ color: '#10b981', fontWeight: 700 }}>{fmt(Number(v), r.currency)}</span> : '-' },
    { title: 'Bakiye', dataIndex: 'runningBalance', width: 140, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v), r.currency)}</b> },
    { title: '', width: 50, fixed: 'right', render: (_: any, r: any) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDel(r.id)} /> },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small">
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Link href="/partner/finance/accounts"><Button icon={<ArrowLeftOutlined />} size="small">Geri</Button></Link>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{account.name}</span>
            <Tag color="blue">{account.code}</Tag>
            <Tag>{account.type}</Tag>
          </Space>
          <Space>
            <DatePicker.RangePicker value={range} onChange={(v)=>{ setRange(v); setTimeout(load, 0); }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Yeni Hareket</Button>
          </Space>
        </Space>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
          <div className="ps-kpi"><div className="ps-kpi__label">Borç Toplamı</div><div className="ps-kpi__value" style={{ color: '#ef4444' }}>{fmt(data.totals.debit, account.currency)}</div></div>
          <div className="ps-kpi"><div className="ps-kpi__label">Alacak Toplamı</div><div className="ps-kpi__value" style={{ color: '#10b981' }}>{fmt(data.totals.credit, account.currency)}</div></div>
          <div className="ps-kpi"><div className="ps-kpi__label">Bakiye</div><div className="ps-kpi__value">{fmt(data.totals.balance, account.currency)}</div></div>
        </div>
      </Card>

      <Card title={<span><FileTextOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Hareketler</span>} size="small">
        <Table
          rowKey="id"
          dataSource={data.entries}
          columns={columns}
          size="small"
          pagination={{ pageSize: 30, size: 'small' }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title="Manuel Cari Hareketi"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={onAdd}
        confirmLoading={saving}
        okText="Kaydet"
        cancelText="Vazgeç"
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Yön" name="isCredit" initialValue={false} rules={[{ required: true }]}>
              <Select options={[
                { value: false, label: 'Borç (Cariden alacak)' },
                { value: true, label: 'Alacak (Cariye ödeme)' },
              ]} />
            </Form.Item>
            <Form.Item label="Tutar" name="amount" rules={[{ required: true }]}>
              <Input type="number" step="0.01" />
            </Form.Item>
            <Form.Item label="Tarih" name="date"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Ödeme Yöntemi" name="paymentMethod">
              <Select allowClear options={[
                { value: 'CASH', label: 'Nakit' },
                { value: 'BANK', label: 'Banka' },
                { value: 'CREDIT_CARD', label: 'Kredi Kartı' },
                { value: 'CHEQUE', label: 'Çek/Senet' },
              ]} />
            </Form.Item>
            <Form.Item label="Belge No" name="documentNo"><Input /></Form.Item>
            <Form.Item label="Açıklama" name="description" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
