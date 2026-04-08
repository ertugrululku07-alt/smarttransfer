'use client';

import React, { useState, useEffect } from 'react';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import {
    Tabs, Form, Input, Button, Card, Table, Tag, Space, Modal,
    Typography, Row, Col, Upload, message, Select, Divider,
    Avatar, List, Alert
} from 'antd';
import {
    PlusOutlined, CarOutlined, BankOutlined, UserOutlined,
    UploadOutlined, EditOutlined, DeleteOutlined,
    SaveOutlined, SafetyOutlined, FileTextOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/app/context/AuthContext';

const { Title, Text } = Typography;
const { Option } = Select;

export default function SettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('vehicles');

    // --- Tab 1: Vehicles State ---
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [isVehicleModalVisible, setIsVehicleModalVisible] = useState(false);
    const [vehicleForm] = Form.useForm();
    const [editingVehicle, setEditingVehicle] = useState<any>(null);

    // --- Tab 2: Bank Info State ---
    const [bankForm] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();

    // --- Tab 3: Account & Docs State ---
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    // Mock Documents Data
    const [documents, setDocuments] = useState([
        { id: 1, name: 'Sürücü Belgesi', status: 'VERIFIED', uploadDate: '2024-01-15' },
        { id: 2, name: 'SRC Belgesi', status: 'VERIFIED', uploadDate: '2024-01-15' },
        { id: 3, name: 'Psikoteknik', status: 'PENDING', uploadDate: '2024-02-10' },
        { id: 4, name: 'Adli Sicil Kaydı', status: 'MISSING', uploadDate: null },
    ]);

    // --- Effects ---
    useEffect(() => {
        if (activeTab === 'vehicles') {
            fetchVehicles();
        }
        if (activeTab === 'account' && user) {
            profileForm.setFieldsValue({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: (user as any).phone || '' 
            });
        }
        if (activeTab === 'bank') {
            fetchBankInfo();
        }
    }, [activeTab, user]);

    const fetchBankInfo = async () => {
        try {
            const response = await apiClient.get('/api/auth/metadata');
            if (response.data.success && response.data.data.bankInfo) {
                bankForm.setFieldsValue(response.data.data.bankInfo);
            }
        } catch (error) {
            console.error('Error fetching bank info:', error);
        }
    };

    // --- Vehicle Handlers ---
    const fetchVehicles = async () => {
        setLoadingVehicles(true);
        try {
            const response = await apiClient.get('/api/vehicles');
            if (response.data.success) {
                setVehicles(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching vehicles:', error);
            messageApi.error('Araç listesi alınamadı');
        } finally {
            setLoadingVehicles(false);
        }
    };

    const handleAddVehicle = () => {
        setEditingVehicle(null);
        vehicleForm.resetFields();
        setIsVehicleModalVisible(true);
    };

    const handleEditVehicle = (record: any) => {
        setEditingVehicle(record);
        vehicleForm.setFieldsValue({
            ...record,
            vehicleType: record.vehicleType, // Might need mapping if backend returns format different from Select options
            capacity: record.capacity,
            year: record.year
        });
        setIsVehicleModalVisible(true);
    };

    const handleSaveVehicle = async () => {
        try {
            const values = await vehicleForm.validateFields();

            // Transform for API
            const payload = {
                ...values,
                year: Number(values.year),
                capacity: Number(values.capacity),
                isActive: true, // Default active
                isCompanyOwned: true
            };

            let response;
            if (editingVehicle) {
                response = await apiClient.put(`/api/vehicles/${editingVehicle.id}`, payload);
            } else {
                response = await apiClient.post('/api/vehicles', payload);
            }

            if (response.data.success) {
                messageApi.success(editingVehicle ? 'Araç güncellendi' : 'Yeni araç eklendi');
                setIsVehicleModalVisible(false);
                fetchVehicles();
            } else {
                messageApi.error(response.data.error || 'İşlem başarısız');
            }
        } catch (error) {
            console.error('Validation or API error:', error);
            messageApi.error('Lütfen formu kontrol edin');
        }
    };

    const vehicleColumns = [
        {
            title: 'Araç',
            key: 'name',
            render: (text: string, record: any) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{record.brand} {record.model}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{record.plateNumber}</div>
                </div>
            )
        },
        {
            title: 'Tip / Yıl',
            key: 'type',
            render: (text: string, record: any) => (
                <div>
                    <Tag>{record.vehicleType}</Tag>
                    <span style={{ fontSize: '12px', marginLeft: '4px' }}>{record.year}</span>
                </div>
            )
        },
        {
            title: 'Kapasite',
            dataIndex: 'capacity',
            key: 'capacity',
            render: (text: number) => <span>{text} Kişi</span>
        },
        {
            title: 'Durum',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) => (
                <Tag color={isActive ? 'success' : 'default'}>
                    {isActive ? 'Aktif' : 'Pasif'}
                </Tag>
            )
        },
        {
            title: 'İşlem',
            key: 'action',
            render: (text: string, record: any) => (
                <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEditVehicle(record)}
                />
            )
        }
    ];

    // --- Bank Info Handlers ---
    const handleSaveBankInfo = async () => {
        try {
            const values = await bankForm.validateFields();
            
            // Clean IBAN (remove spaces)
            const cleanValues = {
                ...values,
                iban: values.iban.replace(/\s/g, '').toUpperCase()
            };

            const response = await apiClient.put('/api/auth/metadata', { 
                preferences: { bankInfo: cleanValues } 
            });

            if (response.data.success) {
                messageApi.success('Banka bilgileri başarıyla güncellendi');
            } else {
                messageApi.error('Kayıt sırasında bir hata oluştu');
            }
        } catch (error) {
            console.error('Bank info save error:', error);
            messageApi.error('Lütfen bilgileri kontrol edin');
        }
    };

    // --- Account Handlers ---
    const handleUpdateProfile = async () => {
        try {
            await profileForm.validateFields();
            // Mock API Call
            messageApi.success('Profil bilgileri güncellendi');
        } catch (error) {
            messageApi.error('Hata oluştu');
        }
    };

    const handleUpdatePassword = async () => {
        try {
            await passwordForm.validateFields();
            // Mock API Call
            messageApi.success('Şifreniz başarıyla değiştirildi');
            passwordForm.resetFields();
        } catch (error) {
            messageApi.error('Hata oluştu');
        }
    };

    // Render Constants
    const items = [
        {
            key: 'vehicles',
            label: <span style={{ fontSize: '16px' }}><CarOutlined /> Araçlarım</span>,
            children: (
                <div style={{ padding: '20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <Text type="secondary">Sisteme kayıtlı araçlarınızı buradan yönetebilirsiniz.</Text>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddVehicle}>
                            Yeni Araç Ekle
                        </Button>
                    </div>
                    <Table
                        columns={vehicleColumns}
                        dataSource={vehicles}
                        rowKey="id"
                        loading={loadingVehicles}
                        pagination={{ pageSize: 5 }}
                    />
                </div>
            )
        },
        {
            key: 'bank',
            label: <span style={{ fontSize: '16px' }}><BankOutlined /> Hesap Bilgileri</span>,
            children: (
                <div style={{ padding: '20px 0', maxWidth: '600px' }}>
                    <Card title="Banka Hesap Bilgileri" bordered={false} style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                        <Form form={bankForm} layout="vertical" onFinish={handleSaveBankInfo}>
                            <Row gutter={16}>
                                <Col span={24}>
                                    <Form.Item label="Hesap Sahibi (Ad Soyad / Ünvan)" name="accountHolder" rules={[{ required: true }]}>
                                        <Input size="large" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item label="Banka Adı" name="bankName" rules={[{ required: true }]}>
                                        <Select size="large" placeholder="Banka Seçin">
                                            <Option value="Garanti BBVA">Garanti BBVA</Option>
                                            <Option value="Ziraat Bankası">Ziraat Bankası</Option>
                                            <Option value="İş Bankası">İş Bankası</Option>
                                            <Option value="Akbank">Akbank</Option>
                                            <Option value="Yapı Kredi">Yapı Kredi</Option>
                                            <Option value="QNB Finansbank">QNB Finansbank</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item label="TCKN / VKN" name="tckn" rules={[{ required: true }]}>
                                        <Input size="large" maxLength={11} />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item 
                                        label="IBAN Numarası" 
                                        name="iban" 
                                        rules={[
                                            { required: true, message: 'IBAN zorunludur' },
                                            { 
                                                pattern: /^(TR[0-9]{2}\s?([0-9]{4}\s?){5}[0-9]{2})|TR[0-9]{24}$/i, 
                                                message: 'Geçerli bir TR IBAN formatı giriniz (26 karakter)' 
                                            }
                                        ]}
                                        help="TR ile başlayan 26 haneli IBAN numaranızı giriniz."
                                    >
                                        <Input size="large" placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={34} style={{ letterSpacing: '1px' }} />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large" block>
                                        Bilgileri Kaydet
                                    </Button>
                                </Col>
                            </Row>
                        </Form>
                    </Card>
                </div>
            )
        },
        {
            key: 'account',
            label: <span style={{ fontSize: '16px' }}><UserOutlined /> Hesap Yönetimi</span>,
            children: (
                <div style={{ padding: '20px 0' }}>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} lg={12}>
                            <Card title="Profil Bilgileri" bordered={false} style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' }}>
                                <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item label="Ad" name="firstName">
                                                <Input disabled />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item label="Soyad" name="lastName">
                                                <Input disabled />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Form.Item label="E-posta Adresi" name="email">
                                                <Input disabled suffix={<SafetyOutlined style={{ color: '#52c41a' }} />} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Form.Item label="Telefon Numarası" name="phone" rules={[{ required: true, message: 'Telefon numarası gerekli' }]}>
                                                <Input size="large" prefix="+90" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Button type="primary" htmlType="submit">
                                                Güncelle
                                            </Button>
                                        </Col>
                                    </Row>
                                </Form>

                                <Divider />

                                <Title level={5}>Şifre Değiştir</Title>
                                <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
                                    <Form.Item label="Mevcut Şifre" name="currentPassword" rules={[{ required: true }]}>
                                        <Input.Password />
                                    </Form.Item>
                                    <Form.Item label="Yeni Şifre" name="newPassword" rules={[{ required: true, min: 6 }]}>
                                        <Input.Password />
                                    </Form.Item>
                                    <Button htmlType="submit">Şifreyi Güncelle</Button>
                                </Form>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card title="Belgelerim" bordered={false} style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' }}>
                                <Alert
                                    message="Belge Durumu"
                                    description="Eksik belgelerinizi yükleyerek hesabınızın onaylanma sürecini hızlandırabilirsiniz."
                                    type="info"
                                    showIcon
                                    style={{ marginBottom: '20px' }}
                                />

                                <List
                                    itemLayout="horizontal"
                                    dataSource={documents}
                                    renderItem={item => (
                                        <List.Item
                                            actions={[
                                                item.status === 'VERIFIED' ? null : (
                                                    <Upload showUploadList={false} customRequest={({ onSuccess }) => setTimeout(() => {
                                                        messageApi.success('Belge yüklendi, onay bekleniyor');
                                                        onSuccess?.("ok");
                                                    }, 1000)}>
                                                        <Button icon={<UploadOutlined />} size="small">Yükle</Button>
                                                    </Upload>
                                                )
                                            ]}
                                        >
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar
                                                        icon={<FileTextOutlined />}
                                                        style={{ backgroundColor: item.status === 'VERIFIED' ? '#87d068' : item.status === 'MISSING' ? '#ff4d4f' : '#faad14' }}
                                                    />
                                                }
                                                title={item.name}
                                                description={
                                                    <Space>
                                                        {item.status === 'VERIFIED' && <Tag color="success">Onaylandı</Tag>}
                                                        {item.status === 'PENDING' && <Tag color="warning">İnceleniyor</Tag>}
                                                        {item.status === 'MISSING' && <Tag color="error">Eksik</Tag>}
                                                        {item.uploadDate && <Text type="secondary" style={{ fontSize: '11px' }}>{item.uploadDate}</Text>}
                                                    </Space>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
                            </Card>
                        </Col>
                    </Row>
                </div>
            )
        }
    ];

    return (
        <PartnerGuard>
            <PartnerLayout>
                {contextHolder}
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <Title level={2}>Ayarlar</Title>
                        <Text type="secondary">Hesap, araç ve ödeme tercihlerinizi yönetin.</Text>
                    </div>

                    <Card bordered={false} style={{ borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                        <Tabs
                            activeKey={activeTab}
                            onChange={setActiveTab}
                            items={items}
                            tabBarStyle={{ marginBottom: 0, padding: '0 16px' }}
                        />
                    </Card>

                    {/* Add/Edit Vehicle Modal */}
                    <Modal
                        title={editingVehicle ? "Aracı Düzenle" : "Yeni Araç Ekle"}
                        open={isVehicleModalVisible}
                        onOk={handleSaveVehicle}
                        onCancel={() => setIsVehicleModalVisible(false)}
                        okText="Kaydet"
                        cancelText="İptal"
                    >
                        <Form form={vehicleForm} layout="vertical">
                            <Form.Item label="Plaka" name="plateNumber" rules={[{ required: true }]}>
                                <Input placeholder="34 ABC 123" />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item label="Marka" name="brand" rules={[{ required: true }]}>
                                        <Select placeholder="Seçiniz">
                                            <Option value="Mercedes-Benz">Mercedes-Benz</Option>
                                            <Option value="Volkswagen">Volkswagen</Option>
                                            <Option value="Ford">Ford</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item label="Model" name="model" rules={[{ required: true }]}>
                                        <Input placeholder="Vito Tourer" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item label="Araç Tipi" name="vehicleType" rules={[{ required: true }]}>
                                        <Select placeholder="Seçiniz">
                                            <Option value="VIP_VAN">Vito VIP (6+1)</Option>
                                            <Option value="MINIVAN">Transporter (8+1)</Option>
                                            <Option value="MINIBUS">Sprinter (16+1)</Option>
                                            <Option value="SEDAN">Binek (Sedan)</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item label="Yıl" name="year" rules={[{ required: true }]}>
                                        <Input type="number" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item label="Kapasite (Yolcu)" name="capacity" rules={[{ required: true }]}>
                                <Input type="number" max={50} min={1} />
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
