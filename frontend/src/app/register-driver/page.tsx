'use client';

import React, { useState } from 'react';
import {
    Form,
    Input,
    Button,
    Card,
    Typography,
    Steps,
    Select,
    InputNumber,
    message,
    Row,
    Col,
    Alert,
    Upload
} from 'antd';
import {
    UserOutlined,
    CarOutlined,
    CheckCircleOutlined,
    RocketOutlined,
    UploadOutlined,
    FileTextOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;
const { Option } = Select;

const RegisterDriverPage: React.FC = () => {
    const [current, setCurrent] = useState(0);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const router = useRouter();

    const handleNext = async () => {
        try {
            // Validate only fields for the current step
            const fieldsToValidate = current === 0
                ? ['firstName', 'lastName', 'email', 'phone', 'password']
                : current === 1
                    ? ['vehiclePlate', 'vehicleBrand', 'vehicleModel', 'vehicleYear', 'vehicleType']
                    : ['tursabDocument', 'srcDocument', 'licenseDocument']; // Validate docs if needed, or make optional

            await form.validateFields(fieldsToValidate);
            setCurrent(current + 1);
        } catch (error) {
            // Validation failed
        }
    };

    const handlePrev = () => {
        setCurrent(current - 1);
    };

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            console.log('Sending registration payload:', values);
            const res = await axios.post(`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/auth/register-driver`, values);

            if (res.data.success) {
                message.success('Başvurunuz başarıyla alındı! Yönlendiriliyorsunuz...');

                // Save token (Optional: auto-login)
                const { token, user } = res.data.data;
                // In a real app, use AuthContext.login(user, token) here
                // For now, simple redirect
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1500);
            }
        } catch (error: any) {
            console.error('Registration error:', error);
            const msg = error.response?.data?.error || 'Kayıt işlemi başarısız oldu.';
            message.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const stepsItems = [
        { title: 'Sürücü Bilgileri', icon: <UserOutlined /> },
        { title: 'Araç Bilgileri', icon: <CarOutlined /> },
        { title: 'Belgeler', icon: <FileTextOutlined /> },
        { title: 'Tamamla', icon: <CheckCircleOutlined /> }
    ];

    const uploadProps = (field: string) => ({
        name: 'file',
        action: `${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload/driver-docs`,
        headers: {
            authorization: 'authorization-text',
        },
        maxCount: 1,
        onChange(info: any) {
            if (info.file.status === 'done') {
                message.success(`${info.file.name} başarıyla yüklendi`);
                form.setFieldsValue({ [field]: info.file.response.data.url });
            } else if (info.file.status === 'error') {
                message.error(`${info.file.name} yüklenemedi.`);
            }
        },
    });

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                padding: 20
            }}
        >
            <Card
                style={{ width: '100%', maxWidth: 800, borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
                bodyStyle={{ padding: 40 }}
            >
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <Title level={2} style={{ margin: 0 }}>Sürücü Partner Başvurusu</Title>
                    <Text type="secondary">Kendi aracınızla ekibimize katılın ve kazanmaya başlayın.</Text>
                </div>

                <Steps
                    current={current}
                    style={{ marginBottom: 40 }}
                    items={stepsItems}
                />

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    initialValues={{ vehicleType: 'SEDAN' }}
                >
                    {/* STEP 1: Driver Info */}
                    <div style={{ display: current === 0 ? 'block' : 'none' }}>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    name="firstName"
                                    label="Ad"
                                    rules={[{ required: true, message: 'Lütfen adınızı girin' }]}
                                >
                                    <Input placeholder="Ahmet" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    name="lastName"
                                    label="Soyad"
                                    rules={[{ required: true, message: 'Lütfen soyadınızı girin' }]}
                                >
                                    <Input placeholder="Yılmaz" size="large" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    name="email"
                                    label="E-posta Adresi"
                                    rules={[
                                        { required: true, message: 'Lütfen e-posta girin' },
                                        { type: 'email', message: 'Geçerli bir e-posta girin' }
                                    ]}
                                >
                                    <Input placeholder="ahmet@ornek.com" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    name="phone"
                                    label="Telefon Numarası"
                                    rules={[{ required: true, message: 'Lütfen telefon girin' }]}
                                >
                                    <Input placeholder="0555 123 45 67" size="large" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item
                            name="password"
                            label="Şifre Oluşturun"
                            rules={[
                                { required: true, message: 'Lütfen şifre girin' },
                                { min: 6, message: 'Şifre en az 6 karakter olmalıdır' }
                            ]}
                        >
                            <Input.Password placeholder="******" size="large" />
                        </Form.Item>
                    </div>

                    {/* STEP 2: Vehicle Info */}
                    <div style={{ display: current === 1 ? 'block' : 'none' }}>
                        <Alert
                            message="Araç bilgilerinizin ruhsatla uyumlu olması önemlidir."
                            type="info"
                            showIcon
                            style={{ marginBottom: 24 }}
                        />

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    name="vehiclePlate"
                                    label="Araç Plakası"
                                    rules={[{ required: true, message: 'Plaka zorunludur' }]}
                                >
                                    <Input placeholder="34 ABC 123" size="large" style={{ textTransform: 'uppercase' }} />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    name="vehicleType"
                                    label="Araç Tipi"
                                    rules={[{ required: true, message: 'Araç tipi seçin' }]}
                                >
                                    <Select size="large">
                                        <Option value="SEDAN">Binek (Sedan)</Option>
                                        <Option value="VAN">Van / Minivan (Vito vb.)</Option>
                                        <Option value="MINIBUS">Minibüs (Sprinter vb.)</Option>
                                        <Option value="BUS">Otobüs</Option>
                                        <Option value="VIP">VIP</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item
                                    name="vehicleBrand"
                                    label="Marka"
                                    rules={[{ required: true, message: 'Marka girin' }]}
                                >
                                    <Input placeholder="Mercedes" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="vehicleModel"
                                    label="Model"
                                    rules={[{ required: true, message: 'Model girin' }]}
                                >
                                    <Input placeholder="Vito" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="vehicleYear"
                                    label="Yıl"
                                    rules={[{ required: true, message: 'Yıl girin' }]}
                                >
                                    <InputNumber style={{ width: '100%' }} size="large" min={2000} max={2026} placeholder="2023" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>

                    {/* STEP 3: Document Uploads */}
                    <div style={{ display: current === 2 ? 'block' : 'none' }}>
                        <Alert
                            message="Lütfen gerekli belgeleri yükleyiniz (PDF veya Resim)."
                            type="info"
                            showIcon
                            style={{ marginBottom: 24 }}
                        />

                        <Form.Item
                            name="tursabDocument"
                            label="Türsab Belgesi"
                            rules={[{ required: true, message: 'Lütfen Türsab Belgesi yükleyin' }]}
                        >
                            <Upload {...uploadProps('tursabDocument')} listType="picture">
                                <Button icon={<UploadOutlined />}>Dosya Seç (Türsab)</Button>
                            </Upload>
                        </Form.Item>

                        <Form.Item
                            name="srcDocument"
                            label="SRC Belgesi"
                            rules={[{ required: true, message: 'Lütfen SRC Belgesi yükleyin' }]}
                        >
                            <Upload {...uploadProps('srcDocument')} listType="picture">
                                <Button icon={<UploadOutlined />}>Dosya Seç (SRC)</Button>
                            </Upload>
                        </Form.Item>

                        <Form.Item
                            name="licenseDocument"
                            label="Ehliyet"
                            rules={[{ required: true, message: 'Lütfen Ehliyet yükleyin' }]}
                        >
                            <Upload {...uploadProps('licenseDocument')} listType="picture">
                                <Button icon={<UploadOutlined />}>Dosya Seç (Ehliyet)</Button>
                            </Upload>
                        </Form.Item>
                    </div>

                    {/* STEP 4: Summary (Submit Button) */}
                    <div style={{ display: current === 3 ? 'block' : 'none', textAlign: 'center' }}>
                        <RocketOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
                        <Title level={3}>Hazırsınız!</Title>
                        <Text>Bilgilerinizi kontrol ettiyseniz başvuruyu tamamlayın.</Text>
                        <br /><br />
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            loading={loading}
                            style={{ height: 50, paddingLeft: 40, paddingRight: 40, fontSize: 18 }}
                        >
                            Başvuruyu Tamamla
                        </Button>
                    </div>

                    {/* Navigation Buttons */}
                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                        {current > 0 && (
                            <Button onClick={handlePrev} size="large">
                                Geri
                            </Button>
                        )}

                        {current < 3 && (
                            <Button type="primary" onClick={handleNext} size="large" style={{ marginLeft: 'auto' }}>
                                İleri
                            </Button>
                        )}
                    </div>
                </Form>

                <div style={{ marginTop: 40, textAlign: 'center' }}>
                    <Text type="secondary">Zaten hesabınız var mı? <a href="/login">Giriş Yap</a></Text>
                </div>
            </Card>
        </div>
    );
};

export default RegisterDriverPage;
