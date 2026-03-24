'use client';

import React, { useEffect, useState } from 'react';
import {
    Table, Button, Card, Space, message, Tag, Tooltip, Avatar,
    Modal, Form, DatePicker, Input, Select, Popconfirm, Drawer,
    Timeline, Empty, Row, Col, Badge
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined,
    PhoneOutlined, MailOutlined, StopOutlined, CalendarOutlined,
    FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined,
    ExclamationCircleOutlined, SettingOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient, { getImageUrl } from '@/lib/api-client';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.locale('tr');

const { Option } = Select;
const { TextArea } = Input;

interface LeaveRecord {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    note?: string;
    createdAt: string;
}

interface Personnel {
    id: string;
    firstName: string;
    lastName: string;
    tcNumber: string;
    jobTitle: string;
    department: string;
    phone: string;
    email: string;
    photo: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    metadata?: { transactions?: any[]; leaves?: LeaveRecord[]; terminationReason?: string };
}

const LEAVE_TYPES = [
    { value: 'ANNUAL', label: '🌴 Yıllık İzin' },
    { value: 'SICK', label: '🤒 Hastalık İzni' },
    { value: 'MATERNAL', label: '👶 Doğum İzni' },
    { value: 'PATERNAL', label: '👶 Babalık İzni' },
    { value: 'MARRIAGE', label: '💒 Evlilik İzni' },
    { value: 'BEREAVEMENT', label: '🖤 Vefat İzni' },
    { value: 'UNPAID', label: '📋 Ücretsiz İzin' },
    { value: 'OTHER', label: '📄 Diğer' },
];

const leaveLabel = (type: string) => LEAVE_TYPES.find(t => t.value === type)?.label || type;

const PersonnelListPage = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Personnel[]>([]);
    const router = useRouter();

    // Termination modal
    const [terminateModal, setTerminateModal] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null);
    const [terminateForm] = Form.useForm();
    const [terminating, setTerminating] = useState(false);

    // Leave modal
    const [leaveModal, setLeaveModal] = useState(false);
    const [leaveForm] = Form.useForm();
    const [addingLeave, setAddingLeave] = useState(false);

    // Leave history drawer
    const [leaveDrawer, setLeaveDrawer] = useState(false);

    // Settings modal
    const [settingsModal, setSettingsModal] = useState(false);
    const [settingsForm] = Form.useForm();
    const [savingSettings, setSavingSettings] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [personnelRes, tenantRes] = await Promise.all([
                apiClient.get('/api/personnel'),
                apiClient.get('/api/tenant/info')
            ]);

            if (personnelRes.data.success) setData(personnelRes.data.data);

            if (tenantRes.data.success && tenantRes.data.data.tenant.settings) {
                settingsForm.setFieldsValue({
                    salaryPaymentDay: tenantRes.data.data.tenant.settings.salaryPaymentDay || 1
                });
            }
        } catch {
            message.error('Veriler yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/personnel/${id}`);
            message.success('Personel silindi');
            fetchData();
        } catch {
            message.error('Silme işlemi başarısız');
        }
    };

    // ── Termination ────────────────────────────────────
    const openTerminate = (p: Personnel) => {
        setSelectedPerson(p);
        terminateForm.resetFields();
        terminateForm.setFieldsValue({ endDate: dayjs() });
        setTerminateModal(true);
    };

    const handleTerminate = async () => {
        if (!selectedPerson) return;
        try {
            const vals = await terminateForm.validateFields();
            setTerminating(true);
            const meta = { ...(selectedPerson.metadata || {}), terminationReason: vals.reason };
            await apiClient.put(`/api/personnel/${selectedPerson.id}`, {
                isActive: false,
                endDate: vals.endDate?.toISOString(),
                metadata: meta
            });
            message.success(`${selectedPerson.firstName} ${selectedPerson.lastName} işten çıkarıldı`);
            setTerminateModal(false);
            fetchData();
        } catch (e: any) {
            if (!e.errorFields) message.error('İşlem başarısız');
        } finally {
            setTerminating(false);
        }
    };

    // Reactivate (geri al)
    const handleReactivate = async (p: Personnel) => {
        try {
            const meta = { ...(p.metadata || {}) };
            delete (meta as any).terminationReason;
            await apiClient.put(`/api/personnel/${p.id}`, { isActive: true, endDate: null, metadata: meta });
            message.success(`${p.firstName} ${p.lastName} aktife alındı`);
            fetchData();
        } catch {
            message.error('İşlem başarısız');
        }
    };

    // ── Leave ───────────────────────────────────────────
    const openLeave = (p: Personnel) => {
        setSelectedPerson(p);
        leaveForm.resetFields();
        leaveForm.setFieldsValue({ type: 'ANNUAL' });
        setLeaveModal(true);
    };

    const handleAddLeave = async () => {
        if (!selectedPerson) return;
        try {
            const vals = await leaveForm.validateFields();
            setAddingLeave(true);
            const start = dayjs(vals.dateRange[0]);
            const end = dayjs(vals.dateRange[1]);
            const days = end.diff(start, 'day') + 1;
            const newLeave: LeaveRecord = {
                id: `lv-${Date.now()}`,
                type: vals.type,
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                days,
                note: vals.note || '',
                createdAt: new Date().toISOString()
            };
            const meta = { ...(selectedPerson.metadata || {}) };
            const leaves: LeaveRecord[] = Array.isArray(meta.leaves) ? meta.leaves : [];
            leaves.push(newLeave);
            meta.leaves = leaves;
            await apiClient.put(`/api/personnel/${selectedPerson.id}`, { metadata: meta });
            message.success('İzin kaydedildi');
            setLeaveModal(false);
            fetchData();
        } catch (e: any) {
            if (!e.errorFields) message.error('İzin kaydedilemedi');
        } finally {
            setAddingLeave(false);
        }
    };

    const deleteLeave = async (p: Personnel, leaveId: string) => {
        try {
            const meta = { ...(p.metadata || {}) };
            meta.leaves = (meta.leaves || []).filter((l: LeaveRecord) => l.id !== leaveId);
            await apiClient.put(`/api/personnel/${p.id}`, { metadata: meta });
            message.success('İzin silindi');
            // update local
            const leaves = (meta.leaves || []);
            setSelectedPerson(prev => prev ? { ...prev, metadata: { ...prev.metadata, leaves } } : null);
            fetchData();
        } catch {
            message.error('Silinemedi');
        }
    };

    const openLeaveHistory = (p: Personnel) => {
        setSelectedPerson(p);
        setLeaveDrawer(true);
    };

    // ── Settings ──────────────────────────────────────────
    const handleSaveSettings = async () => {
        try {
            const vals = await settingsForm.validateFields();
            setSavingSettings(true);

            const tenantRes = await apiClient.get('/api/tenant/info');
            const currentSettings = tenantRes.data.data.tenant.settings || {};

            await apiClient.put('/api/tenant/settings', {
                ...currentSettings,
                salaryPaymentDay: vals.salaryPaymentDay
            });

            message.success('Ayarlar kaydedildi');
            setSettingsModal(false);
        } catch (e: any) {
            if (!e.errorFields) message.error('Ayarlar kaydedilemedi');
        } finally {
            setSavingSettings(false);
        }
    };

    // ── Status tag helper ────────────────────────────────
    const statusTag = (p: Personnel) => {
        if (!p.isActive) {
            return <Tag color="red" icon={<StopOutlined />}>İşten Çıktı</Tag>;
        }
        const leaves: LeaveRecord[] = p.metadata?.leaves || [];
        const today = dayjs();
        const onLeave = leaves.find(l => today.isAfter(dayjs(l.startDate).subtract(1, 'day')) && today.isBefore(dayjs(l.endDate).add(1, 'day')));
        if (onLeave) return <Tag color="orange" icon={<CalendarOutlined />}>İzinde ({onLeave.days}g)</Tag>;
        return <Tag color="green" icon={<CheckCircleOutlined />}>Aktif</Tag>;
    };

    const columns = [
        {
            title: 'Personel',
            key: 'personnel',
            render: (_: any, r: Personnel) => (
                <Space>
                    <Avatar src={getImageUrl(r.photo)} icon={<UserOutlined />} size="large" style={{ background: '#6366f1' }} />
                    <div>
                        <div style={{ fontWeight: 600 }}>{r.firstName} {r.lastName}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{r.tcNumber}</div>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Görevi / Departman',
            key: 'job',
            render: (_: any, r: Personnel) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{r.jobTitle || '-'}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{r.department || '-'}</div>
                </div>
            ),
        },
        {
            title: 'İletişim',
            key: 'contact',
            render: (_: any, r: Personnel) => (
                <div style={{ fontSize: 12 }}>
                    {r.phone && <div><PhoneOutlined style={{ color: '#888', marginRight: 4 }} />{r.phone}</div>}
                    {r.email && <div><MailOutlined style={{ color: '#888', marginRight: 4 }} />{r.email}</div>}
                </div>
            ),
        },
        {
            title: 'İşe Başlama',
            dataIndex: 'startDate',
            key: 'startDate',
            render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-',
        },
        {
            title: 'Durum',
            key: 'status',
            render: (_: any, r: Personnel) => statusTag(r),
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, r: Personnel) => (
                <Space size={4} wrap>
                    <Tooltip title="Düzenle">
                        <Button size="small" icon={<EditOutlined />} onClick={() => router.push(`/admin/personnel/${r.id}`)} />
                    </Tooltip>
                    <Tooltip title="İzin Ekle">
                        <Button size="small" icon={<CalendarOutlined />} onClick={() => openLeave(r)}
                            style={{ color: '#d97706', borderColor: '#d97706' }} />
                    </Tooltip>
                    <Tooltip title="İzin Geçmişi">
                        <Badge count={(r.metadata?.leaves || []).length} size="small" offset={[-4, 4]}>
                            <Button size="small" icon={<FileTextOutlined />} onClick={() => openLeaveHistory(r)} />
                        </Badge>
                    </Tooltip>
                    {r.isActive ? (
                        <Tooltip title="İşten Çıkar">
                            <Button size="small" danger icon={<StopOutlined />} onClick={() => openTerminate(r)} />
                        </Tooltip>
                    ) : (
                        <Tooltip title="Aktife Al">
                            <Popconfirm title="Personeli aktife almak istediğinize emin misiniz?" onConfirm={() => handleReactivate(r)} okText="Evet" cancelText="Hayır">
                                <Button size="small" icon={<CheckCircleOutlined />} style={{ color: '#16a34a', borderColor: '#16a34a' }} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                    <Tooltip title="Sil">
                        <Popconfirm title="Bu personeli silmek istediğinize emin misiniz?" onConfirm={() => handleDelete(r.id)} okText="Sil" cancelText="İptal">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="personnel">
                <Card
                    title="Personel Listesi"
                    extra={
                        <Space>
                            <Button icon={<SettingOutlined />} onClick={() => setSettingsModal(true)}>
                                Ayarlar
                            </Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/admin/personnel/create')}>
                                Yeni Personel Ekle
                            </Button>
                        </Space>
                    }
                >
                    <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 10 }}
                        rowClassName={(r: Personnel) => !r.isActive ? 'opacity-50' : ''}
                    />
                </Card>

                {/* ── İşten Çıkarma Modal ── */}
                <Modal
                    title={<span><StopOutlined style={{ color: '#dc2626', marginRight: 8 }} />İşten Çıkarma — {selectedPerson?.firstName} {selectedPerson?.lastName}</span>}
                    open={terminateModal}
                    onOk={handleTerminate}
                    onCancel={() => setTerminateModal(false)}
                    confirmLoading={terminating}
                    okText="İşten Çıkar"
                    okButtonProps={{ danger: true }}
                    cancelText="Vazgeç"
                >
                    <Form form={terminateForm} layout="vertical">
                        <Form.Item name="endDate" label="İşten Çıkış Tarihi" rules={[{ required: true, message: 'Tarih zorunludur' }]}>
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                        <Form.Item name="reason" label="İşten Çıkış Nedeni" rules={[{ required: true, message: 'Neden zorunludur' }]}>
                            <Select placeholder="Seçiniz">
                                <Option value="İstifa">🚪 İstifa</Option>
                                <Option value="İkale">🤝 İkale (Anlaşmalı)</Option>
                                <Option value="İşveren feshi">⚖️ İşveren Feshi</Option>
                                <Option value="Emeklilik">👴 Emeklilik</Option>
                                <Option value="Deneme süresi bitimi">📋 Deneme Süresi Bitimi</Option>
                                <Option value="Diğer">📄 Diğer</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="note" label="Ek Not">
                            <TextArea rows={2} placeholder="İsteğe bağlı açıklama..." />
                        </Form.Item>
                    </Form>
                    <div style={{ background: '#fef2f2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b' }}>
                        <ExclamationCircleOutlined style={{ marginRight: 6 }} />
                        Personel pasife alınır, sisteme giriş yapamaz.
                    </div>
                </Modal>

                {/* ── İzin Ekle Modal ── */}
                <Modal
                    title={<span><CalendarOutlined style={{ color: '#d97706', marginRight: 8 }} />İzin Ekle — {selectedPerson?.firstName} {selectedPerson?.lastName}</span>}
                    open={leaveModal}
                    onOk={handleAddLeave}
                    onCancel={() => setLeaveModal(false)}
                    confirmLoading={addingLeave}
                    okText="İzin Kaydet"
                    cancelText="İptal"
                >
                    <Form form={leaveForm} layout="vertical">
                        <Form.Item name="type" label="İzin Türü" rules={[{ required: true }]}>
                            <Select>
                                {LEAVE_TYPES.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item name="dateRange" label="İzin Tarihleri" rules={[{ required: true, message: 'Tarih aralığı zorunludur' }]}>
                            <DatePicker.RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                        <Form.Item name="note" label="Açıklama">
                            <TextArea rows={2} placeholder="İsteğe bağlı not..." />
                        </Form.Item>
                    </Form>
                </Modal>

                {/* ── İzin Geçmişi Drawer ── */}
                <Drawer
                    title={selectedPerson ? `${selectedPerson.firstName} ${selectedPerson.lastName} — İzin Geçmişi` : ''}
                    open={leaveDrawer}
                    onClose={() => setLeaveDrawer(false)}
                    size="large"
                    extra={
                        <Button size="small" icon={<CalendarOutlined />} onClick={() => { setLeaveDrawer(false); selectedPerson && openLeave(selectedPerson); }}>
                            İzin Ekle
                        </Button>
                    }
                >
                    {selectedPerson && (() => {
                        const leaves: LeaveRecord[] = [...(selectedPerson.metadata?.leaves || [])].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
                        const totalDays = leaves.reduce((s, l) => s + l.days, 0);
                        return (
                            <>
                                <Row gutter={12} style={{ marginBottom: 16 }}>
                                    <Col span={12}>
                                        <div style={{ textAlign: 'center', background: '#eff6ff', borderRadius: 8, padding: 12 }}>
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>Toplam İzin</div>
                                            <div style={{ fontWeight: 700, fontSize: 18, color: '#2563eb' }}>{leaves.length} kayıt</div>
                                        </div>
                                    </Col>
                                    <Col span={12}>
                                        <div style={{ textAlign: 'center', background: '#f0fdf4', borderRadius: 8, padding: 12 }}>
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>Toplam Gün</div>
                                            <div style={{ fontWeight: 700, fontSize: 18, color: '#16a34a' }}>{totalDays} gün</div>
                                        </div>
                                    </Col>
                                </Row>
                                {leaves.length === 0 ? <Empty description="Henüz izin kaydı yok" /> : (
                                    <Timeline items={leaves.map(l => ({
                                        color: '#d97706',
                                        dot: <CalendarOutlined style={{ color: '#d97706' }} />,
                                        children: (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ fontWeight: 700 }}>
                                                        {leaveLabel(l.type)}
                                                        <Tag color="orange" style={{ marginLeft: 8, fontSize: 11 }}>{l.days} gün</Tag>
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                                                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                        {dayjs(l.startDate).format('DD MMM')} – {dayjs(l.endDate).format('DD MMM YYYY')}
                                                    </div>
                                                    {l.note && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{l.note}</div>}
                                                </div>
                                                <Popconfirm title="Bu izni silmek istediğinize emin misiniz?" onConfirm={() => deleteLeave(selectedPerson, l.id)} okText="Sil" cancelText="İptal">
                                                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                                </Popconfirm>
                                            </div>
                                        )
                                    }))} />
                                )}
                            </>
                        );
                    })()}
                </Drawer>

                {/* ── Ayarlar Modal ── */}
                <Modal
                    title={<span><SettingOutlined style={{ marginRight: 8 }} />Personel ve Maaş Ayarları</span>}
                    open={settingsModal}
                    onOk={handleSaveSettings}
                    onCancel={() => setSettingsModal(false)}
                    confirmLoading={savingSettings}
                    okText="Kaydet"
                    cancelText="Vazgeç"
                >
                    <Form form={settingsForm} layout="vertical">
                        <Form.Item
                            name="salaryPaymentDay"
                            label="Otomatik Maaş Hak Ediş Günü"
                            rules={[{ required: true, message: 'Ödeme günü zorunludur' }]}
                            tooltip="Belirtilen günde tüm aktif personelin maaş hak edişleri hesaplarına (kıst hesaplaması dahil) otomatik yansıtılır."
                        >
                            <Select placeholder="Gün seçin">
                                {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                    <Option key={day} value={day}>Her ayın {day}. günü</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Form>
                </Modal>

            </AdminLayout>
        </AdminGuard>
    );
};

export default PersonnelListPage;
