'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

interface AccountGuardProps {
    children: React.ReactNode;
}

const isCustomer = (user: any) => {
    if (!user) return false;
    const type = (user.role?.type || '').toUpperCase();
    const code = (user.role?.code || '').toUpperCase();
    if (type === 'CUSTOMER' || code === 'CUSTOMER') return true;
    // Allow if there is no admin/staff role (default to customer)
    const blocked = ['DRIVER', 'PARTNER', 'AGENCY_ADMIN', 'AGENCY_STAFF', 'TENANT_ADMIN', 'SUPER_ADMIN', 'PLATFORM_OPS', 'ADMIN', 'DISPATCHER'];
    return !blocked.includes(type) && !blocked.includes(code);
};

const AccountGuard: React.FC<AccountGuardProps> = ({ children }) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login');
                return;
            }
            if (!isCustomer(user)) {
                router.push('/');
            }
        }
    }, [user, loading, router]);

    if (loading || !user || !isCustomer(user)) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <Spin size="large" />
            </div>
        );
    }

    return <>{children}</>;
};

export default AccountGuard;
