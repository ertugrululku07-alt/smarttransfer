'use client';

import React, { useState } from 'react';
import { Button, Space, Avatar, Drawer, Tooltip } from 'antd';
import {
    HomeOutlined,
    UserOutlined,
    MessageOutlined,
    LogoutOutlined,
    MenuOutlined,
    CarOutlined,
    DashboardOutlined,
    RightOutlined,
    LeftOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

interface AccountLayoutProps {
    children: React.ReactNode;
}

const NAV_ITEMS = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Anasayfa', path: '/account' },
    { key: 'bookings',  icon: <CarOutlined />,       label: 'Rezervasyonlarım', path: '/account/bookings' },
    { key: 'messages',  icon: <MessageOutlined />,   label: 'Mesajlar', path: '/account/messages' },
    { key: 'profile',   icon: <UserOutlined />,      label: 'Profilim', path: '/account/profile' },
];

const AccountLayout: React.FC<AccountLayoutProps> = ({ children }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname() || '';
    const { user, logout } = useAuth();
    const { branding, fullName } = useBranding();

    const selectedKey = (() => {
        if (pathname.startsWith('/account/bookings')) return 'bookings';
        if (pathname.startsWith('/account/messages')) return 'messages';
        if (pathname.startsWith('/account/profile')) return 'profile';
        return 'dashboard';
    })();

    const handleLogout = () => { logout(); router.push('/'); };

    const navigate = (path: string) => { router.push(path); setMobileOpen(false); };

    const initials = (user?.fullName || user?.email || 'M')
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const SidebarContent = ({ forDrawer = false }: { forDrawer?: boolean }) => (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)',
        }}>
            {/* Logo */}
            <div
                style={{
                    padding: collapsed && !forDrawer ? '20px 0' : '20px 20px',
                    display: 'flex', alignItems: 'center',
                    justifyContent: collapsed && !forDrawer ? 'center' : 'flex-start',
                    gap: 12, cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    minHeight: 72,
                }}
                onClick={() => navigate('/')}
            >
                {branding.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={branding.logoUrl} alt={fullName}
                        style={{ maxHeight: 36, maxWidth: collapsed && !forDrawer ? 40 : 140, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                    />
                ) : (
                    <>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, fontSize: 16, fontWeight: 800, color: '#fff',
                        }}>
                            {fullName.charAt(0)}
                        </div>
                        {(!collapsed || forDrawer) && (
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
                                {fullName}
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {NAV_ITEMS.map(item => {
                    const active = selectedKey === item.key;
                    const btn = (
                        <button
                            key={item.key}
                            onClick={() => navigate(item.path)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                gap: collapsed && !forDrawer ? 0 : 12,
                                width: '100%',
                                padding: collapsed && !forDrawer ? '12px 0' : '11px 14px',
                                justifyContent: collapsed && !forDrawer ? 'center' : 'flex-start',
                                borderRadius: 10,
                                border: 'none',
                                cursor: 'pointer',
                                background: active
                                    ? 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.8))'
                                    : 'transparent',
                                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                                fontSize: 14, fontWeight: active ? 600 : 400,
                                transition: 'all 0.18s ease',
                                boxShadow: active ? '0 4px 14px rgba(99,102,241,0.4)' : 'none',
                            }}
                            onMouseEnter={e => {
                                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                                if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)';
                            }}
                        >
                            <span style={{ fontSize: 17, flexShrink: 0 }}>{item.icon}</span>
                            {(!collapsed || forDrawer) && <span>{item.label}</span>}
                        </button>
                    );
                    return collapsed && !forDrawer
                        ? <Tooltip key={item.key} title={item.label} placement="right">{btn}</Tooltip>
                        : btn;
                })}
            </nav>

            {/* User + Logout */}
            <div style={{
                padding: collapsed && !forDrawer ? '12px 8px' : '12px 12px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
                {(!collapsed || forDrawer) && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 8px', marginBottom: 8,
                        borderRadius: 10, background: 'rgba(255,255,255,0.05)',
                    }}>
                        <Avatar
                            size={36}
                            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontWeight: 700, flexShrink: 0 }}
                        >
                            {initials}
                        </Avatar>
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {user?.fullName || 'Müşteri'}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {user?.email}
                            </div>
                        </div>
                    </div>
                )}
                <Tooltip title={collapsed && !forDrawer ? 'Çıkış Yap' : ''} placement="right">
                    <button
                        onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: collapsed && !forDrawer ? 'center' : 'flex-start',
                            gap: 10, width: '100%',
                            padding: collapsed && !forDrawer ? '12px 0' : '10px 14px',
                            borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'transparent',
                            color: 'rgba(255,255,255,0.45)',
                            fontSize: 14, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)';
                            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
                        }}
                    >
                        <LogoutOutlined style={{ fontSize: 16 }} />
                        {(!collapsed || forDrawer) && <span>Çıkış Yap</span>}
                    </button>
                </Tooltip>
            </div>

            {/* Collapse toggle */}
            {!forDrawer && (
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    style={{
                        position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)',
                        width: 24, height: 24, borderRadius: '50%',
                        background: '#4f46e5', border: '2px solid #1e1b4b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#fff', fontSize: 10,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                >
                    {collapsed ? <RightOutlined /> : <LeftOutlined />}
                </button>
            )}
        </div>
    );

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
            {/* Desktop sidebar */}
            <div
                className="account-desktop-sider"
                style={{
                    width: collapsed ? 72 : 240,
                    minWidth: collapsed ? 72 : 240,
                    position: 'relative',
                    transition: 'width 0.25s ease, min-width 0.25s ease',
                    flexShrink: 0,
                }}
            >
                <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
                    <SidebarContent />
                </div>
            </div>

            {/* Mobile drawer */}
            <Drawer
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                placement="left"
                width={240}
                styles={{ body: { padding: 0, background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)' }, header: { display: 'none' } }}
            >
                <SidebarContent forDrawer />
            </Drawer>

            {/* Main content area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Topbar */}
                <div style={{
                    height: 64, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 24px',
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(226,232,240,0.8)',
                    position: 'sticky', top: 0, zIndex: 100,
                    boxShadow: '0 1px 12px rgba(0,0,0,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Button
                            type="text"
                            icon={<MenuOutlined />}
                            onClick={() => setMobileOpen(true)}
                            className="account-mobile-toggle"
                            style={{ display: 'none' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>Müşteri Paneli</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                {NAV_ITEMS.find(n => n.key === selectedKey)?.label}
                            </span>
                        </div>
                    </div>

                    <Space size={8}>
                        <Button
                            type="default"
                            icon={<HomeOutlined />}
                            onClick={() => router.push('/')}
                            size="small"
                            style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                color: '#475569',
                                background: '#f8fafc',
                            }}
                        >
                            <span className="hide-on-mobile">Ana Sayfa</span>
                        </Button>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 12px', borderRadius: 10,
                            background: '#f8fafc', border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                        }}
                            onClick={() => router.push('/account/profile')}
                        >
                            <Avatar
                                size={28}
                                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontWeight: 700, fontSize: 11 }}
                            >
                                {initials}
                            </Avatar>
                            <span className="hide-on-mobile" style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                {user?.fullName || user?.email}
                            </span>
                        </div>
                    </Space>
                </div>

                {/* Page content */}
                <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
                    {children}
                </div>
            </div>

            <style jsx global>{`
                @media (max-width: 992px) {
                    .account-desktop-sider { display: none !important; }
                    .account-mobile-toggle { display: inline-flex !important; }
                }
                @media (max-width: 600px) {
                    .hide-on-mobile { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default AccountLayout;
