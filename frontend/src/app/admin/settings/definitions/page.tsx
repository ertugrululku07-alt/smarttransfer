'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import {
    Typography, Card, Tabs, Table, Button, Space, Modal, Form,
    Input, InputNumber, Switch, message, Spin, Tag, Popconfirm, Tooltip
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, StarFilled,
    ClockCircleOutlined, CarOutlined, DollarOutlined, PercentageOutlined,
    InfoCircleOutlined, SaveOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import { invalidateDefinitions } from '@/app/hooks/useDefinitions';

const { Title, Text } = Typography;

// ── Section Header Component ──
const SectionHeader = ({ icon, title, subtitle, color }: { icon: React.ReactNode; title: string; subtitle: string; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(135deg, ${color}, ${color}dd)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, boxShadow: `0 4px 12px ${color}40`
        }}>{icon}</div>
        <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div>
        </div>
    </div>
);

// ── Stat Card ──
const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) => (
    <div style={{
        background: `linear-gradient(135deg, ${color}08, ${color}15)`,
        border: `1px solid ${color}25`, borderRadius: 12, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12, flex: 1
    }}>
        <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: color, fontSize: 16
        }}>{icon}</div>
        <div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{value}</div>
        </div>
    </div>
);

export default function DefinitionsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [definitions, setDefinitions] = useState<{ vatRates: any[], currencies: any[] }>({
        vatRates: [],
        currencies: []
    });
    const [timeDefinitions, setTimeDefinitions] = useState<{
        privateTransferMinHours: number;
        shuttleTransferMinHours: number;
    }>({ privateTransferMinHours: 3, shuttleTransferMinHours: 7 });
    const [timeSaving, setTimeSaving] = useState(false);

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
            const settings = res.data?.data?.tenant?.settings || {};
            const defs = settings.definitions || { vatRates: [], currencies: [] };
            setDefinitions(defs);
            if (settings.timeDefinitions) {
                setTimeDefinitions({
                    privateTransferMinHours: settings.timeDefinitions.privateTransferMinHours ?? 3,
                    shuttleTransferMinHours: settings.timeDefinitions.shuttleTransferMinHours ?? 7,
                });
            }
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
            invalidateDefinitions();
            message.success('Tanımlamalar kaydedildi.');
        } catch (error) {
            console.error('Save error:', error);
            message.error('Kaydedilirken bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const saveTimeDefinitions = async () => {
        try {
            setTimeSaving(true);
            await apiClient.put('/api/tenant/settings', {
                timeDefinitions: timeDefinitions
            });
            message.success('Zaman tanımları kaydedildi.');
        } catch (error) {
            console.error('Save error:', error);
            message.error('Kaydedilirken bir hata oluştu.');
        } finally {
            setTimeSaving(false);
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
        const newDefs = { ...definitions, vatRates: (definitions.vatRates || []).filter((v: any) => v.id !== id) };
        await saveDefinitions(newDefs);
    };

    const setVatDefault = async (id: string) => {
        const newVatRates = (definitions.vatRates || []).map((v: any) => ({ ...v, isDefault: v.id === id }));
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
        const newDefs = { ...definitions, currencies: definitions.currencies.filter(c => c.id !== id) };
        await saveDefinitions(newDefs);
    };

    const setCurrencyDefault = async (id: string) => {
        const newCurrencies = definitions.currencies.map((c: any) => ({ ...c, isDefault: c.id === id }));
        await saveDefinitions({ ...definitions, currencies: newCurrencies });
    };

    // --- Table Columns ---
    const vatColumns = [
        {
            title: 'KDV Adı', dataIndex: 'name', key: 'name',
            render: (val: any) => <Text strong style={{ color: '#1e293b' }}>{val}</Text>
        },
        {
            title: 'Oran', dataIndex: 'rate', key: 'rate',
            render: (val: any) => (
                <span style={{ fontSize: 14, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 10px', borderRadius: 6 }}>%{val}</span>
            )
        },
        {
            title: 'Varsayılan', dataIndex: 'isDefault', key: 'isDefault',
            render: (isDefault: boolean, record: any) => (
                isDefault ?
                    <Tag color="green" style={{ borderRadius: 6, fontWeight: 600 }}><StarFilled /> Varsayılan</Tag> :
                    <Button size="small" type="dashed" style={{ borderRadius: 6 }} onClick={() => setVatDefault(record.id)}>Varsayılan Yap</Button>
            )
        },
        {
            title: 'İşlemler', key: 'actions', width: 100,
            render: (_: any, record: any) => (
                <Space size={4}>
                    <Tooltip title="Düzenle">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openVatModal(record)}
                            style={{ color: '#6366f1', borderRadius: 6 }} />
                    </Tooltip>
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteVat(record.id)} okText="Evet" cancelText="Hayır">
                        <Tooltip title="Sil">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const currencyColumns = [
        {
            title: 'Para Birimi', dataIndex: 'code', key: 'code',
            render: (val: any) => <Tag color="blue" style={{ borderRadius: 6, fontWeight: 700, fontSize: 13 }}>{val}</Tag>
        },
        {
            title: 'Sembol', dataIndex: 'symbol', key: 'symbol',
            render: (val: any) => <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{val}</span>
        },
        {
            title: 'Kur (TL)', dataIndex: 'rate', key: 'rate',
            render: (val: any) => <span style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>₺{val}</span>
        },
        {
            title: 'Varsayılan', dataIndex: 'isDefault', key: 'isDefault',
            render: (isDefault: boolean, record: any) => (
                isDefault ?
                    <Tag color="green" style={{ borderRadius: 6, fontWeight: 600 }}><StarFilled /> Varsayılan</Tag> :
                    <Button size="small" type="dashed" style={{ borderRadius: 6 }} onClick={() => setCurrencyDefault(record.id)}>Varsayılan Yap</Button>
            )
        },
        {
            title: 'İşlemler', key: 'actions', width: 100,
            render: (_: any, record: any) => (
                <Space size={4}>
                    <Tooltip title="Düzenle">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openCurrencyModal(record)}
                            style={{ color: '#6366f1', borderRadius: 6 }} />
                    </Tooltip>
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteCurrency(record.id)} okText="Evet" cancelText="Hayır">
                        <Tooltip title="Sil">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const tabItems = [
        {
            key: 'vat',
            label: <span><PercentageOutlined /> KDV Oranları</span>,
            children: (
                <div>
                    <SectionHeader icon={<PercentageOutlined />} title="KDV Oranları" subtitle="Faturalarda kullanılacak vergi oranlarını yönetin" color="#6366f1" />
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                        <StatCard icon={<PercentageOutlined />} label="Toplam Tanım" value={definitions.vatRates?.length || 0} color="#6366f1" />
                        <StatCard icon={<StarFilled />} label="Varsayılan Oran" value={definitions.vatRates?.find((v: any) => v.isDefault)?.rate ? `%${definitions.vatRates.find((v: any) => v.isDefault).rate}` : '—'} color="#10b981" />
                    </div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openVatModal()}
                            style={{ borderRadius: 8, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                            Yeni KDV Oranı Ekle
                        </Button>
                    </div>
                    <Table
                        dataSource={definitions.vatRates}
                        columns={vatColumns}
                        rowKey="id"
                        pagination={false}
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                    />
                </div>
            )
        },
        {
            key: 'currency',
            label: <span><DollarOutlined /> Para Birimleri</span>,
            children: (
                <div>
                    <SectionHeader icon={<DollarOutlined />} title="Para Birimleri ve Kur" subtitle="Döviz kurlarını ve para birimlerini yönetin" color="#10b981" />
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                        <StatCard icon={<DollarOutlined />} label="Toplam Para Birimi" value={definitions.currencies?.length || 0} color="#10b981" />
                        <StatCard icon={<StarFilled />} label="Varsayılan" value={definitions.currencies?.find((c: any) => c.isDefault)?.code || '—'} color="#f59e0b" />
                    </div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCurrencyModal()}
                            style={{ borderRadius: 8, fontWeight: 600, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            Yeni Para Birimi Ekle
                        </Button>
                    </div>
                    <Table
                        dataSource={definitions.currencies}
                        columns={currencyColumns}
                        rowKey="id"
                        pagination={false}
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                    />
                </div>
            )
        },
        {
            key: 'time',
            label: <span><ClockCircleOutlined /> Zaman Tanımları</span>,
            children: (
                <div>
                    <SectionHeader icon={<ClockCircleOutlined />} title="Zaman Tanımları" subtitle="Transfer aramalarında minimum zaman kısıtlamalarını belirleyin" color="#f59e0b" />

                    <div style={{
                        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fde68a',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 24,
                        display: 'flex', alignItems: 'flex-start', gap: 10
                    }}>
                        <InfoCircleOutlined style={{ color: '#f59e0b', fontSize: 18, marginTop: 2 }} />
                        <div>
                            <Text strong style={{ color: '#92400e', fontSize: 13 }}>Bu ayar ne işe yarar?</Text>
                            <div style={{ color: '#78350f', fontSize: 12, marginTop: 2 }}>
                                Müşteri transfer araması yaptığında, uçuş saatine belirlenen saatten daha az süre kaldıysa
                                ilgili transfer tipi sonuçlarda <strong>gösterilmez</strong>. Böylece yetiştirilemeyen transferlerin satışı engellenir.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        {/* Özel Transfer */}
                        <div style={{
                            background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                            overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                padding: '18px 22px', color: '#fff'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <CarOutlined style={{ fontSize: 22 }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Özel Transfer</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>VIP ve özel araç transferleri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '24px 22px' }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>
                                    Minimum Süre (Saat)
                                </label>
                                <InputNumber
                                    size="large"
                                    min={0}
                                    max={48}
                                    step={0.5}
                                    value={timeDefinitions.privateTransferMinHours}
                                    onChange={(val) => setTimeDefinitions(prev => ({ ...prev, privateTransferMinHours: val || 0 }))}
                                    style={{ width: '100%', borderRadius: 10 }}
                                    addonAfter="saat"
                                />
                                <div style={{
                                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                                    background: '#f8fafc', border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>
                                        <ThunderboltOutlined style={{ color: '#6366f1' }} /> Uçuşa <strong>{timeDefinitions.privateTransferMinHours} saatten</strong> az kaldıysa özel transfer <span style={{ color: '#ef4444', fontWeight: 700 }}>gösterilmez</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Shuttle Transfer */}
                        <div style={{
                            background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                            overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                padding: '18px 22px', color: '#fff'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 22 }}>🚌</span>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Shuttle Transfer</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>Paylaşımlı shuttle seferleri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '24px 22px' }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>
                                    Minimum Süre (Saat)
                                </label>
                                <InputNumber
                                    size="large"
                                    min={0}
                                    max={48}
                                    step={0.5}
                                    value={timeDefinitions.shuttleTransferMinHours}
                                    onChange={(val) => setTimeDefinitions(prev => ({ ...prev, shuttleTransferMinHours: val || 0 }))}
                                    style={{ width: '100%', borderRadius: 10 }}
                                    addonAfter="saat"
                                />
                                <div style={{
                                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                                    background: '#fffbeb', border: '1px solid #fde68a'
                                }}>
                                    <div style={{ fontSize: 11, color: '#78350f' }}>
                                        <ThunderboltOutlined style={{ color: '#f59e0b' }} /> Uçuşa <strong>{timeDefinitions.shuttleTransferMinHours} saatten</strong> az kaldıysa shuttle <span style={{ color: '#ef4444', fontWeight: 700 }}>gösterilmez</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={timeSaving}
                            onClick={saveTimeDefinitions}
                            size="large"
                            style={{
                                borderRadius: 10, fontWeight: 700, height: 44, paddingInline: 32,
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                border: 'none', boxShadow: '0 4px 12px #f59e0b40'
                            }}
                        >
                            Zaman Tanımlarını Kaydet
                        </Button>
                    </div>
                </div>
            )
        }
    ];

    return (
        <AdminLayout selectedKey="definitions">
            <div style={{ padding: '0 24px 24px 24px', maxWidth: 1200 }}>
                {/* Header */}
                <div style={{
                    marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 22, boxShadow: '0 4px 14px #6366f140'
                            }}>⚙</div>
                            <div>
                                <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Sistem Tanımlamaları</Title>
                                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                    KDV, döviz kurları ve zaman kısıtlamalarını buradan yönetin
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                <Card style={{
                    borderRadius: 16, border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
                }} bodyStyle={{ padding: '20px 24px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 12, color: '#94a3b8' }}>Yükleniyor...</div>
                        </div>
                    ) : (
                        <Tabs
                            defaultActiveKey="vat"
                            items={tabItems}
                            type="card"
                            tabBarGutter={8}
                            tabBarStyle={{ marginBottom: 24 }}
                        />
                    )}
                </Card>
            </div>

            {/* VAT Modal */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PercentageOutlined style={{ color: '#6366f1' }} />
                    <span>{editingItem ? "KDV Oranını Düzenle" : "Yeni KDV Oranı Ekle"}</span>
                </div>}
                open={vatModalVisible}
                onCancel={() => setVatModalVisible(false)}
                confirmLoading={saving}
                onOk={() => vatForm.submit()}
                okText="Kaydet"
                cancelText="Vazgeç"
                styles={{ body: { paddingTop: 20 } }}
            >
                <Form form={vatForm} layout="vertical" onFinish={handleVatSubmit}>
                    <Form.Item name="name" label="Tanım Adı" rules={[{ required: true, message: 'Tanım adı girin' }]}>
                        <Input placeholder="Örn: KDV 20" size="large" style={{ borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="rate" label="KDV Oranı (%)" rules={[{ required: true, message: 'Oran girin' }]}>
                        <InputNumber placeholder="20" min={0} max={100} size="large" style={{ width: '100%', borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="isDefault" valuePropName="checked">
                        <Switch checkedChildren="Varsayılan" unCheckedChildren="Normal" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Currency Modal */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DollarOutlined style={{ color: '#10b981' }} />
                    <span>{editingItem ? "Para Birimini Düzenle" : "Yeni Para Birimi Ekle"}</span>
                </div>}
                open={currencyModalVisible}
                onCancel={() => setCurrencyModalVisible(false)}
                confirmLoading={saving}
                onOk={() => currencyForm.submit()}
                okText="Kaydet"
                cancelText="Vazgeç"
                styles={{ body: { paddingTop: 20 } }}
            >
                <Form form={currencyForm} layout="vertical" onFinish={handleCurrencySubmit}>
                    <Form.Item name="code" label="Para Birimi Kodu" rules={[{ required: true, message: 'Kodu girin' }]}>
                        <Input placeholder="Örn: USD" size="large" style={{ borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="symbol" label="Sembol" rules={[{ required: true, message: 'Sembolü girin' }]}>
                        <Input placeholder="Örn: $" size="large" style={{ borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="rate" label="Türk Lirası Karşılığı" rules={[{ required: true, message: 'Kuru girin' }]}
                        tooltip="1 birim = kaç TL?">
                        <InputNumber placeholder="35.50" min={0} step={0.01} size="large" style={{ width: '100%', borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="isDefault" valuePropName="checked">
                        <Switch checkedChildren="Varsayılan" unCheckedChildren="Normal" />
                    </Form.Item>
                </Form>
            </Modal>
        </AdminLayout>
    );
}
