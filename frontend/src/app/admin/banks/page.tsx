'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Button, Table, Typography, Space, Modal, Form, Input, Select, Tag,
    Tooltip, Popconfirm, message, Row, Col, List, Empty, Avatar
} from 'antd';
import {
    PlusOutlined,
    BankOutlined,
    DeleteOutlined,
    EditOutlined,
    GlobalOutlined,
    CreditCardOutlined,
    CopyOutlined
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient from '@/lib/api-client';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

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
    const [banks, setBanks] = useState<Bank[]>([]);
    const [loading, setLoading] = useState(false);

    // Modals
    const [isBankModalVisible, setIsBankModalVisible] = useState(false);
    const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);

    // Forms
    const [bankForm] = Form.useForm();
    const [accountForm] = Form.useForm();

    // Edit States
    const [editingBank, setEditingBank] = useState<Bank | null>(null);
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
    const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

    const fetchBanks = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/banks');
            if (res.data.success) {
                setBanks(res.data.data);
            }
        } catch (error) {
            message.error('Bankalar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBanks();
    }, []);

    // Bank Actions
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
        } catch (error) {
            message.error('Silme işlemi başarısız');
        }
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
        } catch (error) {
            // Validation failed or API error
        }
    };

    // Account Actions
    const handleAddAccount = (bankId: string) => {
        setSelectedBankId(bankId);
        setEditingAccount(null);
        accountForm.resetFields();
        accountForm.setFieldsValue({ currency: 'TRY' });
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
        } catch (error) {
            message.error('Silme işlemi başarısız');
        }
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
        } catch (error) {
            // Error
        }
    };

    return (
        <AdminGuard>
            <AdminLayout selectedKey="bank-list">
                <div style={{ paddingBottom: 50 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Title level={4} style={{ margin: 0 }}>
                            <BankOutlined style={{ marginRight: 8 }} />
                            Banka Listesi
                        </Title>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddBank}>
                            Yeni Banka Ekle
                        </Button>
                    </div>

                    {banks.length === 0 && !loading ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="Henüz banka eklenmemiş"
                            style={{ margin: '50px 0' }}
                        >
                            <Button type="primary" onClick={handleAddBank}>İlk Bankayı Ekle</Button>
                        </Empty>
                    ) : (
                        <Row gutter={[16, 16]}>
                            {banks.map(bank => (
                                <Col xs={24} lg={12} xl={8} key={bank.id}>
                                    <Card
                                        title={
                                            <Space>
                                                <Avatar icon={<BankOutlined />} style={{ backgroundColor: '#1890ff' }} />
                                                <Text strong>{bank.name}</Text>
                                                {bank.code && <Tag>{bank.code}</Tag>}
                                            </Space>
                                        }
                                        extra={
                                            <Space>
                                                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEditBank(bank)} />
                                                <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => handleDeleteBank(bank.id)}>
                                                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                                </Popconfirm>
                                            </Space>
                                        }
                                        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                                        bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                                    >
                                        {bank.website && (
                                            <div style={{ marginBottom: 12 }}>
                                                <a href={bank.website} target="_blank" rel="noreferrer">
                                                    <GlobalOutlined /> {bank.website}
                                                </a>
                                            </div>
                                        )}

                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>BANKA HESAPLARI</Text>
                                                <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => handleAddAccount(bank.id)}>
                                                    Ekle
                                                </Button>
                                            </div>

                                            {bank.accounts && bank.accounts.length > 0 ? (
                                                <List
                                                    size="small"
                                                    dataSource={bank.accounts}
                                                    renderItem={account => (
                                                        <List.Item
                                                            actions={[
                                                                <Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => handleEditAccount(account)} />,
                                                                <Popconfirm key="del" title="Sil?" onConfirm={() => handleDeleteAccount(account.id)}>
                                                                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                                                </Popconfirm>
                                                            ]}
                                                        >
                                                            <List.Item.Meta
                                                                avatar={<CreditCardOutlined style={{ color: '#52c41a' }} />}
                                                                title={
                                                                    <Space>
                                                                        <Text>{account.accountName}</Text>
                                                                        <Tag color="blue">{account.currency}</Tag>
                                                                    </Space>
                                                                }
                                                                description={
                                                                    <Space direction="vertical" size={0}>
                                                                        <Paragraph copyable={{ text: account.iban }} style={{ margin: 0, fontSize: 12 }}>
                                                                            {account.iban}
                                                                        </Paragraph>
                                                                        {account.branchName && (
                                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                                {account.branchName} {account.branchCode ? `(${account.branchCode})` : ''} - {account.accountNumber}
                                                                            </Text>
                                                                        )}
                                                                    </Space>
                                                                }
                                                            />
                                                        </List.Item>
                                                    )}
                                                />
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '20px 0', color: '#ccc' }}>
                                                    Hesap bulunmuyor
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    )}

                    {/* Bank Modal */}
                    <Modal
                        title={editingBank ? "Bankayı Düzenle" : "Yeni Banka Ekle"}
                        open={isBankModalVisible}
                        onOk={handleBankSubmit}
                        onCancel={() => setIsBankModalVisible(false)}
                    >
                        <Form form={bankForm} layout="vertical">
                            <Form.Item name="name" label="Banka Adı" rules={[{ required: true, message: 'Gerekli' }]}>
                                <Input placeholder="Örn: Garanti BBVA" prefix={<BankOutlined />} />
                            </Form.Item>
                            <Form.Item name="code" label="Banka Kodu">
                                <Input placeholder="Banka kodu" />
                            </Form.Item>
                            <Form.Item name="website" label="Web Sitesi">
                                <Input placeholder="https://..." prefix={<GlobalOutlined />} />
                            </Form.Item>
                        </Form>
                    </Modal>

                    {/* Account Modal */}
                    <Modal
                        title={editingAccount ? "Hesabı Düzenle" : "Yeni Hesap Ekle"}
                        open={isAccountModalVisible}
                        onOk={handleAccountSubmit}
                        onCancel={() => setIsAccountModalVisible(false)}
                    >
                        <Form form={accountForm} layout="vertical">
                            <Form.Item name="accountName" label="Hesap Adı" rules={[{ required: true, message: 'Gerekli' }]}>
                                <Input placeholder="Örn: Şirket Ana Hesap (TL)" />
                            </Form.Item>
                            <Form.Item name="currency" label="Para Birimi" rules={[{ required: true }]}>
                                <Select>
                                    <Option value="TRY">TRY (Türk Lirası)</Option>
                                    <Option value="USD">USD (Dolar)</Option>
                                    <Option value="EUR">EUR (Euro)</Option>
                                    <Option value="GBP">GBP (Sterlin)</Option>
                                </Select>
                            </Form.Item>
                            <Form.Item name="iban" label="IBAN" rules={[{ required: true, message: 'Gerekli' }]}>
                                <Input placeholder="TR..." style={{ width: '100%' }} />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="accountNumber" label="Hesap No">
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="branchCode" label="Şube Kodu">
                                        <Input />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="branchName" label="Şube Adı">
                                <Input />
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
