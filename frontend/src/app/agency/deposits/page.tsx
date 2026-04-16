'use client';

import React, { useState, useEffect } from 'react';
import {
    Card, Typography, Form, InputNumber, Button, message,
    Spin, Divider, Radio, Select, Table, Tag, Modal, Alert,
    Statistic, Row, Col, Space
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    WalletOutlined, BankOutlined, CreditCardOutlined,
    CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
    CopyOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../AgencyLayout';
import AgencyGuard from '../AgencyGuard';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface BankAccount {
    id: string;
    accountName: string;
    iban: string;
    accountNumber: string;
    branchName?: string;
    currency: string;
    bank: {
        name: string;
        logo?: string;
    };
}

interface Bank {
    id: string;
    name: string;
    accounts: BankAccount[];
}

interface Deposit {
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    transactionRef: string;
    createdAt: string;
    bankAccount?: { accountName: string; bank: { name: string } };
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    PENDING: { color: 'orange', label: 'Onay Bekliyor', icon: <ClockCircleOutlined /> },
    APPROVED: { color: 'green', label: 'Onaylandı', icon: <CheckCircleOutlined /> },
    REJECTED: { color: 'red', label: 'Reddedildi', icon: <CloseCircleOutlined /> },
};

const methodLabel: Record<string, string> = {
    CREDIT_CARD: 'Kredi Kartı',
    BANK_TRANSFER: 'Havale / EFT',
};

export default function AgencyDepositsPage() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [balance, setBalance] = useState<number>(0);
    const [banks, setBanks] = useState<Bank[]>([]);
    const [deposits, setDeposits] = useState<Deposit[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<'CREDIT_CARD' | 'BANK_TRANSFER'>('BANK_TRANSFER');
    const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);
    const [successModal, setSuccessModal] = useState<{ visible: boolean; ref: string; amount: number; bankAccount: BankAccount | null }>({
        visible: false, ref: '', amount: 0, bankAccount: null
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [settingsRes, banksRes, depositsRes] = await Promise.all([
                apiClient.get('/api/agency/settings'),
                apiClient.get('/api/agency/banks'),
                apiClient.get('/api/agency/deposits'),
            ]);
            if (settingsRes.data?.data?.balance !== undefined) {
                setBalance(Number(settingsRes.data.data.balance));
            }
            if (banksRes.data?.data) setBanks(banksRes.data.data);
            if (depositsRes.data?.data) setDeposits(depositsRes.data.data);
        } catch (err) {
            console.error(err);
            message.error('Veriler yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const handleBankAccountChange = (accountId: string) => {
        const allAccounts = banks.flatMap(b => b.accounts.map(a => ({ ...a, bank: b })));
        const found = allAccounts.find(a => a.id === accountId);
        setSelectedBankAccount(found || null);
    };

    const handleSubmit = async (values: any) => {
        setSaving(true);
        try {
            const payload = {
                amount: values.amount,
                method: paymentMethod,
                bankAccountId: values.bankAccountId,
            };
            const res = await apiClient.post('/api/agency/deposits', payload);
            if (res.data?.success) {
                const dep = res.data.data;
                if (paymentMethod === 'BANK_TRANSFER') {
                    setSuccessModal({ visible: true, ref: dep.transactionRef, amount: values.amount, bankAccount: selectedBankAccount });
                } else {
                    message.success('Depozitonuz başarıyla yüklendi ve bakiyenize eklendi.');
                    setBalance(prev => prev + values.amount);
                }
                form.resetFields();
                fetchData();
            }
        } catch (err: any) {
            message.error(err?.response?.data?.error || 'Depozito oluşturulamadı.');
        } finally {
            setSaving(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        message.success('Kopyalandı!');
    };

    const columns: ColumnsType<Deposit> = [
        {
            title: 'Referans No',
            dataIndex: 'transactionRef',
            key: 'transactionRef',
            render: (ref: string) => (
                <Text code style={{ fontSize: 12 }}>{ref}</Text>
            )
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            key: 'amount',
            render: (amount: number, record) => (
                <Text strong style={{ color: '#52c41a' }}>
                    +{Number(amount).toLocaleString('tr-TR', { style: 'currency', currency: record.currency || 'TRY' })}
                </Text>
            )
        },
        {
            title: 'Yöntem',
            dataIndex: 'method',
            key: 'method',
            render: (method: string) => (
                <Tag icon={method === 'CREDIT_CARD' ? <CreditCardOutlined /> : <BankOutlined />}>
                    {methodLabel[method] || method}
                </Tag>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                const cfg = statusConfig[status] || { color: 'default', label: status, icon: null };
                return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
            }
        },
        {
            title: 'Banka',
            key: 'bank',
            render: (_: any, record: Deposit) => record.bankAccount
                ? `${record.bankAccount.bank.name} – ${record.bankAccount.accountName}`
                : <Text type="secondary">—</Text>
        },
        {
            title: 'Tarih',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => new Date(date).toLocaleDateString('tr-TR', { dateStyle: 'medium' })
        }
    ];

    const allBankAccounts = banks.flatMap(b => b.accounts.map(a => ({ ...a, bank: b })));

    if (loading) {
        return (
            <AgencyGuard>
                <AgencyLayout selectedKey="deposits">
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 100 }}>
                        <Spin size="large" />
                    </div>
                </AgencyLayout>
            </AgencyGuard>
        );
    }

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="deposits">
                <div style={{ maxWidth: 900, margin: '0 auto' }}>

                    {/* Balance Card */}
                    <Card style={{ marginBottom: 24, background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', border: 'none' }}>
                        <Row gutter={24} align="middle">
                            <Col>
                                <WalletOutlined style={{ fontSize: 40, color: '#fff' }} />
                            </Col>
                            <Col>
                                <Statistic
                                    title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Mevcut Bakiye</span>}
                                    value={balance}
                                    precision={2}
                                    suffix="₺"
                                    valueStyle={{ color: '#fff', fontSize: 32, fontWeight: 700 }}
                                />
                            </Col>
                        </Row>
                    </Card>

                    {/* Deposit Form */}
                    <Card title={<Title level={4} style={{ margin: 0 }}>Depozito Yatır</Title>} style={{ marginBottom: 24 }}>
                        <Form form={form} layout="vertical" onFinish={handleSubmit}>
                            <Form.Item label="Ödeme Yöntemi" required>
                                <Radio.Group
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value)}
                                    optionType="button"
                                    buttonStyle="solid"
                                    size="large"
                                >
                                    <Radio.Button value="BANK_TRANSFER">
                                        <BankOutlined /> Havale / EFT
                                    </Radio.Button>
                                    <Radio.Button value="CREDIT_CARD">
                                        <CreditCardOutlined /> Kredi Kartı
                                    </Radio.Button>
                                </Radio.Group>
                            </Form.Item>

                            {paymentMethod === 'BANK_TRANSFER' && (
                                <>
                                    {allBankAccounts.length === 0 ? (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="Sisteme tanımlı banka hesabı bulunamadı."
                                            description="Yöneticiniz banka hesabı eklemeden havale yoluyla depozito yükleyemezsiniz. Lütfen yöneticinizle iletişime geçin."
                                            style={{ marginBottom: 16 }}
                                        />
                                    ) : (
                                        <Form.Item
                                            label="Havale Yapılacak Banka Hesabı"
                                            name="bankAccountId"
                                            rules={[{ required: paymentMethod === 'BANK_TRANSFER', message: 'Lütfen bir banka hesabı seçin' }]}
                                        >
                                            <Select
                                                placeholder="Banka hesabı seçin"
                                                size="large"
                                                onChange={handleBankAccountChange}
                                            >
                                                {allBankAccounts.map(acc => (
                                                    <Option key={acc.id} value={acc.id}>
                                                        {acc.bank.name} – {acc.accountName} ({acc.currency})
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    )}

                                    {selectedBankAccount && (
                                        <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                                            <Space orientation="vertical" style={{ width: '100%' }}>
                                                <Text strong>{selectedBankAccount.bank.name}</Text>
                                                <div>
                                                    <Text type="secondary">Hesap Adı: </Text>
                                                    <Text>{selectedBankAccount.accountName}</Text>
                                                </div>
                                                <div>
                                                    <Text type="secondary">IBAN: </Text>
                                                    <Text code>{selectedBankAccount.iban}</Text>
                                                    <Button size="small" icon={<CopyOutlined />} type="link" onClick={() => copyToClipboard(selectedBankAccount.iban)}>Kopyala</Button>
                                                </div>
                                                {selectedBankAccount.branchName && (
                                                    <div>
                                                        <Text type="secondary">Şube: </Text>
                                                        <Text>{selectedBankAccount.branchName}</Text>
                                                    </div>
                                                )}
                                            </Space>
                                        </Card>
                                    )}
                                </>
                            )}

                            {paymentMethod === 'CREDIT_CARD' && (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Kredi kartı ödemeleri anında onaylanır ve bakiyenize eklenir."
                                    style={{ marginBottom: 16 }}
                                />
                            )}

                            <Form.Item
                                label="Yatırılacak Tutar (₺)"
                                name="amount"
                                rules={[{ required: true, message: 'Lütfen bir tutar girin' }]}
                            >
                                <InputNumber
                                    size="large"
                                    min={1}
                                    style={{ width: '100%' }}
                                    placeholder="Örn: 5000"
                                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    addonBefore="₺"
                                />
                            </Form.Item>

                            <Form.Item style={{ marginTop: 24 }}>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    size="large"
                                    loading={saving}
                                    icon={<WalletOutlined />}
                                    style={{ width: '100%' }}
                                    disabled={paymentMethod === 'BANK_TRANSFER' && allBankAccounts.length === 0}
                                >
                                    {paymentMethod === 'BANK_TRANSFER' ? 'Havale Talebini Kaydet' : 'Ödemeyi Tamamla'}
                                </Button>
                            </Form.Item>
                        </Form>
                    </Card>

                    {/* Deposit History */}
                    <Card title={<Title level={4} style={{ margin: 0 }}>Depozito Geçmişi</Title>}>
                        <Table
                            dataSource={deposits}
                            columns={columns}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            locale={{ emptyText: 'Henüz depozito yatırılmamış.' }}
                        />
                    </Card>

                    {/* Success Modal for Bank Transfer */}
                    <Modal
                        title={<><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Havale Talebi Oluşturuldu</>}
                        open={successModal.visible}
                        onOk={() => setSuccessModal({ ...successModal, visible: false })}
                        onCancel={() => setSuccessModal({ ...successModal, visible: false })}
                        okText="Tamam, Anladım"
                        cancelButtonProps={{ style: { display: 'none' } }}
                        width={520}
                    >
                        <Alert
                            type="success"
                            message="Havale talebiniz başarıyla alındı! Aşağıdaki işlem referans numarasını açıklama bölümüne yazmayı unutmayın."
                            style={{ marginBottom: 16 }}
                        />
                        <Card size="small" style={{ background: '#fffbe6', border: '1px solid #ffe58f', marginBottom: 16 }}>
                            <div style={{ textAlign: 'center' }}>
                                <Text type="secondary">İşlem Referans No</Text>
                                <br />
                                <Text style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>{successModal.ref}</Text>
                                <br />
                                <Button icon={<CopyOutlined />} size="small" onClick={() => copyToClipboard(successModal.ref)}>Kopyala</Button>
                            </div>
                        </Card>
                        <Paragraph>
                            Lütfen <Text strong>{Number(successModal.amount).toLocaleString('tr-TR')}</Text> TL tutarındaki havaleyi,
                            <Text strong> açıklama kısmına yukarıdaki referans numarasını</Text> yazarak aşağıdaki hesaba yapınız:
                        </Paragraph>
                        {successModal.bankAccount && (
                            <Card size="small">
                                <Space orientation="vertical">
                                    <Text><Text strong>Banka:</Text> {successModal.bankAccount.bank.name}</Text>
                                    <Text><Text strong>Hesap:</Text> {successModal.bankAccount.accountName}</Text>
                                    <Text><Text strong>IBAN:</Text> <Text code>{successModal.bankAccount.iban}</Text></Text>
                                </Space>
                            </Card>
                        )}
                        <Alert type="warning" showIcon message="Ödeme yöneticiniz tarafından onaylandıktan sonra bakiyenize eklenecektir." style={{ marginTop: 16 }} />
                    </Modal>
                </div>
            </AgencyLayout>
        </AgencyGuard>
    );
}
