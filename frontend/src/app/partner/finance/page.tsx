'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Card, Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select,
    DatePicker, message, Popconfirm, Tabs, Tooltip, Typography, Divider,
    Spin, Badge, Empty, Alert
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    ArrowUpOutlined, ArrowDownOutlined, SearchOutlined, FilterOutlined,
    DollarOutlined, CarOutlined, TeamOutlined, BarChartOutlined,
    CalendarOutlined, FileTextOutlined, SyncOutlined, WalletOutlined,
    FundOutlined, RiseOutlined, FallOutlined, BankOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import apiClient from '@/lib/api-client';
import { useDefinitions } from '@/app/hooks/useDefinitions';

dayjs.locale('tr');

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// Category configuration
const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; type: 'INCOME' | 'EXPENSE' }> = {
    BOOKING_INCOME: { label: 'Transfer Geliri', color: '#10b981', icon: <CarOutlined />, type: 'INCOME' },
    OTHER_INCOME: { label: 'Diger Gelir', color: '#6366f1', icon: <DollarOutlined />, type: 'INCOME' },
    FUEL: { label: 'Yakit', color: '#f59e0b', icon: <CarOutlined />, type: 'EXPENSE' },
    MAINTENANCE: { label: 'Bakim-Onarim', color: '#ef4444', icon: <CarOutlined />, type: 'EXPENSE' },
    INSURANCE: { label: 'Sigorta', color: '#8b5cf6', icon: <FileTextOutlined />, type: 'EXPENSE' },
    TAX: { label: 'Vergi', color: '#dc2626', icon: <BankOutlined />, type: 'EXPENSE' },
    PENALTY: { label: 'Ceza', color: '#991b1b', icon: <FileTextOutlined />, type: 'EXPENSE' },
    SALARY: { label: 'Maas', color: '#2563eb', icon: <TeamOutlined />, type: 'EXPENSE' },
    ADVANCE: { label: 'Avans', color: '#0891b2', icon: <TeamOutlined />, type: 'EXPENSE' },
    BONUS: { label: 'Prim', color: '#059669', icon: <TeamOutlined />, type: 'EXPENSE' },
    TOLL: { label: 'HGS/OGS', color: '#d97706', icon: <CarOutlined />, type: 'EXPENSE' },
    PARKING: { label: 'Otopark', color: '#7c3aed', icon: <CarOutlined />, type: 'EXPENSE' },
    CLEANING: { label: 'Yikama/Temizlik', color: '#ec4899', icon: <CarOutlined />, type: 'EXPENSE' },
    SPARE_PARTS: { label: 'Yedek Parca', color: '#b91c1c', icon: <CarOutlined />, type: 'EXPENSE' },
    TIRE: { label: 'Lastik', color: '#9333ea', icon: <CarOutlined />, type: 'EXPENSE' },
    RENT: { label: 'Kira', color: '#64748b', icon: <BankOutlined />, type: 'EXPENSE' },
    OTHER_EXPENSE: { label: 'Diger Gider', color: '#6b7280', icon: <FileTextOutlined />, type: 'EXPENSE' },
};

const PAYMENT_METHODS = [
    { value: 'CASH', label: 'Nakit' },
    { value: 'BANK_TRANSFER', label: 'Banka Havalesi/EFT' },
    { value: 'CREDIT_CARD', label: 'Kredi Karti' },
    { value: 'OTHER', label: 'Diger' },
];

const fmtCurrency = (v: number, cur = 'TRY') => {
    try {
        let safeCur = cur;
        if (safeCur === 'EURO') safeCur = 'EUR';
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: safeCur }).format(Number(v) || 0);
    } catch {
        return `${(Number(v) || 0).toFixed(2)} ${cur}`;
    }
};

interface FinanceEntry {
    id: string;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    amount: number;
    currency: string;
    description: string | null;
    date: string;
    relatedBookingId: string | null;
    relatedDriverId: string | null;
    relatedVehicleId: string | null;
    paymentMethod: string | null;
    receiptNo: string | null;
    notes: string | null;
    createdAt: string;
}

interface Stats {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
    entryCount: number;
    byCategory: Record<string, { income: number; expense: number }>;
    byCurrency: Record<string, { income: number; expense: number }>;
    monthlyTrend: Record<string, { income: number; expense: number }>;
    driverExpenses: Record<string, number>;
    vehicleExpenses: Record<string, number>;
}

