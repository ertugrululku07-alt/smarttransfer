'use client';

import { Result, Button, Card, Typography } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircleFilled } from '@ant-design/icons';
import { Suspense } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';

const { Text } = Typography;

function PaymentSuccessContent({ t }: { t: (key: string) => string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const oid = searchParams.get('oid');

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: 20 }}>
            <Card style={{ maxWidth: 500, width: '100%', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Result
                    icon={<CheckCircleFilled style={{ color: '#52c41a' }} />}
                    status="success"
                    title={t('payment.successTitle')}
                    subTitle={
                        <div>
                            <div>{t('payment.successMessage')}</div>
                            {oid && <div style={{ marginTop: 8 }}><Text strong>{t('payment.bookingNo')}: {oid}</Text></div>}
                        </div>
                    }
                    extra={[
                        <Button type="primary" size="large" key="home" onClick={() => router.push('/')} style={{ borderRadius: 8 }}>
                            {t('payment.backToHome')}
                        </Button>,
                        <Button key="account" size="large" onClick={() => router.push('/login')} style={{ borderRadius: 8 }}>
                            {t('payment.goToAccount')}
                        </Button>,
                    ]}
                />
            </Card>
        </div>
    );
}

export default function PaymentSuccessPage() {
    const { t } = useLanguage();
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('common.loading')}</div>}>
            <PaymentSuccessContent t={t} />
        </Suspense>
    );
}
