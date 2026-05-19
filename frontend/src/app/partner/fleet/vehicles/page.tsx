'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Upload,
  Alert,
  Spin
} from 'antd';
import type { UploadChangeParam } from 'antd/es/upload';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import {
  PlusOutlined,
  EditOutlined,
  SearchOutlined,
  UserOutlined,
  LoadingOutlined,
  CarOutlined
} from '@ant-design/icons';
import { Avatar, Tooltip } from 'antd';
import apiClient, { getImageUrl } from '@/lib/api-client';
import PartnerGuard from '../../PartnerGuard';
import PartnerLayout from '../../PartnerLayout';

const { Title, Text } = Typography;
const { Option } = Select;

interface Vehicle {
  id: number;
  name: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  plateNumber: string;
  capacity: number;
  luggage?: number | null;
  vehicleType: string;
  vehicleTypeId?: string;
  isCompanyOwned: boolean;
  hasWifi: boolean;
  hasBabySeat: boolean;
  imageUrl?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

const PartnerVehiclesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchText, setSearchText] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [form] = Form.useForm();
  const [uploadLoading, setUploadLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/vehicles');
      setVehicles(res.data?.data || []);
    } catch (err) {
      console.error('fetchVehicles error:', err);
      message.error('Araçlar alınırken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicleTypes = async () => {
    try {
      const res = await apiClient.get('/api/vehicle-types');
      if (res.data.success) {
        setVehicleTypes(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching vehicle types:', error);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchVehicleTypes();
  }, []);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (filterActive === 'active' && !v.isActive) return false;
      if (filterActive === 'inactive' && v.isActive) return false;

      if (searchText.trim()) {
        const s = searchText.trim().toLowerCase();
        const text = `${v.name} ${v.brand || ''} ${v.model || ''} ${v.plateNumber}`.toLowerCase();
        if (!text.includes(s)) return false;
      }
      return true;
    });
  }, [vehicles, filterActive, searchText]);

  const handleNewVehicle = () => {
    setEditingVehicle(null);
    setImageUrl(undefined);
    form.resetFields();
    form.setFieldsValue({
      isActive: true,
      hasWifi: false,
      hasBabySeat: false,
      isCompanyOwned: true
    });
    setModalVisible(true);
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setImageUrl(vehicle.imageUrl || undefined);
    form.setFieldsValue({
      ...vehicle,
    });
    setModalVisible(true);
  };

  const handleUploadChange: UploadProps['onChange'] = (info: UploadChangeParam<UploadFile>) => {
    if (info.file.status === 'uploading') {
      setUploadLoading(true);
      return;
    }
    if (info.file.status === 'done') {
      setUploadLoading(false);
      const url = info.file.response?.data?.url;
      setImageUrl(url);
      form.setFieldValue('imageUrl', url);
      message.success('Resim yüklendi');
    } else if (info.file.status === 'error') {
      setUploadLoading(false);
      message.error('Resim yüklenemedi');
    }
  };

  const uploadButton = (
    <div>
      {uploadLoading ? <LoadingOutlined /> : <PlusOutlined />}
      <div style={{ marginTop: 8 }}>Yükle</div>
    </div>
  );

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const payload = {
        ...values,
        imageUrl,
      };

      if (editingVehicle) {
        await apiClient.put(`/api/vehicles/${editingVehicle.id}`, payload);
        message.success('Araç güncellendi');
      } else {
        await apiClient.post('/api/vehicles', payload);
        message.success('Araç başarıyla eklendi');
      }

      setModalVisible(false);
      fetchVehicles();
    } catch (err: any) {
      if (err?.errorFields) return;
      console.error('handleSubmit error:', err);
      message.error(err.response?.data?.error || 'Kayıt sırasında hata oluştu');
    }
  };

  return (
    <PartnerGuard>
      <PartnerLayout>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Filom - Araçlarım</Title>
            <Text type="secondary">
              Pazar yerinde iş alırken veya kendi işlerinizi yaparken kullanacağınız araçları buradan yönetebilirsiniz.
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={handleNewVehicle}
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', fontWeight: 600, borderRadius: 8 }}
          >
            + Yeni Araç Ekle
          </Button>
        </div>

        <Card style={{ marginBottom: 20, borderRadius: 12, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: '12px 20px' }}>
          <Row gutter={[12, 8]} align="middle">
            <Col xs={24} sm={12} md={8}>
              <Input
                prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
                placeholder="Plaka veya model ara..."
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
                  { value: 'all', label: 'Tüm Araçlar' },
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
          {!loading && filteredVehicles.length === 0 && (
            <Col span={24}>
              <Card style={{ textAlign: 'center', padding: 60, borderRadius: 16, border: '2px dashed #e5e7eb' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚗</div>
                <Title level={4} type="secondary">Henüz Araç Eklenmemiş</Title>
                <Text type="secondary">Yeni işler alabilmek için filonuza hemen bir araç ekleyin.</Text>
                <div style={{ marginTop: 24 }}>
                   <Button type="primary" onClick={handleNewVehicle}>İlk Aracımı Ekle</Button>
                </div>
              </Card>
            </Col>
          )}
          {filteredVehicles.map((v) => (
            <Col key={v.id} xs={24} sm={12} lg={8} xl={6}>
              <Card
                hoverable
                style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                bodyStyle={{ padding: 0 }}
              >
                <div style={{
                    height: 160,
                    background: v.imageUrl ? `url(${getImageUrl(v.imageUrl)}) center/cover` : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                }}>
                  {!v.imageUrl && <CarOutlined style={{ fontSize: 48, color: '#9ca3af' }} />}
                  <div style={{ position: 'absolute', top: 10, right: 10, background: v.isActive ? '#10b981' : '#ef4444', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 'bold' }}>
                    {v.isActive ? 'Aktif' : 'Pasif'}
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <Title level={5} style={{ margin: 0 }}>{v.plateNumber}</Title>
                  <Text type="secondary">{v.brand} {v.model}</Text>
                  
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                     <Tag color="blue">{v.capacity} Yolcu</Tag>
                     {v.luggage && <Tag color="orange">{v.luggage} Bagaj</Tag>}
                  </div>
                  
                  <Button block type="dashed" style={{ marginTop: 16 }} onClick={() => handleEditVehicle(v)}>
                    <EditOutlined /> Düzenle
                  </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Modal
          title={editingVehicle ? 'Aracı Düzenle' : 'Yeni Araç Ekle'}
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          onOk={handleSubmit}
          width={700}
          okText="Kaydet"
          cancelText="İptal"
        >
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item label="Araç Fotoğrafı">
                  <Upload
                    name="file"
                    listType="picture-card"
                    className="avatar-uploader"
                    showUploadList={false}
                    action="/api/upload"
                    onChange={handleUploadChange}
                    headers={{ Authorization: `Bearer ${localStorage.getItem('token')}` }}
                  >
                    {imageUrl ? <img src={getImageUrl(imageUrl)} alt="avatar" style={{ width: '100%' }} /> : uploadButton}
                  </Upload>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="plateNumber" label="Plaka" rules={[{ required: true }]}>
                  <Input placeholder="Örn: 34 ABC 123" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="vehicleTypeId" label="Araç Sınıfı/Tipi" rules={[{ required: true }]}>
                  <Select placeholder="Seçiniz" onChange={(val) => {
                      const t = vehicleTypes.find(x => x.id === val);
                      if(t) {
                          form.setFieldsValue({ capacity: t.capacity, luggage: t.luggage });
                      }
                  }}>
                    {vehicleTypes.map(vt => (
                      <Option key={vt.id} value={vt.id}>{vt.name} (Max {vt.capacity} Kişi)</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              
              <Col span={8}>
                <Form.Item name="brand" label="Marka"><Input /></Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="model" label="Model"><Input /></Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="year" label="Yıl"><InputNumber style={{ width: '100%' }} /></Form.Item>
              </Col>

              <Col span={12}>
                <Form.Item name="capacity" label="Yolcu Kapasitesi" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="luggage" label="Bagaj Kapasitesi"><InputNumber style={{ width: '100%' }} /></Form.Item>
              </Col>

              <Col span={24}>
                <Form.Item name="isActive" label="Durum">
                  <Select>
                    <Option value={true}>Aktif (İş Alabilir)</Option>
                    <Option value={false}>Pasif (Servis Dışı vb.)</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

      </PartnerLayout>
    </PartnerGuard>
  );
};

export default PartnerVehiclesPage;
