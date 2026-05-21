'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, Space, Spin, Tag, Tooltip, message } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  WalletOutlined,
  BankOutlined,
  FileTextOutlined,
  WarningOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  MailOutlined,
  WhatsAppOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

type Dashboard = {
  kpis: {
    accountsCount: number;
    receivable: number;
    payable: number;
    invoicedMonth: number;
    paidMonth: number;
    cashIn: number;
    cashOut: number;
    netCashFlow: number;
    unpaidPayroll: number;
    unpaidPayrollCount: number;
  };
  recentInvoices: any[];
  recentLedger: any[];
  overdueInvoices: any[];
};

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="ps-card" style={{ padding: 16, borderTop: `3px solid ${color || '#6366f1'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [fx, setFx] = useState<{ updatedAt: string; rates: { code: string; forexBuying: number | null; forexSelling: number | null }[] } | null>(null);
  const [alerts, setAlerts] = useState<any>(null);
  const [reminding, setReminding] = useState<'EMAIL' | 'WHATSAPP' | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, f, a] = await Promise.allSettled([
        apiClient.get('/api/partner-accounting/dashboard'),
        apiClient.get('/api/partner-accounting/fx/rates'),
        apiClient.get('/api/partner-accounting/alerts'),
      ]);
      if (d.status === 'fulfilled' && d.value.data?.success) setData(d.value.data.data);
      if (f.status === 'fulfilled' && f.value.data?.success) setFx(f.value.data.data);
      if (a.status === 'fulfilled' && a.value.data?.success) setAlerts(a.value.data.data);
    } finally {
      setLoading(false);
    }
  };

  const sendReminders = async (channel: 'EMAIL' | 'WHATSAPP') => {
    if (!alerts?.overdueInvoices?.length) { message.info('Vadesi geçmiş fatura yok'); return; }
    const ids = alerts.overdueInvoices.map((i: any) => i.id);
    setReminding(channel);
    try {
      const res = await apiClient.post('/api/partner-accounting/alerts/remind-overdue', { channel, invoiceIds: ids });
      if (res.data?.success) {
        const failed = (res.data.errors || []).length;
        message.success(`${res.data.sent} hatırlatma gönderildi${failed ? ` · ${failed} hata` : ''}`);
      }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
    finally { setReminding(null); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Veri yok" />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Kpi icon={<RiseOutlined />} label="Alacaklar" value={fmt(data.kpis.receivable)} sub={`${data.kpis.accountsCount} cari`} color="#10b981" />
        <Kpi icon={<FallOutlined />} label="Borçlar" value={fmt(data.kpis.payable)} color="#ef4444" />
        <Kpi icon={<FileTextOutlined />} label="Bu Ay Fatura" value={fmt(data.kpis.invoicedMonth)} sub={`${fmt(data.kpis.paidMonth)} tahsil`} color="#6366f1" />
        <Kpi icon={<WalletOutlined />} label="Kasa Akışı (Ay)" value={fmt(data.kpis.netCashFlow)} sub={`+${fmt(data.kpis.cashIn)} / -${fmt(data.kpis.cashOut)}`} color="#0ea5e9" />
        <Kpi icon={<TeamOutlined />} label="Ödenmemiş Bordro" value={fmt(data.kpis.unpaidPayroll)} sub={`${data.kpis.unpaidPayrollCount} kayıt`} color="#f59e0b" />
      </div>

      {fx && fx.rates?.length > 0 && (
        <div className="ps-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>TCMB Döviz Kurları</div>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Güncelleme: {dayjs(fx.updatedAt).format('DD.MM.YYYY HH:mm')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {fx.rates.map((r) => (
              <div key={r.code} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{r.code}/TRY</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 13 }}>Alış {Number(r.forexBuying || 0).toFixed(4)}</span>
                  <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>Satış {Number(r.forexSelling || 0).toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts && (alerts.overdueInvoices.length + alerts.upcomingInvoices.length + alerts.unpaidPayroll.length + alerts.pendingLeaves.length + alerts.pendingCollections.length) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
          {alerts.overdueInvoices.length > 0 && (
            <Card size="small" title={<span style={{ color: '#b91c1c' }}><WarningOutlined /> Vadesi Geçmiş ({alerts.overdueInvoices.length})</span>}
              extra={
                <Space>
                  <Button size="small" icon={<MailOutlined />} loading={reminding === 'EMAIL'} onClick={() => sendReminders('EMAIL')}>E-posta hatırlat</Button>
                  <Button size="small" icon={<WhatsAppOutlined style={{ color: '#16a34a' }} />} loading={reminding === 'WHATSAPP'} onClick={() => sendReminders('WHATSAPP')}>WhatsApp</Button>
                </Space>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alerts.overdueInvoices.slice(0, 8).map((i: any) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#fef2f2', borderRadius: 8, fontSize: 12.5 }}>
                    <span><b>{i.invoiceNo}</b> · {i.counterparty || '-'} <Tag color="red" style={{ marginLeft: 4 }}>{i.daysOverdue} gün</Tag></span>
                    <span style={{ color: '#991b1b', fontWeight: 700 }}>{fmt(i.remaining, i.currency)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {alerts.upcomingInvoices.length > 0 && (
            <Card size="small" title={<span style={{ color: '#92400e' }}><AlertOutlined /> Yaklaşan Vade ({alerts.upcomingInvoices.length})</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alerts.upcomingInvoices.slice(0, 8).map((i: any) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#fffbeb', borderRadius: 8, fontSize: 12.5 }}>
                    <span><b>{i.invoiceNo}</b> · {i.counterparty || '-'} <Tag color="gold" style={{ marginLeft: 4 }}>{i.daysToDue} gün kaldı</Tag></span>
                    <span style={{ color: '#92400e', fontWeight: 700 }}>{fmt(i.remaining, i.currency)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {alerts.unpaidPayroll.length > 0 && (
            <Card size="small" title={<span><TeamOutlined /> Ödenmemiş Bordro ({alerts.unpaidPayroll.length})</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alerts.unpaidPayroll.slice(0, 8).map((p: any) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                    <span><b>{p.employee}</b> · <Tag>{p.type}</Tag></span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{fmt(p.amount, p.currency)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {alerts.pendingLeaves.length > 0 && (
            <Card size="small" title={<span><ClockCircleOutlined /> Bekleyen İzinler ({alerts.pendingLeaves.length})</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alerts.pendingLeaves.slice(0, 8).map((l: any) => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                    <span><b>{l.employee}</b> · {dayjs(l.startDate).format('DD.MM')} → {dayjs(l.endDate).format('DD.MM')} ({l.days}g)</span>
                    <Tag>{l.type}</Tag>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {alerts.pendingCollections.length > 0 && (
            <Card size="small" title={<span>Bekleyen Şoför Tahsilatları ({alerts.pendingCollections.length})</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alerts.pendingCollections.slice(0, 8).map((c: any) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                    <span><Tag>{c.status}</Tag> {dayjs(c.date).format('DD.MM.YYYY')}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(c.amount, c.currency)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
        <Card title={<span><FileTextOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Son Faturalar</span>} size="small">
          {data.recentInvoices.length === 0 ? <Empty description="Henüz fatura yok" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.recentInvoices.map((inv) => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#f8fafc', fontSize: 13 }}>
                  <div>
                    <b>{inv.invoiceNo}</b>{' '}
                    <Tag color={inv.type === 'SALES' ? 'green' : inv.type === 'PURCHASE' ? 'orange' : 'default'} style={{ fontSize: 10 }}>{inv.type}</Tag>
                    <Tag color={inv.kind === 'EFATURA' ? 'blue' : inv.kind === 'EARCHIVE' ? 'purple' : 'default'} style={{ fontSize: 10 }}>{inv.kind}</Tag>
                    <span style={{ color: '#64748b' }}> · {inv.counterpartyName || inv.account?.name || '-'}</span>
                  </div>
                  <div style={{ fontWeight: 700 }}>{fmt(Number(inv.grandTotal), inv.currency)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={<span><ClockCircleOutlined style={{ marginRight: 8, color: '#6366f1' }} /> Son Hareketler</span>} size="small">
          {data.recentLedger.length === 0 ? <Empty description="Hareket yok" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.recentLedger.map((l) => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: '#f8fafc', fontSize: 12.5 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{l.account?.name || '-'}</span>{' '}
                    <span style={{ color: '#64748b' }}>· {l.description || l.source}</span>
                  </div>
                  <div style={{ color: l.isCredit ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                    {l.isCredit ? '−' : '+'}{fmt(Number(l.amount), l.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
