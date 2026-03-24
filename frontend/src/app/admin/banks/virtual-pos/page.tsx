'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Form, Input, Button, Switch, Typography, message,
    Tabs, Tag, Alert, Divider, Space, Badge
} from 'antd';
import {
    CreditCardOutlined,
    SaveOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    EyeInvisibleOutlined,
    SafetyCertificateOutlined,
    LinkOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

const { Title, Text, Paragraph } = Typography;

// ────────────────────────────────────────────────────────────
// PayTR Logo (SVG inline)
const PaytrLogo = () => (
    <span style={{
        background: '#003087', color: '#fff', fontWeight: 800,
        fontSize: 13, padding: '2px 8px', borderRadius: 4, letterSpacing: 1
    }}>PAYTR</span>
);

// İyzico Logo
const IyzicoLogo = () => (
    <span style={{
        background: '#1ABC9C', color: '#fff', fontWeight: 800,
        fontSize: 13, padding: '2px 8px', borderRadius: 4, letterSpacing: 1
    }}>iyzico</span>
);
// ────────────────────────────────────────────────────────────

export default function VirtualPosPage() {
    const [paytrForm] = Form.useForm();
    const [iyzicoForm] = Form.useForm();
    const [saving, setSaving] = useState<string | null>(null);
    const [paytrEnabled, setPaytrEnabled] = useState(false);
    const [iyzicoEnabled, setIyzicoEnabled] = useState(false);

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

            // İyzico
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
                iyzicoForm.setFieldsValue({
                    testMode: true,
                    baseUrl: 'https://api.iyzipay.com',
                });
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

    const [testing, setTesting] = useState<string | null>(null);

    const handleTestPayment = async (provider: string) => {
        setTesting(provider);
        try {
            const res = await apiClient.post('/api/payment/init', {
                amount: 1.00,
                currency: 'TRY',
                provider: provider,
                // User info will be filled by backend from current user or defaults
            });

            if (res.data.success) {
                message.success(`${provider.toUpperCase()} bağlantısı başarılı! Test ödemesi başlatıldı.`);
                // We could show the HTML content in a modal if needed, but for connectivity test, success is enough.
                // Or open in a new window to see the actual payment page
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

    const StatusBadge = ({ enabled }: { enabled: boolean }) => (
        <Tag
            color={enabled ? 'success' : 'default'}
            icon={enabled ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
            {enabled ? 'Aktif' : 'Pasif'}
        </Tag>
    );

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
                        defaultActiveKey="paytr"
                        type="card"
                        items={[
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
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
