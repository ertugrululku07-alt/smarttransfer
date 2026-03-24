'use client';

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Row,
  Col,
  Card,
  Typography,
  Form,
  Input,
  InputNumber,
  Button,
  DatePicker,
  message,
} from 'antd';

const { Title, Text } = Typography;

const BookingPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const vehicle = searchParams.get('vehicle') || 'Araç';
  const price = Number(searchParams.get('price') || 0);
  const duration = searchParams.get('duration') || '';
  const pickup = searchParams.get('pickup') || '';
  const dropoff = searchParams.get('dropoff') || '';
  const pickupDateTimeParam = searchParams.get('pickupDateTime');
  const returnDateTimeParam = searchParams.get('returnDateTime');

  const pickupDateTime = pickupDateTimeParam
    ? new Date(decodeURIComponent(pickupDateTimeParam))
    : null;
  const returnDateTime = returnDateTimeParam
    ? new Date(decodeURIComponent(returnDateTimeParam))
    : null;

  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    try {
      setLoading(true);

      const payload = {
        // Booking tablosu ile uyumlu bir payload (senin backend’ine göre uyarladık)
        vehicleType: vehicle,
        vendor: 'Demo Firma',          // şimdilik sabit
        price,
        capacity: values.passengers || 1,

        pickup,
        dropoff,
        pickupDateTime: pickupDateTime
          ? new Date(pickupDateTime).toISOString()
          : null,
        returnDateTime: returnDateTime
          ? new Date(returnDateTime).toISOString()
          : null,

        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        passengers: values.passengers || 1,

        flightNumber: values.flightNumber || null,
        flightArrivalTime: values.flightArrivalTime
          ? values.flightArrivalTime.toISOString()
          : null,

        meetAndGreet: values.meetAndGreet || null,
        notes: values.notes || null,
      };

      const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Rezervasyon kaydedilemedi');
      }

      const data = await response.json();
      console.log('Booking created:', data);

      message.success('Rezervasyonunuz başarıyla oluşturuldu');
      router.push('/'); // istersen /booking/success gibi bir sayfaya da yönlendirebiliriz
    } catch (error: any) {
      console.error('Booking error:', error);
      message.error(error.message || 'Rezervasyon sırasında bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Title level={2} style={{ marginBottom: 24 }}>
          Rezervasyon Detayları
        </Title>

        <Row gutter={24}>
          {/* Sol: Form */}
          <Col xs={24} md={16}>
            <Card title="Yolcu Bilgileri">
              <Form
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                  passengers: 1,
                }}
              >
                <Form.Item
                  label="Ad Soyad"
                  name="fullName"
                  rules={[{ required: true, message: 'Lütfen ad soyad girin' }]}
                >
                  <Input placeholder="Adınız Soyadınız" />
                </Form.Item>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label="E-posta"
                      name="email"
                      rules={[
                        { required: true, message: 'Lütfen e-posta girin' },
                        { type: 'email', message: 'Geçerli bir e-posta girin' },
                      ]}
                    >
                      <Input placeholder="ornek@example.com" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label="Telefon"
                      name="phone"
                      rules={[
                        { required: true, message: 'Lütfen telefon numarası girin' },
                      ]}
                    >
                      <Input placeholder="+90 5xx xxx xx xx" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Toplam Yolcu Sayısı" name="passengers">
                      <InputNumber min={1} max={20} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Uçuş Numarası" name="flightNumber">
                      <Input placeholder="THY1234" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item label="Uçuş Varış Saati" name="flightArrivalTime">
                  <DatePicker
                    showTime
                    format="DD/MM/YYYY HH:mm"
                    style={{ width: '100%' }}
                    placeholder="Uçuş varış tarih ve saati"
                  />
                </Form.Item>

                <Form.Item label="Karşılama Notu (Opsiyonel)" name="meetAndGreet">
                  <Input.TextArea
                    rows={2}
                    placeholder="Örneğin: İsim tabelası, özel notlar..."
                  />
                </Form.Item>

                <Form.Item label="Ek Notlar" name="notes">
                  <Input.TextArea rows={3} placeholder="Özel istekleriniz..." />
                </Form.Item>

                <Form.Item style={{ marginTop: 16 }}>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Rezervasyonu Tamamla
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>

          {/* Sağ: Özet */}
          <Col xs={24} md={8}>
            <Card title="Seçilen Araç">
              <Title level={4} style={{ marginBottom: 4 }}>
                {vehicle}
              </Title>
              <Text type="secondary">{duration}</Text>

              <div style={{ marginTop: 16 }}>
                <Text strong>Rota</Text>
                <br />
                <Text type="secondary">
                  {pickup || 'Nereden?'} → {dropoff || 'Nereye?'}
                </Text>
              </div>

              <div style={{ marginTop: 16 }}>
                <Text strong>Tarih ve Saat</Text>
                <br />
                <Text type="secondary">
                  {pickupDateTime
                    ? new Date(pickupDateTime).toLocaleString('tr-TR')
                    : '-'}
                  {returnDateTime &&
                    ` • Dönüş: ${new Date(
                      returnDateTime,
                    ).toLocaleString('tr-TR')}`}
                </Text>
              </div>

              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <Text type="secondary">Toplam Fiyat</Text>
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                  ₺{price}
                </Title>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default BookingPage;