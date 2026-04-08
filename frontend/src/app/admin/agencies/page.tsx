'use client';

import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, Typography, message, Space, Tag, InputNumber, Popconfirm, Divider, Descriptions, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface Agency {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
    commissionRate: number;
    status: string;
    createdAt: string;
    // Company info (filled by agency themselves)
    companyName?: string;
    address?: string;
    taxOffice?: string;
    taxNumber?: string;
    contactPhone?: string;
    contactEmail?: string;
    website?: string;
    _count?: {
        users: number;
        bookings: number;
    };
}

const AdminAgenciesPage = () => {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
    const [form] = Form.useForm();

    const fetchAgencies = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/admin/agencies');
            if (res.data.success) {
                setAgencies(res.data.data);
            }
        } catch (error) {
            console.error('Fetch agencies error:', error);
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgencies();
    }, []);

    const handleCreate = () => {
        setEditingAgency(null);
        form.resetFields();
        form.setFieldsValue({ status: 'ACTIVE', commissionRate: 0 });
        setModalVisible(true);
    };

    const handleEdit = (record: Agency) => {
        setEditingAgency(record);
        form.setFieldsValue({
            name: record.name,
            contactName: record.contactName,
            email: record.email,
            phone: record.phone,
            commissionRate: record.commissionRate,
            status: record.status
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/admin/agencies/${id}`);
            message.success('Acente başarıyla silindi');
            fetchAgencies();
        } catch (error) {
            console.error(error);
            message.error('Silme işlemi başarısız');
        }
    };

    const handleSave = async (values: any) => {
        try {
            if (editingAgency) {
                await apiClient.put(`/api/admin/agencies/${editingAgency.id}`, values);
                message.success('Acente güncellendi');
            } else {
                await apiClient.post('/api/admin/agencies', values);
                message.success('Acente oluşturuldu');
            }
            setModalVisible(false);
            fetchAgencies();
        } catch (error) {
            console.error('Save agency error:', error);
            message.error('Acente kaydedilirken hata oluştu');
        }
    };

    const columns = [
        {
            title: 'Firma Adı',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: Agency) => (
                <div>
                    <Text strong>{text}</Text>
                    <div style={{ fontSize: 12, color: 'gray' }}>Kayıt: {dayjs(record.createdAt).format('DD.MM.YYYY')}</div>
                </div>
            )
        },
        {
            title: 'İletişim Kişisi',
            dataIndex: 'contactName',
            key: 'contactName',
            render: (text: string, record: Agency) => (
                <div>
                    <div>{text}</div>
                    <div style={{ fontSize: 12 }}>{record.email} / {record.phone}</div>
                </div>
            )
        },
        {
            title: 'Komisyon (%)',
            dataIndex: 'commissionRate',
            key: 'commissionRate',
            render: (val: number) => <Tag color="blue">%{val}</Tag>
        },
        {
            title: 'İstatistikler',
            key: 'stats',
            render: (_: any, record: Agency) => (
                <Space size="small" direction="vertical">
                    <Text type="secondary" style={{ fontSize: 12 }}>Kullanıcılar: {record._count?.users || 0}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>Satışlar: {record._count?.bookings || 0}</Text>
                </Space>
            )
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'error' : 'default';
                return <Tag color={color}>{status}</Tag>;
            }
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: Agency) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm
                        title="Acenteyi silmek istediğinize emin misiniz?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Evet"
                        cancelText="Hayır"
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="agencies">
                <Card variant="borderless">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Alt Acenteler (B2B)</Title>
                            <Text type="secondary">Sisteminizde yetkilendirilmiş satış acentelerini yönetin.</Text>
                        </div>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                            Yeni Acente Ekle
                        </Button>
                    </div>

                    <Table
                        dataSource={agencies}
                        columns={columns}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                </Card>

                <Modal
                    title={editingAgency ? "Acente Düzenle" : "Yeni Acente Oluştur"}
                    open={modalVisible}
                    onCancel={() => setModalVisible(false)}
                    onOk={() => form.submit()}
                    okText="Kaydet"
                    cancelText="İptal"
                    width={640}
                >
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                        <Form.Item name="name" label="Firma / Acente Adı" rules={[{ required: true, message: 'Firma adı zorunludur' }]}>
                            <Input placeholder="Acente adı giriniz" />
                        </Form.Item>
                        <Form.Item name="contactName" label="İletişim Kişisi" rules={[{ required: true, message: 'İletişim kişisi zorunludur' }]}>
                            <Input placeholder="Yetkili ad soyad" />
                        </Form.Item>
                        <Form.Item name="email" label="E-Posta" rules={[{ required: true, type: 'email', message: 'Geçerli e-posta giriniz' }]}>
                            <Input placeholder="E-posta adresi" />
                        </Form.Item>
                        <Form.Item name="phone" label="Telefon" rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                            <Input placeholder="Telefon numarası" />
                        </Form.Item>
                        {!editingAgency && (
                            <Form.Item name="password" label="Giriş Şifresi (Acente Yöneticisi)" rules={[{ required: true, message: 'Şifre zorunludur' }]}>
                                <Input.Password placeholder="Acente paneli için şifre belirleyin" />
                            </Form.Item>
                        )}
                        <Form.Item name="commissionRate" label="Varsayılan Komisyon Oranı (%)">
                            <InputNumber min={0} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="status" label="Durumu">
                            <Select>
                                <Select.Option value="ACTIVE"><Tag color="success">Aktif</Tag></Select.Option>
                                <Select.Option value="INACTIVE"><Tag color="default">Pasif</Tag></Select.Option>
                                <Select.Option value="SUSPENDED"><Tag color="error">Askıya Alındı</Tag></Select.Option>
                            </Select>
                        </Form.Item>

                        {editingAgency && (
                            (editingAgency.companyName || editingAgency.taxOffice || editingAgency.taxNumber || editingAgency.address || editingAgency.contactEmail || editingAgency.contactPhone || editingAgency.website) && (
                                <>
                                    <Divider>
                                        <Space><BankOutlined /> Acente Tarafından Girilen Firma Bilgileri</Space>
                                    </Divider>
                                    <Descriptions column={2} size="small" bordered>
                                        {editingAgency.companyName && (
                                            <Descriptions.Item label="Firma Adı" span={2}>{editingAgency.companyName}</Descriptions.Item>
                                        )}
                                        {editingAgency.taxOffice && (
                                            <Descriptions.Item label="Vergi Dairesi">{editingAgency.taxOffice}</Descriptions.Item>
                                        )}
                                        {editingAgency.taxNumber && (
                                            <Descriptions.Item label="Vergi No">{editingAgency.taxNumber}</Descriptions.Item>
                                        )}
                                        {editingAgency.contactPhone && (
                                            <Descriptions.Item label="Telefon">{editingAgency.contactPhone}</Descriptions.Item>
                                        )}
                                        {editingAgency.contactEmail && (
                                            <Descriptions.Item label="E-Posta">{editingAgency.contactEmail}</Descriptions.Item>
                                        )}
                                        {editingAgency.website && (
                                            <Descriptions.Item label="Web Sitesi" span={2}>{editingAgency.website}</Descriptions.Item>
                                        )}
                                        {editingAgency.address && (
                                            <Descriptions.Item label="Adres" span={2}>{editingAgency.address}</Descriptions.Item>
                                        )}
                                    </Descriptions>
                                </>
                            )
                        )}
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default AdminAgenciesPage;
