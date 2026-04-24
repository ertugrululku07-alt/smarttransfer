'use client';

import React, { useEffect, useState } from 'react';
import {
    Form,
    Input,
    Button,
    Row,
    Col,
    DatePicker,
    Select,
    Upload,
    message,
    InputNumber,
    Switch,
    Spin,
    Steps,
    Badge,
    Tooltip
} from 'antd';
import {
    SaveOutlined,
    ArrowLeftOutlined,
    UserOutlined,
    IdcardOutlined,
    PhoneOutlined,
    MailOutlined,
    CarOutlined,
    SafetyCertificateOutlined,
    HeartOutlined,
    BankOutlined,
    CameraOutlined,
    CheckCircleOutlined,
    GlobalOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import apiClient from '../../../../lib/api-client';
import dayjs from 'dayjs';
import AdminGuard from '../../AdminGuard';
import AdminLayout from '../../AdminLayout';

const { TextArea } = Input;
const { Option } = Select;

const Section = ({ icon, title, subtitle, color, children }: {
    icon: React.ReactNode; title: string; subtitle?: string; color: string; children: React.ReactNode;
}) => (
    <div style={{ marginBottom: 32 }}>
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            paddingBottom: 12, borderBottom: '2px solid #f1f5f9'
        }}>
            <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `linear-gradient(135deg, ${color}15, ${color}25)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: color, fontSize: 18
            }}>{icon}</div>
            <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{title}</div>
                {subtitle && <div style={{ fontSize: 11, color: '#94a3b8' }}>{subtitle}</div>}
            </div>
        </div>
        {children}
    </div>
);

const NATIONALITY_OPTIONS = [
    { value: 'TUR', label: 'Turkiye' },
    { value: 'DEU', label: 'Almanya' },
    { value: 'GBR', label: 'Ingiltere' },
    { value: 'RUS', label: 'Rusya' },
    { value: 'NLD', label: 'Hollanda' },
    { value: 'BEL', label: 'Belcika' },
    { value: 'FRA', label: 'Fransa' },
    { value: 'AZE', label: 'Azerbaycan' },
    { value: 'GEO', label: 'Gurcistan' },
    { value: 'UKR', label: 'Ukrayna' },
    { value: 'IRQ', label: 'Irak' },
    { value: 'SYR', label: 'Suriye' },
    { value: 'IRN', label: 'Iran' },
];

const PersonnelEditPage = ({ params }: { params: Promise<{ id: string }> }) => {
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const router = useRouter();
    const [form] = Form.useForm();
    const { id } = React.use(params);
    const [currentStep, setCurrentStep] = useState(0);

    const normFile = (e: any) => {
        if (Array.isArray(e)) return e;
        return e?.fileList;
    };

    useEffect(() => {
        const fetchPersonnel = async () => {
            try {
                const response = await apiClient.get(`/api/personnel/${id}`);
                if (response.data.success) {
                    const data = response.data.data;
                    form.setFieldsValue({
                        ...data,
                        birthDate: data.birthDate ? dayjs(data.birthDate) : null,
                        startDate: data.startDate ? dayjs(data.startDate) : null,
                        endDate: data.endDate ? dayjs(data.endDate) : null,
                        licenseExpiry: data.licenseExpiry ? dayjs(data.licenseExpiry) : null,
                        psychotechExpiry: data.psychotechExpiry ? dayjs(data.psychotechExpiry) : null,
                        photo: data.photo ? [{
                            uid: '-1',
                            name: 'photo.png',
                            status: 'done',
                            url: data.photo,
                        }] : undefined
                    });
                } else {
                    message.error('Personel bilgileri alinamadi');
                    router.push('/admin/personnel');
                }
            } catch (error) {
                console.error('Fetch personnel error:', error);
                message.error('Personel yuklenirken hata olustu');
            } finally {
                setFetching(false);
            }
        };

        if (id) fetchPersonnel();
    }, [id, form, router]);

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const formattedValues = {
                ...values,
                birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                startDate: values.startDate ? values.startDate.toISOString() : null,
                endDate: values.endDate ? values.endDate.toISOString() : null,
                licenseExpiry: values.licenseExpiry ? values.licenseExpiry.toISOString() : null,
                psychotechExpiry: values.psychotechExpiry ? values.psychotechExpiry.toISOString() : null,
                photo: values.photo && values.photo.length > 0
                    ? (values.photo[0].response?.data?.url || values.photo[0].url)
                    : undefined
            };

            const response = await apiClient.put(`/api/personnel/${id}`, formattedValues);
            if (response.data.success) {
                message.success('Personel basariyla guncellendi');
                router.push('/admin/personnel');
            } else {
                message.error(response.data.error || 'Bir hata olustu');
            }
        } catch (error: any) {
            console.error('Update personnel error:', error);
            message.error(error.response?.data?.error || 'Guncelleme basarisiz');
        } finally {
            setLoading(false);
        }
    };

    const uploadProps = {
        name: 'file',
        action: `${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload/driver-docs`,
        headers: { authorization: 'authorization-text' },
        maxCount: 1,
        listType: "picture-card" as const,
        onChange(info: any) {
            if (info.file.status === 'done') message.success(`${info.file.name} basariyla yuklendi`);
            else if (info.file.status === 'error') message.error(`${info.file.name} yuklenemedi.`);
        },
    };

    const stepItems = [
        { title: 'Kisisel', icon: <UserOutlined /> },
        { title: 'Iletisim', icon: <PhoneOutlined /> },
        { title: 'Is Bilgileri', icon: <BankOutlined /> },
        { title: 'Belgeler', icon: <SafetyCertificateOutlined /> },
        { title: 'Saglik', icon: <HeartOutlined /> },
    ];

    if (fetching) {
        return (
            <AdminGuard>
                <AdminLayout selectedKey="personnel">
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
                        <Spin size="large" />
                    </div>
                </AdminLayout>
            </AdminGuard>
        );
    }

    return (
        <AdminGuard>
            <AdminLayout selectedKey="personnel">
                <div style={{ maxWidth: 960, margin: '0 auto' }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 24, padding: '16px 0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => router.back()}
                                style={{ borderRadius: 10, width: 40, height: 40 }}
                            />
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
                                    Personel Duzenle
                                </h2>
                                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                                    UETDS uyumlu personel bilgilerini guncelleyin
                                </span>
                            </div>
                        </div>
                        <Badge count="UETDS" style={{ backgroundColor: '#6366f1', fontSize: 10, fontWeight: 700, padding: '0 8px' }} />
                    </div>

                    {/* Steps indicator */}
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 24,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9'
                    }}>
                        <Steps current={currentStep} size="small" items={stepItems} onChange={setCurrentStep} />
                    </div>

                    {/* Form */}
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '28px 32px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9'
                    }}>
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={onFinish}
                            initialValues={{ isActive: true, gender: 'MALE', nationality: 'TUR' }}
                            requiredMark={(label, { required }) => (
                                <span>{label}{required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}</span>
                            )}
                        >
                            {/* ─── STEP 0: Kisisel Bilgiler ─── */}
                            <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
                                <Section icon={<UserOutlined />} title="Kisisel Bilgiler" subtitle="Kimlik ve temel bilgiler" color="#6366f1">
                                    <Row gutter={20}>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="firstName" label="Ad" rules={[{ required: true, message: 'Ad zorunludur' }]}>
                                                <Input placeholder="Ad" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="lastName" label="Soyad" rules={[{ required: true, message: 'Soyad zorunludur' }]}>
                                                <Input placeholder="Soyad" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="tcNumber" label="T.C. Kimlik No" rules={[
                                                { required: true, message: 'TCKN zorunludur' },
                                                { len: 11, message: '11 hane olmalidir' }
                                            ]}>
                                                <Input prefix={<IdcardOutlined style={{ color: '#94a3b8' }} />}
                                                    placeholder="11 haneli TCKN" maxLength={11} size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={20}>
                                        <Col xs={24} md={6}>
                                            <Form.Item name="birthDate" label="Dogum Tarihi"
                                                rules={[{ required: true, message: 'Dogum tarihi zorunludur' }]}>
                                                <DatePicker style={{ width: '100%', borderRadius: 10 }} format="DD.MM.YYYY" size="large" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name="birthPlace" label="Dogum Yeri">
                                                <Input placeholder="Sehir/Ilce" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name="gender" label="Cinsiyet" rules={[{ required: true }]}>
                                                <Select size="large">
                                                    <Option value="MALE">Erkek</Option>
                                                    <Option value="FEMALE">Kadin</Option>
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name="nationality" label={
                                                <span><GlobalOutlined style={{ marginRight: 4 }} />Uyruk <Tooltip title="UETDS zorunlu"><Badge count="UETDS" style={{ backgroundColor: '#6366f1', fontSize: 8, marginLeft: 6 }} /></Tooltip></span>
                                            } rules={[{ required: true, message: 'Uyruk zorunludur' }]}>
                                                <Select size="large" showSearch optionFilterProp="label"
                                                    options={NATIONALITY_OPTIONS} placeholder="Secin" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={20}>
                                        <Col xs={24} md={8}>
                                            <Form.Item label="Fotograf" name="photo" valuePropName="fileList" getValueFromEvent={normFile}>
                                                <Upload {...uploadProps}>
                                                    <div style={{
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                        gap: 4, color: '#94a3b8'
                                                    }}>
                                                        <CameraOutlined style={{ fontSize: 24 }} />
                                                        <span style={{ fontSize: 11 }}>Yukle</span>
                                                    </div>
                                                </Upload>
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Section>
                            </div>

                            {/* ─── STEP 1: Iletisim ─── */}
                            <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
                                <Section icon={<PhoneOutlined />} title="Iletisim Bilgileri" subtitle="Telefon, e-posta ve adres" color="#10b981">
                                    <Row gutter={20}>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="phone" label="Telefon No" rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                                                <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
                                                    placeholder="05XX XXX XX XX" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="relativePhone" label="Yakin Telefonu">
                                                <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
                                                    placeholder="Acil durumda aranacak" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="email" label="E-Posta">
                                                <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                                                    type="email" placeholder="ornek@email.com" size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={20}>
                                        <Col span={24}>
                                            <Form.Item name="address" label="Adres">
                                                <TextArea rows={2} placeholder="Acik adres" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Section>
                            </div>

                            {/* ─── STEP 2: Is Bilgileri ─── */}
                            <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
                                <Section icon={<BankOutlined />} title="Is Bilgileri" subtitle="Gorev, departman ve maas" color="#f59e0b">
                                    <Row gutter={20}>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="startDate" label="Ise Baslama Tarihi" rules={[{ required: true }]}>
                                                <DatePicker style={{ width: '100%', borderRadius: 10 }} format="DD.MM.YYYY" size="large" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="jobTitle" label="Gorevi"
                                                rules={[{ required: true, message: 'Gorev secimi zorunludur' }]}>
                                                <Select placeholder="Seciniz" size="large">
                                                    <Option value="DRIVER">Sofor</Option>
                                                    <Option value="OPERATION">Operasyon</Option>
                                                    <Option value="ACCOUNTANT">Muhasebe</Option>
                                                    <Option value="RESERVATION">Rezervasyon</Option>
                                                    <Option value="MANAGER">Yonetici</Option>
                                                    <Option value="GUIDE">Rehber</Option>
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="department" label="Departman">
                                                <Input placeholder="Operasyon, Muhasebe vb." size="large" style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={20}>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="salary" label="Maas">
                                                <InputNumber
                                                    style={{ width: '100%', borderRadius: 10 }}
                                                    size="large"
                                                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                    parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                                                    suffix="TL"
                                                />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="isActive" label="Durum" valuePropName="checked">
                                                <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Section>
                            </div>

                            {/* ─── STEP 3: Belgeler (UETDS) ─── */}
                            <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
                                <Section icon={<SafetyCertificateOutlined />} title="Belgeler ve Yetkinlikler" subtitle="Ehliyet, SRC ve psikoteknik — UETDS zorunlu alanlar" color="#ef4444">
                                    {/* Ehliyet */}
                                    <div style={{
                                        background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12,
                                        padding: '16px 20px', marginBottom: 16
                                    }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <CarOutlined /> Ehliyet Bilgileri
                                            <Badge count="UETDS" style={{ backgroundColor: '#6366f1', fontSize: 8, marginLeft: 4 }} />
                                        </div>
                                        <Row gutter={20}>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="licenseType" label="Ehliyet Sinifi">
                                                    <Select placeholder="Seciniz" size="large">
                                                        <Option value="B">B</Option>
                                                        <Option value="BE">BE</Option>
                                                        <Option value="C1">C1</Option>
                                                        <Option value="C1E">C1E</Option>
                                                        <Option value="C">C</Option>
                                                        <Option value="CE">CE</Option>
                                                        <Option value="D1">D1</Option>
                                                        <Option value="D1E">D1E</Option>
                                                        <Option value="D">D</Option>
                                                        <Option value="DE">DE</Option>
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="licenseNumber" label={
                                                    <span>Ehliyet Belge No <Tooltip title="UETDS zorunlu alan"><Badge count="UETDS" style={{ backgroundColor: '#6366f1', fontSize: 8, marginLeft: 6 }} /></Tooltip></span>
                                                }>
                                                    <Input placeholder="Ehliyet seri numarasi" size="large" style={{ borderRadius: 10 }} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="licenseExpiry" label={
                                                    <span>Gecerlilik Tarihi <Tooltip title="UETDS zorunlu alan"><Badge count="UETDS" style={{ backgroundColor: '#6366f1', fontSize: 8, marginLeft: 6 }} /></Tooltip></span>
                                                }>
                                                    <DatePicker style={{ width: '100%', borderRadius: 10 }} format="DD.MM.YYYY" size="large" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>

                                    {/* SRC */}
                                    <div style={{
                                        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
                                        padding: '16px 20px', marginBottom: 16
                                    }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <SafetyCertificateOutlined /> SRC Belgesi
                                            <Badge count="UETDS" style={{ backgroundColor: '#6366f1', fontSize: 8, marginLeft: 4 }} />
                                        </div>
                                        <Row gutter={20}>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="srcType" label="SRC Tipi">
                                                    <Select placeholder="Seciniz" size="large" allowClear>
                                                        <Option value="SRC1">SRC-1 (Uluslararasi Yolcu)</Option>
                                                        <Option value="SRC2">SRC-2 (Yurt ici Yolcu)</Option>
                                                        <Option value="SRC3">SRC-3 (Uluslararasi Yuk)</Option>
                                                        <Option value="SRC4">SRC-4 (Yurt ici Yuk)</Option>
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="srcNumber" label="SRC Belge No">
                                                    <Input placeholder="SRC Belge Numarasi" size="large" style={{ borderRadius: 10 }} />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>

                                    {/* Psikoteknik */}
                                    <div style={{
                                        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
                                        padding: '16px 20px'
                                    }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <CheckCircleOutlined /> Psikoteknik Raporu
                                        </div>
                                        <Row gutter={20}>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="psychotechDocument" label="Belge Durumu">
                                                    <Select placeholder="Seciniz" size="large" allowClear>
                                                        <Option value="VALID">Gecerli</Option>
                                                        <Option value="EXPIRED">Suresi Dolmus</Option>
                                                        <Option value="PENDING">Bekleniyor</Option>
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name="psychotechExpiry" label="Gecerlilik Tarihi">
                                                    <DatePicker style={{ width: '100%', borderRadius: 10 }} format="DD.MM.YYYY" size="large" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>
                                </Section>
                            </div>

                            {/* ─── STEP 4: Saglik ─── */}
                            <div style={{ display: currentStep === 4 ? 'block' : 'none' }}>
                                <Section icon={<HeartOutlined />} title="Saglik Bilgileri" subtitle="Kan grubu ve saglik gecmisi" color="#ec4899">
                                    <Row gutter={20}>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="bloodGroup" label="Kan Grubu">
                                                <Select placeholder="Seciniz" size="large">
                                                    <Option value="A_RH_POS">A RH+</Option>
                                                    <Option value="A_RH_NEG">A RH-</Option>
                                                    <Option value="B_RH_POS">B RH+</Option>
                                                    <Option value="B_RH_NEG">B RH-</Option>
                                                    <Option value="AB_RH_POS">AB RH+</Option>
                                                    <Option value="AB_RH_NEG">AB RH-</Option>
                                                    <Option value="0_RH_POS">0 RH+</Option>
                                                    <Option value="0_RH_NEG">0 RH-</Option>
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={20}>
                                        <Col span={24}>
                                            <Form.Item name="medicalHistory" label="Gecirdigi Hastaliklar / Saglik Durumu">
                                                <TextArea rows={3} placeholder="Varsa kronik rahatsizliklar, alerjiler vb." style={{ borderRadius: 10 }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Section>
                            </div>

                            {/* Navigation & Submit */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                paddingTop: 20, borderTop: '2px solid #f1f5f9', marginTop: 8
                            }}>
                                <Button
                                    disabled={currentStep === 0}
                                    onClick={() => setCurrentStep(s => s - 1)}
                                    style={{ borderRadius: 10, height: 44, paddingInline: 24 }}
                                >
                                    Geri
                                </Button>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {currentStep < 4 && (
                                        <Button type="primary" onClick={() => setCurrentStep(s => s + 1)}
                                            style={{ borderRadius: 10, height: 44, paddingInline: 24, background: '#6366f1' }}>
                                            Devam
                                        </Button>
                                    )}
                                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}
                                        style={{
                                            borderRadius: 10, height: 44, paddingInline: 28,
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            border: 'none', fontWeight: 700, fontSize: 14
                                        }}>
                                        Personel Guncelle
                                    </Button>
                                </div>
                            </div>
                        </Form>
                    </div>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

export default PersonnelEditPage;
