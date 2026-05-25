'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { CalendarOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import { exportResource, exportResourceXlsx } from '../exportHelper';

const TYPES = [
  { value: 'ANNUAL', label: 'Yıllık İzin' },
  { value: 'SICK', label: 'Raporlu' },
  { value: 'UNPAID', label: 'Ücretsiz' },
  { value: 'MATERNITY', label: 'Doğum' },
  { value: 'MARRIAGE', label: 'Evlilik' },
  { value: 'BEREAVEMENT', label: 'Vefat' },
  { value: 'OTHER', label: 'Diğer' },
];
const STATUS_LABELS: Record<string, string> = { PENDING:'Onay Bekliyor', APPROVED:'Onaylandı', REJECTED:'Reddedildi', CANCELLED:'İptal' };
const STATUS_COLOR: Record<string, string> = { PENDING:'orange', APPROVED:'green', REJECTED:'red', CANCELLED:'default' };

export default function LeavesPage() {
  const [data, setData] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (status) params.status = status;
      const [lv, em] = await Promise.all([
        apiClient.get('/api/partner-accounting/leaves', { params }),
        apiClient.get('/api/partner-accounting/employees'),
      ]);
      if (lv.data?.success) setData(lv.data.data || []);
      if (em.data?.success) setEmployees(em.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    try {
      const v = await form.validateFields();
      const res = await apiClient.post('/api/partner-accounting/leaves', {
        ...v,
        startDate: v.range[0].toISOString(),
        endDate: v.range[1].toISOString(),
      });
      if (res.data?.success) { message.success('İzin oluşturuldu'); setModalOpen(false); form.resetFields(); load(); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    }
  };

  const onStatus = async (id: string, status: string) => {
    try {
      const res = await apiClient.patch(`/api/partner-accounting/leaves/${id}`, { status });
      if (res.data?.success) { message.success('Güncellendi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const onDel = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/leaves/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Personel', dataIndex: 'employee', render: (e: any) => e ? `${e.firstName} ${e.lastName}` : '-' },
    { title: 'Tür', dataIndex: 'type', width: 130, render: (v: string) => <Tag>{TYPES.find(t=>t.value===v)?.label||v}</Tag> },
    { title: 'Başlangıç', dataIndex: 'startDate', width: 120, render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
    { title: 'Bitiş', dataIndex: 'endDate', width: 120, render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
    { title: 'Gün', dataIndex: 'days', width: 70, align: 'right' },
    { title: 'Durum', dataIndex: 'status', width: 130, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABELS[v]||v}</Tag> },
    { title: 'Sebep', dataIndex: 'reason' },
    { title: '', width: 160, fixed: 'right', render: (_:any,r:any) => (
      <Space size={4}>
        {r.status === 'PENDING' && <>
          <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={()=>onStatus(r.id, 'APPROVED')}>Onayla</Button>
          <Button size="small" danger icon={<CloseCircleOutlined />} onClick={()=>onStatus(r.id, 'REJECTED')} />
        </>}
        <Button size="small" danger icon={<DeleteOutlined />} onClick={()=>onDel(r.id)} />
      </Space>
    ) },
  ];

  return (
    <>
      <Card title={<span><CalendarOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> İzin Yönetimi</span>} size="small"
        extra={
          <Space>
            <Select placeholder="Tüm durumlar" allowClear style={{ width: 150 }} value={status} onChange={(v)=>{ setStatus(v); setTimeout(load, 0); }} options={Object.keys(STATUS_LABELS).map(k=>({ value: k, label: STATUS_LABELS[k] }))} />
            <Button icon={<DownloadOutlined />} onClick={() => exportResource('leaves', 'izinler')}>CSV</Button>
            <Button icon={<FileExcelOutlined style={{ color: '#16a34a' }} />} onClick={() => exportResourceXlsx('leaves', 'izinler')}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Yeni İzin</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={data} loading={loading} size="small" pagination={{ pageSize: 25, size: 'small' }} scroll={{ x: 1100 }} />
      </Card>

      <Modal title="Yeni İzin" open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={onAdd} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <Form.Item label="Personel" name="employeeId" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={employees.map((e:any)=>({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.jobTitle||'-'})` }))} />
          </Form.Item>
          <Form.Item label="Tür" name="type" initialValue="ANNUAL" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
          <Form.Item label="Tarih Aralığı" name="range" rules={[{ required: true }]}><DatePicker.RangePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="Sebep" name="reason"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
