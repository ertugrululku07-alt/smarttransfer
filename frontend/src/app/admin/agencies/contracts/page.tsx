'use client';

import React, { useState, useEffect } from 'react';
import {
    Typography, Card, message, Row, Col, List, Avatar,
    Button, Form, InputNumber, Select, Spin, Empty,
    Divider, Popconfirm, Tag, Space
} from 'antd';
import {
    CarOutlined, PlusOutlined, CloseCircleOutlined, SaveOutlined,
    FileTextOutlined, BankOutlined, DeleteOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

const { Title, Text } = Typography;
const { Option } = Select;


interface Agency { id: string; name: string; email: string; status: string; }
interface VehicleType { id: string; name: string; category: string; categoryDisplay?: string; capacity: number; image?: string; }
interface Zone { id: string; name: string; color?: string; }

export default function AgencyContractsPage() {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
    const [zones, setZones] = useState<Zone[]>([]);
    const [hubs, setHubs] = useState<any[]>([]);

    const [loadingAgencies, setLoadingAgencies] = useState(true);
    const [loadingVT, setLoadingVT] = useState(false);
    const [saving, setSaving] = useState(false);
    const [defaultCurrency, setDefaultCurrency] = useState<string>('');
    const [allCurrencies, setAllCurrencies] = useState<{code: string; symbol: string}[]>([]);

    const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
    const [selectedVT, setSelectedVT] = useState<VehicleType | null>(null);

    const [form] = Form.useForm();

    useEffect(() => {
        const load = async () => {
            try {
                setLoadingAgencies(true);
                const [agRes, vtRes, zonesRes, tenantRes] = await Promise.allSettled([
                    apiClient.get('/api/admin/agencies'),
                    apiClient.get('/api/vehicle-types'),
                    apiClient.get('/api/zones'),
                    apiClient.get('/api/tenant/info'),
                ]);
                if (agRes.status === 'fulfilled' && agRes.value.data?.success) setAgencies(agRes.value.data.data);
                if (vtRes.status === 'fulfilled' && vtRes.value.data?.success) setVehicleTypes(vtRes.value.data.data);
                if (zonesRes.status === 'fulfilled' && zonesRes.value.data?.success) setZones(zonesRes.value.data.data);
                if (tenantRes.status === 'fulfilled' && tenantRes.value.data?.success) {
                    const st = tenantRes.value.data.data?.tenant?.settings || {};
                    if (Array.isArray(st.hubs)) setHubs(st.hubs);
                    if (Array.isArray(st.definitions?.currencies) && st.definitions.currencies.length > 0) {
                        setAllCurrencies(st.definitions.currencies);
                        const defCur = st.definitions.currencies.find((c: any) => c.isDefault);
                        if (defCur) setDefaultCurrency(defCur.code);
                    }
                }
            } catch {
                message.error('Veriler yüklenemedi');
            } finally {
                setLoadingAgencies(false);
            }
        };
        load();
    }, []);

    const handleSelectAgency = (agency: Agency) => {
        setSelectedAgency(agency);
        setSelectedVT(null);
        form.resetFields();
    };

    const handleSelectVT = async (vt: VehicleType) => {
        setSelectedVT(vt);
        setLoadingVT(true);
        try {
            const [contractsRes, metaRes] = await Promise.allSettled([
                apiClient.get(`/api/admin/agencies/${selectedAgency!.id}/contracts`),
                apiClient.get(`/api/admin/agencies/${selectedAgency!.id}/contract-meta/${vt.id}`),
            ]);

            let zonePrices: any[] = [];
            if (contractsRes.status === 'fulfilled' && contractsRes.value.data?.success) {
                zonePrices = contractsRes.value.data.data
                    .filter((c: any) => c.vehicleTypeId === vt.id)
                    .map((c: any) => ({
                        zoneId: c.zoneId,
                        baseLocation: c.baseLocation,
                        price: c.price ? Number(c.price) : undefined,
                        childPrice: c.childPrice ? Number(c.childPrice) : undefined,
                        babyPrice: c.babyPrice ? Number(c.babyPrice) : undefined,
                        fixedPrice: c.fixedPrice ? Number(c.fixedPrice) : undefined,
                        extraKmPrice: c.extraKmPrice ? Number(c.extraKmPrice) : undefined,
                    }));
            }

            let meta: any = { currency: defaultCurrency };
            if (metaRes.status === 'fulfilled' && metaRes.value.data?.success && metaRes.value.data.data) {
                const m = metaRes.value.data.data;
                meta = {
                    currency: m.currency || defaultCurrency,
                    openingFee: m.openingFee ? Number(m.openingFee) : undefined,
                    basePricePerKm: m.basePricePerKm ? Number(m.basePricePerKm) : undefined,
                    fixedPrice: m.fixedPrice ? Number(m.fixedPrice) : undefined,
                    basePricePerHour: m.basePricePerHour ? Number(m.basePricePerHour) : undefined,
                };
            }

            form.setFieldsValue({ ...meta, zonePrices });
        } catch {
            message.error('Kontratlar yüklenemedi');
        } finally {
            setLoadingVT(false);
        }
    };

    const handleSave = async (values: any) => {
        if (!selectedAgency || !selectedVT) return;
        setSaving(true);
        try {
            await Promise.all([
                // Save zone prices
                apiClient.post(
                    `/api/admin/agencies/${selectedAgency.id}/contracts/${selectedVT.id}`,
                    { zonePrices: values.zonePrices || [] }
                ),
                // Save general/fallback meta
                apiClient.post(
                    `/api/admin/agencies/${selectedAgency.id}/contract-meta/${selectedVT.id}`,
                    {
                        currency: values.currency || defaultCurrency || 'TRY',
                        openingFee: values.openingFee ?? null,
                        basePricePerKm: values.basePricePerKm ?? null,
                        fixedPrice: values.fixedPrice ?? null,
                        basePricePerHour: values.basePricePerHour ?? null,
                    }
                )
            ]);
            message.success('Kontrat fiyatları kaydedildi');
        } catch (err: any) {
            message.error(err?.response?.data?.error || 'Kaydedilemedi');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAll = async () => {
        if (!selectedAgency || !selectedVT) return;
        try {
            await apiClient.delete(`/api/admin/agencies/${selectedAgency.id}/contracts/${selectedVT.id}`);
            message.success('Bölge kontrat fiyatları silindi');
            form.setFieldsValue({ zonePrices: [] });
        } catch {
            message.error('Silinemedi');
        }
    };

    return (
        <AdminGuard>
            <AdminLayout selectedKey="agency-contracts">
                <div style={{ marginBottom: 20 }}>
                    <Title level={2} style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
                        <FileTextOutlined style={{ marginRight: 8, color: '#667eea' }} />
                        Acenta Kontratları
                    </Title>
                    <Text type="secondary">
                        Her alt acente için araç tipi ve bölge bazında özel sözleşme fiyatları tanımlayın.
                    </Text>
                </div>

                {loadingAgencies ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
                        <Spin size="large" />
                    </div>
                ) : (
                    <Row gutter={[16, 16]}>
                        {/* Column 1: Agencies */}
                        <Col xs={24} md={7} lg={6}>
                            <Card
                                title={<span style={{ fontWeight: 600 }}><BankOutlined style={{ marginRight: 6 }} />Alt Acenteler</span>}
                                styles={{ body: { padding: '8px 0' } }}
                                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                            >
                                {agencies.length === 0 ? (
                                    <Empty description="Acenta bulunamadı" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '20px 0' }} />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {agencies.map(ag => {
                                            const isSel = selectedAgency?.id === ag.id;
                                            return (
                                                <div
                                                    key={ag.id}
                                                    onClick={() => handleSelectAgency(ag)}
                                                    style={{
                                                        padding: '10px 16px', cursor: 'pointer',
                                                        background: isSel ? '#eff6ff' : 'transparent',
                                                        borderLeft: isSel ? '4px solid #667eea' : '4px solid transparent',
                                                        transition: 'all 0.2s',
                                                        display: 'flex', alignItems: 'center', gap: 12,
                                                        borderBottom: '1px solid #f0f0f0'
                                                    }}
                                                >
                                                    <Avatar icon={<BankOutlined />} style={{ background: isSel ? '#667eea' : '#cbd5e1' }} />
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <Text strong style={{ color: isSel ? '#1d4ed8' : 'inherit', fontSize: 13, display: 'block' }}>{ag.name}</Text>
                                                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{ag.email}</Text>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        </Col>

                        {/* Column 2: Vehicle Types */}
                        <Col xs={24} md={6} lg={5}>
                            <Card
                                title={<span style={{ fontWeight: 600 }}><CarOutlined style={{ marginRight: 6 }} />Araç Tipleri</span>}
                                styles={{ body: { padding: '8px 0' } }}
                                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: selectedAgency ? 1 : 0.5 }}
                            >
                                {!selectedAgency ? (
                                    <div style={{ padding: 24, textAlign: 'center' }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Önce acente seçin</Text>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {vehicleTypes.map(vt => {
                                            const isSel = selectedVT?.id === vt.id;
                                            return (
                                                <div
                                                    key={vt.id}
                                                    onClick={() => handleSelectVT(vt)}
                                                    style={{
                                                        padding: '10px 16px', cursor: 'pointer',
                                                        background: isSel ? '#eff6ff' : 'transparent',
                                                        borderLeft: isSel ? '4px solid #3b82f6' : '4px solid transparent',
                                                        transition: 'all 0.2s',
                                                        display: 'flex', alignItems: 'center', gap: 12,
                                                        borderBottom: '1px solid #f0f0f0'
                                                    }}
                                                >
                                                    <Avatar src={vt.image} icon={<CarOutlined />} style={{ background: '#cbd5e1' }} />
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <Text strong style={{ color: isSel ? '#1d4ed8' : 'inherit', fontSize: 13, display: 'block' }}>{vt.name}</Text>
                                                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{vt.categoryDisplay || vt.category} · {vt.capacity} Yolcu</Text>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        </Col>

                        {/* Column 3: Pricing Form */}
                        <Col xs={24} md={11} lg={13}>
                            <Form form={form} layout="vertical" onFinish={handleSave} style={{ display: (selectedAgency && selectedVT) ? 'block' : 'none' }}>
                                <Card
                                    title={
                                        <Space>
                                            <span style={{ fontWeight: 600 }}>{selectedAgency?.name} · {selectedVT?.name}</span>
                                            <Tag color="blue">Kontrat Fiyatları</Tag>
                                        </Space>
                                    }
                                    extra={
                                        <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}>
                                            Kaydet
                                        </Button>
                                    }
                                    style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                                >
                                    {loadingVT ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
                                    ) : (
                                        <>

                                            {/* ── GENEL / MESAFE BAZLI (FALLBACK) ─────────────────── */}
                                            <Title level={5}>Genel / Mesafe Bazlı Formül (Opsiyonel)</Title>
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                                                Transfer rotası hiçbir bölgeyle eşleşmezse kullanılacak yedek fiyatlar. Girilmezse araç tipi global fiyatları kullanılır.
                                            </Text>

                                            <Row gutter={16}>
                                                <Col span={8}>
                                                    <Form.Item label="Para Birimi" name="currency">
                                                        <Select placeholder={defaultCurrency || 'Para Birimi'} allowClear loading={allCurrencies.length === 0} notFoundContent={allCurrencies.length === 0 ? 'Yükleniyor...' : 'Para birimi tanımlanmamış'}>
                                                            {allCurrencies.map((c: any) => (
                                                                <Option key={c.code} value={c.code}>{c.symbol} {c.code}</Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Row gutter={16}>
                                                <Col span={6}>
                                                    <Form.Item label="Başlangıç Ücreti" name="openingFee">
                                                        <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={6}>
                                                    <Form.Item label="Km Başı Ücret" name="basePricePerKm">
                                                        <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={6}>
                                                    <Form.Item label="Hizmet Başı Sabit" name="fixedPrice">
                                                        <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={6}>
                                                    <Form.Item label="Saatlik Fiyat" name="basePricePerHour">
                                                        <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>
                                            </Row>

                                            <Divider />

                                            {/* ── BÖLGE FİYATLARI ─────────────────────────────────── */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                                <div>
                                                    <Title level={5} style={{ margin: 0 }}>Bölge (Poligon) Kontrat Fiyatları</Title>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>Bölge eşleşmesi olduğunda uygulanacak acente özel fiyatları.</Text>
                                                </div>
                                                <Popconfirm title="Tüm bölge fiyatları silinsin mi?" onConfirm={handleDeleteAll} okText="Evet" cancelText="Hayır">
                                                    <Button danger size="small" icon={<DeleteOutlined />}>Bölgeleri Sil</Button>
                                                </Popconfirm>
                                            </div>

                                            <Form.List name="zonePrices">
                                                {(fields, { add, remove }) => (
                                                    <>
                                                        {fields.length === 0 && (
                                                            <Empty description="Henüz bölge kontrat fiyatı eklenmemiş" style={{ marginBottom: 16 }} />
                                                        )}

                                                        {fields.map(({ key, name, ...restField }) => (
                                                            <div key={key} style={{
                                                                padding: '16px 20px',
                                                                background: '#f8fafc',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: 12,
                                                                marginBottom: 16,
                                                                position: 'relative'
                                                            }}>
                                                                <Button
                                                                    type="text" danger
                                                                    icon={<CloseCircleOutlined />}
                                                                    onClick={() => remove(name)}
                                                                    style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
                                                                />

                                                                <Row gutter={16}>
                                                                    <Col span={12}>
                                                                        <Form.Item
                                                                            {...restField}
                                                                            name={[name, 'baseLocation']}
                                                                            label="Merkez (Kalkış / Varış)"
                                                                            rules={[{ required: true, message: 'Gerekli' }]}
                                                                        >
                                                                            {hubs.length > 0 ? (
                                                                                <Select placeholder="Örn: AYT" showSearch optionFilterProp="children">
                                                                                    {hubs.map((h: any) => (
                                                                                        <Option key={h.code} value={h.code}>{h.name} ({h.code})</Option>
                                                                                    ))}
                                                                                </Select>
                                                                            ) : (
                                                                                <Select placeholder="Merkez kodu">
                                                                                    <Option value="AYT">AYT Havalimanı</Option>
                                                                                </Select>
                                                                            )}
                                                                        </Form.Item>
                                                                    </Col>
                                                                    <Col span={12}>
                                                                        <Form.Item
                                                                            {...restField}
                                                                            name={[name, 'zoneId']}
                                                                            label="Bölge (Poligon)"
                                                                            rules={[{ required: true, message: 'Seçiniz' }]}
                                                                        >
                                                                            <Select placeholder="Poligon Seç" showSearch optionFilterProp="children">
                                                                                {zones.map(z => (
                                                                                    <Option key={z.id} value={z.id}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: z.color || '#3388ff', flexShrink: 0 }} />
                                                                                            {z.name}
                                                                                        </div>
                                                                                    </Option>
                                                                                ))}
                                                                            </Select>
                                                                        </Form.Item>
                                                                    </Col>
                                                                </Row>

                                                                <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                                                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12, color: '#475569' }}>
                                                                        Fiyat Detayları
                                                                    </Text>
                                                                    <Row gutter={[16, 0]}>
                                                                        <Col span={6}>
                                                                            <Form.Item
                                                                                {...restField}
                                                                                name={[name, 'fixedPrice']}
                                                                                label="Fix (Araç) Fiyatı"
                                                                                tooltip="Girilirse yolcu sayısı yok sayılır, direkt araç fiyatı olarak uygulanır."
                                                                            >
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col span={6}>
                                                                            <Form.Item
                                                                                {...restField}
                                                                                name={[name, 'price']}
                                                                                label="Yetişkin / Baz Fiyat"
                                                                                tooltip="Kişi başı yetişkin fiyatıdır."
                                                                            >
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col span={6}>
                                                                            <Form.Item {...restField} name={[name, 'childPrice']} label="Çocuk Fiyatı">
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col span={6}>
                                                                            <Form.Item {...restField} name={[name, 'babyPrice']} label="Bebek Fiyatı">
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col span={6}>
                                                                            <Form.Item
                                                                                {...restField}
                                                                                name={[name, 'extraKmPrice']}
                                                                                label="Aşım Km Fiyatı"
                                                                                tooltip="Poligon sınırından çıktıktan sonra km başına eklenecek ücret."
                                                                            >
                                                                                <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                                                            </Form.Item>
                                                                        </Col>
                                                                    </Row>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        <Form.Item>
                                                            <Button
                                                                type="dashed"
                                                                onClick={() => add({ baseLocation: hubs[0]?.code || 'AYT' })}
                                                                block icon={<PlusOutlined />}
                                                                size="large" style={{ borderRadius: 8 }}
                                                            >
                                                                + Yeni Bölge Kontrat Fiyatı Ekle
                                                            </Button>
                                                        </Form.Item>
                                                    </>
                                                )}
                                            </Form.List>
                                        </>
                                    )}
                                </Card>
                            </Form>
                            {(!selectedAgency || !selectedVT) && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, color: '#94a3b8', background: '#f8fafc', borderRadius: 12 }}>
                                    <FileTextOutlined style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }} />
                                    <Title level={4} style={{ color: '#64748b', margin: 0 }}>
                                        {!selectedAgency ? 'Acente seçin' : 'Araç tipi seçin'}
                                    </Title>
                                    <Text type="secondary">Kontrat fiyatlarını girebilmek için sol panellerden seçim yapın.</Text>
                                </div>
                            )}
                        </Col>
                    </Row>
                )}
            </AdminLayout>
        </AdminGuard>
    );
}