const PartnerFinancePage: React.FC = () => {
    const { currencies: defCurrencies, defaultCurrency } = useDefinitions();
    const [entries, setEntries] = useState<FinanceEntry[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Filters
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const [searchText, setSearchText] = useState('');
    const [page, setPage] = useState(1);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<FinanceEntry | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [selectedType, setSelectedType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');

    // Syncing
    const [syncing, setSyncing] = useState(false);

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = { page, pageSize: 50 };
            if (typeFilter) params.type = typeFilter;
            if (categoryFilter) params.category = categoryFilter;
            if (dateRange) {
                params.dateFrom = dateRange[0].format('YYYY-MM-DD');
                params.dateTo = dateRange[1].format('YYYY-MM-DD');
            }
            if (searchText) params.search = searchText;
            const res = await apiClient.get('/api/transfer/partner/finance', { params });
            if (res.data.success) {
                setEntries(res.data.data || []);
                setTotal(res.data.total || 0);
            }
        } catch { /* silent */ } finally { setLoading(false); }
    }, [page, typeFilter, categoryFilter, dateRange, searchText]);

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const params: any = {};
            if (dateRange) {
                params.dateFrom = dateRange[0].format('YYYY-MM-DD');
                params.dateTo = dateRange[1].format('YYYY-MM-DD');
            }
            const res = await apiClient.get('/api/transfer/partner/finance/stats', { params });
            if (res.data.success) setStats(res.data.data);
        } catch { /* silent */ } finally { setStatsLoading(false); }
    }, [dateRange]);

    const loadAux = async () => {
        try {
            const [dRes, vRes] = await Promise.all([
                apiClient.get('/api/transfer/partner/my-drivers').catch(() => ({ data: { success: false } })),
                apiClient.get('/api/transfer/partner/my-vehicles').catch(() => ({ data: { success: false } })),
            ]);
            if (dRes.data?.success) setDrivers(dRes.data.data || []);
            if (vRes.data?.success) setVehicles(vRes.data.data?.vehicles || vRes.data.data || []);
        } catch { /* silent */ }
    };

    useEffect(() => { loadEntries(); }, [loadEntries]);
    useEffect(() => { loadStats(); }, [loadStats]);
    useEffect(() => { loadAux(); }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await apiClient.post('/api/transfer/partner/finance/sync-bookings');
            if (res.data.success) {
                message.success(res.data.message || 'Senkronizasyon tamamlandi');
                loadEntries();
                loadStats();
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Senkronizasyon basarisiz');
        } finally { setSyncing(false); }
    };

    const handleAdd = (type: 'INCOME' | 'EXPENSE') => {
        setEditing(null);
        setSelectedType(type);
        form.resetFields();
        const defCur = defCurrencies.find((c: any) => c.isDefault)?.code || defaultCurrency?.code || 'TRY';
        form.setFieldsValue({ type, currency: defCur, date: dayjs() });
        setModalOpen(true);
    };

    const handleEdit = (record: FinanceEntry) => {
        setEditing(record);
        setSelectedType(record.type);
        form.setFieldsValue({
            ...record,
            date: dayjs(record.date),
        });
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await apiClient.delete(`/api/transfer/partner/finance/${id}`);
            if (res.data.success) { message.success('Kayit silindi'); loadEntries(); loadStats(); }
        } catch (e: any) { message.error(e?.response?.data?.error || 'Silme basarisiz'); }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const payload = {
                ...values,
                date: values.date?.toISOString(),
                amount: Number(values.amount),
            };
            if (editing) {
                const res = await apiClient.put(`/api/transfer/partner/finance/${editing.id}`, payload);
                if (res.data.success) { message.success('Kayit guncellendi'); setModalOpen(false); loadEntries(); loadStats(); }
            } else {
                const res = await apiClient.post('/api/transfer/partner/finance', payload);
                if (res.data.success) { message.success('Kayit olusturuldu'); setModalOpen(false); loadEntries(); loadStats(); }
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.error || 'Islem basarisiz');
        } finally { setSubmitting(false); }
    };

    const currentType = Form.useWatch('type', form);
    const categoryOptions = useMemo(() => {
        const t = currentType || selectedType;
        if (t === 'INCOME') {
            return Object.entries(CATEGORY_CONFIG).filter(([, c]) => c.type === 'INCOME').map(([k, c]) => ({ value: k, label: c.label }));
        }
        return Object.entries(CATEGORY_CONFIG).filter(([, c]) => c.type === 'EXPENSE').map(([k, c]) => ({ value: k, label: c.label }));
    }, [currentType, selectedType]);

    // Table columns
    const columns = [
        {
            title: 'Tarih',
            dataIndex: 'date',
            key: 'date',
            width: 110,
            render: (d: string) => <span style={{ fontSize: 12, fontWeight: 600 }}>{dayjs(d).format('DD.MM.YYYY')}</span>,
        },
        {
            title: 'Tur',
            dataIndex: 'type',
            key: 'type',
            width: 90,
            render: (t: string) => (
                <Tag color={t === 'INCOME' ? 'green' : 'red'} icon={t === 'INCOME' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    style={{ fontWeight: 700, fontSize: 11 }}>
                    {t === 'INCOME' ? 'Gelir' : 'Gider'}
                </Tag>
            ),
        },
        {
            title: 'Kategori',
            dataIndex: 'category',
            key: 'category',
            width: 150,
            render: (c: string) => {
                const cfg = CATEGORY_CONFIG[c];
                return cfg ? (
                    <Tag color={cfg.color} style={{ fontWeight: 600, fontSize: 11 }}>
                        {cfg.icon} {cfg.label}
                    </Tag>
                ) : c;
            },
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            key: 'amount',
            width: 140,
            render: (a: number, row: FinanceEntry) => (
                <span style={{
                    fontWeight: 800, fontSize: 14, fontFamily: 'monospace',
                    color: row.type === 'INCOME' ? '#10b981' : '#ef4444',
                }}>
                    {row.type === 'INCOME' ? '+' : '-'}{fmtCurrency(a, row.currency)}
                </span>
            ),
        },
        {
            title: 'Aciklama',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (d: string | null) => d || <Text type="secondary">-</Text>,
        },
        {
            title: 'Odeme',
            dataIndex: 'paymentMethod',
            key: 'paymentMethod',
            width: 110,
            render: (m: string | null) => m ? (
                <span style={{ fontSize: 11, color: '#64748b' }}>
                    {PAYMENT_METHODS.find(p => p.value === m)?.label || m}
                </span>
            ) : null,
        },
        {
            title: 'Islem',
            key: 'actions',
            width: 100,
            render: (_: any, row: FinanceEntry) => (
                <Space size={4}>
                    <Tooltip title="Duzenle">
                        <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(row)} />
                    </Tooltip>
                    <Popconfirm title="Bu kaydi silmek istediginize emin misiniz?" onConfirm={() => handleDelete(row.id)} okText="Evet" cancelText="Hayir">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    // Expense categories for chart-like breakdown
    const expenseBreakdown = useMemo(() => {
        if (!stats?.byCategory) return [];
        return Object.entries(stats.byCategory)
            .filter(([, v]) => v.expense > 0)
            .map(([k, v]) => ({ category: k, label: CATEGORY_CONFIG[k]?.label || k, color: CATEGORY_CONFIG[k]?.color || '#999', amount: v.expense }))
            .sort((a, b) => b.amount - a.amount);
    }, [stats]);

    const maxExpense = useMemo(() => Math.max(...expenseBreakdown.map(e => e.amount), 1), [expenseBreakdown]);

    if (loading && !entries.length) {
        return (
            <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /><div style={{ marginTop: 16, color: '#64748b' }}>Veriler yukleniyor...</div></div>
        );
    }

    return (
        <div style={{ padding: '8px 4px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <WalletOutlined style={{ color: '#6366f1' }} /> Muhasebe
                            </h1>
                            <Text type="secondary" style={{ fontSize: 13 }}>Gelir, gider ve finansal takibinizi yonetin</Text>
                        </div>
                        <Space wrap>
                            <Button icon={<SyncOutlined spin={syncing} />} onClick={handleSync} loading={syncing}>
                                Gelirleri Senkronize Et
                            </Button>
                            <Button icon={<ArrowUpOutlined />} onClick={() => handleAdd('INCOME')}
                                style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', borderRadius: 10, fontWeight: 700 }}>
                                Gelir Ekle
                            </Button>
                            <Button icon={<ArrowDownOutlined />} onClick={() => handleAdd('EXPENSE')}
                                style={{ background: '#ef4444', borderColor: '#ef4444', color: '#fff', borderRadius: 10, fontWeight: 700 }}>
                                Gider Ekle
                            </Button>
                        </Space>
                    </div>

                    {/* Stats Cards */}
                    {stats && !statsLoading && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                            <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #10b981' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Toplam Gelir</Text>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{fmtCurrency(stats.totalIncome)}</div>
                            </Card>
                            <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #ef4444' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Toplam Gider</Text>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>{fmtCurrency(stats.totalExpense)}</div>
                            </Card>
                            <Card size="small" style={{ borderRadius: 12, borderLeft: `4px solid ${stats.netProfit >= 0 ? '#10b981' : '#ef4444'}` }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Net Kar/Zarar</Text>
                                <div style={{ fontSize: 20, fontWeight: 800, color: stats.netProfit >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                                    {stats.netProfit >= 0 ? '+' : ''}{fmtCurrency(stats.netProfit)}
                                </div>
                            </Card>
                            <Card size="small" style={{ borderRadius: 12, borderLeft: '4px solid #6366f1' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Kayit Sayisi</Text>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>{stats.entryCount}</div>
                            </Card>
                        </div>
                    )}

                    <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                        {
                            key: 'dashboard',
                            label: <span><BarChartOutlined /> Ozet</span>,
                            children: (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                                    {/* Expense Breakdown */}
                                    <Card size="small" style={{ borderRadius: 14 }} title={<span style={{ fontWeight: 700 }}><FallOutlined style={{ color: '#ef4444' }} /> Gider Dagilimi</span>}>
                                        {expenseBreakdown.length === 0 ? (
                                            <Empty description="Gider kaydi yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {expenseBreakdown.map(e => (
                                                    <div key={e.category}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{e.label}</span>
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: e.color, fontFamily: 'monospace' }}>{fmtCurrency(e.amount)}</span>
                                                        </div>
                                                        <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                                                            <div style={{
                                                                height: '100%', borderRadius: 4,
                                                                background: e.color,
                                                                width: `${(e.amount / maxExpense) * 100}%`,
                                                                transition: 'width 0.5s ease',
                                                            }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>

                                    {/* Driver Expenses */}
                                    <Card size="small" style={{ borderRadius: 14 }} title={<span style={{ fontWeight: 700 }}><TeamOutlined style={{ color: '#2563eb' }} /> Sofor Bazli Giderler</span>}>
                                        {!stats?.driverExpenses || Object.keys(stats.driverExpenses).length === 0 ? (
                                            <Empty description="Sofor gideri yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {Object.entries(stats.driverExpenses).map(([dId, amt]) => {
                                                    const d = drivers.find(x => x.id === dId);
                                                    return (
                                                        <div key={dId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#f8fafc' }}>
                                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{d?.fullName || d?.firstName + ' ' + d?.lastName || dId.substring(0, 8)}</span>
                                                            <span style={{ fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>{fmtCurrency(amt)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </Card>

                                    {/* Vehicle Expenses */}
                                    <Card size="small" style={{ borderRadius: 14 }} title={<span style={{ fontWeight: 700 }}><CarOutlined style={{ color: '#f59e0b' }} /> Arac Bazli Giderler</span>}>
                                        {!stats?.vehicleExpenses || Object.keys(stats.vehicleExpenses).length === 0 ? (
                                            <Empty description="Arac gideri yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {Object.entries(stats.vehicleExpenses).map(([vId, amt]) => {
                                                    const v = vehicles.find((x: any) => x.id === vId);
                                                    return (
                                                        <div key={vId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#f8fafc' }}>
                                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{v?.plateNumber || vId.substring(0, 8)} {v ? `${v.brand} ${v.model}` : ''}</span>
                                                            <span style={{ fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>{fmtCurrency(amt)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </Card>

                                    {/* Monthly Trend */}
                                    <Card size="small" style={{ borderRadius: 14 }} title={<span style={{ fontWeight: 700 }}><FundOutlined style={{ color: '#6366f1' }} /> Aylik Trend</span>}>
                                        {!stats?.monthlyTrend || Object.keys(stats.monthlyTrend).length === 0 ? (
                                            <Empty description="Henuz veri yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {Object.entries(stats.monthlyTrend).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => (
                                                    <div key={month} style={{ padding: '8px 12px', borderRadius: 8, background: '#f8fafc' }}>
                                                        <div style={{ fontWeight: 700, fontSize: 12, color: '#64748b', marginBottom: 4 }}>{month}</div>
                                                        <div style={{ display: 'flex', gap: 16 }}>
                                                            <span style={{ fontSize: 12 }}><RiseOutlined style={{ color: '#10b981' }} /> <span style={{ fontWeight: 700, color: '#10b981' }}>{fmtCurrency(data.income)}</span></span>
                                                            <span style={{ fontSize: 12 }}><FallOutlined style={{ color: '#ef4444' }} /> <span style={{ fontWeight: 700, color: '#ef4444' }}>{fmtCurrency(data.expense)}</span></span>
                                                            <span style={{ fontSize: 12, fontWeight: 800, color: data.income - data.expense >= 0 ? '#10b981' : '#ef4444' }}>
                                                                Net: {fmtCurrency(data.income - data.expense)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>
                                </div>
                            ),
                        },
                        {
                            key: 'all',
                            label: <span><FileTextOutlined /> Tum Kayitlar <Badge count={total} style={{ marginLeft: 6, backgroundColor: '#6366f1' }} /></span>,
                            children: (
                                <div>
                                    {/* Filters */}
                                    <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                                        <Input
                                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                            placeholder="Ara..."
                                            value={searchText}
                                            onChange={e => { setSearchText(e.target.value); setPage(1); }}
                                            style={{ width: 200, borderRadius: 10 }}
                                            allowClear
                                        />
                                        <Select value={typeFilter || undefined} onChange={v => { setTypeFilter(v || ''); setPage(1); }} placeholder="Tur" allowClear style={{ width: 120 }}>
                                            <Select.Option value="INCOME">Gelir</Select.Option>
                                            <Select.Option value="EXPENSE">Gider</Select.Option>
                                        </Select>
                                        <Select value={categoryFilter || undefined} onChange={v => { setCategoryFilter(v || ''); setPage(1); }} placeholder="Kategori" allowClear style={{ width: 160 }}>
                                            {Object.entries(CATEGORY_CONFIG).map(([k, c]) => (
                                                <Select.Option key={k} value={k}>{c.label}</Select.Option>
                                            ))}
                                        </Select>
                                        <RangePicker
                                            value={dateRange}
                                            onChange={(vals) => { setDateRange(vals as any); setPage(1); }}
                                            format="DD.MM.YYYY"
                                            style={{ borderRadius: 10 }}
                                            allowClear
                                        />
                                        <Button icon={<ReloadOutlined />} onClick={() => { loadEntries(); loadStats(); }}>Yenile</Button>
                                    </div>

                                    <Card size="small" style={{ borderRadius: 14 }} bodyStyle={{ padding: 0 }}>
                                        <Table
                                            rowKey="id"
                                            dataSource={entries}
                                            columns={columns}
                                            loading={loading}
                                            pagination={{
                                                current: page,
                                                pageSize: 50,
                                                total,
                                                onChange: (p) => setPage(p),
                                                size: 'small',
                                                showTotal: (t) => `Toplam ${t} kayit`,
                                            }}
                                            scroll={{ x: 900 }}
                                            size="small"
                                            locale={{ emptyText: <Empty description="Kayit bulunamadi" /> }}
                                        />
                                    </Card>
                                </div>
                            ),
                        },
                        {
                            key: 'income',
                            label: <span><RiseOutlined style={{ color: '#10b981' }} /> Gelirler</span>,
                            children: (
                                <Card size="small" style={{ borderRadius: 14 }} bodyStyle={{ padding: 0 }}>
                                    <Table
                                        rowKey="id"
                                        dataSource={entries.filter(e => e.type === 'INCOME')}
                                        columns={columns.filter(c => c.key !== 'type')}
                                        loading={loading}
                                        pagination={{ pageSize: 20, size: 'small' }}
                                        scroll={{ x: 800 }}
                                        size="small"
                                        locale={{ emptyText: <Empty description="Gelir kaydi yok" /> }}
                                    />
                                </Card>
                            ),
                        },
                        {
                            key: 'expense',
                            label: <span><FallOutlined style={{ color: '#ef4444' }} /> Giderler</span>,
                            children: (
                                <Card size="small" style={{ borderRadius: 14 }} bodyStyle={{ padding: 0 }}>
                                    <Table
                                        rowKey="id"
                                        dataSource={entries.filter(e => e.type === 'EXPENSE')}
                                        columns={columns.filter(c => c.key !== 'type')}
                                        loading={loading}
                                        pagination={{ pageSize: 20, size: 'small' }}
                                        scroll={{ x: 800 }}
                                        size="small"
                                        locale={{ emptyText: <Empty description="Gider kaydi yok" /> }}
                                    />
                                </Card>
                            ),
                        },
                    ]} />

                    {/* ── Add/Edit Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    background: selectedType === 'INCOME'
                                        ? 'linear-gradient(135deg, #10b981, #059669)'
                                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 18,
                                }}>
                                    {selectedType === 'INCOME' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: 16 }}>{editing ? 'Kaydi Duzenle' : selectedType === 'INCOME' ? 'Gelir Ekle' : 'Gider Ekle'}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{selectedType === 'INCOME' ? 'Yeni gelir girisi' : 'Yeni gider girisi'}</div>
                                </div>
                            </div>
                        }
                        open={modalOpen}
                        onCancel={() => setModalOpen(false)}
                        onOk={handleSave}
                        confirmLoading={submitting}
                        okText={editing ? 'Guncelle' : 'Kaydet'}
                        cancelText="Iptal"
                        width={640}
                        okButtonProps={{
                            style: {
                                background: selectedType === 'INCOME' ? '#10b981' : '#ef4444',
                                borderColor: selectedType === 'INCOME' ? '#10b981' : '#ef4444',
                            }
                        }}
                    >
                        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                            <Form.Item name="type" hidden><Input /></Form.Item>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Form.Item
                                    name="category"
                                    label={<span style={{ fontWeight: 700 }}>Kategori</span>}
                                    rules={[{ required: true, message: 'Zorunlu' }]}
                                >
                                    <Select placeholder="Kategori secin" options={categoryOptions} />
                                </Form.Item>
                                <Form.Item
                                    name="date"
                                    label={<span style={{ fontWeight: 700 }}>Tarih</span>}
                                    rules={[{ required: true, message: 'Zorunlu' }]}
                                >
                                    <DatePicker format="DD.MM.YYYY" style={{ width: '100%', borderRadius: 10 }} />
                                </Form.Item>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                                <Form.Item
                                    name="amount"
                                    label={<span style={{ fontWeight: 700 }}>Tutar</span>}
                                    rules={[{ required: true, message: 'Zorunlu' }, { type: 'number', min: 0.01, message: 'Gecerli tutar girin' }]}
                                >
                                    <InputNumber
                                        placeholder="0.00"
                                        min={0.01}
                                        step={0.01}
                                        style={{ width: '100%', borderRadius: 10 }}
                                        size="large"
                                        formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    />
                                </Form.Item>
                                <Form.Item
                                    name="currency"
                                    label={<span style={{ fontWeight: 700 }}>Para Birimi</span>}
                                    rules={[{ required: true }]}
                                >
                                    <Select size="large">
                                        {defCurrencies.map((c: any) => (
                                            <Select.Option key={c.code} value={c.code}>{c.code} {c.symbol ? `(${c.symbol})` : ''}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </div>

                            <Form.Item name="description" label={<span style={{ fontWeight: 700 }}>Aciklama</span>}>
                                <Input placeholder="Aciklama girin" style={{ borderRadius: 10 }} />
                            </Form.Item>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Form.Item name="paymentMethod" label={<span style={{ fontWeight: 700 }}>Odeme Yontemi</span>}>
                                    <Select placeholder="Secin" allowClear options={PAYMENT_METHODS} />
                                </Form.Item>
                                <Form.Item name="receiptNo" label={<span style={{ fontWeight: 700 }}>Fis/Makbuz No</span>}>
                                    <Input placeholder="Opsiyonel" style={{ borderRadius: 10 }} />
                                </Form.Item>
                            </div>

                            {selectedType === 'EXPENSE' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <Form.Item name="relatedDriverId" label={<span style={{ fontWeight: 700 }}>Ilgili Sofor</span>}>
                                        <Select placeholder="Sofor secin (opsiyonel)" allowClear
                                            options={drivers.map((d: any) => ({ value: d.id, label: d.fullName || `${d.firstName} ${d.lastName}` }))}
                                        />
                                    </Form.Item>
                                    <Form.Item name="relatedVehicleId" label={<span style={{ fontWeight: 700 }}>Ilgili Arac</span>}>
                                        <Select placeholder="Arac secin (opsiyonel)" allowClear
                                            options={vehicles.map((v: any) => ({ value: v.id, label: `${v.plateNumber} - ${v.brand} ${v.model}` }))}
                                        />
                                    </Form.Item>
                                </div>
                            )}

                            <Form.Item name="notes" label={<span style={{ fontWeight: 700 }}>Notlar</span>}>
                                <Input.TextArea rows={2} placeholder="Ek notlar..." style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
    );
};

export default PartnerFinancePage;
