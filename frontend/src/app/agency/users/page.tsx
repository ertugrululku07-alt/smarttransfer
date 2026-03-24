'use client';

import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, Typography, message, Space, Tag, InputNumber, Select, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../AgencyLayout';
import AgencyGuard from '../AgencyGuard';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface AgencyUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    agencyCommissionRate: number;
    createdAt: string;
    role?: {
        type: string;
        name: string;
    };
}

const AgencyUsersPage = () => {
    const [users, setUsers] = useState<AgencyUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState<AgencyUser | null>(null);
    const [form] = Form.useForm();

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/agency/users');
            if (res.data.success) {
                setUsers(res.data.data);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                message.error('Bu sayfayı görüntüleme yetkiniz yok (Sadece Admin).');
            } else {
                message.error('Personeller yüklenirken hata oluştu');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreate = () => {
        setEditingUser(null);
        form.resetFields();
        form.setFieldsValue({ agencyCommissionRate: 0, roleType: 'AGENCY_STAFF' });
        setModalVisible(true);
    };

    const handleEdit = (record: AgencyUser) => {
        setEditingUser(record);
        form.setFieldsValue({
            firstName: record.firstName,
            lastName: record.lastName,
            email: record.email,
            roleType: record.role?.type || 'AGENCY_STAFF',
            agencyCommissionRate: record.agencyCommissionRate,
            password: '' // Keep empty unless changing
        });
        setModalVisible(true);
    };

    const handleToggleStatus = async (id: string, currentStatus: string) => {
        try {
            const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
            await apiClient.put(`/api/agency/users/${id}`, { status: newStatus });
            message.success(`Personel ${newStatus === 'ACTIVE' ? 'aktif edildi' : 'pasife alındı'}`);
            fetchUsers();
        } catch (error) {
            console.error('Toggle status error:', error);
            message.error('Durum değiştirilemedi');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/agency/users/${id}`);
            message.success('Personel silindi');
            fetchUsers();
        } catch (error: any) {
            console.error('Delete user error:', error);
            message.error(error.response?.data?.error || 'Personel silinemedi');
        }
    };

    const handleSave = async (values: any) => {
        try {
            if (editingUser) {
                const payload = { ...values };
                if (!payload.password) delete payload.password; // Don't send empty password
                await apiClient.put(`/api/agency/users/${editingUser.id}`, payload);
                message.success('Alt personel güncellendi');
            } else {
                await apiClient.post('/api/agency/users', values);
                message.success('Alt personel başarıyla oluşturuldu');
            }
            setModalVisible(false);
            fetchUsers();
        } catch (error) {
            console.error('Save agency user error:', error);
            message.error('Personel kaydedilirken hata oluştu');
        }
    };

    const columns = [
        {
            title: 'Personel',
            key: 'name',
            render: (text: string, record: AgencyUser) => (
                <div>
                    <Text strong>{record.firstName} {record.lastName}</Text>
                    <div style={{ fontSize: 12, color: 'gray' }}>{record.email}</div>
                </div>
            )
        },
        {
            title: 'Rol',
            key: 'role',
            render: (text: string, record: AgencyUser) => {
                const roleType = record.role?.type;
                if (roleType === 'AGENCY_ADMIN') {
                    return <Tag color="blue">Acente Yöneticisi</Tag>;
                } else if (roleType === 'AGENCY_STAFF') {
                    return <Tag color="cyan">Acente Personeli</Tag>;
                }
                return <Tag>{roleType || 'Bilinmiyor'}</Tag>;
            }
        },
        {
            title: 'Satış Komisyonu',
            dataIndex: 'agencyCommissionRate',
            key: 'agencyCommissionRate',
            render: (val: any) => {
                const numVal = parseFloat(val?.toString() || '0');
                return <Tag color="purple">%{numVal}</Tag>;
            }
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>{status}</Tag>
        },
        {
            title: 'Kayıt Tarihi',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (val: string) => dayjs(val).format('DD.MM.YYYY HH:mm')
        },
        {
            title: 'İşlemler',
            key: 'actions',
            align: 'right' as const,
            render: (_: any, record: AgencyUser) => (
                <Space>
                    <Tooltip title="Düzenle">
                        <Button
                            type="text"
                            icon={<EditOutlined style={{ color: '#1890ff' }} />}
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    <Tooltip title={record.status === 'ACTIVE' ? 'Pasife Al' : 'Aktif Et'}>
                        <Popconfirm
                            title={`Personeli ${record.status === 'ACTIVE' ? 'pasife almak' : 'aktif etmek'} istediğinize emin misiniz?`}
                            onConfirm={() => handleToggleStatus(record.id, record.status)}
                            okText="Evet"
                            cancelText="Hayır"
                        >
                            <Button
                                type="text"
                                icon={record.status === 'ACTIVE' ? <StopOutlined style={{ color: '#faad14' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                            />
                        </Popconfirm>
                    </Tooltip>
                    <Tooltip title="Sil">
                        <Popconfirm
                            title="Personeli silmek istediğinize emin misiniz?"
                            description="Bu işlem geri alınamaz (Sadece veritabanında pasife alınır)."
                            onConfirm={() => handleDelete(record.id)}
                            okText="Evet, Sil"
                            okType="danger"
                            cancelText="İptal"
                        >
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            )
        }
    ];

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="users">
                <Card bordered={false}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Acente Personelleri</Title>
                            <Text type="secondary">Acentenize bağlı olarak satış yapacak personelleri yönetin.</Text>
                        </div>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                            Yeni Personel Ekle
                        </Button>
                    </div>

                    <Table
                        dataSource={users}
                        columns={columns}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                </Card>

                <Modal
                    title={editingUser ? 'Personeli Düzenle' : 'Yeni Alt Personel Oluştur'}
                    open={modalVisible}
                    onCancel={() => setModalVisible(false)}
                    onOk={() => form.submit()}
                    okText={editingUser ? 'Güncelle' : 'Oluştur'}
                    cancelText="İptal"
                >
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                        <Form.Item name="firstName" label="Ad" rules={[{ required: true, message: 'Ad zorunludur' }]}>
                            <Input placeholder="Personel adını giriniz" />
                        </Form.Item>
                        <Form.Item name="lastName" label="Soyad" rules={[{ required: true, message: 'Soyad zorunludur' }]}>
                            <Input placeholder="Personel soyadını giriniz" />
                        </Form.Item>
                        <Form.Item name="email" label="E-Posta (Giriş Adresi)" rules={[{ required: true, type: 'email', message: 'Geçerli e-posta giriniz' }]}>
                            <Input placeholder="E-posta adresi" />
                        </Form.Item>
                        <Form.Item name="password" label={editingUser ? 'Yeni Şifre (İsteğe bağlı)' : 'Şifre'} rules={[{ required: !editingUser, message: 'Şifre zorunludur' }]}>
                            <Input.Password placeholder={editingUser ? 'Değiştirmek istemiyorsanız boş bırakın' : 'Geçici şifre belirleyin'} />
                        </Form.Item>
                        <Form.Item name="roleType" label="Personel Rolü" rules={[{ required: true, message: 'Rol seçimi zorunludur' }]}>
                            <Select placeholder="Rol seçiniz">
                                <Select.Option value="AGENCY_ADMIN">Acente Yöneticisi</Select.Option>
                                <Select.Option value="AGENCY_STAFF">Acente Personeli</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item
                            name="agencyCommissionRate"
                            label="Fiyatlara Eklenecek Kâr Marjı / Komisyon (%)"
                            tooltip="Bu oran personelin göreceği fiyatların üzerine gizlice eklenir ve satışı yaptığında acentenin kârı olarak kaydedilir."
                        >
                            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="Örn: 10" />
                        </Form.Item>
                    </Form>
                </Modal>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyUsersPage;
