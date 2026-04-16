'use client';

import React, { useEffect, useState } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import {
    Button, Typography, Modal, Form, Input, Select, Tag,
    Popconfirm, message, Row, Col, Spin, Badge
} from 'antd';
import {
    PlusOutlined, BankOutlined, DeleteOutlined, EditOutlined,
    GlobalOutlined, CreditCardOutlined, CopyOutlined
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient from '@/lib/api-client';

const { Text } = Typography;
const { Option } = Select;

// ── Currency colors ──
const CURRENCY_COLORS: Record<string, string> = {
    TRY: '#16a34a', USD: '#2563eb', EUR: '#7c3aed', GBP: '#0891b2',
};

interface Bank {
    id: string;
    name: string;
    code?: string;
    website?: string;
    status: boolean;
    accounts: BankAccount[];
}

interface BankAccount {
    id: string;
    bankId: string;
    accountName: string;
    accountNumber: string;
    iban: string;
    branchName?: string;
    branchCode?: string;
    currency: string;
}

export default function BanksPage() {
    const { currencies: defCurrencies, defaultCurrency, loading: defLoading } = useDefinitions();
    const [banks, setBanks] = useState<Bank[]>([]);
    const [loading, setLoading] = useState(false);

    const [isBankModalVisible, setIsBankModalVisible] = useState(false);
    const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);

    const [bankForm] = Form.useForm();
    const [accountForm] = Form.useForm();

    const [editingBank, setEditingBank] = useState<Bank | null>(null);
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
    const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

    const fetchBanks = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/banks');
            if (res.data.success) setBanks(res.data.data);
        } catch (error) {
            message.error('Bankalar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBanks(); }, []);

    useEffect(() => {
        if (defCurrencies.length > 0 && isAccountModalVisible && !editingAccount) {
            const curr = accountForm.getFieldValue('currency');
            if (!curr) accountForm.setFieldsValue({ currency: defaultCurrency?.code || defCurrencies[0]?.code });
        }
    }, [defCurrencies, isAccountModalVisible]);

    // ── Bank Actions ──
    const handleAddBank = () => {
        setEditingBank(null);
        bankForm.resetFields();
        setIsBankModalVisible(true);
    };
    const handleEditBank = (bank: Bank) => {
        setEditingBank(bank);
        bankForm.setFieldsValue(bank);
        setIsBankModalVisible(true);
    };
    const handleDeleteBank = async (id: string) => {
        try {
            await apiClient.delete(`/api/banks/${id}`);
            message.success('Banka silindi');
            fetchBanks();
        } catch { message.error('Silme işlemi başarısız'); }
    };
    const handleBankSubmit = async () => {
        try {
            const values = await bankForm.validateFields();
            if (editingBank) {
                await apiClient.put(`/api/banks/${editingBank.id}`, values);
                message.success('Banka güncellendi');
            } else {
                await apiClient.post('/api/banks', values);
                message.success('Banka eklendi');
            }
            setIsBankModalVisible(false);
            fetchBanks();
        } catch { /* validation */ }
    };

    // ── Account Actions ──
    const handleAddAccount = (bankId: string) => {
        setSelectedBankId(bankId);
        setEditingAccount(null);
        accountForm.resetFields();
        accountForm.setFieldsValue({ currency: defaultCurrency?.code || defCurrencies[0]?.code });
        setIsAccountModalVisible(true);
    };
    const handleEditAccount = (account: BankAccount) => {
        setEditingAccount(account);
        accountForm.setFieldsValue(account);
        setIsAccountModalVisible(true);
    };
    const handleDeleteAccount = async (id: string) => {
        try {
            await apiClient.delete(`/api/banks/accounts/${id}`);
            message.success('Hesap silindi');
            fetchBanks();
        } catch { message.error('Silme işlemi başarısız'); }
    };
    const handleAccountSubmit = async () => {
        try {
            const values = await accountForm.validateFields();
            if (editingAccount) {
                await apiClient.put(`/api/banks/accounts/${editingAccount.id}`, values);
                message.success('Hesap güncellendi');
            } else {
                if (!selectedBankId) return;
                await apiClient.post(`/api/banks/${selectedBankId}/accounts`, values);
                message.success('Hesap eklendi');
            }
            setIsAccountModalVisible(false);
            fetchBanks();
        } catch { /* validation */ }
    };

    const copyIban = (iban: string) => {
        navigator.clipboard.writeText(iban);
        message.success('IBAN kopyalandı');
    };

    const totalAccounts = banks.reduce((s, b) => s + (b.accounts?.length || 0), 0);

    return (
        <AdminGuard>
            <AdminLayout selectedKey="bank-list">
                <div style={{ paddingBottom: 40 }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
                                Banka Yönetimi
                            </h1>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                {banks.length} banka, {totalAccounts} hesap kayıtlı
                            </Text>
                        </div>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddBank}
                            size="large"
                            style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', borderRadius: 12, fontWeight: 600,
                                height: 44, paddingInline: 24,
                                boxShadow: '0 4px 14px rgba(99,102,241,0.3)'
                            }}
                        >
                            Yeni Banka Ekle
                        </Button>
                    </div>

                    {/* ── Loading ── */}
                    {loading && banks.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 80 }}>
                            <Spin size="large" />
                        </div>
                    )}

                    {/* ── Empty State ── */}
                    {banks.length === 0 && !loading && (
                        <div style={{
                            textAlign: 'center', padding: '80px 40px',
                            background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🏦</div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Henüz banka eklenmemiş</h3>
                            <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20 }}>
                                Banka hesaplarınızı ekleyerek ödeme takibi yapabilirsiniz
                            </Text>
                            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleAddBank}
                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, fontWeight: 600, height: 42 }}>
                                İlk Bankayı Ekle
                            </Button>
                        </div>
                    )}

                    {/* ── Bank Cards Grid ── */}
                    {banks.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 20 }}>
                            {banks.map(bank => (
                                <div key={bank.id} style={{
                                    background: '#fff', borderRadius: 20, overflow: 'hidden',
                                    border: '1px solid #f0f0f0',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                                    transition: 'box-shadow 0.2s',
                                }}>
                                    {/* Bank Header */}
                                    <div style={{
                                        padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                                        borderBottom: '1px solid #e2e8f0',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                            <div style={{
                                                width: 48, height: 48, borderRadius: 14,
                                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                            }}>
                                                <BankOutlined style={{ fontSize: 22, color: '#fff' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{bank.name}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                                    {bank.code && (
                                                        <Tag style={{ borderRadius: 6, fontWeight: 600, fontSize: 11, margin: 0, background: '#e0e7ff', color: '#6366f1', border: 'none' }}>
                                                            {bank.code}
                                                        </Tag>
                                                    )}
                                                    {bank.website && (
                                                        <a href={bank.website} target="_blank" rel="noreferrer"
                                                            style={{ fontSize: 11, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            <GlobalOutlined /> Web Sitesi
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <Button size="small" type="text" icon={<EditOutlined />}
                                                onClick={() => handleEditBank(bank)}
                                                style={{ borderRadius: 8, color: '#64748b' }} />
                                            <Popconfirm title="Bu bankayı silmek istediğinize emin misiniz?"
                                                description="Banka ile birlikte tüm hesapları da silinecektir."
                                                onConfirm={() => handleDeleteBank(bank.id)} okText="Sil" cancelText="Vazgeç"
                                                okButtonProps={{ danger: true }}>
                                                <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 8 }} />
                                            </Popconfirm>
                                        </div>
                                    </div>

                                    {/* Accounts Section */}
                                    <div style={{ padding: '16px 24px 20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                                Banka Hesapları
                                                {bank.accounts?.length > 0 && (
                                                    <Badge count={bank.accounts.length} style={{ backgroundColor: '#6366f1', marginLeft: 8, fontSize: 10 }} />
                                                )}
                                            </span>
                                            <Button size="small" type="link" icon={<PlusOutlined />}
                                                onClick={() => handleAddAccount(bank.id)}
                                                style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', padding: 0 }}>
                                                Hesap Ekle
                                            </Button>
                                        </div>

                                        {bank.accounts && bank.accounts.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {bank.accounts.map(account => (
                                                    <div key={account.id} style={{
                                                        padding: '14px 16px', borderRadius: 14,
                                                        background: '#f8fafc', border: '1px solid #f1f5f9',
                                                        transition: 'all 0.15s',
                                                    }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                                    <CreditCardOutlined style={{ color: '#6366f1', fontSize: 14 }} />
                                                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{account.accountName}</span>
                                                                    <Tag style={{
                                                                        borderRadius: 6, fontWeight: 700, fontSize: 10, margin: 0, border: 'none',
                                                                        background: (CURRENCY_COLORS[account.currency] || '#6366f1') + '15',
                                                                        color: CURRENCY_COLORS[account.currency] || '#6366f1',
                                                                    }}>
                                                                        {account.currency}
                                                                    </Tag>
                                                                </div>
                                                                <div
                                                                    onClick={() => copyIban(account.iban)}
                                                                    style={{
                                                                        fontFamily: 'monospace', fontSize: 12, color: '#475569',
                                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                                                        padding: '4px 8px', borderRadius: 6, background: '#fff',
                                                                        border: '1px dashed #d1d5db', width: 'fit-content',
                                                                    }}
                                                                    title="Kopyalamak için tıklayın"
                                                                >
                                                                    <CopyOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                                                                    {account.iban}
                                                                </div>
                                                                {(account.branchName || account.accountNumber) && (
                                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, paddingLeft: 22 }}>
                                                                        {account.branchName && <span>{account.branchName}</span>}
                                                                        {account.branchCode && <span> ({account.branchCode})</span>}
                                                                        {account.accountNumber && <span> — Hesap No: {account.accountNumber}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
                                                                <Button size="small" type="text" icon={<EditOutlined style={{ fontSize: 13 }} />}
                                                                    onClick={() => handleEditAccount(account)}
                                                                    style={{ borderRadius: 6, width: 28, height: 28, color: '#94a3b8' }} />
                                                                <Popconfirm title="Hesabı silmek istediğinize emin misiniz?" onConfirm={() => handleDeleteAccount(account.id)}
                                                                    okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}>
                                                                    <Button size="small" type="text" danger icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                                                                        style={{ borderRadius: 6, width: 28, height: 28 }} />
                                                                </Popconfirm>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{
                                                textAlign: 'center', padding: '28px 16px',
                                                borderRadius: 12, border: '1px dashed #e2e8f0', background: '#fafafa',
                                            }}>
                                                <CreditCardOutlined style={{ fontSize: 28, color: '#d1d5db', marginBottom: 8, display: 'block' }} />
                                                <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Henüz hesap eklenmemiş</div>
                                                <Button size="small" type="link" icon={<PlusOutlined />}
                                                    onClick={() => handleAddAccount(bank.id)}
                                                    style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', marginTop: 4 }}>
                                                    İlk Hesabı Ekle
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Bank Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <BankOutlined style={{ fontSize: 18, color: '#fff' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 700 }}>{editingBank ? 'Bankayı Düzenle' : 'Yeni Banka Ekle'}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Banka bilgilerini girin</div>
                                </div>
                            </div>
                        }
                        open={isBankModalVisible}
                        onOk={handleBankSubmit}
                        onCancel={() => setIsBankModalVisible(false)}
                        okText={editingBank ? 'Güncelle' : 'Kaydet'}
                        cancelText="İptal"
                        okButtonProps={{ style: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, fontWeight: 600 } }}
                        cancelButtonProps={{ style: { borderRadius: 8 } }}
                        styles={{ body: { paddingTop: 20 } }}
                        width={480}
                    >
                        <Form form={bankForm} layout="vertical" requiredMark={false}>
                            <Form.Item name="name" label={<span style={{ fontWeight: 600, color: '#334155' }}>Banka Adı</span>} rules={[{ required: true, message: 'Banka adı gerekli' }]}>
                                <Input placeholder="Örn: Garanti BBVA" size="large" style={{ borderRadius: 10 }} prefix={<BankOutlined style={{ color: '#94a3b8' }} />} />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="code" label={<span style={{ fontWeight: 600, color: '#334155' }}>Banka Kodu</span>}>
                                        <Input placeholder="Örn: GARANTI" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="website" label={<span style={{ fontWeight: 600, color: '#334155' }}>Web Sitesi</span>}>
                                        <Input placeholder="https://..." size="large" style={{ borderRadius: 10 }} prefix={<GlobalOutlined style={{ color: '#94a3b8' }} />} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </Modal>

                    {/* ── Account Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <CreditCardOutlined style={{ fontSize: 18, color: '#fff' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 700 }}>{editingAccount ? 'Hesabı Düzenle' : 'Yeni Hesap Ekle'}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Banka hesap bilgilerini girin</div>
                                </div>
                            </div>
                        }
                        open={isAccountModalVisible}
                        onOk={handleAccountSubmit}
                        onCancel={() => setIsAccountModalVisible(false)}
                        okText={editingAccount ? 'Güncelle' : 'Kaydet'}
                        cancelText="İptal"
                        okButtonProps={{ style: { background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, fontWeight: 600 } }}
                        cancelButtonProps={{ style: { borderRadius: 8 } }}
                        styles={{ body: { paddingTop: 20 } }}
                        width={520}
                    >
                        <Form form={accountForm} layout="vertical" requiredMark={false}>
                            <Row gutter={16}>
                                <Col span={16}>
                                    <Form.Item name="accountName" label={<span style={{ fontWeight: 600, color: '#334155' }}>Hesap Adı</span>} rules={[{ required: true, message: 'Hesap adı gerekli' }]}>
                                        <Input placeholder="Örn: Şirket Ana Hesap (TL)" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="currency" label={<span style={{ fontWeight: 600, color: '#334155' }}>Para Birimi</span>} rules={[{ required: true, message: 'Gerekli' }]}>
                                        <Select size="large" style={{ borderRadius: 10 }}
                                            loading={defLoading} notFoundContent={defLoading ? 'Yükleniyor...' : 'Tanımsız'}>
                                            {defCurrencies.map(c => (
                                                <Option key={c.code} value={c.code}>{c.symbol} {c.code}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="iban" label={<span style={{ fontWeight: 600, color: '#334155' }}>IBAN</span>} rules={[{ required: true, message: 'IBAN gerekli' }]}>
                                <Input placeholder="TR00 0000 0000 0000 0000 0000 00" size="large" style={{ borderRadius: 10, fontFamily: 'monospace' }} />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="accountNumber" label={<span style={{ fontWeight: 600, color: '#334155' }}>Hesap No</span>}>
                                        <Input placeholder="12345678" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="branchCode" label={<span style={{ fontWeight: 600, color: '#334155' }}>Şube Kodu</span>}>
                                        <Input placeholder="001" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="branchName" label={<span style={{ fontWeight: 600, color: '#334155' }}>Şube Adı</span>}>
                                        <Input placeholder="Merkez" size="large" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
