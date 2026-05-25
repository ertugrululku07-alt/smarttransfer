'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Row, Col, Tabs, Avatar, Skeleton, Select, Space } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, SaveOutlined } from '@ant-design/icons';
import AccountGuard from '../AccountGuard';
import AccountLayout from '../AccountLayout';
import api from '@/lib/api-client';
import { countryList } from '@/lib/countryData';

const { Title, Text } = Typography;
const { Option } = Select;

// Sort countries: Priority first, then alphabetical
const PRIORITY_CODES = ['TR', 'DE', 'GB', 'RU', 'NL', 'UA', 'FR', 'US', 'SA', 'AE'];
const SORTED_COUNTRIES = [
    ...countryList.filter((c: any) => PRIORITY_CODES.includes(c.code)),
    ...countryList.filter((c: any) => !PRIORITY_CODES.includes(c.code)),
];

// Parse existing phone string into { prefix, number, country }
// Phone may be stored as "+90 555 123 45 67" or just "5551234567"
function parsePhone(raw: string | null | undefined, savedCountry?: string | null): { prefix: string; number: string; country: string } {
    const phone = String(raw || '').trim();
    if (!phone) {
        const fallbackCountry = (savedCountry || 'TR').toUpperCase();
        const c = countryList.find((x: any) => x.code === fallbackCountry);
        return { prefix: c ? '+' + c.phone : '+90', number: '', country: fallbackCountry };
    }
    // Try to match a leading + dial code
    const m = phone.match(/^\+(\d{1,4})\s*(.*)$/);
    if (m) {
        const dial = m[1];
        const rest = m[2].trim();
        // Prefer the country saved in metadata if it matches the same dial code
        let country = savedCountry || '';
        if (country) {
            const sc = countryList.find((x: any) => x.code === country.toUpperCase() && String(x.phone) === dial);
            if (!sc) country = '';
        }
        if (!country) {
            const c = countryList.find((x: any) => String(x.phone) === dial);
            country = c ? c.code : 'TR';
        }
        return { prefix: '+' + dial, number: rest, country: country.toUpperCase() };
    }
    // No prefix in stored phone, fall back to savedCountry
    const country = (savedCountry || 'TR').toUpperCase();
    const c = countryList.find((x: any) => x.code === country);
    return { prefix: c ? '+' + c.phone : '+90', number: phone, country };
}

