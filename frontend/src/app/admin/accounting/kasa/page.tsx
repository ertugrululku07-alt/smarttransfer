'use client';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import {
    Card, Table, Button, Tag, Typography, Row, Col,
    Modal, Form, Input, InputNumber, Select, DatePicker,
    message, Popconfirm, Space, Badge, Tooltip,
    Empty, Spin
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined,
    ArrowDownOutlined, FilterOutlined, ReloadOutlined, CalculatorOutlined,
    FileTextOutlined
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

interface AccountTypeDef {
    value: string;
    label: string;
    icon: string;
    currency: string;
    symbol?: string;
    color: string;
    type: 'cash' | 'bank';
    bankId?: string;
    bankAccountId?: string;
}

interface AccountBalanceInfo {
    label: string;
    currency: string;
    icon: string;
    color: string;
    type: 'cash' | 'bank';
    balance: number;
    in: number;
    out: number;
}

interface CurrencyTotals {
    in: number;
    out: number;
    net: number;
}

/* ─── Config ─────────────────────────────────── */
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
    PERSONNEL: { label: 'Personel', color: '#ec4899' },
};

/* ─── Formatter ──────────────────────────────── */
const fmt = (v: number, cur = 'TRY') =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ' + cur;

/* ─── Main Component ─────────────────────────── */
const KasaPage: React.FC = () => {
    const { currencies: defCurrencies, defaultCurrency, loading: defLoading } = useDefinitions();
    const [accountTypes, setAccountTypes] = useState<AccountTypeDef[]>([]);
    const [accounts, setAccounts] = useState<Record<string, AccountBalanceInfo>>({});
    const [entries, setEntries] = useState<KasaEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [entriesLoading, setEntriesLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<KasaEntry | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [totalsByCurrency, setTotalsByCurrency] = useState<Record<string, CurrencyTotals>>({});

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'), dayjs()
    ]);
    const [filterAccount, setFilterAccount] = useState<string>('');
    const [filterDir, setFilterDir] = useState<string>('');
    const [activeAccTab, setActiveAccTab] = useState('ALL');
    const [totals, setTotals] = useState({ in: 0, out: 0, net: 0 });

    // Dynamic account type groups
    const cashAccounts = useMemo(() => accountTypes.filter(a => a.type === 'cash'), [accountTypes]);
    const bankAccounts = useMemo(() => accountTypes.filter(a => a.type === 'bank'), [accountTypes]);

    // Fetch dynamic account types
    const fetchAccountTypes = useCallback(async () => {
        try {
            const r = await apiClient.get('/api/kasa/account-types');
            if (r.data.success) setAccountTypes(r.data.data);
        } catch { }
    }, []);

    const fetchAccounts = useCallback(async () => {
        try {
            const r = await apiClient.get('/api/kasa/accounts');
            if (r.data.success) setAccounts(r.data.data);
        } catch { }
    }, []);

    const fetchEntries = useCallback(async () => {
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
                setTotalsByCurrency(r.data.data.totalsByCurrency || {});
            }
        } catch { } finally { setEntriesLoading(false); }
    }, [dateRange, filterAccount, filterDir]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchAccountTypes(), fetchAccounts(), fetchEntries()]);
        setLoading(false);
    }, [fetchAccountTypes, fetchAccounts, fetchEntries]);

    useEffect(() => { fetchAll(); }, []);
    useEffect(() => { fetchEntries(); }, [dateRange, filterAccount, filterDir]);

    // When account type changes in form, auto-set the currency
    const handleAccountTypeChange = (accTypeValue: string) => {
        const accDef = accountTypes.find(a => a.value === accTypeValue);
        if (accDef) {
            form.setFieldsValue({ currency: accDef.currency });
        }
    };

    const openNew = () => {
        setEditing(null);
        form.resetFields();
        const firstCash = accountTypes.find(a => a.type === 'cash');
        form.setFieldsValue({
            date: dayjs(),
            direction: 'IN',
            accountType: firstCash?.value || accountTypes[0]?.value || '',
            currency: firstCash?.currency || defaultCurrency?.code || defCurrencies[0]?.code || 'TRY'
        });
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

    /* ─── Per-currency summary for filtered entries ─── */
    const filteredTotalsByCurrency = useMemo(() => {
        const result: Record<string, CurrencyTotals> = {};
        filteredEntries.forEach(e => {
            const cur = e.currency || 'TRY';
            if (!result[cur]) result[cur] = { in: 0, out: 0, net: 0 };
            if (e.direction === 'IN') result[cur].in += e.amount;
            else result[cur].out += e.amount;
            result[cur].net = result[cur].in - result[cur].out;
        });
        return result;
    }, [filteredEntries]);

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
                const cfg = accountTypes.find(a => a.value === v);
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

    // Build gradient from color
    const buildGrad = (color: string) => `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`;

    /* ─── Account Card ─── */
    const renderSingleCard = (acc: AccountTypeDef) => {
        const info = accounts[acc.value] || { balance: 0, in: 0, out: 0, color: acc.color };
        const isActive = activeAccTab === acc.value;
        return (
            <Col key={acc.value} xs={12} sm={8} md={6} xl={3}>
                <div
                    style={{
                        borderRadius: 16,
                        background: buildGrad(info.color || acc.color),
                        border: isActive ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: isActive ? `0 8px 24px ${acc.color}50` : '0 4px 16px rgba(0,0,0,0.12)',
                        padding: '14px 16px',
                        transform: isActive ? 'scale(1.02)' : 'scale(1)',
                        position: 'relative' as const,
                        overflow: 'hidden',
                    }}
                    onClick={() => setActiveAccTab(isActive ? 'ALL' : acc.value)}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                >
                    {/* Decorative circle */}
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                    <div style={{ position: 'absolute', bottom: -30, left: -10, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, position: 'relative', zIndex: 1 }}>
                        <span style={{ fontSize: 22 }}>{acc.icon}</span>
                        {isActive && <Badge count="●" style={{ background: 'transparent', color: '#fff', boxShadow: 'none', fontSize: 14 }} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'relative', zIndex: 1 }}>{acc.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: 'monospace', marginTop: 4, letterSpacing: '-0.5px', position: 'relative', zIndex: 1 }}>
                        {fmt(info.balance, acc.currency)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, position: 'relative', zIndex: 1 }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>▲ {fmt(info.in, acc.currency)}</span>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>▼ {fmt(info.out, acc.currency)}</span>
                    </div>
                </div>
            </Col>
        );
    };

    /* ─── Account Cards Section ─── */
    const renderAccountCards = () => (
        <div style={{ marginBottom: 20 }}>
            {/* Nakit Kasalar */}
            {cashAccounts.length > 0 && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                        <Text style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Nakit Kasalar
                        </Text>
                        <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                    </div>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        {cashAccounts.map(acc => renderSingleCard(acc))}
                    </Row>
                </>
            )}

            {/* Banka Hesapları */}
            {bankAccounts.length > 0 && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }} />
                        <Text style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Banka Hesapları
                        </Text>
                        <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                    </div>
                    <Row gutter={[12, 12]}>
                        {bankAccounts.map(acc => renderSingleCard(acc))}
                    </Row>
                </>
            )}

            {/* Hiç hesap yoksa uyarı */}
            {accountTypes.length === 0 && !loading && (
                <div style={{
                    padding: '24px', textAlign: 'center', borderRadius: 12,
                    background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e'
                }}>
                    <Text style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                        Henüz hesap tanımlanmamış. Lütfen Sistem Tanımları'ndan para birimleri ekleyin veya Banka Yönetimi'nden hesap oluşturun.
                    </Text>
                </div>
            )}
        </div>
    );

    /* ─── Summary Bar — per currency ─── */
    const renderSummaryBar = () => {
        const displayTotals = activeAccTab === 'ALL' ? totalsByCurrency : filteredTotalsByCurrency;
        const currencyKeys = Object.keys(displayTotals);

        if (currencyKeys.length === 0) {
            return (
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    <Col span={24}>
                        <div style={{
                            borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
                            padding: '16px', textAlign: 'center'
                        }}>
                            <Text type="secondary">Seçilen dönemde işlem bulunamadı</Text>
                        </div>
                    </Col>
                </Row>
            );
        }

        return (
            <div style={{ marginBottom: 16 }}>
                <Row gutter={[12, 12]}>
                    {currencyKeys.map(cur => {
                        const t = displayTotals[cur];
                        return (
                            <Col key={cur} xs={24} md={currencyKeys.length === 1 ? 24 : 12} lg={currencyKeys.length <= 2 ? 12 : 8}>
                                <div style={{
                                    borderRadius: 14,
                                    background: 'linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)',
                                    border: '1px solid #e5e7eb',
                                    padding: '16px 20px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                                        paddingBottom: 10, borderBottom: '1px solid #f3f4f6'
                                    }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 8,
                                            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, color: '#fff', fontWeight: 800
                                        }}>{cur.slice(0, 2)}</div>
                                        <Text style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>{cur}</Text>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', marginBottom: 2 }}>Gelir</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a', fontFamily: 'monospace' }}>+{fmt(t.in, cur)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', marginBottom: 2 }}>Gider</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', fontFamily: 'monospace' }}>-{fmt(t.out, cur)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 600, color: t.net >= 0 ? '#2563eb' : '#dc2626', textTransform: 'uppercase', marginBottom: 2 }}>Net</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: t.net >= 0 ? '#2563eb' : '#dc2626', fontFamily: 'monospace' }}>
                                                {t.net >= 0 ? '+' : ''}{fmt(t.net, cur)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        );
                    })}
                    <Col xs={24} md={currencyKeys.length === 1 ? 24 : 12} lg={currencyKeys.length <= 2 ? 12 : 8}>
                        <div style={{
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                            border: '1px solid #e2e8f0',
                            padding: '16px 20px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            height: '100%',
                            display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', alignItems: 'center',
                        }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Kayıt Sayısı</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#111', fontFamily: 'monospace' }}>
                                {filteredEntries.length}
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{currencyKeys.length} para birimi</div>
                        </div>
                    </Col>
                </Row>
            </div>
        );
    };

    /* ─── Table summary footer — per currency ─── */
    const renderTableSummary = () => {
        const currencies = Object.keys(filteredTotalsByCurrency);
        if (currencies.length === 0) return null;

        return (
            <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={3}>
                        <Text strong>TOPLAM ({filteredEntries.length} kayıt)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                        <div>
                            {currencies.map(cur => {
                                const t = filteredTotalsByCurrency[cur];
                                return (
                                    <div key={cur} style={{ marginBottom: currencies.length > 1 ? 4 : 0 }}>
                                        <div style={{ color: '#16a34a', fontFamily: 'monospace', fontSize: 12 }}>
                                            +{fmt(t.in, cur)}
                                        </div>
                                        <div style={{ color: '#dc2626', fontFamily: 'monospace', fontSize: 12 }}>
                                            -{fmt(t.out, cur)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} colSpan={5} />
                </Table.Summary.Row>
            </Table.Summary>
        );
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
                                <div style={{
                                    width: 48, height: 48, borderRadius: 14,
                                    background: 'linear-gradient(135deg,#16a34a,#4ade80)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 22, boxShadow: '0 4px 16px rgba(22,163,74,0.3)'
                                }}>
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
                                style={{ width: 200, borderRadius: 8 }}
                                value={filterAccount || undefined}
                                onChange={v => setFilterAccount(v || '')}
                            >
                                {cashAccounts.length > 0 && (
                                    <Select.OptGroup label="💵 Nakit Kasalar">
                                        {cashAccounts.map(a => <Option key={a.value} value={a.value}>{a.icon} {a.label}</Option>)}
                                    </Select.OptGroup>
                                )}
                                {bankAccounts.length > 0 && (
                                    <Select.OptGroup label="🏦 Banka Hesapları">
                                        {bankAccounts.map(a => <Option key={a.value} value={a.value}>{a.icon} {a.label}</Option>)}
                                    </Select.OptGroup>
                                )}
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
                                    {accountTypes.find(a => a.value === activeAccTab)?.label} filtresi
                                </Tag>
                            )}
                        </div>
                    </Card>

                    {/* Summary Bar — Per Currency */}
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
                                        {accountTypes.find(a => a.value === activeAccTab)?.label}
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
                            summary={() => renderTableSummary()}
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
                                    <Select size="large" style={{ borderRadius: 8 }} onChange={handleAccountTypeChange}>
                                        {cashAccounts.length > 0 && (
                                            <Select.OptGroup label="💵 Nakit Kasalar">
                                                {cashAccounts.map(a => <Option key={a.value} value={a.value}>{a.icon} {a.label} ({a.currency})</Option>)}
                                            </Select.OptGroup>
                                        )}
                                        {bankAccounts.length > 0 && (
                                            <Select.OptGroup label="🏦 Banka Hesapları">
                                                {bankAccounts.map(a => <Option key={a.value} value={a.value}>{a.icon} {a.label} ({a.currency})</Option>)}
                                            </Select.OptGroup>
                                        )}
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
