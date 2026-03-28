'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';

export default function BookingsPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new transfer bookings page
    router.replace('/admin/transfers');
  }, [router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <Spin size="large" />
      <div style={{ marginTop: 20 }}>Transfer Modülüne Yönlendiriliyor...</div>
    </div>
  );
}
