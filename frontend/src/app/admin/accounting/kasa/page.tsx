'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import {
    Card, Table, Button, Tag, Typography, Row, Col, Statistic,
    Modal, Form, Input, InputNumber, Select, DatePicker,
    Tabs, message, Popconfirm, Space, Badge, Tooltip,
    Divider, Empty, Spin, Alert
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined,
    ArrowDownOutlined, BankOutlined, WalletOutlined, CreditCardOutlined,
    DollarOutlined, FilterOutlined, ReloadOutlined, CalculatorOutlined,
    CarryOutOutlined, CalendarOutlined, FileTextOutlined,
    ThunderboltOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.locale('tr');

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

/* ─── Types ──────────────────────────────────── */
interface KasaEntry {
    id: string; source: string; direction: 'IN' | 'OUT';
    date: string; amount: number; currency: string;
    accountType: string; accountCurrency: string;
    description: string; category: string;
    counterpart?: string; refNo?: string;
    notes?: string; paymentStatus?: string; readonly?: boolean;
}
interface AccountInfo { label: string; currency: string; icon: string; balance: number; in: number; out: number; }

/* ─── Config ─────────────────────────────────── */
const ACCOUNT_TYPES = [
    { value: 'TL_CASH', label: 'TL Kasa', icon: '💵', currency: 'TRY', color: '#16a34a' },
    { value: 'USD_CASH', label: 'Dolar Kasa', icon: '🇺🇸', currency: 'USD', color: '#2563eb' },
    { value: 'EUR_CASH', label: 'Euro Kasa', icon: '🇪🇺', currency: 'EUR', color: '#7c3aed' },
    { value: 'GBP_CASH', label: 'Sterlin Kasa', icon: '🇬🇧', currency: 'GBP', color: '#0891b2' },
    { value: 'BANK_TRY', label: 'Banka TL', icon: '🏦', currency: 'TRY', color: '#d97706' },
    { value: 'BANK_USD', label: 'Banka Dolar', icon: '🏦', currency: 'USD', color: '#dc2626' },
    { value: 'BANK_EUR', label: 'Banka Euro', icon: '🏦', currency: 'EUR', color: '#7c3aed' },
    { value: 'CREDIT_CARD', label: 'Kredi Kartı', icon: '💳', currency: 'TRY', color: '#6366f1' },
];

const CATEGORIES = [
    'Doğrudan Müşteri Satışı', 'Acente Satışı', 'Acente Depozitosu',
    'Genel Gelir', 'Genel Gider', 'Yakıt', 'Bakım-Onarım',
    'Maaş/Avans', 'Vergi/Sigorta', 'Kira', 'Fatura Ödemesi', 'Diğer',
];

const SOURCE_CFG: Record<string, { label: string; color: string }> = {
    MANUAL: { label: 'Manuel', color: '#6366f1' },
    BOOKING: { label: 'Rezervasyon', color: '#16a34a' },
    INVOICE: { label: 'Fatura', color: '#2563eb' },
    AGENCY: { label: 'Acente', color: '#d97706' },
};

/* ─── Formatter ──────────────────────────────── */
const fmt = (v: number, cur = 'TRY') =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ' + cur;

const GRAD: Record<string, string> = {
    TL_CASH: 'linear-gradient(135deg,#16a34a 0%,#4ade80 100%)',
    USD_CASH: 'linear-gradient(135deg,#2563eb 0%,#60a5fa 100%)',
    EUR_CASH: 'linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%)',
    GBP_CASH: 'linear-gradient(135deg,#0891b2 0%,#22d3ee 100%)',
    BANK_TRY: 'linear-gradient(135deg,#d97706 0%,#fbbf24 100%)',
    BANK_USD: 'linear-gradient(135deg,#dc2626 0%,#f87171 100%)',
    BANK_EUR: 'linear-gradient(135deg,#9333ea 0%,#c084fc 100%)',
    CREDIT_CARD: 'linear-gradient(135deg,#1e293b 0%,#475569 100%)',
};

