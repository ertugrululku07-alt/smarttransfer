'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, message,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, CheckCircleOutlined,
  DollarOutlined, SendOutlined, CloseCircleOutlined, PrinterOutlined, MailOutlined,
  WhatsAppOutlined, DownloadOutlined, LinkOutlined, FileExcelOutlined, CloudUploadOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { API_URL } from '@/lib/config';
import { exportResourceXlsx } from '../exportHelper';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const TYPES = [
  { value: 'SALES', label: 'Satış Faturası' },
  { value: 'PURCHASE', label: 'Alış Faturası' },
  { value: 'EXPENSE', label: 'Masraf' },
  { value: 'RETURN_SALES', label: 'Satış İade' },
  { value: 'RETURN_PURCHASE', label: 'Alış İade' },
];
const KINDS = [
  { value: 'STANDARD', label: 'Kağıt' },
  { value: 'EFATURA', label: 'e-Fatura' },
  { value: 'EARCHIVE', label: 'e-Arşiv' },
  { value: 'EWAYBILL', label: 'e-İrsaliye' },
];
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'blue', SENT: 'geekblue', ACCEPTED: 'green',
  REJECTED: 'red', PAID: 'green', PARTIALLY_PAID: 'gold', CANCELLED: 'default',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Taslak', APPROVED: 'Onaylı', SENT: 'Gönderildi', ACCEPTED: 'Kabul',
  REJECTED: 'Red', PAID: 'Ödendi', PARTIALLY_PAID: 'Kısmi Ödeme', CANCELLED: 'İptal',
};

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

