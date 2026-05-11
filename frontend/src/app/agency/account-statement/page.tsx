'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Typography, Space, Tag, DatePicker, Row, Col, Button, Alert, Tabs } from 'antd';
import { PrinterOutlined, ArrowUpOutlined, ArrowDownOutlined, FileTextOutlined, CalendarOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../AgencyLayout';
import AgencyGuard from '../AgencyGuard';
import { useDefinitions } from '@/app/hooks/useDefinitions';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface TransactionEntry {
    id: string;
    date: string;
    type: string;
    amount: number;
    currency: string;
    isCredit: boolean;
    description: string;
    personnelName: string;
    referenceData?: string;
    runningBalance: number;
}

interface CurrencySummary {
    currency: string;
    totalCredit: number;
    totalDebit: number;
    balance: number;
}

// Dynamic color palette for currencies (auto-assigned based on index)
const COLOR_PALETTE = [
    { bg: '#eff6ff', border: '#93c5fd', text: '#2563eb' },
    { bg: '#f5f3ff', border: '#c4b5fd', text: '#7c3aed' },
    { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' },
    { bg: '#fef3c7', border: '#fcd34d', text: '#d97706' },
    { bg: '#fdf2f8', border: '#f9a8d4', text: '#db2777' },
    { bg: '#ecfeff', border: '#67e8f9', text: '#0891b2' },
    { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
    { bg: '#f0f9ff', border: '#7dd3fc', text: '#0284c7' },
];

const TX_TYPE_MAP: Record<string, { label: string; color: string }> = {
    PURCHASE_INVOICE: { label: 'Transfer Satın Alma', color: 'red' },
    SALES_INVOICE: { label: 'Acente Komisyon/Kâr', color: 'green' },
    DEPOSIT: { label: 'Depozito Yükleme', color: 'cyan' },
    MANUAL_IN: { label: 'Cari Giriş (Alacak)', color: 'green' },
    MANUAL_OUT: { label: 'Cari Çıkış (Borç)', color: 'red' },
    PAYMENT_RECEIVED: { label: 'Tahsilat / İade', color: 'lime' },
    PAYMENT_SENT: { label: 'Ödeme / Tediye', color: 'orange' },
    SALARY: { label: 'Hakediş / Maaş', color: 'purple' },
};


export default function AccountStatementPage() {
    const { currencies: defCurrencies } = useDefinitions();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
    const [currencySummaries, setCurrencySummaries] = useState<CurrencySummary[]>([]);
    const [apiCurrencies, setApiCurrencies] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [error, setError] = useState<string | null>(null);
    const [agencyInfo, setAgencyInfo] = useState<any>(null);
    const [activeCurrency, setActiveCurrency] = useState<string>('ALL');

    // Dynamic currency helpers from system definitions
    const getCurrencySymbol = (code: string) => {
        const c = defCurrencies.find(cur => cur.code === code);
        return c?.symbol || code + ' ';
    };
    const getCurrencyColor = (code: string) => {
        const idx = defCurrencies.findIndex(c => c.code === code);
        return COLOR_PALETTE[idx >= 0 ? idx % COLOR_PALETTE.length : 0];
    };
    const fmtMoney = (amount: number, currency: string) => {
        const sym = getCurrencySymbol(currency);
        return `${sym}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    useEffect(() => {
        fetchAgencyInfo();
        fetchStatement();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchAgencyInfo = async () => {
        try {
            const res = await apiClient.get('/api/agency/settings');
            if (res.data.success) setAgencyInfo(res.data.data);
        } catch (err) { console.error('Failed to fetch agency info', err); }
    };

    const fetchStatement = async (dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null]) => {
        setLoading(true);
        setError(null);
        try {
            let url = '/api/agency/statement';
            const rangeToUse = dates !== undefined ? dates : dateRange;
            if (rangeToUse[0] && rangeToUse[1]) {
                url += `?startDate=${rangeToUse[0].format('YYYY-MM-DD')}&endDate=${rangeToUse[1].format('YYYY-MM-DD')}`;
            }
            const res = await apiClient.get(url);
            if (res.data.success) {
                setTransactions(res.data.data.transactions || []);
                setCurrencySummaries(res.data.data.currencySummaries || []);
                if (res.data.data.supportedCurrencies) setApiCurrencies(res.data.data.supportedCurrencies);
            } else {
                setError(res.data.error || 'Ekstre alınamadı');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Ekstre yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (dates: any) => {
        setDateRange(dates || [null, null]);
        fetchStatement(dates || [null, null]);
    };

    const filteredTransactions = useMemo(() => {
        if (activeCurrency === 'ALL') return transactions;
        return transactions.filter(t => t.currency === activeCurrency);
    }, [transactions, activeCurrency]);

    const currencies = useMemo(() => {
        // Use system definitions as primary source
        const set = new Set(defCurrencies.map(c => c.code));
        // Fallback: API-returned supportedCurrencies
        apiCurrencies.forEach(c => set.add(c));
        // Also include any currencies found in transactions/summaries
        transactions.forEach(t => set.add(t.currency));
        currencySummaries.forEach(s => set.add(s.currency));
        return Array.from(set).sort();
    }, [transactions, currencySummaries, defCurrencies, apiCurrencies]);

    const getSummary = (cur: string): CurrencySummary => {
        return currencySummaries.find(s => s.currency === cur) || { currency: cur, totalCredit: 0, totalDebit: 0, balance: 0 };
    };

    const columns = [
        {
            title: 'Tarih',
            dataIndex: 'date',
            key: 'date',
            width: 140,
            render: (text: string) => (
                <Text style={{ whiteSpace: 'nowrap', fontSize: 12 }}><CalendarOutlined style={{ marginRight: 4 }} />{dayjs(text).format('DD.MM.YYYY HH:mm')}</Text>
            ),
        },
        {
            title: 'İşlem',
            dataIndex: 'type',
            key: 'type',
            width: 180,
            render: (type: string, record: TransactionEntry) => {
                const meta = TX_TYPE_MAP[type] || { label: type, color: 'default' };
                return (
                    <div>
                        <Tag color={meta.color} style={{ marginBottom: 2 }}>{meta.label}</Tag>
                        {record.referenceData && <div style={{ fontSize: 11, color: '#8c8c8c' }}>PNR: {record.referenceData}</div>}
                    </div>
                );
            }
        },
        {
            title: 'Açıklama',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: 'Döviz',
            dataIndex: 'currency',
            key: 'currency',
            width: 70,
            render: (cur: string) => {
                const colors = getCurrencyColor(cur);
                return <Tag style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, fontWeight: 700, fontSize: 11 }}>{cur}</Tag>;
            }
        },
        {
            title: 'İşlemi Yapan',
            dataIndex: 'personnelName',
            key: 'personnelName',
            width: 150,
            render: (text: string) => <Text style={{ fontSize: 12 }}><UserOutlined style={{ color: '#8c8c8c', marginRight: 4 }} />{text}</Text>
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            key: 'amount',
            width: 140,
            align: 'right' as const,
            render: (amount: number, record: TransactionEntry) => (
                <Text strong style={{ color: record.isCredit ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                    {record.isCredit ? '+' : '-'}{fmtMoney(amount, record.currency)}
                </Text>
            )
        },
        {
            title: 'Bakiye',
            dataIndex: 'runningBalance',
            key: 'runningBalance',
            width: 140,
            align: 'right' as const,
            render: (bal: number, record: TransactionEntry) => (
                <Text strong style={{ color: bal >= 0 ? '#2563eb' : '#dc2626', fontSize: 13 }}>{fmtMoney(bal, record.currency)}</Text>
            )
        }
    ];

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="account-statement">
                <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px' }} className="print-container">
                    
                    {/* Header */}
                    <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FileTextOutlined /> Hesap Ekstresi
                            </Title>
                            <Text type="secondary">Tüm para birimleri ayrı ayrı takip edilir. Detaylı cari hesap özeti.</Text>
                        </div>
                        <Space wrap>
                            <RangePicker value={dateRange} onChange={handleDateChange} format="DD.MM.YYYY" />
                            <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>Yazdır / PDF</Button>
                        </Space>
                    </div>

                    {/* Print Header */}
                    <div className="print-only" style={{ display: 'none', marginBottom: 30 }}>
                        <Row justify="space-between" align="middle" style={{ borderBottom: '2px solid #000', paddingBottom: 16 }}>
                            <Col>
                                <Title level={2} style={{ margin: 0, color: '#000' }}>HESAP EKSTRESİ</Title>
                                <Text strong style={{ fontSize: 16 }}>{agencyInfo?.companyName || 'Acente'}</Text>
                                <div><Text>{agencyInfo?.contactEmail} | {agencyInfo?.contactPhone}</Text></div>
                            </Col>
                            <Col style={{ textAlign: 'right' }}>
                                <Text type="secondary" style={{ display: 'block' }}>Tarih</Text>
                                <Text strong>{dayjs().format('DD.MM.YYYY HH:mm')}</Text>
                                {(dateRange[0] && dateRange[1]) && (
                                    <div style={{ marginTop: 4 }}>
                                        <Text type="secondary">Dönem: </Text>
                                        <Text strong>{dateRange[0].format('DD.MM.YYYY')} - {dateRange[1].format('DD.MM.YYYY')}</Text>
                                    </div>
                                )}
                            </Col>
                        </Row>
                    </div>

                    {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} className="no-print" />}

                    {/* Per-Currency Balance Cards */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        {currencies.length === 0 && !loading && (
                            <Col span={24}>
                                <Card style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                                    Henüz işlem kaydı bulunmuyor
                                </Card>
                            </Col>
                        )}
                        {currencies.map(cur => {
                            const s = getSummary(cur);
                            const colors = getCurrencyColor(cur);
                            return (
                                <Col xs={24} sm={12} md={8} key={cur}>
                                    <Card
                                        className="stat-card"
                                        style={{
                                            borderRadius: 16, height: '100%',
                                            border: `2px solid ${colors.border}`,
                                            background: `linear-gradient(135deg, ${colors.bg}, #fff)`,
                                            cursor: 'pointer',
                                            boxShadow: activeCurrency === cur ? `0 0 0 3px ${colors.border}` : 'none',
                                            transition: 'all 0.2s'
                                        }}
                                        styles={{ body: { padding: '16px 20px' } }}
                                        onClick={() => setActiveCurrency(activeCurrency === cur ? 'ALL' : cur)}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Tag style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, fontWeight: 800, fontSize: 14, padding: '2px 12px' }}>{cur}</Tag>
                                            <Text style={{ color: colors.text, fontWeight: 800, fontSize: 22 }}>{fmtMoney(s.balance, cur)}</Text>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                            <span style={{ color: '#16a34a' }}><ArrowUpOutlined /> {fmtMoney(s.totalCredit, cur)}</span>
                                            <span style={{ color: '#dc2626' }}><ArrowDownOutlined /> {fmtMoney(s.totalDebit, cur)}</span>
                                        </div>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>

                    {/* Currency Filter Tabs */}
                    {currencies.length > 1 && (
                        <div className="no-print" style={{ marginBottom: 8 }}>
                            <Tabs
                                activeKey={activeCurrency}
                                onChange={setActiveCurrency}
                                size="small"
                                items={[
                                    { key: 'ALL', label: `Tümü (${transactions.length})` },
                                    ...currencies.map(cur => ({
                                        key: cur,
                                        label: `${cur} (${transactions.filter(t => t.currency === cur).length})`
                                    }))
                                ]}
                            />
                        </div>
                    )}

                    <Card variant="borderless" className="table-card" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: 12 }}>
                        <Table
                            dataSource={filteredTransactions}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 100, hideOnSinglePage: true, size: 'small', className: 'no-print' }}
                            size="middle"
                            scroll={{ x: 900 }}
                        />
                    </Card>

                    <style jsx global>{`
                        @media print {
                            body, html, #__next, .ant-layout {
                                display: block !important;
                                width: 100% !important;
                                max-width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background: #fff !important;
                                position: static !important;
                            }
                            .ant-layout-sider, .ant-layout-header, .no-print { display: none !important; }
                            .ant-layout-content { margin: 0 !important; padding: 0 !important; overflow: visible !important; }
                            .print-only { display: block !important; }
                            .print-container { max-width: 100% !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
                            @page { margin: 10mm 15mm; size: a4 portrait; }
                            .stat-card { border: 1px solid #d9d9d9 !important; box-shadow: none !important; break-inside: avoid; }
                            .table-card { box-shadow: none !important; border: none !important; }
                            .ant-table-thead > tr > th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; border-bottom: 2px solid #000 !important; font-weight: bold !important; padding: 6px !important; font-size: 11px !important; }
                            .ant-table-tbody > tr > td { border-bottom: 1px solid #eee !important; padding: 5px 6px !important; font-size: 10px !important; }
                            .ant-tag { border: 1px solid #ccc !important; background: transparent !important; font-size: 9px !important; }
                        }
                    `}</style>
                </div>
            </AgencyLayout>
        </AgencyGuard>
    );
}
