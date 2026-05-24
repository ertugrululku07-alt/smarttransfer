'use client';

import React, { useEffect, useState } from 'react';
import {
  Layout,
  Menu,
  Card,
  Row,
  Col,
  List,
  Tag,
  Button,
  Typography,
  Calendar,
  Empty,
  Spin,
  message,
} from 'antd';
import {
  CarOutlined,
  DashboardOutlined,
  ScheduleOutlined,
  DollarCircleOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

type DashboardStats = {
  todayJobs: number;
  completedJobs: number;
  rating: number;
  ratingCount: number;
};

type DriverBooking = {
  id: string;
  bookingNumber?: string;
  startDate?: string;
  status?: string;
  pickup?: string;
  dropoff?: string;
  fullName?: string;
  passengerName?: string;
  metadata?: any;
};

const statusColor = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'PENDING':
      return 'orange';
    case 'CONFIRMED':
    case 'ASSIGNED':
      return 'geekblue';
    case 'IN_PROGRESS':
    case 'EN_ROUTE':
      return 'blue';
    case 'COMPLETED':
      return 'green';
    case 'CANCELLED':
      return 'red';
    default:
      return 'default';
  }
};

const formatTime = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const DriverDashboard: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayTransfers, setTodayTransfers] = useState<DriverBooking[]>([]);
  const [profileName, setProfileName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [dashRes, bookingsRes, profileRes] = await Promise.all([
          apiClient.get('/api/driver/dashboard').catch((e) => ({ error: e })),
          apiClient.get('/api/driver/bookings', { params: { type: 'today' } }).catch((e) => ({ error: e })),
          apiClient.get('/api/driver/profile').catch((e) => ({ error: e })),
        ]);
        if (cancelled) return;

        if ((dashRes as any).data?.success) {
          setStats((dashRes as any).data.data);
        }
        if ((bookingsRes as any).data?.success) {
          const list = (bookingsRes as any).data.data?.bookings || (bookingsRes as any).data.data || [];
          setTodayTransfers(Array.isArray(list) ? list : []);
        }
        if ((profileRes as any).data?.success) {
          const u = (profileRes as any).data.data?.user || (profileRes as any).data.data || {};
          setProfileName(u.fullName || u.name || u.email || '');
        }
      } catch (err: any) {
        message.error('Veriler yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const statCards = stats
    ? [
        { title: 'Bugünkü Transferler', value: stats.todayJobs },
        { title: 'Tamamlanan', value: stats.completedJobs },
        { title: 'Puan', value: stats.rating > 0 ? `${stats.rating.toFixed(1)} / 5` : '—' },
        { title: 'Değerlendirme Sayısı', value: stats.ratingCount },
      ]
    : [];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            height: 32,
            margin: 16,
            background: 'rgba(255, 255, 255, 0.3)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          {collapsed ? <CarOutlined /> : 'Driver Panel'}
        </div>
        <Menu theme="dark" defaultSelectedKeys={['1']} mode="inline">
          <Menu.Item key="1" icon={<DashboardOutlined />}>
            Dashboard
          </Menu.Item>
          <Menu.Item key="2" icon={<CarOutlined />}>
            Transferlerim
          </Menu.Item>
          <Menu.Item key="3" icon={<ScheduleOutlined />}>
            Takvim
          </Menu.Item>
          <Menu.Item key="4" icon={<DollarCircleOutlined />}>
            Kazançlar
          </Menu.Item>
          <Menu.Item key="5" icon={<LogoutOutlined />}>
            Çıkış Yap
          </Menu.Item>
        </Menu>
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Sürücü Dashboard
          </Title>
          <div>
            <Text strong>{profileName ? `Hoş geldin, ${profileName}` : 'Hoş geldin'}</Text>
          </div>
        </Header>

        <Content style={{ margin: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 64 }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              <Row gutter={[16, 16]}>
                {statCards.map((s) => (
                  <Col xs={24} sm={12} md={6} key={s.title}>
                    <Card>
                      <Text type="secondary">{s.title}</Text>
                      <Title level={3} style={{ marginTop: 8 }}>
                        {s.value}
                      </Title>
                    </Card>
                  </Col>
                ))}
              </Row>

              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} md={14}>
                  <Card title="Bugünkü Transferler">
                    {todayTransfers.length === 0 ? (
                      <Empty description="Bugün için atanmış transfer yok" />
                    ) : (
                      <List
                        itemLayout="horizontal"
                        dataSource={todayTransfers}
                        renderItem={(item) => {
                          const passenger =
                            item.passengerName ||
                            item.fullName ||
                            item.metadata?.fullName ||
                            '—';
                          return (
                            <List.Item
                              actions={[
                                <Button size="small" type="link" key="detail">
                                  Detay
                                </Button>,
                              ]}
                            >
                              <List.Item.Meta
                                title={`${formatTime(item.startDate)} — ${item.pickup || '?'} → ${item.dropoff || '?'}`}
                                description={
                                  <>
                                    <Text>Yolcu: {passenger}</Text>
                                    <br />
                                    <Tag color={statusColor(item.status)}>
                                      {item.status || 'BEKLİYOR'}
                                    </Tag>
                                  </>
                                }
                              />
                            </List.Item>
                          );
                        }}
                      />
                    )}
                  </Card>
                </Col>

                <Col xs={24} md={10}>
                  <Card title="Takvim">
                    <Calendar fullscreen={false} />
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default DriverDashboard;
