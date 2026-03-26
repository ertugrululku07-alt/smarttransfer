'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Title, Text } = Typography;
const { Option } = Select;

type UserRole = 'ADMIN' | 'COMPANY' | 'DRIVER' | 'CUSTOMER';

interface User {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: string;
  isActive: boolean; // artık backend'de gerçek kolon
}

interface UserFormValues {
  name?: string;
  email: string;
  password?: string;
  role: UserRole;
  isActive?: boolean;
}

const roleColors: Record<UserRole, string> = {
  ADMIN: 'red',
  COMPANY: 'gold',
  DRIVER: 'blue',
  CUSTOMER: 'green',
};

const AdminUsersPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchText, setSearchText] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm<UserFormValues>();

  // Kullanıcıları çek
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/users');

      console.log('USERS RAW RESPONSE >>>', res.data);

      const raw: any[] = res.data?.data || res.data || [];
      const data: User[] = raw.map((u) => ({
        ...u,
        // backend'de isActive yoksa bile güvenli olsun
        isActive: u.isActive ?? true,
      }));

      setUsers(data);
    } catch (err) {
      console.error('fetchUsers error:', err);
      message.error('Kullanıcılar alınırken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filtrelenmiş liste
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (activeFilter === 'ACTIVE' && !u.isActive) return false;
      if (activeFilter === 'INACTIVE' && u.isActive) return false;

      if (searchText.trim()) {
        const s = searchText.trim().toLowerCase();
        const txt = `${u.name || ''} ${u.email}`.toLowerCase();
        if (!txt.includes(s)) return false;
      }

      return true;
    });
  }, [users, roleFilter, activeFilter, searchText]);

  // Yeni kullanıcı
  const handleNewUser = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({
      role: 'CUSTOMER',
      isActive: true,
    });
    setModalOpen(true);
  };

  // Düzenleme
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      name: user.name || undefined,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  // Aktif / pasif
  const handleToggleActive = async (user: User, active: boolean) => {
    try {
      const res = await apiClient.patch(`/api/users/${user.id}/active`, {
        isActive: active,
      });

      const updated = res.data?.data; // Backend'ten dönen user

      // State'i lokalde güncelle
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: updated?.isActive ?? active } : u))
      );

      message.success('Kullanıcı durumu güncellendi');
    } catch (err) {
      console.error('handleToggleActive error:', err);
      message.error('Kullanıcı durumu güncellenirken hata oluştu');
    }
  };

  // Kaydet
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: UserFormValues = {
        name: values.name,
        email: values.email,
        role: values.role,
        isActive: values.isActive ?? true,
      };

      if (values.password) {
        payload.password = values.password;
      }

      if (editingUser) {
        await apiClient.put(`/api/users/${editingUser.id}`, payload);
        message.success('Kullanıcı güncellendi');
      } else {
        await apiClient.post('/api/users', payload);
        message.success('Kullanıcı eklendi');
      }

      setModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      if (err?.errorFields) {
        return;
      }
      console.error('handleSubmit error:', err);
      message.error('Kullanıcı kaydedilirken hata oluştu');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: 'Ad Soyad',
      dataIndex: 'name',
      render: (val: string | null, record: User) => (
        <div>
          <Text strong>{val || '-'}</Text>
          <br />
          <Text type="secondary">{record.email}</Text>
        </div>
      ),
    },
    {
      title: 'Rol',
      dataIndex: 'role',
      render: (role: UserRole) => <Tag color={roleColors[role]}>{role}</Tag>,
    },
    {
      title: 'Durum',
      dataIndex: 'isActive',
      render: (val: boolean) =>
        val ? <Tag color="green">Aktif</Tag> : <Tag color="red">Pasif</Tag>,
    },
    {
      title: 'Oluşturulma',
      dataIndex: 'createdAt',
      render: (val: string) =>
        val ? dayjs(val).format('DD.MM.YYYY HH:mm') : '-',
    },
    {
      title: 'İşlemler',
      key: 'actions',
      render: (_: any, record: User) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditUser(record)}
          >
            Düzenle
          </Button>
          <Switch
            checked={record.isActive}
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
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Title level={3} style={{ margin: 0 }}>
            Kullanıcı Yönetimi
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewUser}>
            Yeni Kullanıcı
          </Button>
        </div>

        {/* Filtreler */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Select<UserRole | 'ALL'>
            value={roleFilter}
            style={{ width: 180 }}
            onChange={(val) => setRoleFilter(val)}
          >
            <Option value="ALL">Tüm Roller</Option>
            <Option value="ADMIN">Admin</Option>
            <Option value="COMPANY">Firma</Option>
            <Option value="DRIVER">Şoför</Option>
            <Option value="CUSTOMER">Müşteri</Option>
          </Select>

          <Select<'ALL' | 'ACTIVE' | 'INACTIVE'>
            value={activeFilter}
            style={{ width: 180 }}
            onChange={(val) => setActiveFilter(val)}
          >
            <Option value="ALL">Tümü</Option>
            <Option value="ACTIVE">Sadece Aktif</Option>
            <Option value="INACTIVE">Sadece Pasif</Option>
          </Select>

          <Input
            placeholder="İsim / e‑posta ara"
            style={{ width: 220 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredUsers}
          columns={columns}
          pagination={{ pageSize: 20 }}
        />

        {/* Kullanıcı Modal */}
        <Modal
          open={modalOpen}
          title={editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
          onCancel={() => setModalOpen(false)}
          onOk={handleSubmit}
          okText="Kaydet"
          cancelText="İptal"
        >
          <Form form={form} layout="vertical">
            <Form.Item label="Ad Soyad" name="name">
              <Input placeholder="Ad Soyad" />
            </Form.Item>

            <Form.Item
              label="E-posta"
              name="email"
              rules={[
                { required: true, message: 'E-posta zorunludur' },
                { type: 'email', message: 'Geçerli bir e-posta girin' },
              ]}
            >
              <Input placeholder="mail@example.com" />
            </Form.Item>

            {/* Yeni kullanıcıda zorunlu, düzenlemede opsiyonel parola */}
            <Form.Item
              label="Parola"
              name="password"
              rules={
                editingUser
                  ? []
                  : [{ required: true, message: 'Parola zorunludur' }]
              }
            >
              <Input.Password placeholder={editingUser ? 'Boş bırakırsanız değişmez' : 'En az 6 karakter'} />
            </Form.Item>

            <Form.Item
              label="Rol"
              name="role"
              rules={[{ required: true, message: 'Rol seçilmelidir' }]}
            >
              <Select placeholder="Rol seçin">
                <Option value="ADMIN">Admin</Option>
                <Option value="COMPANY">Firma</Option>
                <Option value="DRIVER">Şoför</Option>
                <Option value="CUSTOMER">Müşteri</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Aktif" name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </AdminLayout>
    </AdminGuard>
  );
};

export default AdminUsersPage;