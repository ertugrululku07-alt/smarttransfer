'use client';

import React, { useState, useEffect } from 'react';
import {
    Card, Form, Input, Button, Table, Tag, message, Modal, Spin, Alert,
    Tabs, Space, Tooltip, Popconfirm, Typography, Divider, Select, Badge
} from 'antd';
import {
    SafetyCertificateOutlined, KeyOutlined, SendOutlined, StopOutlined,
    CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, EyeOutlined,
    InfoCircleOutlined, LinkOutlined, ExclamationCircleOutlined,
    UserOutlined, CarOutlined, IdcardOutlined, PhoneOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const { Text, Title } = Typography;

interface Profile {
    uetdsEnabled: boolean;
    uetdsUnetUser: string | null;
    uetdsHasPassword: boolean;
    uetdsYetkiBelgeNo: string | null;
    uetdsYetkiBelgeTuru: string | null;
    uetdsServiceUrl: string | null;
}

interface Submission {
    id: string;
    bookingId: string | null;
    vehicleId: string | null;
    driverId: string | null;
    uetdsSeferId: string | null;
    uetdsRefNo: string | null;
    status: 'PENDING' | 'SENT' | 'REJECTED' | 'CANCELLED';
    errorMessage: string | null;
    request: any;
    response: any;
    submittedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    booking?: {
        id: string;
        bookingNumber: string;
        contactName: string;
        startDate: string;
        metadata?: any;
    } | null;
}

interface Booking {
    id: string;
    bookingNumber: string;
    contactName: string;
    startDate: string;
    metadata?: any;
}

const statusColors: Record<string, string> = {
    PENDING: 'orange',
    SENT: 'green',
    REJECTED: 'red',
    CANCELLED: 'default',
};

const statusLabels: Record<string, string> = {
    PENDING: 'Bekliyor',
    SENT: 'Gönderildi',
    REJECTED: 'Reddedildi',
    CANCELLED: 'İptal Edildi',
};

const PartnerUetdsPage: React.FC = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('submissions');

    // Credential form
    const [credForm] = Form.useForm();
    const [savingCreds, setSavingCreds] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Submit modal
    const [submitModalOpen, setSubmitModalOpen] = useState(false);
    const [submitForm] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // Detail modal
    const [detailModal, setDetailModal] = useState<Submission | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [profileRes, subsRes, bookingsRes, vehiclesRes, driversRes] = await Promise.all([
                apiClient.get('/api/transfer/partner/profile'),
                apiClient.get('/api/transfer/partner/uetds-submissions').catch(() => ({ data: { success: false } })),
                apiClient.get('/api/transfer/partner/active-bookings').catch(() => ({ data: { success: false } })),
                apiClient.get('/api/transfer/partner/my-vehicles').catch(() => ({ data: { success: false } })),
                apiClient.get('/api/transfer/partner/my-drivers').catch(() => ({ data: { success: false } })),
            ]);
            if (profileRes.data?.success) setProfile(profileRes.data.data);
            if (subsRes.data?.success) setSubmissions(subsRes.data.data || []);
            if (bookingsRes.data?.success) setBookings(bookingsRes.data.data || []);
            if (vehiclesRes.data?.success) setVehicles(vehiclesRes.data.data?.vehicles || vehiclesRes.data.data || []);
            if (driversRes.data?.success) setDrivers(driversRes.data.data || []);
        } catch (e) {
            console.error('Load error', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleSaveCredentials = async () => {
        try {
            const values = await credForm.validateFields();
            setSavingCreds(true);
            const res = await apiClient.put('/api/transfer/partner/uetds-credentials', {
                unetUser: values.unetUser,
                unetPassword: values.unetPassword,
            });
            if (res.data.success) {
                message.success('UETDS kimlik bilgileri kaydedildi');
                credForm.setFieldValue('unetPassword', '');
                loadData();
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.error || 'Kaydetme başarısız');
        } finally {
            setSavingCreds(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await apiClient.post('/api/transfer/partner/uetds-test');
            setTestResult({ success: res.data.success, message: res.data.message });
        } catch (e: any) {
            setTestResult({ success: false, message: e?.response?.data?.error || e?.response?.data?.message || 'Bağlantı testi başarısız' });
        } finally {
            setTesting(false);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await submitForm.validateFields();
            setSubmitting(true);

            // Find selected vehicle plate
            const vehicle = vehicles.find((v: any) => v.id === values.vehicleId);
            // Find selected driver info
            const driver = drivers.find((d: any) => d.id === values.driverId);

            const payload: any = {
                bookingId: values.bookingId,
                vehiclePlate: vehicle?.plateNumber || values.vehiclePlate || '',
                baslangicIl: values.baslangicIl || '',
                baslangicIlce: values.baslangicIlce || '',
                bitisIl: values.bitisIl || '',
                bitisIlce: values.bitisIlce || '',
            };

            // Passenger info
            if (values.passengerFirstName) {
                payload.passengerTc = values.passengerTc || '';
                payload.passengerFirstName = values.passengerFirstName;
                payload.passengerLastName = values.passengerLastName || '';
                payload.passengerGender = values.passengerGender || '1';
                payload.passengerPhone = values.passengerPhone || '';
                payload.passengerNationality = values.passengerNationality || 'TC';
            }

            // Driver info
            if (values.driverTc || driver) {
                payload.driverTc = values.driverTc || '';
                payload.driverFirstName = values.driverFirstName || driver?.firstName || '';
                payload.driverLastName = values.driverLastName || driver?.lastName || '';
                payload.driverGender = values.driverGender || '1';
                payload.driverPhone = values.driverPhone || driver?.phone || '';
            }

            const res = await apiClient.post('/api/transfer/partner/uetds-submit', payload);
            if (res.data.success) {
                message.success(`UETDS seferi oluşturuldu! Sefer ID: ${res.data.data?.uetdsSeferId || '-'}`);
                setSubmitModalOpen(false);
                submitForm.resetFields();
                loadData();
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.error || 'UETDS bildirimi başarısız');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (submissionId: string) => {
        try {
            const res = await apiClient.post('/api/transfer/partner/uetds-cancel', { submissionId });
            if (res.data.success) {
                message.success('UETDS seferi iptal edildi');
                loadData();
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'İptal başarısız');
        }
    };

    // Auto-fill passenger info when booking is selected
    const handleBookingSelect = (bookingId: string) => {
        const b = bookings.find(x => x.id === bookingId);
        if (b) {
            const nameParts = (b.contactName || '').split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            submitForm.setFieldsValue({
                passengerFirstName: firstName,
                passengerLastName: lastName,
                passengerPhone: (b.metadata as any)?.contactPhone || '',
            });
        }
    };

    const columns = [
        {
            title: 'Rezervasyon',
            key: 'booking',
            width: 200,
            render: (_: any, row: Submission) => (
                <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{row.booking?.bookingNumber || '-'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{row.booking?.contactName || '-'}</div>
                    {row.booking?.startDate && (
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{dayjs(row.booking.startDate).format('DD.MM.YYYY HH:mm')}</div>
                    )}
                </div>
            )
        },
        {
            title: 'UETDS Sefer ID',
            dataIndex: 'uetdsSeferId',
            key: 'seferId',
            width: 150,
            render: (val: string | null) => val ? (
                <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 12 }}>{val}</Tag>
            ) : <Text type="secondary">-</Text>
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: string) => (
                <Tag color={statusColors[status] || 'default'} icon={
                    status === 'SENT' ? <CheckCircleOutlined /> :
                    status === 'REJECTED' ? <CloseCircleOutlined /> :
                    status === 'CANCELLED' ? <StopOutlined /> :
                    <ExclamationCircleOutlined />
                }>
                    {statusLabels[status] || status}
                </Tag>
            )
        },
        {
            title: 'Tarih',
            key: 'date',
            width: 140,
            render: (_: any, row: Submission) => (
                <div style={{ fontSize: 12 }}>
                    {row.submittedAt ? dayjs(row.submittedAt).format('DD.MM.YYYY HH:mm') : dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}
                </div>
            )
        },
        {
            title: 'Hata',
            dataIndex: 'errorMessage',
            key: 'error',
            width: 200,
            render: (val: string | null) => val ? (
                <Tooltip title={val}>
                    <Text type="danger" style={{ fontSize: 11 }} ellipsis>{val}</Text>
                </Tooltip>
            ) : null
        },
        {
            title: 'İşlem',
            key: 'actions',
            width: 140,
            render: (_: any, row: Submission) => (
                <Space size={4}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(row)}>
                        Detay
                    </Button>
                    {row.status === 'SENT' && (
                        <Popconfirm
                            title="Bu UETDS seferini iptal etmek istediğinize emin misiniz?"
                            onConfirm={() => handleCancel(row.id)}
                        >
                            <Button size="small" danger icon={<StopOutlined />}>İptal</Button>
                        </Popconfirm>
                    )}
                </Space>
            )
        },
    ];

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 100 }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16, color: '#64748b' }}>Veriler yükleniyor...</div>
                    </div>
        );
    }

    if (!profile?.uetdsEnabled) {
        return (
            <div style={{ maxWidth: 600, margin: '60px auto' }}>
                        <Card style={{ borderRadius: 16, textAlign: 'center' }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}>
                                <SafetyCertificateOutlined style={{ fontSize: 36, color: '#f59e0b' }} />
                            </div>
                            <Title level={4} style={{ color: '#0f172a' }}>UETDS Aktif Değil</Title>
                            <Text type="secondary" style={{ fontSize: 14 }}>
                                UETDS modülü henüz yönetici tarafından sizin için aktifleştirilmemiştir.
                                Lütfen sistem yöneticisiyle iletişime geçin.
                            </Text>
                        </Card>
                    </div>
        );
    }

    const sentCount = submissions.filter(s => s.status === 'SENT').length;
    const rejectedCount = submissions.filter(s => s.status === 'REJECTED').length;

    return (
        <div className="partner-page">
                    <div className="ps-page-header">
                        <div>
                            <h1 className="ps-page-header__title">
                                <SafetyCertificateOutlined style={{ color: '#10b981', marginRight: 8 }} />
                                UETDS Yönetimi
                            </h1>
                            <p className="ps-page-header__subtitle">
                                Sefer bildirimi, kimlik doğrulama ve gönderim takibi
                            </p>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={loadData}>Yenile</Button>
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                onClick={() => setSubmitModalOpen(true)}
                            >
                                Sefer Bildir
                            </Button>
                        </Space>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                        {[
                            { label: 'Toplam Bildirim', value: submissions.length, color: '#6366f1', bg: '#eef2ff' },
                            { label: 'Gönderildi', value: sentCount, color: '#10b981', bg: '#ecfdf5' },
                            { label: 'Reddedildi', value: rejectedCount, color: '#ef4444', bg: '#fef2f2' },
                            { label: 'Yetki Belge No', value: profile?.uetdsYetkiBelgeNo || '-', color: '#f59e0b', bg: '#fffbeb', isText: true },
                        ].map((s, i) => (
                            <Card key={i} size="small" style={{ borderRadius: 12, border: '1px solid #e5e7eb' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
                                <div style={{ fontSize: (s as any).isText ? 14 : 24, fontWeight: 800, color: s.color, marginTop: 4 }}>
                                    {s.value}
                                </div>
                            </Card>
                        ))}
                    </div>

                    <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                        {
                            key: 'submissions',
                            label: <span><SendOutlined /> Bildirimler <Badge count={sentCount} style={{ marginLeft: 6, backgroundColor: '#10b981' }} /></span>,
                            children: (
                                <Card size="small" style={{ borderRadius: 14 }} bodyStyle={{ padding: 0 }}>
                                    <Table
                                        rowKey="id"
                                        dataSource={submissions}
                                        columns={columns}
                                        pagination={{ pageSize: 15, size: 'small' }}
                                        scroll={{ x: 900 }}
                                        size="small"
                                        locale={{ emptyText: 'Henüz UETDS bildirimi yok' }}
                                    />
                                </Card>
                            )
                        },
                        {
                            key: 'credentials',
                            label: <span><KeyOutlined /> Kimlik Bilgileri</span>,
                            children: (
                                <div style={{ maxWidth: 600 }}>
                                    <Card
                                        size="small"
                                        style={{ borderRadius: 14, marginBottom: 16 }}
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <KeyOutlined style={{ color: '#6366f1' }} />
                                                <span style={{ fontWeight: 700 }}>UNet Giriş Bilgileri</span>
                                                {profile?.uetdsHasPassword && (
                                                    <Tag color="green" style={{ marginLeft: 'auto' }}>
                                                        <CheckCircleOutlined /> Kayıtlı
                                                    </Tag>
                                                )}
                                            </div>
                                        }
                                    >
                                        <Alert
                                            type="info"
                                            showIcon
                                            icon={<InfoCircleOutlined />}
                                            message="UNet kullanıcı adı ve şifrenizi girin. Şifre AES-256 ile şifrelenerek saklanır."
                                            style={{ marginBottom: 16, borderRadius: 10 }}
                                        />
                                        <Form form={credForm} layout="vertical" initialValues={{ unetUser: profile?.uetdsUnetUser || '' }}>
                                            <Form.Item
                                                name="unetUser"
                                                label={<span style={{ fontWeight: 600 }}>UNet Kullanıcı Adı</span>}
                                                rules={[{ required: true, message: 'Zorunlu' }]}
                                            >
                                                <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="UNet kullanıcı adınız" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                            <Form.Item
                                                name="unetPassword"
                                                label={<span style={{ fontWeight: 600 }}>UNet Şifre</span>}
                                                rules={[{ required: true, message: 'Zorunlu' }]}
                                            >
                                                <Input.Password placeholder={profile?.uetdsHasPassword ? '••••••• (yeni şifre girin)' : 'UNet şifreniz'} size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                            <Space>
                                                <Button type="primary" icon={<CheckCircleOutlined />} loading={savingCreds} onClick={handleSaveCredentials} style={{ borderRadius: 10, background: '#10b981', borderColor: '#10b981' }}>
                                                    Kaydet
                                                </Button>
                                                <Button icon={<LinkOutlined />} loading={testing} onClick={handleTestConnection} style={{ borderRadius: 10 }} disabled={!profile?.uetdsHasPassword}>
                                                    Bağlantı Test Et
                                                </Button>
                                            </Space>
                                            {testResult && (
                                                <Alert
                                                    type={testResult.success ? 'success' : 'error'}
                                                    message={testResult.message}
                                                    showIcon
                                                    style={{ marginTop: 16, borderRadius: 10 }}
                                                />
                                            )}
                                        </Form>
                                    </Card>

                                    <Card size="small" style={{ borderRadius: 14 }} title={<span style={{ fontWeight: 700 }}><InfoCircleOutlined style={{ color: '#3b82f6' }} /> Yetki Bilgileri (Salt Okunur)</span>}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>Yetki Belge No</Text>
                                                <div style={{ fontWeight: 600, fontSize: 14 }}>{profile?.uetdsYetkiBelgeNo || <Text type="secondary">Tanımsız</Text>}</div>
                                            </div>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>Belge Türü</Text>
                                                <div style={{ fontWeight: 600, fontSize: 14 }}>{profile?.uetdsYetkiBelgeTuru || <Text type="secondary">Tanımsız</Text>}</div>
                                            </div>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>Servis URL</Text>
                                                <div style={{ fontWeight: 600, fontSize: 12, wordBreak: 'break-all' }}>{profile?.uetdsServiceUrl || <Text type="secondary">Varsayılan</Text>}</div>
                                            </div>
                                        </div>
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="Yetki bilgileri yönetici tarafından ayarlanır. Değişiklik için yöneticinize başvurun."
                                            style={{ marginTop: 12, borderRadius: 10 }}
                                        />
                                    </Card>
                                </div>
                            )
                        },
                    ]} />

                    {/* ── Submit Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <SendOutlined style={{ color: '#10b981' }} />
                                <span style={{ fontWeight: 700 }}>UETDS Sefer Bildirimi</span>
                            </div>
                        }
                        open={submitModalOpen}
                        onCancel={() => { setSubmitModalOpen(false); submitForm.resetFields(); }}
                        onOk={handleSubmit}
                        confirmLoading={submitting}
                        okText="Bildir"
                        cancelText="İptal"
                        width={720}
                        okButtonProps={{ style: { background: '#10b981', borderColor: '#10b981' } }}
                    >
                        <Form form={submitForm} layout="vertical" style={{ marginTop: 12 }}>
                            {/* Booking & Vehicle */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Form.Item
                                    name="bookingId"
                                    label={<span style={{ fontWeight: 600 }}>Rezervasyon</span>}
                                    rules={[{ required: true, message: 'Zorunlu' }]}
                                >
                                    <Select
                                        placeholder="Rezervasyon seçin"
                                        showSearch
                                        optionFilterProp="label"
                                        onChange={handleBookingSelect}
                                        options={bookings.map(b => ({
                                            value: b.id,
                                            label: `${b.bookingNumber} — ${b.contactName} (${dayjs(b.startDate).format('DD.MM HH:mm')})`,
                                        }))}
                                    />
                                </Form.Item>
                                <Form.Item
                                    name="vehicleId"
                                    label={<span style={{ fontWeight: 600 }}>Araç</span>}
                                    rules={[{ required: true, message: 'Zorunlu' }]}
                                >
                                    <Select
                                        placeholder="Araç seçin (plaka)"
                                        options={vehicles.map((v: any) => ({
                                            value: v.id,
                                            label: `${v.plateNumber} — ${v.brand} ${v.model}`,
                                        }))}
                                    />
                                </Form.Item>
                            </div>

                            <Divider style={{ margin: '8px 0 12px' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Güzergah İl / İlçe</Text>
                            </Divider>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                                <Form.Item name="baslangicIl" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Başlangıç İl</span>}>
                                    <Input placeholder="Antalya" />
                                </Form.Item>
                                <Form.Item name="baslangicIlce" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Başlangıç İlçe</span>}>
                                    <Input placeholder="Muratpaşa" />
                                </Form.Item>
                                <Form.Item name="bitisIl" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Bitiş İl</span>}>
                                    <Input placeholder="Antalya" />
                                </Form.Item>
                                <Form.Item name="bitisIlce" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Bitiş İlçe</span>}>
                                    <Input placeholder="Alanya" />
                                </Form.Item>
                            </div>

                            <Divider style={{ margin: '8px 0 12px' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}><UserOutlined /> Yolcu Bilgileri</Text>
                            </Divider>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <Form.Item name="passengerFirstName" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Yolcu Adı</span>}>
                                    <Input placeholder="Ali" />
                                </Form.Item>
                                <Form.Item name="passengerLastName" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Yolcu Soyadı</span>}>
                                    <Input placeholder="Yılmaz" />
                                </Form.Item>
                                <Form.Item name="passengerTc" label={<span style={{ fontWeight: 600, fontSize: 12 }}>TC Kimlik No</span>}>
                                    <Input placeholder="11111111111" maxLength={11} />
                                </Form.Item>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <Form.Item name="passengerGender" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Cinsiyet</span>} initialValue="1">
                                    <Select options={[{ value: '1', label: 'Erkek' }, { value: '2', label: 'Kadın' }]} />
                                </Form.Item>
                                <Form.Item name="passengerPhone" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Telefon</span>}>
                                    <Input placeholder="+90 555 ..." />
                                </Form.Item>
                                <Form.Item name="passengerNationality" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Uyruk</span>} initialValue="TC">
                                    <Select options={[{ value: 'TC', label: 'T.C.' }, { value: 'YABANCI', label: 'Yabancı' }]} />
                                </Form.Item>
                            </div>

                            <Divider style={{ margin: '8px 0 12px' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}><CarOutlined /> Şoför Bilgileri</Text>
                            </Divider>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Form.Item name="driverId" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Şoför (Listeden Seç)</span>}>
                                    <Select
                                        allowClear
                                        placeholder="Şoför seçin"
                                        onChange={(val) => {
                                            if (val) {
                                                const d = drivers.find((x: any) => x.id === val);
                                                if (d) {
                                                    submitForm.setFieldsValue({
                                                        driverFirstName: d.firstName,
                                                        driverLastName: d.lastName,
                                                        driverPhone: d.phone || '',
                                                    });
                                                }
                                            }
                                        }}
                                        options={drivers.map((d: any) => ({
                                            value: d.id,
                                            label: d.fullName || `${d.firstName} ${d.lastName}`,
                                        }))}
                                    />
                                </Form.Item>
                                <Form.Item name="driverTc" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Şoför TC Kimlik</span>}>
                                    <Input placeholder="11111111111" maxLength={11} />
                                </Form.Item>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <Form.Item name="driverFirstName" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Şoför Adı</span>}>
                                    <Input placeholder="Mehmet" />
                                </Form.Item>
                                <Form.Item name="driverLastName" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Şoför Soyadı</span>}>
                                    <Input placeholder="Demir" />
                                </Form.Item>
                                <Form.Item name="driverGender" label={<span style={{ fontWeight: 600, fontSize: 12 }}>Cinsiyet</span>} initialValue="1">
                                    <Select options={[{ value: '1', label: 'Erkek' }, { value: '2', label: 'Kadın' }]} />
                                </Form.Item>
                            </div>
                        </Form>
                    </Modal>

                    {/* ── Detail Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <EyeOutlined style={{ color: '#6366f1' }} />
                                <span style={{ fontWeight: 700 }}>UETDS Bildirim Detayı</span>
                            </div>
                        }
                        open={!!detailModal}
                        onCancel={() => setDetailModal(null)}
                        footer={<Button onClick={() => setDetailModal(null)}>Kapat</Button>}
                        width={640}
                    >
                        {detailModal && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Durum</Text>
                                        <div><Tag color={statusColors[detailModal.status]}>{statusLabels[detailModal.status]}</Tag></div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>UETDS Sefer ID</Text>
                                        <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{detailModal.uetdsSeferId || '-'}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Referans No</Text>
                                        <div style={{ fontWeight: 600 }}>{detailModal.uetdsRefNo || '-'}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Rezervasyon</Text>
                                        <div style={{ fontWeight: 600 }}>{detailModal.booking?.bookingNumber || '-'}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Gönderim Tarihi</Text>
                                        <div>{detailModal.submittedAt ? dayjs(detailModal.submittedAt).format('DD.MM.YYYY HH:mm') : '-'}</div>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>İptal Tarihi</Text>
                                        <div>{detailModal.cancelledAt ? dayjs(detailModal.cancelledAt).format('DD.MM.YYYY HH:mm') : '-'}</div>
                                    </div>
                                </div>
                                {detailModal.errorMessage && (
                                    <Alert type="error" showIcon message={detailModal.errorMessage} style={{ marginBottom: 12, borderRadius: 10 }} />
                                )}
                                <Divider style={{ margin: '12px 0 8px' }}>Teknik Detay</Divider>
                                <div style={{ maxHeight: 200, overflow: 'auto', background: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {JSON.stringify(detailModal.response, null, 2)}
                                </div>
                            </div>
                        )}
                    </Modal>
                </div>
    );
};

export default PartnerUetdsPage;
