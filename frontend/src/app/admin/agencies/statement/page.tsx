'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Card, Table, Typography, Space, Tag, DatePicker, Row, Col, Button, Alert,
    Tabs, Select, Modal, Form, InputNumber, Input, message, Empty
} from 'antd';
import {
    ArrowUpOutlined, ArrowDownOutlined, FileTextOutlined,
    CalendarOutlined, UserOutlined, PlusOutlined, BankOutlined,
    WalletOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import { useDefinitions } from '@/app/hooks/useDefinitions';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface Agency {
    id: string;
    name: string;
    companyName?: string;
}

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
    { bg: 'var(--brand-primary-08)', border: 'var(--brand-primary-20)', text: 'var(--brand-accent)' },
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

const TX_TYPE_OPTIONS = [
    { value: 'MANUAL_IN', label: 'Cari Giriş (Alacak)' },
    { value: 'MANUAL_OUT', label: 'Cari Çıkış (Borç)' },
    { value: 'DEPOSIT', label: 'Depozito' },
    { value: 'PAYMENT_RECEIVED', label: 'Tahsilat (Müşteri Ödemesi)' },
    { value: 'PAYMENT_SENT', label: 'Tediye (Bizim Ödememiz)' },
    { value: 'SALARY', label: 'Hakediş / Maaş' },
];


export default function AdminAgencyStatementPage() {
    const { currencies: defCurrencies } = useDefinitions();
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
    const [currencySummaries, setCurrencySummaries] = useState<CurrencySummary[]>([]);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [activeCurrency, setActiveCurrency] = useState<string>('ALL');
    const [error, setError] = useState<string | null>(null);

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
    const supportedCurrencies = defCurrencies.map(c => c.code);

    // Manual transaction modal
    const [txModalVisible, setTxModalVisible] = useState(false);
    const [txSaving, setTxSaving] = useState(false);
    const [txForm] = Form.useForm();

    useEffect(() => {
        fetchAgencies();
    }, []);

    const fetchAgencies = async () => {
        try {
            const res = await apiClient.get('/api/admin/agencies');
            if (res.data.success) setAgencies(res.data.data);
        } catch (err) { console.error(err); }
    };

    const fetchStatement = async (agencyId: string, dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null]) => {
        setLoading(true);
        setError(null);
        try {
            let url = `/api/admin/agencies/${agencyId}/statement`;
            const rangeToUse = dates !== undefined ? dates : dateRange;
            if (rangeToUse[0] && rangeToUse[1]) {
                url += `?startDate=${rangeToUse[0].format('YYYY-MM-DD')}&endDate=${rangeToUse[1].format('YYYY-MM-DD')}`;
            }
            const res = await apiClient.get(url);
            if (res.data.success) {
                setTransactions(res.data.data.transactions || []);
                setCurrencySummaries(res.data.data.currencySummaries || []);
            } else {
                setError(res.data.error || 'Ekstre alınamadı');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Ekstre yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleAgencyChange = (agencyId: string) => {
        setSelectedAgencyId(agencyId);
        setActiveCurrency('ALL');
        fetchStatement(agencyId);
    };

    const handleDateChange = (dates: any) => {
        setDateRange(dates || [null, null]);
        if (selectedAgencyId) fetchStatement(selectedAgencyId, dates || [null, null]);
    };

    const handleAddTransaction = async (values: any) => {
        if (!selectedAgencyId) return;
        setTxSaving(true);
        try {
            const isCredit = ['MANUAL_IN', 'DEPOSIT', 'PAYMENT_RECEIVED', 'SALARY'].includes(values.type);
            const res = await apiClient.post(`/api/admin/agencies/${selectedAgencyId}/transaction`, {
                amount: values.amount,
                currency: values.currency,
                isCredit,
                type: values.type,
                description: values.description
            });
            if (res.data.success) {
                message.success(res.data.message || 'İşlem kaydedildi');
                setTxModalVisible(false);
                txForm.resetFields();
                fetchStatement(selectedAgencyId);
            } else {
                message.error(res.data.error || 'Hata');
            }
        } catch (err: any) {
            message.error(err.response?.data?.error || 'İşlem kaydedilemedi');
        } finally {
            setTxSaving(false);
        }
    };

    const filteredTransactions = useMemo(() => {
        if (activeCurrency === 'ALL') return transactions;
        return transactions.filter(t => t.currency === activeCurrency);
    }, [transactions, activeCurrency]);

    const currencies = useMemo(() => {
        const set = new Set(defCurrencies.map(c => c.code));
        transactions.forEach(t => set.add(t.currency));
        currencySummaries.forEach(s => set.add(s.currency));
        return Array.from(set).sort();
    }, [transactions, currencySummaries, defCurrencies]);

    const getSummary = (cur: string): CurrencySummary => {
        return currencySummaries.find(s => s.currency === cur) || { currency: cur, totalCredit: 0, totalDebit: 0, balance: 0 };
    };

    const selectedAgency = agencies.find(a => a.id === selectedAgencyId);

    const columns = [
        {
            title: 'Tarih', dataIndex: 'date', key: 'date', width: 140,
            render: (text: string) => <Text style={{ whiteSpace: 'nowrap', fontSize: 12 }}><CalendarOutlined style={{ marginRight: 4 }} />{dayjs(text).format('DD.MM.YYYY HH:mm')}</Text>,
        },
        {
            title: 'İşlem', dataIndex: 'type', key: 'type', width: 180,
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
        { title: 'Açıklama', dataIndex: 'description', key: 'description', ellipsis: true },
        {
            title: 'Döviz', dataIndex: 'currency', key: 'currency', width: 70,
            render: (cur: string) => {
                const colors = getCurrencyColor(cur);
                return <Tag style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, fontWeight: 700, fontSize: 11 }}>{cur}</Tag>;
            }
        },
        {
            title: 'İşlemi Yapan', dataIndex: 'personnelName', key: 'personnelName', width: 150,
            render: (text: string) => <Text style={{ fontSize: 12 }}><UserOutlined style={{ color: '#8c8c8c', marginRight: 4 }} />{text}</Text>
        },
        {
            title: 'Tutar', dataIndex: 'amount', key: 'amount', width: 140, align: 'right' as const,
            render: (amount: number, record: TransactionEntry) => (
                <Text strong style={{ color: record.isCredit ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                    {record.isCredit ? '+' : '-'}{fmtMoney(amount, record.currency)}
                </Text>
            )
        },
        {
            title: 'Bakiye', dataIndex: 'runningBalance', key: 'runningBalance', width: 140, align: 'right' as const,
            render: (bal: number, record: TransactionEntry) => (
                <Text strong style={{ color: bal >= 0 ? '#2563eb' : '#dc2626', fontSize: 13 }}>{fmtMoney(bal, record.currency)}</Text>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="agency-statement">
                <div style={{ maxWidth: 1400, margin: '0 auto' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <Title level={2} style={{ margin: 0 }}><BankOutlined /> Acente Cari Hesap</Title>
                            <Text type="secondary">Tüm acentelerin cari hesaplarını para birimi bazında inceleyin ve manuel işlem girin.</Text>
                        </div>
                        <Space wrap>
                            <Select
                                showSearch
                                style={{ width: 280 }}
                                placeholder="Acente Seçin..."
                                value={selectedAgencyId}
                                onChange={handleAgencyChange}
                                optionFilterProp="label"
                                options={agencies.map(a => ({
                                    value: a.id,
                                    label: a.companyName || a.name
                                }))}
                            />
                            <RangePicker value={dateRange} onChange={handleDateChange} format="DD.MM.YYYY" />
                            {selectedAgencyId && (
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => { txForm.resetFields(); setTxModalVisible(true); }}>
                                    Manuel İşlem Ekle
                                </Button>
                            )}
                        </Space>
                    </div>

                    {!selectedAgencyId ? (
                        <Card style={{ textAlign: 'center', padding: 60 }}>
                            <Empty description="Lütfen cari hesabını görmek istediğiniz acenteyi seçin" />
                        </Card>
                    ) : (
                        <>
                            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

                            {/* Per-Currency Balance Cards */}
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                {currencies.length === 0 && !loading && (
                                    <Col span={24}>
                                        <Card style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                                            {selectedAgency?.companyName || selectedAgency?.name || 'Bu acente'} için henüz işlem kaydı bulunmuyor
                                        </Card>
                                    </Col>
                                )}
                                {currencies.map(cur => {
                                    const s = getSummary(cur);
                                    const colors = getCurrencyColor(cur);
                                    return (
                                        <Col xs={24} sm={12} md={8} lg={6} key={cur}>
                                            <Card
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
                                <div style={{ marginBottom: 8 }}>
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

                            <Card variant="borderless" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: 12 }}>
                                <Table
                                    dataSource={filteredTransactions}
                                    columns={columns}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 100, hideOnSinglePage: true, size: 'small' }}
                                    size="middle"
                                    scroll={{ x: 900 }}
                                />
                            </Card>
                        </>
                    )}

                    {/* Manual Transaction Modal */}
                    <Modal
                        title={<><WalletOutlined /> Manuel Cari İşlem Ekle — {selectedAgency?.companyName || selectedAgency?.name}</>}
                        open={txModalVisible}
                        onCancel={() => setTxModalVisible(false)}
                        footer={null}
                        width={520}
                    >
                        <Form form={txForm} layout="vertical" onFinish={handleAddTransaction} initialValues={{ currency: 'TRY', type: 'MANUAL_IN' }}>
                            <Form.Item name="type" label="İşlem Tipi" rules={[{ required: true }]}>
                                <Select options={TX_TYPE_OPTIONS} />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={16}>
                                    <Form.Item name="amount" label="Tutar" rules={[{ required: true, message: 'Tutar giriniz' }]}>
                                        <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={2} placeholder="0.00" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="currency" label="Döviz" rules={[{ required: true }]}>
                                        <Select>
                                            {supportedCurrencies.map(c => (
                                                <Select.Option key={c} value={c}>{getCurrencySymbol(c)} {c}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="description" label="Açıklama" rules={[{ required: true, message: 'Açıklama giriniz' }]}>
                                <TextArea rows={2} placeholder="İşlem açıklaması..." />
                            </Form.Item>
                            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                                <Space>
                                    <Button onClick={() => setTxModalVisible(false)}>İptal</Button>
                                    <Button type="primary" htmlType="submit" loading={txSaving}>Kaydet</Button>
                                </Space>
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
