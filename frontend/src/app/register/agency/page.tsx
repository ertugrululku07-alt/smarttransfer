'use client';

import React, { useState, useEffect } from 'react';
import { Button, Form, Input, message, Row, Col } from 'antd';
import {
  MailOutlined, LockOutlined, UserOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  ShopOutlined, PhoneOutlined, BankOutlined, GlobalOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

export default function RegisterAgencyPage() {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/register-agency`, {
        // User info
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        password: values.password,
        // Agency info
        agencyName: values.agencyName,
        companyName: values.companyName,
        taxOffice: values.taxOffice,
        taxNumber: values.taxNumber,
        address: values.address,
        website: values.website,
      }, {
        headers: { 'X-Tenant-Slug': TENANT_SLUG }
      });

      if (res.data.success) {
        message.success('Acenta başvurunuz alındı! Onay sonrası giriş yapabilirsiniz.');
        setTimeout(() => { window.location.href = '/login'; }, 2000);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Kayıt başarısız oldu.');
    } finally { setLoading(false); }
  };

  const accentColor = '#7c3aed';

  return (
    <>
      <style>{`
        @keyframes regFadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .agency-reg { min-height:100vh; min-height:100dvh; display:flex; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        .agency-reg-left { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:40px 32px; background:#fff; overflow-y:auto; }
        .agency-reg-right { flex:0.9; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%); }
        .agency-reg-form { width:100%; max-width:520px; animation:regFadeUp 0.5s ease both; }
        .agency-input .ant-input, .agency-input .ant-input-affix-wrapper { height:46px !important; border-radius:12px !important; border:1.5px solid #e2e8f0 !important; font-size:14px !important; transition:all 0.2s !important; }
        .agency-input .ant-input-affix-wrapper { padding:0 14px !important; }
        .agency-input .ant-input:focus, .agency-input .ant-input-affix-wrapper-focused { border-color:${accentColor} !important; box-shadow:0 0 0 3px rgba(124,58,237,0.1) !important; }
        .agency-btn { height:50px !important; border-radius:14px !important; font-size:15px !important; font-weight:700 !important; background:linear-gradient(135deg,#7c3aed,#a855f7) !important; border:none !important; box-shadow:0 6px 20px rgba(124,58,237,0.35) !important; transition:all 0.25s !important; }
        .agency-btn:hover { transform:translateY(-1px) !important; box-shadow:0 10px 28px rgba(124,58,237,0.4) !important; }
        @media (max-width:768px) {
          .agency-reg { flex-direction:column; }
          .agency-reg-right { display:none; }
          .agency-reg-left { padding:24px 20px; min-height:100vh; min-height:100dvh; background:linear-gradient(180deg,#f8fafc,#f5f3ff); }
          .agency-reg-form { max-width:100%; }
        }
      `}</style>

      <div className="agency-reg">
        <div className="agency-reg-left">
          <div className="agency-reg-form" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s' }}>
            {/* Back */}
            <a href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', textDecoration: 'none', marginBottom: 28, fontWeight: 500 }}>
              <ArrowLeftOutlined /> Tüm seçenekler
            </a>

            {/* Header */}
            <div style={{ marginBottom: 32 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, marginBottom: 16,
                background: `linear-gradient(135deg, ${accentColor}, #a855f7)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 6px 20px ${accentColor}30`,
              }}>
                <ShopOutlined style={{ fontSize: 22, color: '#fff' }} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px', letterSpacing: -0.5 }}>
                Alt Acenta Başvurusu
              </h1>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                B2B iş ortağı olarak özel fiyatlar ve komisyon sistemiyle kazanın
              </p>
            </div>

            <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
              {/* Section: Personal */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                <UserOutlined style={{ fontSize: 13 }} /> Yetkili Kişi Bilgileri
              </div>

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="firstName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Ad</span>}
                    rules={[{ required: true, message: 'Gerekli' }]}>
                    <Input className="agency-input" placeholder="Ad" prefix={<UserOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="lastName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Soyad</span>}
                    rules={[{ required: true, message: 'Gerekli' }]}>
                    <Input className="agency-input" placeholder="Soyad" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="email" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>E-Posta</span>}
                    rules={[{ required: true, message: 'Gerekli' }, { type: 'email', message: 'Geçerli e-posta' }]}>
                    <Input className="agency-input" placeholder="acenta@email.com" prefix={<MailOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="phone" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Telefon</span>}
                    rules={[{ required: true, message: 'Gerekli' }]}>
                    <Input className="agency-input" placeholder="0555 123 45 67" prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="password" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şifre</span>}
                    rules={[{ required: true, message: 'Gerekli' }, { min: 8, message: 'En az 8 karakter' }]}>
                    <Input.Password className="agency-input" placeholder="En az 8 karakter" prefix={<LockOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="confirmPassword" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şifre Tekrar</span>}
                    dependencies={['password']}
                    rules={[{ required: true, message: 'Gerekli' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) return Promise.resolve();
                          return Promise.reject(new Error('Şifreler eşleşmiyor'));
                        },
                      }),
                    ]}>
                    <Input.Password className="agency-input" placeholder="Tekrar girin" prefix={<LockOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
              </Row>

              {/* Section: Company */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 8,
                fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                <BankOutlined style={{ fontSize: 13 }} /> Firma Bilgileri
              </div>

              <Form.Item name="agencyName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Acenta Adı</span>}
                rules={[{ required: true, message: 'Gerekli' }]}>
                <Input className="agency-input" placeholder="Örn: ABC Turizm" prefix={<ShopOutlined style={{ color: '#94a3b8' }} />} />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="companyName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şirket Ünvanı</span>}>
                    <Input className="agency-input" placeholder="ABC Turizm Ltd. Şti." />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="website" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Web Sitesi</span>}>
                    <Input className="agency-input" placeholder="www.acenta.com" prefix={<GlobalOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="taxOffice" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Vergi Dairesi</span>}>
                    <Input className="agency-input" placeholder="Antalya" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="taxNumber" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Vergi No</span>}>
                    <Input className="agency-input" placeholder="1234567890" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="address" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Adres</span>}>
                <Input.TextArea rows={2} placeholder="Firma adresi" style={{ borderRadius: 12, border: '1.5px solid #e2e8f0' }} />
              </Form.Item>

              <Form.Item style={{ marginBottom: 16, marginTop: 8 }}>
                <Button className="agency-btn" type="primary" htmlType="submit" loading={loading} block
                  icon={!loading ? <ArrowRightOutlined /> : undefined} iconPosition="end">
                  {loading ? 'Gönderiliyor...' : 'Başvuruyu Gönder'}
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>
                Zaten hesabınız var mı? <a href="/login" style={{ color: accentColor, fontWeight: 600, textDecoration: 'none' }}>Giriş Yapın</a>
              </p>
            </div>
          </div>
        </div>

        {/* Right visual */}
        <div className="agency-reg-right">
          <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', top: -80, right: -80, filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', bottom: -40, left: -20, filter: 'blur(60px)' }} />
          <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: 40, maxWidth: 400, animation: 'regFadeUp 0.6s ease 0.3s both' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 22, margin: '0 auto 24px',
              background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShopOutlined style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)' }} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 12px', lineHeight: 1.3 }}>
              B2B İş Ortaklığı ile<br />
              <span style={{ color: '#d8b4fe' }}>Büyüyün</span>
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto 32px' }}>
              Özel acenta fiyatları, komisyon sistemi ve kendi yönetim panelinizle müşterilerinize transfer hizmeti sunun.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {['Özel B2B Fiyat', 'Komisyon Sistemi', 'Acenta Paneli', 'Canlı Destek'].map((f, i) => (
                <div key={f} style={{
                  padding: '7px 16px', borderRadius: 50,
                  background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                  animation: `regFadeUp 0.4s ease ${0.5 + i * 0.1}s both`,
                }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
