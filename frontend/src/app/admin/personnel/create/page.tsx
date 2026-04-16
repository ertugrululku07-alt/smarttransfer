'use client';

import React, { useState } from 'react';
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
    Modal
} from 'antd';
import {
    SaveOutlined,
    ArrowLeftOutlined,
    UploadOutlined,
    UserOutlined,
    IdcardOutlined,
    LockOutlined,
    WarningOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import apiClient from '../../../../lib/api-client';
import dayjs from 'dayjs';
import AdminGuard from '../../AdminGuard';
import AdminLayout from '../../AdminLayout';

const { TextArea } = Input;
const { Option } = Select;

const PersonnelCreatePage = () => {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const [form] = Form.useForm();
    const [blacklistModal, setBlacklistModal] = useState(false);
    const [blacklistInfo, setBlacklistInfo] = useState<any>(null);
    const [pendingValues, setPendingValues] = useState<any>(null);

    const normFile = (e: any) => {
        if (Array.isArray(e)) {
            return e;
        }
        return e?.fileList;
    };

    const submitPersonnel = async (formattedValues: any) => {
        const response = await apiClient.post('/api/personnel', formattedValues);
        if (response.data.success) {
            message.success('Personel başarıyla oluşturuldu');
            router.push('/admin/personnel');
        } else {
            message.error(response.data.error || 'Bir hata oluştu');
        }
    };

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const formattedValues = {
                ...values,
                birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                startDate: values.startDate ? values.startDate.toISOString() : null,
                endDate: values.endDate ? values.endDate.toISOString() : null,
                photo: values.photo && values.photo.length > 0
                    ? values.photo[0].response?.data?.url : undefined
            };
            await submitPersonnel(formattedValues);
        } catch (error: any) {
            if (error.response?.status === 409 && error.response?.data?.error === 'BLACKLISTED') {
                setBlacklistInfo(error.response.data.blacklistInfo);
                setPendingValues({
                    ...values,
                    birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                    startDate: values.startDate ? values.startDate.toISOString() : null,
                    endDate: values.endDate ? values.endDate.toISOString() : null,
                    photo: values.photo && values.photo.length > 0
                        ? values.photo[0].response?.data?.url : undefined
                });
                setBlacklistModal(true);
            } else {
                message.error(error.response?.data?.error || 'Kayıt başarısız');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBlacklistOverride = async () => {
        if (!pendingValues) return;
        setLoading(true);
        try {
            await submitPersonnel({ ...pendingValues, forceBlacklistOverride: true });
            setBlacklistModal(false);
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Kayıt başarısız');
        } finally {
            setLoading(false);
        }
    };

    const uploadProps = {
        name: 'file',
        action: `${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload/driver-docs`, // Use existing upload endpoint
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
                            <span>Yeni Personel Tanımlama</span>
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

                        <Row gutter={24}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="password"
                                    label="Şifre"
                                    rules={[{ required: true, message: 'Şifre zorunludur' }]}
                                >
                                    <Input.Password prefix={<LockOutlined />} placeholder="Giriş Şifresi" />
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
                                <Form.Item
                                    name="jobTitle"
                                    label="Görevi"
                                    rules={[{ required: true, message: 'Görev seçimi zorunludur' }]}
                                >
                                    <Select placeholder="Seçiniz">
                                        <Option value="DRIVER">Şöför</Option>
                                        <Option value="OPERATION">Operasyon</Option>
                                        <Option value="ACCOUNTANT">Muhasebe</Option>
                                        <Option value="RESERVATION">Rezervasyon</Option>
                                    </Select>
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
                                Personel Kaydet
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>

                {/* Kara Liste Uyarı Modal */}
                <Modal
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 10,
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 18
                            }}><WarningOutlined /></div>
                            <div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>⛔ KARA LİSTE UYARISI</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Bu kişi kara listede kayıtlı</div>
                            </div>
                        </div>
                    }
                    open={blacklistModal}
                    onCancel={() => setBlacklistModal(false)}
                    footer={[
                        <Button key="cancel" onClick={() => setBlacklistModal(false)} style={{ borderRadius: 8 }}>
                            İptal — İşe Alma
                        </Button>,
                        <Button key="override" type="primary" danger loading={loading}
                            onClick={handleBlacklistOverride}
                            style={{ borderRadius: 8 }}>
                            Riski Kabul Et — Yine de İşe Al
                        </Button>
                    ]}
                    width={520}
                >
                    {blacklistInfo && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{
                                background: '#fef2f2', border: '1px solid #fecaca',
                                borderRadius: 12, padding: '16px 18px', marginBottom: 16
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <ExclamationCircleOutlined style={{ color: '#dc2626', fontSize: 18 }} />
                                    <span style={{ fontWeight: 800, fontSize: 14, color: '#991b1b' }}>
                                        Bu TC kimlik numarası kara listede!
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>KİŞİ</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{blacklistInfo.name}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>TC KİMLİK</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>{blacklistInfo.tcNumber}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>İŞTEN ÇIKIŞ NEDENİ</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{blacklistInfo.reason}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>ÇIKIŞ TARİHİ</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                            {blacklistInfo.endDate ? dayjs(blacklistInfo.endDate).format('DD.MM.YYYY') : '-'}
                                        </div>
                                    </div>
                                </div>

                                {blacklistInfo.note && (
                                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff5f5', borderRadius: 8, border: '1px solid #fecaca' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>NOT</div>
                                        <div style={{ fontSize: 12, color: '#7f1d1d', fontStyle: 'italic' }}>{blacklistInfo.note}</div>
                                    </div>
                                )}
                            </div>

                            <div style={{
                                background: '#fffbeb', border: '1px solid #fde68a',
                                borderRadius: 10, padding: '10px 14px',
                                fontSize: 12, color: '#92400e',
                                display: 'flex', alignItems: 'flex-start', gap: 8
                            }}>
                                <WarningOutlined style={{ marginTop: 2 }} />
                                <span>
                                    Bu kişi daha önce kara listeye eklenmiştir. Devam ederseniz eski kayıt arşivlenir
                                    ve yeni personel kaydı oluşturulur. Bu işlem geri alınamaz ve denetim loglarına kaydedilir.
                                </span>
                            </div>
                        </div>
                    )}
                </Modal>

            </AdminLayout>
        </AdminGuard >
    );
};

export default PersonnelCreatePage;
