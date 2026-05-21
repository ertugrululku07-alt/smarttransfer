'use client';

import React, { useEffect, useState } from 'react';
import { Card, Empty, Spin, Tag, Tooltip } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  WalletOutlined,
  BankOutlined,
  FileTextOutlined,
  WarningOutlined,
  TeamOutlined,
  ClockCircleOutlined,
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

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/partner-accounting/dashboard');
      if (res.data?.success) setData(res.data.data);
    } finally {
      setLoading(false);
    }
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

      {data.overdueInvoices.length > 0 && (
        <div className="ps-card" style={{ padding: 14, borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, color: '#b91c1c' }}>
            <WarningOutlined /> Vadesi Geçmiş Faturalar ({data.overdueInvoices.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.overdueInvoices.map((inv) => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>
                <span><b>{inv.invoiceNo}</b> · {inv.counterpartyName || inv.account?.name || '-'}</span>
                <span style={{ color: '#991b1b' }}>{fmt(Number(inv.grandTotal), inv.currency)} · {dayjs(inv.dueDate).format('DD.MM.YYYY')}</span>
              </div>
            ))}
          </div>
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
