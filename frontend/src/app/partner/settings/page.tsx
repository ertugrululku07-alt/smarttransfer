'use client';

import React, { useState, useEffect } from 'react';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import {
    Form, Input, Button, Table, Tag, Space, Modal,
    Row, Col, Upload, message, Select, Avatar, List, Alert, Spin
} from 'antd';
import {
    PlusOutlined, CarOutlined, BankOutlined, UserOutlined,
    UploadOutlined, EditOutlined,
    SaveOutlined, SafetyOutlined, FileTextOutlined,
    LockOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/app/context/AuthContext';

const { Option } = Select;

export default function SettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('vehicles');
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [isVehicleModalVisible, setIsVehicleModalVisible] = useState(false);
    const [vehicleForm] = Form.useForm();
    const [editingVehicle, setEditingVehicle] = useState<any>(null);
    const [bankForm] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    const [documents, setDocuments] = useState([
        { id: 1, name: 'Sürücü Belgesi', status: 'VERIFIED', uploadDate: '2024-01-15' },
        { id: 2, name: 'SRC Belgesi', status: 'VERIFIED', uploadDate: '2024-01-15' },
        { id: 3, name: 'Psikoteknik', status: 'PENDING', uploadDate: '2024-02-10' },
        { id: 4, name: 'Adli Sicil Kaydı', status: 'MISSING', uploadDate: null },
    ]);

    useEffect(() => {
        if (activeTab === 'vehicles') fetchVehicles();
        if (activeTab === 'account' && user) {
            profileForm.setFieldsValue({
                firstName: user.firstName, lastName: user.lastName,
                email: user.email, phone: (user as any).phone || ''
            });
        }
        if (activeTab === 'bank') fetchBankInfo();
    }, [activeTab, user]);

    const fetchBankInfo = async () => {
        try {
            const response = await apiClient.get('/api/auth/metadata');
            if (response.data.success && response.data.data.bankInfo) bankForm.setFieldsValue(response.data.data.bankInfo);
        } catch (error) { console.error('Error fetching bank info:', error); }
    };

    const fetchVehicles = async () => {
        setLoadingVehicles(true);
        try {
            const response = await apiClient.get('/api/vehicles');
            if (response.data.success) setVehicles(response.data.data);
        } catch (error) {
            console.error('Error fetching vehicles:', error);
            messageApi.error('Araç listesi alınamadı');
        } finally { setLoadingVehicles(false); }
    };

    const handleAddVehicle = () => { setEditingVehicle(null); vehicleForm.resetFields(); setIsVehicleModalVisible(true); };
    const handleEditVehicle = (record: any) => {
        setEditingVehicle(record);
        vehicleForm.setFieldsValue({ ...record });
        setIsVehicleModalVisible(true);
    };

    const handleSaveVehicle = async () => {
        try {
            const values = await vehicleForm.validateFields();
            const payload = { ...values, year: Number(values.year), capacity: Number(values.capacity), isActive: true, isCompanyOwned: true };
            const response = editingVehicle
                ? await apiClient.put(`/api/vehicles/${editingVehicle.id}`, payload)
                : await apiClient.post('/api/vehicles', payload);
            if (response.data.success) {
                messageApi.success(editingVehicle ? 'Araç güncellendi' : 'Yeni araç eklendi');
                setIsVehicleModalVisible(false); fetchVehicles();
            } else { messageApi.error(response.data.error || 'İşlem başarısız'); }
        } catch (error) { console.error('Validation or API error:', error); messageApi.error('Lütfen formu kontrol edin'); }
    };

    const handleSaveBankInfo = async () => {
        try {
            const values = await bankForm.validateFields();
            const cleanValues = { ...values, iban: values.iban.replace(/\s/g, '').toUpperCase() };
            const response = await apiClient.put('/api/auth/metadata', { preferences: { bankInfo: cleanValues } });
            if (response.data.success) messageApi.success('Banka bilgileri güncellendi');
            else messageApi.error('Kayıt sırasında bir hata oluştu');
        } catch (error) { console.error('Bank info save error:', error); messageApi.error('Lütfen bilgileri kontrol edin'); }
    };

    const handleUpdateProfile = async () => {
        try { await profileForm.validateFields(); messageApi.success('Profil bilgileri güncellendi'); }
        catch (error) { messageApi.error('Hata oluştu'); }
    };

    const handleUpdatePassword = async () => {
        try { await passwordForm.validateFields(); messageApi.success('Şifreniz başarıyla değiştirildi'); passwordForm.resetFields(); }
        catch (error) { messageApi.error('Hata oluştu'); }
    };

    const tabs = [
        { key: 'vehicles', label: 'Araçlarım', icon: <CarOutlined /> },
        { key: 'bank', label: 'Hesap Bilgileri', icon: <BankOutlined /> },
        { key: 'account', label: 'Hesap & Belgeler', icon: <UserOutlined /> },
    ];

    const vehicleColumns = [
        { title: 'Araç', key: 'name', render: (_: any, r: any) => (
            <div><div style={{ fontWeight: 600, color: '#1e293b' }}>{r.brand} {r.model}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{r.plateNumber}</div></div>
        )},
        { title: 'Tip / Yıl', key: 'type', render: (_: any, r: any) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#475569' }}>{r.vehicleType}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.year}</span>
            </div>
        )},
        { title: 'Kapasite', dataIndex: 'capacity', key: 'capacity', render: (t: number) => <span style={{ fontWeight: 600 }}>{t} Kişi</span> },
        { title: 'Durum', dataIndex: 'isActive', key: 'isActive', render: (a: boolean) => (
            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: a ? '#d1fae5' : '#f1f5f9', color: a ? '#065f46' : '#94a3b8' }}>{a ? 'Aktif' : 'Pasif'}</span>
        )},
        { title: '', key: 'action', width: 50, render: (_: any, r: any) => (
            <button onClick={() => handleEditVehicle(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 16 }}><EditOutlined /></button>
        )},
    ];

    return (
        <PartnerGuard>
            <PartnerLayout>
                {contextHolder}
                <style jsx global>{`
                    .settings-container { max-width: 1200px; margin: 0 auto; }
                    .settings-content { display: grid; grid-template-columns: 220px 1fr; gap: 24px; }
                    .settings-sidebar-nav { display: flex; flex-direction: column; gap: 4px; }
                    @media (max-width: 768px) {
                        .settings-container { padding-top: 68px; }
                        .settings-content { grid-template-columns: 1fr !important; gap: 16px; }
                        .settings-sidebar-nav { flex-direction: row !important; overflow-x: auto; gap: 8px !important; padding-bottom: 8px; }
                    }
                `}</style>

                <div className="settings-container">
                    <div style={{ marginBottom: 20 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>⚙️ Ayarlar</h1>
                        <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Hesap, araç ve ödeme tercihlerinizi yönetin</p>
                    </div>

                    <div className="settings-content">
                        {/* Sidebar tabs */}
                        <div>
                            <div className="settings-sidebar-nav">
                                {tabs.map(t => (
                                    <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '12px 16px', border: 'none', borderRadius: 12,
                                        background: activeTab === t.key ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#fff',
                                        color: activeTab === t.key ? '#fff' : '#64748b',
                                        fontSize: 14, fontWeight: activeTab === t.key ? 700 : 500,
                                        cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                                        boxShadow: activeTab === t.key ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 4px rgba(0,0,0,0.04)',
                                    }}>
                                        <span style={{ fontSize: 16 }}>{t.icon}</span>{t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{
                            background: '#fff', borderRadius: 18, padding: '24px',
                            boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                            minHeight: 400,
                        }}>
                            {/* Vehicles Tab */}
                            {activeTab === 'vehicles' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                                        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Sisteme kayıtlı araçlarınızı yönetin</p>
                                        <button onClick={handleAddVehicle} style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '10px 20px', border: 'none', borderRadius: 12,
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                        }}><PlusOutlined /> Yeni Araç</button>
                                    </div>
                                    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                                        <Table columns={vehicleColumns} dataSource={vehicles} rowKey="id" loading={loadingVehicles} pagination={{ pageSize: 5 }} />
                                    </div>
                                </div>
                            )}

                            {/* Bank Tab */}
                            {activeTab === 'bank' && (
                                <div style={{ maxWidth: 560 }}>
                                    <div style={{ marginBottom: 24, padding: '16px 20px', background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6366f1', fontSize: 14, fontWeight: 600 }}>
                                            <BankOutlined style={{ fontSize: 18 }} /> Banka Hesap Bilgileri
                                        </div>
                                        <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>Ödeme almak için banka bilgilerinizi ekleyin</p>
                                    </div>
                                    <Form form={bankForm} layout="vertical" onFinish={handleSaveBankInfo}>
                                        <Form.Item label="Hesap Sahibi" name="accountHolder" rules={[{ required: true }]}>
                                            <Input size="large" style={{ borderRadius: 10 }} />
                                        </Form.Item>
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
                                        <Form.Item label="TCKN / VKN" name="tckn" rules={[{ required: true }]}>
                                            <Input size="large" maxLength={11} style={{ borderRadius: 10 }} />
                                        </Form.Item>
                                        <Form.Item label="IBAN Numarası" name="iban"
                                            rules={[
                                                { required: true, message: 'IBAN zorunludur' },
                                                { pattern: /^(TR[0-9]{2}\s?([0-9]{4}\s?){5}[0-9]{2})|TR[0-9]{24}$/i, message: 'Geçerli bir TR IBAN giriniz' }
                                            ]}
                                            help="TR ile başlayan 26 haneli IBAN numaranız"
                                        >
                                            <Input size="large" placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={34} style={{ letterSpacing: 1, borderRadius: 10 }} />
                                        </Form.Item>
                                        <button type="submit" style={{
                                            width: '100%', padding: '12px', border: 'none', borderRadius: 12, marginTop: 8,
                                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                        }}>
                                            <SaveOutlined /> Bilgileri Kaydet
                                        </button>
                                    </Form>
                                </div>
                            )}

                            {/* Account Tab */}
                            {activeTab === 'account' && (
                                <div>
                                    <Row gutter={[24, 24]}>
                                        <Col xs={24} lg={12}>
                                            <div style={{ marginBottom: 20, padding: '16px 20px', background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Profil Bilgileri</div>
                                            </div>
                                            <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
                                                <Row gutter={12}>
                                                    <Col span={12}>
                                                        <Form.Item label="Ad" name="firstName"><Input disabled style={{ borderRadius: 10 }} /></Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label="Soyad" name="lastName"><Input disabled style={{ borderRadius: 10 }} /></Form.Item>
                                                    </Col>
                                                </Row>
                                                <Form.Item label="E-posta" name="email">
                                                    <Input disabled suffix={<SafetyOutlined style={{ color: '#10b981' }} />} style={{ borderRadius: 10 }} />
                                                </Form.Item>
                                                <Form.Item label="Telefon" name="phone" rules={[{ required: true }]}>
                                                    <Input size="large" prefix="+90" style={{ borderRadius: 10 }} />
                                                </Form.Item>
                                                <Button type="primary" htmlType="submit" block style={{ borderRadius: 10, height: 42, fontWeight: 600 }}>Güncelle</Button>
                                            </Form>

                                            <div style={{ height: 1, background: '#f1f5f9', margin: '24px 0' }} />

                                            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 14, fontWeight: 600 }}>
                                                <LockOutlined /> Şifre Değiştir
                                            </div>
                                            <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
                                                <Form.Item label="Mevcut Şifre" name="currentPassword" rules={[{ required: true }]}>
                                                    <Input.Password style={{ borderRadius: 10 }} />
                                                </Form.Item>
                                                <Form.Item label="Yeni Şifre" name="newPassword" rules={[{ required: true, min: 6 }]}>
                                                    <Input.Password style={{ borderRadius: 10 }} />
                                                </Form.Item>
                                                <Button htmlType="submit" block style={{ borderRadius: 10, height: 40, fontWeight: 600 }}>Şifreyi Güncelle</Button>
                                            </Form>
                                        </Col>

                                        <Col xs={24} lg={12}>
                                            <div style={{ marginBottom: 20, padding: '16px 20px', background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Belgelerim</div>
                                            </div>
                                            <Alert
                                                message="Eksik belgelerinizi yükleyin"
                                                description="Hesabınızın onaylanması için tüm belgeleriniz eksiksiz olmalıdır."
                                                type="info" showIcon
                                                style={{ marginBottom: 20, borderRadius: 12 }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {documents.map(doc => (
                                                    <div key={doc.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 14,
                                                        padding: '14px 16px', borderRadius: 14, background: '#f8fafc',
                                                        border: '1px solid #f1f5f9',
                                                    }}>
                                                        <div style={{
                                                            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                                                            background: doc.status === 'VERIFIED' ? '#d1fae5' : doc.status === 'MISSING' ? '#fee2e2' : '#fef3c7',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: doc.status === 'VERIFIED' ? '#059669' : doc.status === 'MISSING' ? '#dc2626' : '#d97706',
                                                            fontSize: 18,
                                                        }}>
                                                            <FileTextOutlined />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{doc.name}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                                                <span style={{
                                                                    padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                                                                    background: doc.status === 'VERIFIED' ? '#d1fae5' : doc.status === 'MISSING' ? '#fee2e2' : '#fef3c7',
                                                                    color: doc.status === 'VERIFIED' ? '#065f46' : doc.status === 'MISSING' ? '#991b1b' : '#92400e',
                                                                }}>
                                                                    {doc.status === 'VERIFIED' ? 'Onaylandı' : doc.status === 'MISSING' ? 'Eksik' : 'İnceleniyor'}
                                                                </span>
                                                                {doc.uploadDate && <span style={{ fontSize: 11, color: '#94a3b8' }}>{doc.uploadDate}</span>}
                                                            </div>
                                                        </div>
                                                        {doc.status !== 'VERIFIED' && (
                                                            <Upload showUploadList={false} customRequest={({ onSuccess }) => setTimeout(() => { messageApi.success('Belge yüklendi'); onSuccess?.("ok"); }, 1000)}>
                                                                <button style={{
                                                                    padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                                                                    background: '#fff', fontSize: 12, fontWeight: 600, color: '#6366f1',
                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                                }}>
                                                                    <UploadOutlined /> Yükle
                                                                </button>
                                                            </Upload>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </Col>
                                    </Row>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Vehicle Modal */}
                    <Modal
                        title={editingVehicle ? "Aracı Düzenle" : "Yeni Araç Ekle"}
                        open={isVehicleModalVisible}
                        onOk={handleSaveVehicle}
                        onCancel={() => setIsVehicleModalVisible(false)}
                        okText="Kaydet" cancelText="İptal"
                    >
                        <Form form={vehicleForm} layout="vertical">
                            <Form.Item label="Plaka" name="plateNumber" rules={[{ required: true }]}>
                                <Input placeholder="34 ABC 123" style={{ borderRadius: 10 }} />
                            </Form.Item>
                            <Row gutter={12}>
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
                                        <Input placeholder="Vito Tourer" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
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
                                        <Input type="number" style={{ borderRadius: 10 }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item label="Kapasite (Yolcu)" name="capacity" rules={[{ required: true }]}>
                                <Input type="number" max={50} min={1} style={{ borderRadius: 10 }} />
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
