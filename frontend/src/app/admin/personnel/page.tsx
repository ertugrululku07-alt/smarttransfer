'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Table, Button, Card, Space, message, Tag, Tooltip, Avatar,
    Modal, Form, DatePicker, Input, Select, Popconfirm, Drawer,
    Empty, Row, Col, Badge, Divider, Typography, Checkbox, Popover
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined,
    PhoneOutlined, MailOutlined, StopOutlined, CalendarOutlined,
    FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined,
    ExclamationCircleOutlined, SettingOutlined, SearchOutlined,
    TeamOutlined, ReloadOutlined, CarOutlined, IdcardOutlined,
    SafetyCertificateOutlined, WarningOutlined
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
const { Title, Text } = Typography;

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
    salary: number;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    metadata?: { transactions?: any[]; leaves?: LeaveRecord[]; terminationReason?: string; blacklisted?: boolean; blacklistedAt?: string; blacklistNote?: string; terminationNote?: string };
}

const LEAVE_TYPES = [
    { value: 'ANNUAL', label: 'Yıllık İzin', icon: '🌴' },
    { value: 'SICK', label: 'Hastalık İzni', icon: '🤒' },
    { value: 'MATERNAL', label: 'Doğum İzni', icon: '👶' },
    { value: 'PATERNAL', label: 'Babalık İzni', icon: '👶' },
    { value: 'MARRIAGE', label: 'Evlilik İzni', icon: '💒' },
    { value: 'BEREAVEMENT', label: 'Vefat İzni', icon: '🖤' },
    { value: 'UNPAID', label: 'Ücretsiz İzin', icon: '📋' },
    { value: 'OTHER', label: 'Diğer', icon: '📄' },
];

const JOB_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    DRIVER: { label: 'Şoför', color: '#6366f1', icon: <CarOutlined /> },
    OPERATION: { label: 'Operasyon', color: '#3b82f6', icon: <SettingOutlined /> },
    ACCOUNTANT: { label: 'Muhasebe', color: '#10b981', icon: <IdcardOutlined /> },
    RESERVATION: { label: 'Rezervasyon', color: '#f59e0b', icon: <CalendarOutlined /> },
};

const leaveLabel = (type: string) => {
    const t = LEAVE_TYPES.find(lt => lt.value === type);
    return t ? `${t.icon} ${t.label}` : type;
};

