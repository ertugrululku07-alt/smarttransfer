'use client';

import React, { useState, Suspense } from 'react';
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
  Spin
} from 'antd';

const { Title, Text } = Typography;

const BookingContent: React.FC = () => {
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
        vehicleType: vehicle,
        vendor: 'Demo Firma',
        price,
        capacity: values.passengers || 1,
        pickup,
        dropoff,
        pickupDateTime: pickupDateTime ? new Date(pickupDateTime).toISOString() : null,
        returnDateTime: returnDateTime ? new Date(returnDateTime).toISOString() : null,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        passengers: values.passengers || 1,
        flightNumber: values.flightNumber || null,
        flightArrivalTime: values.flightArrivalTime ? values.flightArrivalTime.toISOString() : null,
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

      message.success('Rezervasyonunuz başarıyla oluşturuldu');
      router.push('/');
    } catch (error: any) {
      message.error(error.message || 'Rezervasyon sırasında bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Title level={2} style={{ marginBottom: 24 }}>Rezervasyon Detayları</Title>
        <Row gutter={24}>
          <Col xs={24} md={16}>
            <Card title="Yolcu Bilgileri">
              <Form layout="vertical" onFinish={onFinish} initialValues={{ passengers: 1 }}>
                <Form.Item label="Ad Soyad" name="fullName" rules={[{ required: true }]}><Input /></Form.Item>
                <Row gutter={16}>
                  <Col span={12}><Form.Item label="E-posta" name="email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item></Col>
                  <Col span={12}><Form.Item label="Telefon" name="phone" rules={[{ required: true }]}><Input /></Form.Item></Col>
                </Row>
                <Form.Item style={{ marginTop: 16 }}><Button type="primary" htmlType="submit" loading={loading}>Rezervasyonu Tamamla</Button></Form.Item>
              </Form>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="Seçilen Araç">
              <Title level={4}>{vehicle}</Title>
              <Text type="secondary">{duration}</Text>
              <Divider />
              <div style={{ marginTop: 24, textAlign: 'right' }}><Text type="secondary">Toplam Fiyat</Text><Title level={3} style={{ margin: 0, color: '#1890ff' }}>₺{price}</Title></div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default function BookingPage() {
    return (
        <Suspense fallback={<div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 16 }}>Yükleniyor...</div></div>}>
            <BookingContent />
        </Suspense>
    );
}