'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Row, Col, Tabs, Avatar, Skeleton } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, SaveOutlined } from '@ant-design/icons';
import AccountGuard from '../AccountGuard';
import AccountLayout from '../AccountLayout';
import api from '@/lib/api-client';

const { Title, Text } = Typography;

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
                    setProfile(res.data.data);
                    infoForm.setFieldsValue({
                        firstName: res.data.data.firstName || '',
                        lastName: res.data.data.lastName || '',
                        fullName: res.data.data.fullName || '',
                        email: res.data.data.email || '',
                        phone: res.data.data.phone || '',
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
            const res = await api.put('/api/customer/me', values);
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
                                        <Avatar size={88} icon={<UserOutlined />} src={profile?.avatar} style={{ background: '#4f46e5' }}>
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
                                                        <Form.Item label="Telefon" name="phone">
                                                            <Input prefix={<PhoneOutlined />} placeholder="+90 ..." />
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
