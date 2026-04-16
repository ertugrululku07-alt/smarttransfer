'use client';

import React, { useState, useEffect } from 'react';
import { Button, Form, Input, InputNumber, Select, message, Upload, Row, Col } from 'antd';
import {
  MailOutlined, LockOutlined, UserOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  CarOutlined, PhoneOutlined, UploadOutlined, FileTextOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const { Option } = Select;

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

const STEPS = [
  { key: 'info', title: 'Kişisel Bilgiler', icon: UserOutlined },
  { key: 'vehicle', title: 'Araç Bilgileri', icon: CarOutlined },
  { key: 'docs', title: 'Belgeler', icon: FileTextOutlined },
  { key: 'done', title: 'Tamamla', icon: CheckCircleOutlined },
];

export default function RegisterPartnerPage() {
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [form] = Form.useForm();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  const handleNext = async () => {
    try {
      const fields = current === 0
        ? ['firstName', 'lastName', 'email', 'phone', 'password']
        : current === 1
          ? ['vehiclePlate', 'vehicleBrand', 'vehicleModel', 'vehicleYear', 'vehicleType']
          : [];
      if (fields.length > 0) await form.validateFields(fields);
      setCurrent(current + 1);
    } catch { /* validation failed */ }
  };

  const handlePrev = () => setCurrent(current - 1);

  const uploadProps = (field: string) => ({
    name: 'file',
    action: `${API_URL}/api/upload/driver-docs`,
    headers: { authorization: 'authorization-text' },
    maxCount: 1,
    onChange(info: any) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} yüklendi`);
        form.setFieldsValue({ [field]: info.file.response?.data?.url });
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} yüklenemedi`);
      }
    },
  });

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/register-driver`, values, {
        headers: { 'X-Tenant-Slug': TENANT_SLUG }
      });
      if (res.data.success) {
        message.success('Başvurunuz başarıyla alındı!');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Kayıt başarısız oldu.');
    } finally { setLoading(false); }
  };

  const accentColor = '#0891b2';

  return (
    <>
      <style>{`
        @keyframes regFadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .partner-reg { min-height:100vh; min-height:100dvh; display:flex; align-items:center; justify-content:center; background:linear-gradient(180deg,#f8fafc 0%,#ecfeff 50%,#f8fafc 100%); padding:40px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        .partner-card { background:#fff; border-radius:24px; width:100%; max-width:680px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06); border:1px solid #f0f0f0; animation:regFadeUp 0.5s ease both; }
        .partner-input .ant-input, .partner-input .ant-input-affix-wrapper, .partner-input .ant-select-selector, .partner-input .ant-input-number { height:46px !important; border-radius:12px !important; border:1.5px solid #e2e8f0 !important; font-size:14px !important; }
        .partner-input .ant-input-affix-wrapper { padding:0 14px !important; }
        .partner-input .ant-input:focus, .partner-input .ant-input-affix-wrapper-focused, .partner-input .ant-select-focused .ant-select-selector { border-color:${accentColor} !important; box-shadow:0 0 0 3px rgba(8,145,178,0.1) !important; }
        .partner-btn { height:48px !important; border-radius:14px !important; font-weight:700 !important; background:linear-gradient(135deg,#0891b2,#06b6d4) !important; border:none !important; box-shadow:0 6px 20px rgba(8,145,178,0.3) !important; }
        .partner-btn:hover { transform:translateY(-1px) !important; }
        @media (max-width:480px) { .partner-reg { padding:16px; } .partner-card { border-radius:20px; } }
      `}</style>

      <div className="partner-reg">
        <div className="partner-card" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s' }}>
          {/* Top bar */}
          <div style={{ height: 6, background: `linear-gradient(135deg, ${accentColor}, #06b6d4)` }} />

          <div style={{ padding: '28px 32px 32px' }}>
            {/* Back */}
            <a href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', textDecoration: 'none', marginBottom: 24, fontWeight: 500 }}>
              <ArrowLeftOutlined /> Tüm seçenekler
            </a>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: `linear-gradient(135deg, ${accentColor}, #06b6d4)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 6px 20px ${accentColor}30`,
              }}>
                <CarOutlined style={{ fontSize: 22, color: '#fff' }} />
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.3 }}>
                  Partner / Sürücü Başvurusu
                </h1>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                  Ekibimize katılın ve kazanmaya başlayın
                </p>
              </div>
            </div>

            {/* Steps indicator */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
              {STEPS.map((s, i) => {
                const StepIcon = s.icon;
                const isActive = i === current;
                const isDone = i < current;
                return (
                  <div key={s.key} style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    borderRadius: 12, fontSize: 12, fontWeight: 600,
                    background: isActive ? `${accentColor}10` : isDone ? '#f0fdf4' : '#f8fafc',
                    border: isActive ? `1.5px solid ${accentColor}40` : '1.5px solid transparent',
                    color: isActive ? accentColor : isDone ? '#16a34a' : '#94a3b8',
                    transition: 'all 0.2s',
                  }}>
                    <StepIcon style={{ fontSize: 14 }} />
                    <span className="partner-step-label" style={{ display: 'block' }}>{s.title}</span>
                  </div>
                );
              })}
            </div>

            {/* Form */}
            <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} initialValues={{ vehicleType: 'SEDAN' }}>

              {/* Step 1: Personal */}
              <div style={{ display: current === 0 ? 'block' : 'none' }}>
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="firstName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Ad</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Input className="partner-input" placeholder="Ahmet" prefix={<UserOutlined style={{ color: '#94a3b8' }} />} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="lastName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Soyad</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Input className="partner-input" placeholder="Yılmaz" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="email" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>E-Posta</span>}
                      rules={[{ required: true, message: 'Gerekli' }, { type: 'email', message: 'Geçerli e-posta girin' }]}>
                      <Input className="partner-input" placeholder="ornek@email.com" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="phone" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Telefon</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Input className="partner-input" placeholder="0555 123 45 67" prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="password" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şifre</span>}
                  rules={[{ required: true, message: 'Gerekli' }, { min: 6, message: 'En az 6 karakter' }]}>
                  <Input.Password className="partner-input" placeholder="En az 6 karakter" prefix={<LockOutlined style={{ color: '#94a3b8' }} />} />
                </Form.Item>
              </div>

              {/* Step 2: Vehicle */}
              <div style={{ display: current === 1 ? 'block' : 'none' }}>
                <div style={{
                  padding: '12px 16px', borderRadius: 12, background: '#ecfeff', border: '1px solid #cffafe',
                  marginBottom: 20, fontSize: 13, color: '#0e7490', fontWeight: 500,
                }}>
                  Araç bilgilerinizin ruhsatla uyumlu olması önemlidir.
                </div>
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="vehiclePlate" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Plaka</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Input className="partner-input" placeholder="34 ABC 123" style={{ textTransform: 'uppercase' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="vehicleType" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Araç Tipi</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Select className="partner-input" size="large">
                        <Option value="SEDAN">Binek (Sedan)</Option>
                        <Option value="VAN">Van / Minivan</Option>
                        <Option value="MINIBUS">Minibüs</Option>
                        <Option value="BUS">Otobüs</Option>
                        <Option value="VIP">VIP</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col xs={24} sm={8}>
                    <Form.Item name="vehicleBrand" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Marka</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Input className="partner-input" placeholder="Mercedes" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item name="vehicleModel" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Model</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <Input className="partner-input" placeholder="Vito" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item name="vehicleYear" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Yıl</span>}
                      rules={[{ required: true, message: 'Gerekli' }]}>
                      <InputNumber className="partner-input" style={{ width: '100%' }} min={2000} max={2026} placeholder="2024" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>

              {/* Step 3: Documents */}
              <div style={{ display: current === 2 ? 'block' : 'none' }}>
                <div style={{
                  padding: '12px 16px', borderRadius: 12, background: '#ecfeff', border: '1px solid #cffafe',
                  marginBottom: 20, fontSize: 13, color: '#0e7490', fontWeight: 500,
                }}>
                  Gerekli belgeleri PDF veya resim formatında yükleyin.
                </div>
                <Form.Item name="tursabDocument" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Türsab Belgesi</span>}>
                  <Upload {...uploadProps('tursabDocument')} listType="picture">
                    <Button icon={<UploadOutlined />} style={{ borderRadius: 10 }}>Dosya Seç</Button>
                  </Upload>
                </Form.Item>
                <Form.Item name="srcDocument" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>SRC Belgesi</span>}>
                  <Upload {...uploadProps('srcDocument')} listType="picture">
                    <Button icon={<UploadOutlined />} style={{ borderRadius: 10 }}>Dosya Seç</Button>
                  </Upload>
                </Form.Item>
                <Form.Item name="licenseDocument" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Ehliyet</span>}>
                  <Upload {...uploadProps('licenseDocument')} listType="picture">
                    <Button icon={<UploadOutlined />} style={{ borderRadius: 10 }}>Dosya Seç</Button>
                  </Upload>
                </Form.Item>
              </div>

              {/* Step 4: Done */}
              <div style={{ display: current === 3 ? 'block' : 'none', textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 22, margin: '0 auto 20px',
                  background: 'linear-gradient(135deg, #10b981, #34d399)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckCircleOutlined style={{ fontSize: 32, color: '#fff' }} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', margin: '0 0 8px' }}>Hazırsınız!</h2>
                <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>
                  Bilgilerinizi kontrol ettiyseniz başvuruyu tamamlayın.
                </p>
                <Button className="partner-btn" type="primary" htmlType="submit" loading={loading} size="large"
                  style={{ paddingInline: 48 }}>
                  {loading ? 'Gönderiliyor...' : 'Başvuruyu Tamamla'}
                </Button>
              </div>

              {/* Navigation */}
              {current < 3 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {current > 0 ? (
                    <Button onClick={handlePrev} size="large" style={{ borderRadius: 12, fontWeight: 600 }}>
                      <ArrowLeftOutlined /> Geri
                    </Button>
                  ) : <div />}
                  <Button type="primary" onClick={handleNext} size="large"
                    style={{ borderRadius: 12, fontWeight: 600, background: `linear-gradient(135deg, ${accentColor}, #06b6d4)`, border: 'none' }}>
                    İleri <ArrowRightOutlined />
                  </Button>
                </div>
              )}
            </Form>

            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>
                Zaten hesabınız var mı? <a href="/login" style={{ color: accentColor, fontWeight: 600, textDecoration: 'none' }}>Giriş Yapın</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
