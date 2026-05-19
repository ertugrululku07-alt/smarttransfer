'use client';

import React, { useEffect, useState } from 'react';
import {
    Typography,
    Card,
    Row,
    Col,
    Button,
    Badge,
    Tag,
    Modal,
    Form,
    InputNumber,
    Input,
    message,
    Spin,
    Divider,
    Space
} from 'antd';
import {
    GlobalOutlined,
    EnvironmentOutlined,
    CalendarOutlined,
    CarOutlined,
    DollarOutlined,
    CheckCircleOutlined,
    SwapRightOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import PartnerGuard from '../../../PartnerGuard';
import PartnerLayout from '../../../PartnerLayout';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';

dayjs.locale('tr');

const { Title, Text } = Typography;

interface Booking {
    id: string;
    bookingNumber: string;
    startDate: string;
    metadata: any;
    adults: number;
    children: number;
    infants: number;
    b2bPriceType: 'FIXED_PRICE' | 'OPEN_BID';
    b2bPrice: number;
    currency: string;
    ownerPartnerId: string;
    ownerPartner: { id: string; companyName: string };
    marketplaceOffers: any[];
}

const MarketplacePage = () => {
    const [loading, setLoading] = useState(false);
    const [jobs, setJobs] = useState<Booking[]>([]);
    
    // Auth info
    const [partnerId, setPartnerId] = useState('');

    // Bidding Modal
    const [bidModalVisible, setBidModalVisible] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
    const [bidForm] = Form.useForm();
    const [bidding, setBidding] = useState(false);

    useEffect(() => {
        // Just extract user ID from local state if available, or rely on API to reject "kendi ilanı"
        const stored = localStorage.getItem('user');
        if (stored) {
            const u = JSON.parse(stored);
            setPartnerId(u.id);
        }
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/transfer/partner/marketplace');
            if (res.data.success) {
                setJobs(res.data.data);
            }
        } catch (error) {
            message.error('İlanlar yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBid = (job: Booking) => {
        setSelectedJob(job);
        bidForm.resetFields();
        setBidModalVisible(true);
    };

    const submitBid = async () => {
        try {
            const values = await bidForm.validateFields();
            setBidding(true);
            const res = await apiClient.post(`/api/transfer/partner/marketplace/${selectedJob?.id}/bid`, {
                amount: values.amount,
                currency: selectedJob?.currency || 'EUR',
                notes: values.notes
            });
            if (res.data.success) {
                message.success('Teklifiniz başarıyla iletildi!');
                setBidModalVisible(false);
                fetchJobs();
            }
        } catch (err: any) {
            if (err?.errorFields) return;
            message.error(err.response?.data?.error || 'Teklif gönderilemedi');
        } finally {
            setBidding(false);
        }
    };

    const acceptFixedPrice = (job: Booking) => {
        Modal.confirm({
            title: 'Bu İşi Almak İstediğinize Emin Misiniz?',
            content: `Bu iş ${job.b2bPrice} ${job.currency} karşılığında doğrudan size atanacaktır.`,
            okText: 'Evet, İşi Al',
            cancelText: 'Vazgeç',
            onOk: async () => {
                try {
                    const res = await apiClient.post(`/api/transfer/partner/marketplace/${job.id}/accept`);
                    if (res.data.success) {
                        message.success('İş başarıyla alındı! Transferleriniz arasında görebilirsiniz.');
                        fetchJobs();
                    }
                } catch (err: any) {
                    message.error(err.response?.data?.error || 'İş alınamadı');
                }
            }
        });
    };

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div>
                            <Title level={2} style={{ margin: 0, fontWeight: 700 }}>
                                <GlobalOutlined /> B2B Pazar Yeri
                            </Title>
                            <Text type="secondary">
                                Diğer partnerlerin pasladığı işleri görüntüleyin, teklif verin veya doğrudan işi alın.
                            </Text>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 100 }}>
                            <Spin size="large" />
                        </div>
                    ) : jobs.length === 0 ? (
                        <Card style={{ textAlign: 'center', padding: 60, borderRadius: 16, border: '2px dashed #e5e7eb' }}>
                            <GlobalOutlined style={{ fontSize: 48, color: '#9ca3af', marginBottom: 16 }} />
                            <Title level={4} type="secondary">Şu an havuzda ilan yok</Title>
                            <Text type="secondary">Yeni iş ilanları geldiğinde burada listelenecektir.</Text>
                        </Card>
                    ) : (
                        <Row gutter={[20, 20]}>
                            {jobs.map((job) => {
                                const isMyJob = job.ownerPartnerId === partnerId;
                                const hasBid = job.marketplaceOffers.some(o => o.partnerId === partnerId);
                                
                                return (
                                    <Col xs={24} lg={12} key={job.id}>
                                        <Badge.Ribbon 
                                            text={isMyJob ? "Benim İlanım" : (job.b2bPriceType === 'FIXED_PRICE' ? 'Sabit Fiyat' : 'Teklif Al')} 
                                            color={isMyJob ? "blue" : (job.b2bPriceType === 'FIXED_PRICE' ? "green" : "volcano")}
                                        >
                                            <Card
                                                style={{ 
                                                    borderRadius: 16, 
                                                    border: '1px solid #e5e7eb',
                                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                                    opacity: isMyJob ? 0.7 : 1
                                                }}
                                                bodyStyle={{ padding: 24 }}
                                            >
                                                <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
                                                    <Col>
                                                        <Text type="secondary" style={{ fontSize: 12 }}>PNR: {job.bookingNumber}</Text>
                                                        <br />
                                                        <Text strong>{job.ownerPartner?.companyName || 'Bilinmeyen Partner'}</Text>
                                                    </Col>
                                                    <Col style={{ textAlign: 'right' }}>
                                                        {job.b2bPriceType === 'FIXED_PRICE' ? (
                                                            <Title level={3} style={{ margin: 0, color: '#16a34a' }}>
                                                                {job.b2bPrice} {job.currency}
                                                            </Title>
                                                        ) : (
                                                            <Text strong style={{ color: '#ea580c', fontSize: 16 }}>
                                                                Teklif İsteniyor
                                                            </Text>
                                                        )}
                                                    </Col>
                                                </Row>

                                                <Divider style={{ margin: '12px 0' }} />

                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <Text type="secondary" style={{ fontSize: 12 }}>Alış Noktası</Text>
                                                        <div style={{ fontWeight: 600 }}>{job.metadata.pickup}</div>
                                                    </div>
                                                    <SwapRightOutlined style={{ fontSize: 24, color: '#9ca3af' }} />
                                                    <div style={{ flex: 1, textAlign: 'right' }}>
                                                        <Text type="secondary" style={{ fontSize: 12 }}>Bırakış Noktası</Text>
                                                        <div style={{ fontWeight: 600 }}>{job.metadata.dropoff}</div>
                                                    </div>
                                                </div>

                                                <Row gutter={8} style={{ marginBottom: 20 }}>
                                                    <Col>
                                                        <Tag icon={<CalendarOutlined />} color="default">
                                                            {dayjs(job.startDate).format('D MMM YYYY, HH:mm')}
                                                        </Tag>
                                                    </Col>
                                                    <Col>
                                                        <Tag icon={<CarOutlined />} color="blue">
                                                            {job.metadata.vehicleType || 'Standart Araç'}
                                                        </Tag>
                                                    </Col>
                                                    <Col>
                                                        <Tag icon={<UserOutlined />} color="purple">
                                                            {job.adults + job.children} Yolcu
                                                        </Tag>
                                                    </Col>
                                                </Row>

                                                {!isMyJob && (
                                                    <div style={{ textAlign: 'right' }}>
                                                        {job.b2bPriceType === 'FIXED_PRICE' ? (
                                                            <Button 
                                                                type="primary" 
                                                                size="large" 
                                                                icon={<CheckCircleOutlined />}
                                                                style={{ background: '#16a34a', width: '100%', fontWeight: 'bold' }}
                                                                onClick={() => acceptFixedPrice(job)}
                                                            >
                                                                İşi Kabul Et
                                                            </Button>
                                                        ) : (
                                                            <Button 
                                                                type={hasBid ? 'default' : 'primary'} 
                                                                size="large" 
                                                                icon={<DollarOutlined />}
                                                                style={{ width: '100%', fontWeight: 'bold' }}
                                                                onClick={() => handleOpenBid(job)}
                                                                disabled={hasBid}
                                                            >
                                                                {hasBid ? 'Teklifiniz Gönderildi' : 'Fiyat Teklifi Ver'}
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {isMyJob && (
                                                    <div style={{ background: '#f3f4f6', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                                                        <Text type="secondary">Bu ilan sizin tarafınızdan oluşturuldu. {job.marketplaceOffers.length} teklif var.</Text>
                                                    </div>
                                                )}
                                            </Card>
                                        </Badge.Ribbon>
                                    </Col>
                                );
                            })}
                        </Row>
                    )}
                </div>

                <Modal
                    title="İlan İçin Fiyat Teklifi Ver"
                    open={bidModalVisible}
                    onCancel={() => setBidModalVisible(false)}
                    onOk={submitBid}
                    confirmLoading={bidding}
                    okText="Teklifi Gönder"
                    cancelText="İptal"
                >
                    <div style={{ marginBottom: 20 }}>
                        <Text>İlan veren partner bu iş için en uygun teklifi arıyor. Kendi belirlediğiniz B2B fiyatını aşağıya girin.</Text>
                    </div>
                    <Form form={bidForm} layout="vertical">
                        <Row gutter={16}>
                            <Col span={16}>
                                <Form.Item 
                                    name="amount" 
                                    label="Teklif Tutarı" 
                                    rules={[{ required: true, message: 'Lütfen tutar girin' }]}
                                >
                                    <InputNumber style={{ width: '100%' }} size="large" min={1} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item label="Para Birimi">
                                    <Input value={selectedJob?.currency || 'EUR'} disabled size="large" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="notes" label="Nota (Opsiyonel)">
                            <Input.TextArea placeholder="Varsa eklemek istedikleriniz..." rows={3} />
                        </Form.Item>
                    </Form>
                </Modal>
            </PartnerLayout>
        </PartnerGuard>
    );
};

export default MarketplacePage;
