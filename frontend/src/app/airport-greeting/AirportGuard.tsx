'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

interface AirportGuardProps {
  children: React.ReactNode;
}

const AirportGuard: React.FC<AirportGuardProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
        return;
      }
      const isAirportStaff = user.role.type === 'AIRPORT_STAFF' || user.role.code === 'AIRPORT_STAFF';
      const isAdmin = ['SUPER_ADMIN', 'TENANT_ADMIN', 'PLATFORM_OPS'].includes(user.role.type);
      if (!isAirportStaff && !isAdmin) {
        router.push('/');
        return;
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0c1222'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  const isAirportStaff = user?.role.type === 'AIRPORT_STAFF' || user?.role.code === 'AIRPORT_STAFF';
  const isAdmin = user ? ['SUPER_ADMIN', 'TENANT_ADMIN', 'PLATFORM_OPS'].includes(user.role.type) : false;
  if (!user || (!isAirportStaff && !isAdmin)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0c1222'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return <>{children}</>;
};

export default AirportGuard;
