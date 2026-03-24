'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

interface AgencyGuardProps {
    children: React.ReactNode;
}

const AgencyGuard: React.FC<AgencyGuardProps> = ({ children }) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login');
                return;
            }

            const isAgency = user.role.type === 'AGENCY_ADMIN' || user.role.type === 'AGENCY_STAFF';

            if (!isAgency) {
                router.push('/');
                return;
            }
        }
    }, [user, loading, router]);

    if (loading || !user || (user.role.type !== 'AGENCY_ADMIN' && user.role.type !== 'AGENCY_STAFF')) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
                <Spin size="large" />
            </div>
        );
    }

    return <>{children}</>;
};

export default AgencyGuard;
