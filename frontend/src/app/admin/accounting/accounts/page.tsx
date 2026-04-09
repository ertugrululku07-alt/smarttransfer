'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Table, Button, Card, Tag, Space, Modal, Form, Input, Select,
    message, Popconfirm, Row, Col, Statistic, Typography, Avatar,
    Tooltip, Badge, Divider, InputNumber, Dropdown, DatePicker
} from 'antd';
import type { MenuProps } from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, WalletOutlined,
    ArrowUpOutlined, ArrowDownOutlined, SearchOutlined, ReloadOutlined,
    BankOutlined, TeamOutlined, UserOutlined, ShopOutlined,
    PhoneOutlined, MailOutlined, FilterOutlined, FileTextOutlined,
    DownOutlined, ArrowRightOutlined, ShoppingCartOutlined,
    ShoppingOutlined, BarChartOutlined, MenuOutlined,
    DollarOutlined, GiftOutlined, ScissorOutlined, TrophyOutlined,
    CalendarOutlined, CheckCircleOutlined, CloseCircleOutlined,
    InfoCircleOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';

const { Option } = Select;
const { Title, Text } = Typography;

interface Account {
    id: string;
    code: string;
    name: string;
    type: 'CUSTOMER' | 'SUPPLIER' | 'PARTNER' | 'AGENCY' | 'PERSONNEL' | 'OTHER';
    source?: string;
    taxNumber?: string;
    taxOffice?: string;
    phone?: string;
    email?: string;
    currency: string;
    balance: number;
    debit: number;
    credit: number;
    jobTitle?: string;
    monthlySalary?: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
    CUSTOMER: { label: 'Müşteri', color: '#2563eb', icon: <UserOutlined />, bg: '#eff6ff' },
    SUPPLIER: { label: 'Tedarikçi', color: '#16a34a', icon: <ShopOutlined />, bg: '#f0fdf4' },
    AGENCY: { label: 'Acenta', color: '#7c3aed', icon: <BankOutlined />, bg: '#faf5ff' },
    PARTNER: { label: 'Partner', color: '#9333ea', icon: <BankOutlined />, bg: '#faf5ff' },
    PERSONNEL: { label: 'Personel', color: '#d97706', icon: <TeamOutlined />, bg: '#fffbeb' },
    OTHER: { label: 'Diğer', color: '#6b7280', icon: <FileTextOutlined />, bg: '#f9fafb' },
};

type TransactionType = 'DEBIT_IN' | 'CREDIT_OUT' | 'PURCHASE_INVOICE' | 'SALES_INVOICE' | 'STATEMENT';

const TRANSACTION_CONFIG: Record<TransactionType, { label: string; color: string }> = {
    DEBIT_IN: { label: 'Cari Giriş', color: '#16a34a' },
    CREDIT_OUT: { label: 'Cari Cikis', color: '#dc2626' },
    PURCHASE_INVOICE: { label: 'Alis Faturasi', color: '#2563eb' },
    SALES_INVOICE: { label: 'Satis Faturasi', color: '#7c3aed' },
    STATEMENT: { label: 'Hesap Ekstresi', color: '#0891b2' },
};

