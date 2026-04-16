'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import {
    HomeOutlined,
    CarOutlined,
    CheckCircleOutlined,
    DollarOutlined,
    SettingOutlined,
    LogoutOutlined,
    MenuOutlined,
    CloseOutlined
} from '@ant-design/icons';

interface PartnerLayoutProps {
    children: React.ReactNode;
}

const PartnerLayout: React.FC<PartnerLayoutProps> = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setIsSidebarOpen(false);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const [activeCount, setActiveCount] = useState(0);

    React.useEffect(() => {
        const fetchCount = async () => {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/partner/active-bookings`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success) setActiveCount(data.data.length);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch active count', err);
            }
        };
        fetchCount();
    }, [pathname]);

    const navItems = [
        { key: 'home', label: 'Ana Sayfa', icon: <HomeOutlined />, path: '/partner', exact: true, section: 'main' },
        { key: 'pool', label: 'Transferlerim', icon: <CarOutlined />, path: '/partner/pool', badge: activeCount > 0 ? activeCount : undefined, section: 'main' },
        { key: 'completed', label: 'Tamamlanmış', icon: <CheckCircleOutlined />, path: '/partner/completed', section: 'main' },
        { key: 'earnings', label: 'Kazancım', icon: <DollarOutlined />, path: '/partner/earnings', section: 'finance' },
        { key: 'settings', label: 'Ayarlar', icon: <SettingOutlined />, path: '/partner/settings', section: 'system' },
    ];

    const isActive = (path: string, exact?: boolean) => {
        if (exact) return pathname === path;
        return pathname?.startsWith(path);
    };

    const navigateTo = (path: string) => {
        router.push(path);
        closeSidebar();
    };

    const userInitials = user ? `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase() : 'P';

    const renderNavItem = (item: any) => {
        const active = isActive(item.path, item.exact);
        return (
            <div
                key={item.key}
                onClick={() => navigateTo(item.path)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', marginBottom: 2, borderRadius: 12,
                    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                    background: active ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
                    cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 500,
                    transition: 'all 0.2s ease', position: 'relative',
                    boxShadow: active ? '0 4px 15px rgba(16,185,129,0.3)' : 'none',
                }}
            >
                <span style={{ fontSize: 18, width: 22, textAlign: 'center', opacity: active ? 1 : 0.8 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                    <span style={{
                        background: active ? 'rgba(255,255,255,0.25)' : '#ef4444',
                        color: '#fff', fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 10, minWidth: 20, textAlign: 'center',
                    }}>{item.badge}</span>
                )}
            </div>
        );
    };

    return (
        <div style={{ fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", backgroundColor: '#f0f2f5', minHeight: '100vh', color: '#1e293b' }}>
            <style jsx global>{`
                .partner-sidebar { width: 270px; }
                .partner-main { margin-left: 270px; min-height: 100vh; padding: 24px 28px; transition: margin-left 0.3s cubic-bezier(.4,0,.2,1); }
                .partner-mobile-toggle { display: none !important; }
                .partner-mobile-bottom-nav { display: none !important; }
                .partner-sidebar-overlay { display: none; }

                @media (max-width: 768px) {
                    .partner-sidebar {
                        transform: translateX(-100%);
                        width: 280px !important;
                    }
                    .partner-sidebar.open {
                        transform: translateX(0) !important;
                    }
                    .partner-main {
                        margin-left: 0 !important;
                        padding: 16px 16px 90px !important;
                    }
                    .partner-mobile-toggle {
                        display: flex !important;
                    }
                    .partner-mobile-bottom-nav {
                        display: flex !important;
                    }
                    .partner-sidebar-overlay {
                        display: block !important;
                    }
                }
            `}</style>

            {/* Mobile Top Bar */}
            <div className="partner-mobile-toggle" style={{
                position: 'fixed', top: 0, left: 0, right: 0, height: 60, zIndex: 1001,
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                display: 'none', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', boxShadow: '0 2px 20px rgba(0,0,0,0.15)',
            }}>
                <button onClick={toggleSidebar} style={{
                    background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10,
                    width: 40, height: 40, color: '#fff', fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {isSidebarOpen ? <CloseOutlined /> : <MenuOutlined />}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16,
                    }}>🚗</div>
                    <span style={{ color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: 0.3 }}>SmartTransfer</span>
                </div>
                <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                }}>{userInitials}</div>
            </div>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div className="partner-sidebar-overlay" onClick={closeSidebar} style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    zIndex: 1049, backdropFilter: 'blur(4px)', display: 'none',
                }} />
            )}

            {/* Sidebar */}
            <aside className={`partner-sidebar ${isSidebarOpen ? 'open' : ''}`} style={{
                width: 270, height: '100vh', position: 'fixed', left: 0, top: 0,
                background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                display: 'flex', flexDirection: 'column',
                boxShadow: '4px 0 30px rgba(0,0,0,0.2)',
                transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
                zIndex: 1050, overflowY: 'auto', overflowX: 'hidden',
            }}>
                {/* Logo */}
                <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 14,
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, boxShadow: '0 4px 15px rgba(16,185,129,0.35)',
                        }}>🚗</div>
                        <div>
                            <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.2 }}>SmartTransfer</div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 500, marginTop: 2 }}>Partner Panel</div>
                        </div>
                    </div>
                </div>

                {/* User Card */}
                <div style={{ padding: '16px 20px', margin: '0' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 16px', borderRadius: 14,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 14, fontWeight: 700,
                        }}>{userInitials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {user?.firstName} {user?.lastName}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Partner</div>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav style={{ flex: 1, padding: '8px 16px', overflowY: 'auto' }}>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, padding: '8px 16px 6px', marginTop: 4 }}>Menü</div>
                    {navItems.filter(i => i.section === 'main').map(renderNavItem)}

                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, padding: '16px 16px 6px' }}>Finans</div>
                    {navItems.filter(i => i.section === 'finance').map(renderNavItem)}

                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, padding: '16px 16px 6px' }}>Sistem</div>
                    {navItems.filter(i => i.section === 'system').map(renderNavItem)}
                </nav>

                {/* Footer */}
                <div style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div
                        onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '12px 16px', borderRadius: 12,
                            color: '#f87171', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                            transition: 'all 0.2s ease',
                            background: 'rgba(239,68,68,0.08)',
                        }}
                    >
                        <LogoutOutlined style={{ fontSize: 18 }} />
                        <span>Çıkış Yap</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="partner-main" style={{ marginLeft: 270, minHeight: '100vh', padding: '24px 28px', transition: 'margin-left 0.3s cubic-bezier(.4,0,.2,1)' }}>
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="partner-mobile-bottom-nav" style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, height: 68,
                background: '#fff', borderTop: '1px solid #e5e7eb',
                display: 'none', alignItems: 'center', justifyContent: 'space-around',
                zIndex: 1000, padding: '0 4px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
            }}>
                {navItems.filter(i => ['home', 'pool', 'earnings', 'settings'].includes(i.key)).map(item => {
                    const active = isActive(item.path, item.exact);
                    return (
                        <div
                            key={item.key}
                            onClick={() => navigateTo(item.path)}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                padding: '6px 12px', borderRadius: 12, cursor: 'pointer',
                                color: active ? '#10b981' : '#94a3b8',
                                transition: 'all 0.2s ease', position: 'relative', minWidth: 56,
                            }}
                        >
                            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
                            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, lineHeight: 1.2 }}>{item.label}</span>
                            {item.badge && (
                                <span style={{
                                    position: 'absolute', top: 0, right: 4,
                                    background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700,
                                    width: 16, height: 16, borderRadius: 8, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>{item.badge}</span>
                            )}
                        </div>
                    );
                })}
            </nav>
        </div>
    );
};

export default PartnerLayout;
