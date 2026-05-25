'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { ClockCircleOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

function fmtH(v: number) { return `${Number(v || 0).toFixed(2)} sa`; }

export default function TimesheetsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<any>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (range?.[0]) params.from = range[0].toISOString();
      if (range?.[1]) params.to = range[1].toISOString();
      if (employeeId) params.employeeId = employeeId;
      const periodYear = (range?.[0] || dayjs()).year();
      const periodMonth = (range?.[0] || dayjs()).month() + 1;
      const [ts, em, sum] = await Promise.all([
        apiClient.get('/api/partner-accounting/timesheets', { params }),
        apiClient.get('/api/partner-accounting/employees'),
        apiClient.get('/api/partner-accounting/timesheets/summary', { params: { periodYear, periodMonth } }),
      ]);
      if (ts.data?.success) setRows(ts.data.data || []);
      if (em.data?.success) setEmployees(em.data.data || []);
      if (sum.data?.success) setSummary(sum.data.data.rows || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      const payload: any = {
        employeeId: v.employeeId,
        date: v.date?.toISOString(),
        clockIn: v.clockIn?.toISOString(),
        clockOut: v.clockOut?.toISOString(),
        breakMinutes: v.breakMinutes || 0,
        hourlyRate: v.hourlyRate || null,
        notes: v.notes || null,
      };
      const res = await apiClient.post('/api/partner-accounting/timesheets', payload);
      if (res.data?.success) { message.success('Kaydedildi'); setModalOpen(false); form.resetFields(); load(); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    }
  };

  const onDel = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/timesheets/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Tarih', dataIndex: 'date', width: 110, render: (v: string) => dayjs(v).format('DD.MM.YYYY ddd') },
    { title: 'Personel', dataIndex: 'employee', render: (e: any) => e ? `${e.firstName} ${e.lastName}` : '-' },
    { title: 'Giriş', dataIndex: 'clockIn', width: 90, render: (v: string) => v ? dayjs(v).format('HH:mm') : '-' },
    { title: 'Çıkış', dataIndex: 'clockOut', width: 90, render: (v: string) => v ? dayjs(v).format('HH:mm') : '-' },
    { title: 'Mola (dk)', dataIndex: 'breakMinutes', width: 90, align: 'right' },
    { title: 'Saat', dataIndex: 'hours', width: 90, align: 'right', render: (v: number) => <b>{fmtH(Number(v))}</b> },
    { title: 'Fazla', dataIndex: 'overtime', width: 90, align: 'right', render: (v: number) => Number(v) > 0 ? <Tag color="orange">+{fmtH(Number(v))}</Tag> : '-' },
    { title: 'Kaynak', dataIndex: 'source', width: 100, render: (v: string) => <Tag>{v || 'MANUAL'}</Tag> },
    { title: 'Not', dataIndex: 'notes' },
    { title: '', width: 50, fixed: 'right', render: (_:any,r:any)=> <Button size="small" danger icon={<DeleteOutlined />} onClick={()=>onDel(r.id)} /> },
  ];

  const sumCols: any[] = [
    { title: 'Personel', dataIndex: 'employee', render: (e: any) => e ? `${e.firstName} ${e.lastName}` : '-' },
    { title: 'Görev', dataIndex: 'employee', width: 120, render: (e: any) => e?.jobTitle && <Tag>{e.jobTitle}</Tag> },
    { title: 'Gün', dataIndex: 'days', width: 80, align: 'right' },
    { title: 'Toplam Saat', dataIndex: 'hours', width: 120, align: 'right', render: (v: number) => <b>{fmtH(Number(v))}</b> },
    { title: 'Fazla Mesai', dataIndex: 'overtime', width: 130, align: 'right', render: (v: number) => Number(v) > 0 ? <Tag color="orange">+{fmtH(Number(v))}</Tag> : '-' },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small" title={<span><ClockCircleOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Puantaj / Zaman Çizelgesi</span>}
        extra={
          <Space>
            <Select placeholder="Personel" allowClear style={{ width: 200 }} value={employeeId} onChange={(v)=>{ setEmployeeId(v); setTimeout(load, 0); }} options={employees.map(e=>({ value: e.id, label: `${e.firstName} ${e.lastName}` }))} showSearch optionFilterProp="label" />
            <DatePicker.RangePicker value={range} onChange={(v)=>{ setRange(v); setTimeout(load, 0); }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }}>Yeni Kayıt</Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={cols} dataSource={rows} loading={loading} size="small" pagination={{ pageSize: 30, size: 'small' }} scroll={{ x: 1100 }} />
      </Card>

      <Card size="small" title="Aylık Özet (seçili tarih aralığının ay başlangıcı)">
        <Table rowKey={(r:any) => r.employee?.id || Math.random().toString()} columns={sumCols} dataSource={summary} size="small" pagination={false} />
      </Card>

      <Modal title="Puantaj Kaydı" open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={onSave} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <Form.Item label="Personel" name="employeeId" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={employees.map((e:any)=>({ value: e.id, label: `${e.firstName} ${e.lastName}` }))} />
          </Form.Item>
          <Form.Item label="Tarih" name="date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Form.Item label="Giriş" name="clockIn"><DatePicker showTime format="HH:mm" style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Çıkış" name="clockOut"><DatePicker showTime format="HH:mm" style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Mola (dk)" name="breakMinutes" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item label="Saatlik Ücret (opsiyonel)" name="hourlyRate"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="Not" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
