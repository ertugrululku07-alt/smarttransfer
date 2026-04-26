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
    LockOutlined, TeamOutlined, CalendarOutlined,
    CheckCircleOutlined
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
    const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
    const [savingVehicle, setSavingVehicle] = useState(false);
    const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState<string | null>(null);

    const [documents, setDocuments] = useState([
        { id: 1, name: 'Sürücü Belgesi', status: 'VERIFIED', uploadDate: '2024-01-15' },
        { id: 2, name: 'SRC Belgesi', status: 'VERIFIED', uploadDate: '2024-01-15' },
        { id: 3, name: 'Psikoteknik', status: 'PENDING', uploadDate: '2024-02-10' },
        { id: 4, name: 'Adli Sicil Kaydı', status: 'MISSING', uploadDate: null },
    ]);

    const fetchVehicleTypes = async () => {
        try {
            const res = await apiClient.get('/api/vehicle-types');
            if (res.data.success) setVehicleTypes(res.data.data);
        } catch (e) { console.error('Vehicle types error:', e); }
    };

    useEffect(() => { fetchVehicleTypes(); }, []);

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

    const CAR_BRANDS = [
        'Mercedes-Benz', 'Volkswagen', 'Ford', 'Toyota', 'BMW', 'Audi',
        'Renault', 'Fiat', 'Hyundai', 'Peugeot', 'Citroën', 'Opel',
        'Škoda', 'Honda', 'Nissan', 'Dacia', 'Kia', 'Volvo', 'Iveco', 'MAN'
    ];

    const handleAddVehicle = () => { setEditingVehicle(null); vehicleForm.resetFields(); setSelectedVehicleTypeId(null); setIsVehicleModalVisible(true); };
    const handleEditVehicle = (record: any) => {
        setEditingVehicle(record);
        vehicleForm.setFieldsValue({
            ...record,
            vehicleTypeId: record.vehicleTypeId || undefined,
        });
        setSelectedVehicleTypeId(record.vehicleTypeId || null);
        setIsVehicleModalVisible(true);
    };

    const handleSaveVehicle = async () => {
        try {
            setSavingVehicle(true);
            const values = await vehicleForm.validateFields();
            // Find selected vehicle type for capacity
            const selectedType = vehicleTypes.find(vt => vt.id === values.vehicleTypeId);
            const payload = {
                ...values,
                year: Number(values.year),
                capacity: selectedType?.capacity || Number(values.capacity || 4),
                isActive: true,
                isCompanyOwned: true,
            };
            const response = editingVehicle
                ? await apiClient.put(`/api/vehicles/${editingVehicle.id}`, payload)
                : await apiClient.post('/api/vehicles', payload);
            if (response.data.success) {
                messageApi.success(editingVehicle ? 'Araç güncellendi' : 'Yeni araç eklendi');
                setIsVehicleModalVisible(false); fetchVehicles();
            } else { messageApi.error(response.data.error || 'İşlem başarısız'); }
        } catch (error) { console.error('Validation or API error:', error); messageApi.error('Lütfen formu kontrol edin'); }
        finally { setSavingVehicle(false); }
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
                <span style={{ padding: '2px 8px', borderRadius: 6, background: '#eef2ff', fontSize: 12, fontWeight: 600, color: '#4f46e5', border: '1px solid #c7d2fe' }}>{r.vehicleTypeDetails?.name || r.vehicleType}</span>
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

                    {/* Vehicle Modal — Professional Design */}
                    <Modal
                        open={isVehicleModalVisible}
                        title={null}
                        footer={null}
                        onCancel={() => setIsVehicleModalVisible(false)}
                        centered
                        width={520}
                        styles={{ body: { padding: 0 } }}
                    >
                        <div style={{ padding: '28px 28px 8px' }}>
                            {/* Modal Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 14,
                                    background: editingVehicle ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 22, boxShadow: `0 6px 16px ${editingVehicle ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`,
                                }}>
                                    <CarOutlined />
                                </div>
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{editingVehicle ? 'Aracı Düzenle' : 'Yeni Araç Ekle'}</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Araç bilgilerini ve tipini belirleyin</div>
                                </div>
                            </div>

                            <Form form={vehicleForm} layout="vertical" requiredMark={false}>
                                {/* Plaka — Full Width, Prominent */}
                                <Form.Item
                                    label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Plaka Numarası</span>}
                                    name="plateNumber"
                                    rules={[{ required: true, message: 'Plaka zorunludur' }]}
                                >
                                    <Input
                                        placeholder="34 ABC 123"
                                        size="large"
                                        style={{
                                            borderRadius: 12, fontSize: 16, fontWeight: 700, letterSpacing: 1.5,
                                            textTransform: 'uppercase', textAlign: 'center',
                                            border: '2px solid #e2e8f0', height: 50,
                                        }}
                                    />
                                </Form.Item>

                                {/* Vehicle Type — Cards Grid */}
                                <Form.Item
                                    label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Araç Tipi</span>}
                                    name="vehicleTypeId"
                                    rules={[{ required: true, message: 'Araç tipi seçilmelidir' }]}
                                >
                                    <div>
                                        {vehicleTypes.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                                                <Spin size="small" /> Araç tipleri yükleniyor...
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                                                {vehicleTypes.map(vt => {
                                                    const isSelected = selectedVehicleTypeId === vt.id;
                                                    return (
                                                        <button
                                                            key={vt.id}
                                                            type="button"
                                                            onClick={() => {
                                                                vehicleForm.setFieldsValue({ vehicleTypeId: vt.id, capacity: vt.capacity });
                                                                setSelectedVehicleTypeId(vt.id);
                                                            }}
                                                            style={{
                                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                                                padding: '14px 10px', border: `2px solid ${isSelected ? '#6366f1' : '#e2e8f0'}`,
                                                                borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                                                                background: isSelected ? '#eef2ff' : '#fff',
                                                                position: 'relative',
                                                            }}
                                                        >
                                                            {isSelected && (
                                                                <div style={{
                                                                    position: 'absolute', top: -6, right: -6,
                                                                    width: 20, height: 20, borderRadius: '50%',
                                                                    background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                }}>
                                                                    <CheckCircleOutlined style={{ color: '#fff', fontSize: 12 }} />
                                                                </div>
                                                            )}
                                                            <CarOutlined style={{ fontSize: 22, color: isSelected ? '#6366f1' : '#94a3b8' }} />
                                                            <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#4f46e5' : '#1e293b', textAlign: 'center' }}>{vt.name}</div>
                                                            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#64748b' }}>
                                                                <span><TeamOutlined /> {vt.capacity}</span>
                                                                <span>{vt.categoryDisplay}</span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </Form.Item>

                                {/* Brand + Model */}
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Marka</span>}
                                            name="brand"
                                            rules={[{ required: true, message: 'Marka zorunludur' }]}
                                        >
                                            <Select
                                                placeholder="Seçiniz"
                                                size="large"
                                                showSearch
                                                optionFilterProp="children"
                                                style={{ borderRadius: 12 }}
                                            >
                                                {CAR_BRANDS.map(b => <Option key={b} value={b}>{b}</Option>)}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Model</span>}
                                            name="model"
                                            rules={[{ required: true, message: 'Model zorunludur' }]}
                                        >
                                            <Input placeholder="Vito Tourer" size="large" style={{ borderRadius: 12 }} />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                {/* Year + Color */}
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Model Yılı</span>}
                                            name="year"
                                            rules={[{ required: true, message: 'Yıl zorunludur' }]}
                                        >
                                            <Select placeholder="Seçiniz" size="large" style={{ borderRadius: 12 }}>
                                                {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                                    <Option key={y} value={y}>{y}</Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Renk</span>}
                                            name="color"
                                        >
                                            <Select placeholder="Seçiniz" size="large" allowClear style={{ borderRadius: 12 }}>
                                                <Option value="Beyaz">Beyaz</Option>
                                                <Option value="Siyah">Siyah</Option>
                                                <Option value="Gri">Gri</Option>
                                                <Option value="Lacivert">Lacivert</Option>
                                                <Option value="Kırmızı">Kırmızı</Option>
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>

                                {/* Hidden capacity */}
                                <Form.Item name="capacity" hidden><Input /></Form.Item>

                                {/* Buttons */}
                                <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingBottom: 16 }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsVehicleModalVisible(false)}
                                        style={{
                                            flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 12,
                                            background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveVehicle}
                                        disabled={savingVehicle}
                                        style={{
                                            flex: 2, padding: '12px', border: 'none', borderRadius: 12,
                                            background: savingVehicle ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: savingVehicle ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                        }}
                                    >
                                        {savingVehicle ? <Spin size="small" /> : <><CheckCircleOutlined /> {editingVehicle ? 'Güncelle' : 'Araç Ekle'}</>}
                                    </button>
                                </div>
                            </Form>
                        </div>
                    </Modal>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
