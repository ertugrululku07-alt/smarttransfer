'use client';

import React, { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      setLoading(true);

      console.log('🔐 Attempting login...');
      const res = await axios.post(`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/auth/login`, values);
      console.log('✅ Login response:', res.data);

      // New V2 API response format
      const { user, token, refreshToken } = res.data.data;

      // Pass both user and token to context
      login(user, token);

      // Store refresh token
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }

      message.success('Giriş başarılı! 🎉');

      // Immediate redirect using window.location
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
      console.error('❌ Login error:', err);
      console.error('Response:', err.response?.data);

      const msg =
        err?.response?.data?.error || err?.message || 'Giriş başarısız. Email veya şifre hatalı olabilir.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Left Side - Login Form */}
      <div style={{
        flex: '1',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        maxWidth: '500px',
        width: '100%',
        backgroundColor: '#fff'
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            {/* Logo Placeholder - You can replace with <img src="/logo.png" /> */}
            <Title level={2} style={{ color: '#333', marginBottom: 10 }}>Smart<span style={{ color: '#1890ff' }}>Agent</span></Title>
          </div>

          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item
              label={<span style={{ fontWeight: 600 }}>E-Mail</span>}
              name="email"
              rules={[
                { required: true, message: 'Lütfen email girin' },
                { type: 'email', message: 'Geçerli bir email girin' },
              ]}
            >
              <Input placeholder="E-mail giriniz" />
            </Form.Item>

            <Form.Item
              label={<span style={{ fontWeight: 600 }}>Şifre</span>}
              name="password"
              rules={[{ required: true, message: 'Lütfen şifre girin' }]}
            >
              <Input.Password placeholder="Şifre" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                style={{
                  marginTop: 10,
                  backgroundColor: '#d32f2f',
                  borderColor: '#d32f2f',
                  height: '50px',
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </Button>
            </Form.Item>
          </Form>


        </div>
      </div>

      {/* Right Side - Background Image */}
      <div style={{
        flex: '1.5',
        backgroundColor: '#f0f2f5',
        backgroundImage: 'url(/background.gif)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {/* Overlay or content if needed */}
        {/* If background.gif isn't loaded yet, show a placeholder or nothing */}
      </div>
    </div>
  );
};

export default LoginPage;