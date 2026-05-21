'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { DollarOutlined, CheckCircleOutlined, PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import { exportResource } from '../exportHelper';

const STATUS_COLOR: Record<string, string> = { PENDING:'orange', HANDED_OVER:'blue', CONFIRMED:'green', REJECTED:'red' };
const STATUS_LABELS: Record<string, string> = { PENDING:'Bekliyor', HANDED_OVER:'Teslim Edildi', CONFIRMED:'Onaylı', REJECTED:'Reddedildi' };

function fmt(v: number, c = 'TRY') { return `${Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ${c}`; }

export default function CollectionsPage() {
  const [data, setData] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (status) params.status = status;
      const [collRes, drvRes] = await Promise.all([
        apiClient.get('/api/partner-accounting/collections', { params }),
        apiClient.get('/api/transfer/partner/my-drivers'),
      ]);
      if (collRes.data?.success) setData(collRes.data.data || []);
      if (drvRes.data?.success) setDrivers(drvRes.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    try {
      const v = await form.validateFields();
      const res = await apiClient.post('/api/partner-accounting/collections', {
        ...v,
        amount: Number(v.amount),
        date: v.date?.toISOString(),
      });
      if (res.data?.success) { message.success('Eklendi'); setModalOpen(false); form.resetFields(); load(); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    }
  };

  const onConfirm = async (id: string) => {
    try {
      const res = await apiClient.post(`/api/partner-accounting/collections/${id}/confirm`);
      if (res.data?.success) { message.success('Onaylandı'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const driverMap = new Map<string, any>(drivers.map(d => [d.id, d]));
  const cols: any[] = [
    { title: 'Tarih', dataIndex: 'date', width: 130, render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
    { title: 'Şoför', dataIndex: 'driverId', render: (id: string) => {
      const d = driverMap.get(id);
      return d ? `${d.firstName} ${d.lastName}` : id;
    } },
    { title: 'Yöntem', dataIndex: 'method', width: 110, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Tutar', dataIndex: 'amount', width: 140, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v), r.currency)}</b> },
    { title: 'Durum', dataIndex: 'status', width: 130, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABELS[v]||v}</Tag> },
    { title: 'Not', dataIndex: 'notes' },
    { title: '', width: 130, fixed: 'right', render: (_:any,r:any) =>
      r.status !== 'CONFIRMED' ? <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={()=>onConfirm(r.id)}>Onayla</Button> : '-'
    },
  ];

  return (
    <>
      <Card title={<span><DollarOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Şoför Tahsilatları</span>} size="small"
        extra={
          <Space>
            <Select placeholder="Tüm durumlar" allowClear style={{ width: 160 }} value={status} onChange={(v)=>{ setStatus(v); setTimeout(load, 0); }} options={Object.keys(STATUS_LABELS).map(k=>({value:k,label:STATUS_LABELS[k]}))} />
            <Button icon={<DownloadOutlined />} onClick={() => exportResource('collections', 'sofor-tahsilatlari')}>CSV</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Yeni Tahsilat</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 900 }} />
      </Card>

      <Modal title="Yeni Şoför Tahsilatı" open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={onAdd} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <Form.Item label="Şoför" name="driverId" rules={[{ required: true }]}>
            <Select options={drivers.map(d=>({ value: d.id, label: `${d.firstName} ${d.lastName}` }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
            <Form.Item label="Tutar" name="amount" rules={[{ required: true }]}><InputNumber min={0.01} step={0.01} style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Yöntem" name="method" initialValue="CASH"><Select options={[{value:'CASH',label:'Nakit'},{value:'POS',label:'POS'},{value:'TRANSFER',label:'Havale'}]} /></Form.Item>
            <Form.Item label="Tarih" name="date"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{value:'TRY'},{value:'USD'},{value:'EUR'}]} /></Form.Item>
            <Form.Item label="Not" name="notes" style={{ gridColumn: '1 / 3' }}><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
