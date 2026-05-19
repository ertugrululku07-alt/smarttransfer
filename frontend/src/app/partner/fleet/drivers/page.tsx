'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  SearchOutlined,
  UserOutlined,
  IdcardOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { Avatar } from 'antd';
import apiClient from '@/lib/api-client';
import PartnerGuard from '../../../PartnerGuard';
import PartnerLayout from '../../../PartnerLayout';

const { Title, Text } = Typography;
const { Option } = Select;
const { confirm } = Modal;

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string;
  isActive: boolean;
  createdAt: string;
}

const PartnerDriversPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<User[]>([]);
  
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchText, setSearchText] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingDriver, setEditingDriver] = useState<User | null>(null);
  const [form] = Form.useForm();

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/users');
      setDrivers(res.data?.data || []);
    } catch (err) {
      console.error('fetchDrivers error:', err);
      message.error('Sürücüler alınırken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (filterActive === 'active' && !d.isActive) return false;
      if (filterActive === 'inactive' && d.isActive) return false;

      if (searchText.trim()) {
        const s = searchText.trim().toLowerCase();
        if (!d.name.toLowerCase().includes(s) && !d.email.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [drivers, filterActive, searchText]);

  const handleNewDriver = () => {
    setEditingDriver(null);
    form.resetFields();
    form.setFieldsValue({
      isActive: true,
      role: 'DRIVER' // Mandatory for partners
    });
    setModalVisible(true);
  };

  const handleEditDriver = (driver: User) => {
    setEditingDriver(driver);
    form.setFieldsValue({
      ...driver,
      role: 'DRIVER'
    });
    setModalVisible(true);
  };

  const handleDeleteDriver = (driver: User) => {
    confirm({
      title: 'Sürücüyü silmek istediğinize emin misiniz?',
      icon: <ExclamationCircleOutlined />,
      content: 'Bu işlem geri alınamaz.',
      okText: 'Evet, Sil',
      okType: 'danger',
      cancelText: 'Hayır',
      onOk: async () => {
        try {
          await apiClient.delete(`/api/users/${driver.id}`);
          message.success('Sürücü silindi');
          fetchDrivers();
        } catch (error) {
          message.error('Silme işlemi başarısız oldu');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const payload = {
        ...values,
        role: 'DRIVER' // Security assurance
      };

      if (editingDriver) {
        await apiClient.put(`/api/users/${editingDriver.id}`, payload);
        message.success('Sürücü güncellendi');
      } else {
        await apiClient.post('/api/users', payload);
        message.success('Sürücü başarıyla eklendi');
      }

      setModalVisible(false);
      fetchDrivers();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Kayıt sırasında hata oluştu');
    }
  };

  return (
    <PartnerGuard>
      <PartnerLayout>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Filom - Sürücülerim</Title>
            <Text type="secondary">
              Sisteme kendi şoförlerinizi ekleyin. Şoförler, sürücü uygulamasını kullanarak kendi işlerini veya atadığınız işleri yönetebilir.
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={handleNewDriver}
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: 'none', fontWeight: 600, borderRadius: 8 }}
          >
            + Yeni Sürücü Ekle
          </Button>
        </div>

        <Card style={{ marginBottom: 20, borderRadius: 12, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: '12px 20px' }}>
          <Row gutter={[12, 8]} align="middle">
            <Col xs={24} sm={12} md={8}>
              <Input
                prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
                placeholder="İsim veya e-posta ara..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                value={filterActive}
                style={{ width: '100%' }}
                onChange={(val) => setFilterActive(val)}
                options={[
                  { value: 'all', label: 'Tüm Sürücüler' },
                  { value: 'active', label: '🟢 Aktif' },
                  { value: 'inactive', label: '🔴 Pasif' },
                ]}
              />
            </Col>
          </Row>
        </Card>

        <Row gutter={[20, 20]}>
          {loading && (
            <Col span={24} style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
            </Col>
          )}
          {!loading && filteredDrivers.length === 0 && (
            <Col span={24}>
              <Card style={{ textAlign: 'center', padding: 60, borderRadius: 16, border: '2px dashed #e5e7eb' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🧑‍✈️</div>
                <Title level={4} type="secondary">Henüz Sürücü Eklenmemiş</Title>
                <Text type="secondary">Araçları kullanacak sürücülerinizi hemen sisteme tanımlayın.</Text>
                <div style={{ marginTop: 24 }}>
                   <Button type="primary" onClick={handleNewDriver}>İlk Sürücümü Ekle</Button>
                </div>
              </Card>
            </Col>
          )}
          {filteredDrivers.map((d) => (
            <Col key={d.id} xs={24} sm={12} lg={8} xl={6}>
              <Card
                hoverable
                style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                bodyStyle={{ padding: 20 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <Avatar size={56} icon={<UserOutlined />} style={{ backgroundColor: '#bfdbfe', color: '#1e3a8a' }} />
                    <div>
                        <Title level={5} style={{ margin: 0 }}>{d.name}</Title>
                        <Text type="secondary" style={{ fontSize: 12 }}>{d.email}</Text>
                    </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Tag color={d.isActive ? 'green' : 'red'}>{d.isActive ? 'Sistemde Aktif' : 'Erişim Yok'}</Tag>
                    <Tag icon={<IdcardOutlined />} color="blue">Sürücü Rolü</Tag>
                </div>
                
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button flex="1" size="small" type="dashed" onClick={() => handleEditDriver(d)} style={{ flex: 1 }}>
                        <EditOutlined /> Düzenle
                    </Button>
                    <Button size="small" danger type="text" onClick={() => handleDeleteDriver(d)}>
                        <DeleteOutlined />
                    </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Modal
          title={editingDriver ? 'Sürücüyü Düzenle' : 'Yeni Sürücü Ekle'}
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          onOk={handleSubmit}
          width={500}
          okText="Kaydet"
          cancelText="İptal"
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="Ad Soyad" rules={[{ required: true }]}>
              <Input placeholder="Örn: Ahmet Yılmaz" />
            </Form.Item>
            
            <Form.Item name="email" label="E-Posta (Kullanıcı Adı)" rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="Örn: ahmet@sirket.com" />
            </Form.Item>
            
            <Form.Item 
                name="password" 
                label={editingDriver ? "Yeni Şifre (Boş bırakırsanız değişmez)" : "Giriş Şifresi"} 
                rules={[{ required: !editingDriver }]}
            >
              <Input.Password placeholder="Sürücü uygulamasına giriş için şifre" />
            </Form.Item>

            <Form.Item name="isActive" label="Hesap Durumu">
              <Select>
                <Option value={true}>Aktif (Uygulamaya Girebilir)</Option>
                <Option value={false}>Pasif (Giriş Yapamaz)</Option>
              </Select>
            </Form.Item>
          </Form>
        </Modal>

      </PartnerLayout>
    </PartnerGuard>
  );
};

export default PartnerDriversPage;
