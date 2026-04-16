'use client';

import React, { useEffect, useState } from 'react';
import {
  Layout,
  Menu,
  Typography,
  Space,
  Button,
  message,
  Card,
  Descriptions,
  Tag,
  Spin,
  Input,
  Select,
  Popconfirm,
} from 'antd';
import {
  DashboardOutlined,
  CarOutlined,
  UserOutlined,
  SettingOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useParams, useRouter } from 'next/navigation';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface Booking {
  id: number;
  vehicleType: string;
  vendor: string;
  price: number;
  capacity: number;
  pickup: string;
  dropoff: string;
  pickupDateTime: string | null;
  returnDateTime: string | null;
  fullName: string;
  email: string;
  phone: string;
  passengers: number;
  flightNumber?: string | null;
  flightArrivalTime?: string | null;
  meetAndGreet?: string | null;
  notes?: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | null;
  paymentMethod?: string | null;
  transferType?: string | null;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  childAges?: string | null;
  babySeat?: boolean | null;
  internalNotes?: string | null;
}

const AdminBookingDetailPage: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [internalNotes, setInternalNotes] = useState<string>('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);

  const params = useParams();
  const router = useRouter();
  const bookingId = params.id;

  const fetchBookingDetail = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`https://smarttransfer-backend-production.up.railway.app/api/bookings/${bookingId}`);
      if (res.data?.success) {
        setBooking(res.data.data);
        setInternalNotes(res.data.data.internalNotes || '');
      } else {
        message.error('Rezervasyon detayları getirilemedi.');
      }
    } catch (error) {
      console.error('fetchBookingDetail error:', error);
      message.error('Sunucu hatası.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId) {
      fetchBookingDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const handleSaveInternalNotes = async () => {
    try {
      await axios.patch(`https://smarttransfer-backend-production.up.railway.app/api/bookings/${bookingId}/internal-notes`, {
        internalNotes,
      });
      message.success('İç notlar kaydedildi.');
      fetchBookingDetail(); // Notları kaydettikten sonra güncel veriyi çek
    } catch (error) {
      console.error('handleSaveInternalNotes error:', error);
      message.error('İç notlar kaydedilirken bir hata oluştu.');
    }
  };

  const handleUpdateStatus = async (newStatus: Booking['status']) => {
    try {
      setStatusLoading(true);
      await axios.patch(`https://smarttransfer-backend-production.up.railway.app/api/bookings/${bookingId}/status`, {
        status: newStatus,
      });
      message.success('Rezervasyon durumu güncellendi.');
      fetchBookingDetail();
    } catch (error) {
      console.error('handleUpdateStatus error:', error);
      message.error('Rezervasyon durumu güncellenirken bir hata oluştu.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleUpdatePaymentStatus = async (newPaymentStatus: Booking['paymentStatus']) => {
    try {
      setPaymentStatusLoading(true);
      await axios.patch(`https://smarttransfer-backend-production.up.railway.app/api/bookings/${bookingId}/payment-status`, {
        paymentStatus: newPaymentStatus,
      });
      message.success('Ödeme durumu güncellendi.');
      fetchBookingDetail();
    } catch (error) {
      console.error('handleUpdatePaymentStatus error:', error);
      message.error('Ödeme durumu güncellenirken bir hata oluştu.');
    } finally {
      setPaymentStatusLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
        <div>Yükleniyor...</div>
      </Layout>
    );
  }

  if (!booking) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
          <div style={{ height: 32, margin: 16, background: 'rgba(255,255,255,0.3)' }} />
          <Menu theme="dark" defaultSelectedKeys={['bookings']} mode="inline">
            <Menu.Item key="dashboard" icon={<DashboardOutlined />}>
              <a href="/admin">Dashboard</a>
            </Menu.Item>
            <Menu.Item key="bookings" icon={<CarOutlined />}>
              <a href="/admin/bookings">Rezervasyonlar</a>
            </Menu.Item>
            <Menu.Item key="customers" icon={<UserOutlined />}>
              <a href="/admin/customers">Müşteriler</a>
            </Menu.Item>
            <Menu.Item key="settings" icon={<SettingOutlined />}>
              <a href="/admin/settings">Ayarlar</a>
            </Menu.Item>
          </Menu>
        </Sider>
        <Layout>
          <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center' }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginRight: 16 }} />
            <Title level={4} style={{ margin: 0 }}>
              Rezervasyon Detayı
            </Title>
          </Header>
          <Content style={{ margin: '16px', padding: 24, background: '#fff', borderRadius: 8 }}>
            <Text>Rezervasyon bulunamadı.</Text>
          </Content>
        </Layout>
      </Layout>
    );
  }

  let childAges: number[] = [];
  if (booking.childAges) {
    try {
      childAges = JSON.parse(booking.childAges);
    } catch (e) {
      // Geçersiz JSON ise boş bırak
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ height: 32, margin: 16, background: 'rgba(255,255,255,0.3)' }} />
        <Menu theme="dark" defaultSelectedKeys={['bookings']} mode="inline">
          <Menu.Item key="dashboard" icon={<DashboardOutlined />}>
            <a href="/admin">Dashboard</a>
          </Menu.Item>
          <Menu.Item key="bookings" icon={<CarOutlined />}>
            <a href="/admin/bookings">Rezervasyonlar</a>
          </Menu.Item>
          <Menu.Item key="customers" icon={<UserOutlined />}>
            <a href="/admin/customers">Müşteriler</a>
          </Menu.Item>
          <Menu.Item key="settings" icon={<SettingOutlined />}>
            <a href="/admin/settings">Ayarlar</a>
          </Menu.Item>
        </Menu>
      </Sider>

      <Layout>
        <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginRight: 16 }} />
          <Title level={4} style={{ margin: 0 }}>
            Rezervasyon Detayı - #{booking.id}
          </Title>
        </Header>

        <Content style={{ margin: '16px' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Card title="Rezervasyon Bilgileri" bordered>
              <Descriptions bordered column={{ xxl: 3, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}>
                <Descriptions.Item label="Rezervasyon ID">{booking.id}</Descriptions.Item>
                <Descriptions.Item label="Oluşturma Tarihi">
                  {dayjs(booking.createdAt).format('DD.MM.YYYY HH:mm')}
                </Descriptions.Item>
                <Descriptions.Item label="Son Güncelleme">
                  {dayjs(booking.updatedAt).format('DD.MM.YYYY HH:mm')}
                </Descriptions.Item>

                <Descriptions.Item label="Müşteri Adı Soyadı">{booking.fullName}</Descriptions.Item>
                <Descriptions.Item label="E-posta">{booking.email}</Descriptions.Item>
                <Descriptions.Item label="Telefon">{booking.phone}</Descriptions.Item>

                <Descriptions.Item label="Alış Noktası">{booking.pickup}</Descriptions.Item>
                <Descriptions.Item label="Bırakış Noktası">{booking.dropoff}</Descriptions.Item>
                <Descriptions.Item label="Alış Tarih/Saat">
                  {booking.pickupDateTime ? dayjs(booking.pickupDateTime).format('DD.MM.YYYY HH:mm') : '-'}
                </Descriptions.Item>

                {booking.returnDateTime && (
                  <Descriptions.Item label="Dönüş Tarih/Saat">
                    {dayjs(booking.returnDateTime).format('DD.MM.YYYY HH:mm')}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Transfer Tipi">{booking.transferType || '-'}</Descriptions.Item>
                <Descriptions.Item label="Kaynak">{booking.source || '-'}</Descriptions.Item>

                <Descriptions.Item label="Araç Tipi">{booking.vehicleType}</Descriptions.Item>
                <Descriptions.Item label="Tedarikçi">{booking.vendor}</Descriptions.Item>
                <Descriptions.Item label="Kapasite">{booking.capacity}</Descriptions.Item>

                <Descriptions.Item label="Yolcu Sayısı">{booking.passengers}</Descriptions.Item>
                <Descriptions.Item label="Çocuk Yaşları">
                  {childAges.length > 0 ? childAges.join(', ') : 'Yok'}
                </Descriptions.Item>
                <Descriptions.Item label="Bebek Koltuğu">{booking.babySeat ? 'Evet' : 'Hayır'}</Descriptions.Item>

                <Descriptions.Item label="Uçuş Numarası">{booking.flightNumber || '-'}</Descriptions.Item>
                <Descriptions.Item label="Uçuş Varış Saati">
                  {booking.flightArrivalTime ? dayjs(booking.flightArrivalTime).format('HH:mm') : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Karşılama">{booking.meetAndGreet || '-'}</Descriptions.Item>

                <Descriptions.Item label="Müşteri Notları" span={3}>
                  {booking.notes || 'Müşteri notu yok.'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="Ödeme ve Durum" bordered>
              <Descriptions bordered column={1}>
                <Descriptions.Item label="Tutar">
                  <Text strong style={{ fontSize: '1.1em' }}>
                    {booking.price.toFixed(2)} €
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Ödeme Yöntemi">{booking.paymentMethod || '-'}</Descriptions.Item>
                <Descriptions.Item label="Ödeme Durumu">
                  <Space>
                    <Tag
                      color={
                        booking.paymentStatus === 'PAID'
                          ? 'green'
                          : booking.paymentStatus === 'PENDING'
                            ? 'orange'
                            : booking.paymentStatus === 'FAILED'
                              ? 'red'
                              : 'default'
                      }
                    >
                      {booking.paymentStatus || 'Bilinmiyor'}
                    </Tag>
                    <Select
                      value={booking.paymentStatus || undefined}
                      style={{ width: 150 }}
                      onChange={handleUpdatePaymentStatus}
                      loading={paymentStatusLoading}
                    >
                      <Option value="PENDING">PENDING</Option>
                      <Option value="PAID">PAID</Option>
                      <Option value="FAILED">FAILED</Option>
                    </Select>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Rezervasyon Durumu">
                  <Space>
                    <Tag
                      color={
                        booking.status === 'CONFIRMED'
                          ? 'green'
                          : booking.status === 'PENDING'
                            ? 'orange'
                            : booking.status === 'CANCELLED'
                              ? 'red'
                              : 'default'
                      }
                    >
                      {booking.status === 'PENDING'
                        ? 'Beklemede'
                        : booking.status === 'CONFIRMED'
                          ? 'Onaylandı'
                          : booking.status === 'CANCELLED'
                            ? 'İptal'
                            : 'Bilinmiyor'}
                    </Tag>
                    <Select
                      value={booking.status}
                      style={{ width: 150 }}
                      onChange={handleUpdateStatus}
                      loading={statusLoading}
                    >
                      <Option value="PENDING">Beklemede</Option>
                      <Option value="CONFIRMED">Onaylandı</Option>
                      <Option value="CANCELLED">İptal</Option>
                    </Select>
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="İç Notlar" bordered>
              <TextArea
                rows={4}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Bu rezervasyonla ilgili iç notlarınızı buraya yazın..."
              />
              <Button
                type="primary"
                onClick={handleSaveInternalNotes}
                style={{ marginTop: 16 }}
              >
                Notları Kaydet
              </Button>
            </Card>
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminBookingDetailPage;