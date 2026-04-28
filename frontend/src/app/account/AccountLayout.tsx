'use client';

import React, { useState } from 'react';
import { Layout, Menu, Button, Typography, Space, Avatar, Drawer } from 'antd';
import {
    DashboardOutlined,
    HistoryOutlined,
    UserOutlined,
    MessageOutlined,
    LogoutOutlined,
    HomeOutlined,
    MenuOutlined,
    CarOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

interface AccountLayoutProps {
    children: React.ReactNode;
}

const AccountLayout: React.FC<AccountLayoutProps> = ({ children }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname() || '';
    const { user, logout } = useAuth();
    const { branding, fullName } = useBranding();

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const menuItems = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: 'Anasayfa',
            onClick: () => { router.push('/account'); setMobileOpen(false); }
        },
        {
            key: 'bookings',
            icon: <CarOutlined />,
            label: 'Rezervasyonlarım',
            onClick: () => { router.push('/account/bookings'); setMobileOpen(false); }
        },
        {
            key: 'messages',
            icon: <MessageOutlined />,
            label: 'Mesajlar',
            onClick: () => { router.push('/account/messages'); setMobileOpen(false); }
        },
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Profilim',
            onClick: () => { router.push('/account/profile'); setMobileOpen(false); }
        },
    ];

    const selectedKey = (() => {
        if (pathname.startsWith('/account/bookings')) return 'bookings';
        if (pathname.startsWith('/account/messages')) return 'messages';
        if (pathname.startsWith('/account/profile')) return 'profile';
        return 'dashboard';
    })();

    const SideMenu = (
        <Menu
            theme="light"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            style={{ borderRight: 'none', background: 'transparent' }}
        />
    );

    const Brand = (
        <div
            style={{
                padding: collapsed ? '14px 8px' : '16px 18px',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}
            onClick={() => router.push('/')}
        >
            {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt={fullName} style={{ maxHeight: 36, maxWidth: collapsed ? 40 : 160, objectFit: 'contain' }} />
            ) : (
                <Title level={5} style={{ margin: 0, color: '#4f46e5' }}>{collapsed ? 'ST' : fullName}</Title>
            )}
        </div>
    );

    return (
        <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
            {/* Desktop sidebar */}
            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                theme="light"
                breakpoint="lg"
                collapsedWidth={80}
                width={240}
                style={{ boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}
                className="account-desktop-sider"
            >
                {Brand}
                {SideMenu}
            </Sider>

            {/* Mobile drawer */}
            <Drawer
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                placement="left"
                width={260}
                styles={{ body: { padding: 0 } }}
                title={fullName}
            >
                {SideMenu}
            </Drawer>

            <Layout>
                <Header
                    style={{
                        padding: '0 16px',
                        background: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    }}
                >
                    <Space>
                        <Button
                            type="text"
                            icon={<MenuOutlined />}
                            onClick={() => setMobileOpen(true)}
                            className="account-mobile-toggle"
                            style={{ display: 'none' }}
                        />
                        <Title level={5} style={{ margin: 0, color: '#0f172a' }}>Müşteri Paneli</Title>
                    </Space>

                    <Space size="middle">
                        <Button type="text" icon={<HomeOutlined />} onClick={() => router.push('/')}>
                            <span className="hide-on-mobile">Ana Sayfa</span>
                        </Button>
                        <Space size={8}>
                            <Avatar style={{ background: '#4f46e5' }}>
                                {(user?.fullName || user?.email || 'M').charAt(0).toUpperCase()}
                            </Avatar>
                            <Text strong className="hide-on-mobile">{user?.fullName || user?.email}</Text>
                        </Space>
                        <Button danger icon={<LogoutOutlined />} onClick={handleLogout}>
                            <span className="hide-on-mobile">Çıkış</span>
                        </Button>
                    </Space>
                </Header>

                <Content style={{ margin: 16, padding: 0, minHeight: 'calc(100vh - 96px)' }}>
                    {children}
                </Content>

                <style jsx global>{`
                    @media (max-width: 992px) {
                        .account-desktop-sider { display: none !important; }
                        .account-mobile-toggle { display: inline-flex !important; }
                    }
                    @media (max-width: 600px) {
                        .hide-on-mobile { display: none !important; }
                    }
                `}</style>
            </Layout>
        </Layout>
    );
};

export default AccountLayout;