export default function CustomerProfilePage() {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [savingInfo, setSavingInfo] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [infoForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/api/customer/me');
                if (res.data.success) {
                    const d = res.data.data;
                    setProfile(d);
                    const savedCountry = d?.metadata?.phoneCountry || d?.metadata?.nationality || null;
                    const parsed = parsePhone(d.phone, savedCountry);
                    infoForm.setFieldsValue({
                        firstName: d.firstName || '',
                        lastName: d.lastName || '',
                        fullName: d.fullName || '',
                        email: d.email || '',
                        phoneCountry: parsed.country,
                        phonePrefix: parsed.prefix,
                        phoneNumber: parsed.number,
                    });
                }
            } catch (e: any) {
                message.error(e?.response?.data?.error || 'Profil alınamadı');
            } finally {
                setLoading(false);
            }
        })();
    }, [infoForm]);

    const saveInfo = async (values: any) => {
        setSavingInfo(true);
        try {
            const numberOnly = String(values.phoneNumber || '').trim();
            const prefix = String(values.phonePrefix || '+90').trim();
            const fullPhone = numberOnly ? `${prefix} ${numberOnly}` : '';
            const payload = {
                firstName: values.firstName,
                lastName: values.lastName,
                fullName: values.fullName,
                phone: fullPhone,
                phoneCountry: values.phoneCountry || null,
            };
            const res = await api.put('/api/customer/me', payload);
            if (res.data.success) {
                message.success('Bilgiler güncellendi');
                setProfile((p: any) => ({ ...p, ...res.data.data }));
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Güncellenemedi');
        } finally {
            setSavingInfo(false);
        }
    };

    // When the country changes, sync the dial prefix to the new country's code
    const onCountryChange = (code: string) => {
        const c = countryList.find((x: any) => x.code === code);
        if (c) infoForm.setFieldsValue({ phonePrefix: '+' + c.phone });
    };

    const savePassword = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('Yeni şifreler eşleşmiyor');
            return;
        }
        setSavingPassword(true);
        try {
            const res = await api.put('/api/customer/me/password', {
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });
            if (res.data.success) {
                message.success('Şifreniz güncellendi');
                passwordForm.resetFields();
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Şifre güncellenemedi');
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
                    <Title level={3} style={{ margin: '0 0 16px 0' }}>
                        <UserOutlined /> Profilim
                    </Title>

                    {loading ? (
                        <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>
                    ) : (
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <Card>
                                    <div style={{ textAlign: 'center' }}>
                                        <Avatar size={88} icon={<UserOutlined />} src={profile?.avatar} style={{ background: 'var(--brand-accent)' }}>
                                            {(profile?.fullName || profile?.email || 'M').charAt(0).toUpperCase()}
                                        </Avatar>
                                        <Title level={5} style={{ marginTop: 12, marginBottom: 4 }}>
                                            {profile?.fullName || '—'}
                                        </Title>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            <MailOutlined /> {profile?.email}
                                        </Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            <PhoneOutlined /> {profile?.phone || 'Telefon eklenmemiş'}
                                        </Text>
                                        {profile?.createdAt && (
                                            <div style={{ marginTop: 12 }}>
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    Üyelik: {new Date(profile.createdAt).toLocaleDateString('tr-TR')}
                                                </Text>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </Col>

                            <Col xs={24} md={16}>
                                <Card>
                                    <Tabs
                                        items={[
                                            {
                                                key: 'info',
                                                label: 'Kişisel Bilgiler',
                                                children: (
                                                    <Form layout="vertical" form={infoForm} onFinish={saveInfo}>
                                                        <Row gutter={12}>
                                                            <Col xs={24} sm={12}>
                                                                <Form.Item label="Ad" name="firstName">
                                                                    <Input prefix={<UserOutlined />} />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col xs={24} sm={12}>
                                                                <Form.Item label="Soyad" name="lastName">
                                                                    <Input prefix={<UserOutlined />} />
                                                                </Form.Item>
                                                            </Col>
                                                        </Row>
                                                        <Form.Item label="Görünen İsim" name="fullName">
                                                            <Input />
                                                        </Form.Item>
                                                        <Form.Item label="E-posta" name="email">
                                                            <Input prefix={<MailOutlined />} disabled />
                                                        </Form.Item>
                                                        <Form.Item label="Telefon" required style={{ marginBottom: 8 }}>
                                                            <Space.Compact style={{ width: '100%' }}>
                                                                <Form.Item name="phoneCountry" noStyle initialValue="TR">
                                                                    <Select
                                                                        style={{ width: 150 }}
                                                                        showSearch
                                                                        optionFilterProp="children"
                                                                        filterOption={(input, option) =>
                                                                            String((option as any)?.label || '').toLowerCase().includes(input.toLowerCase())
                                                                        }
                                                                        popupMatchSelectWidth={300}
                                                                        onChange={onCountryChange}
                                                                    >
                                                                        {SORTED_COUNTRIES.map((c: any) => (
                                                                            <Option key={c.code} value={c.code} label={c.label}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                    <img
                                                                                        src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`}
                                                                                        srcSet={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png 2x`}
                                                                                        width="20"
                                                                                        alt={c.code}
                                                                                        style={{ borderRadius: 2 }}
                                                                                    />
                                                                                    <span>{c.code} (+{c.phone})</span>
                                                                                    <span style={{ color: '#999', fontSize: 12, marginLeft: 'auto' }}>{c.label}</span>
                                                                                </div>
                                                                            </Option>
                                                                        ))}
                                                                    </Select>
                                                                </Form.Item>
                                                                <Form.Item name="phonePrefix" noStyle initialValue="+90">
                                                                    <Input style={{ width: 70 }} readOnly />
                                                                </Form.Item>
                                                                <Form.Item name="phoneNumber" noStyle>
                                                                    <Input prefix={<PhoneOutlined />} placeholder="555 123 45 67" style={{ width: 'calc(100% - 220px)' }} />
                                                                </Form.Item>
                                                            </Space.Compact>
                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                Seçtiğiniz ülke kodu uyruk olarak da kabul edilir.
                                                            </Text>
                                                        </Form.Item>
                                                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingInfo}>
                                                            Kaydet
                                                        </Button>
                                                    </Form>
                                                )
                                            },
                                            {
                                                key: 'password',
                                                label: 'Şifre Değiştir',
                                                children: (
                                                    <Form layout="vertical" form={passwordForm} onFinish={savePassword}>
                                                        <Form.Item
                                                            label="Mevcut Şifre"
                                                            name="currentPassword"
                                                            rules={[{ required: true, message: 'Gerekli' }]}
                                                        >
                                                            <Input.Password prefix={<LockOutlined />} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            label="Yeni Şifre"
                                                            name="newPassword"
                                                            rules={[
                                                                { required: true, message: 'Gerekli' },
                                                                { min: 6, message: 'En az 6 karakter' }
                                                            ]}
                                                        >
                                                            <Input.Password prefix={<LockOutlined />} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            label="Yeni Şifre (Tekrar)"
                                                            name="confirmPassword"
                                                            dependencies={['newPassword']}
                                                            rules={[
                                                                { required: true, message: 'Gerekli' },
                                                                ({ getFieldValue }) => ({
                                                                    validator(_, value) {
                                                                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                                                        return Promise.reject(new Error('Şifreler eşleşmiyor'));
                                                                    },
                                                                }),
                                                            ]}
                                                        >
                                                            <Input.Password prefix={<LockOutlined />} />
                                                        </Form.Item>
                                                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingPassword}>
                                                            Şifreyi Güncelle
                                                        </Button>
                                                    </Form>
                                                )
                                            }
                                        ]}
                                    />
                                </Card>
                            </Col>
                        </Row>
                    )}
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
