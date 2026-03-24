'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

interface PartnerGuardProps {
    children: React.ReactNode;
}

const PartnerGuard: React.FC<PartnerGuardProps> = ({ children }) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login');
                return;
            }

            // Check if user has PARTNER role
            // Supports both old and new role structures just in case
            const isPartner =
                user.role?.type === 'PARTNER' ||
                user.role?.code === 'PARTNER' ||
                (user.role as any) === 'PARTNER'; // Fail-safe for string role

            if (!isPartner) {
                console.log('❌ PartnerGuard: User is not partner, redirecting');
                // Redirect to appropriate panel based on role
                if (user.role?.type === 'SUPER_ADMIN' || user.role?.type === 'TENANT_ADMIN') {
                    router.push('/admin');
                } else {
                    router.push('/');
                }
                return;
            }

            console.log('✅ PartnerGuard: User is partner, allowing access');
        }
    }, [user, loading, router]);

    if (loading || !user) {
        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f5f7fa'
                }}
            >
                <Spin size="large" />
            </div>
        );
    }

    return <>{children}</>;
};

export default PartnerGuard;
