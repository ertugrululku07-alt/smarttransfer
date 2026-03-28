'use client';

import React, { useState } from 'react';
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
} from 'antd';
import {
  CarOutlined,
  DashboardOutlined,
  ScheduleOutlined,
  DollarCircleOutlined,
  LogoutOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const DriverDashboard: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  // Şimdilik dummy veriler – ileride backend’e bağlarız
  const todayTransfers = [
    {
      id: 1,
      time: '10:30',
      from: 'IST Havalimanı',
      to: 'Taksim Otel',
      passenger: 'Ali Demir',
      status: 'Bekliyor',
    },
    {
      id: 2,
      time: '14:00',
      from: 'Taksim Otel',
      to: 'SAW Havalimanı',
      passenger: 'Ayşe Yılmaz',
      status: 'Yolda',
    },
  ];

  const stats = [
    { title: 'Bugünkü Transferler', value: 5 },
    { title: 'Tamamlanan', value: 3 },
    { title: 'Bekleyen', value: 2 },
    { title: 'Bugünkü Kazanç', value: '₺1.250' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Bekliyor':
        return 'orange';
      case 'Yolda':
        return 'blue';
      case 'Tamamlandı':
        return 'green';
      default:
        return 'default';
    }
  };

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
            <Text strong>Hoş geldin, Demo Sürücü</Text>
          </div>
        </Header>

        <Content style={{ margin: '16px' }}>
          {/* Üst İstatistik Kartları */}
          <Row gutter={[16, 16]}>
            {stats.map((s) => (
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
            {/* Bugünkü Transferler */}
            <Col xs={24} md={14}>
              <Card title="Bugünkü Transferler">
                <List
                  itemLayout="horizontal"
                  dataSource={todayTransfers}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button size="small" type="link" key="detail">
                          Detay
                        </Button>,
                        <Button
                          size="small"
                          type="primary"
                          key="status"
                        >
                          Durumu Güncelle
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={`${item.time} - ${item.from} → ${item.to}`}
                        description={
                          <>
                            <Text>Yolcu: {item.passenger}</Text>
                            <br />
                            <Tag color={getStatusColor(item.status)}>
                              {item.status}
                            </Tag>
                          </>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            {/* Takvim */}
            <Col xs={24} md={10}>
              <Card title="Takvim">
                <Calendar fullscreen={false} />
              </Card>
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
};

export default DriverDashboard;
