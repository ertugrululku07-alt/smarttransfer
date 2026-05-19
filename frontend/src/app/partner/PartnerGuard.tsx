'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

interface PartnerGuardProps {
    children: React.ReactNode;
}

function isPartnerUser(user: { role?: { type?: string; code?: string } }): boolean {
    return (
        user.role?.type === 'PARTNER' ||
        user.role?.code === 'PARTNER'
    );
}

const PartnerGuard: React.FC<PartnerGuardProps> = ({ children }) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;

        if (!user) {
            router.push('/login');
            return;
        }

        if (!isPartnerUser(user)) {
            if (user.role?.type === 'SUPER_ADMIN' || user.role?.type === 'TENANT_ADMIN') {
                router.push('/admin');
            } else {
                router.push('/');
            }
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!user || !isPartnerUser(user)) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
                <Spin size="large" />
            </div>
        );
    }

    return <>{children}</>;
};

export default PartnerGuard;
