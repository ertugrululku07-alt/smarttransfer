'use client';

import React, { useState, useEffect } from 'react';
import { Button, Form, Input, message } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, ArrowRightOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

export default function RegisterCustomerPage() {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => { setMounted(true); }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/register`, {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      }, {
        headers: { 'X-Tenant-Slug': TENANT_SLUG }
      });

      if (res.data.success) {
        const { user, token } = res.data.data;
        if (user && token) login(user, token);
        message.success('Hesabınız başarıyla oluşturuldu!');
        setTimeout(() => { window.location.href = '/'; }, 1000);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Kayıt başarısız oldu.';
      message.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <>
      <style>{`
        @keyframes regFadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .cust-reg-page { min-height:100vh; min-height:100dvh; display:flex; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        .cust-reg-left { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:40px 32px; background:#fff; }
        .cust-reg-right { flex:1; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%); }
        .cust-reg-form { width:100%; max-width:400px; animation:regFadeUp 0.5s ease both; }
        .cust-reg-input .ant-input, .cust-reg-input .ant-input-affix-wrapper { height:48px !important; border-radius:12px !important; border:1.5px solid #e2e8f0 !important; font-size:14px !important; transition:all 0.2s !important; }
        .cust-reg-input .ant-input-affix-wrapper { padding:0 16px !important; }
        .cust-reg-input .ant-input:focus, .cust-reg-input .ant-input-affix-wrapper-focused { border-color:#6366f1 !important; box-shadow:0 0 0 3px rgba(99,102,241,0.1) !important; }
        .cust-reg-btn { height:50px !important; border-radius:14px !important; font-size:15px !important; font-weight:700 !important; background:linear-gradient(135deg,#6366f1,#8b5cf6) !important; border:none !important; box-shadow:0 6px 20px rgba(99,102,241,0.35) !important; transition:all 0.25s !important; }
        .cust-reg-btn:hover { transform:translateY(-1px) !important; box-shadow:0 10px 28px rgba(99,102,241,0.4) !important; }
        @media (max-width:768px) {
          .cust-reg-page { flex-direction:column; }
          .cust-reg-right { display:none; }
          .cust-reg-left { padding:24px 20px; min-height:100vh; min-height:100dvh; background:linear-gradient(180deg,#f8fafc,#eef2ff); }
          .cust-reg-form { max-width:100%; }
        }
      `}</style>

      <div className="cust-reg-page">
        <div className="cust-reg-left">
          <div className="cust-reg-form" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s' }}>
            {/* Back */}
            <a href="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', textDecoration: 'none', marginBottom: 32, fontWeight: 500 }}>
              <ArrowLeftOutlined /> Tüm seçenekler
            </a>

            {/* Header */}
            <div style={{ marginBottom: 36 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, marginBottom: 16,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(99,102,241,0.25)',
              }}>
                <UserOutlined style={{ fontSize: 22, color: '#fff' }} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px', letterSpacing: -0.5 }}>
                Müşteri Hesabı Oluştur
              </h1>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                Hızlı ve kolay kayıt ile transfer hizmetlerinden yararlanın
              </p>
            </div>

            <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="firstName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Ad</span>}
                  rules={[{ required: true, message: 'Ad gerekli' }]}>
                  <Input className="cust-reg-input" placeholder="Ahmet" prefix={<UserOutlined style={{ color: '#94a3b8', marginRight: 6 }} />} />
                </Form.Item>
                <Form.Item name="lastName" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Soyad</span>}
                  rules={[{ required: true, message: 'Soyad gerekli' }]}>
                  <Input className="cust-reg-input" placeholder="Yılmaz" />
                </Form.Item>
              </div>

              <Form.Item name="email" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>E-Posta Adresi</span>}
                rules={[{ required: true, message: 'E-posta gerekli' }, { type: 'email', message: 'Geçerli bir e-posta girin' }]}
                style={{ marginBottom: 16 }}>
                <Input className="cust-reg-input" placeholder="ornek@email.com" prefix={<MailOutlined style={{ color: '#94a3b8', marginRight: 6 }} />} />
              </Form.Item>

              <Form.Item name="password" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şifre</span>}
                rules={[{ required: true, message: 'Şifre gerekli' }, { min: 8, message: 'En az 8 karakter' }]}
                style={{ marginBottom: 16 }}>
                <Input.Password className="cust-reg-input" placeholder="En az 8 karakter" prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: 6 }} />} />
              </Form.Item>

              <Form.Item name="confirmPassword" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şifre Tekrar</span>}
                dependencies={['password']}
                rules={[{ required: true, message: 'Şifre tekrarı gerekli' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error('Şifreler eşleşmiyor'));
                    },
                  }),
                ]}
                style={{ marginBottom: 24 }}>
                <Input.Password className="cust-reg-input" placeholder="Şifrenizi tekrar girin" prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: 6 }} />} />
              </Form.Item>

              <Form.Item style={{ marginBottom: 16 }}>
                <Button className="cust-reg-btn" type="primary" htmlType="submit" loading={loading} block
                  icon={!loading ? <ArrowRightOutlined /> : undefined} iconPosition="end">
                  {loading ? 'Kayıt yapılıyor...' : 'Hesap Oluştur'}
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>
                Zaten hesabınız var mı? <a href="/login" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Giriş Yapın</a>
              </p>
            </div>
          </div>
        </div>

        {/* Right visual */}
        <div className="cust-reg-right">
          <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', top: -60, right: -60, filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', bottom: -40, left: -40, filter: 'blur(60px)' }} />
          <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: 40, maxWidth: 400, animation: 'regFadeUp 0.6s ease 0.3s both' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 22, margin: '0 auto 24px',
              background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <UserOutlined style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)' }} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 12px', lineHeight: 1.3 }}>
              Kolayca Rezervasyon<br />
              <span style={{ color: '#c4b5fd' }}>Yapın</span>
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
              Hesabınızla transferlerinizi planlayın, geçmiş siparişlerinizi görüntüleyin ve özel fırsatlardan yararlanın.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