const AccountsPage: React.FC = () => {
    const router = useRouter();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [currencies, setCurrencies] = useState<{code: string, symbol: string}[]>([
        { code: 'TRY', symbol: '₺' },
        { code: 'EUR', symbol: '€' },
        { code: 'USD', symbol: '$' },
        { code: 'GBP', symbol: '£' },
    ]);

    // Transaction states
    const [txModalVisible, setTxModalVisible] = useState(false);
    const [txType, setTxType] = useState<TransactionType>('DEBIT_IN');
    const [txAccount, setTxAccount] = useState<Account | null>(null);
    const [txForm] = Form.useForm();
    const [txSubmitting, setTxSubmitting] = useState(false);
    const [stmtVisible, setStmtVisible] = useState(false);
    const [stmtAccount, setStmtAccount] = useState<Account | null>(null);

    // Personnel-specific transaction states
    const [personnelTxVisible, setPersonnelTxVisible] = useState(false);
    const [personnelTxType, setPersonnelTxType] = useState<string>('SALARY');
    const [personnelTxAccount, setPersonnelTxAccount] = useState<Account | null>(null);
    const [personnelTxForm] = Form.useForm();
    const [personnelTxSubmitting, setPersonnelTxSubmitting] = useState(false);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const [accRes, tenantRes] = await Promise.allSettled([
                apiClient.get('/api/accounting/accounts'),
                apiClient.get('/api/tenant/info')
            ]);

            if (accRes.status === 'fulfilled' && accRes.value.data.success) {
                setAccounts(accRes.value.data.data);
            }

            if (tenantRes.status === 'fulfilled' && tenantRes.value.data?.success) {
                const tenant = tenantRes.value.data.data.tenant;
                const st = tenant.settings || {};
                
                if (st.definitions?.currencies) {
                    setCurrencies(st.definitions.currencies);
                } else if (tenant.currency) {
                    setCurrencies([{ code: tenant.currency, symbol: '' }]);
                }
            }
        } catch {
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAccounts(); }, []);

    // Stats
    const stats = useMemo(() => {
        let receivable = 0, payable = 0, netBalance = 0;
        accounts.forEach(acc => {
            receivable += Number(acc.credit) || 0;
            payable += Number(acc.debit) || 0;
            netBalance += Number(acc.balance) || 0;
        });
        const byType: Record<string, number> = {};
        accounts.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1; });
        return { receivable, payable, netBalance, byType, total: accounts.length };
    }, [accounts]);

    // Filtered list
    const filtered = useMemo(() => {
        return accounts.filter(acc => {
            if (typeFilter !== 'ALL' && acc.type !== typeFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                return (acc.name + acc.code + (acc.phone || '') + (acc.email || '')).toLowerCase().includes(q);
            }
            return true;
        });
    }, [accounts, typeFilter, search]);

    const handleAdd = () => {
        setEditingAccount(null);
        form.resetFields();
        const defaultCur = (currencies as any[]).find(c => c.isDefault)?.code || 'TRY';
        form.setFieldsValue({ currency: defaultCur, type: 'CUSTOMER' });
        setIsModalVisible(true);
    };

    const handleEdit = (record: Account) => {
        setEditingAccount(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/accounting/accounts/${id}`);
            message.success('Cari silindi');
            fetchAccounts();
        } catch { message.error('Silme işlemi başarısız'); }
    };

    const openTransaction = (record: Account, type: TransactionType) => {
        if (type === 'STATEMENT') {
            setStmtAccount(record);
            setStmtVisible(true);
            return;
        }
        setTxAccount(record);
        setTxType(type);
        txForm.resetFields();
        setTxModalVisible(true);
    };

    // ---- Personnel transaction openner ----
    const openPersonnelTx = (record: Account, opType: string) => {
        if (opType === 'STATEMENT') {
            router.push(`/admin/accounting/accounts/${record.id}/statement`);
            return;
        }
        setPersonnelTxAccount(record);
        setPersonnelTxType(opType);
        personnelTxForm.resetFields();
        setPersonnelTxVisible(true);
    };

    // ---- Personnel transaction submit ----
    const handlePersonnelTxOk = async () => {
        try {
            const values = await personnelTxForm.validateFields();
            setPersonnelTxSubmitting(true);
            const acct = personnelTxAccount!;

            // Extract raw personnel ID (strip 'personnel-' prefix)
            const rawId = acct.id.startsWith('personnel-') ? acct.id.replace('personnel-', '') : acct.id;
            const period = values.period ? `${values.period[0]?.format('MM.YYYY')} - ${values.period[1]?.format('MM.YYYY')}` : '';
            const note = values.description || '';

            if (personnelTxType === 'SALARY') {
                await apiClient.post('/api/accounting/payroll/salary', {
                    personnelId: rawId,
                    amount: values.amount,
                    note,
                    period,
                    date: values.date ? values.date.toISOString() : new Date().toISOString(),
                });
            } else if (personnelTxType === 'ADVANCE') {
                await apiClient.post('/api/accounting/payroll/advance', {
                    personnelId: rawId,
                    amount: values.amount,
                    note,
                    date: values.date ? values.date.toISOString() : new Date().toISOString(),
                });
            } else {
                // HAKEDIS, PRIM, KESINTI -> generic transaction
                // Hakedis/Prim: Employee EARNS money, their credit/balance INCREASES (isCredit = true) -> MANUAL_IN.
                // Kesinti: Employee loses money, their balance DECREASES (isCredit = false) -> MANUAL_OUT.
                const isCredit = personnelTxType === 'HAKEDIS' || personnelTxType === 'PRIM';
                await apiClient.post('/api/accounting/transactions', {
                    accountId: acct.id,
                    type: isCredit ? 'MANUAL_IN' : 'MANUAL_OUT',
                    amount: values.amount,
                    description: `${PERSONNEL_TX_CONFIG[personnelTxType]?.label || personnelTxType}${note ? ': ' + note : ''}${period ? ' — ' + period : ''}`,
                    date: values.date ? values.date.toISOString() : new Date().toISOString(),
                    isCredit,
                });
            }

            message.success(`${PERSONNEL_TX_CONFIG[personnelTxType]?.label || 'İşlem'} başarıyla kaydedildi`);
            setPersonnelTxVisible(false);
            fetchAccounts();
        } catch (error: any) {
            if (!error?.errorFields) message.error(error?.response?.data?.error || 'İşlem kaydedilemedi');
        } finally {
            setPersonnelTxSubmitting(false);
        }
    };

    const handleTransactionOk = async () => {
        try {
            const values = await txForm.validateFields();
            setTxSubmitting(true);
            const isCredit = txType === 'DEBIT_IN' || txType === 'SALES_INVOICE';
            await apiClient.post('/api/accounting/transactions', {
                accountId: txAccount!.id,
                type: txType,
                amount: values.amount,
                description: values.description || TRANSACTION_CONFIG[txType].label,
                date: values.date ? values.date.toISOString() : new Date().toISOString(),
                isCredit,
            });
            message.success(`${TRANSACTION_CONFIG[txType].label} kaydedildi`);
            setTxModalVisible(false);
            fetchAccounts();
        } catch (error: any) {
            if (!error?.errorFields) message.error('Islem kaydedilemedi');
        } finally { setTxSubmitting(false); }
    };

    // ---- Personnel tx config ----
    const PERSONNEL_TX_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string; isOut: boolean }> = {
        SALARY: { label: 'Maaş Ödemesi', color: '#2563eb', icon: <DollarOutlined />, desc: 'Aylık maaş ödemesini kayıt altına alır.', isOut: true },
        HAKEDIS: { label: 'Hakediş Ödemesi', color: '#7c3aed', icon: <TrophyOutlined />, desc: 'Proje veya hizmet hakediş ödemesini kayıt eder.', isOut: true },
        ADVANCE: { label: 'Avans', color: '#d97706', icon: <CreditCardOutlined />, desc: 'Personele avans ödemesi yapar.', isOut: true },
        PRIM: { label: 'Prim / Bonus', color: '#059669', icon: <GiftOutlined />, desc: 'Performans veya satış primini kayıt eder.', isOut: true },
        KESINTI: { label: 'Maaş Kesintisi', color: '#dc2626', icon: <ScissorOutlined />, desc: 'Maaştan yapılacak kesinti miktarını kayıt eder.', isOut: false },
    };

    // ---- Personnel menu builder ----
    const buildPersonnelMenu = (record: Account): MenuProps => ({
        items: [
            {
                key: 'header',
                label: <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, letterSpacing: '0.5px' }}>👷 PERSONEL İŞLEMLERİ</span>,
                disabled: true,
            },
            { type: 'divider' },
            {
                key: 'SALARY',
                icon: <DollarOutlined style={{ color: '#2563eb' }} />,
                label: <span style={{ color: '#2563eb', fontWeight: 600 }}>Maaş Ödemesi</span>,
                onClick: () => openPersonnelTx(record, 'SALARY'),
            },
            {
                key: 'HAKEDIS',
                icon: <TrophyOutlined style={{ color: '#7c3aed' }} />,
                label: <span style={{ color: '#7c3aed', fontWeight: 600 }}>Hakediş Ödemesi</span>,
                onClick: () => openPersonnelTx(record, 'HAKEDIS'),
            },
            {
                key: 'ADVANCE',
                icon: <CreditCardOutlined style={{ color: '#d97706' }} />,
                label: <span style={{ color: '#d97706', fontWeight: 600 }}>Avans</span>,
                onClick: () => openPersonnelTx(record, 'ADVANCE'),
            },
            {
                key: 'PRIM',
                icon: <GiftOutlined style={{ color: '#059669' }} />,
                label: <span style={{ color: '#059669', fontWeight: 600 }}>Prim / Bonus</span>,
                onClick: () => openPersonnelTx(record, 'PRIM'),
            },
            {
                key: 'KESINTI',
                icon: <ScissorOutlined style={{ color: '#dc2626' }} />,
                label: <span style={{ color: '#dc2626', fontWeight: 600 }}>Maaş Kesintisi</span>,
                onClick: () => openPersonnelTx(record, 'KESINTI'),
            },
            { type: 'divider' },
            {
                key: 'STATEMENT',
                icon: <BarChartOutlined style={{ color: '#0891b2' }} />,
                label: <span style={{ color: '#0891b2', fontWeight: 600 }}>Hesap Ekstresi</span>,
                onClick: () => openPersonnelTx(record, 'STATEMENT'),
            },
        ],
    });

    const buildMenu = (record: Account): MenuProps => {
        // Personnel accounts get their own specialized menu
        if (record.type === 'PERSONNEL' || record.source === 'PERSONNEL') {
            return buildPersonnelMenu(record);
        }
        // All other account types use the standard menu
        return {
            items: [
                {
                    key: 'DEBIT_IN',
                    icon: <ArrowRightOutlined style={{ color: '#16a34a' }} />,
                    label: <span style={{ color: '#16a34a', fontWeight: 600 }}>Cari Giris</span>,
                    onClick: () => openTransaction(record, 'DEBIT_IN'),
                },
                {
                    key: 'CREDIT_OUT',
                    icon: <ArrowDownOutlined style={{ color: '#dc2626' }} />,
                    label: <span style={{ color: '#dc2626', fontWeight: 600 }}>Cari Cikis</span>,
                    onClick: () => openTransaction(record, 'CREDIT_OUT'),
                },
                { type: 'divider' },
                {
                    key: 'PURCHASE_INVOICE',
                    icon: <ShoppingCartOutlined style={{ color: '#2563eb' }} />,
                    label: <span style={{ color: '#2563eb', fontWeight: 600 }}>Alış Faturası</span>,
                    onClick: () => {
                        const params = new URLSearchParams({
                            tab: 'PURCHASE',
                            name: record.name,
                            taxNo: record.taxNumber || '',
                            taxOffice: record.taxOffice || '',
                            phone: record.phone || '',
                            email: record.email || '',
                        });
                        router.push(`/admin/accounting/invoices?${params.toString()}`);
                    },
                },
                {
                    key: 'SALES_INVOICE',
                    icon: <ShoppingOutlined style={{ color: '#7c3aed' }} />,
                    label: <span style={{ color: '#7c3aed', fontWeight: 600 }}>Satış Faturası</span>,
                    onClick: () => {
                        const params = new URLSearchParams({
                            tab: 'SALES',
                            name: record.name,
                            taxNo: record.taxNumber || '',
                            taxOffice: record.taxOffice || '',
                            phone: record.phone || '',
                            email: record.email || '',
                        });
                        router.push(`/admin/accounting/invoices?${params.toString()}`);
                    },
                },
                { type: 'divider' },
                {
                    key: 'STATEMENT',
                    icon: <BarChartOutlined style={{ color: '#0891b2' }} />,
                    label: 'Hesap Ekstresi',
                    onClick: () => router.push(`/admin/accounting/accounts/${record.id}/statement`),
                },
            ],
        };
    };

    const fmtCurrency = (val: number, currency = 'TRY') =>
        Number(val || 0).toLocaleString('tr-TR', { style: 'currency', currency });

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            if (editingAccount) {
                await apiClient.put(`/api/accounting/accounts/${editingAccount.id}`, values);
                message.success('Cari güncellendi');
            } else {
                await apiClient.post('/api/accounting/accounts', values);
                message.success('Cari oluşturuldu');
            }
            setIsModalVisible(false);
            fetchAccounts();
        } catch (error: any) {
            if (!error?.errorFields) {
                const backendMsg = error?.response?.data?.error || 'İşlem başarısız. Cari kodu tekrar ediyor olabilir.';
                message.error(backendMsg);
            }
        } finally { setSubmitting(false); }
    };

    const columns = [
        {
            title: 'Cari',
            key: 'cari',
            width: 280,
            render: (_: any, record: Account) => {
                const cfg = TYPE_CONFIG[record.type] || TYPE_CONFIG.OTHER;
                return (
                    <Space>
                        <Avatar
                            size={36}
                            icon={cfg.icon}
                            style={{ background: cfg.color, flexShrink: 0 }}
                        />
                        <div>
                            <div
                                style={{
                                    fontWeight: 700, fontSize: 13, lineHeight: 1.3,
                                    color: '#4f46e5', cursor: 'pointer',
                                    display: 'inline',
                                }}
                                onClick={() => handleEdit(record)}
                                title="Cariyi düzenlemek veya görüntülemek için tıklayın"
                            >
                                {record.name}
                            </div>
                            <Tag style={{ fontSize: 10, margin: 0, marginLeft: 4, borderRadius: 4 }}>{record.code}</Tag>
                            {record.jobTitle && (
                                <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{record.jobTitle}</Text>
                            )}
                        </div>
                    </Space>
                );
            }
        },
        {
            title: 'Tip',
            dataIndex: 'type',
            key: 'type',
            width: 110,
            render: (type: string) => {
                const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.OTHER;
                return (
                    <Tag
                        style={{
                            background: cfg.bg,
                            color: cfg.color,
                            border: `1px solid ${cfg.color}33`,
                            borderRadius: 6,
                            fontWeight: 600,
                            fontSize: 11,
                        }}
                    >
                        {cfg.label}
                    </Tag>
                );
            }
        },
        {
            title: 'İletişim',
            key: 'contact',
            width: 180,
            render: (_: any, record: Account) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {record.phone && (
                        <Text style={{ fontSize: 12 }}>
                            <PhoneOutlined style={{ color: '#6b7280', marginRight: 4 }} />{record.phone}
                        </Text>
                    )}
                    {record.email && (
                        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: record.email }}>
                            <MailOutlined style={{ color: '#6b7280', marginRight: 4 }} />{record.email}
                        </Text>
                    )}
                    {!record.phone && !record.email && <Text type="secondary" style={{ fontSize: 12 }}>—</Text>}
                </div>
            )
        },
        {
            title: 'Borç',
            dataIndex: 'debit',
            key: 'debit',
            width: 130,
            align: 'right' as const,
            render: (val: number, r: Account) => (
                <Text style={{ color: '#dc2626', fontWeight: 600, fontFamily: 'monospace' }}>
                    {fmtCurrency(val, r.currency)}
                </Text>
            )
        },
        {
            title: 'Alacak',
            dataIndex: 'credit',
            key: 'credit',
            width: 130,
            align: 'right' as const,
            render: (val: number, r: Account) => (
                <Text style={{ color: '#16a34a', fontWeight: 600, fontFamily: 'monospace' }}>
                    {fmtCurrency(val, r.currency)}
                </Text>
            )
        },
        {
            title: 'Bakiye',
            dataIndex: 'balance',
            key: 'balance',
            width: 150,
            align: 'right' as const,
            render: (val: number, r: Account) => {
                const n = Number(val);
                const isPos = n > 0, isNeg = n < 0;
                return (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: isPos ? '#fef2f2' : isNeg ? '#f0fdf4' : '#f9fafb',
                        padding: '2px 10px', borderRadius: 20,
                        fontFamily: 'monospace', fontWeight: 700,
                        color: isPos ? '#dc2626' : isNeg ? '#16a34a' : '#6b7280',
                        fontSize: 13,
                    }}>
                        {isPos ? '↑' : isNeg ? '↓' : ''}
                        {fmtCurrency(Math.abs(n), r.currency)}
                    </div>
                );
            }
        },
        {
            title: '',
            key: 'actions',
            width: 180,
            render: (_: any, record: Account) => {
                const isAutoCreated = record.id.startsWith('agency-') || record.id.startsWith('personnel-');
                return (
                    <Space>
                        {/* Islem Dropdown */}
                        <Dropdown menu={buildMenu(record)} trigger={['click']} placement="bottomRight">
                            <Button
                                size="small"
                                style={{
                                    borderRadius: 6,
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 600,
                                    fontSize: 12,
                                }}
                            >
                                <MenuOutlined style={{ fontSize: 11 }} /> Islem <DownOutlined style={{ fontSize: 9 }} />
                            </Button>
                        </Dropdown>

                        {!isAutoCreated && (
                            <>
                                <Tooltip title="Duzenle">
                                    <Button
                                        icon={<EditOutlined />}
                                        onClick={() => handleEdit(record)}
                                        size="small"
                                        style={{ borderRadius: 6 }}
                                    />
                                </Tooltip>
                                <Tooltip title="Sil">
                                    <Popconfirm
                                        title="Bu cariyi silmek istediginize emin misiniz?"
                                        onConfirm={() => handleDelete(record.id)}
                                        okText="Evet" cancelText="Hayir"
                                    >
                                        <Button icon={<DeleteOutlined />} danger size="small" style={{ borderRadius: 6 }} />
                                    </Popconfirm>
                                </Tooltip>
                            </>
                        )}
                        {isAutoCreated && (
                            <Tooltip title="Otomatik olusturuldu">
                                <Badge dot color="blue"><Tag style={{ fontSize: 10, borderRadius: 4 }}>Otomatik</Tag></Badge>
                            </Tooltip>
                        )}
                    </Space>
                );
            }
        },
    ];

    const typeKeys = ['ALL', 'CUSTOMER', 'AGENCY', 'SUPPLIER', 'PARTNER', 'PERSONNEL', 'OTHER'];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="accounting-accounts">
                <div style={{ padding: '0 0 24px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div>
                            <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Cari Hesaplar</Title>
                            <Text type="secondary">Toplam <strong>{stats.total}</strong> cari kayıt</Text>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={fetchAccounts} loading={loading}>Yenile</Button>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleAdd}
                                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none', fontWeight: 600, borderRadius: 8 }}
                            >
                                + Yeni Cari Ekle
                            </Button>
                        </Space>
                    </div>

                    {/* Stats Row */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col xs={24} sm={8}>
                            <Card
                                variant="borderless"
                                style={{ borderRadius: 14, background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0' }}
                                styles={{ body: { padding: '16px 20px' } }}
                            >
                                <Statistic
                                    title={<Text style={{ color: '#16a34a', fontWeight: 600 }}>Toplam Alacak</Text>}
                                    value={stats.receivable}
                                    precision={2}
                                    styles={{ content: { color: '#16a34a', fontWeight: 700, fontSize: 22 } }}
                                    prefix={<ArrowUpOutlined />}
                                    suffix="₺"
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card
                                variant="borderless"
                                style={{ borderRadius: 14, background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)', border: '1px solid #fca5a5' }}
                                styles={{ body: { padding: '16px 20px' } }}
                            >
                                <Statistic
                                    title={<Text style={{ color: '#dc2626', fontWeight: 600 }}>Toplam Borç</Text>}
                                    value={stats.payable}
                                    precision={2}
                                    styles={{ content: { color: '#dc2626', fontWeight: 700, fontSize: 22 } }}
                                    prefix={<ArrowDownOutlined />}
                                    suffix="₺"
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card
                                variant="borderless"
                                style={{
                                    borderRadius: 14,
                                    background: stats.netBalance >= 0
                                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                                        : 'linear-gradient(135deg, #fdf4ff 0%, #f3e8ff 100%)',
                                    border: stats.netBalance >= 0 ? '1px solid #93c5fd' : '1px solid #d8b4fe'
                                }}
                                styles={{ body: { padding: '16px 20px' } }}
                            >
                                <Statistic
                                    title={<Text style={{ color: stats.netBalance >= 0 ? '#2563eb' : '#7c3aed', fontWeight: 600 }}>Net Bakiye</Text>}
                                    value={Math.abs(stats.netBalance)}
                                    precision={2}
                                    styles={{ content: { color: stats.netBalance >= 0 ? '#2563eb' : '#7c3aed', fontWeight: 700, fontSize: 22 } }}
                                    prefix={<WalletOutlined />}
                                    suffix={stats.netBalance >= 0 ? ' ₺ (Alacaklı)' : ' ₺ (Borçlu)'}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Type Summary Pills */}
                    <Card
                        variant="borderless"
                        styles={{ body: { padding: '12px 20px' } }}
                        style={{ borderRadius: 12, marginBottom: 20, border: '1px solid #f0f0f0' }}
                    >
                        <Row gutter={[12, 8]} align="middle">
                            <Col>
                                <FilterOutlined style={{ color: '#6b7280', marginRight: 4 }} />
                                <Text type="secondary" style={{ fontSize: 12 }}>Tip Filtresi:</Text>
                            </Col>
                            {typeKeys.map(t => {
                                const cfg = t === 'ALL' ? null : TYPE_CONFIG[t];
                                const count = t === 'ALL' ? stats.total : (stats.byType[t] || 0);
                                const active = typeFilter === t;
                                return (
                                    <Col key={t}>
                                        <div
                                            onClick={() => setTypeFilter(t)}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '4px 14px',
                                                borderRadius: 20,
                                                background: active ? (cfg?.color || '#6366f1') : '#f9fafb',
                                                color: active ? 'white' : (cfg?.color || '#374151'),
                                                border: `1px solid ${active ? (cfg?.color || '#6366f1') : '#e5e7eb'}`,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 5,
                                            }}
                                        >
                                            {cfg?.icon}
                                            {t === 'ALL' ? 'Tümü' : cfg?.label}
                                            <span style={{
                                                background: active ? 'rgba(255,255,255,0.25)' : (cfg?.bg || '#f0f0f0'),
                                                color: active ? 'white' : (cfg?.color || '#374151'),
                                                borderRadius: 10,
                                                padding: '0 6px',
                                                fontSize: 11,
                                            }}>{count}</span>
                                        </div>
                                    </Col>
                                );
                            })}
                        </Row>
                    </Card>

                    {/* Main Table Card */}
                    <Card
                        variant="borderless"
                        style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                        styles={{ body: { padding: 0 } }}
                    >
                        {/* Search Bar */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 12 }}>
                            <Input
                                prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
                                placeholder="Cari adı, kodu, telefon veya e-posta ara..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                allowClear
                                style={{ maxWidth: 400, borderRadius: 8 }}
                            />
                            <Text type="secondary" style={{ fontSize: 12, lineHeight: '32px' }}>
                                {filtered.length} sonuç gösteriliyor
                            </Text>
                        </div>

                        <Table
                            columns={columns}
                            dataSource={filtered}
                            rowKey="id"
                            loading={loading}
                            pagination={{
                                pageSize: 15,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '15', '25', '50'],
                                showTotal: (total) => `${total} kayıt`,
                                style: { padding: '12px 20px' }
                            }}
                            rowClassName={(record) => {
                                const b = Number(record.balance);
                                if (b > 500) return 'row-high-balance';
                                return '';
                            }}
                            style={{ borderRadius: 14 }}
                        />
                    </Card>
                </div>

                {/* Add/Edit Modal */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <WalletOutlined style={{ color: '#6366f1' }} />
                            <span>{editingAccount ? 'Cari Hesap Düzenle' : 'Yeni Cari Hesap Ekle'}</span>
                        </div>
                    }
                    open={isModalVisible}
                    onOk={handleModalOk}
                    onCancel={() => setIsModalVisible(false)}
                    confirmLoading={submitting}
                    okText="Kaydet"
                    cancelText="İptal"
                    width={680}
                    okButtonProps={{ style: { background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none' } }}
                >
                    <Divider style={{ margin: '12px 0' }} />
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="code" label="Cari Kodu" rules={[{ required: true, message: 'Cari kodu zorunludur' }]}>
                                    <Input placeholder="Örn: M-001" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="type" label="Cari Tipi" rules={[{ required: true }]}>
                                    <Select>
                                        <Option value="CUSTOMER">👤 Müşteri</Option>
                                        <Option value="SUPPLIER">🏪 Tedarikçi</Option>
                                        <Option value="AGENCY">🏢 Acenta</Option>
                                        <Option value="PARTNER">🤝 Partner</Option>
                                        <Option value="PERSONNEL">👷 Personel</Option>
                                        <Option value="OTHER">📄 Diğer</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="name" label="Cari Adı / Ünvanı" rules={[{ required: true }]}>
                                    <Input placeholder="Ad Soyad veya Firma Adı" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="currency" label="Para Birimi" rules={[{ required: true }]}>
                                    <Select showSearch optionFilterProp="children">
                                        {currencies.map((c: any) => (
                                            <Option key={c.code} value={c.code}>
                                                {c.code} {c.symbol ? `— ${c.symbol}` : ''} {c.rate ? `(Kur: ₺${c.rate})` : ''}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="email" label="E-Posta">
                                    <Input type="email" placeholder="ornek@firma.com" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="phone" label="Telefon">
                                    <Input placeholder="+90 5XX XXX XX XX" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="taxNumber" label="Vergi No / TC Kimlik No">
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="taxOffice" label="Vergi Dairesi">
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="address" label="Adres">
                            <Input.TextArea rows={2} placeholder="Açık adres..." />
                        </Form.Item>
                    </Form>
                </Modal>

                {/* ====== Islem Modal ====== */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: TRANSACTION_CONFIG[txType]?.color || '#6366f1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {txType === 'DEBIT_IN' && <ArrowRightOutlined style={{ color: 'white' }} />}
                                {txType === 'CREDIT_OUT' && <ArrowDownOutlined style={{ color: 'white' }} />}
                                {txType === 'PURCHASE_INVOICE' && <ShoppingCartOutlined style={{ color: 'white' }} />}
                                {txType === 'SALES_INVOICE' && <ShoppingOutlined style={{ color: 'white' }} />}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700 }}>{TRANSACTION_CONFIG[txType]?.label}</div>
                                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{txAccount?.name}</div>
                            </div>
                        </div>
                    }
                    open={txModalVisible}
                    onOk={handleTransactionOk}
                    onCancel={() => setTxModalVisible(false)}
                    confirmLoading={txSubmitting}
                    okText="Kaydet"
                    cancelText="Iptal"
                    width={480}
                    okButtonProps={{
                        style: { background: TRANSACTION_CONFIG[txType]?.color || '#6366f1', border: 'none' }
                    }}
                >
                    <Divider style={{ margin: '12px 0' }} />
                    {txAccount && (
                        <div style={{
                            background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
                            marginBottom: 16, border: '1px solid #e2e8f0', fontSize: 12, color: '#6b7280',
                        }}>
                            <strong style={{ color: '#374151' }}>{txAccount.name}</strong>
                            {' · '}{txAccount.code}
                            {' · Bakiye: '}
                            <strong style={{ color: Number(txAccount.balance) < 0 ? '#16a34a' : '#dc2626' }}>
                                {fmtCurrency(Math.abs(Number(txAccount.balance)), txAccount.currency)}
                            </strong>
                        </div>
                    )}
                    <Form form={txForm} layout="vertical">
                        <Form.Item
                            name="amount"
                            label="Tutar"
                            rules={[
                                { required: true, message: 'Tutar zorunludur' },
                                { type: 'number', min: 0.01, message: "Tutar 0'dan buyuk olmalidir" }
                            ]}
                        >
                            <InputNumber
                                style={{ width: '100%' }}
                                placeholder="0,00"
                                precision={2}
                                min={0.01}
                                addonAfter={txAccount?.currency || 'TRY'}
                            />
                        </Form.Item>
                        <Form.Item name="date" label="Islem Tarihi">
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="Bugun" />
                        </Form.Item>
                        <Form.Item name="description" label="Aciklama">
                            <Input.TextArea
                                rows={2}
                                placeholder={`${TRANSACTION_CONFIG[txType]?.label || ''} aciklamasi...`}
                            />
                        </Form.Item>
                    </Form>
                </Modal>

                {/* ====== Hesap Ekstresi Modal ====== */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8, background: '#0891b2',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <BarChartOutlined style={{ color: 'white' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700 }}>Hesap Ekstresi</div>
                                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{stmtAccount?.name}</div>
                            </div>
                        </div>
                    }
                    open={stmtVisible}
                    onCancel={() => setStmtVisible(false)}
                    footer={[<Button key="close" onClick={() => setStmtVisible(false)}>Kapat</Button>]}
                    width={540}
                >
                    <Divider style={{ margin: '12px 0' }} />
                    {stmtAccount && (
                        <>
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                <Col span={12}>
                                    <div style={{
                                        background: '#f0fdf4', borderRadius: 10,
                                        padding: '12px 16px', border: '1px solid #bbf7d0',
                                    }}>
                                        <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>TOPLAM ALACAK</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', fontFamily: 'monospace' }}>
                                            {fmtCurrency(stmtAccount.credit, stmtAccount.currency)}
                                        </div>
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <div style={{
                                        background: '#fef2f2', borderRadius: 10,
                                        padding: '12px 16px', border: '1px solid #fca5a5',
                                    }}>
                                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>TOPLAM BORC</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>
                                            {fmtCurrency(stmtAccount.debit, stmtAccount.currency)}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <div style={{
                                background: Number(stmtAccount.balance) <= 0 ? '#f0fdf4' : '#fef2f2',
                                borderRadius: 10, padding: '14px 16px',
                                border: `1px solid ${Number(stmtAccount.balance) <= 0 ? '#bbf7d0' : '#fca5a5'}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span style={{ fontWeight: 600, color: '#374151' }}>Net Bakiye</span>
                                <span style={{
                                    fontWeight: 800, fontSize: 20, fontFamily: 'monospace',
                                    color: Number(stmtAccount.balance) < 0 ? '#16a34a' : Number(stmtAccount.balance) > 0 ? '#dc2626' : '#6b7280',
                                }}>
                                    {Number(stmtAccount.balance) < 0 ? '↑' : Number(stmtAccount.balance) > 0 ? '↓' : ''}
                                    {fmtCurrency(Math.abs(Number(stmtAccount.balance)), stmtAccount.currency)}
                                    {Number(stmtAccount.balance) < 0 ? ' (Alacakli)' : Number(stmtAccount.balance) > 0 ? ' (Borclu)' : ''}
                                </span>
                            </div>
                            <div style={{
                                marginTop: 16, padding: '10px 14px',
                                background: '#f8fafc', borderRadius: 8,
                                border: '1px solid #e2e8f0', fontSize: 12,
                                color: '#9ca3af', textAlign: 'center',
                            }}>
                                Detayli islem gecmisi yakininda eklenecek.
                            </div>
                        </>
                    )}
                </Modal>

                {/* ====== PERSONEL İŞLEM MODAL ====== */}
                {personnelTxAccount && (
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: `linear-gradient(135deg, ${PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1'} 0%, ${PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1'}99 100%)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 18,
                                }}>
                                    {PERSONNEL_TX_CONFIG[personnelTxType]?.icon}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{PERSONNEL_TX_CONFIG[personnelTxType]?.label}</div>
                                    <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>Personel İşlemi</div>
                                </div>
                            </div>
                        }
                        open={personnelTxVisible}
                        onOk={handlePersonnelTxOk}
                        onCancel={() => setPersonnelTxVisible(false)}
                        confirmLoading={personnelTxSubmitting}
                        okText="Kaydet"
                        cancelText="İptal"
                        width={520}
                        okButtonProps={{
                            style: {
                                background: `linear-gradient(135deg, ${PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1'} 0%, ${PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1'}cc 100%)`,
                                border: 'none', fontWeight: 600
                            },
                            icon: <CheckCircleOutlined />
                        }}
                        cancelButtonProps={{ icon: <CloseCircleOutlined /> }}
                    >
                        {/* Personel kimlik kartı */}
                        <div style={{
                            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                            border: '1px solid #fde68a',
                            borderRadius: 12,
                            padding: '14px 16px',
                            marginBottom: 20,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                        }}>
                            <div style={{
                                width: 46, height: 46, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0,
                            }}>
                                {personnelTxAccount.name?.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: '#92400e', fontSize: 15 }}>{personnelTxAccount.name}</div>
                                <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                                    {personnelTxAccount.jobTitle && <span>{personnelTxAccount.jobTitle} · </span>}
                                    {personnelTxAccount.code}
                                </div>
                                {personnelTxAccount.monthlySalary && personnelTxAccount.monthlySalary > 0 && (
                                    <div style={{ fontSize: 11, color: '#d97706', marginTop: 3, fontWeight: 600 }}>
                                        <DollarOutlined style={{ marginRight: 4 }} />
                                        Aylık Maaş: {fmtCurrency(personnelTxAccount.monthlySalary, personnelTxAccount.currency)}
                                    </div>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 10, color: '#b45309', marginBottom: 2, fontWeight: 600, letterSpacing: '0.5px' }}>GÜNCEL BAKİYE</div>
                                <div style={{
                                    fontSize: 16, fontWeight: 800, fontFamily: 'monospace',
                                    color: Number(personnelTxAccount.balance) < 0 ? '#059669' : Number(personnelTxAccount.balance) > 0 ? '#dc2626' : '#6b7280',
                                }}>
                                    {fmtCurrency(Math.abs(Number(personnelTxAccount.balance)), personnelTxAccount.currency)}
                                </div>
                            </div>
                        </div>

                        {/* İşlem açıklama banner */}
                        <div style={{
                            background: `${PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1'}11`,
                            border: `1px solid ${PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1'}33`,
                            borderRadius: 8, padding: '8px 12px', marginBottom: 20,
                            display: 'flex', gap: 8, alignItems: 'center', fontSize: 12,
                            color: PERSONNEL_TX_CONFIG[personnelTxType]?.color || '#6366f1',
                        }}>
                            <InfoCircleOutlined />
                            {PERSONNEL_TX_CONFIG[personnelTxType]?.desc}
                        </div>

                        <Form form={personnelTxForm} layout="vertical">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="amount"
                                        label={<span style={{ fontWeight: 600 }}>Tutar (₺)</span>}
                                        rules={[
                                            { required: true, message: 'Tutar zorunludur' },
                                            { type: 'number', min: 0.01, message: "0'dan büyük olmalıdır" }
                                        ]}
                                    >
                                        <InputNumber
                                            style={{ width: '100%' }}
                                            placeholder="0,00"
                                            precision={2}
                                            min={0.01}
                                            addonAfter={personnelTxAccount.currency || 'TRY'}
                                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                            parser={(v: any) => v!.replace(/,/g, '')}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="date"
                                        label={<span style={{ fontWeight: 600 }}>İşlem Tarihi</span>}
                                    >
                                        <DatePicker
                                            style={{ width: '100%' }}
                                            format="DD.MM.YYYY"
                                            placeholder="Bugün"
                                            suffixIcon={<CalendarOutlined />}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {/* Dönem seçici — Maaş ve Hakediş için */}
                            {(personnelTxType === 'SALARY' || personnelTxType === 'HAKEDIS') && (
                                <Form.Item
                                    name="period"
                                    label={<span style={{ fontWeight: 600 }}>Dönem ({personnelTxType === 'SALARY' ? 'Maaş Dönemi' : 'Hakediş Dönemi'})</span>}
                                >
                                    <DatePicker.RangePicker
                                        picker="month"
                                        style={{ width: '100%' }}
                                        format="MM.YYYY"
                                        placeholder={['Başlangıç Ayı', 'Bitiş Ayı']}
                                    />
                                </Form.Item>
                            )}

                            <Form.Item
                                name="description"
                                label={<span style={{ fontWeight: 600 }}>Not / Açıklama</span>}
                            >
                                <Input.TextArea
                                    rows={3}
                                    placeholder={`${PERSONNEL_TX_CONFIG[personnelTxType]?.label || ''} ile ilgili notlar...`}
                                />
                            </Form.Item>

                            {/* Uyarı notu — Kesinti için */}
                            {personnelTxType === 'KESINTI' && (
                                <div style={{
                                    background: '#fef2f2', border: '1px solid #fca5a5',
                                    borderRadius: 8, padding: '8px 12px',
                                    fontSize: 12, color: '#dc2626', display: 'flex', gap: 8,
                                }}>
                                    <ScissorOutlined />
                                    <span>Kesinti işlemi personel borcuna eklenir. Maaş hesabında bakiye düşümü yapılır.</span>
                                </div>
                            )}
                        </Form>
                    </Modal>
                )}

            </AdminLayout>
        </AdminGuard>
    );
};

export default AccountsPage;
