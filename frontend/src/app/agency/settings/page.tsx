'use client';

import React, { useState, useEffect } from 'react';
import {
    Card, Typography, Form, Input, InputNumber, Button, message,
    Spin, Divider, Space, Upload, Tabs
} from 'antd';
import type { UploadProps, TabsProps } from 'antd';
import { SaveOutlined, PercentageOutlined, UploadOutlined, LoadingOutlined, BankOutlined, SettingOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../AgencyLayout';
import AgencyGuard from '../AgencyGuard';

const { Title, Text } = Typography;

export default function AgencySettingsPage() {
    const [brandForm] = Form.useForm();
    const [companyForm] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [savingBrand, setSavingBrand] = useState(false);
    const [savingCompany, setSavingCompany] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>('');

    useEffect(() => { fetchSettings(); }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/api/agency/settings');
            if (response.data?.success && response.data?.data) {
                const d = response.data.data;
                brandForm.setFieldsValue({ logo: d.logo || '', markup: d.markup || 0 });
                companyForm.setFieldsValue({
                    companyName: d.companyName || '',
                    address: d.address || '',
                    taxOffice: d.taxOffice || '',
                    taxNumber: d.taxNumber || '',
                    contactPhone: d.contactPhone || '',
                    contactEmail: d.contactEmail || '',
                    website: d.website || ''
                });
                if (d.logo) setImageUrl(d.logo);
            }
        } catch (error) {
            message.error('Ayarlar yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveBrand = async (values: any) => {
        try {
            setSavingBrand(true);
            // imageUrl state holds the current logo (from upload or from DB)
            const res = await apiClient.put('/api/agency/settings', { logo: imageUrl, markup: values.markup });
            if (res.data?.success) message.success('Logo ve kar marjı güncellendi.');
            else throw new Error(res.data?.error);
        } catch (error: any) {
            message.error(error.message || 'Kaydedilemedi.');
        } finally {
            setSavingBrand(false);
        }
    };

    const handleSaveCompany = async (values: any) => {
        try {
            setSavingCompany(true);
            const res = await apiClient.put('/api/agency/settings', values);
            if (res.data?.success) message.success('Firma bilgileri güncellendi.');
            else throw new Error(res.data?.error);
        } catch (error: any) {
            message.error(error.message || 'Kaydedilemedi.');
        } finally {
            setSavingCompany(false);
        }
    };

    // Client-side base64 conversion - no server filesystem dependency
    const handleLogoSelect = (file: File) => {
        const ok = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'].includes(file.type);
        if (!ok) { message.error('Sadece JPG/PNG/SVG/WebP yükleyebilirsiniz!'); return false; }
        const sizeOk = file.size / 1024 / 1024 < 2;
        if (!sizeOk) { message.error("Dosya 2MB'dan küçük olmalıdır!"); return false; }

        setUploading(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setImageUrl(base64);
            brandForm.setFieldsValue({ logo: base64 });
            setUploading(false);
            message.success('Logo seçildi. Kaydet butonuna basın.');
        };
        reader.onerror = () => {
            setUploading(false);
            message.error('Dosya okunamadı.');
        };
        reader.readAsDataURL(file);
        return false; // Prevent default Ant Design upload
    };

    const uploadProps: UploadProps = {
        name: 'file',
        showUploadList: false,
        beforeUpload: handleLogoSelect,
        accept: 'image/jpeg,image/png,image/svg+xml,image/webp',
    };

    const tabs: TabsProps['items'] = [
        {
            key: 'brand',
            label: <span><SettingOutlined /> Marka & Fiyatlandırma</span>,
            children: (
                <Form form={brandForm} layout="vertical" onFinish={handleSaveBrand}>
                    <Form.Item label="Acente Logosu" help="Logo yükleyin veya URL yapıştırın.">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Upload {...uploadProps}>
                                <Button icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}>
                                    Logo Yükle
                                </Button>
                            </Upload>
                            <Input
                                style={{ flex: 1 }}
                                placeholder="Veya logo URL'si yapıştırın"
                                value={imageUrl}
                                onChange={e => setImageUrl(e.target.value)}
                            />
                        </div>
                        {imageUrl && (
                            <div style={{ marginTop: 12 }}>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>Mevcut Logo:</Text>
                                <img src={imageUrl} alt="Logo" style={{ maxHeight: 60, objectFit: 'contain', border: '1px solid #f0f0f0', borderRadius: 8, padding: 4 }} />
                            </div>
                        )}
                    </Form.Item>

                    <Divider />
                    <Title level={5}>Fiyatlandırma & Kâr Marjı</Title>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        Arama sonuçlarında taban B2B fiyatlarına otomatik olarak bu yüzde eklenir.
                        Temsilcileriniz ve acente kullanıcılarınız yalnızca son (kârlı) fiyatları görür.
                    </Text>

                    <Form.Item
                        label="Kar Marjı (%)"
                        name="markup"
                        rules={[{ required: true, message: 'Lütfen kar marjı girin' }]}
                    >
                        <InputNumber
                            addonAfter={<PercentageOutlined />}
                            min={0} max={500}
                            style={{ width: 160 }}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 24 }}>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large" loading={savingBrand}>
                            Ayarları Kaydet
                        </Button>
                    </Form.Item>
                </Form>
            )
        },
        {
            key: 'company',
            label: <span><BankOutlined /> Firma Ayarları</span>,
            children: (
                <Form form={companyForm} layout="vertical" onFinish={handleSaveCompany}>
                    <Title level={5}>Firma Bilgileri</Title>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                        Bu bilgiler tekliflerde, faturalarda ve iletişim formlarında kullanılır.
                    </Text>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                        <Form.Item label="Firma Adı" name="companyName">
                            <Input placeholder="Ör: ABC Turizm A.Ş." />
                        </Form.Item>

                        <Form.Item label="Web Sitesi" name="website">
                            <Input placeholder="https://www.firmaadi.com" />
                        </Form.Item>

                        <Form.Item label="Vergi Dairesi" name="taxOffice">
                            <Input placeholder="Ör: Kadıköy Vergi Dairesi" />
                        </Form.Item>

                        <Form.Item label="Vergi Numarası" name="taxNumber">
                            <Input placeholder="Ör: 1234567890" maxLength={12} />
                        </Form.Item>

                        <Form.Item label="Telefon" name="contactPhone">
                            <Input placeholder="+90 212 000 00 00" />
                        </Form.Item>

                        <Form.Item label="E-Posta" name="contactEmail" rules={[{ type: 'email', message: 'Geçerli bir e-posta girin' }]}>
                            <Input placeholder="info@firma.com" />
                        </Form.Item>
                    </div>

                    <Form.Item label="Adres" name="address">
                        <Input.TextArea rows={3} placeholder="Firma adresi..." />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 8 }}>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large" loading={savingCompany}>
                            Firma Bilgilerini Kaydet
                        </Button>
                    </Form.Item>
                </Form>
            )
        }
    ];

    if (loading) {
        return (
            <AgencyGuard>
                <AgencyLayout selectedKey="settings">
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 100 }}>
                        <Spin size="large" />
                    </div>
                </AgencyLayout>
            </AgencyGuard>
        );
    }

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="settings">
                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    <Card
                        title={<Title level={4} style={{ margin: 0 }}>Acente Ayarları</Title>}
                    >
                        <Tabs defaultActiveKey="brand" items={tabs} size="large" />
                    </Card>
                </div>
            </AgencyLayout>
        </AgencyGuard>
    );
}
