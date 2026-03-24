'use client';

import { Result, Button, Card, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { CloseCircleFilled } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export default function PaymentFailPage() {
    const router = useRouter();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: 20 }}>
            <Card style={{ maxWidth: 500, width: '100%', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Result
                    icon={<CloseCircleFilled style={{ color: '#ff4d4f' }} />}
                    status="error"
                    title="Ödeme İşlemi Başarısız"
                    subTitle="Kredi kartınızdan çekim yapılamadı. Lütfen bilgilerinizi kontrol edip tekrar deneyin."
                    extra={[
                        <Button type="primary" size="large" key="console" onClick={() => router.push('/agency/transfers')} style={{ borderRadius: 8 }}>
                            Ödemesi Bekleyen Rezervasyonlara Dön
                        </Button>,
                    ]}
                >
                    <div className="desc">
                        <Paragraph>
                            <Text strong style={{ fontSize: 16 }}>Olası Nedenler:</Text>
                        </Paragraph>
                        <Paragraph>
                            <CloseCircleFilled style={{ color: '#ff4d4f' }} /> Yetersiz Bakiye veya Limit
                        </Paragraph>
                        <Paragraph>
                            <CloseCircleFilled style={{ color: '#ff4d4f' }} /> Hatalı SMS (3D Secure) Şifresi
                        </Paragraph>
                        <Paragraph>
                            <CloseCircleFilled style={{ color: '#ff4d4f' }} /> Kartın İnternet Alışverişine Kapalı Olması
                        </Paragraph>
                    </div>
                </Result>
            </Card>
        </div>
    );
}
