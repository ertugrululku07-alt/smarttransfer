'use client';

import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Statistic, Typography, Progress, Tag, Spin, message } from 'antd';
import {
  ArrowUpOutlined,
  DollarOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  CarOutlined,
} from '@ant-design/icons';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AdminGuard from './AdminGuard';
import AdminLayout from './AdminLayout';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;

interface DashboardStats {
  totalRevenue: number;
  revenueGrowth: number;
  totalBookings: number;
  bookingsGrowth: number;
  activeCustomers: number;
  customersGrowth: number;
  activeVehicles: number;
  totalVehicles: number;
}

const AdminDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [bookingDist, setBookingDist] = useState<any[]>([]);
  const [vehicleStats, setVehicleStats] = useState<any[]>([]);

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Parallel API calls
      const [statsRes, revenueRes, distRes, vehicleRes] = await Promise.all([
        apiClient.get('/api/dashboard/stats'),
        apiClient.get('/api/dashboard/revenue-trend'),
        apiClient.get('/api/dashboard/booking-distribution'),
        apiClient.get('/api/dashboard/vehicle-stats'),
      ]);

      setStats(statsRes.data.data.kpis);
      setRevenueData(revenueRes.data.data);
      setBookingDist(distRes.data.data);
      setVehicleStats(vehicleRes.data.data);

      console.log('✅ Dashboard data loaded', statsRes.data);
    } catch (error: any) {
      console.error('❌ Dashboard error:', error);
      message.error('Dashboard verisi yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <AdminGuard>
        <AdminLayout selectedKey="dashboard">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '60vh',
              gap: '16px'
            }}
          >
            <Spin size="large" />
            <Text type="secondary">Dashboard yükleniyor...</Text>
          </div>
        </AdminLayout>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <AdminLayout selectedKey="dashboard">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8, color: '#1a1a1a' }}>
            Dashboard
          </Title>
          <Text type="secondary" style={{ fontSize: 16 }}>
            Hoş geldiniz! İşte bugünkün performans özeti.
          </Text>
        </div>

        {/* KPI Cards */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card
              variant="borderless"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.15)',
              }}
            >
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Toplam Gelir</span>}
                value={stats.totalRevenue}
                precision={2}
                styles={{content: { color: '#fff', fontSize: 28, fontWeight: 600 }}}
                prefix="₺"
                suffix={
                  <Tag
                    color="success"
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                    }}
                  >
                    <ArrowUpOutlined /> {stats.revenueGrowth}%
                  </Tag>
                }
              />
              <div style={{ marginTop: 8 }}>
                <DollarOutlined style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)' }} />
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card
              variant="borderless"
              style={{
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(245, 87, 108, 0.15)',
              }}
            >
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Toplam Rezervasyon</span>}
                value={stats.totalBookings}
                styles={{content: { color: '#fff', fontSize: 28, fontWeight: 600 }}}
                suffix={
                  <Tag
                    color="success"
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                    }}
                  >
                    <ArrowUpOutlined /> {stats.bookingsGrowth}%
                  </Tag>
                }
              />
              <div style={{ marginTop: 8 }}>
                <ShoppingCartOutlined
                  style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)' }}
                />
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card
              variant="borderless"
              style={{
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(79, 172, 254, 0.15)',
              }}
            >
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Aktif Müşteri</span>}
                value={stats.activeCustomers}
                styles={{content: { color: '#fff', fontSize: 28, fontWeight: 600 }}}
                suffix={
                  <Tag
                    color="success"
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                    }}
                  >
                    <ArrowUpOutlined /> {stats.customersGrowth}%
                  </Tag>
                }
              />
              <div style={{ marginTop: 8 }}>
                <UserOutlined style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)' }} />
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card
              variant="borderless"
              style={{
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(250, 112, 154, 0.15)',
              }}
            >
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Aktif Araç</span>}
                value={stats.activeVehicles}
                styles={{content: { color: '#fff', fontSize: 28, fontWeight: 600 }}}
                suffix={
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                    {' '}
                    / {stats.totalVehicles}
                  </span>
                }
              />
              <div style={{ marginTop: 8 }}>
                <CarOutlined style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)' }} />
              </div>
            </Card>
          </Col>
        </Row>

        {/* Charts Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {/* Revenue Chart */}
          <Col xs={24} lg={16}>
            <Card
              title={
                <span style={{ fontSize: 18, fontWeight: 600 }}>
                  📈 Gelir Trendi (Son 7 Gün)
                </span>
              }
              variant="borderless"
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#667eea" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#667eea" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#999" />
                  <YAxis stroke="#999" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#667eea"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          {/* Booking Distribution */}
          <Col xs={24} lg={8}>
            <Card
              title={
                <span style={{ fontSize: 18, fontWeight: 600 }}>🥧 Rezervasyon Dağılımı</span>
              }
              variant="borderless"
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={bookingDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {bookingDist.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value, entry: any) => (
                      <span style={{ fontSize: 13, color: '#666' }}>
                        {value} ({entry.payload.value})
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        {/* Vehicle Stats */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              title={<span style={{ fontSize: 18, fontWeight: 600 }}>🚗 Araç Durumu</span>}
              variant="borderless"
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={vehicleStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="type" stroke="#999" />
                  <YAxis stroke="#999" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="active" fill="#667eea" radius={[8, 8, 0, 0]} name="Aktif" />
                  <Bar dataKey="idle" fill="#d1d5db" radius={[8, 8, 0, 0]} name="Boşta" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          {/* Performance Metrics */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <span style={{ fontSize: 18, fontWeight: 600 }}>⚡ Performans Metrikleri</span>
              }
              variant="borderless"
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <div style={{ padding: '16px 0' }}>
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text strong>Müşteri Memnuniyeti</Text>
                    <Text strong style={{ color: '#667eea' }}>
                      94%
                    </Text>
                  </div>
                  <Progress
                    percent={94}
                    strokeColor={{
                      '0%': '#667eea',
                      '100%': '#764ba2',
                    }}
                    showInfo={false}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text strong>Zamanında Teslimat</Text>
                    <Text strong style={{ color: '#f5576c' }}>
                      88%
                    </Text>
                  </div>
                  <Progress
                    percent={88}
                    strokeColor={{
                      '0%': '#f093fb',
                      '100%': '#f5576c',
                    }}
                    showInfo={false}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text strong>Araç Kullanım Oranı</Text>
                    <Text strong style={{ color: '#4facfe' }}>
                      83%
                    </Text>
                  </div>
                  <Progress
                    percent={83}
                    strokeColor={{
                      '0%': '#4facfe',
                      '100%': '#00f2fe',
                    }}
                    showInfo={false}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text strong>Tekrarlayan Müşteri</Text>
                    <Text strong style={{ color: '#fa709a' }}>
                      76%
                    </Text>
                  </div>
                  <Progress
                    percent={76}
                    strokeColor={{
                      '0%': '#fa709a',
                      '100%': '#fee140',
                    }}
                    showInfo={false}
                  />
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </AdminLayout>
    </AdminGuard>
  );
};

export default AdminDashboardPage;
