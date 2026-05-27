'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Empty, Input, Modal, Space, Spin, Table, Tag, message } from 'antd';
import { BarChartOutlined, ReloadOutlined, RiseOutlined, FallOutlined, MailOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

export default function ReportsPage() {
  const [range, setRange] = useState<any>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [income, setIncome] = useState<any>(null);
  const [trial, setTrial] = useState<any>(null);
  const [cashflow, setCashflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [emailModal, setEmailModal] = useState<{ open: boolean; to: string; sending: boolean }>({ open: false, to: '', sending: false });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (range?.[0]) params.from = range[0].toISOString();
      if (range?.[1]) params.to = range[1].toISOString();
      const [a, b, c] = await Promise.allSettled([
        apiClient.get('/api/partner-accounting/reports/income-statement', { params }),
        apiClient.get('/api/partner-accounting/reports/trial-balance'),
        apiClient.get('/api/partner-accounting/reports/cash-flow', { params }),
      ]);
      if (a.status === 'fulfilled' && a.value.data?.success) setIncome(a.value.data.data);
      if (b.status === 'fulfilled' && b.value.data?.success) setTrial(b.value.data.data);
      if (c.status === 'fulfilled' && c.value.data?.success) setCashflow(c.value.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card size="small" title={<span><BarChartOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Dönemsel Raporlar</span>}
        extra={
          <Space>
            <DatePicker.RangePicker value={range} onChange={(v) => setRange(v)} />
            <Button icon={<ReloadOutlined />} onClick={load}>Hesapla</Button>
            <Button icon={<MailOutlined />} onClick={() => setEmailModal({ open: true, to: '', sending: false })}>Aylık Rapor E-postala</Button>
          </Space>
        }
      >
        {income ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <Stat label="Net Satış" value={fmt(income.revenue.salesNet)} accent="#10b981" icon={<RiseOutlined />} />
            <Stat label="Diğer Gelir" value={fmt(income.revenue.otherIncome)} accent="#0ea5e9" />
            <Stat label="Toplam Gelir" value={fmt(income.revenue.total)} accent="#16a34a" />
            <Stat label="Alış Maliyeti" value={fmt(income.costs.total)} accent="#ef4444" icon={<FallOutlined />} />
            <Stat label="Brüt Kâr" value={fmt(income.grossProfit)} accent={income.grossProfit >= 0 ? '#10b981' : '#ef4444'} />
            <Stat label="Operasyon Gideri" value={fmt(income.operatingExpenses.total)} accent="#f59e0b" />
            <Stat label="Personel Gideri" value={fmt(income.payroll.total)} accent="#a855f7" />
            <Stat label="EBIT (Faaliyet Kârı)" value={fmt(income.ebit)} accent={income.ebit >= 0 ? '#10b981' : '#ef4444'} bold />
          </div>
        ) : <Empty />}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
        <Card size="small" title="Gelir Tablosu (Detay)">
          {!income ? <Empty /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <Row label="Net Satış (KDV hariç)" value={income.revenue.salesNet} />
                <Row label="Diğer Gelir" value={income.revenue.otherIncome} />
                <Row label="Toplam Gelir" value={income.revenue.total} bold />
                <Sep />
                <Row label="Alış Maliyeti (-)" value={-income.costs.total} />
                <Row label="Brüt Kâr" value={income.grossProfit} bold />
                <Sep />
                <Row label="Fatura Giderleri (-)" value={-income.operatingExpenses.invoiceExpenses} />
                <Row label="Diğer Giderler (-)" value={-income.operatingExpenses.otherExpenses} />
                <Row label="Personel Giderleri (-)" value={-income.payroll.total} />
                <Sep />
                <Row label="EBIT (Faaliyet Kâr/Zararı)" value={income.ebit} bold />
              </tbody>
            </table>
          )}
        </Card>

        <Card size="small" title="Nakit Akış">
          {!cashflow ? <Empty /> : (
            <Table
              rowKey="accountKey"
              size="small"
              pagination={false}
              dataSource={cashflow.accounts}
              columns={[
                { title: 'Hesap', dataIndex: 'accountKey' },
                { title: 'Giriş', dataIndex: 'in', align: 'right', render: (v: number) => <span style={{ color: '#10b981' }}>{fmt(Number(v))}</span> },
                { title: 'Çıkış', dataIndex: 'out', align: 'right', render: (v: number) => <span style={{ color: '#ef4444' }}>{fmt(Number(v))}</span> },
                { title: 'Net', dataIndex: 'net', align: 'right', render: (v: number) => <b style={{ color: Number(v) >= 0 ? '#10b981' : '#ef4444' }}>{fmt(Number(v))}</b> },
              ]}
            />
          )}
        </Card>
      </div>

      <Card size="small" title="Mizan (Genel Bakiye)">
        {!trial ? <Empty /> : (
          <>
            <Table
              rowKey="id"
              size="small"
              dataSource={trial.rows}
              pagination={{ pageSize: 20, size: 'small' }}
              columns={[
                { title: 'Kod', dataIndex: 'code', width: 110 },
                { title: 'Cari', dataIndex: 'name' },
                { title: 'Tip', dataIndex: 'type', width: 110, render: (v: string) => <Tag>{v}</Tag> },
                { title: 'Borç', dataIndex: 'debit', width: 140, align: 'right', render: (v: number, r: any) => fmt(Number(v), r.currency) },
                { title: 'Alacak', dataIndex: 'credit', width: 140, align: 'right', render: (v: number, r: any) => fmt(Number(v), r.currency) },
                { title: 'Bakiye', dataIndex: 'balance', width: 140, align: 'right', render: (v: number, r: any) => <b style={{ color: Number(v) > 0 ? '#10b981' : Number(v) < 0 ? '#ef4444' : '#64748b' }}>{fmt(Number(v), r.currency)}</b> },
              ]}
            />
            <div style={{ marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 8, display: 'flex', justifyContent: 'flex-end', gap: 30, fontSize: 13 }}>
              <span>Toplam Borç: <b>{fmt(trial.totals.debit)}</b></span>
              <span>Toplam Alacak: <b>{fmt(trial.totals.credit)}</b></span>
              <span>Fark: <b style={{ color: trial.totals.debit - trial.totals.credit === 0 ? '#10b981' : '#ef4444' }}>{fmt(trial.totals.debit - trial.totals.credit)}</b></span>
            </div>
          </>
        )}
      </Card>

      <Modal
        title="Aylık Konsolide Raporu E-Postala"
        open={emailModal.open}
        onCancel={() => setEmailModal({ open: false, to: '', sending: false })}
        onOk={async () => {
          if (!emailModal.to) { message.warning('Alıcı e-posta gerekli'); return; }
          setEmailModal((m) => ({ ...m, sending: true }));
          try {
            const res = await apiClient.post('/api/partner-accounting/reports/monthly/email', {
              to: emailModal.to,
              periodYear: (range?.[0] || dayjs()).year(),
              periodMonth: (range?.[0] || dayjs()).month() + 1,
            });
            if (res.data?.success) {
              message.success(res.data.message || 'Gönderildi');
              setEmailModal({ open: false, to: '', sending: false });
            }
          } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); setEmailModal((m) => ({ ...m, sending: false })); }
        }}
        confirmLoading={emailModal.sending}
        okText="Gönder"
        cancelText="Vazgeç"
      >
        <p style={{ fontSize: 12, color: '#64748b' }}>Seçili ayın özet KPI'ları, gelir tablosu ve mizan tek bir HTML rapor olarak SMTP üzerinden gönderilir.</p>
        <Input prefix={<MailOutlined />} placeholder="alici@firma.com" value={emailModal.to} onChange={(e) => setEmailModal((m) => ({ ...m, to: e.target.value }))} />
      </Modal>
    </div>
  );
}

function Stat({ label, value, accent, icon, bold }: { label: string; value: string; accent?: string; icon?: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', background: '#fff', borderLeft: `3px solid ${accent || '#6366f1'}` }}>
      <div style={{ fontSize: 11, color: '#64748b' }}>{icon} {label}</div>
      <div style={{ fontSize: bold ? 20 : 17, fontWeight: bold ? 800 : 700, color: '#0f172a', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: bold ? 700 : 500 }}>{label}</td>
      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: bold ? 800 : 600, color: value >= 0 ? '#0f172a' : '#ef4444' }}>{fmt(value)}</td>
    </tr>
  );
}

function Sep() { return <tr><td colSpan={2} style={{ height: 6 }}></td></tr>; }