export default function InvoicesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [payModal, setPayModal] = useState<{ open: boolean; row?: any; amount: number; method: string }>({ open: false, amount: 0, method: 'CASH' });
  const [sendModal, setSendModal] = useState<{ open: boolean; row?: any; channel: 'email' | 'whatsapp'; to: string; message: string }>({ open: false, channel: 'email', to: '', message: '' });
  const [fromBookingModal, setFromBookingModal] = useState<{ open: boolean; loading: boolean; rows: any[]; selected?: any; kind: string; taxRate: number }>({ open: false, loading: false, rows: [], kind: 'EARCHIVE', taxRate: 20 });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const [invRes, accRes] = await Promise.all([
        apiClient.get('/api/partner-accounting/invoices', { params }),
        apiClient.get('/api/partner-accounting/accounts', { params: { isActive: true } }),
      ]);
      if (invRes.data?.success) setData(invRes.data.data || []);
      if (accRes.data?.success) setAccounts(accRes.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    form.resetFields();
    const next = await apiClient.get('/api/partner-accounting/invoices/next-no/SALES');
    form.setFieldsValue({
      type: 'SALES',
      kind: 'EARCHIVE',
      status: 'DRAFT',
      currency: 'TRY',
      issueDate: dayjs(),
      invoiceNo: next.data?.data?.invoiceNo || '',
      items: [{ description: '', quantity: 1, unitPrice: 0, taxRate: 20, discountRate: 0 }],
    });
    setModalOpen({ open: true });
  };

  const openEdit = (row: any) => {
    form.setFieldsValue({
      ...row,
      issueDate: row.issueDate ? dayjs(row.issueDate) : undefined,
      dueDate: row.dueDate ? dayjs(row.dueDate) : undefined,
      items: row.items?.map((it: any) => ({
        ...it,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        taxRate: Number(it.taxRate),
        discountRate: Number(it.discountRate),
      })) || [],
    });
    setModalOpen({ open: true, editing: row });
  };

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const payload = {
        ...v,
        issueDate: v.issueDate?.toISOString(),
        dueDate: v.dueDate?.toISOString(),
        items: (v.items || []).map((it: any, idx: number) => ({
          ...it,
          lineNo: idx + 1,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || 0),
          taxRate: Number(it.taxRate || 20),
          discountRate: Number(it.discountRate || 0),
          withholdingRate: Number(it.withholdingRate || 0),
        })),
      };
      const res = modalOpen.editing
        ? await apiClient.put(`/api/partner-accounting/invoices/${modalOpen.editing.id}`, payload)
        : await apiClient.post('/api/partner-accounting/invoices', payload);
      if (res.data?.success) {
        message.success('Kaydedildi');
        setModalOpen({ open: false });
        load();
      } else { message.error(res.data?.error || 'Hata'); }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setSaving(false); }
  };

  const onStatus = async (id: string, status: string) => {
    try {
      const res = await apiClient.patch(`/api/partner-accounting/invoices/${id}/status`, { status });
      if (res.data?.success) { message.success('Durum güncellendi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Taslak fatura silinsin mi?')) return;
    try {
      const res = await apiClient.delete(`/api/partner-accounting/invoices/${id}`);
      if (res.data?.success) { message.success('Silindi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const openPdf = (row: any) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    // Open authenticated PDF in a new window via fetch + blob
    fetch(`${API_URL}/api/partner-accounting/invoices/${row.id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.text())
      .then((html) => {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      })
      .catch(() => message.error('PDF açılamadı'));
  };

  const openSend = (row: any, channel: 'email' | 'whatsapp') => {
    setSendModal({
      open: true,
      row,
      channel,
      to: channel === 'email' ? (row.counterpartyEmail || '') : (row.counterpartyPhone || ''),
      message: '',
    });
  };

  const doSend = async () => {
    if (!sendModal.row) return;
    if (!sendModal.to) { message.warning(sendModal.channel === 'email' ? 'E-posta gerekli' : 'Telefon gerekli'); return; }
    try {
      const url = sendModal.channel === 'email'
        ? `/api/partner-accounting/invoices/${sendModal.row.id}/send-email`
        : `/api/partner-accounting/invoices/${sendModal.row.id}/send-whatsapp`;
      const payload: any = { message: sendModal.message || undefined };
      if (sendModal.channel === 'email') payload.to = sendModal.to;
      else payload.phone = sendModal.to;
      const res = await apiClient.post(url, payload);
      if (res.data?.success) {
        message.success(res.data.message || 'Gönderildi');
        setSendModal({ open: false, channel: 'email', to: '', message: '' });
      } else message.error(res.data?.error || 'Hata');
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const openFromBooking = async () => {
    setFromBookingModal({ open: true, loading: true, rows: [], kind: 'EARCHIVE', taxRate: 20 });
    try {
      const res = await apiClient.get('/api/partner-accounting/invoices/booking-candidates');
      if (res.data?.success) setFromBookingModal({ open: true, loading: false, rows: res.data.data || [], kind: 'EARCHIVE', taxRate: 20 });
    } catch { setFromBookingModal({ open: true, loading: false, rows: [], kind: 'EARCHIVE', taxRate: 20 }); }
  };

  const doFromBooking = async () => {
    if (!fromBookingModal.selected) { message.warning('Rezervasyon seçin'); return; }
    try {
      const res = await apiClient.post('/api/partner-accounting/invoices/from-booking', {
        bookingId: fromBookingModal.selected.id,
        kind: fromBookingModal.kind,
        taxRate: fromBookingModal.taxRate,
      });
      if (res.data?.success) {
        message.success('Fatura taslağı oluşturuldu');
        setFromBookingModal({ open: false, loading: false, rows: [], kind: 'EARCHIVE', taxRate: 20 });
        load();
      }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const downloadUbl = (row: any) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    fetch(`${API_URL}/api/partner-accounting/invoices/${row.id}/ubl`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${row.invoiceNo}.xml`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const sendToEinvoiceProvider = async (row: any) => {
    if (!window.confirm(`${row.invoiceNo} e-Fatura sağlayıcınıza gönderilecek. Devam edilsin mi?`)) return;
    try {
      const res = await apiClient.post(`/api/partner-accounting/invoices/${row.id}/efatura/send`);
      if (res.data?.success) { message.success('Sağlayıcıya gönderildi'); load(); }
      else message.error(res.data?.error || 'Gönderim başarısız');
    } catch (e: any) { message.error(e?.response?.data?.error || 'Gönderim başarısız'); }
  };

  const exportCsv = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    fetch(`${API_URL}/api/partner-accounting/exports/invoices`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faturalar-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => message.error('Export başarısız'));
  };

  const onPay = async () => {
    if (!payModal.row) return;
    if (!(payModal.amount > 0)) { message.warning('Tutar > 0 olmalı'); return; }
    try {
      const res = await apiClient.post(`/api/partner-accounting/invoices/${payModal.row.id}/payment`, {
        amount: payModal.amount,
        paymentMethod: payModal.method,
        accountKey: payModal.method === 'BANK' ? 'BANK_DEFAULT' : 'CASH_TRY',
      });
      if (res.data?.success) {
        message.success('Ödeme alındı');
        setPayModal({ open: false, amount: 0, method: 'CASH' });
        load();
      }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const columns: any[] = [
    { title: 'No', dataIndex: 'invoiceNo', width: 150, render: (v: string) => <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:6, fontSize: 11 }}>{v}</code> },
    { title: 'Tarih', dataIndex: 'issueDate', width: 110, render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
    { title: 'Tip', dataIndex: 'type', width: 130, render: (v: string) => <Tag>{TYPES.find(t=>t.value===v)?.label || v}</Tag> },
    { title: 'Tür', dataIndex: 'kind', width: 100, render: (v: string) => <Tag color={v==='EFATURA' ? 'blue' : v==='EARCHIVE' ? 'purple' : 'default'}>{v}</Tag> },
    { title: 'Cari', dataIndex: 'counterpartyName', render: (v: string, r: any) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v || r.account?.name || '-'}</div>
        {r.counterpartyTaxNumber && <div style={{ fontSize: 11, color: '#64748b' }}>VKN: {r.counterpartyTaxNumber}</div>}
      </div>
    ) },
    { title: 'KDV Hariç', dataIndex: 'subtotal', width: 120, align: 'right', render: (v: number, r: any) => fmt(Number(v), r.currency) },
    { title: 'KDV', dataIndex: 'taxTotal', width: 100, align: 'right', render: (v: number, r: any) => fmt(Number(v), r.currency) },
    { title: 'Toplam', dataIndex: 'grandTotal', width: 140, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v), r.currency)}</b> },
    { title: 'Ödenen', dataIndex: 'paidTotal', width: 120, align: 'right', render: (v: number, r: any) => <span style={{ color: '#10b981' }}>{fmt(Number(v), r.currency)}</span> },
    { title: 'Durum', dataIndex: 'status', width: 130, render: (v: string) => <Tag color={STATUS_COLOR[v] || 'default'}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '', width: 360, fixed: 'right', render: (_: any, r: any) => (
      <Space size={4}>
        <Tooltip title="PDF / Yazdır"><Button size="small" icon={<PrinterOutlined />} onClick={() => openPdf(r)} /></Tooltip>
        <Tooltip title="UBL XML İndir"><Button size="small" icon={<CodeOutlined />} onClick={() => downloadUbl(r)} /></Tooltip>
        {(r.kind === 'EFATURA' || r.kind === 'EARCHIVE') && ['APPROVED','DRAFT'].includes(r.status) && (
          <Tooltip title="e-Fatura Sağlayıcısına Gönder"><Button size="small" icon={<CloudUploadOutlined style={{ color: '#f59e0b' }} />} onClick={() => sendToEinvoiceProvider(r)} /></Tooltip>
        )}
        <Tooltip title="E-posta Gönder"><Button size="small" icon={<MailOutlined />} onClick={() => openSend(r, 'email')} /></Tooltip>
        <Tooltip title="WhatsApp Gönder"><Button size="small" icon={<WhatsAppOutlined style={{ color: '#16a34a' }} />} onClick={() => openSend(r, 'whatsapp')} /></Tooltip>
        {r.status === 'DRAFT' && <>
          <Tooltip title="Onayla"><Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onStatus(r.id, 'APPROVED')} /></Tooltip>
          <Tooltip title="Düzenle"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title="Sil"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r.id)} /></Tooltip>
        </>}
        {['APPROVED', 'SENT', 'ACCEPTED', 'PARTIALLY_PAID'].includes(r.status) && <>
          <Tooltip title="Ödeme Al"><Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => setPayModal({ open: true, row: r, amount: Math.max(0, Number(r.grandTotal) - Number(r.paidTotal)), method: 'CASH' })} /></Tooltip>
          {r.status === 'APPROVED' && (r.kind === 'EFATURA' || r.kind === 'EARCHIVE') && (
            <Tooltip title="GIB'e Gönder (simüle)"><Button size="small" icon={<SendOutlined />} onClick={() => onStatus(r.id, 'SENT')} /></Tooltip>
          )}
          {r.status !== 'PAID' && (
            <Tooltip title="İptal"><Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => onStatus(r.id, 'CANCELLED')} /></Tooltip>
          )}
        </>}
      </Space>
    ) },
  ];

  return (
    <>
      <Card
        title={<span><FileTextOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Faturalar</span>}
        size="small"
        extra={
          <Space>
            <Input.Search placeholder="Ara" allowClear value={search} onChange={(e)=>setSearch(e.target.value)} onSearch={load} style={{ width: 180 }} />
            <Select placeholder="Tip" allowClear style={{ width: 150 }} value={typeFilter} onChange={(v)=>{ setTypeFilter(v); setTimeout(load, 0); }} options={TYPES} />
            <Select placeholder="Durum" allowClear style={{ width: 140 }} value={statusFilter} onChange={(v)=>{ setStatusFilter(v); setTimeout(load, 0); }} options={Object.keys(STATUS_LABELS).map(k=>({ value: k, label: STATUS_LABELS[k] }))} />
            <Button icon={<DownloadOutlined />} onClick={exportCsv}>CSV</Button>
            <Button icon={<FileExcelOutlined style={{ color: '#16a34a' }} />} onClick={() => exportResourceXlsx('invoices', 'faturalar')}>Excel</Button>
            <Button icon={<LinkOutlined />} onClick={openFromBooking}>Rezervasyondan Oluştur</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Fatura</Button>
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
          scroll={{ x: 1500 }}
        />
      </Card>

      <Modal
        title={modalOpen.editing ? `Fatura Düzenle · ${modalOpen.editing.invoiceNo}` : 'Yeni Fatura'}
        open={modalOpen.open}
        onCancel={() => setModalOpen({ open: false })}
        onOk={onSave}
        confirmLoading={saving}
        width={900}
        okText={modalOpen.editing ? 'Güncelle' : 'Kaydet'}
        cancelText="Vazgeç"
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Form.Item label="Fatura No" name="invoiceNo" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="Seri" name="serieCode"><Input placeholder="ABC2026" /></Form.Item>
            <Form.Item label="Tip" name="type" rules={[{ required: true }]}><Select options={TYPES} /></Form.Item>
            <Form.Item label="Tür" name="kind"><Select options={KINDS} /></Form.Item>
            <Form.Item label="Cari" name="accountId" style={{ gridColumn: '1 / 3' }}>
              <Select
                allowClear showSearch optionFilterProp="label"
                options={accounts.map(a => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                onChange={(id) => {
                  const acc = accounts.find(a=>a.id===id);
                  if (acc) form.setFieldsValue({
                    counterpartyName: acc.name,
                    counterpartyTaxNumber: acc.taxNumber,
                    counterpartyTaxOffice: acc.taxOffice,
                    counterpartyAddress: acc.address,
                    counterpartyEmail: acc.email,
                    counterpartyPhone: acc.phone,
                    currency: acc.currency,
                  });
                }}
              />
            </Form.Item>
            <Form.Item label="Para Birimi" name="currency" initialValue="TRY"><Select options={[{value:'TRY'},{value:'USD'},{value:'EUR'}]} /></Form.Item>
            <Form.Item label="Senaryo" name="eInvoiceScenario"><Select allowClear options={[{value:'COMMERCIAL', label:'TİCARİ'},{value:'BASIC', label:'TEMEL'},{value:'EARCHIVE', label:'E-ARŞİV'}]} /></Form.Item>

            <Form.Item label="Cari Adı" name="counterpartyName" style={{ gridColumn: '1 / 3' }}><Input /></Form.Item>
            <Form.Item label="VKN/TCKN" name="counterpartyTaxNumber"><Input /></Form.Item>
            <Form.Item label="Vergi Dairesi" name="counterpartyTaxOffice"><Input /></Form.Item>
            <Form.Item label="Adres" name="counterpartyAddress" style={{ gridColumn: '1 / 3' }}><Input /></Form.Item>
            <Form.Item label="E-Posta" name="counterpartyEmail"><Input /></Form.Item>
            <Form.Item label="Telefon" name="counterpartyPhone"><Input /></Form.Item>

            <Form.Item label="Düzenleme Tarihi" name="issueDate"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Vade Tarihi" name="dueDate"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="Notlar" name="notes" style={{ gridColumn: '3 / 5' }}><Input /></Form.Item>
          </div>

          <div style={{ fontWeight: 700, margin: '10px 0', color: '#1e293b' }}>Kalemler</div>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 100px 100px 80px 100px 32px', gap: 6, alignItems: 'center' }}>
                    <Form.Item {...rest} name={[name, 'description']} rules={[{ required: true, message: '' }]} style={{ margin: 0 }}>
                      <Input placeholder="Açıklama" />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'quantity']} style={{ margin: 0 }}><InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="Miktar" /></Form.Item>
                    <Form.Item {...rest} name={[name, 'unit']} style={{ margin: 0 }}><Input placeholder="Birim" /></Form.Item>
                    <Form.Item {...rest} name={[name, 'unitPrice']} style={{ margin: 0 }}><InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="B. Fiyat" /></Form.Item>
                    <Form.Item {...rest} name={[name, 'discountRate']} style={{ margin: 0 }}><InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="İsk %" /></Form.Item>
                    <Form.Item {...rest} name={[name, 'taxRate']} style={{ margin: 0 }}><InputNumber min={0} max={50} style={{ width: '100%' }} placeholder="KDV %" /></Form.Item>
                    <Form.Item {...rest} name={[name, 'withholdingRate']} style={{ margin: 0 }}><InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="Tev %" /></Form.Item>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ description: '', quantity: 1, unitPrice: 0, taxRate: 20, discountRate: 0 })}>Kalem Ekle</Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title={sendModal.row ? `${sendModal.channel === 'email' ? 'E-posta' : 'WhatsApp'} Gönder · ${sendModal.row.invoiceNo}` : 'Gönder'}
        open={sendModal.open}
        onCancel={() => setSendModal({ open: false, channel: 'email', to: '', message: '' })}
        onOk={doSend}
        okText="Gönder"
        cancelText="Vazgeç"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Input
            prefix={sendModal.channel === 'email' ? <MailOutlined /> : <WhatsAppOutlined style={{ color: '#16a34a' }} />}
            placeholder={sendModal.channel === 'email' ? 'alici@firma.com' : '+90 555 ...'}
            value={sendModal.to}
            onChange={(e) => setSendModal({ ...sendModal, to: e.target.value })}
          />
          <Input.TextArea
            rows={3}
            placeholder="Ek mesaj (opsiyonel)"
            value={sendModal.message}
            onChange={(e) => setSendModal({ ...sendModal, message: e.target.value })}
          />
          <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: 12, color: '#64748b' }}>
            {sendModal.channel === 'email'
              ? 'Tanımlamalar > E-posta SMTP üzerinden fatura HTML olarak gönderilir.'
              : 'Tanımlamalar > WhatsApp sağlayıcınız üzerinden link içeren mesaj gönderilir.'}
          </div>
        </Space>
      </Modal>

      <Modal
        title="Rezervasyondan Fatura Oluştur"
        open={fromBookingModal.open}
        onCancel={() => setFromBookingModal({ ...fromBookingModal, open: false })}
        onOk={doFromBooking}
        okText="Fatura Oluştur"
        cancelText="Vazgeç"
        width={780}
        confirmLoading={fromBookingModal.loading}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Space wrap>
            <Select
              value={fromBookingModal.kind}
              onChange={(v) => setFromBookingModal({ ...fromBookingModal, kind: v })}
              options={KINDS}
              style={{ width: 200 }}
            />
            <Select
              value={fromBookingModal.taxRate}
              onChange={(v) => setFromBookingModal({ ...fromBookingModal, taxRate: v })}
              options={[
                { value: 0, label: 'KDV: %0' },
                { value: 1, label: 'KDV: %1' },
                { value: 10, label: 'KDV: %10' },
                { value: 20, label: 'KDV: %20' },
              ]}
              style={{ width: 140 }}
            />
            <span style={{ color: '#64748b', fontSize: 12 }}>
              Aday: {fromBookingModal.rows.length} rezervasyon
            </span>
          </Space>
          <Table
            rowKey="id"
            size="small"
            dataSource={fromBookingModal.rows}
            pagination={{ pageSize: 8, size: 'small' }}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: fromBookingModal.selected ? [fromBookingModal.selected.id] : [],
              onChange: (_, rows) => setFromBookingModal({ ...fromBookingModal, selected: rows[0] }),
            }}
            columns={[
              { title: 'T.KOD', dataIndex: 'bookingNumber', width: 130 },
              { title: 'Tarih', dataIndex: 'date', width: 110, render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
              { title: 'Müşteri', dataIndex: 'customerName' },
              { title: 'Güzergah', render: (_: any, r: any) => <span style={{ fontSize: 11 }}>{r.pickup} → {r.dropoff}</span> },
              { title: 'Tutar', dataIndex: 'total', width: 120, align: 'right', render: (v: number, r: any) => <b>{fmt(Number(v), r.currency)}</b> },
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title={payModal.row ? `Ödeme Al · ${payModal.row.invoiceNo}` : 'Ödeme Al'}
        open={payModal.open}
        onCancel={() => setPayModal({ open: false, amount: 0, method: 'CASH' })}
        onOk={onPay}
        okText="Tahsil Et"
        cancelText="Vazgeç"
      >
        {payModal.row && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ color: '#64748b', fontSize: 12 }}>
              Toplam: <b>{fmt(Number(payModal.row.grandTotal), payModal.row.currency)}</b>{' '}·{' '}
              Ödenen: <b>{fmt(Number(payModal.row.paidTotal), payModal.row.currency)}</b>{' '}·{' '}
              Kalan: <b style={{ color: '#ef4444' }}>{fmt(Number(payModal.row.grandTotal) - Number(payModal.row.paidTotal), payModal.row.currency)}</b>
            </div>
            <InputNumber min={0} step={0.01} value={payModal.amount} onChange={(v)=>setPayModal({ ...payModal, amount: Number(v||0) })} style={{ width: '100%' }} addonBefore="Tutar" />
            <Select value={payModal.method} onChange={(v)=>setPayModal({ ...payModal, method: v })} style={{ width: '100%' }} options={[
              { value: 'CASH', label: 'Nakit' },
              { value: 'BANK', label: 'Banka Havalesi' },
              { value: 'CREDIT_CARD', label: 'Kredi Kartı' },
            ]} />
          </Space>
        )}
      </Modal>
    </>
  );
}
