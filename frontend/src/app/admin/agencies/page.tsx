'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Table, Card, Button, Modal, Form, Input, Typography, message, Space,
    InputNumber, Popconfirm, Select, Tooltip, Avatar, Empty
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined,
    UserOutlined, PhoneOutlined, MailOutlined, KeyOutlined,
    SearchOutlined, CheckCircleOutlined, StopOutlined,
    ClockCircleOutlined, ShoppingCartOutlined, PercentageOutlined,
    ExclamationCircleOutlined, ReloadOutlined, ShopOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.locale('tr');

const { Title, Text } = Typography;
const { Option } = Select;

interface Agency {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
    commissionRate: number;
    status: string;
    createdAt: string;
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    ACTIVE:    { label: 'Aktif',          color: '#10b981', bg: '#ecfdf5', icon: <CheckCircleOutlined /> },
    INACTIVE:  { label: 'Pasif',          color: '#94a3b8', bg: '#f1f5f9', icon: <ClockCircleOutlined /> },
    SUSPENDED: { label: 'Askıya Alındı',  color: '#ef4444', bg: '#fef2f2', icon: <StopOutlined /> },
};

const AdminAgenciesPage = () => {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    // Search & Filter
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const fetchAgencies = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/admin/agencies');
            if (res.data.success) setAgencies(res.data.data);
        } catch {
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAgencies(); }, []);

    const filteredData = useMemo(() => {
        return agencies.filter(a => {
            if (search) {
                const s = search.toLowerCase();
                if (!a.name?.toLowerCase().includes(s) &&
                    !a.contactName?.toLowerCase().includes(s) &&
                    !a.email?.toLowerCase().includes(s) &&
                    !a.phone?.includes(s)) return false;
            }
            if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
            return true;
        });
    }, [agencies, search, statusFilter]);

    const stats = useMemo(() => ({
        total: agencies.length,
        active: agencies.filter(a => a.status === 'ACTIVE').length,
        inactive: agencies.filter(a => a.status === 'INACTIVE').length,
        suspended: agencies.filter(a => a.status === 'SUSPENDED').length,
        totalBookings: agencies.reduce((s, a) => s + (a._count?.bookings || 0), 0),
    }), [agencies]);

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
        } catch {
            message.error('Silme işlemi başarısız');
        }
    };

    const handleSave = async (values: any) => {
        try {
            setSaving(true);
            if (editingAgency) {
                await apiClient.put(`/api/admin/agencies/${editingAgency.id}`, values);
                message.success('Acente güncellendi');
            } else {
                await apiClient.post('/api/admin/agencies', values);
                message.success('Acente oluşturuldu');
            }
            setModalVisible(false);
            fetchAgencies();
        } catch (error: any) {
            const errMsg = error?.response?.data?.error;
            message.error(errMsg || 'Acente kaydedilirken hata oluştu');
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        {
            title: 'Acente',
            key: 'agency',
            width: 260,
            render: (_: any, r: Agency) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar size={40} icon={<ShopOutlined />}
                        style={{
                            background: r.status === 'ACTIVE'
                                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                : r.status === 'SUSPENDED' ? '#ef4444' : '#94a3b8',
                            flexShrink: 0
                        }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.name}</div>
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
            width: 240,
            render: (_: any, r: Agency) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', marginBottom: 2 }}>
                        {r.contactName}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MailOutlined style={{ color: '#6366f1', fontSize: 10 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{r.email}</span>
                    </div>
                    {r.phone && (
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                            <PhoneOutlined style={{ color: '#6366f1', fontSize: 10 }} />
                            <span>{r.phone}</span>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Komisyon',
            dataIndex: 'commissionRate',
            key: 'commissionRate',
            width: 100,
            align: 'center' as const,
            render: (val: number) => (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 20, padding: '3px 12px'
                }}>
                    <PercentageOutlined style={{ color: '#3b82f6', fontSize: 11 }} />
                    <span style={{ fontWeight: 700, color: '#1e40af', fontSize: 13 }}>{val}</span>
                </div>
            ),
        },
        {
            title: 'İstatistikler',
            key: 'stats',
            width: 140,
            render: (_: any, r: Agency) => (
                <div style={{ display: 'flex', gap: 10 }}>
                    <Tooltip title="Kullanıcı sayısı">
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: '#f1f5f9', borderRadius: 8, padding: '3px 8px'
                        }}>
                            <UserOutlined style={{ color: '#6366f1', fontSize: 11 }} />
                            <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{r._count?.users || 0}</span>
                        </div>
                    </Tooltip>
                    <Tooltip title="Satış sayısı">
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: '#f1f5f9', borderRadius: 8, padding: '3px 8px'
                        }}>
                            <ShoppingCartOutlined style={{ color: '#10b981', fontSize: 11 }} />
                            <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{r._count?.bookings || 0}</span>
                        </div>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            width: 130,
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
            width: 100,
            render: (_: any, r: Agency) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    <Tooltip title="Düzenle">
                        <Button size="small" type="text" icon={<EditOutlined />}
                            onClick={() => handleEdit(r)}
                            style={{ color: '#6366f1', borderRadius: 6 }} />
                    </Tooltip>
                    <Tooltip title="Sil">
                        <Popconfirm title="Bu acenteyi silmek istediğinize emin misiniz?"
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
            <AdminLayout selectedKey="agencies">
                <div style={{ padding: '0 4px' }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 22, boxShadow: '0 4px 14px #6366f140'
                            }}><ShopOutlined /></div>
                            <div>
                                <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Alt Acenteler (B2B)</Title>
                                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                    Satış acentelerinizi yönetin, komisyon ve kontratları düzenleyin
                                </Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={fetchAgencies} loading={loading}
                                style={{ borderRadius: 8 }} />
                            <Button type="primary" icon={<PlusOutlined />}
                                onClick={handleCreate}
                                style={{
                                    borderRadius: 8,
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    border: 'none', boxShadow: '0 2px 8px #6366f140'
                                }}>
                                Yeni Acente Ekle
                            </Button>
                        </Space>
                    </div>

                    {/* ── Stats Cards ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                            { label: 'Toplam', value: stats.total, color: '#6366f1', icon: <ShopOutlined /> },
                            { label: 'Aktif', value: stats.active, color: '#10b981', icon: <CheckCircleOutlined /> },
                            { label: 'Pasif', value: stats.inactive, color: '#94a3b8', icon: <ClockCircleOutlined /> },
                            { label: 'Askıda', value: stats.suspended, color: '#ef4444', icon: <StopOutlined /> },
                            { label: 'Toplam Satış', value: stats.totalBookings, color: '#3b82f6', icon: <ShoppingCartOutlined /> },
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
                                placeholder="Firma adı, yetkili, e-posta ara..."
                                style={{ width: 300, borderRadius: 8 }}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                allowClear
                            />
                            <Select value={statusFilter} style={{ width: 170 }} onChange={setStatusFilter}>
                                <Option value="ALL">Tüm Durum</Option>
                                <Option value="ACTIVE">🟢 Aktif</Option>
                                <Option value="INACTIVE">⚪ Pasif</Option>
                                <Option value="SUSPENDED">🔴 Askıya Alındı</Option>
                            </Select>
                            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                                {filteredData.length} / {agencies.length} acente
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
                            locale={{ emptyText: <Empty description="Henüz acente kaydı yok" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                            size="middle"
                            style={{ borderRadius: 14, overflow: 'hidden' }}
                        />
                    </Card>
                </div>

                {/* ── Acente Oluştur / Düzenle Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: editingAgency
                                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16
                            }}>{editingAgency ? <EditOutlined /> : <ShopOutlined />}</div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                                    {editingAgency ? 'Acente Düzenle' : 'Yeni Acente Oluştur'}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                    {editingAgency ? editingAgency.name : 'Sisteme yeni bir B2B acente ekleyin'}
                                </div>
                            </div>
                        </div>
                    }
                    open={modalVisible}
                    onCancel={() => setModalVisible(false)}
                    onOk={() => form.submit()}
                    confirmLoading={saving}
                    okText={editingAgency ? 'Güncelle' : 'Kaydet ve Oluştur'}
                    cancelText="Vazgeç"
                    width={640}
                >
                    <div style={{ marginTop: 16 }}>
                        <Form form={form} layout="vertical" onFinish={handleSave}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                                <Form.Item name="name" label="Firma / Acente Adı"
                                    rules={[{ required: true, message: 'Firma adı zorunludur' }]}>
                                    <Input placeholder="Acente adı giriniz" />
                                </Form.Item>
                                <Form.Item name="contactName" label="İletişim Kişisi"
                                    rules={[{ required: true, message: 'İletişim kişisi zorunludur' }]}>
                                    <Input placeholder="Yetkili ad soyad" />
                                </Form.Item>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                                <Form.Item name="email" label="E-Posta"
                                    rules={[{ required: true, type: 'email', message: 'Geçerli e-posta giriniz' }]}>
                                    <Input placeholder="E-posta adresi" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                                <Form.Item name="phone" label="Telefon"
                                    rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                                    <Input placeholder="Telefon numarası" prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                            </div>
                            {!editingAgency && (
                                <Form.Item name="password" label="Giriş Şifresi (Acente Yöneticisi)"
                                    rules={[{ required: true, message: 'Şifre zorunludur' }, { min: 6, message: 'En az 6 karakter' }]}>
                                    <Input.Password placeholder="Acente paneli için şifre belirleyin" prefix={<KeyOutlined style={{ color: '#94a3b8' }} />} />
                                </Form.Item>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                                <Form.Item name="commissionRate" label="Varsayılan Komisyon Oranı (%)">
                                    <InputNumber min={0} max={100} style={{ width: '100%' }}
                                        formatter={value => `% ${value}`}
                                        parser={value => Number(value!.replace('%', '').trim()) as any} />
                                </Form.Item>
                                <Form.Item name="status" label="Durumu">
                                    <Select>
                                        <Option value="ACTIVE">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ color: '#10b981' }}>●</span> Aktif
                                            </div>
                                        </Option>
                                        <Option value="INACTIVE">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ color: '#94a3b8' }}>●</span> Pasif
                                            </div>
                                        </Option>
                                        <Option value="SUSPENDED">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ color: '#ef4444' }}>●</span> Askıya Alındı
                                            </div>
                                        </Option>
                                    </Select>
                                </Form.Item>
                            </div>

                            {!editingAgency && (
                                <div style={{
                                    background: '#eff6ff', borderRadius: 10, padding: '10px 14px',
                                    fontSize: 12, color: '#1e40af', border: '1px solid #bfdbfe',
                                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4
                                }}>
                                    <ExclamationCircleOutlined />
                                    <span>Acente oluşturulurken otomatik olarak bir <strong>Acente Yöneticisi</strong> kullanıcı hesabı da açılır.</span>
                                </div>
                            )}

                            {editingAgency && (
                                (editingAgency.companyName || editingAgency.taxOffice || editingAgency.taxNumber || editingAgency.address || editingAgency.contactEmail || editingAgency.contactPhone || editingAgency.website) && (
                                    <>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 12px',
                                            padding: '8px 0', borderTop: '1px solid #e2e8f0'
                                        }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: 7,
                                                background: '#f59e0b18', border: '1px solid #f59e0b30',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#f59e0b', fontSize: 12
                                            }}><BankOutlined /></div>
                                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>Acente Tarafından Girilen Bilgiler</span>
                                        </div>
                                        <div style={{
                                            background: '#f8fafc', borderRadius: 10, padding: 14,
                                            border: '1px solid #e2e8f0'
                                        }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                                {editingAgency.companyName && (
                                                    <div style={{ gridColumn: 'span 2' }}>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>FİRMA ADI</div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{editingAgency.companyName}</div>
                                                    </div>
                                                )}
                                                {editingAgency.taxOffice && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>VERGİ DAİRESİ</div>
                                                        <div style={{ fontSize: 12, color: '#1e293b' }}>{editingAgency.taxOffice}</div>
                                                    </div>
                                                )}
                                                {editingAgency.taxNumber && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>VERGİ NO</div>
                                                        <div style={{ fontSize: 12, color: '#1e293b', fontFamily: 'monospace' }}>{editingAgency.taxNumber}</div>
                                                    </div>
                                                )}
                                                {editingAgency.contactPhone && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>TELEFON</div>
                                                        <div style={{ fontSize: 12, color: '#1e293b' }}>{editingAgency.contactPhone}</div>
                                                    </div>
                                                )}
                                                {editingAgency.contactEmail && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>E-POSTA</div>
                                                        <div style={{ fontSize: 12, color: '#1e293b' }}>{editingAgency.contactEmail}</div>
                                                    </div>
                                                )}
                                                {editingAgency.website && (
                                                    <div style={{ gridColumn: 'span 2' }}>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>WEB SİTESİ</div>
                                                        <div style={{ fontSize: 12, color: '#3b82f6' }}>{editingAgency.website}</div>
                                                    </div>
                                                )}
                                                {editingAgency.address && (
                                                    <div style={{ gridColumn: 'span 2' }}>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>ADRES</div>
                                                        <div style={{ fontSize: 12, color: '#1e293b' }}>{editingAgency.address}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )
                            )}
                        </Form>
                    </div>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default AdminAgenciesPage;
