'use client';

import { Result, Button, Card } from 'antd';
import { useRouter } from 'next/navigation';
import { CheckCircleFilled } from '@ant-design/icons';

export default function PaymentSuccessPage() {
    const router = useRouter();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: 20 }}>
            <Card style={{ maxWidth: 500, width: '100%', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Result
                    icon={<CheckCircleFilled style={{ color: '#52c41a' }} />}
                    status="success"
                    title="Ödeme İşlemi Başarılı!"
                    subTitle="Kredi kartı işleminiz başarıyla tamamlandı. Rezervasyonunuz onaylanmıştır."
                    extra={[
                        <Button type="primary" size="large" key="console" onClick={() => router.push('/agency/transfers')} style={{ borderRadius: 8 }}>
                            Rezervasyonlarıma Git
                        </Button>,
                        <Button key="buy" size="large" onClick={() => router.push('/agency/transfers/new')} style={{ borderRadius: 8 }}>
                            Yeni Transfer Oluştur
                        </Button>,
                    ]}
                />
            </Card>
        </div>
    );
}
