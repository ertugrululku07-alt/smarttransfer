'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Checkbox, message, Tag, Space, Typography, Tooltip, Spin, Divider, Badge, Empty } from 'antd';
import {
    SafetyCertificateOutlined,
    EditOutlined,
    EyeOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    LockOutlined,
    TeamOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import { useAuth } from '@/app/context/AuthContext';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;

// ─── Module & Action Definitions (must match backend) ────────────────────────
const MODULE_DEFINITIONS = [
    { module: 'dashboard', label: 'Panel', icon: '📊' },
    { module: 'reservations', label: 'Rezervasyonlar', icon: '📅' },
    { module: 'operations', label: 'Operasyon Yönetimi', icon: '⚙️' },
    { module: 'accounting', label: 'Muhasebe', icon: '🏦' },
    { module: 'partners', label: 'Partner / Acente', icon: '👥' },
    { module: 'banks', label: 'Banka Yönetimi', icon: '💳' },
    { module: 'vehicles', label: 'Araç & Fiyat Tanımları', icon: '🚗' },
    { module: 'vehicle-tracking', label: 'Araç Takip', icon: '📍' },
    { module: 'personnel', label: 'Personel Tanımları', icon: '👤' },
    { module: 'campaigns', label: 'Kampanyalar & Sadakat', icon: '🎁' },
    { module: 'reports', label: 'Raporlar', icon: '📈' },
    { module: 'settings', label: 'Ayarlar & Kullanıcılar', icon: '⚙️' },
    { module: 'live-support', label: 'Canlı Destek', icon: '💬' },
];

const ACTION_LABELS: Record<string, string> = {
    view: 'Görüntüleme',
    create: 'Ekleme',
    update: 'Düzenleme',
    delete: 'Silme',
};

const ROLE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    SUPER_ADMIN: { label: 'Süper Admin', color: 'red' },
    TENANT_ADMIN: { label: 'Firma Yöneticisi', color: 'volcano' },
    TENANT_MANAGER: { label: 'Müdür', color: 'orange' },
    TENANT_STAFF: { label: 'Personel', color: 'blue' },
    PLATFORM_OPS: { label: 'Platform Operasyon', color: 'purple' },
    DRIVER: { label: 'Şoför', color: 'green' },
    PARTNER: { label: 'Partner', color: 'cyan' },
    AGENCY_ADMIN: { label: 'Acente Yöneticisi', color: 'geekblue' },
    AGENCY_STAFF: { label: 'Acente Personeli', color: 'lime' },
    CUSTOMER: { label: 'Müşteri', color: 'default' },
    AIRPORT_STAFF: { label: 'Havalimanı Personeli', color: 'magenta' },
};

interface Permission {
    id: string;
    module: string;
    resource: string;
    action: string;
    scope?: string;
}

interface Role {
    id: string;
    name: string;
    code: string;
    type: string;
    description?: string;
    isSystem: boolean;
    isActive: boolean;
    userCount: number;
    permissions: Permission[];
    createdAt: string;
}

