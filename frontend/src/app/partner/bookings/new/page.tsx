'use client';

import React, { useState, useEffect } from 'react';
import {
    Form,
    Input,
    DatePicker,
    InputNumber,
    Select,
    Button,
    Card,
    Row,
    Col,
    Typography,
    Divider,
    message,
    Radio,
    Space,
    Alert
} from 'antd';
import {
    CarOutlined,
    UserOutlined,
    CalendarOutlined,
    EnvironmentOutlined,
    DollarOutlined,
    GlobalOutlined,
    AppstoreAddOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import PartnerGuard from '../../../PartnerGuard';
import PartnerLayout from '../../../PartnerLayout';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const NewPartnerBookingPage = () => {
    const [form] = Form.useForm();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    
    const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
    const [myVehicles, setMyVehicles] = useState<any[]>([]);
    const [myDrivers, setMyDrivers] = useState<any[]>([]);
    const [currencies] = useState(['TRY', 'EUR', 'USD', 'GBP']);

    // Watch values to dynamically show/hide sections
    const actionType = Form.useWatch('actionType', form);
    const b2bPriceType = Form.useWatch('b2bPriceType', form);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [vtRes, vRes, dRes] = await Promise.all([
                apiClient.get('/api/vehicle-types'),
                apiClient.get('/api/vehicles'), // automatically scoped to partner
                apiClient.get('/api/users')     // automatically scoped to partner's drivers
            ]);
            
            if (vtRes.data?.success) setVehicleTypes(vtRes.data.data);
            if (vRes.data?.success) setMyVehicles(vRes.data.data.filter((v: any) => v.isActive));
            if (dRes.data?.success) setMyDrivers(dRes.data.data.filter((d: any) => d.isActive));
        } catch (error) {
            console.error('Error fetching form data:', error);
            message.error('Gerekli veriler yüklenirken hata oluştu');
        }
    };

    const onFinish = async (values: any) => {
        try {
            setLoading(true);

            // Construct payload based on Action Type
            const payload: any = {
                passengerName: values.passengerName,
                passengerPhone: values.passengerPhone,
                passengerEmail: values.passengerEmail,
                pickup: values.pickup,
                dropoff: values.dropoff,
                pickupDateTime: values.pickupDateTime.toISOString(),
                flightNumber: values.flightNumber,
                flightTime: values.flightTime ? values.flightTime.format('HH:mm') : null,
                adults: values.adults || 1,
                children: values.children || 0,
                infants: values.infants || 0,
                vehicleTypeId: values.vehicleTypeId,
                price: values.price,
                currency: values.currency || 'EUR',
                notes: values.notes
            };

            if (values.actionType === 'SELF') {
                payload.vehicleId = values.vehicleId;
                payload.driverId = values.driverId;
            } else if (values.actionType === 'MARKETPLACE') {
                payload.marketplaceStatus = 'PUBLISHED';
                payload.b2bPriceType = values.b2bPriceType; // 'FIXED_PRICE' or 'OPEN_BID'
                if (values.b2bPriceType === 'FIXED_PRICE') {
                    payload.b2bPrice = values.b2bPrice;
                }
            }

            const response = await apiClient.post('/api/transfer/partner/bookings', payload);

            if (response.data.success) {
                message.success('Rezervasyon başarıyla oluşturuldu');
                if (values.actionType === 'MARKETPLACE') {
                    // router.push('/partner/marketplace'); // TODO: Create marketplace route
                    router.push('/partner');
                } else {
                    router.push('/partner/pool'); // Or active bookings
                }
            } else {
                message.error(response.data.error || 'Bilinmeyen bir hata oluştu');
            }
        } catch (error: any) {
            console.error('Booking submission error:', error);
            message.error(error.response?.data?.error || 'Kayıt sırasında hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PartnerGuard>
            <PartnerLayout>
                <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
                    <div style={{ marginBottom: 24 }}>
                        <Title level={2} style={{ margin: 0, fontWeight: 700 }}>
                            <AppstoreAddOutlined /> Yeni İş Ekle
                        </Title>
                        <Text type="secondary">
                            Kendi müşterilerinizden aldığınız işleri sisteme girin. İşi kendiniz yapabilir veya diğer partnerlerin yapması için "Pazar Yeri"ne gönderebilirsiniz.
                        </Text>
                    </div>

                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={onFinish}
                        initialValues={{
                            actionType: 'SELF',
                            adults: 1,
                            children: 0,
                            infants: 0,
                            currency: 'EUR',
                            b2bPriceType: 'OPEN_BID'
                        }}
                    >
                        {/* 1. Müşteri Bilgileri */}
                        <Card title={<><UserOutlined /> Müşteri Bilgileri</>} bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <Row gutter={16}>
                                <Col xs={24} md={8}>
                                    <Form.Item name="passengerName" label="Müşteri Adı Soyadı" rules={[{ required: true, message: 'Ad soyad zorunludur' }]}>
                                        <Input placeholder="Örn: Ahmet Yılmaz" size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="passengerPhone" label="Telefon Numarası">
                                        <Input placeholder="+90 5XX XXX XX XX" size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="passengerEmail" label="E-Posta Adresi" rules={[{ type: 'email', message: 'Geçerli bir e-posta girin' }]}>
                                        <Input placeholder="E-Posta" size="large" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* 2. Transfer Rotası & Tarihi */}
                        <Card title={<><EnvironmentOutlined /> Transfer Rotası ve Zamanı</>} bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="pickup" label="Alış Noktası (Otel / Havalimanı / Adres)" rules={[{ required: true, message: 'Alış noktası zorunludur' }]}>
                                        <Input placeholder="Alış adresi yazın..." size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="dropoff" label="Bırakış Noktası" rules={[{ required: true, message: 'Bırakış noktası zorunludur' }]}>
                                        <Input placeholder="Bırakış adresi yazın..." size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="pickupDateTime" label="Tarih & Saat" rules={[{ required: true, message: 'Tarih zorunludur' }]}>
                                        <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="flightNumber" label="Uçuş Numarası (Opsiyonel)">
                                        <Input placeholder="Örn: TK2434" size="large" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* 3. Araç Tipi & Yolcular */}
                        <Card title={<><CarOutlined /> Araç ve Yolcu</>} bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="vehicleTypeId" label="İstenen Araç Sınıfı" rules={[{ required: true, message: 'Araç tipi seçmelisiniz' }]}>
                                        <Select placeholder="Araç sınıfı seçiniz" size="large">
                                            {vehicleTypes.map(vt => (
                                                <Option key={vt.id} value={vt.id}>{vt.name} (Max {vt.capacity} Kişi)</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={4}>
                                    <Form.Item name="adults" label="Yetişkin">
                                        <InputNumber min={1} style={{ width: '100%' }} size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={4}>
                                    <Form.Item name="children" label="Çocuk">
                                        <InputNumber min={0} style={{ width: '100%' }} size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={4}>
                                    <Form.Item name="infants" label="Bebek">
                                        <InputNumber min={0} style={{ width: '100%' }} size="large" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* 4. İşlem Seçimi (Kendim Yapacağım / Pazar Yeri) */}
                        <Card title={<><GlobalOutlined /> Operasyon</>} bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <Form.Item name="actionType" label="Bu İşi Ne Yapacaksınız?" rules={[{ required: true }]}>
                                <Radio.Group optionType="button" buttonStyle="solid" size="large">
                                    <Radio value="SELF">Kendim Yapacağım</Radio>
                                    <Radio value="MARKETPLACE">Pazar Yerine (Havuza) Gönder</Radio>
                                </Radio.Group>
                            </Form.Item>

                            {actionType === 'SELF' && (
                                <Alert
                                    message="İş doğrudan operasyon panelinize düşecek."
                                    description="Dilerseniz şimdiden aracınızı ve şoförünüzü seçebilirsiniz."
                                    type="info"
                                    showIcon
                                    style={{ marginBottom: 20 }}
                                />
                            )}

                            {actionType === 'SELF' && (
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name="vehicleId" label="Kendi Aracımı Ata (Opsiyonel)">
                                            <Select placeholder="Araç Seçiniz" allowClear size="large">
                                                {myVehicles.map(v => (
                                                    <Option key={v.id} value={v.id}>{v.plateNumber} ({v.brand} {v.model})</Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name="driverId" label="Kendi Şoförümü Ata (Opsiyonel)">
                                            <Select placeholder="Şoför Seçiniz" allowClear size="large">
                                                {myDrivers.map(d => (
                                                    <Option key={d.id} value={d.id}>{d.name}</Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            )}

                            {actionType === 'MARKETPLACE' && (
                                <div style={{ background: '#fdf4ff', padding: 20, borderRadius: 8, border: '1px solid #f5d0fe' }}>
                                    <Title level={5} style={{ color: '#86198f', marginTop: 0 }}>Pazar Yeri Ayarları</Title>
                                    <Form.Item name="b2bPriceType" label="Pazar Yeri Teklif Türü">
                                        <Radio.Group>
                                            <Space direction="vertical">
                                                <Radio value="OPEN_BID">Tekliflere Açık Olsun (Diğer partnerler fiyat teklifi versin)</Radio>
                                                <Radio value="FIXED_PRICE">Sabit Fiyat (İlk kabul eden işi alır)</Radio>
                                            </Space>
                                        </Radio.Group>
                                    </Form.Item>

                                    {b2bPriceType === 'FIXED_PRICE' && (
                                        <Form.Item name="b2bPrice" label="Diğer Partnere Ödenecek Fiyat (B2B)" rules={[{ required: true, message: 'Lütfen tutar giriniz' }]}>
                                            <InputNumber min={0} style={{ width: '100%', maxWidth: 200 }} size="large" addonAfter="Para Birimi" />
                                        </Form.Item>
                                    )}
                                </div>
                            )}
                        </Card>

                        {/* 5. Müşteri Fiyatı ve Notlar */}
                        <Card title={<><DollarOutlined /> Fiyat ve Ek Notlar</>} bordered={false} style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <Row gutter={16}>
                                <Col xs={24} md={8}>
                                    <Form.Item name="price" label="Müşteriden Alınan Fiyat">
                                        <InputNumber min={0} style={{ width: '100%' }} size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                    <Form.Item name="currency" label="Para Birimi">
                                        <Select size="large">
                                            {currencies.map(c => <Option key={c} value={c}>{c}</Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item name="notes" label="Ek Notlar / Özel İstekler">
                                <Input.TextArea rows={4} placeholder="Bebek koltuğu, engelli yolcu, vd..." />
                            </Form.Item>
                        </Card>

                        <div style={{ textAlign: 'right', marginTop: 20 }}>
                            <Space>
                                <Button size="large" onClick={() => router.back()}>İptal</Button>
                                <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ background: '#6366f1' }}>
                                    {actionType === 'MARKETPLACE' ? 'Pazar Yerine Gönder' : 'İşi Kaydet'}
                                </Button>
                            </Space>
                        </div>
                    </Form>
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
};

export default NewPartnerBookingPage;
