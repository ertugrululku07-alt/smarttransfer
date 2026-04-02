'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Typography, Space, Tag } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    MenuOutlined,
    LogoutOutlined,
    CarOutlined,
    FormOutlined,
    ProfileOutlined,
    SettingOutlined,
    BankOutlined,
    WalletOutlined,
    UnorderedListOutlined,
    FileTextOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/lib/api-client';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

interface AgencyLayoutProps {
    children: React.ReactNode;
    selectedKey?: string;
}

const AgencyLayout: React.FC<AgencyLayoutProps> = ({ children, selectedKey = 'dashboard' }) => {
    const [collapsed, setCollapsed] = useState(false);
    // null = henüz yüklenmedi, '' = logo yok, string = logo URL
    const [agencyLogo, setAgencyLogo] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('agencyLogo'); // anlık önbellekten yükle
        }
        return null;
    });
    const router = useRouter();
    const { user, logout } = useAuth();

    const handleLogout = () => {
        logout();
        sessionStorage.removeItem('agencyLogo');
        router.push('/');
    };

    // Fetch agency logo whenever the layout mounts
    useEffect(() => {
        const fetchLogo = async () => {
            try {
                const res = await apiClient.get('/api/agency/settings');
                const logo = res.data?.data?.logo || '';
                setAgencyLogo(logo);
                if (typeof window !== 'undefined') {
                    if (logo) sessionStorage.setItem('agencyLogo', logo);
                    else sessionStorage.removeItem('agencyLogo');
                }
            } catch {
                setAgencyLogo(''); // hata durumunda boş bırak
            }
        };
        fetchLogo();
    }, []);

    const isAdmin = user?.role?.type === 'AGENCY_ADMIN';

    const menuItems: any[] = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: 'B2B Dashboard',
            onClick: () => router.push('/agency')
        },
        {
            key: 'transfers',
            icon: <CarOutlined />,
            label: 'Transferler',
            children: [
                {
                    key: 'new-transfer',
                    label: 'Talep Oluştur',
                    icon: <FormOutlined />,
                    onClick: () => router.push('/agency/transfers/new')
                },
                {
                    key: 'bulk-transfer',
                    label: 'Toplu Yükleme',
                    icon: <ProfileOutlined />,
                    onClick: () => router.push('/agency/transfers/bulk')
                },
                {
                    key: 'transfer-list',
                    label: 'Transfer Listesi',
                    icon: <UnorderedListOutlined />,
                    onClick: () => router.push('/agency/transfers/list')
                }
            ]
        },
        {
            key: 'cari-hesap',
            icon: <BankOutlined />,
            label: 'Cari Hesap',
            children: [
                {
                    key: 'deposits',
                    label: 'Depozito Yatır',
                    icon: <WalletOutlined />,
                    onClick: () => router.push('/agency/deposits')
                },
                {
                    key: 'account-statement',
                    label: 'Hesap Ekstresi',
                    icon: <FileTextOutlined />,
                    onClick: () => router.push('/agency/account-statement')
                }
            ]
        }
    ];

    // Only Admin can see the Users menu
    if (isAdmin) {
        menuItems.push(
            {
                key: 'users',
                icon: <UserOutlined />,
                label: 'Personellerim',
                onClick: () => router.push('/agency/users')
            },
            {
                key: 'settings',
                icon: <SettingOutlined />,
                label: 'Ayarlar',
                onClick: () => router.push('/agency/settings')
            }
        );
    }

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light">
                {/* Logo / Brand area */}
                <div
                    style={{
                        padding: collapsed ? '10px 8px' : '10px 14px',
                        textAlign: 'center',
                        borderBottom: '1px solid #f0f0f0',
                        minHeight: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}
                    onClick={() => router.push('/agency')}
                >
                    {agencyLogo === null ? (
                        // Henüz yüklenmedi - hiçbir şey gösterme (flash engelle)
                        null
                    ) : agencyLogo ? (
                        <img
                            src={agencyLogo}
                            alt="Acente Logo"
                            style={{
                                maxHeight: 44,
                                maxWidth: collapsed ? 44 : 150,
                                objectFit: 'contain',
                                transition: 'all 0.25s'
                            }}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                setAgencyLogo('');
                                sessionStorage.removeItem('agencyLogo');
                            }}
                        />
                    ) : (
                        <Title level={4} style={{ margin: 0, color: '#1890ff', fontSize: collapsed ? 12 : 16 }}>
                            {collapsed ? 'B2B' : (user?.tenant?.name || 'B2B Portal')}
                        </Title>
                    )}
                </div>
                <Menu
                    theme="light"
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    items={menuItems}
                />
            </Sider>

            <Layout>
                <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed(!collapsed)} style={{ fontSize: '16px', width: 48, height: 48 }} />
                        <Title level={4} style={{ margin: '0 0 0 16px' }}>
                            Acente Paneli
                        </Title>
                    </div>
                    <Space>
                        <Text strong>{user?.fullName || user?.email}</Text>
                        <Tag color="blue">{user?.role?.name}</Tag>
                        <Button type="default" icon={<WalletOutlined />} onClick={() => router.push('/agency/deposits')} style={{ borderColor: '#52c41a', color: '#52c41a' }}>
                            Bakiyem
                        </Button>
                        <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>Çıkış Yap</Button>
                    </Space>
                </Header>
                <Content style={{ margin: '24px 16px', padding: 24, background: '#f0f2f5', minHeight: 280 }}>
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
};

export default AgencyLayout;
