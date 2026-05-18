'use client';

import React, { useEffect, useState } from 'react';
import {
    Modal, Table, Button, Select, InputNumber, Input, Form, Tag, message,
    Popconfirm, Tabs, Empty, Spin, Space, Typography, Tooltip, Switch
} from 'antd';
import {
    EnvironmentOutlined, PlusOutlined, DeleteOutlined, DollarOutlined,
    InfoCircleOutlined, ReloadOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

const { Text } = Typography;

interface PartnerZonesAdminModalProps {
    open: boolean;
    partner: { id: string; fullName: string; email: string } | null;
    onClose: () => void;
}

interface ZoneOption { id: string; name: string; code: string | null; isAirport: boolean; }
interface AllowedZoneRow {
    id: string;
    zoneId: string;
    baseLocation: string;
    isActive: boolean;
    maxPriceCap: string | number | null;
    notes: string | null;
    zone: ZoneOption;
}
interface PartnerProfile {
    id: string;
    companyName: string | null;
    taxNumber: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    commissionRate: string | number | null;
    uetdsEnabled: boolean;
    uetdsYetkiBelgeNo: string | null;
    uetdsYetkiBelgeTuru: string | null;
    uetdsHasPassword?: boolean;
}

const PartnerZonesAdminModal: React.FC<PartnerZonesAdminModalProps> = ({ open, partner, onClose }) => {
    const [tab, setTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState<PartnerProfile | null>(null);
    const [allowed, setAllowed] = useState<AllowedZoneRow[]>([]);
    const [allZones, setAllZones] = useState<ZoneOption[]>([]);
    const [prices, setPrices] = useState<any[]>([]);
    const [profileForm] = Form.useForm();
    const [zoneForm] = Form.useForm();
    const [profileSaving, setProfileSaving] = useState(false);

    const load = async () => {
        if (!partner) return;
        setLoading(true);
        try {
            const [profileRes, allowedRes, zonesRes, pricesRes] = await Promise.all([
                apiClient.get(`/api/admin/partners/${partner.id}/profile`),
                apiClient.get(`/api/admin/partners/${partner.id}/allowed-zones`),
                apiClient.get('/api/admin/zones').catch(() => apiClient.get('/api/zones').catch(() => ({ data: { success: false } }))),
                apiClient.get(`/api/admin/partners/${partner.id}/zone-prices`).catch(() => ({ data: { success: false, data: [] } }))
            ]);
            if (profileRes.data.success) {
                setProfile(profileRes.data.data.profile);
                profileForm.setFieldsValue({
                    companyName: profileRes.data.data.profile.companyName,
                    taxNumber: profileRes.data.data.profile.taxNumber,
                    taxOffice: profileRes.data.data.profile.taxOffice,
                    contactEmail: profileRes.data.data.profile.contactEmail,
                    contactPhone: profileRes.data.data.profile.contactPhone,
                    address: profileRes.data.data.profile.address,
                    commissionRate: profileRes.data.data.profile.commissionRate != null
                        ? Number(profileRes.data.data.profile.commissionRate) : null,
                    uetdsEnabled: profileRes.data.data.profile.uetdsEnabled,
                    uetdsYetkiBelgeNo: profileRes.data.data.profile.uetdsYetkiBelgeNo,
                    uetdsYetkiBelgeTuru: profileRes.data.data.profile.uetdsYetkiBelgeTuru,
                    uetdsServiceUrl: profileRes.data.data.profile.uetdsServiceUrl,
                });
            }
            if (allowedRes.data.success) setAllowed(allowedRes.data.data || []);
            if (zonesRes.data?.success) setAllZones(zonesRes.data.data || []);
            if (pricesRes.data?.success) setPrices(pricesRes.data.data || []);
        } catch (e: any) {
            message.error('Veriler alınamadı: ' + (e?.response?.data?.error || e.message));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && partner) {
            setTab('profile');
            load();
        }
    }, [open, partner]);

    const saveProfile = async () => {
        if (!partner) return;
        try {
            const values = await profileForm.validateFields();
            setProfileSaving(true);
            const res = await apiClient.put(`/api/admin/partners/${partner.id}/profile`, values);
            if (res.data.success) {
                message.success('Profil güncellendi');
                setProfile(res.data.data);
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        } finally {
            setProfileSaving(false);
        }
    };

    const assignZone = async () => {
        if (!partner) return;
        try {
            const values = await zoneForm.validateFields();
            const res = await apiClient.post(`/api/admin/partners/${partner.id}/allowed-zones`, values);
            if (res.data.success) {
                message.success('Bölge atandı');
                zoneForm.resetFields();
                load();
            }
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        }
    };

    const removeZone = async (id: string) => {
        if (!partner) return;
        try {
            await apiClient.delete(`/api/admin/partners/${partner.id}/allowed-zones/${id}`);
            message.success('Bölge kaldırıldı');
            load();
        } catch (e: any) {
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        }
    };

    const allowedColumns = [
        {
            title: 'Bölge', key: 'zone',
            render: (_: any, r: AllowedZoneRow) => (
                <div>
                    <div style={{ fontWeight: 700 }}>{r.zone.name}</div>
                    <Space size={4} style={{ marginTop: 3 }}>
                        {r.zone.code && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{r.zone.code}</Tag>}
                        <Tag color="purple" style={{ margin: 0 }}>{r.baseLocation}</Tag>
                        {r.zone.isAirport && <Tag color="blue" style={{ margin: 0 }}>✈️ Havalimanı</Tag>}
                    </Space>
                </div>
            )
        },
        {
            title: 'Max Tavan', dataIndex: 'maxPriceCap', key: 'maxPriceCap', width: 110,
            render: (v: any) => v != null ? <Tag color="orange">{v}</Tag> : <Text type="secondary">—</Text>
        },
        {
            title: 'Durum', dataIndex: 'isActive', key: 'isActive', width: 90,
            render: (v: boolean) => v
                ? <Tag color="green">Aktif</Tag>
                : <Tag color="red">Pasif</Tag>
        },
        { title: 'Not', dataIndex: 'notes', key: 'notes', ellipsis: true },
        {
            title: '', key: 'actions', width: 60, align: 'right' as const,
            render: (_: any, r: AllowedZoneRow) => (
                <Popconfirm title="Bu bölgeyi partnerden kaldıralım mı?" onConfirm={() => removeZone(r.id)}
                    okText="Kaldır" cancelText="İptal" okButtonProps={{ danger: true }}>
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
            )
        }
    ];

    const priceColumns = [
        {
            title: 'Bölge', key: 'zone',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 700 }}>{r.zone?.name}</div>
                    <Tag style={{ fontFamily: 'monospace' }}>{r.zone?.code || '-'}</Tag>
                    <Tag color="purple">{r.baseLocation}</Tag>
                </div>
            )
        },
        { title: 'Araç Tipi', dataIndex: ['vehicleType', 'name'], key: 'vt' },
        {
            title: 'Fiyat', key: 'price',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 700 }}>
                        {r.fixedPrice != null ? `${r.fixedPrice} (sabit)` : r.price} <span style={{ fontSize: 11 }}>{r.currency}</span>
                    </div>
                    {(r.childPrice != null || r.babyPrice != null) && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            {r.childPrice != null && `Ç:${r.childPrice} `}
                            {r.babyPrice != null && `B:${r.babyPrice}`}
                        </div>
                    )}
                </div>
            )
        },
        { title: 'Durum', dataIndex: 'isActive', key: 'isActive', render: (v: boolean) => v ? <Tag color="green">Aktif</Tag> : <Tag color="red">Pasif</Tag> }
    ];

    const usedZoneKeys = new Set(allowed.map(a => `${a.zoneId}|${a.baseLocation}`));

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <EnvironmentOutlined style={{ color: '#10b981' }} />
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Partner Yönetimi: {partner?.fullName}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{partner?.email}</div>
                    </div>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            width={920}
            destroyOnClose
        >
            <Tabs activeKey={tab} onChange={setTab}
                items={[
                    {
                        key: 'profile', label: '👤 Profil & Komisyon',
                        children: (
                            <Form form={profileForm} layout="vertical">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <Form.Item name="companyName" label="Şirket Adı"><Input /></Form.Item>
                                    <Form.Item name="commissionRate" label={<span>Komisyon Oranı (%) <Tooltip title="Tenant geneli oranı bu partner için override eder. Boş bırakırsanız tenant defaultu uygulanır."><InfoCircleOutlined /></Tooltip></span>}>
                                        <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} placeholder="örn 15" />
                                    </Form.Item>
                                    <Form.Item name="taxNumber" label="Vergi No"><Input /></Form.Item>
                                    <Form.Item name="taxOffice" label="Vergi Dairesi"><Input /></Form.Item>
                                    <Form.Item name="contactEmail" label="İletişim E-postası"><Input /></Form.Item>
                                    <Form.Item name="contactPhone" label="İletişim Telefonu"><Input /></Form.Item>
                                </div>
                                <Form.Item name="address" label="Adres"><Input.TextArea rows={2} /></Form.Item>

                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                                    <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 8 }}>📡 UETDS Yetkilendirmesi</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <Form.Item name="uetdsEnabled" label="UETDS Aktif" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                        <Form.Item name="uetdsYetkiBelgeTuru" label="Yetki Belge Türü">
                                            <Select allowClear>
                                                <Select.Option value="B2">B2 — Şehirlerarası</Select.Option>
                                                <Select.Option value="D2">D2 — Tarifesiz Yolcu</Select.Option>
                                                <Select.Option value="D4">D4 — Şehir İçi</Select.Option>
                                                <Select.Option value="A1">A1</Select.Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="uetdsYetkiBelgeNo" label="Yetki Belge No"><Input /></Form.Item>
                                        <Form.Item name="uetdsServiceUrl" label="Servis URL (opsiyonel)"><Input placeholder="Varsayılan kullanılır" /></Form.Item>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        UNet kullanıcı adı/şifresi partner kendi panelinden gizli şekilde girer. Burada sadece yetkilendirme yapılır.
                                    </Text>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <Button type="primary" onClick={saveProfile} loading={profileSaving}>Kaydet</Button>
                                </div>
                            </Form>
                        )
                    },
                    {
                        key: 'zones', label: `🗺️ İzinli Bölgeler (${allowed.length})`,
                        children: loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
                            <>
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                                    <Form form={zoneForm} layout="inline" onFinish={assignZone}>
                                        <Form.Item name="zoneId" rules={[{ required: true, message: 'Bölge seç' }]} style={{ minWidth: 280 }}>
                                            <Select
                                                placeholder="Bölge seç"
                                                showSearch
                                                optionFilterProp="children"
                                                style={{ minWidth: 260 }}
                                            >
                                                {allZones.map(z => (
                                                    <Select.Option key={z.id} value={z.id}>
                                                        {z.name} {z.code ? `(${z.code})` : ''} {z.isAirport ? '✈️' : ''}
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="baseLocation" initialValue="AYT">
                                            <Select style={{ width: 100 }}>
                                                <Select.Option value="AYT">AYT</Select.Option>
                                                <Select.Option value="GZP">GZP</Select.Option>
                                                <Select.Option value="DAL">DAL</Select.Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="maxPriceCap" tooltip="Partner bu fiyatı aşamaz (opsiyonel)">
                                            <InputNumber placeholder="Max tavan" min={0} style={{ width: 130 }} />
                                        </Form.Item>
                                        <Form.Item name="notes">
                                            <Input placeholder="Not (ops.)" style={{ width: 160 }} />
                                        </Form.Item>
                                        <Form.Item>
                                            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Ata</Button>
                                        </Form.Item>
                                    </Form>
                                </div>
                                {allowed.length === 0 ? (
                                    <Empty description="Henüz bölge atanmamış" />
                                ) : (
                                    <Table
                                        rowKey="id"
                                        dataSource={allowed}
                                        columns={allowedColumns}
                                        pagination={false}
                                        size="small"
                                    />
                                )}
                            </>
                        )
                    },
                    {
                        key: 'prices', label: `💰 Fiyatları (${prices.length})`,
                        children: loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
                            prices.length === 0
                                ? <Empty description="Bu partner henüz fiyat girmemiş" />
                                : <Table rowKey="id" dataSource={prices} columns={priceColumns} pagination={false} size="small" />
                        )
                    }
                ]}
            />
        </Modal>
    );
};

export default PartnerZonesAdminModal;
