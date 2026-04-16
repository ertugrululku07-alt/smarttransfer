'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Table, Card, Tag, Button, Typography, message, Space, Avatar,
    Modal, Form, Input, Divider, Tooltip, Popconfirm, Badge, InputNumber,
    Select, Empty
} from 'antd';
import apiClient from '@/lib/api-client';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import {
    CheckOutlined, CloseOutlined, UserOutlined,
    PlusOutlined, DeleteOutlined, ReloadOutlined,
    CarOutlined, PhoneOutlined, MailOutlined, KeyOutlined, PercentageOutlined,
    SearchOutlined, TeamOutlined, ClockCircleOutlined,
    ExclamationCircleOutlined, CheckCircleOutlined, StopOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.locale('tr');

const { Title, Text } = Typography;
const { Option } = Select;

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    ACTIVE:    { label: 'Aktif',       color: '#10b981', bg: '#ecfdf5', icon: <CheckCircleOutlined /> },
    INACTIVE:  { label: 'Beklemede',   color: '#f59e0b', bg: '#fffbeb', icon: <ClockCircleOutlined /> },
    SUSPENDED: { label: 'Reddedildi',  color: '#ef4444', bg: '#fef2f2', icon: <StopOutlined /> },
    DELETED:   { label: 'Silindi',     color: '#94a3b8', bg: '#f1f5f9', icon: <DeleteOutlined /> },
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

    // Search & Filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const filteredData = useMemo(() => {
        return data.filter(p => {
            if (search) {
                const s = search.toLowerCase();
                const name = (p.fullName || `${p.firstName} ${p.lastName}`).toLowerCase();
                if (!name.includes(s) && !p.email?.toLowerCase().includes(s) && !p.phone?.includes(s)) return false;
            }
            if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
            return true;
        });
    }, [data, search, statusFilter]);

    const stats = useMemo(() => ({
        total: data.length,
        active: data.filter(d => d.status === 'ACTIVE').length,
        pending: data.filter(d => d.status === 'INACTIVE').length,
        rejected: data.filter(d => d.status === 'SUSPENDED').length,
        withVehicle: data.filter(d => d.vehicles && d.vehicles.length > 0).length,
    }), [data]);

    const columns = [
        {
            title: 'Sürücü',
            key: 'driver',
            width: 240,
            render: (_: any, r: Application) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar size={38} icon={<UserOutlined />}
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                            {r.fullName || `${r.firstName} ${r.lastName}`}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            Kayıt: {dayjs(r.createdAt).format('DD MMM YYYY')}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: 'İletişim',
            key: 'contact',
            width: 220,
            render: (_: any, r: Application) => (
                <div>
                    <div style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MailOutlined style={{ color: '#6366f1', fontSize: 10 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{r.email}</span>
                    </div>
                    {r.phone && (
                        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <PhoneOutlined style={{ color: '#6366f1', fontSize: 10 }} />
                            <span>{r.phone}</span>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Araç Bilgisi',
            key: 'vehicle',
            width: 200,
            render: (_: any, r: Application) => {
                if (!r.vehicles || r.vehicles.length === 0) {
                    return (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: '#f1f5f9', border: '1px solid #e2e8f0',
                            borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#94a3b8'
                        }}>
                            <CarOutlined /> Araç Tanımsız
                        </div>
                    );
                }
                const v = r.vehicles[0];
                return (
                    <div style={{
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        borderRadius: 8, padding: '6px 10px'
                    }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', letterSpacing: 0.5 }}>{v.plateNumber}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{v.brand} {v.model} ({v.year})</div>
                        {v.vehicleType && (
                            <div style={{
                                display: 'inline-block', marginTop: 3,
                                background: '#ede9fe', color: '#7c3aed', fontSize: 10,
                                fontWeight: 600, padding: '1px 8px', borderRadius: 10
                            }}>{v.vehicleType.name}</div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: string) => {
                const s = STATUS_CONFIG[status] || { label: status, color: '#94a3b8', bg: '#f1f5f9', icon: null };
                return (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: s.bg, border: `1px solid ${s.color}30`,
                        borderRadius: 20, padding: '3px 12px'
                    }}>
                        <span style={{ color: s.color, fontSize: 12 }}>{s.icon}</span>
                        <span style={{ fontWeight: 600, color: s.color, fontSize: 11 }}>{s.label}</span>
                    </div>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 200,
            render: (_: any, r: Application) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    {/* Beklemede → Onayla butonu */}
                    {r.status === 'INACTIVE' && (
                        <Tooltip title="Onayla">
                            <Popconfirm title="Bu partner sürücüyü onaylamak istiyor musunuz?"
                                onConfirm={() => handleApprove(r.id)} okText="Onayla" cancelText="İptal">
                                <Button size="small" type="text" icon={<CheckOutlined />}
                                    style={{ color: '#10b981', borderRadius: 6, fontWeight: 600 }} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {/* Beklemede → Reddet butonu */}
                    {r.status === 'INACTIVE' && (
                        <Tooltip title="Reddet">
                            <Popconfirm title="Bu başvuruyu reddetmek istiyor musunuz?"
                                onConfirm={() => handleReject(r.id)} okText="Reddet"
                                okButtonProps={{ danger: true }} cancelText="İptal">
                                <Button size="small" type="text" danger icon={<CloseOutlined />}
                                    style={{ borderRadius: 6 }} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {/* Aktif → Pasife Al */}
                    {r.status === 'ACTIVE' && (
                        <Tooltip title="Pasife Al">
                            <Popconfirm title="Bu partner sürücüyü pasife almak istiyor musunuz?"
                                onConfirm={() => handleReject(r.id)} okText="Evet" cancelText="İptal">
                                <Button size="small" type="text" icon={<StopOutlined />}
                                    style={{ color: '#f59e0b', borderRadius: 6 }} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {/* Reddedilmiş → Tekrar Onayla */}
                    {r.status === 'SUSPENDED' && (
                        <Tooltip title="Tekrar Onayla">
                            <Popconfirm title="Bu sürücüyü tekrar aktife almak istiyor musunuz?"
                                onConfirm={() => handleApprove(r.id)} okText="Aktife Al" cancelText="İptal">
                                <Button size="small" type="text" icon={<CheckCircleOutlined />}
                                    style={{ color: '#10b981', borderRadius: 6 }} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {/* Sil */}
                    <Tooltip title="Sil">
                        <Popconfirm title="Bu partner sürücüyü silmek istediğinize emin misiniz?"
                            onConfirm={() => handleDelete(r.id)} okText="Sil"
                            okButtonProps={{ danger: true }} cancelText="İptal">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />}
                                style={{ borderRadius: 6 }} />
                        </Popconfirm>
                    </Tooltip>
                </div>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="partner-applications">
                <div style={{ padding: '0 4px' }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 22, boxShadow: '0 4px 14px #6366f140'
                            }}><TeamOutlined /></div>
                            <div>
                                <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Partner Sürücü Yönetimi</Title>
                                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                    Başvuruları yönetin, onaylayın veya reddedin
                                </Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<PercentageOutlined />} onClick={() => setCommissionModalOpen(true)}
                                style={{ borderRadius: 8 }}>
                                Komisyon
                            </Button>
                            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}
                                style={{ borderRadius: 8 }} />
                            <Button type="primary" icon={<PlusOutlined />}
                                onClick={() => setAddModalOpen(true)}
                                style={{
                                    borderRadius: 8,
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    border: 'none', boxShadow: '0 2px 8px #6366f140'
                                }}>
                                Partner Sürücü Ekle
                            </Button>
                        </Space>
                    </div>

                    {/* ── Stats Cards ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                            { label: 'Toplam', value: stats.total, color: '#6366f1', icon: <TeamOutlined /> },
                            { label: 'Aktif', value: stats.active, color: '#10b981', icon: <CheckCircleOutlined /> },
                            { label: 'Beklemede', value: stats.pending, color: '#f59e0b', icon: <ClockCircleOutlined /> },
                            { label: 'Reddedildi', value: stats.rejected, color: '#ef4444', icon: <StopOutlined /> },
                            { label: 'Araçlı', value: stats.withVehicle, color: '#3b82f6', icon: <CarOutlined /> },
                        ].map((s, i) => (
                            <div key={i} style={{
                                background: `linear-gradient(135deg, ${s.color}08, ${s.color}15)`,
                                border: `1px solid ${s.color}25`, borderRadius: 12, padding: '12px 16px',
                                display: 'flex', alignItems: 'center', gap: 10
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10, background: `${s.color}18`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: s.color, fontSize: 16
                                }}>{s.icon}</div>
                                <div>
                                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{s.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Search & Filter Bar ── */}
                    <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 12, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Input
                                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                placeholder="Ad, e-posta veya telefon ara..."
                                style={{ width: 280, borderRadius: 8 }}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                allowClear
                            />
                            <Select value={statusFilter} style={{ width: 160 }} onChange={setStatusFilter}>
                                <Option value="ALL">Tüm Durum</Option>
                                <Option value="INACTIVE">🟡 Beklemede</Option>
                                <Option value="ACTIVE">🟢 Aktif</Option>
                                <Option value="SUSPENDED">🔴 Reddedildi</Option>
                            </Select>
                            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                                {filteredData.length} / {data.length} sürücü
                            </div>
                        </div>
                    </Card>

                    {/* ── Table ── */}
                    <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}>
                        <Table
                            dataSource={filteredData}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 10, showSizeChanger: false, size: 'small',
                                style: { padding: '0 16px' } }}
                            locale={{ emptyText: <Empty description="Henüz partner sürücü başvurusu yok" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                            size="middle"
                            style={{ borderRadius: 14, overflow: 'hidden' }}
                        />
                    </Card>
                </div>

                {/* ── Yeni Partner Sürücü Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16
                            }}><UserOutlined /></div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Yeni Partner Sürücü</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Sisteme yeni bir partner sürücü ekleyin</div>
                            </div>
                        </div>
                    }
                    open={addModalOpen}
                    onCancel={() => { setAddModalOpen(false); form.resetFields(); }}
                    onOk={handleAddSubmit}
                    confirmLoading={addLoading}
                    okText="Kaydet ve Oluştur"
                    cancelText="Vazgeç"
                    width={520}
                >
                    <div style={{ marginTop: 16 }}>
                        <Form form={form} layout="vertical" requiredMark="optional">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                                <Form.Item label="Ad" name="firstName"
                                    rules={[{ required: true, message: 'Ad zorunludur' }]}>
                                    <Input placeholder="Ali" />
                                </Form.Item>
                                <Form.Item label="Soyad" name="lastName"
                                    rules={[{ required: true, message: 'Soyad zorunludur' }]}>
                                    <Input placeholder="Yılmaz" />
                                </Form.Item>
                            </div>
                            <Form.Item label="E-posta" name="email"
                                rules={[
                                    { required: true, message: 'E-posta zorunludur' },
                                    { type: 'email', message: 'Geçerli bir e-posta girin' }
                                ]}>
                                <Input placeholder="ali@ornek.com" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                            </Form.Item>
                            <Form.Item label="Telefon" name="phone">
                                <Input placeholder="+90 555 000 00 00" prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                            </Form.Item>
                            <Form.Item label="Şifre" name="password"
                                rules={[
                                    { required: true, message: 'Şifre zorunludur' },
                                    { min: 6, message: 'En az 6 karakter olmalı' }
                                ]}>
                                <Input.Password placeholder="En az 6 karakter" prefix={<KeyOutlined style={{ color: '#94a3b8' }} />} />
                            </Form.Item>
                        </Form>
                        <div style={{
                            background: '#eff6ff', borderRadius: 10, padding: '10px 14px',
                            fontSize: 12, color: '#1e40af', border: '1px solid #bfdbfe',
                            display: 'flex', alignItems: 'center', gap: 8
                        }}>
                            <ExclamationCircleOutlined />
                            <span>Eklenen partner sürücü <strong>Beklemede</strong> durumunda oluşturulur. Onayladıktan sonra sisteme giriş yapabilir.</span>
                        </div>
                    </div>
                </Modal>

                {/* ── Komisyon Ayarları Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16
                            }}><PercentageOutlined /></div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Komisyon Ayarları</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Partner sürücü komisyon oranı</div>
                            </div>
                        </div>
                    }
                    open={commissionModalOpen}
                    onCancel={() => setCommissionModalOpen(false)}
                    onOk={handleSaveCommission}
                    confirmLoading={commissionSaving}
                    okText="Kaydet"
                    cancelText="Vazgeç"
                    width={420}
                >
                    <div style={{ marginTop: 16 }}>
                        <div style={{ marginBottom: 8 }}>
                            <Text strong style={{ fontSize: 13 }}>Genel Komisyon Oranı (%)</Text>
                        </div>
                        <InputNumber
                            min={0} max={100}
                            formatter={value => `% ${value}`}
                            parser={value => Number(value!.replace('%', '').trim()) as any}
                            style={{ width: '100%', borderRadius: 8 }}
                            size="large"
                            value={commissionRate}
                            onChange={(val) => setCommissionRate(val || 0)}
                        />
                        <div style={{
                            background: '#fffbeb', borderRadius: 10, padding: '10px 14px',
                            fontSize: 12, color: '#92400e', border: '1px solid #fde68a',
                            marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8
                        }}>
                            <ExclamationCircleOutlined style={{ marginTop: 2 }} />
                            <span>Bu oran, partnerlerin tamamladıkları transferlerden hesaplanan genel komisyon kesintisini temsil eder. Değişiklik yaparsanız yeni transferlerden itibaren geçerli olur.</span>
                        </div>
                    </div>
                </Modal>

            </AdminLayout>
        </AdminGuard>
    );
};

export default PartnerApplicationsPage;
