'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Form, Input, Button, Switch, Typography, message,
    Tabs, Tag, Alert, Divider, Space, Select, Modal, Popconfirm, Empty
} from 'antd';
import {
    CreditCardOutlined,
    SaveOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    EyeInvisibleOutlined,
    SafetyCertificateOutlined,
    LinkOutlined,
    PlusOutlined,
    DeleteOutlined,
    BankOutlined,
    EditOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;

// ── Bank Definitions (NestPay compatible) ────────────────────
const BANK_OPTIONS = [
    { value: 'ziraat', label: 'Ziraat Bankası', color: '#00843D' },
    { value: 'isbank', label: 'İş Bankası', color: '#003087' },
    { value: 'akbank', label: 'Akbank', color: '#E30A17' },
    { value: 'halkbank', label: 'Halkbank', color: '#0066B3' },
    { value: 'finansbank', label: 'QNB Finansbank', color: '#6C2D82' },
    { value: 'teb', label: 'TEB', color: '#009EE3' },
    { value: 'denizbank', label: 'Denizbank', color: '#003DA5' },
    { value: 'ingbank', label: 'ING Bank', color: '#FF6200' },
    { value: 'sekerbank', label: 'Şekerbank', color: '#8DC63F' },
    { value: 'custom', label: 'Diğer / Özel', color: '#64748b' },
];

// ── Logos ─────────────────────────────────────────────────────
const PaytrLogo = () => (
    <span style={{
        background: '#003087', color: '#fff', fontWeight: 800,
        fontSize: 13, padding: '2px 8px', borderRadius: 4, letterSpacing: 1
    }}>PAYTR</span>
);

const IyzicoLogo = () => (
    <span style={{
        background: '#1ABC9C', color: '#fff', fontWeight: 800,
        fontSize: 13, padding: '2px 8px', borderRadius: 4, letterSpacing: 1
    }}>iyzico</span>
);

const BankLogo = ({ bankType, name }: { bankType: string; name?: string }) => {
    const bank = BANK_OPTIONS.find(b => b.value === bankType);
    return (
        <span style={{
            background: bank?.color || '#475569', color: '#fff', fontWeight: 800,
            fontSize: 11, padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5
        }}>
            {name || bank?.label || bankType}
        </span>
    );
};

// ── Types ─────────────────────────────────────────────────────
interface BankConfig {
    id: string;
    bankType: string;
    name: string;
    clientId: string;
    storeKey: string;
    storeType: string;
    testMode: boolean;
    enabled: boolean;
    successUrl?: string;
    failUrl?: string;
    customGatewayUrl?: string;
}

export default function VirtualPosPage() {
    const [paytrForm] = Form.useForm();
    const [iyzicoForm] = Form.useForm();
    const [bankForm] = Form.useForm();
    const [saving, setSaving] = useState<string | null>(null);
    const [paytrEnabled, setPaytrEnabled] = useState(false);
    const [iyzicoEnabled, setIyzicoEnabled] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);

    // Bank POS state
    const [banks, setBanks] = useState<Record<string, BankConfig>>({});
    const [bankModalOpen, setBankModalOpen] = useState(false);
    const [editingBankId, setEditingBankId] = useState<string | null>(null);

    const loadSettings = async () => {
        try {
            const res = await apiClient.get('/api/tenant/payment-providers');
            const providers = res.data?.data?.paymentProviders || {};

            // PayTR
            if (providers.paytr) {
                const p = providers.paytr;
                setPaytrEnabled(p.enabled || false);
                paytrForm.setFieldsValue({
                    merchantId: p.merchantId || '',
                    merchantKey: p.merchantKey || '',
                    merchantSalt: p.merchantSalt || '',
                    testMode: p.testMode !== false,
                    successUrl: p.successUrl || '',
                    failUrl: p.failUrl || '',
                });
            } else {
                paytrForm.setFieldsValue({ testMode: true });
            }

            // iyzico
            if (providers.iyzico) {
                const i = providers.iyzico;
                setIyzicoEnabled(i.enabled || false);
                iyzicoForm.setFieldsValue({
                    apiKey: i.apiKey || '',
                    secretKey: i.secretKey || '',
                    baseUrl: i.baseUrl || 'https://api.iyzipay.com',
                    testMode: i.testMode !== false,
                    successUrl: i.successUrl || '',
                    failUrl: i.failUrl || '',
                });
            } else {
                iyzicoForm.setFieldsValue({ testMode: true, baseUrl: 'https://api.iyzipay.com' });
            }

            // Bank POS
            if (providers.banks) {
                setBanks(providers.banks);
            }
        } catch {
            message.error('Ayarlar yüklenemedi');
        }
    };

    useEffect(() => { loadSettings(); }, []);

    const savePaytr = async (values: any) => {
        setSaving('paytr');
        try {
            await apiClient.put('/api/tenant/payment-providers', {
                provider: 'paytr',
                config: { ...values, enabled: paytrEnabled }
            });
            message.success('PayTR ayarları kaydedildi');
        } catch {
            message.error('Kayıt başarısız');
        } finally {
            setSaving(null);
        }
    };

    const saveIyzico = async (values: any) => {
        setSaving('iyzico');
        try {
            await apiClient.put('/api/tenant/payment-providers', {
                provider: 'iyzico',
                config: { ...values, enabled: iyzicoEnabled }
            });
            message.success('İyzico ayarları kaydedildi');
        } catch {
            message.error('Kayıt başarısız');
        } finally {
            setSaving(null);
        }
    };

    const handleTestPayment = async (provider: string) => {
        setTesting(provider);
        try {
            const res = await apiClient.post('/api/payment/init', {
                amount: 1.00,
                currency: 'TRY',
                provider: provider,
            });
            if (res.data.success) {
                message.success(`${provider.toUpperCase()} bağlantısı başarılı!`);
                if (res.data.data.html) {
                    const win = window.open("", "_blank");
                    if (win) win.document.write(res.data.data.html);
                }
            } else {
                message.error('Test başarısız: ' + (res.data.error || 'Bilinmeyen hata'));
            }
        } catch (error: any) {
            message.error('Test hatası: ' + (error.response?.data?.error || error.message));
        } finally {
            setTesting(null);
        }
    };

    // ── Bank POS CRUD ─────────────────────────────────────────
    const openAddBank = () => {
        setEditingBankId(null);
        bankForm.resetFields();
        bankForm.setFieldsValue({ testMode: true, storeType: '3d_pay', enabled: true });
        setBankModalOpen(true);
    };

    const openEditBank = (bankId: string) => {
        const config = banks[bankId];
        if (!config) return;
        setEditingBankId(bankId);
        bankForm.setFieldsValue({
            bankType: config.bankType,
            name: config.name,
            clientId: config.clientId,
            storeKey: config.storeKey,
            storeType: config.storeType || '3d_pay',
            testMode: config.testMode !== false,
            enabled: config.enabled !== false,
            successUrl: config.successUrl || '',
            failUrl: config.failUrl || '',
            customGatewayUrl: config.customGatewayUrl || '',
        });
        setBankModalOpen(true);
    };

    const saveBank = async (values: any) => {
        const bankId = editingBankId || `${values.bankType}_${Date.now()}`;
        setSaving(`bank_${bankId}`);
        try {
            const bankLabel = BANK_OPTIONS.find(b => b.value === values.bankType)?.label || values.bankType;
            const config = {
                ...values,
                name: values.name || bankLabel,
                id: bankId,
            };
            await apiClient.put('/api/tenant/payment-providers', {
                provider: `bank_${bankId}`,
                config
            });
            message.success(`${config.name} ayarları kaydedildi`);
            setBankModalOpen(false);
            loadSettings();
        } catch {
            message.error('Kayıt başarısız');
        } finally {
            setSaving(null);
        }
    };

    const deleteBank = async (bankId: string) => {
        try {
            await apiClient.put('/api/tenant/payment-providers', {
                action: 'delete_bank',
                bankId
            });
            message.success('Banka POS silindi');
            loadSettings();
        } catch {
            message.error('Silme başarısız');
        }
    };

    const toggleBankEnabled = async (bankId: string, enabled: boolean) => {
        const config = banks[bankId];
        if (!config) return;
        try {
            await apiClient.put('/api/tenant/payment-providers', {
                provider: `bank_${bankId}`,
                config: { ...config, enabled }
            });
            setBanks(prev => ({ ...prev, [bankId]: { ...prev[bankId], enabled } }));
        } catch {
            message.error('Durum güncellenemedi');
        }
    };

    const StatusBadge = ({ enabled }: { enabled: boolean }) => (
        <Tag
            color={enabled ? 'success' : 'default'}
            icon={enabled ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
            {enabled ? 'Aktif' : 'Pasif'}
        </Tag>
    );

    const bankCount = Object.keys(banks).length;
    const bankEnabledCount = Object.values(banks).filter(b => b.enabled).length;

    return (
        <AdminGuard>
            <AdminLayout selectedKey="virtual-pos">
                <div>
                    <div style={{ marginBottom: 24 }}>
                        <Title level={4} style={{ margin: 0 }}>
                            <CreditCardOutlined style={{ marginRight: 8 }} />
                            Sanal Pos Ayarları
                        </Title>
                        <Text type="secondary">
                            Ödeme altyapınızı yapılandırın. Gizli anahtarlar şifreli olarak saklanır.
                        </Text>
                    </div>

                    <Alert
                        type="info"
                        icon={<SafetyCertificateOutlined />}
                        showIcon
                        message="Güvenlik Notu"
                        description="API anahtarları güvenli şekilde şifrelenerek saklanır. Test modunu açık bırakmanız halinde gerçek ödeme alınmaz."
                        style={{ marginBottom: 24 }}
                    />

                    <Tabs
                        defaultActiveKey="banks"
                        type="card"
                        items={[
                            {
                                key: 'banks',
                                label: (
                                    <span>
                                        <BankOutlined style={{ marginRight: 6 }} />
                                        Banka Sanal POS
                                        {bankCount > 0 && (
                                            <Tag color={bankEnabledCount > 0 ? 'success' : 'default'} style={{ marginLeft: 8, fontSize: 10 }}>
                                                {bankEnabledCount}/{bankCount}
                                            </Tag>
                                        )}
                                    </span>
                                ),
                                children: (
                                    <Card>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                            <div>
                                                <BankOutlined style={{ fontSize: 20, marginRight: 8, color: '#475569' }} />
                                                <Text strong>Banka Sanal POS Entegrasyonları</Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    NestPay (3D Secure) altyapısı — Ziraat, İş Bankası, Akbank, Halkbank ve daha fazlası
                                                </Text>
                                            </div>
                                            <Button
                                                type="primary"
                                                icon={<PlusOutlined />}
                                                onClick={openAddBank}
                                                style={{ background: '#00843D' }}
                                            >
                                                Banka Ekle
                                            </Button>
                                        </div>

                                        {bankCount === 0 ? (
                                            <Empty
                                                description="Henüz banka POS tanımlı değil"
                                                style={{ padding: '40px 0' }}
                                            >
                                                <Button type="primary" icon={<PlusOutlined />} onClick={openAddBank}>
                                                    İlk Banka POS&apos;unu Ekle
                                                </Button>
                                            </Empty>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                {Object.entries(banks).map(([bankId, config]) => {
                                                    const bankDef = BANK_OPTIONS.find(b => b.value === config.bankType);
                                                    return (
                                                        <div
                                                            key={bankId}
                                                            style={{
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: 10,
                                                                padding: '14px 20px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                background: config.enabled ? '#f0fdf4' : '#f8fafc',
                                                                transition: 'all 0.2s',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                <div style={{
                                                                    width: 36, height: 36, borderRadius: 8,
                                                                    background: bankDef?.color || '#475569',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: '#fff', fontWeight: 800, fontSize: 14
                                                                }}>
                                                                    {(config.name || '?')[0]}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                                                                        {config.name || bankDef?.label || bankId}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                                                        İşyeri No: {config.clientId || '—'} &nbsp;|&nbsp;
                                                                        {config.testMode ? '🧪 Test' : '🟢 Canlı'} &nbsp;|&nbsp;
                                                                        {config.storeType?.toUpperCase() || '3D_PAY'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <Space>
                                                                <Switch
                                                                    checked={config.enabled}
                                                                    onChange={(v) => toggleBankEnabled(bankId, v)}
                                                                    checkedChildren="Aktif"
                                                                    unCheckedChildren="Pasif"
                                                                    size="small"
                                                                />
                                                                <Button
                                                                    size="small"
                                                                    icon={<EditOutlined />}
                                                                    onClick={() => openEditBank(bankId)}
                                                                >
                                                                    Düzenle
                                                                </Button>
                                                                <Popconfirm
                                                                    title="Bu banka POS yapılandırmasını silmek istediğinize emin misiniz?"
                                                                    onConfirm={() => deleteBank(bankId)}
                                                                    okText="Evet, Sil"
                                                                    cancelText="Vazgeç"
                                                                >
                                                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                                                </Popconfirm>
                                                            </Space>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <Alert
                                            type="info"
                                            showIcon
                                            message="Desteklenen Bankalar"
                                            description="Ziraat Bankası, İş Bankası, Akbank, Halkbank, QNB Finansbank, TEB, Denizbank, ING Bank, Şekerbank ve NestPay altyapısını kullanan tüm bankalar desteklenir."
                                            style={{ marginTop: 20 }}
                                        />
                                    </Card>
                                )
                            },
                            {
                                key: 'paytr',
                                label: <span><PaytrLogo /> &nbsp;PayTR <StatusBadge enabled={paytrEnabled} /></span>,
                                children: (
                                    <Card>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                            <div>
                                                <PaytrLogo />
                                                <Text style={{ marginLeft: 12 }}>PayTR Sanal Pos Entegrasyonu</Text>
                                            </div>
                                            <Space>
                                                <Text type="secondary">Durum:</Text>
                                                <Switch
                                                    checked={paytrEnabled}
                                                    onChange={setPaytrEnabled}
                                                    checkedChildren="Aktif"
                                                    unCheckedChildren="Pasif"
                                                />
                                            </Space>
                                        </div>

                                        <Alert
                                            type="warning"
                                            showIcon
                                            message={
                                                <span>
                                                    PayTR hesabınız yoksa{' '}
                                                    <a href="https://www.paytr.com" target="_blank" rel="noreferrer">
                                                        <LinkOutlined /> paytr.com
                                                    </a>
                                                    {'dan üye olun. Merchant ID, Merchant Key ve Salt bilgilerini PayTR panelinizden alın.'}
                                                </span>
                                            }
                                            style={{ marginBottom: 20 }}
                                        />

                                        <Form form={paytrForm} layout="vertical" onFinish={savePaytr}>
                                            <Divider>Merchant Bilgileri</Divider>
                                            <Form.Item
                                                name="merchantId"
                                                label="Merchant ID"
                                                rules={[{ required: paytrEnabled, message: 'Merchant ID zorunludur' }]}
                                            >
                                                <Input placeholder="PayTR Merchant ID" prefix={<SafetyCertificateOutlined />} />
                                            </Form.Item>
                                            <Form.Item
                                                name="merchantKey"
                                                label="Merchant Key"
                                                rules={[{ required: paytrEnabled, message: 'Merchant Key zorunludur' }]}
                                            >
                                                <Input.Password
                                                    placeholder="PayTR Merchant Key"
                                                    iconRender={(v) => v ? <EyeInvisibleOutlined /> : <EyeInvisibleOutlined />}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name="merchantSalt"
                                                label="Merchant Salt"
                                                rules={[{ required: paytrEnabled, message: 'Merchant Salt zorunludur' }]}
                                            >
                                                <Input.Password placeholder="PayTR Merchant Salt" />
                                            </Form.Item>

                                            <Divider>Yönlendirme URL</Divider>
                                            <Form.Item name="successUrl" label="Başarılı Ödeme URL">
                                                <Input placeholder="https://siteniz.com/payment/success" prefix={<LinkOutlined />} />
                                            </Form.Item>
                                            <Form.Item name="failUrl" label="Başarısız Ödeme URL">
                                                <Input placeholder="https://siteniz.com/payment/fail" prefix={<LinkOutlined />} />
                                            </Form.Item>

                                            <Divider>Test / Canlı Mod</Divider>
                                            <Form.Item name="testMode" label="Test Modu" valuePropName="checked">
                                                <Switch checkedChildren="Test" unCheckedChildren="Canlı" />
                                            </Form.Item>
                                            <Form.Item>
                                                <Alert
                                                    type="warning"
                                                    showIcon
                                                    message="Test modunda gerçek ödeme alınmaz. Canlıya geçmeden önce test ödemelerini doğrulayın."
                                                />
                                            </Form.Item>

                                            <Space>
                                                <Button
                                                    type="primary"
                                                    htmlType="submit"
                                                    icon={<SaveOutlined />}
                                                    loading={saving === 'paytr'}
                                                    style={{ background: '#003087' }}
                                                >
                                                    PayTR Ayarlarını Kaydet
                                                </Button>
                                                <Button
                                                    onClick={() => handleTestPayment('paytr')}
                                                    loading={testing === 'paytr'}
                                                    icon={<SafetyCertificateOutlined />}
                                                >
                                                    Test Et
                                                </Button>
                                            </Space>
                                        </Form>
                                    </Card>
                                )
                            },
                            {
                                key: 'iyzico',
                                label: <span><IyzicoLogo /> &nbsp;<StatusBadge enabled={iyzicoEnabled} /></span>,
                                children: (
                                    <Card>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                            <div>
                                                <IyzicoLogo />
                                                <Text style={{ marginLeft: 12 }}>İyzico Ödeme Entegrasyonu</Text>
                                            </div>
                                            <Space>
                                                <Text type="secondary">Durum:</Text>
                                                <Switch
                                                    checked={iyzicoEnabled}
                                                    onChange={setIyzicoEnabled}
                                                    checkedChildren="Aktif"
                                                    unCheckedChildren="Pasif"
                                                />
                                            </Space>
                                        </div>

                                        <Alert
                                            type="warning"
                                            showIcon
                                            message={
                                                <span>
                                                    İyzico hesabınız yoksa{' '}
                                                    <a href="https://www.iyzico.com" target="_blank" rel="noreferrer">
                                                        <LinkOutlined /> iyzico.com
                                                    </a>
                                                    {'dan başvurun. API Key ve Secret Key bilgilerini İyzico merchant panelinizden alın.'}
                                                </span>
                                            }
                                            style={{ marginBottom: 20 }}
                                        />

                                        <Form form={iyzicoForm} layout="vertical" onFinish={saveIyzico}>
                                            <Divider>API Bilgileri</Divider>
                                            <Form.Item
                                                name="apiKey"
                                                label="API Key"
                                                rules={[{ required: iyzicoEnabled, message: 'API Key zorunludur' }]}
                                            >
                                                <Input placeholder="İyzico API Key" prefix={<SafetyCertificateOutlined />} />
                                            </Form.Item>
                                            <Form.Item
                                                name="secretKey"
                                                label="Secret Key"
                                                rules={[{ required: iyzicoEnabled, message: 'Secret Key zorunludur' }]}
                                            >
                                                <Input.Password placeholder="İyzico Secret Key" />
                                            </Form.Item>
                                            <Form.Item name="baseUrl" label="Base URL">
                                                <Input placeholder="https://api.iyzipay.com" />
                                            </Form.Item>

                                            <Divider>Yönlendirme URL</Divider>
                                            <Form.Item name="successUrl" label="Başarılı Ödeme URL">
                                                <Input placeholder="https://siteniz.com/payment/success" prefix={<LinkOutlined />} />
                                            </Form.Item>
                                            <Form.Item name="failUrl" label="Başarısız Ödeme URL">
                                                <Input placeholder="https://siteniz.com/payment/fail" prefix={<LinkOutlined />} />
                                            </Form.Item>

                                            <Divider>Test / Canlı Mod</Divider>
                                            <Form.Item name="testMode" label="Sandbox (Test) Modu" valuePropName="checked">
                                                <Switch checkedChildren="Sandbox" unCheckedChildren="Canlı" />
                                            </Form.Item>
                                            <Form.Item>
                                                <Alert
                                                    type="warning"
                                                    showIcon
                                                    message="Sandbox modunda: baseUrl olarak https://sandbox-api.iyzipay.com kullanın. Canlı modda https://api.iyzipay.com olmalıdır."
                                                />
                                            </Form.Item>

                                            <Space>
                                                <Button
                                                    type="primary"
                                                    htmlType="submit"
                                                    icon={<SaveOutlined />}
                                                    loading={saving === 'iyzico'}
                                                    style={{ background: '#1ABC9C', border: 'none' }}
                                                >
                                                    İyzico Ayarlarını Kaydet
                                                </Button>
                                                <Button
                                                    onClick={() => handleTestPayment('iyzico')}
                                                    loading={testing === 'iyzico'}
                                                    icon={<SafetyCertificateOutlined />}
                                                >
                                                    Test Et
                                                </Button>
                                            </Space>
                                        </Form>
                                    </Card>
                                )
                            }
                        ]}
                    />

                    {/* ══════ Bank POS Add/Edit Modal ══════ */}
                    <Modal
                        open={bankModalOpen}
                        onCancel={() => setBankModalOpen(false)}
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BankOutlined style={{ fontSize: 18, color: '#00843D' }} />
                                <span>{editingBankId ? 'Banka POS Düzenle' : 'Yeni Banka POS Ekle'}</span>
                            </div>
                        }
                        width={600}
                        footer={null}
                        destroyOnClose
                    >
                        <Form form={bankForm} layout="vertical" onFinish={saveBank} style={{ marginTop: 16 }}>
                            <Form.Item
                                name="bankType"
                                label="Banka"
                                rules={[{ required: true, message: 'Banka seçiniz' }]}
                            >
                                <Select
                                    placeholder="Banka seçiniz"
                                    options={BANK_OPTIONS.map(b => ({
                                        value: b.value,
                                        label: (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    width: 12, height: 12, borderRadius: 3,
                                                    background: b.color, display: 'inline-block'
                                                }} />
                                                {b.label}
                                            </span>
                                        )
                                    }))}
                                />
                            </Form.Item>

                            <Form.Item
                                name="name"
                                label="Görünen Ad (opsiyonel)"
                            >
                                <Input placeholder="Örn: Ziraat Bankası POS" />
                            </Form.Item>

                            <Divider>POS Bilgileri</Divider>

                            <Form.Item
                                name="clientId"
                                label="İşyeri No (Client ID)"
                                rules={[{ required: true, message: 'İşyeri No zorunludur' }]}
                                tooltip="Banka tarafından verilen sanal POS işyeri numarası"
                            >
                                <Input placeholder="Banka işyeri numarası" prefix={<SafetyCertificateOutlined />} />
                            </Form.Item>

                            <Form.Item
                                name="storeKey"
                                label="3D Secure Anahtarı (Store Key)"
                                rules={[{ required: true, message: '3D Secure anahtarı zorunludur' }]}
                                tooltip="Banka sanal POS panelinden aldığınız 3D Secure anahtarı"
                            >
                                <Input.Password placeholder="3D Secure store key" />
                            </Form.Item>

                            <Form.Item
                                name="storeType"
                                label="3D Güvenlik Modeli"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={[
                                        { value: '3d_pay', label: '3D Pay (Önerilen — Banka 3D sayfasında ödeme alınır)' },
                                        { value: '3d', label: '3D (Doğrulama sonrası ayrı provizyon)' },
                                        { value: '3d_pay_hosting', label: '3D Pay Hosting (Banka kendi formunu sunar)' },
                                    ]}
                                />
                            </Form.Item>

                            <Form.Item
                                noStyle
                                shouldUpdate={(prev, curr) => prev.bankType !== curr.bankType}
                            >
                                {({ getFieldValue }) => getFieldValue('bankType') === 'custom' ? (
                                    <Form.Item
                                        name="customGatewayUrl"
                                        label="Özel Gateway URL"
                                        rules={[{ required: true, message: 'Gateway URL zorunludur' }]}
                                    >
                                        <Input placeholder="https://sanalpos.bankaadi.com.tr/fim/est3Dgate" />
                                    </Form.Item>
                                ) : null}
                            </Form.Item>

                            <Divider>Yönlendirme URL (opsiyonel)</Divider>

                            <Form.Item name="successUrl" label="Başarılı Ödeme URL">
                                <Input placeholder="https://siteniz.com/payment/success" prefix={<LinkOutlined />} />
                            </Form.Item>
                            <Form.Item name="failUrl" label="Başarısız Ödeme URL">
                                <Input placeholder="https://siteniz.com/payment/fail" prefix={<LinkOutlined />} />
                            </Form.Item>

                            <Divider>Mod & Durum</Divider>

                            <div style={{ display: 'flex', gap: 32 }}>
                                <Form.Item name="testMode" label="Test Modu" valuePropName="checked">
                                    <Switch checkedChildren="Test" unCheckedChildren="Canlı" />
                                </Form.Item>
                                <Form.Item name="enabled" label="Durum" valuePropName="checked">
                                    <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
                                </Form.Item>
                            </div>

                            <Alert
                                type="info"
                                showIcon
                                message="Test modunda Asseco entegrasyon ortamı kullanılır. Canlıya geçmeden önce bankanızdan onay alınız."
                                style={{ marginBottom: 16 }}
                            />

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <Button onClick={() => setBankModalOpen(false)}>Vazgeç</Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    icon={<SaveOutlined />}
                                    loading={saving?.startsWith('bank_')}
                                    style={{ background: '#00843D' }}
                                >
                                    {editingBankId ? 'Güncelle' : 'Kaydet'}
                                </Button>
                            </div>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
