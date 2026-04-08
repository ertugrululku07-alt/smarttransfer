'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  TimePicker,
  DatePicker,
  message,
  Space,
  Tag,
  Checkbox,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  MinusCircleOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import apiClient from '../../../lib/api-client';
import moment from 'moment';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import AdminMapPickerModal from '../components/AdminMapPickerModal';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Title } = Typography;

interface ShuttleRoute {
  id: number;
  vehicleId: number;
  vehicle?: { name: string; plateNumber: string };
  fromName: string;
  toName: string;
  scheduleType: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  departureTimes: string[];
  pricePerSeat: number;
  currency?: string;
  maxSeats: number;
  isActive: boolean;
  customStartDate?: string | null;
  customEndDate?: string | null;
  weeklyDays?: string[] | null;
  pickupLocation?: string | { lat: number; lng: number; address: string } | null;
  pickupRadius?: number | null;
  pickupPolygon?: { lat: number; lng: number }[] | null;
}

interface Vehicle {
  id: number;
  name: string;
  plateNumber: string;
  vehicleType: string;
  capacity: number;
  usageType?: string | string[] | null;
}

const WEEK_DAYS = [
  { value: 'MON', label: 'Pazartesi' },
  { value: 'TUE', label: 'Salı' },
  { value: 'WED', label: 'Çarşamba' },
  { value: 'THU', label: 'Perşembe' },
  { value: 'FRI', label: 'Cuma' },
  { value: 'SAT', label: 'Cumartesi' },
  { value: 'SUN', label: 'Pazar' },
];

const AdminShuttleRoutesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingRoute, setEditingRoute] = useState<ShuttleRoute | null>(null);
  const [shuttleRoutes, setShuttleRoutes] = useState<ShuttleRoute[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Location State
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [pickupRadius, setPickupRadius] = useState<number>(1000);
  const [pickupPolygon, setPickupPolygon] = useState<{ lat: number; lng: number }[] | null>(null);

  const scheduleType: 'DAILY' | 'WEEKLY' | 'CUSTOM' = Form.useWatch('scheduleType', form) || 'DAILY';

  const fetchShuttleRoutes = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/shuttle-routes');
      const parsedRoutes = response.data.data.map((route: any) => ({
        ...route,
        departureTimes: typeof route.departureTimes === 'string' ? JSON.parse(route.departureTimes) : route.departureTimes,
        weeklyDays: route.weeklyDays
          ? (typeof route.weeklyDays === 'string' ? JSON.parse(route.weeklyDays) : route.weeklyDays)
          : [],
        pickupPolygon: route.pickupPolygon
          ? (typeof route.pickupPolygon === 'string' ? JSON.parse(route.pickupPolygon) : route.pickupPolygon)
          : null,
      }));
      setShuttleRoutes(parsedRoutes);
    } catch (error) {
      message.error('Shuttle rotaları alınırken hata oluştu.');
      console.error('Error fetching shuttle routes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const response = await apiClient.get('/api/vehicles');
      setVehicles(response.data.data);
    } catch (error) {
      message.error('Araçlar alınırken hata oluştu.');
      console.error('Error fetching vehicles:', error);
    }
  };

  const fetchCurrencies = async () => {
    try {
      const res = await apiClient.get('/api/tenant/info');
      const settings = res.data?.data?.tenant?.settings || {};
      const defs = settings.definitions || { currencies: [] };
      setCurrencies(defs.currencies || []);
    } catch (error) {
      console.error('Error fetching currencies:', error);
    }
  };

  useEffect(() => {
    fetchShuttleRoutes();
    fetchVehicles();
    fetchCurrencies();
  }, []);

  const showModal = (route?: ShuttleRoute) => {
    if (route) {
      setEditingRoute(route);

      if (route.pickupLocation) {
        const loc = typeof route.pickupLocation === 'string' ? JSON.parse(route.pickupLocation) : route.pickupLocation;
        setPickupLocation(loc as { lat: number; lng: number; address: string });
      } else {
        setPickupLocation(null);
      }
      setPickupRadius(route.pickupRadius || 1000);

      if (route.pickupPolygon) {
        const poly = typeof route.pickupPolygon === 'string' ? JSON.parse(route.pickupPolygon) : route.pickupPolygon;
        setPickupPolygon(poly);
      } else {
        setPickupPolygon(null);
      }

      form.setFieldsValue({
        vehicleId: route.vehicleId,
        fromName: route.fromName,
        toName: route.toName,
        scheduleType: route.scheduleType,
        departureTimes: route.departureTimes, // Pass strings directly
        pricePerSeat: route.pricePerSeat,
        currency: route.currency || 'EUR',
        maxSeats: route.maxSeats,
        isActive: route.isActive,
        customDateRange: route.customStartDate && route.customEndDate
          ? [moment(route.customStartDate, 'YYYY-MM-DD'), moment(route.customEndDate, 'YYYY-MM-DD')]
          : null,
        weeklyDays: route.weeklyDays || [],
        isBidirectional: false,
        returnDepartureTimes: [],
      });
    } else {
      setEditingRoute(null);
      setPickupLocation(null);
      setPickupRadius(1000);
      setPickupPolygon(null);
      form.resetFields();
      form.setFieldsValue({
        isActive: true,
        scheduleType: 'DAILY',
        weeklyDays: [],
        departureTimes: ['08:00'], // Default string
        currency: 'EUR',
        isBidirectional: false,
        returnDepartureTimes: [],
      });
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setEditingRoute(null);
  };

  const handleLocationConfirm = (address: string, lat: number, lng: number, radius: number, polygonPath?: { lat: number; lng: number }[]) => {
    // If polygon is selected but no address is resolved, use a placeholder
    const finalAddress = address || (polygonPath ? "Harita Üzerinde Seçili Alan (Polygon)" : "");

    setPickupLocation({ lat, lng, address: finalAddress });
    setPickupRadius(radius);
    setPickupPolygon(polygonPath || null);
    form.setFieldsValue({ fromName: finalAddress });
  };

  // Generate time options (every 15 mins)
  const timeOptions: { value: string; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 60; j += 15) {
      const hour = i.toString().padStart(2, '0');
      const minute = j.toString().padStart(2, '0');
      const time = `${hour}:${minute}`;
      timeOptions.push({ value: time, label: time });
    }
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // No need to format, Select gives strings directly
      const formattedDepartureTimes = values.departureTimes || [];

      const customStartDate = values.scheduleType === 'CUSTOM' && values.customDateRange?.length === 2
        ? (values.customDateRange[0] as moment.Moment).format('YYYY-MM-DD')
        : null;

      const customEndDate = values.scheduleType === 'CUSTOM' && values.customDateRange?.length === 2
        ? (values.customDateRange[1] as moment.Moment).format('YYYY-MM-DD')
        : null;

      const weeklyDays = values.scheduleType === 'WEEKLY' && values.weeklyDays ? values.weeklyDays : [];

      const payload = {
        vehicleId: values.vehicleId,
        fromName: values.fromName,
        toName: values.toName,
        scheduleType: values.scheduleType,
        departureTimes: formattedDepartureTimes.sort(), // Sort times
        pricePerSeat: Number(values.pricePerSeat),
        currency: values.currency || 'EUR',
        maxSeats: Number(values.maxSeats),
        isActive: values.isActive ?? true,
        customStartDate,
        customEndDate,
        weeklyDays,
        pickupLocation,
        pickupRadius,
        pickupPolygon,
        isBidirectional: values.isBidirectional,
        returnDepartureTimes: values.returnDepartureTimes ? values.returnDepartureTimes.sort() : []
      };

      if (editingRoute) {
        await apiClient.put(`/api/shuttle-routes/${editingRoute.id}`, payload);
        message.success('Shuttle rotası başarıyla güncellendi.');
      } else {
        await apiClient.post('/api/shuttle-routes', payload);
        message.success('Shuttle rotası başarıyla eklendi.');
      }

      setIsModalVisible(false);
      form.resetFields();
      setEditingRoute(null);
      fetchShuttleRoutes();
    } catch (error) {
      console.error('Error saving shuttle route:', error);
      message.error('İşlem sırasında bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRouteStatus = async (route: ShuttleRoute) => {
    setLoading(true);
    try {
      await apiClient.patch(`/api/shuttle-routes/${route.id}/active`, { isActive: !route.isActive });
      message.success('Shuttle rotası durumu güncellendi.');
      fetchShuttleRoutes();
    } catch (error) {
      console.error('Error toggling route status:', error);
      message.error('Durum güncellenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const shuttleVehicles = vehicles.filter((v) => Array.isArray(v.usageType) ? v.usageType.includes('SHUTTLE') : v.usageType === 'SHUTTLE');

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    {
      title: 'Araç',
      dataIndex: 'vehicle',
      key: 'vehicle',
      render: (vehicle: any) => vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})` : 'N/A',
    },
    { title: 'Nereden', dataIndex: 'fromName', key: 'fromName' },
    { title: 'Nereye', dataIndex: 'toName', key: 'toName' },
    {
      title: 'Çalışma Tipi',
      dataIndex: 'scheduleType',
      key: 'scheduleType',
      render: (type: string) => {
        if (type === 'DAILY') return 'Her Gün';
        if (type === 'WEEKLY') return 'Haftalık';
        if (type === 'CUSTOM') return 'Özel Dönem';
        return type;
      },
    },
    {
      title: 'Tarih Aralığı',
      key: 'dateRange',
      render: (record: ShuttleRoute) =>
        record.customStartDate && record.customEndDate
          ? `${record.customStartDate} - ${record.customEndDate}`
          : record.scheduleType === 'CUSTOM' ? 'Belirtilmemiş' : '-',
    },
    {
      title: 'Kalkış Saatleri',
      dataIndex: 'departureTimes',
      key: 'departureTimes',
      render: (times: string[]) => (
        <Space size={[0, 8]} wrap>
          {times.map((time, index) => <Tag key={index} color="blue">{time}</Tag>)}
        </Space>
      ),
    },
    {
      title: 'Fiyat',
      dataIndex: 'pricePerSeat',
      key: 'pricePerSeat',
      render: (price: number, record: ShuttleRoute) => {
        const c = currencies?.find((cur: any) => cur.code === (record.currency || 'EUR'));
        return `${price} ${c?.symbol || record.currency || '€'}`;
      },
    },
    {
      title: 'Durum',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean, record: ShuttleRoute) => (
        <Switch
          checked={isActive}
          onChange={() => toggleRouteStatus(record)}
          checkedChildren="Aktif"
          unCheckedChildren="Pasif"
        />
      ),
    },
    {
      title: 'Aksiyonlar',
      key: 'actions',
      render: (text: any, record: ShuttleRoute) => (
        <Space size="middle">
          <Button icon={<EditOutlined />} onClick={() => showModal(record)} type="primary" ghost>
            Düzenle
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <AdminGuard>
      <AdminLayout selectedKey="shuttle">
        <Title level={3}>Shuttle Hatları Yönetimi</Title>

        <AdminMapPickerModal
          visible={isMapModalVisible}
          onCancel={() => setIsMapModalVisible(false)}
          onConfirm={handleLocationConfirm}
          initialAddress={pickupLocation?.address}
          initialLocation={pickupLocation ? { lat: pickupLocation.lat, lng: pickupLocation.lng } : null}
          initialRadius={pickupRadius}
          initialPolygonPath={pickupPolygon || []}
          initialDrawingMode={pickupPolygon && pickupPolygon.length > 0 ? "polygon" : "circle"}
          country="tr"
        />

        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
            Yeni Shuttle Hattı
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={shuttleRoutes}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1400 }}
        />

        <Modal
          title={editingRoute ? 'Shuttle Hattı Düzenle' : 'Yeni Shuttle Hattı'}
          open={isModalVisible}
          onOk={handleOk}
          onCancel={handleCancel}
          confirmLoading={loading}
          width={800}
        >
          <Form form={form} layout="vertical" name="shuttle_route_form">
            <Form.Item
              name="vehicleId"
              label="Araç"
              rules={[{ required: true, message: 'Lütfen bir araç seçin!' }]}
            >
              <Select placeholder="Sabit hatlı shuttle aracı seç">
                {shuttleVehicles.map((vehicle) => (
                  <Option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} ({vehicle.plateNumber}) - {vehicle.vehicleType}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="fromName"
              label="Nereden (Kalkış Noktası)"
              rules={[{ required: true, message: 'Kalkış noktasını seçin!' }]}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <Input readOnly placeholder="Haritadan seçin" value={pickupLocation?.address} />
                <Button icon={<EnvironmentOutlined />} onClick={() => setIsMapModalVisible(true)}>
                  Haritadan Seç
                </Button>
              </div>
            </Form.Item>
            {pickupPolygon ? (
              <div style={{ marginBottom: 16, color: '#1890ff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <EnvironmentOutlined />
                <strong>Özel Alan (Polygon) Seçildi</strong>
              </div>
            ) : pickupLocation && (
              <div style={{ marginBottom: 16, color: '#666', fontSize: 12 }}>
                Kapsama Alanı: {pickupRadius} metre
              </div>
            )}

            <Form.Item
              name="toName"
              label="Nereye"
              rules={[{ required: true, message: 'Varış noktasını girin!' }]}
            >
              <Input placeholder="Örn: Taksim Meydanı" />
            </Form.Item>

            <Form.Item
              name="scheduleType"
              label="Çalışma Tipi"
              rules={[{ required: true, message: 'Lütfen çalışma tipi seçin!' }]}
            >
              <Select>
                <Option value="DAILY">Her Gün</Option>
                <Option value="WEEKLY">Haftalık</Option>
                <Option value="CUSTOM">Özel Dönem</Option>
              </Select>
            </Form.Item>

            {scheduleType === 'CUSTOM' && (
              <Form.Item
                name="customDateRange"
                label="Başlangıç / Bitiş Tarihi"
                rules={[{ required: true, message: 'Lütfen tarih aralığını seçin!' }]}
              >
                <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} placeholder={['Başlangıç Tarihi', 'Bitiş Tarihi']} />
              </Form.Item>
            )}

            {scheduleType === 'WEEKLY' && (
              <Form.Item
                name="weeklyDays"
                label="Haftanın Günleri"
                rules={[{ required: true, message: 'Lütfen en az bir gün seçin!' }]}
              >
                <Checkbox.Group style={{ width: '100%' }}>
                  <Space wrap>
                    {WEEK_DAYS.map((day) => (
                      <Checkbox key={day.value} value={day.value}>{day.label}</Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              </Form.Item>
            )}

            <Form.Item
              name="departureTimes"
              label="Kalkış Saatleri"
              rules={[{ required: true, message: 'En az bir kalkış saati seçin!' }]}
            >
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="Saat seçin veya yazın (örn: 08:30)"
                options={timeOptions}
                allowClear
                tokenSeparators={[',', ' ']}
                dropdownRender={(menu) => (
                  <>
                    <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <Button 
                        type="primary" 
                        size="small"
                        style={{ flex: 1 }}
                        onClick={() => form.setFieldsValue({ departureTimes: timeOptions.map(t => t.value) })}
                      >
                        Tümünü Seç
                      </Button>
                      <Button 
                        type="default" 
                        danger
                        size="small"
                        style={{ flex: 1 }}
                        onClick={() => form.setFieldsValue({ departureTimes: [] })}
                      >
                        Tümünü Temizle
                      </Button>
                    </div>
                    {menu}
                  </>
                )}
              />
            </Form.Item>

            {/* Return times moved to a point where they show up if bidirectional is checked */}
            <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.isBidirectional !== currentValues.isBidirectional}>
              {({ getFieldValue }) =>
                getFieldValue('isBidirectional') ? (
                  <Form.Item
                    name="returnDepartureTimes"
                    label="Dönüş Kalkış Saatleri"
                    rules={[{ required: true, message: 'Dönüş rotası için en az bir kalkış saati seçin!' }]}
                  >
                    <Select
                      mode="tags"
                      style={{ width: '100%' }}
                      placeholder="Dönüş saatlerini seçin veya yazın (örn: 14:30)"
                      options={timeOptions}
                      allowClear
                      tokenSeparators={[',', ' ']}
                      dropdownRender={(menu) => (
                        <>
                          <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <Button 
                              type="primary" 
                              size="small"
                              style={{ flex: 1 }}
                              onClick={() => form.setFieldsValue({ returnDepartureTimes: timeOptions.map(t => t.value) })}
                            >
                              Tümünü Seç
                            </Button>
                            <Button 
                              type="default" 
                              danger
                              size="small"
                              style={{ flex: 1 }}
                              onClick={() => form.setFieldsValue({ returnDepartureTimes: [] })}
                            >
                              Tümünü Temizle
                            </Button>
                          </div>
                          {menu}
                        </>
                      )}
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            <Form.Item label="Kişi Başı Fiyat" required>
              <Input.Group compact>
                <Form.Item
                  name="pricePerSeat"
                  noStyle
                  rules={[{ required: true, message: 'Lütfen kişi başı fiyatı girin!' }]}
                >
                  <Input type="number" min={0} step={0.01} placeholder="Örn: 10.00" style={{ width: 'calc(100% - 100px)' }} />
                </Form.Item>
                <Form.Item
                  name="currency"
                  noStyle
                  rules={[{ required: true, message: 'Para birimi seçin' }]}
                >
                  <Select style={{ width: 100 }} placeholder="Birim">
                    {currencies.map((c) => (
                      <Option key={c.code} value={c.code}>
                        {c.code} ({c.symbol})
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Input.Group>
            </Form.Item>

            <Form.Item
              name="maxSeats"
              label="Maks. Koltuk"
              rules={[{ required: true, message: 'Lütfen maksimum koltuk sayısını girin!' }]}
            >
              <Input type="number" min={1} placeholder="Örn: 4" />
            </Form.Item>

            <Space size="large" style={{ width: '100%', justifyContent: 'flex-start' }}>
              <Form.Item name="isActive" label="Durum (Aktif)" valuePropName="checked">
                <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
              </Form.Item>
              <Form.Item name="isBidirectional" label="Çift Yönlü Hat Oluştur" valuePropName="checked">
                <Switch checkedChildren="Evet" unCheckedChildren="Hayır" />
              </Form.Item>
            </Space>
          </Form>
        </Modal>
      </AdminLayout>
    </AdminGuard>
  );
};

export default AdminShuttleRoutesPage;
