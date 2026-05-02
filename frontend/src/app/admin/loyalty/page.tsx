'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Card, Row, Col, Typography, Space, Button, Switch, InputNumber, Form,
    Table, Tag, Avatar, message, Divider, Modal, Input, Statistic, Tooltip, Empty
} from 'antd';
import {
    GiftOutlined, TrophyOutlined, EditOutlined, SaveOutlined,
    ReloadOutlined, UserOutlined, PlusOutlined, MinusOutlined
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import api from '@/lib/api-client';

const { Title, Text } = Typography;

interface Tier {
    name: string;
    minPoints: number;
    discountPercent: number;
    color: string;
    icon: string;
}

interface LoyaltySettings {
    enabled: boolean;
    pointsPerUnit: number;
    redeemRate: number;
    maxRedeemPercent: number;
    tiers: Tier[];
}

interface Member {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    avatar?: string;
    totalPoints: number;
    tier: Tier;
}

const DEFAULT_TIERS: Tier[] = [
    { name: 'Bronz',  minPoints: 0,    discountPercent: 0,  color: '#CD7F32', icon: '🥉' },
    { name: 'Gümüş',  minPoints: 500,  discountPercent: 3,  color: '#C0C0C0', icon: '🥈' },
    { name: 'Altın',  minPoints: 2000, discountPercent: 5,  color: '#FFD700', icon: '🥇' },
    { name: 'Platin', minPoints: 5000, discountPercent: 10, color: '#E5E4E2', icon: '💎' },
];

export default function LoyaltyPage() {
    const [settings, setSettings] = useState<LoyaltySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const [members, setMembers] = useState<Member[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersTotal, setMembersTotal] = useState(0);

    const [adjustModal, setAdjustModal] = useState(false);
    const [adjustUser, setAdjustUser] = useState<Member | null>(null);
    const [adjustPoints, setAdjustPoints] = useState(0);
    const [adjustDesc, setAdjustDesc] = useState('');
    const [adjustSaving, setAdjustSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/campaigns/loyalty/settings');
            if (res.data.success) {
                setSettings(res.data.data);
                form.setFieldsValue({
                    enabled: res.data.data.enabled,
                    pointsPerUnit: res.data.data.pointsPerUnit,
                    redeemRate: res.data.data.redeemRate,
                    maxRedeemPercent: res.data.data.maxRedeemPercent,
                });
            }
        } catch (e: any) {
            message.error('Ayarlar alınamadı');
        } finally {
            setLoading(false);
        }
    }, [form]);

    const fetchMembers = useCallback(async () => {
        setMembersLoading(true);
        try {
            const res = await api.get('/api/campaigns/loyalty/members');
            if (res.data.success) {
                setMembers(res.data.data.items);
                setMembersTotal(res.data.data.total);
            }
        } catch { /* silent */ }
        finally { setMembersLoading(false); }
    }, []);

    useEffect(() => { fetchSettings(); fetchMembers(); }, [fetchSettings, fetchMembers]);

    const handleSaveSettings = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const payload = {
                enabled: values.enabled,
                pointsPerUnit: values.pointsPerUnit,
                redeemRate: values.redeemRate,
                maxRedeemPercent: values.maxRedeemPercent,
                tiers: settings?.tiers || DEFAULT_TIERS,
            };
            const res = await api.put('/api/campaigns/loyalty/settings', payload);
            if (res.data.success) {
                setSettings(res.data.data);
                message.success('Sadakat ayarları güncellendi');
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Hata');
        } finally {
            setSaving(false);
        }
    };

    const handleTierChange = (index: number, field: string, value: any) => {
        if (!settings) return;
        const newTiers = [...settings.tiers];
        (newTiers[index] as any)[field] = value;
        setSettings({ ...settings, tiers: newTiers });
    };

    const addTier = () => {
        if (!settings) return;
        const last = settings.tiers[settings.tiers.length - 1];
        setSettings({
            ...settings,
            tiers: [...settings.tiers, {
                name: 'Yeni Seviye',
                minPoints: (last?.minPoints || 0) + 1000,
                discountPercent: (last?.discountPercent || 0) + 5,
                color: '#667eea',
                icon: '⭐'
            }]
        });
    };

    const removeTier = (index: number) => {
        if (!settings || settings.tiers.length <= 1) return;
        const newTiers = settings.tiers.filter((_, i) => i !== index);
        setSettings({ ...settings, tiers: newTiers });
    };

    const handleAdjust = async () => {
        if (!adjustUser || !adjustPoints) return;
        setAdjustSaving(true);
        try {
            await api.post('/api/campaigns/loyalty/adjust', {
                userId: adjustUser.id,
                points: adjustPoints,
                description: adjustDesc || undefined,
            });
            message.success('Puan düzeltmesi yapıldı');
            setAdjustModal(false);
            setAdjustPoints(0);
            setAdjustDesc('');
            fetchMembers();
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Hata');
        } finally {
            setAdjustSaving(false);
        }
    };

    const memberColumns = [
        {
            title: 'Üye',
            key: 'user',
            render: (_: any, r: Member) => (
                <Space>
                    <Avatar icon={<UserOutlined />} src={r.avatar} style={{ background: r.tier?.color || '#4f46e5' }} />
                    <div>
                        <Text strong>{r.fullName}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
                    </div>
                </Space>
            )
        },
        {
            title: 'Seviye',
            key: 'tier',
            render: (_: any, r: Member) => (
                <Tag style={{ background: r.tier?.color || '#CD7F32', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                    {r.tier?.icon || ''} {r.tier?.name || 'Bronz'}
                </Tag>
            )
        },
        {
            title: 'Toplam Puan',
            dataIndex: 'totalPoints',
            key: 'points',
            sorter: (a: Member, b: Member) => a.totalPoints - b.totalPoints,
            render: (p: number) => <Text strong style={{ color: '#4f46e5' }}>{p.toLocaleString('tr-TR')}</Text>
        },
        {
            title: 'Seviye İndirimi',
            key: 'discount',
            render: (_: any, r: Member) => (
                <Tag color="green">%{r.tier?.discountPercent || 0}</Tag>
            )
        },
        {
            title: 'İşlem',
            key: 'action',
            width: 100,
            render: (_: any, r: Member) => (
                <Tooltip title="Puan Düzenle">
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setAdjustUser(r); setAdjustModal(true); }} />
                </Tooltip>
            )
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="loyalty">
                <div style={{ padding: 24 }}>
                    <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
                        <Col>
                            <Title level={3} style={{ margin: 0 }}>
                                <TrophyOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
                                Sadakat Programı
                            </Title>
                        </Col>
                        <Col>
                            <Space>
                                <Button icon={<ReloadOutlined />} onClick={() => { fetchSettings(); fetchMembers(); }}>Yenile</Button>
                                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveSettings}
                                    style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
                                    Ayarları Kaydet
                                </Button>
                            </Space>
                        </Col>
                    </Row>

                    <Row gutter={[24, 24]}>
                        {/* Settings */}
                        <Col xs={24} lg={10}>
                            <Card title="Program Ayarları" loading={loading}>
                                <Form form={form} layout="vertical">
                                    <Form.Item name="enabled" label="Sadakat Programı" valuePropName="checked">
                                        <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
                                    </Form.Item>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item name="pointsPerUnit" label="Puan / 1 TL Harcama" tooltip="Her 1 TL harcamada kazanılacak puan">
                                                <InputNumber min={1} max={100} style={{ width: '100%' }} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="redeemRate" label="Puan → İndirim Oranı" tooltip="Kaç puan = 1 TL indirim">
                                                <InputNumber min={1} max={10000} style={{ width: '100%' }} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Form.Item name="maxRedeemPercent" label="Max İndirim Oranı (%)" tooltip="Sipariş tutarının en fazla yüzde kaçı puanla ödenebilir">
                                        <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="%" />
                                    </Form.Item>
                                </Form>

                                <Divider>Seviyeler (Tier)</Divider>
                                {settings?.tiers?.map((tier, idx) => (
                                    <Card key={idx} size="small" style={{ marginBottom: 12, borderLeft: `4px solid ${tier.color}` }}
                                        styles={{ body: { padding: '12px 16px' } }}>
                                        <Row gutter={8} align="middle">
                                            <Col span={1}>
                                                <Text style={{ fontSize: 18 }}>{tier.icon}</Text>
                                            </Col>
                                            <Col span={7}>
                                                <Input size="small" value={tier.name}
                                                    onChange={e => handleTierChange(idx, 'name', e.target.value)}
                                                    placeholder="Seviye adı" />
                                            </Col>
                                            <Col span={6}>
                                                <InputNumber size="small" style={{ width: '100%' }} value={tier.minPoints}
                                                    onChange={v => handleTierChange(idx, 'minPoints', v || 0)}
                                                    addonAfter="puan" min={0} />
                                            </Col>
                                            <Col span={5}>
                                                <InputNumber size="small" style={{ width: '100%' }} value={tier.discountPercent}
                                                    onChange={v => handleTierChange(idx, 'discountPercent', v || 0)}
                                                    addonAfter="%" min={0} max={50} />
                                            </Col>
                                            <Col span={3}>
                                                <Input size="small" type="color" value={tier.color} style={{ width: 40, height: 24, padding: 0 }}
                                                    onChange={e => handleTierChange(idx, 'color', e.target.value)} />
                                            </Col>
                                            <Col span={2}>
                                                {settings.tiers.length > 1 && (
                                                    <Button size="small" danger icon={<MinusOutlined />} onClick={() => removeTier(idx)} />
                                                )}
                                            </Col>
                                        </Row>
                                    </Card>
                                ))}
                                <Button type="dashed" icon={<PlusOutlined />} block onClick={addTier}>Seviye Ekle</Button>
                            </Card>
                        </Col>

                        {/* Members */}
                        <Col xs={24} lg={14}>
                            <Card title={`Sadakat Üyeleri (${membersTotal})`} loading={membersLoading}>
                                {members.length > 0 ? (
                                    <Table
                                        dataSource={members}
                                        columns={memberColumns}
                                        rowKey="id"
                                        pagination={{ pageSize: 20, showTotal: (t) => `${t} üye` }}
                                        size="small"
                                        scroll={{ x: 700 }}
                                    />
                                ) : (
                                    <Empty description="Henüz sadakat üyesi yok. Müşteriler rezervasyon yaptıkça otomatik puan kazanacak." />
                                )}
                            </Card>
                        </Col>
                    </Row>

                    {/* Adjust Points Modal */}
                    <Modal
                        title={`Puan Düzenle — ${adjustUser?.fullName || ''}`}
                        open={adjustModal}
                        onCancel={() => { setAdjustModal(false); setAdjustPoints(0); setAdjustDesc(''); }}
                        onOk={handleAdjust}
                        confirmLoading={adjustSaving}
                        okText="Uygula"
                        cancelText="İptal"
                    >
                        {adjustUser && (
                            <div style={{ marginBottom: 16 }}>
                                <Statistic title="Mevcut Puan" value={adjustUser.totalPoints} />
                            </div>
                        )}
                        <Form layout="vertical">
                            <Form.Item label="Eklenecek / Düşülecek Puan" tooltip="Negatif değer puan düşer">
                                <InputNumber value={adjustPoints} onChange={v => setAdjustPoints(v || 0)} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item label="Açıklama">
                                <Input value={adjustDesc} onChange={e => setAdjustDesc(e.target.value)} placeholder="Opsiyonel açıklama" />
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
