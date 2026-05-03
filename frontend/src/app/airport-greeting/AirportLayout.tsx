'use client';

import React, { useState } from 'react';
import { Layout, Typography, Avatar, Dropdown, Badge, Button } from 'antd';
import {
  LogoutOutlined, UserOutlined, BellOutlined, MenuOutlined,
  HomeOutlined, SettingOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const { Header, Content } = Layout;

interface AirportLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const AirportLayout: React.FC<AirportLayoutProps> = ({ children, title, subtitle }) => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const userInitials = (user?.fullName || user?.email || 'A')
    .split(' ').map((n: string) => n.charAt(0).toUpperCase()).slice(0, 2).join('');

  const isAdmin = user ? ['SUPER_ADMIN', 'TENANT_ADMIN', 'PLATFORM_OPS'].includes(user.role.type) : false;

  const menuItems = [
    ...(isAdmin ? [{
      key: 'admin',
      icon: <HomeOutlined />,
      label: 'Admin Paneline Dön',
      onClick: () => router.push('/admin'),
    }] : []),
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Çıkış Yap',
      danger: true,
      onClick: handleLogout,
    },
  ];

  if (!mounted) {
    return <div style={{ minHeight: '100vh', background: '#0c1222' }} />;
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Top Header */}
      <Header style={{
        background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%)',
        padding: '0 16px',
        height: 56,
        lineHeight: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}>
        {/* Left: Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontSize: 22, lineHeight: 1,
          }}>✈️</div>
          <div>
            <div style={{
              color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.1,
              letterSpacing: -0.3,
            }}>
              Havalimanı Karşılama
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 500, lineHeight: 1,
            }}>
              Smart Transfer
            </div>
          </div>
        </div>

        {/* Right: User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '4px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}>
              <Avatar
                size={30}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  fontWeight: 700, fontSize: 12,
                }}
              >
                {userInitials}
              </Avatar>
              <div style={{ lineHeight: 1 }}>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  {user?.fullName || user?.email}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>
                  Karşılama Personeli
                </div>
              </div>
            </div>
          </Dropdown>
        </div>
      </Header>

      {/* Content */}
      <Content style={{
        padding: '12px',
        background: '#f0f4f8',
        minHeight: 'calc(100vh - 56px)',
      }}>
        {/* Page Title */}
        {title && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</div>}
          </div>
        )}
        {children}
      </Content>
    </Layout>
  );
};

export default AirportLayout;
