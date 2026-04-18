'use client';

import React, { useState, useEffect } from 'react';
import {
    Typography, message, Row, Col,
    Button, Form, InputNumber, Select, Spin,
    Badge, Switch, Tooltip, Popconfirm
} from 'antd';
import {
    CarOutlined, PlusOutlined, SaveOutlined,
    FileTextOutlined, BankOutlined, DeleteOutlined,
    DashboardOutlined, EnvironmentOutlined, SwapOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient, { getImageUrl } from '@/lib/api-client';

const { Text } = Typography;
const { Option } = Select;

interface Agency { id: string; name: string; email: string; status: string; }
interface VehicleType { id: string; name: string; category: string; categoryDisplay?: string; capacity: number; image?: string; }

export default function AgencyContractsPage() {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
    const [zones, setZones] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [loadingVT, setLoadingVT] = useState(false);
    const [saving, setSaving] = useState(false);
    const [defaultCurrency, setDefaultCurrency] = useState<string>('TRY');
    const [currencies, setCurrencies] = useState<any[]>([]);

    const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
    const [selectedVT, setSelectedVT] = useState<VehicleType | null>(null);

    const [form] = Form.useForm();

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
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
                    if (st.definitions?.currencies) {
                        setCurrencies(st.definitions.currencies);
                        const defCur = st.definitions.currencies.find((c: any) => c.isDefault);
                        if (defCur) setDefaultCurrency(defCur.code);
                    }
                }
            } catch {
                message.error('Veriler yüklenemedi');
            } finally { setLoading(false); }
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

            let rawPrices: any[] = [];
            if (contractsRes.status === 'fulfilled' && contractsRes.value.data?.success) {
                rawPrices = contractsRes.value.data.data
                    .filter((c: any) => c.vehicleTypeId === vt.id)
                    .map((c: any) => ({
                        zoneId: c.zoneId,
                        baseLocation: c.baseLocation,
                        price: c.price ? Number(c.price) : undefined,
                        childPrice: c.childPrice ? Number(c.childPrice) : undefined,
                        babyPrice: c.babyPrice ? Number(c.babyPrice) : undefined,
                        fixedPrice: c.fixedPrice ? Number(c.fixedPrice) : undefined,
                        extraKmPrice: c.extraKmPrice ? Number(c.extraKmPrice) : undefined,
                        bidirectional: false,
                    }));
            }

            // Detect bidirectional pairs
            const merged: any[] = [];
            const used = new Set<number>();
            rawPrices.forEach((zp: any, i: number) => {
                if (used.has(i)) return;
                const reverseIdx = rawPrices.findIndex((r: any, j: number) =>
                    j > i && !used.has(j) &&
                    zones.find((z: any) => z.id === zp.zoneId)?.code === r.baseLocation &&
                    zones.find((z: any) => z.code === zp.baseLocation)?.id === r.zoneId
                );
                if (reverseIdx !== -1) {
                    used.add(reverseIdx);
                    merged.push({ ...zp, bidirectional: true });
                } else {
                    merged.push(zp);
                }
            });

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

            form.setFieldsValue({ ...meta, zonePrices: merged });
        } catch {
            message.error('Kontratlar yüklenemedi');
        } finally { setLoadingVT(false); }
    };

    const handleSave = async (values: any) => {
        if (!selectedAgency || !selectedVT) return;
        setSaving(true);
        try {
            // Expand bidirectional
            const expandedPrices: any[] = [];
            (values.zonePrices || []).forEach((zp: any) => {
                const { bidirectional, ...priceData } = zp;
                expandedPrices.push(priceData);
                if (bidirectional) {
                    const fromZone = zones.find((z: any) => z.code === zp.baseLocation);
                    const toZone = zones.find((z: any) => z.id === zp.zoneId);
                    if (fromZone && toZone?.code) {
                        expandedPrices.push({ ...priceData, baseLocation: toZone.code, zoneId: fromZone.id });
                    }
                }
            });

            await Promise.all([
                apiClient.post(`/api/admin/agencies/${selectedAgency.id}/contracts/${selectedVT.id}`, { zonePrices: expandedPrices }),
                apiClient.post(`/api/admin/agencies/${selectedAgency.id}/contract-meta/${selectedVT.id}`, {
                    currency: values.currency || defaultCurrency || 'TRY',
                    openingFee: values.openingFee ?? null,
                    basePricePerKm: values.basePricePerKm ?? null,
                    fixedPrice: values.fixedPrice ?? null,
                    basePricePerHour: values.basePricePerHour ?? null,
                })
            ]);
            message.success('Kontrat fiyatları kaydedildi');
        } catch (err: any) {
            message.error(err?.response?.data?.error || 'Kaydedilemedi');
        } finally { setSaving(false); }
    };

    const handleDeleteAll = async () => {
        if (!selectedAgency || !selectedVT) return;
        try {
            await apiClient.delete(`/api/admin/agencies/${selectedAgency.id}/contracts/${selectedVT.id}`);
            message.success('Bölge kontrat fiyatları silindi');
            form.setFieldsValue({ zonePrices: [] });
        } catch { message.error('Silinemedi'); }
    };

    const CAT_COLORS: Record<string, string> = {
        SEDAN: '#6366f1', VAN: '#0891b2', VIP_VAN: '#7c3aed',
        MINIBUS: '#2563eb', BUS: '#ea580c', LUXURY: '#ca8a04',
    };

    const thStyle: React.CSSProperties = {
        fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
        letterSpacing: 0.5, padding: '8px 4px', whiteSpace: 'nowrap', textAlign: 'center',
    };

    return (
        <AdminGuard>
            <AdminLayout selectedKey="agency-contracts">
                <div style={{ paddingBottom: 40 }}>

                    <div style={{ marginBottom: 24 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
                            Acenta Kontratları
                        </h1>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            Her alt acente için araç tipi ve bölge bazında özel sözleşme fiyatları tanımlayın.
                        </Text>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}><Spin size="large" /></div>
                    ) : (
                        <Row gutter={[20, 20]}>
                            {/* ── Col 1: Agencies ── */}
                            <Col xs={24} md={6} lg={5}>
                                <div style={{
                                    background: '#fff', borderRadius: 20, overflow: 'hidden',
                                    border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{
                                        padding: '16px 20px',
                                        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                                        borderBottom: '1px solid #e2e8f0',
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
                                            <BankOutlined style={{ marginRight: 6 }} />Alt Acenteler
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{agencies.length} acente</div>
                                    </div>
                                    <div style={{ padding: '8px 0' }}>
                                        {agencies.map(ag => {
                                            const isSel = selectedAgency?.id === ag.id;
                                            return (
                                                <div key={ag.id} onClick={() => handleSelectAgency(ag)}
                                                    style={{
                                                        padding: '12px 16px', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: 12,
                                                        background: isSel ? '#eef2ff08' : 'transparent',
                                                        borderLeft: isSel ? '4px solid #6366f1' : '4px solid transparent',
                                                        transition: 'all 0.15s', borderBottom: '1px solid #f8fafc',
                                                    }}
                                                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f8fafc'; }}
                                                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <div style={{
                                                        width: 36, height: 36, borderRadius: 10,
                                                        background: isSel ? '#6366f1' : '#e2e8f0',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    }}>
                                                        <BankOutlined style={{ fontSize: 15, color: isSel ? '#fff' : '#94a3b8' }} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontSize: 13, fontWeight: isSel ? 700 : 600,
                                                            color: isSel ? '#6366f1' : '#1e293b',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>{ag.name}</div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{ag.email}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Col>

                            {/* ── Col 2: Vehicle Types ── */}
                            <Col xs={24} md={5} lg={4}>
                                <div style={{
                                    background: '#fff', borderRadius: 20, overflow: 'hidden',
                                    border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    opacity: selectedAgency ? 1 : 0.5,
                                }}>
                                    <div style={{
                                        padding: '16px 20px',
                                        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                                        borderBottom: '1px solid #e2e8f0',
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Araç Tipleri</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{vehicleTypes.length} tip</div>
                                    </div>
                                    <div style={{ padding: '8px 0' }}>
                                        {!selectedAgency ? (
                                            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Önce acente seçin</div>
                                        ) : vehicleTypes.map(vt => {
                                            const isSel = selectedVT?.id === vt.id;
                                            const catColor = CAT_COLORS[vt.category] || '#6366f1';
                                            return (
                                                <div key={vt.id} onClick={() => handleSelectVT(vt)}
                                                    style={{
                                                        padding: '12px 16px', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: 12,
                                                        background: isSel ? `${catColor}08` : 'transparent',
                                                        borderLeft: isSel ? `4px solid ${catColor}` : '4px solid transparent',
                                                        transition: 'all 0.15s', borderBottom: '1px solid #f8fafc',
                                                    }}
                                                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f8fafc'; }}
                                                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <div style={{
                                                        width: 36, height: 36, borderRadius: 10, overflow: 'hidden',
                                                        background: vt.image ? 'transparent' : `${catColor}15`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    }}>
                                                        {vt.image ? (
                                                            <img src={getImageUrl(vt.image)} alt={vt.name} style={{ width: 36, height: 36, objectFit: 'cover' }} />
                                                        ) : (
                                                            <CarOutlined style={{ fontSize: 16, color: catColor }} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontSize: 13, fontWeight: isSel ? 700 : 600,
                                                            color: isSel ? catColor : '#1e293b',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>{vt.name}</div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                                            {vt.categoryDisplay || vt.category} · {vt.capacity} Yolcu
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Col>

                            {/* ── Col 3: Pricing ── */}
                            <Col xs={24} md={13} lg={15}>
                                {(selectedAgency && selectedVT) ? (
                                    <div style={{
                                        background: '#fff', borderRadius: 20, overflow: 'hidden',
                                        border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    }}>
                                        {/* Title bar */}
                                        <div style={{
                                            padding: '16px 24px',
                                            background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                                            borderBottom: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: 14,
                                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                                }}>
                                                    <FileTextOutlined style={{ fontSize: 20, color: '#fff' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>
                                                        {selectedAgency.name} · {selectedVT.name}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Kontrat Fiyatları</div>
                                                </div>
                                            </div>
                                            <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}
                                                style={{
                                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                    border: 'none', borderRadius: 10, fontWeight: 600, height: 40,
                                                    boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                                                }}>
                                                Kaydet
                                            </Button>
                                        </div>

                                        <div style={{ padding: '24px' }}>
                                            {loadingVT ? (
                                                <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
                                            ) : (
                                                <Form form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>

                                                    {/* ── BASE PRICING — COMPACT TABLE ── */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                                        <div style={{
                                                            width: 32, height: 32, borderRadius: 8,
                                                            background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <DashboardOutlined style={{ fontSize: 15, color: '#2563eb' }} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Mesafe Bazlı Formül</div>
                                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>Bölgeyle eşleşmezse uygulanacak yedek fiyatlar (opsiyonel)</div>
                                                        </div>
                                                    </div>

                                                    <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 28 }}>
                                                        <div style={{
                                                            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                                                            background: 'linear-gradient(135deg, #f8fafc, #eef2ff)',
                                                            borderBottom: '1px solid #e2e8f0',
                                                        }}>
                                                            <div style={thStyle}>Para Birimi</div>
                                                            <div style={thStyle}>Başlangıç Ücreti</div>
                                                            <div style={thStyle}>Km Başı Ücret</div>
                                                            <div style={thStyle}>Sabit Fiyat</div>
                                                            <div style={thStyle}>Saatlik Fiyat</div>
                                                        </div>
                                                        <div style={{
                                                            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                                                            padding: '8px 0', background: '#fff',
                                                        }}>
                                                            <div style={{ padding: '0 6px' }}>
                                                                <Form.Item name="currency" style={{ marginBottom: 0 }}>
                                                                    <Select placeholder={defaultCurrency || 'Seçiniz'} allowClear size="small">
                                                                        {currencies.map((c: any) => <Option key={c.code} value={c.code}>{c.symbol} {c.code}</Option>)}
                                                                    </Select>
                                                                </Form.Item>
                                                            </div>
                                                            <div style={{ padding: '0 6px' }}>
                                                                <Form.Item name="openingFee" style={{ marginBottom: 0 }}>
                                                                    <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                                                                </Form.Item>
                                                            </div>
                                                            <div style={{ padding: '0 6px' }}>
                                                                <Form.Item name="basePricePerKm" style={{ marginBottom: 0 }}>
                                                                    <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                                                                </Form.Item>
                                                            </div>
                                                            <div style={{ padding: '0 6px' }}>
                                                                <Form.Item name="fixedPrice" style={{ marginBottom: 0 }}>
                                                                    <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                                                                </Form.Item>
                                                            </div>
                                                            <div style={{ padding: '0 6px' }}>
                                                                <Form.Item name="basePricePerHour" style={{ marginBottom: 0 }}>
                                                                    <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                                                                </Form.Item>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* ── ZONE PRICING — COMPACT TABLE ── */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                                        <div style={{
                                                            width: 32, height: 32, borderRadius: 8,
                                                            background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <EnvironmentOutlined style={{ fontSize: 15, color: '#16a34a' }} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Bölge Kontrat Fiyatları</div>
                                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                                                Bölge eşleşmesinde uygulanacak özel fiyatlar · <SwapOutlined /> Çift yön ters yönde de geçerli
                                                            </div>
                                                        </div>
                                                        <Popconfirm title="Tüm bölge fiyatları silinsin mi?" onConfirm={handleDeleteAll} okText="Evet" cancelText="Hayır">
                                                            <Button danger size="small" icon={<DeleteOutlined />} style={{ borderRadius: 8, fontSize: 11 }}>
                                                                Tümünü Sil
                                                            </Button>
                                                        </Popconfirm>
                                                    </div>

                                                    <Form.List name="zonePrices">
                                                        {(fields, { add, remove }) => (
                                                            <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                                {/* Header */}
                                                                <div style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: '2fr 24px 2fr 42px 1fr 1fr 1fr 1fr 1fr 32px',
                                                                    background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                                                    borderBottom: '1px solid #e2e8f0', alignItems: 'center',
                                                                }}>
                                                                    <div style={thStyle}>Kalkış</div>
                                                                    <div style={thStyle}></div>
                                                                    <div style={thStyle}>Varış</div>
                                                                    <div style={{ ...thStyle, fontSize: 9 }}>
                                                                        <Tooltip title="Çift yön: Ters yönde de aynı fiyat">↔</Tooltip>
                                                                    </div>
                                                                    <div style={thStyle}>Fix</div>
                                                                    <div style={thStyle}>Yetişkin</div>
                                                                    <div style={thStyle}>Çocuk</div>
                                                                    <div style={thStyle}>Bebek</div>
                                                                    <div style={thStyle}>Aşım</div>
                                                                    <div style={thStyle}></div>
                                                                </div>

                                                                {fields.length === 0 && (
                                                                    <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                                                        <EnvironmentOutlined style={{ fontSize: 24, color: '#d1d5db', marginBottom: 6, display: 'block' }} />
                                                                        Henüz bölge kontrat fiyatı eklenmemiş
                                                                    </div>
                                                                )}

                                                                {fields.map(({ key, name, ...restField }) => (
                                                                    <div key={key} style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: '2fr 24px 2fr 42px 1fr 1fr 1fr 1fr 1fr 32px',
                                                                        alignItems: 'center', borderBottom: '1px solid #f1f5f9',
                                                                        padding: '4px 0', background: key % 2 === 0 ? '#fff' : '#fafbfc',
                                                                    }}>
                                                                        <div style={{ padding: '0 4px', overflow: 'hidden', minWidth: 0 }}>
                                                                            <Form.Item {...restField} name={[name, 'baseLocation']} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                                                                <Select placeholder="Kalkış" showSearch optionFilterProp="children" size="small" style={{ width: '100%' }} dropdownStyle={{ minWidth: 240 }}>
                                                                                    {zones.map((z: any) => (
                                                                                        <Option key={z.code || z.id} value={z.code || z.name}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color || '#94a3b8', flexShrink: 0 }} />
                                                                                                <span style={{ fontSize: 12 }}>{z.name}</span>
                                                                                                {z.code && <span style={{ fontSize: 10, color: '#94a3b8' }}>({z.code})</span>}
                                                                                            </div>
                                                                                        </Option>
                                                                                    ))}
                                                                                </Select>
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>→</div>
                                                                        <div style={{ padding: '0 4px', overflow: 'hidden', minWidth: 0 }}>
                                                                            <Form.Item {...restField} name={[name, 'zoneId']} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                                                                <Select placeholder="Varış" showSearch optionFilterProp="children" size="small" style={{ width: '100%' }} dropdownStyle={{ minWidth: 240 }}>
                                                                                    {zones.map((z: any) => (
                                                                                        <Option key={z.id} value={z.id}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color || '#94a3b8', flexShrink: 0 }} />
                                                                                                <span style={{ fontSize: 12 }}>{z.name}</span>
                                                                                                {z.code && <span style={{ fontSize: 10, color: '#94a3b8' }}>({z.code})</span>}
                                                                                            </div>
                                                                                        </Option>
                                                                                    ))}
                                                                                </Select>
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ textAlign: 'center' }}>
                                                                            <Form.Item {...restField} name={[name, 'bidirectional']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                                                                <Switch size="small" checkedChildren="↔" unCheckedChildren="→" />
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ padding: '0 2px' }}>
                                                                            <Form.Item {...restField} name={[name, 'fixedPrice']} style={{ marginBottom: 0 }}>
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ padding: '0 2px' }}>
                                                                            <Form.Item {...restField} name={[name, 'price']} style={{ marginBottom: 0 }}>
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ padding: '0 2px' }}>
                                                                            <Form.Item {...restField} name={[name, 'childPrice']} style={{ marginBottom: 0 }}>
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ padding: '0 2px' }}>
                                                                            <Form.Item {...restField} name={[name, 'babyPrice']} style={{ marginBottom: 0 }}>
                                                                                <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ padding: '0 2px' }}>
                                                                            <Form.Item {...restField} name={[name, 'extraKmPrice']} style={{ marginBottom: 0 }}>
                                                                                <InputNumber min={0} step={0.1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                                                            </Form.Item>
                                                                        </div>
                                                                        <div style={{ textAlign: 'center' }}>
                                                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)}
                                                                                style={{ width: 28, height: 28, padding: 0, borderRadius: 6 }} />
                                                                        </div>
                                                                    </div>
                                                                ))}

                                                                <div style={{ padding: '8px 12px', background: '#fafbfc' }}>
                                                                    <Button type="dashed" onClick={() => add({ bidirectional: true })} block icon={<PlusOutlined />} size="small"
                                                                        style={{ borderRadius: 8, fontWeight: 600, fontSize: 12, color: '#64748b', height: 36 }}>
                                                                        Yeni Güzergah Ekle
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Form.List>
                                                </Form>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        height: '100%', minHeight: 450,
                                        background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                                    }}>
                                        <div style={{
                                            width: 80, height: 80, borderRadius: 24, marginBottom: 20,
                                            background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <FileTextOutlined style={{ fontSize: 36, color: '#94a3b8' }} />
                                        </div>
                                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#475569', margin: '0 0 8px' }}>
                                            {!selectedAgency ? 'Acente Seçin' : 'Araç Tipi Seçin'}
                                        </h3>
                                        <Text type="secondary" style={{ fontSize: 13 }}>
                                            Kontrat fiyatlarını girebilmek için sol panellerden seçim yapın.
                                        </Text>
                                    </div>
                                )}
                            </Col>
                        </Row>
                    )}
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