export default function RoleManagementPage() {
    const { user } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    // Generate permissions client-side as fallback
    const generateLocalPermissions = (): Permission[] => {
        const perms: Permission[] = [];
        MODULE_DEFINITIONS.forEach(mod => {
            ['view', 'create', 'update', 'delete'].forEach(action => {
                perms.push({ id: `${mod.module}:${action}`, module: mod.module, resource: mod.module, action });
            });
        });
        return perms;
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const rolesRes = await apiClient.get('/api/roles');

            if (rolesRes.data.success) {
                setRoles(rolesRes.data.data);
            }
            // allPermissions comes from the same response now
            if (rolesRes.data.allPermissions && rolesRes.data.allPermissions.length > 0) {
                setAllPermissions(rolesRes.data.allPermissions);
            } else {
                // Fallback: try dedicated endpoint
                try {
                    const permsRes = await apiClient.get('/api/roles/permissions');
                    if (permsRes.data.success && permsRes.data.data?.permissions?.length > 10) {
                        setAllPermissions(permsRes.data.data.permissions);
                    } else {
                        // Last resort: generate client-side
                        setAllPermissions(generateLocalPermissions());
                    }
                } catch {
                    setAllPermissions(generateLocalPermissions());
                }
            }
        } catch (error) {
            console.error('Failed to load roles:', error);
            message.error('Roller yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openEditModal = async (role: Role) => {
        setSelectedRole(role);
        // Map role permissions to matching keys in allPermissions
        const rolePermKeys = role.permissions.map(p => `${p.module}:${p.action}`);
        const matchedIds = allPermissions
            .filter(ap => rolePermKeys.includes(`${ap.module}:${ap.action}`))
            .map(ap => ap.id);
        setSelectedPermissionIds(new Set(matchedIds));
        setEditModalOpen(true);
    };

    const handleTogglePermission = (permId: string) => {
        setSelectedPermissionIds(prev => {
            const next = new Set(prev);
            if (next.has(permId)) {
                next.delete(permId);
            } else {
                next.add(permId);
            }
            return next;
        });
    };

    const handleToggleModule = (moduleName: string) => {
        const modulePerms = allPermissions.filter(p => p.module === moduleName);
        const allSelected = modulePerms.every(p => selectedPermissionIds.has(p.id));

        setSelectedPermissionIds(prev => {
            const next = new Set(prev);
            modulePerms.forEach(p => {
                if (allSelected) {
                    next.delete(p.id);
                } else {
                    next.add(p.id);
                }
            });
            return next;
        });
    };

    const handleSelectAll = () => {
        const allIds = allPermissions.map(p => p.id);
        const allSelected = allIds.every(id => selectedPermissionIds.has(id));
        if (allSelected) {
            setSelectedPermissionIds(new Set());
        } else {
            setSelectedPermissionIds(new Set(allIds));
        }
    };

    const handleSavePermissions = async () => {
        if (!selectedRole) return;

        try {
            setSaving(true);
            const selected = Array.from(selectedPermissionIds);
            // If IDs contain ':' they are module:action keys, send as moduleActions
            const isModuleKeys = selected.length > 0 && selected[0].includes(':');
            const body = isModuleKeys
                ? { moduleActions: selected }
                : { permissions: selected };
            const res = await apiClient.put(`/api/roles/${selectedRole.id}/permissions`, body);

            if (res.data.success) {
                message.success(`${selectedRole.name} yetkileri güncellendi`);
                setEditModalOpen(false);
                fetchData();
            }
        } catch (error: any) {
            const errMsg = error?.response?.data?.error || 'Yetkiler güncellenemedi';
            message.error(errMsg);
        } finally {
            setSaving(false);
        }
    };

    const isFullAccess = (role: Role) => {
        return role.type === 'SUPER_ADMIN' || role.type === 'TENANT_ADMIN';
    };

    const getPermissionCount = (role: Role) => {
        if (isFullAccess(role)) return allPermissions.length;
        return role.permissions.length;
    };

    const columns = [
        {
            title: 'Rol',
            key: 'name',
            render: (_: any, role: Role) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: isFullAccess(role) ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : '#f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {isFullAccess(role)
                            ? <LockOutlined style={{ color: '#fff', fontSize: 18 }} />
                            : <SafetyCertificateOutlined style={{ color: '#64748b', fontSize: 18 }} />
                        }
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{role.name}</div>
                        <Tag color={ROLE_TYPE_LABELS[role.type]?.color || 'default'} style={{ fontSize: 11, marginTop: 2 }}>
                            {ROLE_TYPE_LABELS[role.type]?.label || role.type}
                        </Tag>
                    </div>
                </div>
            ),
        },
        {
            title: 'Kullanıcı Sayısı',
            key: 'userCount',
            width: 130,
            align: 'center' as const,
            render: (_: any, role: Role) => (
                <Badge count={role.userCount} showZero color={role.userCount > 0 ? '#3b82f6' : '#d1d5db'}
                    style={{ fontSize: 12, fontWeight: 600 }} />
            ),
        },
        {
            title: 'Yetkiler',
            key: 'permissions',
            width: 200,
            render: (_: any, role: Role) => {
                const count = getPermissionCount(role);
                const total = allPermissions.length;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                    <div>
                        <div style={{
                            height: 6, borderRadius: 3, background: '#f1f5f9',
                            overflow: 'hidden', marginBottom: 4
                        }}>
                            <div style={{
                                height: '100%', borderRadius: 3,
                                width: `${pct}%`,
                                background: pct === 100 ? 'linear-gradient(90deg, #10b981, #059669)' : pct > 50 ? '#3b82f6' : '#f59e0b',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>
                            {isFullAccess(role) ? 'Tam Yetki' : `${count} / ${total} yetki`}
                        </Text>
                    </div>
                );
            },
        },
        {
            title: 'Modül Erişimi',
            key: 'modules',
            render: (_: any, role: Role) => {
                if (isFullAccess(role)) {
                    return <Tag color="success" icon={<CheckCircleFilled />}>Tüm Modüller</Tag>;
                }
                const modules = [...new Set(role.permissions.map(p => p.module))];
                if (modules.length === 0) {
                    return <Tag color="default" icon={<CloseCircleFilled />}>Yetki Yok</Tag>;
                }
                return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {modules.slice(0, 4).map(mod => {
                            const def = MODULE_DEFINITIONS.find(m => m.module === mod);
                            return <Tag key={mod} style={{ fontSize: 11 }}>{def?.icon} {def?.label || mod}</Tag>;
                        })}
                        {modules.length > 4 && (
                            <Tag style={{ fontSize: 11 }}>+{modules.length - 4} daha</Tag>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'İşlem',
            key: 'action',
            width: 100,
            align: 'center' as const,
            render: (_: any, role: Role) => {
                if (isFullAccess(role)) {
                    return (
                        <Tooltip title="Bu rol tam yetkilidir, düzenlenemez">
                            <Button size="small" icon={<EyeOutlined />} disabled>
                                Görüntüle
                            </Button>
                        </Tooltip>
                    );
                }
                return (
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(role)}
                    >
                        Yetkilendir
                    </Button>
                );
            },
        },
    ];

    return (
        <AdminGuard requiredModule="settings">
            <AdminLayout selectedKey="role-management">
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ marginBottom: 24 }}>
                        <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <SafetyCertificateOutlined /> Rol & Yetki Yönetimi
                        </Title>
                        <Text type="secondary">
                            Rollere modül bazlı yetki atayın. Her modül için Görüntüleme, Ekleme, Düzenleme ve Silme yetkileri ayrı ayrı ayarlanabilir.
                        </Text>
                    </div>

                    <Card
                        bodyStyle={{ padding: 0 }}
                        style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                    >
                        <Table
                            dataSource={roles}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            pagination={false}
                            locale={{ emptyText: <Empty description="Henüz rol tanımlı değil" /> }}
                        />
                    </Card>
                </div>

                {/* ─── Permission Edit Modal ─── */}
                <Modal
                    open={editModalOpen}
                    onCancel={() => setEditModalOpen(false)}
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <SafetyCertificateOutlined style={{ color: '#3b82f6' }} />
                            <span>{selectedRole?.name} — Yetki Düzenleme</span>
                            <Tag color={ROLE_TYPE_LABELS[selectedRole?.type || '']?.color}>
                                {ROLE_TYPE_LABELS[selectedRole?.type || '']?.label}
                            </Tag>
                        </div>
                    }
                    width={900}
                    footer={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {selectedPermissionIds.size} / {allPermissions.length} yetki seçili
                                </Text>
                            </div>
                            <Space>
                                <Button onClick={() => setEditModalOpen(false)}>İptal</Button>
                                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSavePermissions}>
                                    Kaydet
                                </Button>
                            </Space>
                        </div>
                    }
                >
                    {/* Select All / Deselect All */}
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 14 }}>Modül Yetkileri</Text>
                        <Button size="small" type="link" onClick={handleSelectAll}>
                            {allPermissions.every(p => selectedPermissionIds.has(p.id)) ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                        </Button>
                    </div>

                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                        {MODULE_DEFINITIONS.map(mod => {
                            const modulePerms = allPermissions.filter(p => p.module === mod.module);
                            const selectedCount = modulePerms.filter(p => selectedPermissionIds.has(p.id)).length;
                            const allSelected = modulePerms.length > 0 && selectedCount === modulePerms.length;
                            const someSelected = selectedCount > 0 && selectedCount < modulePerms.length;

                            return (
                                <div
                                    key={mod.module}
                                    style={{
                                        border: '1px solid #f0f0f0',
                                        borderRadius: 10,
                                        padding: '12px 16px',
                                        marginBottom: 8,
                                        background: selectedCount > 0 ? '#f0f9ff' : '#fafafa',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Checkbox
                                                checked={allSelected}
                                                indeterminate={someSelected}
                                                onChange={() => handleToggleModule(mod.module)}
                                            />
                                            <span style={{ fontSize: 16 }}>{mod.icon}</span>
                                            <Text strong style={{ fontSize: 14 }}>{mod.label}</Text>
                                        </div>
                                        <Tag style={{ fontSize: 11 }}>
                                            {selectedCount} / {modulePerms.length}
                                        </Tag>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, paddingLeft: 32 }}>
                                        {['view', 'create', 'update', 'delete'].map(action => {
                                            const perm = modulePerms.find(p => p.action === action);
                                            if (!perm) return null;
                                            return (
                                                <Checkbox
                                                    key={action}
                                                    checked={selectedPermissionIds.has(perm.id)}
                                                    onChange={() => handleTogglePermission(perm.id)}
                                                >
                                                    <span style={{
                                                        fontSize: 13,
                                                        color: selectedPermissionIds.has(perm.id) ? '#1e293b' : '#94a3b8'
                                                    }}>
                                                        {ACTION_LABELS[action]}
                                                    </span>
                                                </Checkbox>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
}
