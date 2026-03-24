'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import {
    Typography, Card, Tabs, Table, Button, Space, Modal, Form,
    Input, InputNumber, Switch, message, Spin, Tag, Popconfirm
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const { Title } = Typography;

export default function DefinitionsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [definitions, setDefinitions] = useState<{ vatRates: any[], currencies: any[] }>({
        vatRates: [],
        currencies: []
    });

    // Modals state
    const [vatModalVisible, setVatModalVisible] = useState(false);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    const [vatForm] = Form.useForm();
    const [currencyForm] = Form.useForm();

    useEffect(() => {
        fetchDefinitions();
    }, []);

    const fetchDefinitions = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/tenant/info');
            // definitions may be stored directly on tenant or inside settings
            const settings = res.data?.data?.tenant?.settings || {};
            const defs = settings.definitions || { vatRates: [], currencies: [] };
            setDefinitions(defs);
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Tanımlamalar yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const saveDefinitions = async (newDefinitions: any) => {
        try {
            setSaving(true);
            await apiClient.put('/api/tenant/settings', {
                definitions: newDefinitions
            });
            setDefinitions(newDefinitions);
            message.success('Tanımlamalar başarıyla kaydedildi.');
        } catch (error) {
            console.error('Save error:', error);
            message.error('Kaydedilirken bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const generateId = () => Math.random().toString(36).substr(2, 9);

    // --- VAT Handlers ---
    const openVatModal = (item: any = null) => {
        setEditingItem(item);
        if (item) {
            vatForm.setFieldsValue(item);
        } else {
            vatForm.resetFields();
        }
        setVatModalVisible(true);
    };

    const handleVatSubmit = async (values: any) => {
        let newVatRates: any[] = [...(definitions.vatRates || [])];

        // If setting as default, unset others
        if (values.isDefault) {
            newVatRates = newVatRates.map((v: any) => ({ ...v, isDefault: false }));
        } else if (newVatRates.length === 0) {
            values.isDefault = true;
        }

        if (editingItem && (editingItem as any).id) {
            newVatRates = newVatRates.map((v: any) => v.id === (editingItem as any).id ? { ...v, ...values } : v);
        } else {
            newVatRates.push({ ...values, id: generateId() });
        }

        const newDefs = { ...definitions, vatRates: newVatRates };
        await saveDefinitions(newDefs);
        setVatModalVisible(false);
    };

    const deleteVat = async (id: string) => {
        const newDefs = {
            ...definitions,
            vatRates: (definitions.vatRates || []).filter((v: any) => v.id !== id)
        };
        await saveDefinitions(newDefs);
    };

    const setVatDefault = async (id: string) => {
        const newVatRates = (definitions.vatRates || []).map((v: any) => ({
            ...v,
            isDefault: v.id === id
        }));
        await saveDefinitions({ ...definitions, vatRates: newVatRates });
    };

    // --- Currency Handlers ---
    const openCurrencyModal = (item: any = null) => {
        setEditingItem(item);
        if (item) {
            currencyForm.setFieldsValue(item);
        } else {
            currencyForm.resetFields();
        }
        setCurrencyModalVisible(true);
    };

    const handleCurrencySubmit = async (values: any) => {
        let newCurrencies: any[] = [...(definitions.currencies || [])];

        if (values.isDefault) {
            newCurrencies = newCurrencies.map((c: any) => ({ ...c, isDefault: false }));
        } else if (newCurrencies.length === 0) {
            values.isDefault = true;
        }

        if (editingItem && (editingItem as any).id) {
            newCurrencies = newCurrencies.map((c: any) => c.id === (editingItem as any).id ? { ...c, ...values } : c);
        } else {
            newCurrencies.push({ ...values, id: generateId() });
        }

        const newDefs = { ...definitions, currencies: newCurrencies };
        await saveDefinitions(newDefs);
        setCurrencyModalVisible(false);
    };

    const deleteCurrency = async (id: string) => {
        const newDefs = {
            ...definitions,
            currencies: definitions.currencies.filter(c => c.id !== id)
        };
        await saveDefinitions(newDefs);
    };

    const setCurrencyDefault = async (id: string) => {
        const newCurrencies = definitions.currencies.map((c: any) => ({
            ...c,
            isDefault: c.id === id
        }));
        await saveDefinitions({ ...definitions, currencies: newCurrencies });
    };

    // --- Table Columns ---
    const vatColumns = [
        { title: 'KDV Adı', dataIndex: 'name', key: 'name' },
        { title: 'Oran (%)', dataIndex: 'rate', key: 'rate', render: (val: any) => `%${val}` },
        {
            title: 'Varsayılan',
            dataIndex: 'isDefault',
            key: 'isDefault',
            render: (isDefault: boolean, record: any) => (
                isDefault ? <Tag color="green"><StarFilled /> Varsayılan</Tag> :
                    <Button size="small" type="dashed" onClick={() => setVatDefault(record.id)}>Varsayılan Yap</Button>
            )
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: any) => (
                <Space>
                    <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => openVatModal(record)} />
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteVat(record.id)} okText="Evet" cancelText="Hayır">
                        <Button danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const currencyColumns = [
        { title: 'Para Birimi', dataIndex: 'code', key: 'code', render: (val: any) => <Tag color="blue">{val}</Tag> },
        { title: 'Sembol', dataIndex: 'symbol', key: 'symbol' },
        { title: 'Kur', dataIndex: 'rate', key: 'rate', render: (val: any) => `₺${val}` },
        {
            title: 'Varsayılan',
            dataIndex: 'isDefault',
            key: 'isDefault',
            render: (isDefault: boolean, record: any) => (
                isDefault ? <Tag color="green"><StarFilled /> Varsayılan</Tag> :
                    <Button size="small" type="dashed" onClick={() => setCurrencyDefault(record.id)}>Varsayılan Yap</Button>
            )
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: any) => (
                <Space>
                    <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => openCurrencyModal(record)} />
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteCurrency(record.id)} okText="Evet" cancelText="Hayır">
                        <Button danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const items = [
        {
            key: 'vat',
            label: 'KDV Oranları',
            children: (
                <div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openVatModal()}>Yeni KDV Oranı Ekle</Button>
                    </div>
                    <Table
                        dataSource={definitions.vatRates}
                        columns={vatColumns}
                        rowKey="id"
                        pagination={false}
                        bordered
                    />
                </div>
            )
        },
        {
            key: 'currency',
            label: 'Para Birimleri ve Kur',
            children: (
                <div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCurrencyModal()}>Yeni Para Birimi Ekle</Button>
                    </div>
                    <Table
                        dataSource={definitions.currencies}
                        columns={currencyColumns}
                        rowKey="id"
                        pagination={false}
                        bordered
                    />
                </div>
            )
        }
    ];

    return (
        <AdminLayout selectedKey="definitions">
            <div style={{ padding: '0 24px 24px 24px' }}>
                <div style={{ marginBottom: 24 }}>
                    <Title level={3}>Sistem Tanımlamaları</Title>
                    <Typography.Text type="secondary">
                        Sistemde kullanılacak dinamik tanımlamaları (KDV oranları, döviz kurları vb.) buradan yönetebilirsiniz.
                    </Typography.Text>
                </div>

                <Card>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /></div>
                    ) : (
                        <Tabs defaultActiveKey="vat" items={items} type="line" tabBarGutter={30} />
                    )}
                </Card>
            </div>

            {/* VAT Modal */}
            <Modal
                title={editingItem ? "KDV Oranını Düzenle" : "Yeni KDV Oranı Ekle"}
                open={vatModalVisible}
                onCancel={() => setVatModalVisible(false)}
                confirmLoading={saving}
                onOk={() => vatForm.submit()}
            >
                <Form form={vatForm} layout="vertical" onFinish={handleVatSubmit}>
                    <Form.Item
                        name="name"
                        label="Tanım Adı"
                        rules={[{ required: true, message: 'Lütfen bir tanım adı girin (Örn: %20 KDV)' }]}
                    >
                        <Input placeholder="Örn: %20 KDV" />
                    </Form.Item>
                    <Form.Item
                        name="rate"
                        label="KDV Oranı (%)"
                        rules={[{ required: true, message: 'Lütfen oranı girin' }]}
                    >
                        <InputNumber placeholder="20" min={0} max={100} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="isDefault" valuePropName="checked">
                        <Switch checkedChildren="Varsayılan" unCheckedChildren="Normal" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Currency Modal */}
            <Modal
                title={editingItem ? "Para Birimini Düzenle" : "Yeni Para Birimi Ekle"}
                open={currencyModalVisible}
                onCancel={() => setCurrencyModalVisible(false)}
                confirmLoading={saving}
                onOk={() => currencyForm.submit()}
            >
                <Form form={currencyForm} layout="vertical" onFinish={handleCurrencySubmit}>
                    <Form.Item
                        name="code"
                        label="Para Birimi Kodu"
                        rules={[{ required: true, message: 'Lütfen kodu girin (Örn: USD, EUR)' }]}
                    >
                        <Input placeholder="Örn: USD" />
                    </Form.Item>
                    <Form.Item
                        name="symbol"
                        label="Sembol"
                        rules={[{ required: true, message: 'Lütfen sembolü girin (Örn: $, €)' }]}
                    >
                        <Input placeholder="Örn: $" />
                    </Form.Item>
                    <Form.Item
                        name="rate"
                        label="Türk Lirası Karşılığı (Kur)"
                        rules={[{ required: true, message: 'Lütfen manuel güncel kuru girin' }]}
                        tooltip="Bu para biriminin 1 biriminin TL karşılığı değeridir."
                    >
                        <InputNumber placeholder="Örn: 35.50" min={0} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="isDefault" valuePropName="checked">
                        <Switch checkedChildren="Varsayılan" unCheckedChildren="Normal" />
                    </Form.Item>
                </Form>
            </Modal>

        </AdminLayout>
    );
}
