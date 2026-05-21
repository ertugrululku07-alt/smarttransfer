'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, WalletOutlined, DeleteOutlined, DownloadOutlined, ImportOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import { exportResource, exportResourceXlsx } from '../exportHelper';

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

export default function CashPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountKey, setAccountKey] = useState<string | undefined>();
  const [range, setRange] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [importModal, setImportModal] = useState<{ open: boolean; format: 'CSV' | 'MT940'; content: string; accountKey: string; preview: any[]; loading: boolean }>({ open: false, format: 'CSV', content: '', accountKey: 'BANK_DEFAULT', preview: [], loading: false });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (accountKey) params.accountKey = accountKey;
      if (range?.[0]) params.from = range[0].toISOString();
      if (range?.[1]) params.to = range[1].toISOString();
      const [accRes, entRes] = await Promise.all([
        apiClient.get('/api/partner-accounting/cash/accounts'),
        apiClient.get('/api/partner-accounting/cash/entries', { params }),
      ]);
      if (accRes.data?.success) setAccounts(accRes.data.data || []);
      if (entRes.data?.success) setEntries(entRes.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const res = await apiClient.post('/api/partner-accounting/cash/entries', {
        ...v,
        amount: Number(v.amount),
        date: v.date?.toISOString(),
      });
      if (res.data?.success) {
        message.success('Kayıt eklendi');
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
    if (!window.confirm('Silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/cash/entries/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const onPreview = async () => {
    if (!importModal.content.trim()) { message.warning('İçerik gerekli'); return; }
    setImportModal((m) => ({ ...m, loading: true }));
    try {
      const res = await apiClient.post('/api/partner-accounting/bank-import/preview', { format: importModal.format, content: importModal.content });
      if (res.data?.success) setImportModal((m) => ({ ...m, preview: res.data.data || [], loading: false }));
      else { message.error(res.data?.error || 'Hata'); setImportModal((m) => ({ ...m, loading: false })); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); setImportModal((m) => ({ ...m, loading: false })); }
  };

  const onApplyImport = async () => {
    if (!importModal.preview.length) { message.warning('Önce önizleme yapın'); return; }
    try {
      const res = await apiClient.post('/api/partner-accounting/bank-import/apply', { accountKey: importModal.accountKey || 'BANK_DEFAULT', entries: importModal.preview });
      if (res.data?.success) {
        message.success(`${res.data.imported} kayıt aktarıldı`);
        setImportModal({ open: false, format: 'CSV', content: '', accountKey: 'BANK_DEFAULT', preview: [], loading: false });
        load();
      }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const cols: any[] = [
    { title: 'Tarih', dataIndex: 'date', width: 130, render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
    { title: 'Hesap', dataIndex: 'accountKey', width: 140, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Yön', dataIndex: 'direction', width: 80, render: (v: string) => <Tag color={v==='IN'?'green':v==='OUT'?'red':'blue'}>{v}</Tag> },
    { title: 'Açıklama', dataIndex: 'description' },
    { title: 'Tutar', dataIndex: 'amount', width: 140, align: 'right', render: (v: number, r: any) => <b style={{ color: r.direction==='IN'?'#10b981':'#ef4444' }}>{fmt(Number(v), r.currency)}</b> },
    { title: '', width: 50, render: (_:any, r:any) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDel(r.id)} /> },
  ];

  return (
    <>
      <Card title={<span><WalletOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Kasa & Banka</span>} size="small"
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportResource('cash', 'kasa-banka')}>CSV</Button>
            <Button icon={<FileExcelOutlined style={{ color: '#16a34a' }} />} onClick={() => exportResourceXlsx('cash', 'kasa-banka')}>Excel</Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModal((m) => ({ ...m, open: true }))}>Banka Aktarımı</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Yeni Kayıt</Button>
          </Space>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          {accounts.map((a) => (
            <div key={a.accountKey} className="ps-card" style={{ padding: 12, borderLeft: '3px solid #6366f1', cursor: 'pointer' }} onClick={() => { setAccountKey(a.accountKey); setTimeout(load, 0); }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{a.accountType}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{a.accountKey}</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800 }}>{fmt(a.balance, a.currency)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>+{fmt(a.in, a.currency)} / -{fmt(a.out, a.currency)}</div>
            </div>
          ))}
        </div>

        <Space wrap style={{ marginBottom: 10 }}>
          <Select placeholder="Tüm hesaplar" allowClear style={{ width: 200 }} value={accountKey} onChange={(v)=>{ setAccountKey(v); setTimeout(load, 0); }}
            options={accounts.map(a => ({ value: a.accountKey, label: a.accountKey }))}
          />
          <DatePicker.RangePicker value={range} onChange={(v)=>{ setRange(v); setTimeout(load, 0); }} />
        </Space>

        <Table rowKey="id" columns={cols} dataSource={entries} loading={loading} size="small" pagination={{ pageSize: 30, size: 'small' }} scroll={{ x: 900 }} />
      </Card>

      <Modal
        title="Banka Hesap Hareketi İçe Aktar"
        open={importModal.open}
        width={820}
        onCancel={() => setImportModal({ open: false, format: 'CSV', content: '', accountKey: 'BANK_DEFAULT', preview: [], loading: false })}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Space wrap>
            <Select value={importModal.format} onChange={(v) => setImportModal((m) => ({ ...m, format: v as any, preview: [] }))} style={{ width: 160 }} options={[
              { value: 'CSV', label: 'CSV (Excel/Banka)' },
              { value: 'MT940', label: 'MT940 (SWIFT)' },
            ]} />
            <Input
              style={{ width: 220 }}
              placeholder="Hedef hesap (örn: BANK_AKBANK)"
              value={importModal.accountKey}
              onChange={(e) => setImportModal((m) => ({ ...m, accountKey: e.target.value }))}
            />
            <Button onClick={onPreview} loading={importModal.loading}>Önizle</Button>
            <Button type="primary" onClick={onApplyImport} disabled={!importModal.preview.length}>{importModal.preview.length} kaydı Aktar</Button>
          </Space>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            CSV başlıkları için desteklenenler: <code>date/tarih</code>, <code>description/açıklama</code>, <code>amount/tutar</code> ya da <code>debit/borç</code> + <code>credit/alacak</code>, <code>currency/para birimi</code>. Tarih biçimi: <b>GG.AA.YYYY</b>, <b>GG/AA/YYYY</b> veya ISO.
          </div>
          <Input.TextArea
            rows={8}
            placeholder={importModal.format === 'MT940'
              ? ':20:STMT123\n:25:TR123\n:60F:C260101TRY1234,56\n:61:260101C100,00NTRF\n:86:Müşteri ödemesi'
              : 'tarih;açıklama;tutar;currency\n01.05.2026;Tedarikçi ödemesi;-1.500,00;TRY\n02.05.2026;Müşteri tahsilatı;3.200,00;TRY'}
            value={importModal.content}
            onChange={(e) => setImportModal((m) => ({ ...m, content: e.target.value, preview: [] }))}
          />
          {importModal.preview.length > 0 && (
            <Table
              rowKey={(r: any, i?: number) => `${r.date}-${r.amount}-${i}`}
              size="small"
              dataSource={importModal.preview}
              pagination={{ pageSize: 8, size: 'small' }}
              columns={[
                { title: 'Tarih', dataIndex: 'date', width: 130, render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
                { title: 'Yön', dataIndex: 'direction', width: 70, render: (v: string) => <Tag color={v === 'IN' ? 'green' : 'red'}>{v}</Tag> },
                { title: 'Tutar', dataIndex: 'amount', width: 130, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v), r.currency)}</b> },
                { title: 'Açıklama', dataIndex: 'description', ellipsis: true },
              ]}
            />
          )}
        </Space>
      </Modal>

      <Modal title="Yeni Kasa/Banka Kaydı" open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={onAdd} confirmLoading={saving} okText="Kaydet" cancelText="Vazgeç">
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item label="Hesap" name="accountKey" initialValue="CASH_TRY" rules={[{ required: true }]}><Input placeholder="CASH_TRY / BANK_xxxx" /></Form.Item>
            <Form.Item label="Tip" name="accountType" initialValue="CASH"><Select options={[{value:'CASH',label:'Kasa'},{value:'BANK',label:'Banka'},{value:'POS',label:'POS'}]} /></Form.Item>
            <Form.Item label="Yön" name="direction" initialValue="IN" rules={[{ required: true }]}><Select options={[{value:'IN',label:'Giriş'},{value:'OUT',label:'Çıkış'},{value:'TRANSFER',label:'Transfer'}]} /></Form.Item>
            <Form.Item label="Tutar" name="amount" rules={[{ required: true }]}><InputNumber min={0.01} step={0.01} style={{ width:'100%' }} /></Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{value:'TRY'},{value:'USD'},{value:'EUR'}]} /></Form.Item>
            <Form.Item label="Tarih" name="date"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Açıklama" name="description" style={{ gridColumn: '1 / 3' }}><Input /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
