'use client';

import React, { useEffect, useState } from 'react';
import {
    Form,
    Input,
    Button,
    Card,
    Row,
    Col,
    DatePicker,
    Select,
    Upload,
    message,
    InputNumber,
    Switch,
    Divider,
    Spin
} from 'antd';
import {
    SaveOutlined,
    ArrowLeftOutlined,
    UserOutlined,
    IdcardOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import apiClient from '../../../../lib/api-client';
import dayjs from 'dayjs';
import AdminGuard from '../../AdminGuard';
import AdminLayout from '../../AdminLayout';

const { TextArea } = Input;
const { Option } = Select;

const PersonnelEditPage = ({ params }: { params: Promise<{ id: string }> }) => {
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const router = useRouter();
    const [form] = Form.useForm();
    const { id } = React.use(params);

    const normFile = (e: any) => {
        if (Array.isArray(e)) {
            return e;
        }
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
                        photo: data.photo ? [{
                            uid: '-1',
                            name: 'photo.png',
                            status: 'done',
                            url: data.photo,
                        }] : undefined
                    });
                } else {
                    message.error('Personel bilgileri alınamadı');
                    router.push('/admin/personnel');
                }
            } catch (error) {
                console.error('Fetch personnel error:', error);
                message.error('Personel yüklenirken hata oluştu');
            } finally {
                setFetching(false);
            }
        };

        if (id) {
            fetchPersonnel();
        }
    }, [id, form, router]);

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            // Format dates
            const formattedValues = {
                ...values,
                birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                startDate: values.startDate ? values.startDate.toISOString() : null,
                endDate: values.endDate ? values.endDate.toISOString() : null,
                photo: values.photo && values.photo.length > 0
                    ? (values.photo[0].response?.data?.url || values.photo[0].url)
                    : undefined
            };

            const response = await apiClient.put(`/api/personnel/${id}`, formattedValues);

            if (response.data.success) {
                message.success('Personel başarıyla güncellendi');
                router.push('/admin/personnel');
            } else {
                message.error(response.data.error || 'Bir hata oluştu');
            }
        } catch (error: any) {
            console.error('Update personnel error:', error);
            message.error(error.response?.data?.error || 'Güncelleme başarısız');
        } finally {
            setLoading(false);
        }
    };

    const uploadProps = {
        name: 'file',
        action: `${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload/driver-docs`,
        headers: {
            authorization: 'authorization-text',
        },
        maxCount: 1,
        listType: "picture-card" as const,
        onChange(info: any) {
            if (info.file.status === 'done') {
                message.success(`${info.file.name} başarıyla yüklendi`);
            } else if (info.file.status === 'error') {
                message.error(`${info.file.name} yüklenemedi.`);
            }
        },
    };

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
                <Card
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => router.back()}
                                type="text"
                            />
                            <span>Personel Düzenle</span>
                        </div>
                    }
                >
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={onFinish}
                        initialValues={{
                            isActive: true,
                            gender: 'MALE',
                            currency: 'TRY'
                        }}
                    >
                        <Divider titlePlacement="left">Kişisel Bilgiler</Divider>
                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="firstName"
                                    label="Ad"
                                    rules={[{ required: true, message: 'Ad zorunludur' }]}
                                >
                                    <Input prefix={<UserOutlined />} placeholder="Ad" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="lastName"
                                    label="Soyad"
                                    rules={[{ required: true, message: 'Soyad zorunludur' }]}
                                >
                                    <Input prefix={<UserOutlined />} placeholder="Soyad" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="tcNumber"
                                    label="T.C. Kimlik No"
                                    rules={[
                                        { required: true, message: 'TCKN zorunludur' },
                                        { len: 11, message: '11 hane olmalıdır' }
                                    ]}
                                >
                                    <Input prefix={<IdcardOutlined />} placeholder="11 haneli TCKN" maxLength={11} />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item name="birthDate" label="Doğum Tarihi">
                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="birthPlace" label="Doğum Yeri">
                                    <Input placeholder="Şehir/İlçe" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="gender" label="Cinsiyet">
                                    <Select>
                                        <Option value="MALE">Erkek</Option>
                                        <Option value="FEMALE">Kadın</Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={24}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    label="Fotoğraf"
                                    name="photo"
                                    valuePropName="fileList"
                                    getValueFromEvent={normFile}
                                >
                                    <Upload {...uploadProps}>
                                        <div>
                                            <div style={{ marginTop: 8 }}>Fotoğraf Yükle</div>
                                        </div>
                                    </Upload>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider titlePlacement="left">İletişim Bilgileri</Divider>
                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item name="phone" label="Telefon No" rules={[{ required: true, message: 'Telefon zorunludur' }]}>
                                    <Input placeholder="05XX XXX XX XX" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="relativePhone" label="Yakın Telefonu">
                                    <Input placeholder="Acil durumda aranacak" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="email" label="E-Posta">
                                    <Input type="email" placeholder="ornek@email.com" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={24}>
                            <Col span={24}>
                                <Form.Item name="address" label="Adres">
                                    <TextArea rows={2} placeholder="Açık adres" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider titlePlacement="left">İş Bilgileri</Divider>
                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item name="startDate" label="İşe Başlama Tarihi" rules={[{ required: true }]}>
                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="jobTitle" label="Görevi">
                                    <Input placeholder="Şoför, Rehber vb." />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="department" label="Departman">
                                    <Input placeholder="Operasyon, Muhasebe vb." />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item name="salary" label="Maaş">
                                    <InputNumber
                                        style={{ width: '100%' }}
                                        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                        parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                                        suffix="₺"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="isActive" label="Durum" valuePropName="checked">
                                    <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider titlePlacement="left">Belgeler ve Sağlık</Divider>
                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item name="licenseType" label="Ehliyet Tipi">
                                    <Select placeholder="Seçiniz">
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
                                <Form.Item name="srcNumber" label="SRC Belge No">
                                    <Input placeholder="SRC Belge Numarası" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="bloodGroup" label="Kan Grubu">
                                    <Select placeholder="Seçiniz">
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
                        <Row gutter={24}>
                            <Col span={24}>
                                <Form.Item name="medicalHistory" label="Geçirdiği Hastalıklar / Sağlık Durumu">
                                    <TextArea rows={3} placeholder="Varsa kronik rahatsızlıklar, alerjiler vb." />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} size="large" block>
                                Personel Güncelle
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            </AdminLayout>
        </AdminGuard>
    );
};

export default PersonnelEditPage;
