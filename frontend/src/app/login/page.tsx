'use client';

import React, { useState, useEffect } from 'react';
import { Button, Form, Input, message } from 'antd';
import { MailOutlined, LockOutlined, ArrowRightOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login } = useAuth();

  useEffect(() => { setMounted(true); }, []);

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      setLoading(true);
      const res = await axios.post(`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/auth/login`, values);
      const { user, token, refreshToken } = res.data.data;
      login(user, token);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      message.success('Giriş başarılı!');
      setTimeout(() => {
        if (user.role.type === 'SUPER_ADMIN' || user.role.type === 'TENANT_ADMIN') {
          window.location.href = '/admin';
        } else if (user.role.type === 'PARTNER' || user.role.code === 'PARTNER') {
          window.location.href = '/partner';
        } else if (user.role.type === 'AGENCY_ADMIN' || user.role.type === 'AGENCY_STAFF') {
          window.location.href = '/agency';
        } else {
          window.location.href = '/';
        }
      }, 500);
    } catch (err: any) {
      console.error('Login error:', err);
      const msg = err?.response?.data?.error || err?.message || 'Giriş başarısız. Email veya şifre hatalı olabilir.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes loginPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }
        @keyframes loginGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .login-wrapper {
          min-height: 100vh; min-height: 100dvh;
          display: flex; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .login-left {
          flex: 1; display: flex; flex-direction: column;
          justify-content: center; align-items: center;
          padding: 40px 32px; position: relative;
          background: #fff; z-index: 2; min-width: 0;
        }
        .login-right {
          flex: 1.2; position: relative; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 60%, #1e293b 100%);
          background-size: 300% 300%;
          animation: loginGradient 12s ease infinite;
        }
        .login-right-content {
          position: relative; z-index: 2; text-align: center;
          padding: 40px; max-width: 480px;
          animation: loginFadeUp 0.8s ease 0.3s both;
        }
        .login-right::before {
          content: ''; position: absolute; inset: 0;
          background: url(/background.gif) center/cover no-repeat;
          opacity: 0.15; z-index: 1;
        }
        .login-orb {
          position: absolute; border-radius: 50%; filter: blur(80px);
          animation: loginPulse 6s ease-in-out infinite;
        }
        .login-orb-1 {
          width: 300px; height: 300px; top: -80px; right: -60px;
          background: rgba(99,102,241,0.3);
        }
        .login-orb-2 {
          width: 250px; height: 250px; bottom: -60px; left: -40px;
          background: rgba(16,185,129,0.25); animation-delay: 3s;
        }
        .login-orb-3 {
          width: 180px; height: 180px; top: 40%; left: 30%;
          background: rgba(59,130,246,0.2); animation-delay: 1.5s;
        }
        .login-card-anim {
          animation: loginFadeUp 0.6s ease both;
          width: 100%; max-width: 400px;
        }
        .login-input .ant-input, .login-input .ant-input-password {
          height: 48px !important; border-radius: 12px !important;
          font-size: 14px !important; padding: 0 16px !important;
          border: 1.5px solid #e2e8f0 !important;
          transition: all 0.2s !important;
        }
        .login-input .ant-input-affix-wrapper {
          height: 48px !important; border-radius: 12px !important;
          padding: 0 16px !important;
          border: 1.5px solid #e2e8f0 !important;
          transition: all 0.2s !important;
        }
        .login-input .ant-input:focus, .login-input .ant-input-affix-wrapper:focus,
        .login-input .ant-input-affix-wrapper-focused {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1) !important;
        }
        .login-input .ant-input:hover, .login-input .ant-input-affix-wrapper:hover {
          border-color: #a5b4fc !important;
        }
        .login-btn {
          height: 50px !important; border-radius: 14px !important;
          font-size: 15px !important; font-weight: 700 !important;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
          border: none !important; letter-spacing: 0.3px;
          box-shadow: 0 6px 20px rgba(99,102,241,0.35) !important;
          transition: all 0.25s !important;
        }
        .login-btn:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 10px 28px rgba(99,102,241,0.4) !important;
        }
        .login-btn:active { transform: translateY(0) !important; }
        @media (max-width: 768px) {
          .login-wrapper { flex-direction: column; }
          .login-right { display: none; }
          .login-left {
            padding: 24px 20px; min-height: 100vh; min-height: 100dvh;
            background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
          }
          .login-card-anim { max-width: 100%; }
        }
        @media (max-width: 480px) {
          .login-left { padding: 20px 16px; }
        }
      `}</style>

      <div className="login-wrapper">
        {/* ── Left: Login Form ── */}
        <div className="login-left">
          <div className="login-card-anim" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s' }}>

            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <div style={{
                width: 60, height: 60, borderRadius: 18, margin: '0 auto 16px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
              }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>ST</span>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', margin: '0 0 4px', letterSpacing: -0.5 }}>
                Smart<span style={{ color: '#6366f1' }}>Transfer</span>
              </h1>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, fontWeight: 500 }}>
                Yönetim Paneline Giriş Yapın
              </p>
            </div>

            {/* Form */}
            <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
              <Form.Item
                name="email"
                label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>E-Posta Adresi</span>}
                rules={[
                  { required: true, message: 'E-posta adresi gerekli' },
                  { type: 'email', message: 'Geçerli bir e-posta girin' },
                ]}
                style={{ marginBottom: 20 }}
              >
                <Input
                  className="login-input"
                  prefix={<MailOutlined style={{ color: '#94a3b8', fontSize: 16, marginRight: 8 }} />}
                  placeholder="ornek@sirket.com"
                />
              </Form.Item>

              <Form.Item
                name="password"
                label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Şifre</span>}
                rules={[{ required: true, message: 'Şifre gerekli' }]}
                style={{ marginBottom: 28 }}
              >
                <Input.Password
                  className="login-input"
                  prefix={<LockOutlined style={{ color: '#94a3b8', fontSize: 16, marginRight: 8 }} />}
                  placeholder="Şifrenizi girin"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 16 }}>
                <Button
                  className="login-btn"
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  icon={!loading ? <ArrowRightOutlined /> : undefined}
                  iconPosition="end"
                >
                  {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                </Button>
              </Form.Item>
            </Form>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <p style={{ fontSize: 11, color: '#cbd5e1', margin: 0 }}>
                SmartTransfer &copy; {new Date().getFullYear()}
              </p>
            </div>

          </div>
        </div>

        {/* ── Right: Visual Panel ── */}
        <div className="login-right">
          <div className="login-orb login-orb-1" />
          <div className="login-orb login-orb-2" />
          <div className="login-orb login-orb-3" />

          <div className="login-right-content">
            <div style={{
              width: 80, height: 80, borderRadius: 24, margin: '0 auto 28px',
              background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'loginFloat 5s ease-in-out infinite',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2 style={{
              fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 12px',
              letterSpacing: -0.5, lineHeight: 1.2,
            }}>
              Transfer Yönetiminde<br />
              <span style={{ color: '#a5b4fc' }}>Yeni Nesil</span> Çözüm
            </h2>
            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 36px',
              lineHeight: 1.6, maxWidth: 360, marginInline: 'auto',
            }}>
              Araç filonuzu, rezervasyonlarınızı ve operasyonlarınızı
              tek bir platformdan profesyonelce yönetin.
            </p>

            {/* Feature pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {['Filo Yönetimi', 'Canlı Takip', 'Akıllı Fiyatlandırma', 'Raporlama'].map((f, i) => (
                <div key={f} style={{
                  padding: '8px 18px', borderRadius: 50,
                  background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                  animation: `loginFadeUp 0.5s ease ${0.6 + i * 0.1}s both`,
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
};

export default LoginPage;