const PersonnelListPage = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Personnel[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [jobFilter, setJobFilter] = useState<string>('ALL');
    const router = useRouter();

    // Termination modal
    const [terminateModal, setTerminateModal] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null);
    const [terminateForm] = Form.useForm();
    const [terminating, setTerminating] = useState(false);
    const [blacklistChecked, setBlacklistChecked] = useState(false);

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
                const ts = tenantRes.data.data.tenant.settings;
                settingsForm.setFieldsValue({
                    salaryPaymentDay: ts.salaryPaymentDay || 1,
                    driverAlarmEnabled: ts.driverSettings?.alarmEnabled !== false,
                    driverAlarmMinutes: ts.driverSettings?.alarmMinutes ?? 30,
                });
            }
        } catch {
            message.error('Veriler yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredData = useMemo(() => {
        return data.filter(p => {
            if (search) {
                const q = search.toLowerCase();
                const match = `${p.firstName} ${p.lastName} ${p.tcNumber} ${p.phone} ${p.email} ${p.jobTitle}`.toLowerCase().includes(q);
                if (!match) return false;
            }
            if (statusFilter === 'ACTIVE' && !p.isActive) return false;
            if (statusFilter === 'INACTIVE' && (p.isActive || p.metadata?.blacklisted)) return false;
            if (statusFilter === 'BLACKLISTED' && !p.metadata?.blacklisted) return false;
            if (statusFilter === 'ON_LEAVE') {
                const leaves: LeaveRecord[] = p.metadata?.leaves || [];
                const today = dayjs();
                const onLeave = leaves.some(l => today.isAfter(dayjs(l.startDate).subtract(1, 'day')) && today.isBefore(dayjs(l.endDate).add(1, 'day')));
                if (!onLeave) return false;
            }
            if (jobFilter !== 'ALL' && p.jobTitle !== jobFilter) return false;
            return true;
        });
    }, [data, search, statusFilter, jobFilter]);

    const stats = useMemo(() => {
        const active = data.filter(p => p.isActive).length;
        const inactive = data.filter(p => !p.isActive && !p.metadata?.blacklisted).length;
        const blacklisted = data.filter(p => p.metadata?.blacklisted).length;
        const drivers = data.filter(p => p.jobTitle === 'DRIVER' && p.isActive).length;
        const onLeave = data.filter(p => {
            if (!p.isActive) return false;
            const leaves: LeaveRecord[] = p.metadata?.leaves || [];
            const today = dayjs();
            return leaves.some(l => today.isAfter(dayjs(l.startDate).subtract(1, 'day')) && today.isBefore(dayjs(l.endDate).add(1, 'day')));
        }).length;
        return { total: data.length, active, inactive, blacklisted, drivers, onLeave };
    }, [data]);

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/personnel/${id}`);
            message.success('Personel silindi');
            fetchData();
        } catch {
            message.error('Silme işlemi başarısız');
        }
    };

    const openTerminate = (p: Personnel) => {
        setSelectedPerson(p);
        terminateForm.resetFields();
        terminateForm.setFieldsValue({ endDate: dayjs() });
        setBlacklistChecked(false);
        setTerminateModal(true);
    };

    const handleTerminate = async () => {
        if (!selectedPerson) return;
        try {
            const vals = await terminateForm.validateFields();
            setTerminating(true);
            const meta: any = { ...(selectedPerson.metadata || {}), terminationReason: vals.reason };
            if (vals.note) meta.terminationNote = vals.note;
            if (blacklistChecked) {
                meta.blacklisted = true;
                meta.blacklistedAt = new Date().toISOString();
                meta.blacklistNote = vals.note || '';
            }
            await apiClient.put(`/api/personnel/${selectedPerson.id}`, {
                isActive: false,
                endDate: vals.endDate?.toISOString(),
                metadata: meta
            });
            message.success(`${selectedPerson.firstName} ${selectedPerson.lastName} işten çıkarıldı${blacklistChecked ? ' ve kara listeye eklendi' : ''}`);
            setTerminateModal(false);
            fetchData();
        } catch (e: any) {
            if (!e.errorFields) message.error('İşlem başarısız');
        } finally {
            setTerminating(false);
        }
    };

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
            const leaves: LeaveRecord[] = Array.isArray(meta.leaves) ? [...meta.leaves] : [];
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

    const handleSaveSettings = async () => {
        try {
            const vals = await settingsForm.validateFields();
            setSavingSettings(true);
            await apiClient.put('/api/tenant/settings', {
                salaryPaymentDay: vals.salaryPaymentDay,
                driverSettings: {
                    alarmEnabled: vals.driverAlarmEnabled !== false,
                    alarmMinutes: Number(vals.driverAlarmMinutes) || 30,
                },
            });
            message.success('Ayarlar kaydedildi');
            setSettingsModal(false);
        } catch (e: any) {
            if (!e.errorFields) message.error('Ayarlar kaydedilemedi');
        } finally {
            setSavingSettings(false);
        }
    };

    const getPersonStatus = (p: Personnel): { label: string; color: string; bg: string; icon: React.ReactNode } => {
        if (!p.isActive && p.metadata?.blacklisted) {
            return { label: 'Kara Liste', color: '#1e293b', bg: '#f1f5f9', icon: <WarningOutlined /> };
        }
        if (!p.isActive) {
            return { label: 'İşten Çıktı', color: '#ef4444', bg: '#fef2f2', icon: <StopOutlined /> };
        }
        const leaves: LeaveRecord[] = p.metadata?.leaves || [];
        const today = dayjs();
        const onLeave = leaves.find(l => today.isAfter(dayjs(l.startDate).subtract(1, 'day')) && today.isBefore(dayjs(l.endDate).add(1, 'day')));
        if (onLeave) return { label: `İzinde (${onLeave.days}g)`, color: '#f59e0b', bg: '#fffbeb', icon: <CalendarOutlined /> };
        return { label: 'Aktif', color: '#10b981', bg: '#ecfdf5', icon: <CheckCircleOutlined /> };
    };

    const columns = [
        {
            title: 'Personel',
            key: 'personnel',
            width: 260,
            render: (_: any, r: Personnel) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar
                        src={getImageUrl(r.photo)}
                        icon={<UserOutlined />}
                        size={42}
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                            {r.firstName} {r.lastName}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.tcNumber}</div>
                    </div>
                </div>
            ),
        },
        {
            title: 'Görev',
            key: 'job',
            width: 160,
            render: (_: any, r: Personnel) => {
                const job = JOB_LABELS[r.jobTitle];
                return job ? (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: `${job.color}12`, border: `1px solid ${job.color}30`,
                        borderRadius: 8, padding: '3px 10px'
                    }}>
                        <span style={{ color: job.color, fontSize: 12 }}>{job.icon}</span>
                        <span style={{ fontWeight: 600, color: job.color, fontSize: 11 }}>{job.label}</span>
                    </div>
                ) : (
                    <span style={{ fontSize: 12, color: '#64748b' }}>{r.jobTitle || '-'}</span>
                );
            },
        },
        {
            title: 'İletişim',
            key: 'contact',
            width: 200,
            render: (_: any, r: Personnel) => (
                <div>
                    {r.phone && (
                        <div style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <PhoneOutlined style={{ color: '#6366f1', fontSize: 10 }} />
                            <span>{r.phone}</span>
                        </div>
                    )}
                    {r.email && (
                        <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <MailOutlined style={{ fontSize: 10 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{r.email}</span>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'İşe Başlama / Çıkış',
            dataIndex: 'startDate',
            key: 'startDate',
            width: 150,
            render: (d: string, r: Personnel) => (
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                        <span style={{ color: '#10b981', fontSize: 9, marginRight: 4 }}>▶</span>
                        {d ? dayjs(d).format('DD.MM.YYYY') : '-'}
                    </div>
                    {d && !r.endDate && <div style={{ fontSize: 10, color: '#94a3b8', marginLeft: 12 }}>{dayjs().diff(dayjs(d), 'month')} ay</div>}
                    {r.endDate && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginTop: 2 }}>
                            <span style={{ fontSize: 9, marginRight: 4 }}>■</span>
                            {dayjs(r.endDate).format('DD.MM.YYYY')}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'İzin',
            key: 'leaves',
            width: 80,
            align: 'center' as const,
            render: (_: any, r: Personnel) => {
                const count = (r.metadata?.leaves || []).length;
                const totalDays = (r.metadata?.leaves || []).reduce((s: number, l: LeaveRecord) => s + l.days, 0);
                return (
                    <Tooltip title={`${count} izin, ${totalDays} gun`}>
                        <div
                            style={{ cursor: 'pointer', textAlign: 'center' }}
                            onClick={() => openLeaveHistory(r)}
                        >
                            <div style={{ fontSize: 14, fontWeight: 800, color: count > 0 ? '#f59e0b' : '#cbd5e1' }}>{totalDays}</div>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>gun</div>
                        </div>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Durum',
            key: 'status',
            width: 140,
            render: (_: any, r: Personnel) => {
                const s = getPersonStatus(r);
                const isInactive = !r.isActive;
                const md = r.metadata || {};
                const reason = md.terminationReason;
                const note = md.blacklistNote || md.terminationNote;

                const badge = (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: s.bg, border: `1px solid ${s.color}30`,
                        borderRadius: 8, padding: '3px 10px',
                        cursor: isInactive ? 'help' : 'default',
                    }}>
                        <span style={{ color: s.color, fontSize: 11 }}>{s.icon}</span>
                        <span style={{ fontWeight: 600, color: s.color, fontSize: 11 }}>{s.label}</span>
                        {md.blacklisted && <span style={{ marginLeft: 2, fontSize: 10 }}>ℹ</span>}
                    </div>
                );

                if (!isInactive) return badge;

                const popContent = (
                    <div style={{ minWidth: 260, maxWidth: 320 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                            <Avatar src={getImageUrl(r.photo)} icon={<UserOutlined />} size={32}
                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.firstName} {r.lastName}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.tcNumber}</div>
                            </div>
                        </div>
                        {md.blacklisted && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', marginBottom: 8, color: '#991b1b', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <WarningOutlined /> Kara Listede
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 10px', fontSize: 12 }}>
                            <span style={{ color: '#94a3b8' }}>İşe Başlama:</span>
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{r.startDate ? dayjs(r.startDate).format('DD.MM.YYYY') : '-'}</span>
                            <span style={{ color: '#94a3b8' }}>İşten Çıkış:</span>
                            <span style={{ fontWeight: 600, color: '#ef4444' }}>{r.endDate ? dayjs(r.endDate).format('DD.MM.YYYY') : '-'}</span>
                            {reason && (<>
                                <span style={{ color: '#94a3b8' }}>Sebep:</span>
                                <span style={{ fontWeight: 600, color: '#1e293b' }}>{reason}</span>
                            </>)}
                            {md.blacklistedAt && (<>
                                <span style={{ color: '#94a3b8' }}>K.Listeye:</span>
                                <span style={{ fontWeight: 600, color: '#1e293b' }}>{dayjs(md.blacklistedAt).format('DD.MM.YYYY HH:mm')}</span>
                            </>)}
                        </div>
                        {note && (
                            <div style={{ marginTop: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>NOT</div>
                                <div style={{ fontSize: 12, color: '#334155' }}>{note}</div>
                            </div>
                        )}
                    </div>
                );

                return (
                    <Popover content={popContent} placement="left" trigger="hover">
                        {badge}
                    </Popover>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 180,
            render: (_: any, r: Personnel) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    <Tooltip title="Düzenle">
                        <Button size="small" type="text" icon={<EditOutlined />}
                            onClick={() => router.push(`/admin/personnel/${r.id}`)}
                            style={{ color: '#6366f1', borderRadius: 6 }} />
                    </Tooltip>
                    <Tooltip title="İzin Ekle">
                        <Button size="small" type="text" icon={<CalendarOutlined />}
                            onClick={() => openLeave(r)}
                            style={{ color: '#f59e0b', borderRadius: 6 }} />
                    </Tooltip>
                    <Tooltip title="İzin Geçmişi">
                        <Badge count={(r.metadata?.leaves || []).length} size="small" offset={[-4, 4]}>
                            <Button size="small" type="text" icon={<FileTextOutlined />}
                                onClick={() => openLeaveHistory(r)}
                                style={{ color: '#3b82f6', borderRadius: 6 }} />
                        </Badge>
                    </Tooltip>
                    {r.isActive ? (
                        <Tooltip title="İşten Çıkar">
                            <Button size="small" type="text" danger icon={<StopOutlined />}
                                onClick={() => openTerminate(r)}
                                style={{ borderRadius: 6 }} />
                        </Tooltip>
                    ) : (
                        <Tooltip title="Aktife Al">
                            <Popconfirm title="Personeli aktife almak istediğinize emin misiniz?" onConfirm={() => handleReactivate(r)} okText="Evet" cancelText="Hayir">
                                <Button size="small" type="text" icon={<CheckCircleOutlined />}
                                    style={{ color: '#10b981', borderRadius: 6 }} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                    <Tooltip title="Sil">
                        <Popconfirm title="Bu personeli silmek istediğinize emin misiniz?" onConfirm={() => handleDelete(r.id)} okText="Sil" cancelText="İptal">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                        </Popconfirm>
                    </Tooltip>
                </div>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="personnel">
                <div style={{ padding: '0 24px 24px 24px', maxWidth: 1400 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 22, boxShadow: '0 4px 14px #6366f140'
                            }}><TeamOutlined /></div>
                            <div>
                                <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Personel Yönetimi</Title>
                                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                    Çalışanlarınızı yönetin, izin takibi yapın
                                </Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<SettingOutlined />} onClick={() => setSettingsModal(true)} style={{ borderRadius: 8 }}>
                                Ayarlar
                            </Button>
                            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} style={{ borderRadius: 8 }} />
                            <Button type="primary" icon={<PlusOutlined />}
                                onClick={() => router.push('/admin/personnel/create')}
                                style={{ borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }}>
                                Yeni Personel
                            </Button>
                        </Space>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                            { label: 'Toplam', value: stats.total, color: '#6366f1', icon: <TeamOutlined />, filter: 'ALL' },
                            { label: 'Aktif', value: stats.active, color: '#10b981', icon: <CheckCircleOutlined />, filter: 'ACTIVE' },
                            { label: 'İzinde', value: stats.onLeave, color: '#f59e0b', icon: <CalendarOutlined />, filter: 'ON_LEAVE' },
                            { label: 'Şoför', value: stats.drivers, color: '#3b82f6', icon: <CarOutlined />, filter: 'ALL' },
                            { label: 'Ayrılmış', value: stats.inactive, color: '#ef4444', icon: <StopOutlined />, filter: 'INACTIVE' },
                            { label: 'Kara Liste', value: stats.blacklisted, color: '#1e293b', icon: <WarningOutlined />, filter: 'BLACKLISTED' },
                        ].map((s, i) => {
                            const isActiveFilter = statusFilter === s.filter && s.filter !== 'ALL';
                            return (
                            <div key={i} onClick={() => setStatusFilter(s.filter)} style={{
                                background: isActiveFilter ? `linear-gradient(135deg, ${s.color}20, ${s.color}30)` : `linear-gradient(135deg, ${s.color}08, ${s.color}15)`,
                                border: `${isActiveFilter ? '2px' : '1px'} solid ${s.color}${isActiveFilter ? '70' : '25'}`,
                                borderRadius: 12, padding: '12px 16px',
                                display: 'flex', alignItems: 'center', gap: 10,
                                cursor: 'pointer', transition: 'all 0.15s',
                                boxShadow: isActiveFilter ? `0 4px 12px ${s.color}30` : 'none',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10, background: `${s.color}18`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: s.color, fontSize: 16
                                }}>{s.icon}</div>
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{s.label}</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{s.value}</div>
                                </div>
                            </div>
                            );
                        })}
                    </div>

                    {/* Filters */}
                    <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Input
                                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                placeholder="Ad, soyad, TC, telefon ara..."
                                style={{ width: 260, borderRadius: 8 }}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                allowClear
                            />
                            <Select value={statusFilter} style={{ width: 170 }} onChange={setStatusFilter}
                                options={[
                                    { value: 'ALL', label: 'Tüm Durum' },
                                    { value: 'ACTIVE', label: '🟢 Aktif' },
                                    { value: 'ON_LEAVE', label: '🟡 İzinde' },
                                    { value: 'INACTIVE', label: '🔴 Ayrılmış' },
                                    { value: 'BLACKLISTED', label: '⛔ Kara Liste' },
                                ]}
                            />
                            <Select value={jobFilter} style={{ width: 160 }} onChange={setJobFilter}
                                options={[
                                    { value: 'ALL', label: 'Tüm Görevler' },
                                    { value: 'DRIVER', label: '🚗 Şoför' },
                                    { value: 'OPERATION', label: '⚙️ Operasyon' },
                                    { value: 'ACCOUNTANT', label: '📊 Muhasebe' },
                                    { value: 'RESERVATION', label: '📅 Rezervasyon' },
                                ]}
                            />
                            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                                {filteredData.length} / {data.length} personel
                            </div>
                        </div>
                    </Card>

                    {/* Table */}
                    <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }} bodyStyle={{ padding: 0 }}>
                        <Table
                            columns={columns}
                            dataSource={filteredData}
                            rowKey="id"
                            loading={loading}
                            size="middle"
                            pagination={{
                                pageSize: 15,
                                showSizeChanger: true,
                                showTotal: (t, range) => `${range[0]}-${range[1]} / ${t} personel`,
                                style: { padding: '12px 16px', margin: 0 }
                            }}
                            scroll={{ x: 1100 }}
                            rowClassName={(r: Personnel) => !r.isActive ? 'opacity-50' : ''}
                        />
                    </Card>
                </div>

                {/* ── Isten Cikarma Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16
                            }}><StopOutlined /></div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>İşten Çıkarma</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{selectedPerson?.firstName} {selectedPerson?.lastName}</div>
                            </div>
                        </div>
                    }
                    open={terminateModal}
                    onOk={handleTerminate}
                    onCancel={() => setTerminateModal(false)}
                    confirmLoading={terminating}
                    okText="İşten Çıkar"
                    okButtonProps={{ danger: true }}
                    cancelText="Vazgeç"
                >
                    <div style={{ marginTop: 16 }}>
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

                        {/* Kara Listeye Ekle */}
                        <div style={{
                            background: blacklistChecked ? '#1e293b' : '#f8fafc',
                            borderRadius: 10, padding: '12px 14px',
                            border: `1px solid ${blacklistChecked ? '#475569' : '#e2e8f0'}`,
                            marginBottom: 10, cursor: 'pointer', transition: 'all 0.2s'
                        }} onClick={() => setBlacklistChecked(!blacklistChecked)}>
                            <Checkbox checked={blacklistChecked} onChange={e => setBlacklistChecked(e.target.checked)}
                                style={{ marginRight: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: blacklistChecked ? '#fff' : '#1e293b' }}>
                                    ⛔ Kara Listeye Ekle
                                </span>
                            </Checkbox>
                            <div style={{ fontSize: 11, color: blacklistChecked ? '#94a3b8' : '#64748b', marginTop: 4, marginLeft: 24 }}>
                                Kara listeye eklenen personel tekrar işe alınmak istendiğinde uyarı gösterilir.
                                Yönetici onayı olmadan işe giriş yapılamaz.
                            </div>
                        </div>

                        <div style={{
                            background: '#fef2f2', borderRadius: 10, padding: '10px 14px',
                            fontSize: 12, color: '#991b1b', border: '1px solid #fecaca',
                            display: 'flex', alignItems: 'center', gap: 8
                        }}>
                            <ExclamationCircleOutlined />
                            <span>Personel pasife alınır ve sisteme giriş yapamaz. Bağlı kullanıcı hesabı da devre dışı bırakılır.</span>
                        </div>
                    </div>
                </Modal>

                {/* ── Izin Ekle Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16
                            }}><CalendarOutlined /></div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>İzin Ekle</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{selectedPerson?.firstName} {selectedPerson?.lastName}</div>
                            </div>
                        </div>
                    }
                    open={leaveModal}
                    onOk={handleAddLeave}
                    onCancel={() => setLeaveModal(false)}
                    confirmLoading={addingLeave}
                    okText="İzin Kaydet"
                    cancelText="İptal"
                >
                    <div style={{ marginTop: 16 }}>
                        <Form form={leaveForm} layout="vertical">
                            <Form.Item name="type" label="İzin Türü" rules={[{ required: true }]}>
                                <Select>
                                    {LEAVE_TYPES.map(t => <Option key={t.value} value={t.value}>{t.icon} {t.label}</Option>)}
                                </Select>
                            </Form.Item>
                            <Form.Item name="dateRange" label="İzin Tarihleri" rules={[{ required: true, message: 'Tarih aralığı zorunludur' }]}>
                                <DatePicker.RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                            <Form.Item name="note" label="Açıklama">
                                <TextArea rows={2} placeholder="İsteğe bağlı not..." />
                            </Form.Item>
                        </Form>
                    </div>
                </Modal>

                {/* ── Izin Gecmisi Drawer ── */}
                <Drawer
                    title={
                        selectedPerson ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 16
                                }}><CalendarOutlined /></div>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>İzin Geçmişi</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{selectedPerson.firstName} {selectedPerson.lastName}</div>
                                </div>
                            </div>
                        ) : ''
                    }
                    open={leaveDrawer}
                    onClose={() => setLeaveDrawer(false)}
                    styles={{ wrapper: { width: 480 } }}
                    extra={
                        <Button size="small" type="primary" icon={<CalendarOutlined />}
                            onClick={() => { setLeaveDrawer(false); selectedPerson && openLeave(selectedPerson); }}
                            style={{ borderRadius: 8, background: '#f59e0b', border: 'none' }}>
                            İzin Ekle
                        </Button>
                    }
                >
                    {selectedPerson && (() => {
                        const leaves: LeaveRecord[] = [...(selectedPerson.metadata?.leaves || [])].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
                        const totalDays = leaves.reduce((s, l) => s + l.days, 0);
                        return (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                                    <div style={{
                                        background: '#eff6ff', borderRadius: 10, padding: '14px 16px',
                                        textAlign: 'center', border: '1px solid #bfdbfe'
                                    }}>
                                        <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>TOPLAM İZİN</div>
                                        <div style={{ fontWeight: 800, fontSize: 22, color: '#1e40af' }}>{leaves.length}</div>
                                        <div style={{ fontSize: 10, color: '#64748b' }}>kayıt</div>
                                    </div>
                                    <div style={{
                                        background: '#ecfdf5', borderRadius: 10, padding: '14px 16px',
                                        textAlign: 'center', border: '1px solid #a7f3d0'
                                    }}>
                                        <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>TOPLAM GÜN</div>
                                        <div style={{ fontWeight: 800, fontSize: 22, color: '#047857' }}>{totalDays}</div>
                                        <div style={{ fontSize: 10, color: '#64748b' }}>gün</div>
                                    </div>
                                </div>

                                {leaves.length === 0 ? (
                                    <Empty description="Henüz izin kaydı yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {leaves.map(l => {
                                            const lt = LEAVE_TYPES.find(t => t.value === l.type);
                                            return (
                                                <div key={l.id} style={{
                                                    background: '#f8fafc', border: '1px solid #e2e8f0',
                                                    borderRadius: 10, padding: '12px 14px',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                            <span style={{ fontSize: 16 }}>{lt?.icon || '📄'}</span>
                                                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{lt?.label || l.type}</span>
                                                            <span style={{
                                                                background: '#fef3c7', color: '#92400e', fontSize: 10,
                                                                fontWeight: 700, padding: '1px 8px', borderRadius: 10
                                                            }}>{l.days} gün</span>
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <ClockCircleOutlined style={{ fontSize: 10 }} />
                                                            {dayjs(l.startDate).format('DD MMM')} – {dayjs(l.endDate).format('DD MMM YYYY')}
                                                        </div>
                                                        {l.note && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>{l.note}</div>}
                                                    </div>
                                                    <Popconfirm title="Bu izni silmek istediğinize emin misiniz?" onConfirm={() => deleteLeave(selectedPerson, l.id)} okText="Sil" cancelText="İptal">
                                                        <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                                                    </Popconfirm>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </Drawer>

                {/* ── Ayarlar Modal ── */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16
                            }}><SettingOutlined /></div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Personel Ayarları</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Maaş ve genel ayarlar</div>
                            </div>
                        </div>
                    }
                    open={settingsModal}
                    onOk={handleSaveSettings}
                    onCancel={() => setSettingsModal(false)}
                    confirmLoading={savingSettings}
                    okText="Kaydet"
                    cancelText="Vazgeç"
                >
                    <div style={{ marginTop: 16 }}>
                        <Form form={settingsForm} layout="vertical">
                            <Form.Item
                                name="salaryPaymentDay"
                                label="Otomatik Maaş Hak Ediş Günü"
                                rules={[{ required: true, message: 'Ödeme günü zorunludur' }]}
                                tooltip="Belirtilen günde tüm aktif personelin maaş hak edişleri hesaplarına otomatik yansıtılır."
                            >
                                <Select placeholder="Gün seçin">
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                        <Option key={day} value={day}>Her ayın {day}. günü</Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Divider style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>
                                <CarOutlined /> Şöför Uygulaması Ayarları
                            </Divider>

                            <Form.Item
                                name="driverAlarmEnabled"
                                valuePropName="checked"
                                tooltip="Şöföre yaklaşan transferinden önce alarm çalar (uyumaması / geç kalmaması için)."
                            >
                                <Checkbox>Ön-Transfer Alarmı Aktif</Checkbox>
                            </Form.Item>

                            <Form.Item
                                name="driverAlarmMinutes"
                                label="Alarm Süresi (transferin kaç dakika öncesinde çalsın?)"
                                rules={[{ required: true, message: 'Süre zorunludur' }]}
                                tooltip="Belirtilen dakika kala şöför uygulamasında alarm çalar (şöför 'Hazırım' diyene kadar)."
                            >
                                <Select placeholder="Süre seçin">
                                    {[10, 15, 20, 30, 45, 60, 90, 120].map(m => (
                                        <Option key={m} value={m}>{m} dakika önce</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Form>
                    </div>
                </Modal>

            </AdminLayout>
        </AdminGuard>
    );
};

export default PersonnelListPage;
