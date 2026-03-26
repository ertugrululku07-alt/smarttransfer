'use client';

import React, { useState } from 'react';
import { Layout, Menu, Button, Typography, Space, Dropdown, Avatar, Badge, Tooltip } from 'antd';
import {
  DashboardOutlined,
  CarOutlined,
  UserOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  GlobalOutlined,
  ShopOutlined,
  CalendarOutlined,
  AppstoreOutlined,
  BankOutlined,
  TeamOutlined,
  CreditCardOutlined,
  BarChartOutlined,
  HomeOutlined,
  BellOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import FloatingDriverChat from '../components/FloatingDriverChat';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

interface AdminLayoutProps {
  children: React.ReactNode;
  selectedKey?: string;
  fullWidth?: boolean;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, selectedKey = 'dashboard', fullWidth = false }) => {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();
  const { branding, fullName } = useBranding();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const userInitials = (user?.fullName || user?.email || 'A').split(' ').map((n: string) => n.charAt(0).toUpperCase()).slice(0, 2).join('');

  const userMenuItems = [
    {
      key: 'home',
      icon: <HomeOutlined />,
      label: 'Ana Sayfaya Git',
      onClick: () => router.push('/'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Site Ayarları',
      onClick: () => router.push('/admin/site-settings'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Çıkış Yap',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={260}
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
        trigger={null}
      >
        {/* Brand Logo */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => router.push('/admin')}
        >
          {collapsed ? (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: -0.5,
            }}>
              {branding.siteNameHighlight.charAt(0)}{branding.siteName.charAt(0)}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0,
              }}>
                {branding.siteNameHighlight.charAt(0)}{branding.siteName.charAt(0)}
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2, letterSpacing: -0.3 }}>
                  {fullName}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 500 }}>
                  Yönetim Paneli
                </div>
              </div>
            </div>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          defaultOpenKeys={['vehicles']}
          selectedKeys={[selectedKey]}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '8px 0',
          }}
          items={[
            {
              key: 'dashboard',
              icon: <DashboardOutlined />,
              label: 'Dashboard',
              onClick: () => router.push('/admin')
            },
            {
              key: 'reservations',
              icon: <CalendarOutlined />,
              label: 'Rezervasyon İşlemleri',
              children: [
                {
                  key: 'transfers',
                  label: 'Rezervasyonlar',
                  onClick: () => router.push('/admin/transfers')
                }
              ]
            },
            {
              key: 'operations',
              icon: <AppstoreOutlined />,
              label: 'Operasyon Yönetimi',
              children: [
                {
                  key: 'op-dashboard',
                  label: 'Dashboard',
                  onClick: () => router.push('/admin/operation')
                },
                {
                  key: 'driver-tracking',
                  label: 'Şoför Takip',
                  onClick: () => router.push('/admin/live-map')
                },
                {
                  key: 'operations-list',
                  label: 'Operasyon',
                  onClick: () => router.push('/admin/operation/operations')
                },
                {
                  key: 'pool-transfers',
                  label: 'Havuzdaki Transferler',
                  onClick: () => router.push('/admin/operation/pool')
                },
                {
                  key: 'partner-transfers',
                  label: 'Partner Transfer Listesi',
                  onClick: () => router.push('/admin/operation/partner-transfers')
                }
              ]
            },
            {
              key: 'accounting',
              icon: <BankOutlined />,
              label: 'Muhasebe',
              children: [
                {
                  key: 'accounting-dashboard',
                  label: 'Genel Durum',
                  onClick: () => router.push('/admin/accounting')
                },
                {
                  key: 'accounting-accounts',
                  label: 'Cariler',
                  onClick: () => router.push('/admin/accounting/accounts')
                },
                {
                  key: 'accounting-invoices',
                  label: 'Kesilecek Faturalar',
                  onClick: () => router.push('/admin/accounting/invoices')
                },
                {
                  key: 'kasa',
                  label: 'Kasa',
                  onClick: () => router.push('/admin/accounting/kasa')
                },
                {
                  key: 'agency-deposits',
                  label: 'Acente Depozitoları',
                  onClick: () => router.push('/admin/agencies/deposits')
                },
                {
                  key: 'payroll',
                  label: 'Personel Hakediş & Maaş',
                  onClick: () => router.push('/admin/accounting/payroll')
                }
              ]
            },
            {
              key: 'partner-operations',
              icon: <TeamOutlined />,
              label: 'Partner / Acente',
              children: [
                {
                  key: 'partner-applications',
                  label: 'Partner Başvuruları',
                  onClick: () => router.push('/admin/partner-applications')
                },
                {
                  key: 'agencies',
                  label: 'Alt Acenteler (B2B)',
                  onClick: () => router.push('/admin/agencies')
                },
                {
                  key: 'agency-contracts',
                  label: 'Acenta Kontratları',
                  onClick: () => router.push('/admin/agencies/contracts')
                }
              ]
            },
            {
              key: 'bank-management',
              icon: <CreditCardOutlined />,
              label: 'Banka Yönetimi',
              children: [
                {
                  key: 'bank-list',
                  label: 'Banka Listesi',
                  onClick: () => router.push('/admin/banks')
                },
                {
                  key: 'virtual-pos',
                  label: 'Sanal Pos Ayarları',
                  onClick: () => router.push('/admin/banks/virtual-pos')
                }
              ]
            },
            {
              key: 'vehicles-definitions',
              icon: <CarOutlined />,
              label: 'Araç Tanımları',
              children: [
                {
                  key: 'vehicles',
                  label: 'Araçlar',
                  onClick: () => router.push('/admin/vehicles')
                },
                {
                  key: 'vehicle-types',
                  label: 'Araç Tipleri',
                  onClick: () => router.push('/admin/vehicle-types')
                },
                {
                  key: 'pricing',
                  label: 'Fiyatlandırma',
                  onClick: () => router.push('/admin/pricing')
                },
                {
                  key: 'zones',
                  label: 'Bölgeler',
                  onClick: () => router.push('/admin/zones')
                },
                {
                  key: 'shuttle-routes',
                  label: 'Shuttle Hatları',
                  onClick: () => router.push('/admin/shuttle-routes')
                },
                {
                  key: 'extra-services',
                  label: 'Ekstra Hizmetler',
                  onClick: () => router.push('/admin/extra-services')
                }
              ]
            },
            {
              key: 'vehicle-tracking-group',
              icon: <BarChartOutlined />,
              label: 'Araç Takip',
              children: [
                {
                  key: 'vehicle-tracking-dashboard',
                  label: 'Genel Durum',
                  onClick: () => router.push('/admin/vehicle-tracking')
                },
                {
                  key: 'vehicle-tracking-insurance',
                  label: 'Sigorta Takibi',
                  onClick: () => router.push('/admin/vehicle-tracking/insurance')
                },
                {
                  key: 'vehicle-tracking-fuel',
                  label: 'Yakıt Giderleri',
                  onClick: () => router.push('/admin/vehicle-tracking/fuel')
                },
                {
                  key: 'vehicle-tracking-inspection',
                  label: 'Araç Muayene',
                  onClick: () => router.push('/admin/vehicle-tracking/inspection')
                },
                {
                  key: 'vehicle-tracking-maintenance',
                  label: 'Bakım & Onarım',
                  onClick: () => router.push('/admin/vehicle-tracking/maintenance')
                },
              ]
            },
            {
              key: 'personnel-definitions',
              icon: <UserOutlined />,
              label: 'Personel Tanımları',
              children: [
                {
                  key: 'personnel-list',
                  label: 'Personel Listesi',
                  onClick: () => router.push('/admin/personnel')
                }
              ]
            },
            {
              key: 'reports',
              icon: <BarChartOutlined />,
              label: 'Raporlar',
              children: [
                {
                  key: 'general-reports',
                  label: 'Genel Raporlar',
                  onClick: () => router.push('/admin/reports')
                },
                {
                  key: 'logs',
                  label: 'İşlem Logları',
                  onClick: () => router.push('/admin/reports/logs')
                }
              ]
            },
            {
              key: 'settings-group',
              icon: <SettingOutlined />,
              label: 'Ayarlar',
              children: [
                {
                  key: 'site-settings',
                  label: 'Site Ayarları',
                  onClick: () => router.push('/admin/site-settings')
                },
                {
                  key: 'pages',
                  label: 'Sayfa Yönetimi',
                  onClick: () => router.push('/admin/pages')
                },
                {
                  key: 'users',
                  label: 'Kullanıcılar',
                  onClick: () => router.push('/admin/users')
                },
                {
                  key: 'definitions',
                  label: 'Tanımlamalar',
                  onClick: () => router.push('/admin/settings/definitions')
                }
              ]
            }
          ]}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'margin-left 0.2s' }}>
        {/* Header */}
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: 56,
            lineHeight: '56px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, width: 40, height: 40, borderRadius: 8, color: '#64748b' }}
            />
          </div>

          <Space size={16} align="center">
            <Tooltip title="Ana Sayfayı Görüntüle">
              <Button
                type="text"
                icon={<HomeOutlined />}
                onClick={() => window.open('/', '_blank')}
                style={{ borderRadius: 8, color: '#64748b' }}
              />
            </Tooltip>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '4px 12px 4px 4px', borderRadius: 10,
                transition: 'background 0.2s',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar
                  size={34}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {userInitials}
                </Avatar>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    {user?.fullName || user?.email}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {user?.role?.type === 'SUPER_ADMIN' ? 'Super Admin' : 'Yönetici'}
                  </div>
                </div>
              </div>
            </Dropdown>
          </Space>
        </Header>

        {/* Content */}
        <Content style={fullWidth
          ? { minHeight: 'calc(100vh - 56px)', background: '#f8fafc', overflow: 'hidden' }
          : { margin: '20px', padding: 24, background: '#fff', borderRadius: 12, minHeight: 'calc(100vh - 96px)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
        }>
          {children}
        </Content>
      </Layout>

      <FloatingDriverChat />

      <style jsx global>{`
        .ant-layout-sider .ant-menu-dark {
          background: transparent !important;
        }
        .ant-layout-sider .ant-menu-dark .ant-menu-item {
          margin: 2px 8px;
          border-radius: 8px;
          height: 38px;
          line-height: 38px;
          font-size: 13px;
        }
        .ant-layout-sider .ant-menu-dark .ant-menu-submenu-title {
          margin: 2px 8px;
          border-radius: 8px;
          height: 38px;
          line-height: 38px;
          font-size: 13px;
        }
        .ant-layout-sider .ant-menu-dark .ant-menu-item-selected {
          background: rgba(102, 126, 234, 0.2) !important;
        }
        .ant-layout-sider .ant-menu-dark .ant-menu-sub {
          background: rgba(0,0,0,0.15) !important;
        }
        .ant-layout-sider .ant-menu-dark .ant-menu-sub .ant-menu-item {
          font-size: 12.5px;
          height: 34px;
          line-height: 34px;
          padding-left: 48px !important;
        }
        .ant-layout-sider::-webkit-scrollbar { width: 4px; }
        .ant-layout-sider::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </Layout>
  );
};

export default AdminLayout;