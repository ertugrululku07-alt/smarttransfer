'use client';

import React, { useEffect, useState } from 'react';
import {
    Table, Card, Tag, Button, Typography, message, Space, Avatar,
    Modal, Form, Input, Divider, Tooltip, Popconfirm, Badge, InputNumber
} from 'antd';
import apiClient from '@/lib/api-client';
import AdminLayout from '../AdminLayout';
import {
    CheckOutlined, CloseOutlined, UserOutlined,
    PlusOutlined, DeleteOutlined, ReloadOutlined,
    CarOutlined, PhoneOutlined, MailOutlined, KeyOutlined, PercentageOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Application {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    status: string;
    createdAt: string;
    vehicles: {
        plateNumber: string;
        brand: string;
        model: string;
        year: number;
        vehicleType: { name: string };
    }[];
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
    ACTIVE:    { color: 'success',    label: 'Aktif' },
    INACTIVE:  { color: 'processing', label: 'Beklemede' },
    SUSPENDED: { color: 'warning',    label: 'Reddedildi' },
    DELETED:   { color: 'error',      label: 'Silindi' },
};

const PartnerApplicationsPage = () => {
    const [data, setData] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    
    // Commission settings state
    const [commissionModalOpen, setCommissionModalOpen] = useState(false);
    const [commissionRate, setCommissionRate] = useState<number>(15);
    const [commissionSaving, setCommissionSaving] = useState(false);

    const [form] = Form.useForm();

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/admin/partner-applications');
            if (res.data.success) setData(res.data.data);
            
            // Fetch global commission rate
            const settingsRes = await apiClient.get('/api/tenant/settings');
            if (settingsRes.data.success && settingsRes.data.data.partnerCommissionRate !== undefined) {
                setCommissionRate(settingsRes.data.data.partnerCommissionRate);
            }
        } catch (err) {
            console.error(err);
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleApprove = async (id: string) => {
        try {
            await apiClient.patch(`/api/admin/partner-applications/${id}/approve`);
            message.success('Partner sürücü onaylandı');
            fetchData();
        } catch {
            message.error('Onaylama işlemi başarısız');
        }
    };

    const handleReject = async (id: string) => {
        try {
            await apiClient.patch(`/api/admin/partner-applications/${id}/reject`);
            message.warning('Partner sürücü reddedildi');
            fetchData();
        } catch {
            message.error('Reddetme işlemi başarısız');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/admin/partner-applications/${id}`);
            message.success('Partner sürücü silindi');
            fetchData();
        } catch {
            message.error('Silme işlemi başarısız');
        }
    };

    const handleAddSubmit = async () => {
        try {
            const values = await form.validateFields();
            setAddLoading(true);
            const res = await apiClient.post('/api/admin/partner-applications', values);
            if (res.data.success) {
                message.success('Partner sürücü başarıyla eklendi');
                setAddModalOpen(false);
                form.resetFields();
                fetchData();
            } else {
                message.error(res.data.error || 'Ekleme başarısız');
            }
        } catch (err: any) {
            const errMsg = err?.response?.data?.error || 'Bir hata oluştu';
            if (errMsg === 'Bir hata oluştu' && err.errorFields) return; // Validation error
            message.error(errMsg);
        } finally {
            setAddLoading(false);
        }
    };

    const handleSaveCommission = async () => {
        try {
            setCommissionSaving(true);
            const res = await apiClient.put('/api/tenant/settings', {
                partnerCommissionRate: commissionRate
            });
            if (res.data.success) {
                message.success('Komisyon oranı kaydedildi');
                setCommissionModalOpen(false);
            } else {
                message.error('Kaydedilirken hata oluştu');
            }
        } catch {
            message.error('Sunucu hatası');
        } finally {
            setCommissionSaving(false);
        }
    };

    const pendingCount = data.filter(d => d.status === 'INACTIVE').length;

    const columns = [
        {
            title: 'Sürücü',
            key: 'driver',
            render: (_: any, record: Application) => (
                <Space>
                    <Avatar
                        icon={<UserOutlined />}
                        style={{ background: '#667eea' }}
                    />
                    <div>
                        <div style={{ fontWeight: 600 }}>
                            {record.fullName || `${record.firstName} ${record.lastName}`}
                        </div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                            Kayıt: {dayjs(record.createdAt).format('DD.MM.YYYY')}
                        </div>
                    </div>
                </Space>
            ),
        },
        {
            title: 'İletişim',
            key: 'contact',
            render: (_: any, record: Application) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <MailOutlined style={{ color: '#667eea' }} />
                        {record.email}
                    </div>
                    {record.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 2, color: '#666' }}>
                            <PhoneOutlined />
                            {record.phone}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Araç Bilgisi',
            key: 'vehicle',
            render: (_: any, record: Application) => {
                if (!record.vehicles || record.vehicles.length === 0) {
                    return <Tag color="default" icon={<CarOutlined />}>Araç Yok</Tag>;
                }
                const v = record.vehicles[0];
                return (
                    <div style={{ background: '#f8f9fa', padding: '6px 10px', borderRadius: 8, display: 'inline-block' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v.plateNumber}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{v.brand} {v.model} ({v.year})</div>
                        {v.vehicleType && <Tag color="geekblue" style={{ marginTop: 4, fontSize: 11 }}>{v.vehicleType.name}</Tag>}
                    </div>
                );
            },
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                const s = STATUS_MAP[status] || { color: 'default', label: status };
                return <Tag color={s.color}>{s.label}</Tag>;
            },
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: Application) => (
                <Space>
                    {record.status !== 'ACTIVE' && (
                        <Tooltip title="Onayla">
                            <Popconfirm
                                title="Bu partner sürücüyü onaylamak istiyor musunuz?"
                                onConfirm={() => handleApprove(record.id)}
                                okText="Onayla"
                                cancelText="İptal"
                            >
                                <Button size="small" type="primary" icon={<CheckOutlined />}>
                                    Onayla
                                </Button>
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {record.status === 'ACTIVE' && (
                        <Tooltip title="Pasife Al">
                            <Popconfirm
                                title="Bu partner sürücüyü pasife almak istiyor musunuz?"
                                onConfirm={() => handleReject(record.id)}
                                okText="Evet"
                                cancelText="İptal"
                            >
                                <Button size="small" icon={<CloseOutlined />}>Pasife Al</Button>
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {record.status !== 'ACTIVE' && (
                        <Tooltip title="Reddet">
                            <Popconfirm
                                title="Reddetmek istiyor musunuz?"
                                onConfirm={() => handleReject(record.id)}
                                okText="Reddet"
                                okButtonProps={{ danger: true }}
                                cancelText="İptal"
                            >
                                <Button size="small" danger icon={<CloseOutlined />}>Reddet</Button>
                            </Popconfirm>
                        </Tooltip>
                    )}
                    <Popconfirm
                        title="Bu partner sürücüyü silmek istediğinizden emin misiniz?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Sil"
                        okButtonProps={{ danger: true }}
                        cancelText="İptal"
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <AdminLayout selectedKey="partner-applications">
            <Card variant="borderless">
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Title level={4} style={{ margin: 0 }}>Partner Sürücü Başvuruları</Title>
                            {pendingCount > 0 && (
                                <Badge count={pendingCount} style={{ backgroundColor: '#f5a623' }} />
                            )}
                        </div>
                        <Typography.Text type="secondary">Onay bekleyen ve aktif sürücü partner listesi</Typography.Text>
                    </div>
                    <Space>
                        <Button 
                            icon={<PercentageOutlined />} 
                            onClick={() => setCommissionModalOpen(true)}
                        >
                            Komisyon Ayarı
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={fetchData}>Yenile</Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setAddModalOpen(true)}
                            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none' }}
                        >
                            Partner Sürücü Ekle
                        </Button>
                    </Space>
                </div>

                <Table
                    dataSource={data}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    locale={{ emptyText: 'Henüz partner sürücü başvurusu bulunmuyor' }}
                />
            </Card>

            {/* Add Partner Driver Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #667eea, #764ba2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <UserOutlined style={{ color: '#fff', fontSize: 16 }} />
                        </div>
                        <span>Yeni Partner Sürücü Ekle</span>
                    </div>
                }
                open={addModalOpen}
                onCancel={() => { setAddModalOpen(false); form.resetFields(); }}
                onOk={handleAddSubmit}
                confirmLoading={addLoading}
                okText="Kaydet"
                cancelText="İptal"
                width={520}
            >
                <Divider style={{ margin: '12px 0 20px' }} />
                <Form form={form} layout="vertical" requiredMark="optional">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                        <Form.Item
                            label="Ad"
                            name="firstName"
                            rules={[{ required: true, message: 'Ad zorunludur' }]}
                        >
                            <Input placeholder="Ali" prefix={<UserOutlined style={{ color: '#ccc' }} />} />
                        </Form.Item>
                        <Form.Item
                            label="Soyad"
                            name="lastName"
                            rules={[{ required: true, message: 'Soyad zorunludur' }]}
                        >
                            <Input placeholder="Yılmaz" />
                        </Form.Item>
                    </div>
                    <Form.Item
                        label="E-posta"
                        name="email"
                        rules={[
                            { required: true, message: 'E-posta zorunludur' },
                            { type: 'email', message: 'Geçerli bir e-posta girin' }
                        ]}
                    >
                        <Input
                            placeholder="ali@ornek.com"
                            prefix={<MailOutlined style={{ color: '#ccc' }} />}
                        />
                    </Form.Item>
                    <Form.Item label="Telefon" name="phone">
                        <Input
                            placeholder="+90 555 000 00 00"
                            prefix={<PhoneOutlined style={{ color: '#ccc' }} />}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Şifre"
                        name="password"
                        rules={[
                            { required: true, message: 'Şifre zorunludur' },
                            { min: 6, message: 'En az 6 karakter olmalı' }
                        ]}
                    >
                        <Input.Password
                            placeholder="En az 6 karakter"
                            prefix={<KeyOutlined style={{ color: '#ccc' }} />}
                        />
                    </Form.Item>
                    <div style={{
                        background: '#f0f5ff', borderRadius: 8, padding: '10px 14px',
                        fontSize: 12, color: '#666', marginTop: 8
                    }}>
                        💡 Eklenen partner sürücü <strong>Beklemede</strong> durumunda oluşturulur. Onayladıktan sonra sisteme giriş yapabilir.
                    </div>
                </Form>
            </Modal>

            {/* Commission Settings Modal */}
            <Modal
                title="Partner Komisyon Ayarı"
                open={commissionModalOpen}
                onCancel={() => setCommissionModalOpen(false)}
                onOk={handleSaveCommission}
                confirmLoading={commissionSaving}
                okText="Kaydet"
                cancelText="İptal"
                width={400}
            >
                <div style={{ padding: '20px 0' }}>
                    <Typography.Text strong>Genel Komisyon Oranı (%)</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                        <InputNumber
                            min={0}
                            max={100}
                            formatter={value => `% ${value}`}
                            parser={value => Number(value!.replace('%', '').trim()) as any}
                            style={{ width: '100%' }}
                            value={commissionRate}
                            onChange={(val) => setCommissionRate(val || 0)}
                        />
                    </div>
                    <div style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
                        Bu oran, partnerlerin tamamladıkları transferlerden hesaplanan genel komisyon kesintisini temsil eder.
                    </div>
                </div>
            </Modal>
        </AdminLayout>
    );
};

export default PartnerApplicationsPage;
