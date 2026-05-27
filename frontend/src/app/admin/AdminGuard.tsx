'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin, Result, Button } from 'antd';
import { useAuth } from '../context/AuthContext';
import { usePermission, MODULE_DEFINITIONS } from '@/hooks/usePermission';

interface AdminGuardProps {
  children: React.ReactNode;
  requiredModule?: string;
  requiredAction?: 'view' | 'create' | 'update' | 'delete';
}

const AdminGuard: React.FC<AdminGuardProps> = ({ children, requiredModule, requiredAction = 'view' }) => {
  const { user, loading } = useAuth();
  const { can, isSuperAdmin } = usePermission();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Spin size="large" />
      </div>
    );
  }

  // SUPER_ADMIN and TENANT_ADMIN always have access
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Check if user has at least one admin permission (can access admin panel at all)
  const hasAnyAdminPermission = MODULE_DEFINITIONS.some(m => can(m.module, 'view'));

  if (!hasAnyAdminPermission) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Result
          status="403"
          title="Erişim Engellendi"
          subTitle="Yönetim paneline erişim yetkiniz bulunmamaktadır."
          extra={<Button type="primary" onClick={() => router.push('/')}>Ana Sayfaya Dön</Button>}
        />
      </div>
    );
  }

  // If a specific module/action is required, check it
  if (requiredModule && !can(requiredModule, requiredAction)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Result
          status="403"
          title="Yetki Yetersiz"
          subTitle="Bu modüle erişim yetkiniz bulunmamaktadır. Yöneticinizden yetki talep edin."
          extra={<Button type="primary" onClick={() => router.push('/admin')}>Panele Dön</Button>}
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminGuard;