/* ─── Main Component ─────────────────────────── */
const KasaPage: React.FC = () => {
    const { currencies: defCurrencies, defaultCurrency, loading: defLoading } = useDefinitions();
    const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
    const [entries, setEntries] = useState<KasaEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [entriesLoading, setEntriesLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<KasaEntry | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'), dayjs()
    ]);
    const [filterAccount, setFilterAccount] = useState<string>('');
    const [filterDir, setFilterDir] = useState<string>('');
    const [activeAccTab, setActiveAccTab] = useState('ALL');
    const [totals, setTotals] = useState({ in: 0, out: 0, net: 0 });

    const fetchAccounts = async () => {
        try {
            const r = await apiClient.get('/api/kasa/accounts');
            if (r.data.success) setAccounts(r.data.data);
        } catch { }
    };

    const fetchEntries = async () => {
        setEntriesLoading(true);
        try {
            const params: any = { limit: 1000 };
            if (dateRange[0]) params.from = dateRange[0].toISOString();
            if (dateRange[1]) params.to = dateRange[1].toISOString();
            if (filterAccount) params.accountType = filterAccount;
            if (filterDir) params.direction = filterDir;

            const r = await apiClient.get('/api/kasa/entries', { params });
            if (r.data.success) {
                setEntries(r.data.data.entries);
                setTotals(r.data.data.totals);
            }
        } catch { } finally { setEntriesLoading(false); }
    };

    const fetchAll = async () => {
        setLoading(true);
        await Promise.all([fetchAccounts(), fetchEntries()]);
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, []);
    useEffect(() => { fetchEntries(); }, [dateRange, filterAccount, filterDir]);

    // When definitions load, update form currency if modal is open and currency not yet set
    useEffect(() => {
        if (defCurrencies.length > 0 && modalOpen && !editing) {
            const curr = form.getFieldValue('currency');
            if (!curr) form.setFieldsValue({ currency: defaultCurrency?.code || defCurrencies[0]?.code });
        }
    }, [defCurrencies, modalOpen]);

    const openNew = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ date: dayjs(), direction: 'IN', accountType: 'TL_CASH', currency: defaultCurrency?.code || 'TRY' });
        setModalOpen(true);
    };

    const openEdit = (r: KasaEntry) => {
        setEditing(r);
        form.setFieldsValue({ ...r, date: dayjs(r.date) });
        setModalOpen(true);
    };

    const handleSave = async (vals: any) => {
        setSaving(true);
        try {
            const payload = { ...vals, date: vals.date?.toISOString() };
            if (editing) {
                await apiClient.put(`/api/kasa/entries/${editing.id}`, payload);
                message.success('Kayıt güncellendi');
            } else {
                await apiClient.post('/api/kasa/entries', payload);
                message.success('Kayıt eklendi');
            }
            setModalOpen(false);
            fetchAll();
        } catch (e: any) {
            message.error(e.response?.data?.error || 'Bir hata oluştu');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/kasa/entries/${id}`);
            message.success('Kayıt silindi');
            fetchAll();
        } catch { message.error('Silinemedi'); }
    };

    /* ─── Filtered entries for tab ─── */
    const filteredEntries = useMemo(() => {
        if (activeAccTab === 'ALL') return entries;
        return entries.filter(e => e.accountType === activeAccTab);
    }, [entries, activeAccTab]);

    /* ─── Table columns ─── */
    const columns = [
        {
            title: 'Tarih', dataIndex: 'date', width: 120,
            render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{dayjs(v).format('DD.MM.YYYY HH:mm')}</Text>,
            sorter: (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        },
        {
            title: 'Kaynak', dataIndex: 'source', width: 110,
            render: (v: string) => {
                const c = SOURCE_CFG[v] || { label: v, color: '#6b7280' };
                return <Tag style={{ borderRadius: 6, background: `${c.color}18`, color: c.color, border: `1px solid ${c.color}40`, fontSize: 10, fontWeight: 700 }}>{c.label}</Tag>;
            }
        },
        {
            title: 'Giriş / Çıkış', dataIndex: 'direction', width: 110, align: 'center' as const,
            render: (v: string) => v === 'IN'
                ? <Tag icon={<ArrowUpOutlined />} color="green" style={{ fontWeight: 700 }}>GELİR</Tag>
                : <Tag icon={<ArrowDownOutlined />} color="red" style={{ fontWeight: 700 }}>GİDER</Tag>
        },
        {
            title: 'Tutar', dataIndex: 'amount', width: 140, align: 'right' as const,
            sorter: (a: any, b: any) => a.amount - b.amount,
            render: (v: number, r: KasaEntry) => (
                <Text style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: r.direction === 'IN' ? '#16a34a' : '#dc2626' }}>
                    {r.direction === 'IN' ? '+' : '-'}{fmt(v, r.currency)}
                </Text>
            )
        },
        {
            title: 'Hesap', dataIndex: 'accountType', width: 130,
            render: (v: string) => {
                const cfg = ACCOUNT_TYPES.find(a => a.value === v);
                return cfg
                    ? <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.icon} {cfg.label}</span>
                    : <Text type="secondary">{v}</Text>;
            }
        },
        {
            title: 'Açıklama / Karşı Taraf', render: (_: any, r: KasaEntry) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{r.description}</div>
                    {r.counterpart && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.counterpart}</div>}
                    {r.refNo && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>Ref: {r.refNo}</Text>}
                </div>
            )
        },
        {
            title: 'Kategori', dataIndex: 'category', width: 160,
            render: (v: string) => <Tag style={{ borderRadius: 6, fontSize: 10 }}>{v || '—'}</Tag>
        },
        {
            title: '', key: 'actions', width: 80, align: 'center' as const,
            render: (_: any, r: KasaEntry) => r.readonly ? (
                <Tooltip title="Otomatik kayıt"><FileTextOutlined style={{ color: '#9ca3af' }} /></Tooltip>
            ) : (
                <Space size={4}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ borderRadius: 6 }} />
                    <Popconfirm title="Silinsin mi?" onConfirm={() => handleDelete(r.id)} okText="Evet" cancelText="İptal">
                        <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    /* ─── Account Drawer Cards ─── */
    const renderAccountCards = () => (
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
            {ACCOUNT_TYPES.map(acc => {
                const info = accounts[acc.value] || { balance: 0, in: 0, out: 0 };
                return (
                    <Col key={acc.value} xs={12} sm={8} md={6} xl={3}>
                        <Card
                            variant="borderless"
                            style={{ borderRadius: 16, background: GRAD[acc.value], border: 'none', cursor: 'pointer', transition: 'transform 0.2s', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                            bodyStyle={{ padding: '14px 16px' }}
                            onClick={() => setActiveAccTab(activeAccTab === acc.value ? 'ALL' : acc.value)}
                            hoverable
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 20 }}>{acc.icon}</span>
                                {activeAccTab === acc.value && <Badge count="●" style={{ background: 'transparent', color: '#fff', boxShadow: 'none', fontSize: 12 }} />}
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{acc.label}</div>
                            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: 'monospace', marginTop: 2, letterSpacing: '-0.5px' }}>
                                {fmt(info.balance, acc.currency)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>▲ {fmt(info.in, acc.currency)}</span>
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>▼ {fmt(info.out, acc.currency)}</span>
                            </div>
                        </Card>
                    </Col>
                );
            })}
        </Row>
    );

    /* ─── Summary Bar ─── */
    const renderSummaryBar = () => {
        const absoluteNetKasa = Object.values(accounts).reduce((s, a) => s + (a.balance || 0), 0);

        return (
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} md={6}>
                    <Card variant="borderless" style={{ borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }} bodyStyle={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, textTransform: 'uppercase' }}>Toplam Gelir</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', fontFamily: 'monospace' }}>+{fmt(totals.in)}</div>
                    </Card>
                </Col>
                <Col xs={24} md={6}>
                    <Card variant="borderless" style={{ borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5' }} bodyStyle={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>Toplam Gider</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', fontFamily: 'monospace' }}>-{fmt(totals.out)}</div>
                    </Card>
                </Col>
                <Col xs={24} md={6}>
                    <Card variant="borderless" style={{ borderRadius: 12, background: absoluteNetKasa >= 0 ? '#eff6ff' : '#fef2f2', border: `1px solid ${absoluteNetKasa >= 0 ? '#bfdbfe' : '#fca5a5'}` }} bodyStyle={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: absoluteNetKasa >= 0 ? '#2563eb' : '#dc2626' }}>Net Kasa</div>
                        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: absoluteNetKasa >= 0 ? '#2563eb' : '#dc2626' }}>
                            {absoluteNetKasa >= 0 ? '+' : ''}{fmt(absoluteNetKasa)}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} md={6}>
                    <Card variant="borderless" style={{ borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }} bodyStyle={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280' }}>Kayıt Sayısı</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{entries.length}</div>
                    </Card>
                </Col>
            </Row>
        )
    };

    if (loading) return (
        <AdminGuard>
            <AdminLayout selectedKey="kasa">
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                    <Spin size="large" tip="Kasa yükleniyor..." />
                </div>
            </AdminLayout>
        </AdminGuard>
    );

    return (
        <AdminGuard>
            <AdminLayout selectedKey="kasa">
                <div style={{ paddingBottom: 40 }}>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#16a34a,#4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 4px 16px rgba(22,163,74,0.3)' }}>
                                    💵
                                </div>
                                <div>
                                    <Title level={3} style={{ margin: 0, fontWeight: 800, color: '#111' }}>Kasa Yönetimi</Title>
                                    <Text type="secondary" style={{ fontSize: 13 }}>Tüm gelir, gider ve kasa hareketleri</Text>
                                </div>
                            </div>
                        </div>
                        <Space wrap>
                            <Button icon={<ReloadOutlined />} onClick={fetchAll} style={{ borderRadius: 8 }}>Yenile</Button>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={openNew}
                                style={{ borderRadius: 8, background: 'linear-gradient(135deg,#16a34a,#4ade80)', border: 'none', fontWeight: 700 }}
                            >
                                Gelir / Gider Ekle
                            </Button>
                        </Space>
                    </div>

                    {/* Account Drawers */}
                    {renderAccountCards()}

                    {/* Filters */}
                    <Card variant="borderless" style={{ borderRadius: 12, border: '1px solid #f0f0f0', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <FilterOutlined style={{ color: '#6b7280' }} />
                            <RangePicker
                                value={dateRange}
                                onChange={(r: any) => r && setDateRange(r)}
                                format="DD.MM.YYYY"
                                style={{ borderRadius: 8 }}
                                placeholder={['Başlangıç', 'Bitiş']}
                            />
                            <Select
                                allowClear
                                placeholder="Hesap tipi"
                                style={{ width: 170, borderRadius: 8 }}
                                value={filterAccount || undefined}
                                onChange={v => setFilterAccount(v || '')}
                            >
                                {ACCOUNT_TYPES.map(a => <Option key={a.value} value={a.value}>{a.icon} {a.label}</Option>)}
                            </Select>
                            <Select
                                allowClear
                                placeholder="Giriş/Çıkış"
                                style={{ width: 140, borderRadius: 8 }}
                                value={filterDir || undefined}
                                onChange={v => setFilterDir(v || '')}
                            >
                                <Option value="IN">▲ Gelir</Option>
                                <Option value="OUT">▼ Gider</Option>
                            </Select>
                            {activeAccTab !== 'ALL' && (
                                <Tag
                                    closable
                                    onClose={() => setActiveAccTab('ALL')}
                                    style={{ borderRadius: 8, fontWeight: 600, padding: '4px 10px' }}
                                    color="blue"
                                >
                                    {ACCOUNT_TYPES.find(a => a.value === activeAccTab)?.label} filtresi
                                </Tag>
                            )}
                        </div>
                    </Card>

                    {/* Summary Bar */}
                    {renderSummaryBar()}

                    {/* Unified Ledger */}
                    <Card
                        variant="borderless"
                        style={{ borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}
                        bodyStyle={{ padding: 0 }}
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                                <CalculatorOutlined style={{ color: '#16a34a' }} />
                                <span style={{ fontWeight: 700 }}>Kasa Defteri</span>
                                <Badge count={filteredEntries.length} color="#16a34a" />
                                {activeAccTab !== 'ALL' && (
                                    <Tag color="blue" style={{ borderRadius: 6, fontSize: 11 }}>
                                        {ACCOUNT_TYPES.find(a => a.value === activeAccTab)?.label}
                                    </Tag>
                                )}
                            </div>
                        }
                    >
                        <Table
                            dataSource={filteredEntries}
                            columns={columns}
                            rowKey="id"
                            loading={entriesLoading}
                            size="middle"
                            scroll={{ x: 1100 }}
                            pagination={{ pageSize: 25, showSizeChanger: true, showTotal: t => `${t} kayıt` }}
                            rowClassName={(r: KasaEntry) => r.direction === 'IN' ? 'row-income' : 'row-expense'}
                            locale={{ emptyText: <Empty description="Kayıt yok. Hesap seçin veya tarih aralığını değiştirin." /> }}
                            summary={() => (
                                <Table.Summary fixed>
                                    <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 700 }}>
                                        <Table.Summary.Cell index={0} colSpan={3}>
                                            <Text strong>TOPLAM ({filteredEntries.length} kayıt)</Text>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={3} align="right">
                                            <div>
                                                <div style={{ color: '#16a34a', fontFamily: 'monospace' }}>+{fmt(filteredEntries.filter(e => e.direction === 'IN').reduce((s, e) => s + e.amount, 0))}</div>
                                                <div style={{ color: '#dc2626', fontFamily: 'monospace' }}>-{fmt(filteredEntries.filter(e => e.direction === 'OUT').reduce((s, e) => s + e.amount, 0))}</div>
                                            </div>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={4} colSpan={5} />
                                    </Table.Summary.Row>
                                </Table.Summary>
                            )}
                        />
                    </Card>
                </div>

                {/* Row color styles */}
                <style>{`
                    .row-income td { background: #f0fdf450 !important; }
                    .row-expense td { background: #fef2f250 !important; }
                `}</style>

                {/* ── Add / Edit Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#16a34a,#4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>
                                {editing ? <EditOutlined /> : <PlusOutlined />}
                            </div>
                            <span>{editing ? 'Kasa Kaydı Düzenle' : 'Yeni Kasa Kaydı'}</span>
                        </div>
                    }
                    open={modalOpen}
                    onCancel={() => setModalOpen(false)}
                    footer={null}
                    width={640}
                    destroyOnClose
                >
                    <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item name="direction" label="İşlem Tipi" rules={[{ required: true }]}>
                                    <Select size="large" style={{ borderRadius: 8 }}>
                                        <Option value="IN">▲ Gelir (Giriş)</Option>
                                        <Option value="OUT">▼ Gider (Çıkış)</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="accountType" label="Hesap / Kasa" rules={[{ required: true }]}>
                                    <Select size="large" style={{ borderRadius: 8 }}>
                                        {ACCOUNT_TYPES.map(a => <Option key={a.value} value={a.value}>{a.icon} {a.label}</Option>)}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item name="amount" label="Tutar" rules={[{ required: true, message: 'Tutar giriniz' }]}>
                                    <InputNumber
                                        size="large" min={0} style={{ width: '100%', borderRadius: 8 }}
                                        formatter={v => v ? new Intl.NumberFormat('tr-TR').format(Number(v)) : ''}
                                        placeholder="0,00"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="currency" label="Para Birimi" rules={[{ required: true }]}>
                                    <Select size="large" style={{ borderRadius: 8 }} loading={defLoading} notFoundContent={defLoading ? 'Yükleniyor...' : 'Para birimi tanımlanmamış'}>
                                        {defCurrencies.map(c => (
                                            <Option key={c.code} value={c.code}>{c.symbol} {c.code}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item name="description" label="Açıklama" rules={[{ required: true, message: 'Açıklama giriniz' }]}>
                            <Input size="large" placeholder="Örn: Mustafa Bey – Havalimanı Transfer Ödemesi" style={{ borderRadius: 8 }} />
                        </Form.Item>

                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item name="category" label="Kategori">
                                    <Select size="large" style={{ borderRadius: 8 }} showSearch placeholder="Kategori seçin">
                                        {CATEGORIES.map(c => <Option key={c} value={c}>{c}</Option>)}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="date" label="Tarih" rules={[{ required: true }]}>
                                    <DatePicker size="large" style={{ width: '100%', borderRadius: 8 }} showTime format="DD.MM.YYYY HH:mm" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item name="counterpart" label="Karşı Taraf">
                                    <Input size="large" placeholder="Müşteri / Acente / Firma adı" style={{ borderRadius: 8 }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="refNo" label="Referans No">
                                    <Input size="large" placeholder="Fatura no, rezervasyon no vb." style={{ borderRadius: 8 }} />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item name="notes" label="Notlar">
                            <Input.TextArea rows={2} placeholder="Ek açıklama..." style={{ borderRadius: 8 }} />
                        </Form.Item>

                        <div style={{ textAlign: 'right', marginTop: 8 }}>
                            <Space>
                                <Button onClick={() => setModalOpen(false)} style={{ borderRadius: 8 }}>İptal</Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={saving}
                                    style={{ borderRadius: 8, background: 'linear-gradient(135deg,#16a34a,#4ade80)', border: 'none', minWidth: 120, fontWeight: 700 }}
                                >
                                    {editing ? 'Güncelle' : 'Kaydet'}
                                </Button>
                            </Space>
                        </div>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default KasaPage;
