'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

interface AdminGuardProps {
  children: React.ReactNode;
}

const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Kullanıcı yoksa veya rolü admin değilse login'e gönder
      if (!user) {
        console.log('❌ AdminGuard: No user found, redirecting to login');
        router.push('/login');
        return;
      }

      // V2 API: user.role is an object with type property
      const ALLOWED_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'PLATFORM_OPS', 'AIRPORT_STAFF'];
      const isAdmin = ALLOWED_ROLES.includes(user.role.type) || ALLOWED_ROLES.includes(user.role.code);

      if (!isAdmin) {
        console.log('❌ AdminGuard: User is not admin, redirecting to home');
        router.push('/');
        return;
      }

      console.log('✅ AdminGuard: User is admin, allowing access');
    }
  }, [user, loading, router]);

  // Yükleniyor durumunda loading göster
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f0f2f5'
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // User yoksa veya admin değilse loading göster (redirect oluyor zaten)
  const ALLOWED_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'PLATFORM_OPS', 'AIRPORT_STAFF'];
  if (!user || (!ALLOWED_ROLES.includes(user.role.type) && !ALLOWED_ROLES.includes(user.role.code))) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f0f2f5'
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // Admin kullanıcı, içeriği göster
  return <>{children}</>;
};

export default AdminGuard;
