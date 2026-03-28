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
  Switch,
  message,
  Upload,
  Tabs,
} from 'antd';
import type { UploadChangeParam } from 'antd/es/upload';
import type { RcFile, UploadFile, UploadProps } from 'antd/es/upload/interface';
import {
  PlusOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  SearchOutlined,
  UserOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { Avatar, List, Tooltip } from 'antd';
import apiClient, { getImageUrl } from '@/lib/api-client';
import dayjs from 'dayjs';
import { useBranding } from '../context/BrandingContext';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

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
  vehicleTypeId?: number;
  vehicleClass?: string | null;
  basePricePerKm?: number | null;
  basePricePerHour?: number | null;
  isCompanyOwned: boolean;
  hasWifi: boolean;
  hasBabySeat: boolean;
  maxBabySeats?: number | null;
  imageUrl?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  usageType: string;
  shuttleMode?: string | null;
  zonePrices?: any[];
}

interface VehicleFormValues {
  name: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  plateNumber: string;
  capacity: number;
  luggage?: number;
  vehicleType: string;
  vehicleTypeId?: number;
  vehicleClass?: string;
  basePricePerKm?: number;
  basePricePerHour?: number;
  isCompanyOwned?: boolean;
  hasWifi?: boolean;
  hasBabySeat?: boolean;
  maxBabySeats?: number;
  imageUrl?: string;
  description?: string;
  isActive?: boolean;
  usageType?: string;
  shuttleMode?: string | null;
  metadata?: {
    openingFee?: number;
    fixedPrice?: number;
  };
  currency?: string;
  zonePrices?: any[];
}

const VehiclesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]); // Added vehicleTypes state

  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [vehicleClassFilter, setVehicleClassFilter] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [form] = Form.useForm<VehicleFormValues>();
  const [uploadLoading, setUploadLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();

  // Driver assignment state
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [selectedVehicleForDriver, setSelectedVehicleForDriver] = useState<Vehicle | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  /* MOCK DATA REMOVED */

  const [zones, setZones] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/api/vehicles');
      const data: Vehicle[] = res.data?.data || [];
      setVehicles(data);
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

  const fetchZones = async () => {
    try {
      const res = await apiClient.get('/api/zones');
      if (res.data.success) {
        setZones(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching zones:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/api/tenant/info');
      if (res.data.success && res.data.data.tenant?.settings) {
        const settings = res.data.data.tenant.settings;
        if (settings.hubs) setHubs(settings.hubs);
        if (settings.definitions?.currencies) {
            setCurrencies(settings.definitions.currencies);
        } else {
            setCurrencies([{code: 'TRY', symbol: '₺'}, {code: 'USD', symbol: '$'}, {code: 'EUR', symbol: '€'}]);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchVehicleTypes();
    fetchZones();
    fetchSettings();
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const res = await apiClient.get('/api/personnel');
      if (res.data.success) {
        const DRIVER_KEYWORDS = ['driver', 'şöför', 'sofor', 'sürücü', 'surucü', 'surücu'];
        const driverList = res.data.data.filter((p: any) => {
          const title = (p.jobTitle || '').toLowerCase().trim();
          return DRIVER_KEYWORDS.some(kw => title.includes(kw));
        });
        setDrivers(driverList);
      }
    } catch (err) {
      console.error('fetchDrivers error:', err);
    }
  };

  const handleAssignDriver = async (vehicleId: number | string, driverId: string | null) => {
    setDriverLoading(true);
    try {
      await apiClient.patch(`/api/vehicles/${vehicleId}/driver`, { driverId });
      message.success(driverId ? 'Şöför atandı' : 'Şöför ataması kaldırıldı');
      fetchVehicles();
      setDriverModalVisible(false);
    } catch (err) {
      message.error('Şöför atanamadı');
    } finally {
      setDriverLoading(false);
    }
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (filterActive === 'active' && !v.isActive) return false;
      if (filterActive === 'inactive' && v.isActive) return false;
      if (vehicleClassFilter && v.vehicleClass !== vehicleClassFilter) return false;

      if (searchText.trim()) {
        const s = searchText.trim().toLowerCase();
        const text =
          `${v.name} ${v.brand || ''} ${v.model || ''} ${v.plateNumber}`.toLowerCase();
        if (!text.includes(s)) return false;
      }

      return true;
    });
  }, [vehicles, filterActive, vehicleClassFilter, searchText]);

  const handleNewVehicle = () => {
    setEditingVehicle(null);
    setImageUrl(undefined);
    form.resetFields();
    form.setFieldsValue({
      isCompanyOwned: true,
      hasWifi: true,
      hasBabySeat: false,
      isActive: true,
      usageType: 'TRANSFER',
      shuttleMode: undefined,
      zonePrices: [],
      currency: undefined,
    });
    setModalVisible(true);
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setImageUrl(vehicle.imageUrl || undefined);
    form.setFieldsValue({
      name: vehicle.name,
      brand: vehicle.brand || undefined,
      model: vehicle.model || undefined,
      year: vehicle.year || undefined,
      color: vehicle.color || undefined,
      plateNumber: vehicle.plateNumber,
      capacity: vehicle.capacity,
      luggage: vehicle.luggage || undefined,
      // vehicleType: vehicle.vehicleType, // Legacy string
      vehicleTypeId: (vehicle as any).vehicleTypeId, // Use ID if available
      vehicleClass: vehicle.vehicleClass || undefined,
      basePricePerKm: vehicle.basePricePerKm || undefined,
      basePricePerHour: vehicle.basePricePerHour || undefined,
      isCompanyOwned: vehicle.isCompanyOwned,
      hasWifi: vehicle.hasWifi,
      hasBabySeat: vehicle.hasBabySeat,
      maxBabySeats: vehicle.maxBabySeats || undefined,
      imageUrl: vehicle.imageUrl || undefined,
      description: vehicle.description || undefined,
      isActive: vehicle.isActive,
      usageType: vehicle.usageType || 'TRANSFER',
      shuttleMode: vehicle.shuttleMode || undefined,
      zonePrices: vehicle.zonePrices || [],
      metadata: {
        openingFee: (vehicle as any).openingFee,
        fixedPrice: (vehicle as any).fixedPrice
      },
      currency: (vehicle as any).currency,
    });

    // Fallback if ID is missing (legacy records), set ID by searching name match (optional but good)
    if (!(vehicle as any).vehicleTypeId && vehicleTypes.length > 0) {
      const match = vehicleTypes.find(t => t.category === vehicle.vehicleType);
      if (match) {
        form.setFieldsValue({ vehicleTypeId: match.id });
      }
    }

    setModalVisible(true);
  };

  const handleToggleActive = async (vehicle: Vehicle, active: boolean) => {
    try {
      await apiClient.patch(`/api/vehicles/${vehicle.id}/active`, {
        isActive: active,
      });
      message.success('Araç durumu güncellendi');
      fetchVehicles();
    } catch (err) {
      console.error('handleToggleActive error:', err);
      message.error('Araç durumu güncellenirken hata oluştu');
    }
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

      // Extract metadata fields from values (if any)
      const metadataForm = (values as any).metadata || {};

      // Get the selected type object to send legacy "vehicleType" string as backup/display
      const selectedType = vehicleTypes.find(t => t.id === values.vehicleTypeId);

      const payload: any = {
        ...values,
        imageUrl: imageUrl,
        isCompanyOwned: values.isCompanyOwned,
        shuttleMode: values.usageType === 'SHUTTLE' ? values.shuttleMode : null,
        // Map metadata fields to root for backend
        openingFee: metadataForm.openingFee,
        fixedPrice: metadataForm.fixedPrice,
        basePricePerKm: (values as any).basePricePerKm,
        basePricePerHour: (values as any).basePricePerHour,
        zonePrices: values.zonePrices,
        // Send vehicleType string for legacy compatibility/display
        vehicleType: selectedType ? selectedType.name : 'Unknown'
      };

      if (editingVehicle) {
        await apiClient.put(
          `/api/vehicles/${editingVehicle.id}`,
          payload
        );
        message.success('Araç güncellendi');
      } else {
        await apiClient.post('/api/vehicles', payload);
        message.success('Araç eklendi');
      }

      setModalVisible(false);
      fetchVehicles();
    } catch (err: any) {
      if (err?.errorFields) {
        return;
      }
      console.error('handleSubmit error:', err);
      if (err.response) {
        message.error(`Hata: ${err.response.data?.error || err.message}`);
      } else {
        message.error('Araç kaydedilirken hata oluştu');
      }
    }
  };

  const onVehicleTypeChange = (typeId: string) => {
    const type = vehicleTypes.find(t => t.id === typeId);
    if (type) {
      form.setFieldsValue({
        capacity: type.capacity,
        luggage: type.luggage,
        vehicleClass: type.category // Auto-select category/class if strictly mapped
      });
    }
  };

  const USAGE_LABELS: Record<string, { label: string; color: string }> = {
    TRANSFER: { label: 'Özel Transfer', color: '#6366f1' },
    SHUTTLE: { label: 'Shuttle', color: '#0ea5e9' },
    TOUR: { label: 'Tur', color: '#f59e0b' },
  };

  const CLASS_COLORS: Record<string, string> = {
    ECONOMY: '#64748b',
    BUSINESS: '#0891b2',
    VIP: '#7c3aed',
    MINIBUS: '#ca8a04',
    BUS: '#dc2626',
  };

  const CLASS_LABELS: Record<string, string> = {
    ECONOMY: 'Economy', BUSINESS: 'Business', VIP: 'VIP', MINIBUS: 'Minibüs', BUS: 'Otöbüs'
  };


  return (
    <AdminGuard>
      <AdminLayout selectedKey="vehicles">
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Araç Yönetimi</Title>
            <Text type="secondary">
              Toplam <strong>{vehicles.length}</strong> araç &mdash;
              Aktif: <strong style={{ color: '#16a34a' }}>{vehicles.filter(v => v.isActive).length}</strong> /
              Pasif: <strong style={{ color: '#dc2626' }}>{vehicles.filter(v => !v.isActive).length}</strong>
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={handleNewVehicle}
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none', fontWeight: 600, borderRadius: 8 }}
          >
            + Yeni Araç
          </Button>
        </div>

        {/* Filter Bar */}
        <Card
          style={{ marginBottom: 20, borderRadius: 12, border: '1px solid #f0f0f0' }}
          bodyStyle={{ padding: '12px 20px' }}
        >
          <Row gutter={[12, 8]} align="middle">
            <Col xs={24} sm={8} md={6}>
              <Input
                prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
                placeholder="Plaka, isim veya marka ara..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                size="middle"
              />
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Select
                value={filterActive}
                style={{ width: '100%' }}
                onChange={(val) => setFilterActive(val)}
                options={[
                  { value: 'all', label: '✅ Tüm Araçlar' },
                  { value: 'active', label: '🟢 Aktif' },
                  { value: 'inactive', label: '🔴 Pasif' },
                ]}
              />
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Select
                allowClear
                placeholder="Sınıf Filtrele"
                style={{ width: '100%' }}
                value={vehicleClassFilter}
                onChange={(val) => setVehicleClassFilter(val)}
                options={[
                  { value: 'ECONOMY', label: 'Economy' },
                  { value: 'BUSINESS', label: 'Business' },
                  { value: 'VIP', label: 'VIP' },
                  { value: 'MINIBUS', label: 'Minibüs' },
                  { value: 'BUS', label: 'Otöbüs' },
                ]}
              />
            </Col>
            <Col xs={24} md={8} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['TRANSFER', 'SHUTTLE', 'TOUR'].map(t => (
                <Button
                  key={t}
                  size="small"
                  style={{
                    background: USAGE_LABELS[t].color,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600
                  }}
                  onClick={() => setSearchText(t === searchText ? '' : t)}
                >
                  {USAGE_LABELS[t].label}
                </Button>
              ))}
            </Col>
          </Row>
        </Card>

        {/* Vehicle Grid */}
        <Row gutter={[20, 20]}>
          {loading && (
            <Col span={24} style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 24, color: '#6366f1' }}>Yükleniyor...</div>
            </Col>
          )}
          {!loading && filteredVehicles.length === 0 && (
            <Col span={24}>
              <Card style={{ textAlign: 'center', padding: 60, borderRadius: 16, border: '2px dashed #e5e7eb' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚗</div>
                <Title level={4} type="secondary">Araç bulunamadı</Title>
                <Text type="secondary">Filtrelerinizi değiştirin veya yeni bir araç ekleyin.</Text>
              </Card>
            </Col>
          )}
          {filteredVehicles.map((v) => {
            const usageInfo = USAGE_LABELS[v.usageType] || { label: v.usageType, color: '#6b7280' };
            const classColor = CLASS_COLORS[v.vehicleClass || ''] || '#6b7280';
            const classLabel = CLASS_LABELS[v.vehicleClass || ''] || v.vehicleClass || '';

            return (
              <Col key={v.id} xs={24} sm={12} lg={8} xl={6}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: v.isActive ? '1px solid #e0e7ff' : '1px solid #fee2e2',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    transition: 'all 0.25s ease',
                    opacity: v.isActive ? 1 : 0.75,
                  }}
                  bodyStyle={{ padding: 0 }}
                >
                  {/* Image / Gradient Header */}
                  <div style={{
                    height: 140,
                    background: v.imageUrl
                      ? `url(${getImageUrl(v.imageUrl)}) center/cover`
                      : `linear-gradient(135deg, ${usageInfo.color}22 0%, ${classColor}33 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}>
                    {!v.imageUrl && (
                      <div style={{ fontSize: 52, opacity: 0.6 }}>
                        {v.usageType === 'SHUTTLE' ? '🚌' : v.usageType === 'TOUR' ? '🗯️' : '🚗'}
                      </div>
                    )}
                    {/* Status Badge */}
                    <div style={{
                      position: 'absolute',
                      top: 10, right: 10,
                      background: v.isActive ? '#16a34a' : '#dc2626',
                      color: 'white',
                      borderRadius: 20,
                      padding: '2px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}>
                      {v.isActive ? '• Aktif' : '• Pasif'}
                    </div>
                    {/* Usage Type Badge */}
                    <div style={{
                      position: 'absolute',
                      top: 10, left: 10,
                      background: usageInfo.color,
                      color: 'white',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {usageInfo.label}
                    </div>
                    {/* Plate Number */}
                    <div style={{
                      position: 'absolute',
                      bottom: 10, left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.65)',
                      backdropFilter: 'blur(4px)',
                      color: 'white',
                      borderRadius: 6,
                      padding: '3px 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: 2,
                    }}>
                      {v.plateNumber}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '14px 16px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 14, display: 'block' }} ellipsis={{ tooltip: v.name }}>
                          {v.name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                          {[v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean).join(' ')}
                        </Text>
                      </div>
                      {classLabel && (
                        <div style={{
                          background: classColor + '18',
                          color: classColor,
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                          marginLeft: 8,
                        }}>
                          {classLabel}
                        </div>
                      )}
                    </div>

                    {/* Features Row */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                        🧑 {v.capacity} Yolcu
                      </span>
                      {v.luggage != null && (
                        <span style={{ background: '#fff7ed', color: '#ea580c', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                          🧳 {v.luggage} Bagaj
                        </span>
                      )}
                      {v.hasWifi && (
                        <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                          📡 WiFi
                        </span>
                      )}
                      {v.hasBabySeat && (
                        <span style={{ background: '#fdf4ff', color: '#9333ea', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                          👶 Bebek
                        </span>
                      )}
                    </div>

                    {/* Type name */}
                    {(v as any).vehicleTypeDetails?.name && (
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        {(v as any).vehicleTypeDetails.name}
                      </Text>
                    )}

                    {/* Usage Type inline dropdown */}
                                                                   {/* This block uses `vehicleDetails` which is not defined in this scope. */}
                                                                   {/* It is placed here as per user instruction. */}
                                                                   {/* If `vehicleDetails` is meant to be `v`, please clarify. */}
                                                                   {/* {vehicleDetails.image && (
                                                    <img
                                                        src={getImageUrl(vehicleDetails.image)}
                                                        alt={vehicleDetails.vehicleType}
                                                        style={{ width: '100%', borderRadius: 8, marginBottom: 8, objectFit: 'cover' }}
                                                    />
                                                )} */}
                   <Select
                      size="small"
                      value={v.usageType || 'TRANSFER'}
                      style={{ width: '100%', marginBottom: 10 }}
                      onChange={async (newType) => {
                        try {
                          await apiClient.put(`/api/vehicles/${v.id}`, {
                            ...v,
                            usageType: newType,
                            shuttleMode: newType === 'SHUTTLE' ? (v.shuttleMode || 'FLEXIBLE') : null,
                          });
                          message.success('Güncellendi');
                          fetchVehicles();
                        } catch { message.error('Güncelleme başarısız'); }
                      }}
                      options={[
                        { value: 'TRANSFER', label: '🚗 Özel Transfer' },
                        { value: 'SHUTTLE', label: '🚌 Shuttle' },
                        { value: 'TOUR', label: '🗯️ Tur' },
                      ]}
                    />

                    {/* Assigned Driver Badge */}
                    {(v as any).driverId && (() => {
                      const assignedDriver = drivers.find((d: any) =>
                        (d.user?.id || d.id) === (v as any).driverId ||
                        d.id === (v as any).driverId
                      );
                      return assignedDriver ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '4px 8px', background: '#f0fdf4', borderRadius: 6 }}>
                          <Avatar size={20} src={getImageUrl(assignedDriver.photo)} icon={<UserOutlined />} style={{ background: '#16a34a' }} />
                          <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                            🚗 {assignedDriver.firstName} {assignedDriver.lastName}
                          </Text>
                        </div>
                      ) : null;
                    })()}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditVehicle(v)}
                        style={{ flex: 1, borderRadius: 6, minWidth: 80 }}
                      >
                        Düzenle
                      </Button>
                      <Tooltip title="Bu araca bir şöför ata">
                        <Button
                          size="small"
                          icon={<UserOutlined />}
                          onClick={() => {
                            setSelectedVehicleForDriver(v);
                            setDriverSearch('');
                            setDriverModalVisible(true);
                          }}
                          style={{
                            flex: 1,
                            borderRadius: 6,
                            minWidth: 80,
                            background: (v as any).driverId ? '#f0fdf4' : '#faf5ff',
                            borderColor: (v as any).driverId ? '#16a34a' : '#9333ea',
                            color: (v as any).driverId ? '#16a34a' : '#9333ea',
                            fontWeight: 600,
                          }}
                        >
                          Şöför Ata
                        </Button>
                      </Tooltip>
                      <Switch
                        size="small"
                        checked={v.isActive}
                        checkedChildren="Aktif"
                        unCheckedChildren="Pasif"
                        onChange={(checked) => handleToggleActive(v, checked)}
                      />
                    </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* Driver Assignment Modal */}
        <Modal
          open={driverModalVisible}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserOutlined style={{ color: '#9333ea' }} />
              <span>Şöför Ata{selectedVehicleForDriver ? ` — ${selectedVehicleForDriver.plateNumber}` : ''}</span>
            </div>
          }
          onCancel={() => setDriverModalVisible(false)}
          footer={null}
          width={520}
        >
          <Input
            prefix={<SearchOutlined />}
            placeholder="Şöför ara..."
            value={driverSearch}
            onChange={(e) => setDriverSearch(e.target.value)}
            style={{ marginBottom: 12 }}
            allowClear
          />
          {selectedVehicleForDriver && (selectedVehicleForDriver as any).driverId && (
            <Button
              danger
              size="small"
              style={{ marginBottom: 12 }}
              onClick={() => handleAssignDriver(selectedVehicleForDriver!.id, null)}
              loading={driverLoading}
            >
              Şöför Atamasını Kaldır
            </Button>
          )}
          <List
            loading={driverLoading}
            dataSource={drivers.filter((d: any) => {
              const q = driverSearch.toLowerCase();
              return !q || `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) || (d.phone || '').includes(q);
            })}
            locale={{ emptyText: 'Şöför bulunamadı. Personel listesinde görev "Şöför" olan birini ekleyin.' }}
            renderItem={(d: any) => {
              const driverId = d.user?.id || d.id;
              const isCurrentDriver = selectedVehicleForDriver && (selectedVehicleForDriver as any).driverId === driverId;
              // Find if driver is assigned to another vehicle
              const otherVehicle = !isCurrentDriver && vehicles.find((veh: any) => veh.driverId === driverId);
              return (
                <List.Item
                  key={d.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginBottom: 6,
                    background: isCurrentDriver ? '#f0fdf4' : '#fafafa',
                    border: isCurrentDriver ? '1px solid #86efac' : '1px solid #f0f0f0',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  actions={
                    otherVehicle
                      ? []
                      : [
                        <Button
                          key="assign"
                          type={isCurrentDriver ? 'default' : 'primary'}
                          size="small"
                          loading={driverLoading}
                          onClick={() => handleAssignDriver(selectedVehicleForDriver!.id, driverId)}
                          style={{
                            background: isCurrentDriver ? undefined : 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)',
                            border: 'none',
                            color: isCurrentDriver ? undefined : 'white',
                          }}
                        >
                          {isCurrentDriver ? '✓ Atandı' : 'Ata'}
                        </Button>
                      ]
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        src={getImageUrl(d.photo)}
                        icon={<UserOutlined />}
                        style={{ background: isCurrentDriver ? '#16a34a' : '#9333ea' }}
                      />
                    }
                    title={
                      <span style={{ fontWeight: 600 }}>
                        {d.firstName} {d.lastName}
                        {isCurrentDriver && <span style={{ color: '#16a34a', marginLeft: 6, fontSize: 11 }}>● Atanmış</span>}
                      </span>
                    }
                    description={
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {d.phone && <span>📞 {d.phone} </span>}
                        {otherVehicle && (
                          <span style={{ color: '#f59e0b' }}>
                            <CarOutlined /> {(otherVehicle as any).plateNumber} aracında atanmış
                          </span>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Modal>

        <Modal
          open={modalVisible}
          title={editingVehicle ? 'Araç Düzenle' : 'Yeni Araç Ekle'}
          onCancel={() => setModalVisible(false)}
          onOk={handleSubmit}
          width={800}
          okText="Kaydet"
          cancelText="İptal"
        >
          <Form form={form} layout="vertical">
            <Tabs defaultActiveKey="1" items={[
              {
                key: '1',
                label: 'Araç Özellikleri',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          label="Araç Adı"
                          name="name"
                          rules={[{ required: true, message: 'Araç adı zorunludur' }]}
                        >
                          <Input placeholder="Örn: Mercedes E Serisi - Sedan" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          label="Plaka"
                          name="plateNumber"
                          rules={[{ required: true, message: 'Plaka zorunludur' }]}
                        >
                          <Input placeholder="34 ABC 123" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item label="Marka" name="brand">
                          <Input placeholder="Mercedes, VW, Ford..." />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Model" name="model">
                          <Input placeholder="E220d, Caravelle..." />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Yıl" name="year">
                          <InputNumber placeholder="2023" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item label="Renk" name="color">
                          <Input placeholder="Siyah, Beyaz..." />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          label="Kapasite (Yolcu)"
                          name="capacity"
                          rules={[{ required: true, message: 'Kapasite zorunludur' }]}
                        >
                          <InputNumber min={1} max={50} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Bagaj Kapasitesi" name="luggage">
                          <InputNumber min={0} max={20} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={8}>
                        {/* Dynamic Vehicle Type Selection */}
                        <Form.Item
                          label="Araç Tipi"
                          name="vehicleTypeId"
                          rules={[{ required: true, message: 'Araç tipi seçiniz' }]}
                        >
                          <Select
                            placeholder="Seçiniz"
                            onChange={onVehicleTypeChange}
                            showSearch
                            optionFilterProp="children"
                          >
                            {vehicleTypes.map(t => (
                              <Option key={t.id} value={t.id}>{t.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          label="Kullanım Tipi"
                          name="usageType"
                          rules={[{ required: true, message: 'Kullanım tipi zorunludur' }]}
                        >
                          <Select placeholder="Seçiniz">
                            <Option value="TRANSFER">Özel Transfer</Option>
                            <Option value="SHUTTLE">Shuttle / Paylaşımlı</Option>
                            <Option value="TOUR">Tur Aracı</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Araç Sınıfı" name="vehicleClass">
                          <Select placeholder="Seçiniz" allowClear>
                            <Option value="ECONOMY">Ekonomik (Economy)</Option>
                            <Option value="BUSINESS">Business</Option>
                            <Option value="VIP">VIP</Option>
                            <Option value="MINIBUS">Minibüs</Option>
                            <Option value="BUS">Otobüs</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>

                    {/* Sadece SHUTTLE için göster */}
                    <Form.Item noStyle shouldUpdate>
                      {() => {
                        const usageType = form.getFieldValue('usageType');
                        if (usageType !== 'SHUTTLE') return null;

                        return (
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item
                                label="Shuttle Modu"
                                name="shuttleMode"
                                rules={[{ required: true, message: 'Shuttle modu zorunludur' }]}
                              >
                                <Select placeholder="Seçiniz">
                                  <Option value="ROUTE_BASED">Sabit Hat</Option>
                                  <Option value="FLEXIBLE">Esnek / Koltuk Bazlı</Option>
                                </Select>
                              </Form.Item>
                            </Col>
                          </Row>
                        );
                      }}
                    </Form.Item>

                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item label="Bebek Koltuğu" name="hasBabySeat" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Maks. Bebek Koltuğu" name="maxBabySeats">
                          <InputNumber min={0} max={5} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Ücretsiz WiFi" name="hasWifi" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                )
              },
              {
                key: '2',
                label: 'Diğer',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item label="Şirket Aracı" name="isCompanyOwned" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Aktif" name="isActive" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item label="Fotoğraf">
                      <Upload
                        name="file"
                        listType="picture-card"
                        className="avatar-uploader"
                        showUploadList={false}
                        action={`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload`}
                        headers={{
                          Authorization: typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('token')}` : '',
                        }}
                        onChange={handleUploadChange}
                      >
                        {imageUrl ? <img src={getImageUrl(imageUrl)} alt="avatar" style={{ width: '100%', objectFit: 'contain' }} /> : uploadButton}
                      </Upload>
                    </Form.Item>
                    <Form.Item name="imageUrl" hidden>
                      <Input />
                    </Form.Item>

                    <Form.Item label="Açıklama / Notlar" name="description">
                      <Input.TextArea rows={3} placeholder="Ek bilgiler..." />
                    </Form.Item>
                  </>
                )
              }
            ]} />
          </Form>
        </Modal>
      </AdminLayout>
    </AdminGuard>
  );
};

export default VehiclesPage;
