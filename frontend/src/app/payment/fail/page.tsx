'use client';

import { Result, Button, Card, Typography, Alert, message, Spin } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { CloseCircleFilled, CreditCardOutlined } from '@ant-design/icons';
import { Suspense, useState } from 'react';
import apiClient from '@/lib/api-client';

const { Paragraph, Text } = Typography;

function PaymentFailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const errorMsg = searchParams.get('error');
    const oid = searchParams.get('oid');
    const [retrying, setRetrying] = useState(false);

    const handleRetry = async () => {
        if (!oid) {
            message.error('Rezervasyon numarası bulunamadı');
            return;
        }
        setRetrying(true);
        try {
            const payRes = await apiClient.post('/api/payment/init', {
                amount: 0, // Backend should look up from booking
                orderId: oid,
                basket: [{ name: 'Transfer Hizmeti', price: 0, category: 'Transfer' }]
            });

            if (payRes.data.success && payRes.data.data.html) {
                if (payRes.data.data.redirectForm) {
                    const w = window.open('', '_self');
                    if (w) w.document.write(payRes.data.data.html);
                } else {
                    // Open iframe in a new window
                    const w = window.open('', '_blank');
                    if (w) w.document.write(payRes.data.data.html);
                }
            } else {
                message.error(payRes.data.error || 'Ödeme tekrar başlatılamadı');
            }
        } catch (err: any) {
            message.error(err.response?.data?.error || 'Ödeme sistemi hatası');
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: 20 }}>
            <Card style={{ maxWidth: 550, width: '100%', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Result
                    icon={<CloseCircleFilled style={{ color: '#ff4d4f' }} />}
                    status="error"
                    title="Ödeme Alınamadı"
                    subTitle={errorMsg ? decodeURIComponent(errorMsg) : 'Kredi kartınızdan çekim yapılamadı. Lütfen tekrar deneyin.'}
                    extra={[
                        oid && (
                            <Button
                                type="primary" size="large" key="retry"
                                icon={<CreditCardOutlined />}
                                loading={retrying}
                                onClick={handleRetry}
                                style={{ borderRadius: 8, background: '#6366f1', border: 'none' }}
                            >
                                Tekrar Dene
                            </Button>
                        ),
                        <Button key="home" size="large" onClick={() => router.push('/')} style={{ borderRadius: 8 }}>
                            Anasayfaya Dön
                        </Button>,
                    ].filter(Boolean)}
                >
                    {oid && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16, textAlign: 'left' }}
                            message="Rezervasyonunuz oluşturuldu ancak ödeme alınamadı."
                            description={
                                <div>
                                    <p style={{ margin: '4px 0' }}>Rezervasyon No: <strong>{oid}</strong></p>
                                    <p style={{ margin: '4px 0', color: '#64748b', fontSize: 13 }}>
                                        &quot;Tekrar Dene&quot; butonuna tıklayarak kredi kartı bilgilerinizi yeniden girebilirsiniz.
                                    </p>
                                </div>
                            }
                        />
                    )}
                    <div style={{ textAlign: 'left' }}>
                        <Paragraph>
                            <Text strong style={{ fontSize: 14 }}>Olası Nedenler:</Text>
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

export default function PaymentFailPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>}>
            <PaymentFailContent />
        </Suspense>
    );
}
