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
    MenuOutlined
} from '@ant-design/icons';

interface PartnerLayoutProps {
    children: React.ReactNode;
}

const PartnerLayout: React.FC<PartnerLayoutProps> = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const [activeCount, setActiveCount] = useState(0);

    // Fetch active count on mount
    React.useEffect(() => {
        const fetchCount = async () => {
            try {
                // Using existing client or fetch
                const token = localStorage.getItem('token');
                if (token) {
                    const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/partner/active-bookings`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success) {
                            setActiveCount(data.data.length);
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to fetch active count', err);
            }
        };
        fetchCount();
    }, [pathname]); // Refresh on navigation

    const navItems = [
        {
            key: 'home',
            label: 'Ana Sayfa',
            icon: <HomeOutlined />,
            path: '/partner',
            exact: true
        },
        {
            key: 'pool',
            label: 'Transferlerim',
            icon: <CarOutlined />,
            path: '/partner/pool',
            badge: activeCount > 0 ? activeCount : undefined
        },
        {
            key: 'completed',
            label: 'Tamamlanmış Rezervasyonlar',
            icon: <CheckCircleOutlined />,
            path: '/partner/completed'
        },
        {
            key: 'earnings',
            label: 'Kazancım',
            icon: <DollarOutlined />,
            path: '/partner/earnings'
        },
        {
            key: 'settings',
            label: 'Ayarlar',
            icon: <SettingOutlined />,
            path: '/partner/settings'
        }
    ];

    const isActive = (path: string, exact: boolean = false) => {
        if (exact) {
            return pathname === path;
        }
        return pathname?.startsWith(path);
    };

    return (
        <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", backgroundColor: '#f5f7fa', minHeight: '100vh', color: '#1a1a2e' }}>
            {/* Mobile Toggle Button */}
            <button
                className="mobile-toggle"
                onClick={toggleSidebar}
                style={{
                    display: 'none', // Controlled by CSS media queries in global styles or style tag below
                    position: 'fixed',
                    top: '15px',
                    left: '15px',
                    width: '45px',
                    height: '45px',
                    background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '20px',
                    cursor: 'pointer',
                    zIndex: 1001,
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <MenuOutlined />
            </button>

            {/* Overlay */}
            {isSidebarOpen && (
                <div
                    className="overlay"
                    onClick={toggleSidebar}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 999
                    }}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
                style={{
                    width: '260px',
                    height: '100vh',
                    background: 'linear-gradient(180deg, #1a1f2e 0%, #0f1419 100%)',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '4px 0 15px rgba(0, 0, 0, 0.3)',
                    transition: 'transform 0.3s ease',
                    zIndex: 1000,
                    transform: isSidebarOpen ? 'translateX(0)' : undefined // Handled by media query in CSS usually, but inline for now
                }}
            >
                <div className="sidebar-header" style={{ padding: '25px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center' }}>
                    <div className="logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <div className="logo-icon" style={{
                            width: '45px',
                            height: '45px',
                            background: 'linear-gradient(135deg, #00d4aa 0%, #00a884 100%)',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                        }}>🚗</div>
                        <div>
                            <div className="logo-text" style={{ color: '#fff', fontSize: '20px', fontWeight: 700, letterSpacing: '0.5px' }}>TransferPro</div>
                            <div className="logo-subtitle" style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', marginTop: '4px' }}>Partner Panel</div>
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav" style={{ flex: 1, padding: '20px 15px', overflowY: 'auto' }}>
                    <div className="nav-section" style={{ marginBottom: '10px' }}>
                        <div className="nav-section-title" style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 15px', marginBottom: '10px' }}>Ana Menü</div>

                        {navItems.filter(item => ['home', 'pool', 'completed'].includes(item.key)).map(item => (
                            <div
                                key={item.key}
                                className={`nav-item ${isActive(item.path, item.exact) ? 'active' : ''}`}
                                onClick={() => router.push(item.path)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px',
                                    padding: '14px 18px',
                                    marginBottom: '4px',
                                    borderRadius: '10px',
                                    color: isActive(item.path, item.exact) ? '#00d4aa' : 'rgba(255, 255, 255, 0.7)',
                                    background: isActive(item.path, item.exact) ? 'linear-gradient(90deg, rgba(0, 212, 170, 0.15) 0%, rgba(0, 168, 132, 0.05) 100%)' : 'transparent',
                                    textDecoration: 'none',
                                    fontSize: '15px',
                                    fontWeight: 500,
                                    transition: 'all 0.25s ease',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                <span className="nav-icon" style={{ fontSize: '20px' }}>{item.icon}</span>
                                <span className="nav-text">{item.label}</span>
                                {item.badge && (
                                    <span className="nav-badge" style={{
                                        marginLeft: 'auto',
                                        background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%)',
                                        color: '#fff',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '3px 8px',
                                        borderRadius: '10px',
                                        minWidth: '22px',
                                        textAlign: 'center'
                                    }}>{item.badge}</span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="nav-section" style={{ marginBottom: '10px' }}>
                        <div className="nav-section-title" style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 15px', marginBottom: '10px' }}>Finans</div>
                        {navItems.filter(item => ['earnings'].includes(item.key)).map(item => (
                            <div
                                key={item.key}
                                className={`nav-item ${isActive(item.path, item.exact) ? 'active' : ''}`}
                                onClick={() => router.push(item.path)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px',
                                    padding: '14px 18px',
                                    marginBottom: '4px',
                                    borderRadius: '10px',
                                    color: isActive(item.path, item.exact) ? '#00d4aa' : 'rgba(255, 255, 255, 0.7)',
                                    background: isActive(item.path, item.exact) ? 'linear-gradient(90deg, rgba(0, 212, 170, 0.15) 0%, rgba(0, 168, 132, 0.05) 100%)' : 'transparent',
                                    cursor: 'pointer',
                                }}
                            >
                                <span className="nav-icon" style={{ fontSize: '20px' }}>{item.icon}</span>
                                <span className="nav-text">{item.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="nav-section">
                        <div className="nav-section-title" style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 15px', marginBottom: '10px' }}>Sistem</div>
                        {navItems.filter(item => ['settings'].includes(item.key)).map(item => (
                            <div
                                key={item.key}
                                className={`nav-item ${isActive(item.path, item.exact) ? 'active' : ''}`}
                                onClick={() => router.push(item.path)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px',
                                    padding: '14px 18px',
                                    marginBottom: '4px',
                                    borderRadius: '10px',
                                    color: isActive(item.path, item.exact) ? '#00d4aa' : 'rgba(255, 255, 255, 0.7)',
                                    background: isActive(item.path, item.exact) ? 'linear-gradient(90deg, rgba(0, 212, 170, 0.15) 0%, rgba(0, 168, 132, 0.05) 100%)' : 'transparent',
                                    cursor: 'pointer',
                                }}
                            >
                                <span className="nav-icon" style={{ fontSize: '20px' }}>{item.icon}</span>
                                <span className="nav-text">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </nav>

                <div className="sidebar-footer" style={{ padding: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div
                        className="nav-item logout"
                        onClick={handleLogout}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                            padding: '14px 18px',
                            borderRadius: '10px',
                            color: 'rgba(255, 107, 107, 0.8)',
                            cursor: 'pointer',
                            fontSize: '15px',
                            fontWeight: 500
                        }}
                    >
                        <span className="nav-icon" style={{ fontSize: '20px' }}><LogoutOutlined /></span>
                        <span className="nav-text">Çıkış Yap</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content" style={{
                marginLeft: '260px',
                minHeight: '100vh',
                padding: '24px 32px',
                transition: 'margin-left 0.3s ease'
            }}>
                <style jsx global>{`
                    @media (max-width: 768px) {
                        .sidebar {
                            transform: translateX(-100%);
                        }
                        .sidebar.open {
                            transform: translateX(0);
                        }
                        .main-content {
                            margin-left: 0 !important;
                            padding: 80px 16px 16px !important;
                        }
                        .mobile-toggle {
                            display: flex !important;
                        }
                    }
                `}</style>
                {children}
            </main>
        </div>
    );
};

export default PartnerLayout;
