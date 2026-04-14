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
  Badge,
  Row,
  Col,
  Tooltip,
  Card,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  MinusCircleOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  CarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import apiClient from '../../../lib/api-client';
import moment from 'moment';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface ShuttleRoute {
  id: number;
  vehicleId: number;
  vehicle?: { name: string; plateNumber: string; brand?: string; model?: string };
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
  metadata?: any;
}

interface Vehicle {
  id: number;
  name: string;
  plateNumber: string;
  vehicleType: string;
  capacity: number;
  usageType?: string | string[] | null;
}

interface Zone {
  id: string;
  name: string;
  color: string;
  polygon: { lat: number; lng: number }[];
}

interface Hub {
  name: string;
  code: string;
  keywords: string;
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

const DAY_MAP: Record<string, string> = { MON: 'Pzt', TUE: 'Sal', WED: 'Çar', THU: 'Per', FRI: 'Cum', SAT: 'Cmt', SUN: 'Paz' };

const AdminShuttleRoutesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingRoute, setEditingRoute] = useState<ShuttleRoute | null>(null);
  const [shuttleRoutes, setShuttleRoutes] = useState<ShuttleRoute[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Zone & Hub State
  const [zones, setZones] = useState<Zone[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);

  // Selected zone polygon (auto-populated when zone is selected)
  const [selectedZonePolygon, setSelectedZonePolygon] = useState<{ lat: number; lng: number }[] | null>(null);

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
      if (settings.hubs && Array.isArray(settings.hubs)) {
        setHubs(settings.hubs);
      }
    } catch (error) {
      console.error('Error fetching currencies:', error);
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

  useEffect(() => {
    fetchShuttleRoutes();
    fetchVehicles();
    fetchCurrencies();
    fetchZones();
  }, []);

  // Handle zone selection — auto-assign polygon
  const handleZoneChange = (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
      setSelectedZonePolygon(zone.polygon || null);
      form.setFieldsValue({ fromName: zone.name });
    } else {
      setSelectedZonePolygon(null);
    }
  };

  // Handle hub selection — auto-assign toName
  const handleHubChange = (hubCode: string) => {
    const hub = hubs.find(h => h.code === hubCode);
    if (hub) {
      form.setFieldsValue({ toName: hub.name });
    }
  };

  const showModal = (route?: ShuttleRoute) => {
    if (route) {
      setEditingRoute(route);
      const matchedZone = zones.find(z => z.name.toLowerCase() === route.fromName?.toLowerCase());
      const matchedHub = hubs.find(h => h.name.toLowerCase() === route.toName?.toLowerCase() || h.code.toLowerCase() === route.toName?.toLowerCase());

      if (route.pickupPolygon) {
        const poly = typeof route.pickupPolygon === 'string' ? JSON.parse(route.pickupPolygon) : route.pickupPolygon;
        setSelectedZonePolygon(poly);
      } else if (matchedZone) {
        setSelectedZonePolygon(matchedZone.polygon || null);
      } else {
        setSelectedZonePolygon(null);
      }

      form.setFieldsValue({
        vehicleId: route.vehicleId,
        fromName: route.fromName,
        fromZoneId: matchedZone?.id || undefined,
        toName: route.toName,
        toHubCode: matchedHub?.code || undefined,
        scheduleType: route.scheduleType,
        departureTimes: route.departureTimes,
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
      setSelectedZonePolygon(null);
      form.resetFields();
      form.setFieldsValue({
        isActive: true,
        scheduleType: 'DAILY',
        weeklyDays: [],
        departureTimes: ['08:00'],
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

      const formattedDepartureTimes = values.departureTimes || [];
      const customStartDate = values.scheduleType === 'CUSTOM' && values.customDateRange?.length === 2
        ? (values.customDateRange[0] as moment.Moment).format('YYYY-MM-DD') : null;
      const customEndDate = values.scheduleType === 'CUSTOM' && values.customDateRange?.length === 2
        ? (values.customDateRange[1] as moment.Moment).format('YYYY-MM-DD') : null;
      const weeklyDays = values.scheduleType === 'WEEKLY' && values.weeklyDays ? values.weeklyDays : [];

      const selectedZone = zones.find(z => z.id === values.fromZoneId);
      const selectedHub = hubs.find(h => h.code === values.toHubCode);
      const resolvedFromName = selectedZone?.name || values.fromName;
      const resolvedToName = selectedHub?.name || values.toName;

      let pickupLocation = null;
      const polygonToUse = selectedZone?.polygon || selectedZonePolygon;
      if (polygonToUse && polygonToUse.length > 0) {
        const avgLat = polygonToUse.reduce((s: number, p: any) => s + p.lat, 0) / polygonToUse.length;
        const avgLng = polygonToUse.reduce((s: number, p: any) => s + p.lng, 0) / polygonToUse.length;
        pickupLocation = { lat: avgLat, lng: avgLng, address: resolvedFromName };
      }

      const payload = {
        vehicleId: values.vehicleId,
        fromName: resolvedFromName,
        toName: resolvedToName,
        scheduleType: values.scheduleType,
        departureTimes: formattedDepartureTimes.sort(),
        pricePerSeat: Number(values.pricePerSeat),
        currency: values.currency || 'EUR',
        maxSeats: Number(values.maxSeats),
        isActive: values.isActive ?? true,
        customStartDate, customEndDate, weeklyDays,
        pickupLocation,
        pickupRadius: null,
        pickupPolygon: polygonToUse || null,
        isBidirectional: values.isBidirectional,
        returnDepartureTimes: values.returnDepartureTimes ? values.returnDepartureTimes.sort() : [],
        metadata: { fromZoneId: values.fromZoneId || null, toHubCode: values.toHubCode || null }
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
  const activeCount = shuttleRoutes.filter(r => r.isActive).length;

  const columns: any[] = [
    {
      title: 'Rota',
      key: 'route',
      width: 320,
      render: (_: any, record: ShuttleRoute) => {
        const vehicle = record.vehicle;
        const vehicleName = vehicle ? `${(vehicle as any).brand || ''} ${(vehicle as any).model || ''}`.trim() : 'N/A';
        const plate = vehicle ? (vehicle as any).plateNumber : '';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: record.isActive
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: record.isActive ? '0 4px 14px rgba(99,102,241,0.3)' : 'none'
            }}>
              <CarOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#ecfdf5', color: '#059669', padding: '1px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600
                }}>
                  <EnvironmentOutlined style={{ fontSize: 10 }} />
                  {record.fromName}
                </span>
                <SwapOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#eff6ff', color: '#2563eb', padding: '1px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600
                }}>
                  <GlobalOutlined style={{ fontSize: 10 }} />
                  {record.toName}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CarOutlined style={{ fontSize: 11 }} />
                {vehicleName} {plate ? <Tag style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 5px', borderRadius: 4, fontFamily: 'monospace' }}>{plate}</Tag> : null}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Program',
      key: 'schedule',
      width: 160,
      render: (_: any, record: ShuttleRoute) => {
        const type = record.scheduleType;
        const tagColor = type === 'DAILY' ? '#10b981' : type === 'WEEKLY' ? '#f59e0b' : '#8b5cf6';
        const tagBg = type === 'DAILY' ? '#ecfdf5' : type === 'WEEKLY' ? '#fffbeb' : '#f5f3ff';
        const label = type === 'DAILY' ? 'Her Gün' : type === 'WEEKLY' ? 'Haftalık' : 'Özel Dönem';
        return (
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 8,
              background: tagBg, color: tagColor, fontWeight: 600, fontSize: 12
            }}>
              <CalendarOutlined style={{ fontSize: 11 }} />
              {label}
            </div>
            {type === 'WEEKLY' && record.weeklyDays && Array.isArray(record.weeklyDays) && record.weeklyDays.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {record.weeklyDays.map((d: string) => (
                  <span key={d} style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                    background: '#fef3c7', color: '#92400e'
                  }}>{DAY_MAP[d] || d}</span>
                ))}
              </div>
            )}
            {type === 'CUSTOM' && record.customStartDate && record.customEndDate && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                {record.customStartDate} → {record.customEndDate}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Kalkış Saatleri',
      dataIndex: 'departureTimes',
      key: 'departureTimes',
      width: 200,
      render: (times: string[]) => {
        const displayLimit = 6;
        const visibleTimes = times.slice(0, displayLimit);
        const hiddenCount = times.length - displayLimit;
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {visibleTimes.map((time, index) => (
              <span key={index} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'linear-gradient(135deg, #dbeafe, #ede9fe)',
                color: '#4338ca', border: '1px solid #c7d2fe'
              }}>
                <ClockCircleOutlined style={{ fontSize: 10 }} />
                {time}
              </span>
            ))}
            {hiddenCount > 0 && (
                <Tooltip title={times.slice(displayLimit).join(', ')}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: '#f1f5f9',
                        color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer'
                    }}>
                        +{hiddenCount}
                    </span>
                </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: 'Fiyat',
      key: 'price',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: ShuttleRoute) => {
        const c = currencies?.find((cur: any) => cur.code === (record.currency || 'EUR'));
        const symbol = c?.symbol || record.currency || '€';
        return (
          <div style={{
            fontWeight: 800, fontSize: 16, letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {record.pricePerSeat} {symbol}
          </div>
        );
      },
    },
    {
      title: 'Koltuk',
      dataIndex: 'maxSeats',
      key: 'maxSeats',
      width: 75,
      align: 'center' as const,
      render: (seats: number) => (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
          borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
          fontWeight: 700, fontSize: 13, color: '#475569'
        }}>
          👤 {seats}
        </div>
      ),
    },
    {
      title: 'Durum',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      align: 'center' as const,
      render: (isActive: boolean, record: ShuttleRoute) => (
        <Switch
          checked={isActive}
          onChange={() => toggleRouteStatus(record)}
          checkedChildren={<CheckCircleOutlined />}
          unCheckedChildren={<CloseCircleOutlined />}
          style={{
            background: isActive
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : '#d1d5db',
          }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 55,
      align: 'center' as const,
      render: (_: any, record: ShuttleRoute) => (
        <Tooltip title="Düzenle">
          <Button
            icon={<EditOutlined />}
            onClick={() => showModal(record)}
            type="text"
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f1f5f9', color: '#6366f1', border: '1px solid #e2e8f0'
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <AdminGuard>
      <AdminLayout selectedKey="shuttle">
        {/* ========== HERO HEADER ========== */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 28, flexWrap: 'wrap', gap: 16
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(99,102,241,0.3)'
              }}>
                <CarOutlined style={{ color: '#fff', fontSize: 22 }} />
              </div>
              <div>
                <h1 style={{
                  margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
                  background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text', lineHeight: 1.2
                }}>
                  Shuttle Hatları
                </h1>
                <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 2, display: 'block' }}>
                  Paylaşımlı shuttle rotalarınızı buradan yönetebilirsiniz
                </Text>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Stats Chips */}
            <div style={{
              display: 'flex', gap: 8
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0'
              }}>
                <span style={{ fontSize: 18 }}>🚐</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#334155' }}>{shuttleRoutes.length}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Toplam</span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                background: '#ecfdf5', borderRadius: 10, border: '1px solid #bbf7d0'
              }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>{activeCount}</span>
                <span style={{ fontSize: 12, color: '#6ee7b7' }}>Aktif</span>
              </div>
            </div>

            <button
              onClick={() => showModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 22px', border: 'none', borderRadius: 12, cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 0.3,
                boxShadow: '0 6px 24px rgba(99,102,241,0.35)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(99,102,241,0.45)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,102,241,0.35)'; }}
            >
              <PlusOutlined style={{ fontSize: 15 }} />
              Yeni Shuttle Hattı
            </button>
          </div>
        </div>

        {/* ========== TABLE ========== */}
        <Card
          styles={{ body: { padding: 0 } }}
          style={{
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
          }}
        >
          <Table
            columns={columns}
            dataSource={shuttleRoutes}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              style: { padding: '12px 20px', margin: 0 },
            }}
            size="middle"
            rowClassName={(record) => record.isActive ? '' : 'shuttle-row-inactive'}
            style={{ borderRadius: 0 }}
          />
        </Card>

        {/* ========== MODAL ========== */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CarOutlined style={{ color: '#fff', fontSize: 18 }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                  {editingRoute ? 'Shuttle Hattı Düzenle' : 'Yeni Shuttle Hattı'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
                  {editingRoute ? 'Mevcut rotayı düzenleyin' : 'Yeni paylaşımlı shuttle rotası oluşturun'}
                </div>
              </div>
            </div>
          }
          open={isModalVisible}
          onOk={handleOk}
          onCancel={handleCancel}
          confirmLoading={loading}
          width={720}
          okText={editingRoute ? 'Güncelle' : 'Oluştur'}
          cancelText="İptal"
          okButtonProps={{
            style: {
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', fontWeight: 600, borderRadius: 10, height: 40, paddingInline: 28,
              boxShadow: '0 4px 14px rgba(99,102,241,0.3)'
            }
          }}
          cancelButtonProps={{ style: { borderRadius: 10, height: 40 } }}
          styles={{ body: { paddingTop: 20 } }}
        >
          <Form form={form} layout="vertical" name="shuttle_route_form" requiredMark={false}>

            <Form.Item
              name="vehicleId"
              label={<span style={{ fontWeight: 600, color: '#334155' }}>🚐 Araç</span>}
              rules={[{ required: true, message: 'Lütfen bir araç seçin!' }]}
            >
              <Select placeholder="Sabit hatlı shuttle aracı seçin" size="large" style={{ borderRadius: 10 }}>
                {shuttleVehicles.map((vehicle) => (
                  <Option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} ({vehicle.plateNumber}) — {vehicle.vehicleType}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* ===== ROUTE SECTION ===== */}
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc, #f0fdf4, #eff6ff)',
              borderRadius: 14, padding: '20px 20px 4px', marginBottom: 20,
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#334155', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SwapOutlined style={{ color: '#6366f1' }} /> Rota Bilgileri
              </div>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="fromZoneId"
                    label={<span style={{ fontWeight: 600, fontSize: 13, color: '#059669' }}><EnvironmentOutlined /> Nereden (Bölge)</span>}
                    rules={[{ required: true, message: 'Bölge seçin' }]}
                  >
                    <Select
                      placeholder="Kalkış bölgesi"
                      showSearch optionFilterProp="label"
                      onChange={handleZoneChange}
                      options={zones.map(z => ({ value: z.id, label: `${z.name} (${z.polygon?.length || 0} nokta)` }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="toHubCode"
                    label={<span style={{ fontWeight: 600, fontSize: 13, color: '#2563eb' }}><GlobalOutlined /> Nereye (Hub)</span>}
                    rules={[{ required: true, message: 'Hub seçin' }]}
                  >
                    <Select
                      placeholder="Varış noktası"
                      showSearch optionFilterProp="label"
                      onChange={handleHubChange}
                      options={hubs.map(h => ({ value: h.code, label: `${h.name} (${h.code})` }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="fromName" hidden><Input /></Form.Item>
              <Form.Item name="toName" hidden><Input /></Form.Item>

              {selectedZonePolygon && selectedZonePolygon.length > 2 && (
                <div style={{
                  marginBottom: 16, padding: '6px 12px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #dcfce7, #d1fae5)',
                  border: '1px solid #86efac', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                  color: '#166534', fontWeight: 600
                }}>
                  <CheckCircleOutlined style={{ color: '#10b981' }} />
                  Bölge poligonu atandı — {selectedZonePolygon.length} nokta
                </div>
              )}
            </div>

            {/* ===== SCHEDULE SECTION ===== */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="scheduleType"
                  label={<span style={{ fontWeight: 600, color: '#334155' }}><CalendarOutlined style={{ color: '#6366f1' }} /> Çalışma Tipi</span>}
                  rules={[{ required: true, message: 'Seçin' }]}
                >
                  <Select>
                    <Option value="DAILY">Her Gün</Option>
                    <Option value="WEEKLY">Haftalık</Option>
                    <Option value="CUSTOM">Özel Dönem</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                {scheduleType === 'CUSTOM' && (
                  <Form.Item name="customDateRange" label={<span style={{ fontWeight: 600, color: '#334155' }}>📅 Tarih Aralığı</span>} rules={[{ required: true, message: 'Seçin' }]}>
                    <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} placeholder={['Başlangıç', 'Bitiş']} />
                  </Form.Item>
                )}
              </Col>
            </Row>

            {scheduleType === 'WEEKLY' && (
              <Form.Item name="weeklyDays" label={<span style={{ fontWeight: 600, color: '#334155' }}>📋 Haftanın Günleri</span>} rules={[{ required: true, message: 'Gün seçin' }]}>
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
              label={<span style={{ fontWeight: 600, color: '#334155' }}><ClockCircleOutlined style={{ color: '#6366f1' }} /> Kalkış Saatleri</span>}
              rules={[{ required: true, message: 'En az bir saat seçin' }]}
            >
              <Select
                mode="tags" style={{ width: '100%' }}
                placeholder="Saat seçin veya yazın (örn: 08:30)"
                options={timeOptions} allowClear tokenSeparators={[',', ' ']}
                dropdownRender={(menu) => (
                  <>
                    <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <Button type="primary" size="small" style={{ flex: 1 }} onClick={() => form.setFieldsValue({ departureTimes: timeOptions.map(t => t.value) })}>Tümünü Seç</Button>
                      <Button type="default" danger size="small" style={{ flex: 1 }} onClick={() => form.setFieldsValue({ departureTimes: [] })}>Tümünü Temizle</Button>
                    </div>
                    {menu}
                  </>
                )}
              />
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(pv, cv) => pv.isBidirectional !== cv.isBidirectional}>
              {({ getFieldValue }) =>
                getFieldValue('isBidirectional') ? (
                  <Form.Item name="returnDepartureTimes" label={<span style={{ fontWeight: 600, color: '#334155' }}>↩️ Dönüş Saatleri</span>} rules={[{ required: true, message: 'Seçin' }]}>
                    <Select mode="tags" style={{ width: '100%' }} placeholder="Dönüş saatleri" options={timeOptions} allowClear tokenSeparators={[',', ' ']}
                      dropdownRender={(menu) => (
                        <>
                          <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '8px' }}>
                            <Button type="primary" size="small" style={{ flex: 1 }} onClick={() => form.setFieldsValue({ returnDepartureTimes: timeOptions.map(t => t.value) })}>Tümünü Seç</Button>
                            <Button type="default" danger size="small" style={{ flex: 1 }} onClick={() => form.setFieldsValue({ returnDepartureTimes: [] })}>Temizle</Button>
                          </div>
                          {menu}
                        </>
                      )}
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            {/* ===== PRICING ===== */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={<span style={{ fontWeight: 600, color: '#334155' }}><DollarOutlined style={{ color: '#6366f1' }} /> Kişi Başı Fiyat</span>} required>
                  <Input.Group compact>
                    <Form.Item name="pricePerSeat" noStyle rules={[{ required: true, message: 'Fiyat girin' }]}>
                      <Input type="number" min={0} step={0.01} placeholder="10.00" style={{ width: 'calc(100% - 90px)' }} />
                    </Form.Item>
                    <Form.Item name="currency" noStyle rules={[{ required: true }]}>
                      <Select style={{ width: 90 }}>
                        {currencies.map((c) => (
                          <Option key={c.code} value={c.code}>{c.code} ({c.symbol})</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Input.Group>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="maxSeats" label={<span style={{ fontWeight: 600, color: '#334155' }}>👤 Maks. Koltuk</span>} rules={[{ required: true, message: 'Sayı girin' }]}>
                  <Input type="number" min={1} placeholder="14" />
                </Form.Item>
              </Col>
            </Row>

            {/* ===== TOGGLES ===== */}
            <div style={{
              display: 'flex', gap: 32, padding: '14px 20px', borderRadius: 12,
              background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: 4
            }}>
              <Form.Item name="isActive" label={<span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Durum</span>} valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
              </Form.Item>
              <Form.Item name="isBidirectional" label={<span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Çift Yönlü</span>} valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren="Evet" unCheckedChildren="Hayır" />
              </Form.Item>
            </div>
          </Form>
        </Modal>

        {/* ========== STYLES ========== */}
        <style>{`
          .shuttle-row-inactive td { opacity: 0.55; }
          .ant-table-thead > tr > th {
            background: #f8fafc !important;
            font-weight: 700 !important;
            font-size: 12px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            color: #64748b !important;
            border-bottom: 2px solid #e2e8f0 !important;
            padding: 12px 16px !important;
          }
          .ant-table-tbody > tr > td {
            padding: 14px 16px !important;
            border-bottom: 1px solid #f1f5f9 !important;
          }
          .ant-table-tbody > tr:hover > td {
            background: #faf5ff !important;
          }
          .ant-modal-header {
            border-bottom: 1px solid #f1f5f9 !important;
            padding: 20px 24px !important;
          }
        `}</style>
      </AdminLayout>
    </AdminGuard>
  );
};

export default AdminShuttleRoutesPage;
