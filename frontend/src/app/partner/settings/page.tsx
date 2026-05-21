'use client';

import React, { useState, useEffect } from 'react';
import {
    Form, Input, Button, Table, Tag, Space, Modal, Popconfirm, Tooltip,
    Row, Col, Upload, message, Select, Avatar, List, Alert, Spin
} from 'antd';
import {
    PlusOutlined, CarOutlined, BankOutlined, UserOutlined,
    UploadOutlined, EditOutlined, DeleteOutlined,
    SaveOutlined, SafetyOutlined, FileTextOutlined,
    LockOutlined, TeamOutlined, CalendarOutlined,
    CheckCircleOutlined, PhoneOutlined, MailOutlined,
    StopOutlined, ApiOutlined, WhatsAppOutlined,
    SafetyCertificateOutlined, KeyOutlined, ExperimentOutlined,
    CloseCircleOutlined
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

    // Driver state
    const [driversList, setDriversList] = useState<any[]>([]);
    const [loadingDrivers, setLoadingDrivers] = useState(false);
    const [isDriverModalVisible, setIsDriverModalVisible] = useState(false);
    const [driverForm] = Form.useForm();
    const [editingDriver, setEditingDriver] = useState<any>(null);
    const [savingDriver, setSavingDriver] = useState(false);

    // Integrations (Tanımlamalar) state
    const [integrationsLoading, setIntegrationsLoading] = useState(false);
    const [uetdsProfile, setUetdsProfile] = useState<any>(null);
    const [uetdsForm] = Form.useForm();
    const [savingUetds, setSavingUetds] = useState(false);
    const [testingUetds, setTestingUetds] = useState(false);
    const [uetdsTestResult, setUetdsTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [whatsapp, setWhatsapp] = useState<any>(null);
    const [whatsappForm] = Form.useForm();
    const [whatsappProvider, setWhatsappProvider] = useState<'META' | 'GREEN' | 'WEBHOOK'>('META');
    const [savingWhatsapp, setSavingWhatsapp] = useState(false);
    const [testingWhatsapp, setTestingWhatsapp] = useState(false);
    const [whatsappTestModal, setWhatsappTestModal] = useState<{ open: boolean; phone: string }>({ open: false, phone: '' });
    const [emailCfg, setEmailCfg] = useState<any>(null);
    const [emailForm] = Form.useForm();
    const [savingEmail, setSavingEmail] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);
    const [emailTestModal, setEmailTestModal] = useState<{ open: boolean; to: string }>({ open: false, to: '' });

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

    const fetchDrivers = async () => {
        setLoadingDrivers(true);
        try {
            const response = await apiClient.get('/api/transfer/partner/my-drivers');
            if (response.data.success) setDriversList(response.data.data || []);
        } catch (error) {
            console.error('Error fetching drivers:', error);
            messageApi.error('Şoför listesi alınamadı');
        } finally { setLoadingDrivers(false); }
    };

    useEffect(() => {
        if (activeTab === 'vehicles') fetchVehicles();
        if (activeTab === 'drivers') fetchDrivers();
        if (activeTab === 'account' && user) {
            profileForm.setFieldsValue({
                firstName: user.firstName, lastName: user.lastName,
                email: user.email, phone: (user as any).phone || ''
            });
        }
        if (activeTab === 'bank') fetchBankInfo();
        if (activeTab === 'integrations') fetchIntegrations();
    }, [activeTab, user]);

    const fetchIntegrations = async () => {
        setIntegrationsLoading(true);
        try {
            const [profileRes, notifRes] = await Promise.all([
                apiClient.get('/api/transfer/partner/profile'),
                apiClient.get('/api/transfer/partner/notifications').catch(() => ({ data: { success: false } })),
            ]);
            if (profileRes.data?.success) {
                setUetdsProfile(profileRes.data.data);
                uetdsForm.setFieldsValue({
                    unetUser: profileRes.data.data.uetdsUnetUser || '',
                    unetPassword: '',
                });
            }
            if (notifRes.data?.success) {
                const wa = notifRes.data.data?.whatsapp || {};
                const em = notifRes.data.data?.email || {};
                setWhatsapp(wa);
                setEmailCfg(em);
                setWhatsappProvider((wa.provider || 'META') as any);
                whatsappForm.setFieldsValue({
                    enabled: !!wa.enabled,
                    provider: wa.provider || 'META',
                    metaPhoneNumberId: wa.metaPhoneNumberId || '',
                    metaAccessToken: '',
                    greenInstanceId: wa.greenInstanceId || '',
                    greenApiToken: '',
                    webhookUrl: wa.webhookUrl || '',
                    webhookSecret: '',
                    defaultCountryCode: wa.defaultCountryCode || '90',
                    autoSendVoucher: !!wa.autoSendVoucher,
                });
                emailForm.setFieldsValue({
                    enabled: !!em.enabled,
                    smtpHost: em.smtpHost || '',
                    smtpPort: em.smtpPort || 587,
                    smtpSecure: !!em.smtpSecure,
                    smtpUser: em.smtpUser || '',
                    smtpPass: '',
                    senderEmail: em.senderEmail || '',
                    senderName: em.senderName || '',
                    replyTo: em.replyTo || '',
                    autoSendVoucher: !!em.autoSendVoucher,
                });
            }
        } catch (e) {
            console.error('Integrations fetch error', e);
        } finally {
            setIntegrationsLoading(false);
        }
    };

    const handleSaveUetds = async () => {
        try {
            const values = await uetdsForm.validateFields();
            if (!values.unetPassword) {
                messageApi.warning('Yeni şifre boş bırakılmamalıdır');
                return;
            }
            setSavingUetds(true);
            setUetdsTestResult(null);
            const res = await apiClient.put('/api/transfer/partner/uetds-credentials', {
                unetUser: values.unetUser,
                unetPassword: values.unetPassword,
            });
            if (res.data.success) {
                messageApi.success('UETDS kimlik bilgileri kaydedildi');
                uetdsForm.setFieldValue('unetPassword', '');
                fetchIntegrations();
            } else {
                messageApi.error(res.data.error || 'Kaydetme başarısız');
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            messageApi.error(e?.response?.data?.error || 'Kaydetme başarısız');
        } finally {
            setSavingUetds(false);
        }
    };

    const handleTestUetds = async () => {
        setTestingUetds(true);
        setUetdsTestResult(null);
        try {
            const res = await apiClient.post('/api/transfer/partner/uetds-test');
            setUetdsTestResult({ success: !!res.data.success, message: res.data.message || res.data.error || '-' });
        } catch (e: any) {
            setUetdsTestResult({ success: false, message: e?.response?.data?.error || 'Bağlantı testi başarısız' });
        } finally {
            setTestingUetds(false);
        }
    };

    const handleSaveWhatsapp = async () => {
        try {
            const values = await whatsappForm.validateFields();
            setSavingWhatsapp(true);
            const payload: any = {
                enabled: !!values.enabled,
                provider: values.provider,
                defaultCountryCode: values.defaultCountryCode,
                autoSendVoucher: !!values.autoSendVoucher,
            };
            if (values.provider === 'META') {
                payload.metaPhoneNumberId = values.metaPhoneNumberId || '';
                if (values.metaAccessToken) payload.metaAccessToken = values.metaAccessToken;
            }
            if (values.provider === 'GREEN') {
                payload.greenInstanceId = values.greenInstanceId || '';
                if (values.greenApiToken) payload.greenApiToken = values.greenApiToken;
            }
            if (values.provider === 'WEBHOOK') {
                payload.webhookUrl = values.webhookUrl || '';
                if (values.webhookSecret) payload.webhookSecret = values.webhookSecret;
            }
            const res = await apiClient.put('/api/transfer/partner/notifications', { whatsapp: payload });
            if (res.data?.success) {
                messageApi.success('WhatsApp ayarları kaydedildi');
                whatsappForm.setFieldValue('metaAccessToken', '');
                whatsappForm.setFieldValue('greenApiToken', '');
                whatsappForm.setFieldValue('webhookSecret', '');
                fetchIntegrations();
            } else {
                messageApi.error(res.data?.error || 'Kaydetme başarısız');
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            messageApi.error(e?.response?.data?.error || 'Kaydetme başarısız');
        } finally {
            setSavingWhatsapp(false);
        }
    };

    const handleTestWhatsapp = async () => {
        if (!whatsappTestModal.phone) {
            messageApi.warning('Telefon numarası gerekli');
            return;
        }
        setTestingWhatsapp(true);
        try {
            const res = await apiClient.post('/api/transfer/partner/notifications/test-whatsapp', {
                phone: whatsappTestModal.phone,
            });
            if (res.data?.success) {
                messageApi.success(res.data.message || 'Test mesajı gönderildi');
                setWhatsappTestModal({ open: false, phone: '' });
            } else {
                messageApi.error(res.data?.error || 'Gönderim başarısız');
            }
        } catch (e: any) {
            messageApi.error(e?.response?.data?.error || 'Gönderim başarısız');
        } finally {
            setTestingWhatsapp(false);
        }
    };

    const handleSaveEmail = async () => {
        try {
            const values = await emailForm.validateFields();
            setSavingEmail(true);
            const payload: any = {
                enabled: !!values.enabled,
                smtpHost: values.smtpHost,
                smtpPort: values.smtpPort,
                smtpSecure: !!values.smtpSecure,
                smtpUser: values.smtpUser,
                senderEmail: values.senderEmail,
                senderName: values.senderName,
                replyTo: values.replyTo,
                autoSendVoucher: !!values.autoSendVoucher,
            };
            if (values.smtpPass) payload.smtpPass = values.smtpPass;
            const res = await apiClient.put('/api/transfer/partner/notifications', { email: payload });
            if (res.data?.success) {
                messageApi.success('E-posta ayarları kaydedildi');
                emailForm.setFieldValue('smtpPass', '');
                fetchIntegrations();
            } else {
                messageApi.error(res.data?.error || 'Kaydetme başarısız');
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            messageApi.error(e?.response?.data?.error || 'Kaydetme başarısız');
        } finally {
            setSavingEmail(false);
        }
    };

    const handleTestEmail = async () => {
        if (!emailTestModal.to) {
            messageApi.warning('Alıcı e-posta adresi gerekli');
            return;
        }
        setTestingEmail(true);
        try {
            const res = await apiClient.post('/api/transfer/partner/notifications/test-email', {
                to: emailTestModal.to,
            });
            if (res.data?.success) {
                messageApi.success(res.data.message || 'Test e-postası gönderildi');
                setEmailTestModal({ open: false, to: '' });
            } else {
                messageApi.error(res.data?.error || 'Gönderim başarısız');
            }
        } catch (e: any) {
            messageApi.error(e?.response?.data?.error || 'Gönderim başarısız');
        } finally {
            setTestingEmail(false);
        }
    };

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

    const handleAddDriver = () => { setEditingDriver(null); driverForm.resetFields(); setIsDriverModalVisible(true); };
    const handleEditDriver = (record: any) => {
        setEditingDriver(record);
        driverForm.setFieldsValue({ firstName: record.firstName, lastName: record.lastName, phone: record.phone || '', email: record.email });
        setIsDriverModalVisible(true);
    };

    const handleSaveDriver = async () => {
        try {
            setSavingDriver(true);
            const values = await driverForm.validateFields();
            if (editingDriver) {
                const res = await apiClient.put(`/api/transfer/partner/drivers/${editingDriver.id}`, {
                    firstName: values.firstName,
                    lastName: values.lastName,
                    phone: values.phone || null,
                    ...(values.newPassword ? { password: values.newPassword } : {}),
                });
                if (res.data.success) { messageApi.success('Şoför güncellendi'); setIsDriverModalVisible(false); fetchDrivers(); }
                else messageApi.error(res.data.error || 'Güncelleme başarısız');
            } else {
                const res = await apiClient.post('/api/transfer/partner/drivers', {
                    firstName: values.firstName,
                    lastName: values.lastName,
                    email: values.email,
                    phone: values.phone || null,
                    password: values.password,
                });
                if (res.data.success) { messageApi.success('Şoför eklendi'); setIsDriverModalVisible(false); fetchDrivers(); }
                else messageApi.error(res.data.error || 'Ekleme başarısız');
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            messageApi.error(e?.response?.data?.error || 'İşlem başarısız');
        } finally { setSavingDriver(false); }
    };

    const handleDeleteDriver = async (driverId: string) => {
        try {
            const res = await apiClient.delete(`/api/transfer/partner/drivers/${driverId}`);
            if (res.data.success) { messageApi.success('Şoför silindi'); fetchDrivers(); }
            else messageApi.error(res.data.error || 'Silme başarısız');
        } catch (e: any) {
            messageApi.error(e?.response?.data?.error || 'Silme başarısız');
        }
    };

    const handleToggleDriverStatus = async (driver: any) => {
        const newStatus = driver.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        try {
            const res = await apiClient.put(`/api/transfer/partner/drivers/${driver.id}`, { status: newStatus });
            if (res.data.success) { messageApi.success(`Şoför ${newStatus === 'ACTIVE' ? 'aktifleştirildi' : 'pasifleştirildi'}`); fetchDrivers(); }
        } catch (e: any) { messageApi.error('Durum güncellenemedi'); }
    };

    const tabs = [
        { key: 'vehicles', label: 'Araçlarım', icon: <CarOutlined /> },
        { key: 'drivers', label: 'Şoförlerim', icon: <TeamOutlined /> },
        { key: 'bank', label: 'Hesap Bilgileri', icon: <BankOutlined /> },
        { key: 'integrations', label: 'Tanımlamalar', icon: <ApiOutlined /> },
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
        <>
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

                <div className="settings-container partner-page">
                    <div className="ps-page-header" style={{ marginBottom: 18 }}>
                        <div>
                            <h1 className="ps-page-header__title">Ayarlar</h1>
                            <p className="ps-page-header__subtitle">Hesap, filonuz, ödeme ve personel ayarları</p>
                        </div>
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

                            {/* Drivers Tab */}
                            {activeTab === 'drivers' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                                        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Ekibinizdeki şoförleri yönetin — şoförler partner mobil uygulamasına giriş yapabilir</p>
                                        <button onClick={handleAddDriver} style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '10px 20px', border: 'none', borderRadius: 12,
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                        }}><PlusOutlined /> Yeni Şoför</button>
                                    </div>
                                    {loadingDrivers ? (
                                        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
                                    ) : driversList.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                            <TeamOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                                            <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Henüz şoför eklenmemiş</div>
                                            <div style={{ fontSize: 13 }}>Yukarıdaki butona tıklayarak ekibinize şoför ekleyin.</div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {driversList.map((d: any) => (
                                                <div key={d.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 14,
                                                    padding: '14px 18px', borderRadius: 14, background: '#fff',
                                                    border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                                    transition: 'all 0.2s',
                                                }}>
                                                    <div style={{
                                                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                                                        background: d.isOnline ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #94a3b8, #64748b)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', fontSize: 16, fontWeight: 700, position: 'relative',
                                                    }}>
                                                        {(d.firstName?.[0] || '').toUpperCase()}{(d.lastName?.[0] || '').toUpperCase()}
                                                        {d.isOnline && (
                                                            <div style={{
                                                                position: 'absolute', bottom: -2, right: -2,
                                                                width: 14, height: 14, borderRadius: '50%',
                                                                background: '#22c55e', border: '2px solid #fff',
                                                            }} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{d.fullName || `${d.firstName} ${d.lastName}`}</span>
                                                            <span style={{
                                                                padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                                                                background: d.status === 'ACTIVE' ? '#d1fae5' : '#f1f5f9',
                                                                color: d.status === 'ACTIVE' ? '#065f46' : '#94a3b8',
                                                            }}>{d.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}</span>
                                                            {d.isOnline && <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>Online</span>}
                                                            {(d.activeBookingsCount || 0) > 0 && (
                                                                <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>{d.activeBookingsCount} aktif iş</span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 12, color: '#64748b' }}>
                                                            <span><MailOutlined style={{ marginRight: 4 }} />{d.email}</span>
                                                            {d.phone && <span><PhoneOutlined style={{ marginRight: 4 }} />{d.phone}</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <Tooltip title={d.status === 'ACTIVE' ? 'Pasifleştir' : 'Aktifleştir'}>
                                                            <button onClick={() => handleToggleDriverStatus(d)} style={{
                                                                width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0',
                                                                background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: d.status === 'ACTIVE' ? '#f59e0b' : '#10b981',
                                                            }}>{d.status === 'ACTIVE' ? <StopOutlined /> : <CheckCircleOutlined />}</button>
                                                        </Tooltip>
                                                        <Tooltip title="Düzenle">
                                                            <button onClick={() => handleEditDriver(d)} style={{
                                                                width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0',
                                                                background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: '#6366f1',
                                                            }}><EditOutlined /></button>
                                                        </Tooltip>
                                                        <Popconfirm title="Bu şoförü silmek istediğinize emin misiniz?" onConfirm={() => handleDeleteDriver(d.id)} okText="Evet" cancelText="Hayır">
                                                            <Tooltip title="Sil">
                                                                <button style={{
                                                                    width: 34, height: 34, borderRadius: 8, border: '1px solid #fecaca',
                                                                    background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: '#ef4444',
                                                                }}><DeleteOutlined /></button>
                                                            </Tooltip>
                                                        </Popconfirm>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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

                            {/* Integrations Tab (Tanımlamalar) */}
                            {activeTab === 'integrations' && (
                                <div>
                                    <div style={{ marginBottom: 24, padding: '16px 20px', background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6366f1', fontSize: 15, fontWeight: 700 }}>
                                            <ApiOutlined style={{ fontSize: 18 }} /> Entegrasyon Tanımlamaları
                                        </div>
                                        <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
                                            UETDS, WhatsApp ve e-posta bildirim altyapınızı buradan tanımlayın. Hassas bilgiler şifreli saklanır, formda asla geri gösterilmez.
                                        </p>
                                    </div>

                                    {integrationsLoading ? (
                                        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 22 }}>
                                            {/* UETDS Card */}
                                            <div style={{ border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', background: '#fff' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{
                                                            width: 42, height: 42, borderRadius: 12,
                                                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                                                        }}>
                                                            <SafetyCertificateOutlined />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>UETDS Ayarları</div>
                                                            <div style={{ fontSize: 12, color: '#64748b' }}>U-ETDS UNet kimlik bilgileri ve yetki belgesi</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {uetdsProfile?.uetdsEnabled ? (
                                                            <Tag color="green" style={{ margin: 0 }}>Yönetici tarafından aktif</Tag>
                                                        ) : (
                                                            <Tag color="default" style={{ margin: 0 }}>Yönetici onayı bekliyor</Tag>
                                                        )}
                                                        {uetdsProfile?.uetdsHasPassword && <Tag color="blue" style={{ margin: 0 }}>Kimlik kayıtlı</Tag>}
                                                        {uetdsProfile?.uetdsYetkiBelgeNo && <Tag color="purple" style={{ margin: 0 }}>YBN: {uetdsProfile.uetdsYetkiBelgeNo}</Tag>}
                                                    </div>
                                                </div>

                                                {!uetdsProfile?.uetdsEnabled && (
                                                    <Alert
                                                        showIcon
                                                        type="warning"
                                                        style={{ marginBottom: 12, borderRadius: 10 }}
                                                        message="UETDS yönetici tarafından aktif değil"
                                                        description="Yetki Belge Numaranız tanımlandığında UETDS bildirimi gönderebilirsiniz."
                                                    />
                                                )}

                                                <Form form={uetdsForm} layout="vertical">
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="UNet Kullanıcı Adı" name="unetUser" rules={[{ required: true, message: 'UNet kullanıcı adı zorunludur' }]}>
                                                                <Input prefix={<UserOutlined />} placeholder="UNet kullanıcı adı" size="large" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item
                                                                label={<span>UNet Şifresi {uetdsProfile?.uetdsHasPassword && <Tag color="green" style={{ marginLeft: 6 }}>kayıtlı</Tag>}</span>}
                                                                name="unetPassword"
                                                            >
                                                                <Input.Password prefix={<KeyOutlined />} placeholder={uetdsProfile?.uetdsHasPassword ? 'Yenilemek için yeni şifre girin' : 'Şifre girin'} size="large" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                        <Button type="primary" onClick={handleSaveUetds} loading={savingUetds} icon={<SaveOutlined />}>
                                                            Kaydet
                                                        </Button>
                                                        <Button onClick={handleTestUetds} loading={testingUetds} icon={<ExperimentOutlined />} disabled={!uetdsProfile?.uetdsHasPassword}>
                                                            Bağlantıyı Test Et
                                                        </Button>
                                                    </div>
                                                    {uetdsTestResult && (
                                                        <Alert
                                                            showIcon
                                                            style={{ marginTop: 12, borderRadius: 10 }}
                                                            type={uetdsTestResult.success ? 'success' : 'error'}
                                                            message={uetdsTestResult.success ? 'Bağlantı başarılı' : 'Bağlantı hatalı'}
                                                            description={uetdsTestResult.message}
                                                        />
                                                    )}
                                                </Form>
                                            </div>

                                            {/* WhatsApp Card */}
                                            <div style={{ border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', background: '#fff' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{
                                                            width: 42, height: 42, borderRadius: 12,
                                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                                                        }}>
                                                            <WhatsAppOutlined />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>WhatsApp API Ayarları</div>
                                                            <div style={{ fontSize: 12, color: '#64748b' }}>Meta Cloud API, Green API veya özel webhook sağlayıcı</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {whatsapp?.enabled ? <Tag color="green" style={{ margin: 0 }}>Aktif</Tag> : <Tag color="default" style={{ margin: 0 }}>Pasif</Tag>}
                                                        <Tag color="blue" style={{ margin: 0 }}>{whatsapp?.provider || 'META'}</Tag>
                                                    </div>
                                                </div>

                                                <Form
                                                    form={whatsappForm}
                                                    layout="vertical"
                                                    onValuesChange={(changed) => {
                                                        if (changed.provider) setWhatsappProvider(changed.provider);
                                                    }}
                                                >
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={8}>
                                                            <Form.Item label="Sağlayıcı" name="provider">
                                                                <Select size="large" style={{ borderRadius: 10 }} options={[
                                                                    { value: 'META', label: 'Meta Cloud API (Resmi)' },
                                                                    { value: 'GREEN', label: 'Green API' },
                                                                    { value: 'WEBHOOK', label: 'Özel Webhook' },
                                                                ]} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={12} md={8}>
                                                            <Form.Item label="Varsayılan Ülke Kodu" name="defaultCountryCode">
                                                                <Input size="large" placeholder="90" prefix="+" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={12} md={8}>
                                                            <Form.Item label="Aktif" name="enabled" valuePropName="checked">
                                                                <Select size="large" style={{ borderRadius: 10 }} options={[
                                                                    { value: true, label: 'Açık' },
                                                                    { value: false, label: 'Kapalı' },
                                                                ]} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>

                                                    {whatsappProvider === 'META' && (
                                                        <Row gutter={12}>
                                                            <Col xs={24} md={12}>
                                                                <Form.Item label="Phone Number ID" name="metaPhoneNumberId">
                                                                    <Input size="large" placeholder="123456789012345" style={{ borderRadius: 10 }} />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col xs={24} md={12}>
                                                                <Form.Item
                                                                    label={<span>Access Token {whatsapp?.hasMetaAccessToken && <Tag color="green" style={{ marginLeft: 6 }}>kayıtlı</Tag>}</span>}
                                                                    name="metaAccessToken"
                                                                >
                                                                    <Input.Password size="large" placeholder={whatsapp?.hasMetaAccessToken ? 'Yenilemek için yeni token' : 'Bearer token'} style={{ borderRadius: 10 }} />
                                                                </Form.Item>
                                                            </Col>
                                                        </Row>
                                                    )}
                                                    {whatsappProvider === 'GREEN' && (
                                                        <Row gutter={12}>
                                                            <Col xs={24} md={12}>
                                                                <Form.Item label="Instance ID" name="greenInstanceId">
                                                                    <Input size="large" placeholder="1101000001" style={{ borderRadius: 10 }} />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col xs={24} md={12}>
                                                                <Form.Item
                                                                    label={<span>API Token {whatsapp?.hasGreenApiToken && <Tag color="green" style={{ marginLeft: 6 }}>kayıtlı</Tag>}</span>}
                                                                    name="greenApiToken"
                                                                >
                                                                    <Input.Password size="large" placeholder={whatsapp?.hasGreenApiToken ? 'Yenilemek için yeni token' : 'API token'} style={{ borderRadius: 10 }} />
                                                                </Form.Item>
                                                            </Col>
                                                        </Row>
                                                    )}
                                                    {whatsappProvider === 'WEBHOOK' && (
                                                        <Row gutter={12}>
                                                            <Col xs={24} md={12}>
                                                                <Form.Item label="Webhook URL" name="webhookUrl">
                                                                    <Input size="large" placeholder="https://api.firmaniz.com/whatsapp" style={{ borderRadius: 10 }} />
                                                                </Form.Item>
                                                            </Col>
                                                            <Col xs={24} md={12}>
                                                                <Form.Item
                                                                    label={<span>Gizli Anahtar {whatsapp?.hasWebhookSecret && <Tag color="green" style={{ marginLeft: 6 }}>kayıtlı</Tag>}</span>}
                                                                    name="webhookSecret"
                                                                >
                                                                    <Input.Password size="large" placeholder={whatsapp?.hasWebhookSecret ? 'Yenilemek için yeni gizli anahtar' : 'X-Webhook-Secret değeri'} style={{ borderRadius: 10 }} />
                                                                </Form.Item>
                                                            </Col>
                                                        </Row>
                                                    )}

                                                    <Row gutter={12}>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="Voucher Otomatik Gönder" name="autoSendVoucher" valuePropName="checked">
                                                                <Select size="large" style={{ borderRadius: 10 }} options={[
                                                                    { value: true, label: 'Açık' },
                                                                    { value: false, label: 'Kapalı' },
                                                                ]} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>

                                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                        <Button type="primary" onClick={handleSaveWhatsapp} loading={savingWhatsapp} icon={<SaveOutlined />}>
                                                            Kaydet
                                                        </Button>
                                                        <Button
                                                            onClick={() => setWhatsappTestModal({ open: true, phone: '' })}
                                                            icon={<ExperimentOutlined />}
                                                            disabled={!whatsapp?.enabled}
                                                        >
                                                            Test Mesajı Gönder
                                                        </Button>
                                                    </div>
                                                </Form>
                                            </div>

                                            {/* Email Card */}
                                            <div style={{ border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', background: '#fff' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{
                                                            width: 42, height: 42, borderRadius: 12,
                                                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                                                        }}>
                                                            <MailOutlined />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>E-posta (SMTP) Ayarları</div>
                                                            <div style={{ fontSize: 12, color: '#64748b' }}>Voucher ve müşteri bildirimleri için SMTP yapılandırması</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {emailCfg?.enabled ? <Tag color="green" style={{ margin: 0 }}>Aktif</Tag> : <Tag color="default" style={{ margin: 0 }}>Pasif</Tag>}
                                                        {emailCfg?.hasSmtpPass && <Tag color="blue" style={{ margin: 0 }}>Kimlik kayıtlı</Tag>}
                                                    </div>
                                                </div>

                                                <Form form={emailForm} layout="vertical">
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="SMTP Sunucu" name="smtpHost" rules={[{ required: true, message: 'Host zorunlu' }]}>
                                                                <Input size="large" placeholder="smtp.firma.com" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={12} md={6}>
                                                            <Form.Item label="Port" name="smtpPort" rules={[{ required: true }]}>
                                                                <Input size="large" placeholder="587" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={12} md={6}>
                                                            <Form.Item label="SSL/TLS" name="smtpSecure" valuePropName="checked">
                                                                <Select size="large" style={{ borderRadius: 10 }} options={[
                                                                    { value: true, label: 'SSL (465)' },
                                                                    { value: false, label: 'STARTTLS (587)' },
                                                                ]} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="SMTP Kullanıcı" name="smtpUser" rules={[{ required: true }]}>
                                                                <Input size="large" placeholder="info@firma.com" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item
                                                                label={<span>SMTP Şifre {emailCfg?.hasSmtpPass && <Tag color="green" style={{ marginLeft: 6 }}>kayıtlı</Tag>}</span>}
                                                                name="smtpPass"
                                                            >
                                                                <Input.Password size="large" placeholder={emailCfg?.hasSmtpPass ? 'Yenilemek için yeni şifre' : 'SMTP şifresi'} style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="Gönderen E-posta" name="senderEmail" rules={[{ type: 'email', message: 'Geçerli e-posta girin' }]}>
                                                                <Input size="large" placeholder="bilgi@firma.com" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="Gönderen Adı" name="senderName">
                                                                <Input size="large" placeholder="Firma Adı" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={12}>
                                                        <Col xs={24} md={12}>
                                                            <Form.Item label="Yanıt Adresi (Reply-To)" name="replyTo" rules={[{ type: 'email', message: 'Geçerli e-posta girin' }]}>
                                                                <Input size="large" placeholder="destek@firma.com" style={{ borderRadius: 10 }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={24} md={6}>
                                                            <Form.Item label="Aktif" name="enabled" valuePropName="checked">
                                                                <Select size="large" style={{ borderRadius: 10 }} options={[
                                                                    { value: true, label: 'Açık' },
                                                                    { value: false, label: 'Kapalı' },
                                                                ]} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col xs={24} md={6}>
                                                            <Form.Item label="Voucher Otomatik Gönder" name="autoSendVoucher" valuePropName="checked">
                                                                <Select size="large" style={{ borderRadius: 10 }} options={[
                                                                    { value: true, label: 'Açık' },
                                                                    { value: false, label: 'Kapalı' },
                                                                ]} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>

                                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                        <Button type="primary" onClick={handleSaveEmail} loading={savingEmail} icon={<SaveOutlined />}>
                                                            Kaydet
                                                        </Button>
                                                        <Button
                                                            onClick={() => setEmailTestModal({ open: true, to: '' })}
                                                            icon={<ExperimentOutlined />}
                                                            disabled={!emailCfg?.enabled || !emailCfg?.hasSmtpPass}
                                                        >
                                                            Test E-postası Gönder
                                                        </Button>
                                                    </div>
                                                </Form>
                                            </div>
                                        </div>
                                    )}
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
                    {/* WhatsApp Test Modal */}
                    <Modal
                        open={whatsappTestModal.open}
                        title="WhatsApp Test Mesajı"
                        onCancel={() => setWhatsappTestModal({ open: false, phone: '' })}
                        onOk={handleTestWhatsapp}
                        confirmLoading={testingWhatsapp}
                        okText="Gönder"
                        cancelText="Vazgeç"
                    >
                        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
                            Test mesajı, tanımladığınız sağlayıcı (<b>{whatsapp?.provider || 'META'}</b>) üzerinden hedef numaraya gönderilir.
                        </p>
                        <Input
                            size="large"
                            prefix={<WhatsAppOutlined style={{ color: '#22c55e' }} />}
                            placeholder="+90 555 123 45 67"
                            value={whatsappTestModal.phone}
                            onChange={(e) => setWhatsappTestModal({ ...whatsappTestModal, phone: e.target.value })}
                            style={{ borderRadius: 10 }}
                        />
                    </Modal>

                    {/* Email Test Modal */}
                    <Modal
                        open={emailTestModal.open}
                        title="SMTP Test E-postası"
                        onCancel={() => setEmailTestModal({ open: false, to: '' })}
                        onOk={handleTestEmail}
                        confirmLoading={testingEmail}
                        okText="Gönder"
                        cancelText="Vazgeç"
                    >
                        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
                            Tanımladığınız SMTP sunucusu üzerinden hedef adrese kısa bir test e-postası gönderilir.
                        </p>
                        <Input
                            size="large"
                            prefix={<MailOutlined style={{ color: '#6366f1' }} />}
                            placeholder="test@firmaniz.com"
                            value={emailTestModal.to}
                            onChange={(e) => setEmailTestModal({ ...emailTestModal, to: e.target.value })}
                            style={{ borderRadius: 10 }}
                        />
                    </Modal>

                    {/* Driver Modal */}
                    <Modal
                        open={isDriverModalVisible}
                        title={null}
                        footer={null}
                        onCancel={() => setIsDriverModalVisible(false)}
                        centered
                        width={480}
                        styles={{ body: { padding: 0 } }}
                    >
                        <div style={{ padding: '28px 28px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 14,
                                    background: editingDriver ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 22, boxShadow: `0 6px 16px ${editingDriver ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`,
                                }}>
                                    <TeamOutlined />
                                </div>
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{editingDriver ? 'Şoför Düzenle' : 'Yeni Şoför Ekle'}</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>{editingDriver ? 'Şoför bilgilerini güncelleyin' : 'Ekibinize yeni bir şoför ekleyin'}</div>
                                </div>
                            </div>

                            <Form form={driverForm} layout="vertical" requiredMark={false}>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Ad</span>}
                                            name="firstName"
                                            rules={[{ required: true, message: 'Ad zorunludur' }]}
                                        >
                                            <Input placeholder="Mehmet" size="large" style={{ borderRadius: 12 }} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Soyad</span>}
                                            name="lastName"
                                            rules={[{ required: true, message: 'Soyad zorunludur' }]}
                                        >
                                            <Input placeholder="Demir" size="large" style={{ borderRadius: 12 }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item
                                    label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>E-posta</span>}
                                    name="email"
                                    rules={[
                                        { required: !editingDriver, message: 'E-posta zorunludur' },
                                        { type: 'email', message: 'Geçerli e-posta girin' },
                                    ]}
                                >
                                    <Input placeholder="sofor@ornek.com" size="large" style={{ borderRadius: 12 }} disabled={!!editingDriver} prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                                <Form.Item
                                    label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Telefon</span>}
                                    name="phone"
                                >
                                    <Input placeholder="+90 555 123 45 67" size="large" style={{ borderRadius: 12 }} prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                                {!editingDriver ? (
                                    <Form.Item
                                        label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Giriş Şifresi</span>}
                                        name="password"
                                        rules={[{ required: true, message: 'Şifre zorunludur' }, { min: 6, message: 'En az 6 karakter' }]}
                                    >
                                        <Input.Password placeholder="Güçlü bir şifre belirleyin" size="large" style={{ borderRadius: 12 }} />
                                    </Form.Item>
                                ) : (
                                    <Form.Item
                                        label={<span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Yeni Şifre <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsiyonel)</span></span>}
                                        name="newPassword"
                                        rules={[{ min: 6, message: 'En az 6 karakter' }]}
                                    >
                                        <Input.Password placeholder="Değiştirmek isterseniz" size="large" style={{ borderRadius: 12 }} />
                                    </Form.Item>
                                )}

                                <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingBottom: 16 }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsDriverModalVisible(false)}
                                        style={{
                                            flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 12,
                                            background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveDriver}
                                        disabled={savingDriver}
                                        style={{
                                            flex: 2, padding: '12px', border: 'none', borderRadius: 12,
                                            background: savingDriver ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: savingDriver ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                        }}
                                    >
                                        {savingDriver ? <Spin size="small" /> : <><CheckCircleOutlined /> {editingDriver ? 'Güncelle' : 'Şoför Ekle'}</>}
                                    </button>
                                </div>
                            </Form>
                        </div>
                    </Modal>
                </div>
    </>
    );
}
