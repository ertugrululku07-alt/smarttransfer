'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Table, Tag, Space, Button, Modal, Form, Input, Select, Switch,
  Typography, message, Card, Tooltip, Badge, Avatar, Drawer, Divider, Row, Col
} from 'antd';
import {
  PlusOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  UserOutlined, SearchOutlined, TeamOutlined, SafetyCertificateOutlined,
  CarOutlined, ShopOutlined, MailOutlined, LockOutlined, IdcardOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Title, Text } = Typography;

type UserRole = 'ADMIN' | 'COMPANY' | 'DRIVER' | 'CUSTOMER';

interface User {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: string;
  isActive: boolean;
}

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ADMIN: { label: 'Yönetici', color: '#6366f1', bg: '#eef2ff', icon: <SafetyCertificateOutlined /> },
  COMPANY: { label: 'Firma / Acente', color: '#f59e0b', bg: '#fffbeb', icon: <ShopOutlined /> },
  DRIVER: { label: 'Şoför', color: '#3b82f6', bg: '#eff6ff', icon: <CarOutlined /> },
  CUSTOMER: { label: 'Müşteri', color: '#10b981', bg: '#ecfdf5', icon: <UserOutlined /> },
};

const AdminUsersPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchText, setSearchText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/users');
      const raw: any[] = res.data?.data || res.data || [];
      setUsers(raw.map((u) => ({ ...u, isActive: u.isActive ?? true })));
    } catch {
      message.error('Kullanıcılar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (activeFilter === 'ACTIVE' && !u.isActive) return false;
      if (activeFilter === 'INACTIVE' && u.isActive) return false;
      if (searchText.trim()) {
        const s = searchText.trim().toLowerCase();
        if (!`${u.name || ''} ${u.email}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [users, roleFilter, activeFilter, searchText]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.isActive).length,
    admin: users.filter(u => u.role === 'ADMIN').length,
    driver: users.filter(u => u.role === 'DRIVER').length,
  }), [users]);

  const handleNewUser = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'CUSTOMER', isActive: true });
    setDrawerOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      name: user.name || undefined,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
    setDrawerOpen(true);
  };

  const handleToggleActive = async (user: User, active: boolean) => {
    try {
      await apiClient.patch(`/api/users/${user.id}/active`, { isActive: active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: active } : u)));
      message.success(active ? 'Kullanıcı aktif edildi' : 'Kullanıcı pasife alındı');
    } catch {
      message.error('Durum güncellenirken hata oluştu');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload: any = {
        name: values.name,
        email: values.email,
        role: values.role,
        isActive: values.isActive ?? true,
      };
      if (values.password) payload.password = values.password;

      if (editingUser) {
        await apiClient.put(`/api/users/${editingUser.id}`, payload);
        message.success('Kullanıcı güncellendi');
      } else {
        if (!values.password) {
          message.error('Yeni kullanıcı için parola zorunludur');
          setSubmitting(false);
          return;
        }
        await apiClient.post('/api/users', payload);
        message.success('Kullanıcı oluşturuldu');
      }
      setDrawerOpen(false);
      fetchUsers();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.error || 'Kaydetme hatası';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const columns = [
    {
      title: 'Kullanıcı',
      key: 'user',
      render: (_: any, record: User) => {
        const cfg = ROLE_CONFIG[record.role] || ROLE_CONFIG.CUSTOMER;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar
              size={40}
              style={{
                background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                fontWeight: 700, fontSize: 14, flexShrink: 0
              }}
            >{getInitials(record.name)}</Avatar>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {record.name || 'İsimsiz Kullanıcı'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{record.email}</div>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Rol',
      dataIndex: 'role',
      width: 160,
      render: (role: UserRole) => {
        const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.CUSTOMER;
        return (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: cfg.bg, border: `1px solid ${cfg.color}30`,
            borderRadius: 8, padding: '4px 12px'
          }}>
            <span style={{ color: cfg.color, fontSize: 13 }}>{cfg.icon}</span>
            <span style={{ fontWeight: 600, color: cfg.color, fontSize: 12 }}>{cfg.label}</span>
          </div>
        );
      }
    },
    {
      title: 'Durum',
      dataIndex: 'isActive',
      width: 100,
      render: (val: boolean) => (
        <Badge
          status={val ? 'success' : 'error'}
          text={<span style={{ fontSize: 12, fontWeight: 600, color: val ? '#10b981' : '#ef4444' }}>
            {val ? 'Aktif' : 'Pasif'}
          </span>}
        />
      )
    },
    {
      title: 'Kayıt Tarihi',
      dataIndex: 'createdAt',
      width: 140,
      render: (val: string) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {val ? dayjs(val).format('DD.MM.YYYY HH:mm') : '—'}
        </span>
      )
    },
    {
      title: 'İşlemler',
      key: 'actions',
      width: 160,
      render: (_: any, record: User) => (
        <Space size={8}>
          <Tooltip title="Düzenle">
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditUser(record)}
              style={{ color: '#6366f1', borderRadius: 6 }}
            />
          </Tooltip>
          <Switch
            checked={record.isActive}
            size="small"
            checkedChildren={<CheckCircleOutlined />}
            unCheckedChildren={<CloseCircleOutlined />}
            onChange={(checked) => handleToggleActive(record, checked)}
          />
        </Space>
      ),
    },
  ];

  return (
    <AdminGuard>
      <AdminLayout selectedKey="users">
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
                <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Kullanıcı Yönetimi</Title>
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>Sistem kullanıcılarını yönetin</Text>
              </div>
            </div>
            <Space>
              <Tooltip title="Yenile">
                <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading} style={{ borderRadius: 8 }} />
              </Tooltip>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleNewUser}
                style={{
                  borderRadius: 10, fontWeight: 600, height: 40,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', boxShadow: '0 4px 12px #6366f140'
                }}
              >Yeni Kullanıcı</Button>
            </Space>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Toplam', value: stats.total, color: '#6366f1', icon: <TeamOutlined /> },
              { label: 'Aktif', value: stats.active, color: '#10b981', icon: <CheckCircleOutlined /> },
              { label: 'Yönetici', value: stats.admin, color: '#f59e0b', icon: <SafetyCertificateOutlined /> },
              { label: 'Şoför', value: stats.driver, color: '#3b82f6', icon: <CarOutlined /> },
            ].map((s, i) => (
              <div key={i} style={{
                background: `linear-gradient(135deg, ${s.color}08, ${s.color}15)`,
                border: `1px solid ${s.color}25`, borderRadius: 12, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: `${s.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: s.color, fontSize: 18
                }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select
                value={roleFilter}
                style={{ width: 170 }}
                onChange={(val) => setRoleFilter(val)}
                options={[
                  { value: 'ALL', label: 'Tüm Roller' },
                  { value: 'ADMIN', label: '🛡 Yönetici' },
                  { value: 'COMPANY', label: '🏢 Firma / Acente' },
                  { value: 'DRIVER', label: '🚗 Şoför' },
                  { value: 'CUSTOMER', label: '👤 Müşteri' },
                ]}
              />
              <Select
                value={activeFilter}
                style={{ width: 160 }}
                onChange={(val) => setActiveFilter(val)}
                options={[
                  { value: 'ALL', label: 'Tüm Durumlar' },
                  { value: 'ACTIVE', label: '✅ Aktif' },
                  { value: 'INACTIVE', label: '❌ Pasif' },
                ]}
              />
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="İsim veya e-posta ile ara..."
                style={{ width: 260, borderRadius: 8 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                {filteredUsers.length} / {users.length} kullanıcı
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }} bodyStyle={{ padding: 0 }}>
            <Table
              rowKey="id"
              loading={loading}
              dataSource={filteredUsers}
              columns={columns}
              pagination={{
                pageSize: 15,
                showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} kullanıcı`,
                style: { padding: '12px 16px', margin: 0 }
              }}
              size="middle"
            />
          </Card>
        </div>

        {/* User Drawer */}
        <Drawer
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: editingUser ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 16
              }}>{editingUser ? <EditOutlined /> : <PlusOutlined />}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                  {editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
                </div>
                {editingUser && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{editingUser.email}</div>
                )}
              </div>
            </div>
          }
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ wrapper: { width: 440 } }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '8px 0' }}>
              <Button onClick={() => setDrawerOpen(false)} style={{ borderRadius: 8 }}>Vazgeç</Button>
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={submitting}
                style={{
                  borderRadius: 8, fontWeight: 600,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none'
                }}
              >Kaydet</Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" size="large">
            <Form.Item label="Ad Soyad" name="name">
              <Input prefix={<IdcardOutlined style={{ color: '#94a3b8' }} />} placeholder="Kullanıcının tam adı" style={{ borderRadius: 8 }} />
            </Form.Item>

            <Form.Item
              label="E-posta Adresi"
              name="email"
              rules={[
                { required: true, message: 'E-posta zorunludur' },
                { type: 'email', message: 'Geçerli bir e-posta girin' },
              ]}
            >
              <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="kullanici@ornek.com" style={{ borderRadius: 8 }} />
            </Form.Item>

            <Form.Item
              label={editingUser ? 'Yeni Parola (Opsiyonel)' : 'Parola'}
              name="password"
              rules={editingUser ? [] : [{ required: true, message: 'Parola zorunludur' }, { min: 6, message: 'En az 6 karakter' }]}
              extra={editingUser ? 'Boş bırakırsanız mevcut parola korunur' : undefined}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder={editingUser ? '••••••••' : 'En az 6 karakter'}
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Divider style={{ margin: '16px 0' }} />

            <Form.Item
              label="Kullanıcı Rolü"
              name="role"
              rules={[{ required: true, message: 'Rol seçilmelidir' }]}
            >
              <Select placeholder="Rol seçin" style={{ borderRadius: 8 }}>
                {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([key, cfg]) => (
                  <Select.Option key={key} value={key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: cfg.color }}>{cfg.icon}</span>
                      <span style={{ fontWeight: 600 }}>{cfg.label}</span>
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Hesap Durumu" name="isActive" valuePropName="checked">
              <Switch
                checkedChildren="Aktif"
                unCheckedChildren="Pasif"
                style={{ width: 80 }}
              />
            </Form.Item>
          </Form>
        </Drawer>

      </AdminLayout>
    </AdminGuard>
  );
};

export default AdminUsersPage;
