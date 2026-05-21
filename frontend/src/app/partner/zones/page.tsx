'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Card, Table, Button, Modal, Form, InputNumber, Select, Input, message,
    Tag, Tooltip, Popconfirm, Space, Tabs, Empty, Spin, Typography
} from 'antd';
import {
    EnvironmentOutlined, DollarOutlined, SaveOutlined, DeleteOutlined,
    PlusOutlined, ReloadOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import { useDefinitions } from '@/app/hooks/useDefinitions';

const { Text } = Typography;

interface AllowedZone {
    id: string;
    zoneId: string;
    baseLocation: string;
    isActive: boolean;
    maxPriceCap: string | number | null;
    notes: string | null;
    zone: { id: string; name: string; code: string | null; isAirport: boolean; color: string | null };
}

interface ZonePrice {
    id: string;
    vehicleTypeId: string;
    zoneId: string;
    baseLocation: string;
    price: string | number;
    childPrice: string | number | null;
    babyPrice: string | number | null;
    fixedPrice: string | number | null;
    extraKmPrice: string | number | null;
    currency: string;
    isActive: boolean;
    zone: { id: string; name: string; code: string | null };
    vehicleType: { id: string; name: string; category: string };
}

interface VehicleType {
    id: string;
    name: string;
    category: string;
    capacity: number;
}

const PartnerZonesPage: React.FC = () => {
    const { currencies: defCurrencies } = useDefinitions();
    const [loading, setLoading] = useState(true);
    const [allowedZones, setAllowedZones] = useState<AllowedZone[]>([]);
    const [zonePrices, setZonePrices] = useState<ZonePrice[]>([]);
    const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<ZonePrice | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm();

    const loadAll = async () => {
        setLoading(true);
        try {
            const [allowedRes, pricesRes, vtRes] = await Promise.all([
                apiClient.get('/api/transfer/partner/allowed-zones'),
                apiClient.get('/api/transfer/partner/zone-prices'),
                apiClient.get('/api/vehicle-types').catch(() => ({ data: { success: false } }))
            ]);
            if (allowedRes.data.success) setAllowedZones(allowedRes.data.data || []);
            if (pricesRes.data.success) setZonePrices(pricesRes.data.data || []);
            if (vtRes.data.success) setVehicleTypes(vtRes.data.data || []);
        } catch (e: any) {
            message.error('Veriler alınamadı: ' + (e?.response?.data?.error || e.message));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

    // Map (vehicleTypeId, zoneId, baseLocation) -> price row for quick lookup in matrix
    const priceMap = useMemo(() => {
        const m = new Map<string, ZonePrice>();
        zonePrices.forEach(p => {
            m.set(`${p.vehicleTypeId}|${p.zoneId}|${p.baseLocation}`, p);
        });
        return m;
    }, [zonePrices]);

    const openCreate = (allowed: AllowedZone, vehicleTypeId?: string) => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({
            zoneId: allowed.zoneId,
            baseLocation: allowed.baseLocation,
            vehicleTypeId,
            currency: 'EUR',
            isActive: true,
        });
        setModalOpen(true);
    };

    const openEdit = (row: ZonePrice) => {
        setEditing(row);
        form.setFieldsValue({
            zoneId: row.zoneId,
            baseLocation: row.baseLocation,
            vehicleTypeId: row.vehicleTypeId,
            price: Number(row.price),
            childPrice: row.childPrice != null ? Number(row.childPrice) : null,
            babyPrice: row.babyPrice != null ? Number(row.babyPrice) : null,
            fixedPrice: row.fixedPrice != null ? Number(row.fixedPrice) : null,
            extraKmPrice: row.extraKmPrice != null ? Number(row.extraKmPrice) : null,
            currency: row.currency,
            isActive: row.isActive,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const res = await apiClient.post('/api/transfer/partner/zone-prices', values);
            if (res.data.success) {
                message.success(editing ? 'Fiyat güncellendi' : 'Fiyat kaydedildi');
                setModalOpen(false);
                loadAll();
            }
        } catch (e: any) {
            if (e?.errorFields) return; // validation
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/transfer/partner/zone-prices/${id}`);
            message.success('Fiyat silindi');
            loadAll();
        } catch (e: any) {
            message.error('Silinemedi: ' + (e?.response?.data?.error || e.message));
        }
    };

    // ── Matrix view: rows = allowed zones, cols = vehicle types ──
    const matrixColumns = useMemo(() => {
        const cols: any[] = [
            {
                title: 'BÖLGE',
                key: 'zone',
                fixed: 'left' as const,
                width: 220,
                render: (_: any, row: AllowedZone) => (
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{row.zone.name}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                            {row.zone.code && (
                                <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 10 }}>{row.zone.code}</Tag>
                            )}
                            <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>📍 {row.baseLocation}</Tag>
                            {row.maxPriceCap != null && (
                                <Tooltip title={`Bu bölge için admin tarafından belirlenmiş üst sınır`}>
                                    <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>Max: {row.maxPriceCap}</Tag>
                                </Tooltip>
                            )}
                            {!row.isActive && <Tag color="red" style={{ margin: 0, fontSize: 10 }}>Pasif</Tag>}
                        </div>
                        {row.notes && (
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>📝 {row.notes}</div>
                        )}
                    </div>
                )
            },
            ...vehicleTypes.map(vt => ({
                title: (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{vt.name}</div>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>{vt.category} · {vt.capacity}p</div>
                    </div>
                ),
                key: vt.id,
                width: 140,
                align: 'center' as const,
                render: (_: any, row: AllowedZone) => {
                    const p = priceMap.get(`${vt.id}|${row.zoneId}|${row.baseLocation}`);
                    if (!p) {
                        return (
                            <Button
                                type="dashed" size="small" icon={<PlusOutlined />}
                                onClick={() => openCreate(row, vt.id)}
                                disabled={!row.isActive}
                            >
                                Fiyat
                            </Button>
                        );
                    }
                    const display = p.fixedPrice != null ? `${p.fixedPrice} (sabit)` : `${p.price}`;
                    return (
                        <div
                            onClick={() => openEdit(p)}
                            style={{
                                cursor: 'pointer',
                                padding: '6px 10px',
                                borderRadius: 8,
                                background: p.isActive ? '#f0fdf4' : '#fef2f2',
                                border: `1px solid ${p.isActive ? '#bbf7d0' : '#fecaca'}`,
                                display: 'inline-block',
                                minWidth: 80
                            }}
                            title="Düzenlemek için tıklayın"
                        >
                            <div style={{ fontWeight: 800, fontSize: 13, color: p.isActive ? '#15803d' : '#b91c1c' }}>
                                {display} <span style={{ fontSize: 10, fontWeight: 600 }}>{p.currency}</span>
                            </div>
                            {(p.childPrice != null || p.babyPrice != null) && (
                                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                                    {p.childPrice != null && `Ç:${p.childPrice}`}
                                    {p.babyPrice != null && ` B:${p.babyPrice}`}
                                </div>
                            )}
                        </div>
                    );
                }
            }))
        ];
        return cols;
    }, [vehicleTypes, priceMap]);

    return (
        <div className="partner-page">
                    <div className="ps-page-header">
                        <div>
                            <h1 className="ps-page-header__title">
                                <EnvironmentOutlined style={{ color: '#10b981', marginRight: 8 }} />
                                Bölgelerim & Fiyatlarım
                            </h1>
                            <p className="ps-page-header__subtitle">
                                Yetkili olduğunuz bölgelerde araç tipi bazlı fiyatlandırma matrisi
                            </p>
                        </div>
                        <Button icon={<ReloadOutlined />} onClick={loadAll}>Yenile</Button>
                    </div>

                    {/* Info banner */}
                    <Card size="small" style={{ marginBottom: 16, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <Space align="start">
                            <InfoCircleOutlined style={{ color: '#2563eb', fontSize: 16, marginTop: 2 }} />
                            <div style={{ fontSize: 13, color: '#1e40af' }}>
                                <strong>Nasıl kullanılır?</strong> Aşağıdaki matristeki bir hücreye tıklayarak ilgili bölge + araç tipi için fiyat girişi yapabilirsiniz.
                                Boş hücreler henüz fiyat verilmemiş kombinasyonları gösterir. Admin tarafından "Max" değeri belirlenmiş bölgelerde bu sınırı aşamazsınız.
                            </div>
                        </Space>
                    </Card>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                    ) : allowedZones.length === 0 ? (
                        <Card>
                            <Empty
                                description={
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Henüz size atanmış bölge yok</div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            Sistem yöneticisi size çalışma izni verdiği bölgeleri buradan göreceksiniz.
                                        </Text>
                                    </div>
                                }
                            />
                        </Card>
                    ) : vehicleTypes.length === 0 ? (
                        <Card>
                            <Empty description="Henüz tanımlı araç tipi yok. Yönetici araç tipi tanımlaması yapmalı." />
                        </Card>
                    ) : (
                        <Card bodyStyle={{ padding: 0 }}>
                            <Table
                                rowKey="id"
                                dataSource={allowedZones}
                                columns={matrixColumns}
                                pagination={false}
                                scroll={{ x: 'max-content' }}
                                size="small"
                            />
                        </Card>
                    )}

                    {/* ── Price Editor Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <DollarOutlined style={{ color: '#10b981' }} />
                                <span>{editing ? 'Fiyat Düzenle' : 'Yeni Fiyat Gir'}</span>
                            </div>
                        }
                        open={modalOpen}
                        onCancel={() => setModalOpen(false)}
                        onOk={handleSubmit}
                        confirmLoading={submitting}
                        okText={editing ? 'Güncelle' : 'Kaydet'}
                        cancelText="İptal"
                        width={620}
                        footer={[
                            editing && (
                                <Popconfirm
                                    key="del"
                                    title="Bu fiyatı silmek istediğinize emin misiniz?"
                                    onConfirm={async () => { await handleDelete(editing.id); setModalOpen(false); }}
                                >
                                    <Button danger icon={<DeleteOutlined />}>Sil</Button>
                                </Popconfirm>
                            ),
                            <Button key="cancel" onClick={() => setModalOpen(false)}>İptal</Button>,
                            <Button key="ok" type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
                                {editing ? 'Güncelle' : 'Kaydet'}
                            </Button>
                        ].filter(Boolean) as any}
                    >
                        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Form.Item name="zoneId" label="Bölge" rules={[{ required: true }]}>
                                    <Select disabled={!!editing} placeholder="Bölge seç">
                                        {allowedZones.map(az => (
                                            <Select.Option key={`${az.zoneId}|${az.baseLocation}`} value={az.zoneId}>
                                                {az.zone.name} ({az.zone.code || '-'}) @ {az.baseLocation}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                                <Form.Item name="baseLocation" label="Hub / Havalimanı" rules={[{ required: true }]}>
                                    <Select disabled={!!editing}>
                                        <Select.Option value="AYT">AYT</Select.Option>
                                        <Select.Option value="GZP">GZP</Select.Option>
                                        <Select.Option value="DAL">DAL</Select.Option>
                                    </Select>
                                </Form.Item>
                            </div>

                            <Form.Item name="vehicleTypeId" label="Araç Tipi" rules={[{ required: true }]}>
                                <Select disabled={!!editing} placeholder="Araç tipi seç">
                                    {vehicleTypes.map(vt => (
                                        <Select.Option key={vt.id} value={vt.id}>
                                            {vt.name} — {vt.category} · {vt.capacity} pax
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <Form.Item
                                    name="price"
                                    label={<span>Yetişkin Fiyat <Tooltip title="Kişi başı yetişkin fiyatı"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>}
                                    rules={[{ required: true, message: 'Fiyat zorunludur' }]}
                                >
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0.00" />
                                </Form.Item>
                                <Form.Item name="childPrice" label="Çocuk Fiyat">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="opsiyonel" />
                                </Form.Item>
                                <Form.Item name="babyPrice" label="Bebek Fiyat">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="opsiyonel" />
                                </Form.Item>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <Form.Item
                                    name="fixedPrice"
                                    label={<span>Sabit Fiyat <Tooltip title="Doluysa kişi başı fiyatı geçersiz kılar — tüm araç için tek fiyat"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></span>}
                                >
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="opsiyonel" />
                                </Form.Item>
                                <Form.Item name="extraKmPrice" label="Ekstra KM Fiyatı">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="opsiyonel" />
                                </Form.Item>
                                <Form.Item name="currency" label="Para Birimi" initialValue="EUR">
                                    <Select>
                                        {defCurrencies.map(c => (
                                            <Select.Option key={c.code} value={c.code}>
                                                {c.symbol} {c.code}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </div>

                            <Form.Item name="isActive" label="Durum" initialValue={true}>
                                <Select>
                                    <Select.Option value={true}>Aktif</Select.Option>
                                    <Select.Option value={false}>Pasif</Select.Option>
                                </Select>
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
    );
};

export default PartnerZonesPage;
