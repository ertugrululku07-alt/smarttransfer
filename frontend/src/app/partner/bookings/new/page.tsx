'use client';

import React, { useState, useEffect } from 'react';
import {
  Form, DatePicker, InputNumber, Select, Button, Row, Col,
  Radio, Space, Alert, message, Spin,
} from 'antd';
import {
  CarOutlined, UserOutlined, CalendarOutlined, EnvironmentOutlined,
  DollarOutlined, GlobalOutlined, AppstoreAddOutlined,
  ArrowLeftOutlined, CheckOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import PlaceAutocomplete from '@/app/components/PlaceAutocomplete';

const { Option } = Select;

export default function NewPartnerBookingPage() {
  const [form] = Form.useForm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [myVehicles, setMyVehicles] = useState<any[]>([]);
  const [myDrivers, setMyDrivers] = useState<any[]>([]);

  // Controlled location state (PlaceAutocomplete works outside Form)
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupError, setPickupError] = useState('');
  const [dropoffError, setDropoffError] = useState('');

  const actionType = Form.useWatch('actionType', form);
  const b2bPriceType = Form.useWatch('b2bPriceType', form);

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/vehicle-types'),
      apiClient.get('/api/vehicles'),
      apiClient.get('/api/users?role=DRIVER'),
    ]).then(([vtRes, vRes, dRes]) => {
      if (vtRes.data?.success) setVehicleTypes(vtRes.data.data || []);
      if (vRes.data?.success) setMyVehicles((vRes.data.data || []).filter((v: any) => v.isActive));
      if (dRes.data?.success) setMyDrivers((dRes.data.data || []).filter((d: any) => d.isActive));
    }).catch(() => {
      message.error('Form verileri yüklenemedi');
    }).finally(() => setDataLoading(false));
  }, []);

  const onFinish = async (values: any) => {
    // Validate locations
    let hasErr = false;
    if (!pickup.trim()) { setPickupError('Alış noktası zorunludur'); hasErr = true; }
    if (!dropoff.trim()) { setDropoffError('Bırakış noktası zorunludur'); hasErr = true; }
    if (hasErr) return;

    setLoading(true);
    try {
      const payload: any = {
        passengerName: values.passengerName,
        passengerPhone: values.passengerPhone,
        passengerEmail: values.passengerEmail,
        pickup,
        dropoff,
        pickupDateTime: values.pickupDateTime?.toISOString(),
        flightNumber: values.flightNumber,
        adults: values.adults || 1,
        children: values.children || 0,
        infants: values.infants || 0,
        vehicleTypeId: values.vehicleTypeId,
        price: values.price,
        currency: values.currency || 'EUR',
        notes: values.notes,
      };

      if (values.actionType === 'SELF') {
        payload.vehicleId = values.vehicleId;
        payload.driverId = values.driverId;
      } else if (values.actionType === 'MARKETPLACE') {
        payload.marketplaceStatus = 'PUBLISHED';
        payload.b2bPriceType = values.b2bPriceType;
        if (values.b2bPriceType === 'FIXED_PRICE') payload.b2bPrice = values.b2bPrice;
      }

      const res = await apiClient.post('/api/transfer/partner/bookings', payload);
      if (res.data.success) {
        message.success('Rezervasyon başarıyla oluşturuldu');
        router.push(values.actionType === 'MARKETPLACE' ? '/partner/marketplace' : '/partner/pool');
      } else {
        message.error(res.data.error || 'Bilinmeyen bir hata oluştu');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Kayıt sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const sectionStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 14, padding: '20px 24px', marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const sectionHeader = (icon: React.ReactNode, label: string, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
        {icon}
      </div>
      <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{label}</span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="ps-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <ArrowLeftOutlined />
          </button>
          <div>
            <h1 className="ps-page-header__title">Yeni İş Ekle</h1>
            <p className="ps-page-header__subtitle">Kendi müşterinizden aldığınız işi sisteme girin</p>
          </div>
        </div>
      </div>

      {dataLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <p style={{ color: '#94a3b8', marginTop: 12 }}>Form yükleniyor…</p>
        </div>
      ) : (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{ actionType: 'SELF', adults: 1, children: 0, infants: 0, currency: 'EUR', b2bPriceType: 'OPEN_BID' }}
          >
            {/* 1 — Müşteri */}
            <div style={sectionStyle}>
              {sectionHeader(<UserOutlined />, 'Müşteri Bilgileri', '#6366f1')}
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="passengerName" label="Ad Soyad" rules={[{ required: true, message: 'Ad soyad zorunludur' }]}>
                    <input className="ps-input" placeholder="Ahmet Yılmaz" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="passengerPhone" label="Telefon">
                    <input className="ps-input" placeholder="+90 5XX XXX XX XX" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="passengerEmail" label="E-Posta" rules={[{ type: 'email', message: 'Geçerli e-posta giriniz' }]}>
                    <input className="ps-input" placeholder="ornek@email.com" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* 2 — Rota */}
            <div style={sectionStyle}>
              {sectionHeader(<EnvironmentOutlined />, 'Transfer Rotası ve Zamanı', '#10b981')}
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                      Alış Noktası <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div className="ps-location-wrap">
                      <PlaceAutocomplete
                        value={pickup}
                        onChange={(val) => { setPickup(val); if (val) setPickupError(''); }}
                        placeholder="Otel, havalimanı veya adres…"
                      />
                    </div>
                    {pickupError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{pickupError}</div>}
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                      Bırakış Noktası <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div className="ps-location-wrap">
                      <PlaceAutocomplete
                        value={dropoff}
                        onChange={(val) => { setDropoff(val); if (val) setDropoffError(''); }}
                        placeholder="Varış adresi…"
                      />
                    </div>
                    {dropoffError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{dropoffError}</div>}
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="pickupDateTime" label="Tarih & Saat" rules={[{ required: true, message: 'Tarih zorunludur' }]}>
                    <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="flightNumber" label="Uçuş Numarası (Opsiyonel)">
                    <input className="ps-input" placeholder="TK2434" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* 3 — Araç & Yolcu */}
            <div style={sectionStyle}>
              {sectionHeader(<CarOutlined />, 'Araç ve Yolcu', '#3b82f6')}
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="vehicleTypeId" label="Araç Sınıfı" rules={[{ required: true, message: 'Araç tipi seçiniz' }]}>
                    <Select placeholder="Araç sınıfı seçin" size="large">
                      {vehicleTypes.map(vt => (
                        <Option key={vt.id} value={vt.id}>{vt.name} — maks {vt.capacity} kişi</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={8} md={4}>
                  <Form.Item name="adults" label="Yetişkin">
                    <InputNumber min={1} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={8} md={4}>
                  <Form.Item name="children" label="Çocuk">
                    <InputNumber min={0} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={8} md={4}>
                  <Form.Item name="infants" label="Bebek">
                    <InputNumber min={0} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* 4 — Operasyon */}
            <div style={sectionStyle}>
              {sectionHeader(<GlobalOutlined />, 'Operasyon Türü', '#f59e0b')}
              <Form.Item name="actionType" label="Bu işi ne yapacaksınız?">
                <Radio.Group optionType="button" buttonStyle="solid" size="large">
                  <Radio value="SELF">Kendim Yapacağım</Radio>
                  <Radio value="MARKETPLACE">Pazar Yerine Gönder</Radio>
                </Radio.Group>
              </Form.Item>

              {actionType === 'SELF' && (
                <>
                  <Alert
                    message="İş doğrudan operasyon panelinize düşecek."
                    description="Şimdi araç ve sürücü atayabilirsiniz (opsiyonel)."
                    type="info" showIcon style={{ marginBottom: 20, borderRadius: 10 }}
                  />
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item name="vehicleId" label="Araç Ata (Opsiyonel)">
                        <Select placeholder="Araç seçin" allowClear size="large">
                          {myVehicles.map(v => (
                            <Option key={v.id} value={v.id}>{v.plateNumber} — {v.brand} {v.model}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="driverId" label="Sürücü Ata (Opsiyonel)">
                        <Select placeholder="Sürücü seçin" allowClear size="large">
                          {myDrivers.map(d => (
                            <Option key={d.id} value={d.id}>{d.firstName} {d.lastName}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              )}

              {actionType === 'MARKETPLACE' && (
                <div style={{ background: '#fdf4ff', padding: 20, borderRadius: 10, border: '1px solid #f5d0fe' }}>
                  <div style={{ fontWeight: 700, color: '#86198f', marginBottom: 14, fontSize: 14 }}>Pazar Yeri Ayarları</div>
                  <Form.Item name="b2bPriceType" label="Teklif Türü">
                    <Radio.Group>
                      <Space direction="vertical">
                        <Radio value="OPEN_BID">Tekliflere Açık — Partnerler fiyat teklifi versin</Radio>
                        <Radio value="FIXED_PRICE">Sabit Fiyat — İlk kabul eden işi alsın</Radio>
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                  {b2bPriceType === 'FIXED_PRICE' && (
                    <Form.Item name="b2bPrice" label="Partnere Ödenecek B2B Fiyat" rules={[{ required: true }]}>
                      <InputNumber min={0} style={{ width: 200 }} size="large" addonAfter={
                        <Form.Item name="currency" noStyle><Select style={{ width: 80 }}>
                          {['EUR', 'USD', 'TRY', 'GBP'].map(c => <Option key={c} value={c}>{c}</Option>)}
                        </Select></Form.Item>
                      } />
                    </Form.Item>
                  )}
                </div>
              )}
            </div>

            {/* 5 — Fiyat */}
            <div style={sectionStyle}>
              {sectionHeader(<DollarOutlined />, 'Fiyat ve Notlar', '#10b981')}
              <Row gutter={16}>
                <Col xs={24} md={10}>
                  <Form.Item name="price" label="Müşteriden Alınan Fiyat">
                    <InputNumber min={0} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item name="currency" label="Para Birimi">
                    <Select size="large">
                      {['EUR', 'USD', 'TRY', 'GBP'].map(c => <Option key={c} value={c}>{c}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="notes" label="Ek Notlar / Özel İstekler">
                <textarea
                  className="ps-input"
                  rows={3}
                  placeholder="Bebek koltuğu, tekerlekli sandalye, vb."
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Form.Item>
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button size="large" onClick={() => router.back()}>İptal</Button>
              <Button
                type="primary" htmlType="submit" size="large" loading={loading}
                icon={<CheckOutlined />}
                style={{ minWidth: 180, borderRadius: 10 }}
              >
                {actionType === 'MARKETPLACE' ? 'Pazar Yerine Gönder' : 'İşi Kaydet'}
              </Button>
            </div>
          </Form>
        </div>
      )}

      {/* Input styles */}
      <style jsx global>{`
        .ps-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 14px;
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          outline: none;
          color: #1e293b;
          background: #fff;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
          font-family: inherit;
          height: 40px;
        }
        .ps-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
        }
        .ps-input::placeholder { color: #94a3b8; }
        textarea.ps-input { height: auto; }
      `}</style>
    </div>
  );
}
