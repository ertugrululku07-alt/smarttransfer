'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Card, Row, Col, Typography, Space, Button, Switch, InputNumber, Form,
    Table, Tag, Avatar, message, Divider, Modal, Input, Statistic, Tooltip, Empty, Progress, Badge
} from 'antd';
import {
    GiftOutlined, TrophyOutlined, EditOutlined, SaveOutlined,
    ReloadOutlined, UserOutlined, PlusOutlined, MinusOutlined,
    TeamOutlined, StarOutlined, ThunderboltOutlined, PercentageOutlined,
    CrownOutlined, CheckCircleOutlined, SettingOutlined
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
                color: 'var(--brand-primary)',
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
                    <Avatar icon={<UserOutlined />} src={r.avatar} style={{ background: r.tier?.color || 'var(--brand-accent)' }} />
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
            render: (p: number) => <Text strong style={{ color: 'var(--brand-accent)' }}>{p.toLocaleString('tr-TR')}</Text>
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

    const totalPoints = members.reduce((sum, m) => sum + (m.totalPoints || 0), 0);
    const topTierMembers = members.filter(m => m.tier?.name === (settings?.tiers?.[settings.tiers.length - 1]?.name)).length;
    const isEnabled = settings?.enabled ?? false;

    return (
        <AdminGuard>
            <AdminLayout selectedKey="loyalty">
                <div style={{ paddingBottom: 40 }}>

                    {/* ── Premium Hero Header ── */}
                    <div style={{
                        borderRadius: 20, marginBottom: 28,
                        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                        padding: '28px 32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        boxShadow: '0 8px 32px rgba(15,23,42,0.18)',
                        position: 'relative', overflow: 'hidden',
                    }}>
                        <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 70%)' }} />
                        <div style={{ position: 'absolute', left: 200, bottom: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 14px rgba(245,158,11,0.5)',
                                }}>
                                    <TrophyOutlined style={{ color: '#fff', fontSize: 20 }} />
                                </div>
                                <Title level={3} style={{ margin: 0, color: '#fff', fontWeight: 800 }}>Sadakat Programı</Title>
                                <div style={{
                                    padding: '3px 12px', borderRadius: 20,
                                    background: isEnabled ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                                    border: `1px solid ${isEnabled ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                                }}>
                                    <Text style={{ fontSize: 11, fontWeight: 600, color: isEnabled ? '#34d399' : '#f87171' }}>
                                        {isEnabled ? '● Aktif' : '● Pasif'}
                                    </Text>
                                </div>
                            </div>
                            <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                Müşterilerinizi ödüllendirin, bağlılığı artırın
                            </Text>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={() => { fetchSettings(); fetchMembers(); }}
                                style={{ borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#cbd5e1' }}>
                                Yenile
                            </Button>
                            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveSettings}
                                style={{ borderRadius: 8, fontWeight: 600, height: 36, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none' }}>
                                Ayarları Kaydet
                            </Button>
                        </Space>
                    </div>

                    {/* ── Stat Cards ── */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        {[
                            { label: 'Toplam Üye', value: membersTotal, icon: <TeamOutlined />, color: '#6366f1', bg: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
                            { label: 'Toplam Puan', value: totalPoints.toLocaleString('tr-TR'), icon: <StarOutlined />, color: '#f59e0b', bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
                            { label: 'Üst Seviye Üye', value: topTierMembers, icon: <CrownOutlined />, color: '#10b981', bg: 'linear-gradient(135deg,#10b981,#34d399)' },
                            { label: 'Seviye Sayısı', value: settings?.tiers?.length || 0, icon: <ThunderboltOutlined />, color: '#0ea5e9', bg: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' },
                        ].map((s, i) => (
                            <Col xs={12} sm={6} key={i}>
                                <div style={{
                                    borderRadius: 16, padding: '18px 20px',
                                    background: s.bg, boxShadow: `0 4px 20px ${s.color}33`,
                                    color: '#fff', display: 'flex', alignItems: 'center', gap: 14,
                                }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{s.icon}</div>
                                    <div>
                                        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
                                        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{s.label}</div>
                                    </div>
                                </div>
                            </Col>
                        ))}
                    </Row>

                    <Row gutter={[24, 24]}>
                        {/* ── Left: Settings ── */}
                        <Col xs={24} lg={10}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {/* Program Config */}
                                <Card loading={loading} style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <SettingOutlined style={{ color: '#fff', fontSize: 15 }} />
                                        </div>
                                        <Text strong style={{ fontSize: 14 }}>Program Ayarları</Text>
                                    </div>
                                    <Form form={form} layout="vertical">
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '14px 16px', borderRadius: 12,
                                            background: isEnabled ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : '#f8fafc',
                                            border: `1px solid ${isEnabled ? '#bbf7d0' : '#e2e8f0'}`,
                                            marginBottom: 20,
                                        }}>
                                            <div>
                                                <Text strong style={{ fontSize: 13 }}>Sadakat Programı</Text>
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                    {isEnabled ? 'Müşteriler puan kazanıyor' : 'Puan kazanımı kapalı'}
                                                </div>
                                            </div>
                                            <Form.Item name="enabled" valuePropName="checked" style={{ margin: 0 }}>
                                                <Switch checkedChildren="Aktif" unCheckedChildren="Pasif"
                                                    style={{ background: isEnabled ? '#10b981' : undefined }}
                                                    onChange={v => setSettings(prev => prev ? { ...prev, enabled: v } : prev)} />
                                            </Form.Item>
                                        </div>

                                        <Row gutter={12}>
                                            <Col span={12}>
                                                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                                                        <ThunderboltOutlined style={{ marginRight: 4, color: '#f59e0b' }} />
                                                        Puan / 1 TL Harcama
                                                    </div>
                                                    <Form.Item name="pointsPerUnit" style={{ margin: 0 }}>
                                                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </div>
                                            </Col>
                                            <Col span={12}>
                                                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                                                        <GiftOutlined style={{ marginRight: 4, color: '#6366f1' }} />
                                                        Puan → İndirim Oranı
                                                    </div>
                                                    <Form.Item name="redeemRate" style={{ margin: 0 }}>
                                                        <InputNumber min={1} max={10000} style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </div>
                                            </Col>
                                        </Row>

                                        <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                                                <PercentageOutlined style={{ marginRight: 4, color: '#10b981' }} />
                                                Maksimum İndirim Oranı
                                            </div>
                                            <Form.Item name="maxRedeemPercent" style={{ margin: 0 }}>
                                                <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="%" />
                                            </Form.Item>
                                        </div>
                                    </Form>
                                </Card>

                                {/* Tiers */}
                                <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <TrophyOutlined style={{ color: '#fff', fontSize: 14 }} />
                                            </div>
                                            <Text strong style={{ fontSize: 14 }}>Üyelik Seviyeleri</Text>
                                        </div>
                                        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addTier}
                                            style={{ borderRadius: 8, fontSize: 12 }}>
                                            Ekle
                                        </Button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {settings?.tiers?.map((tier, idx) => (
                                            <div key={idx} style={{
                                                borderRadius: 12, padding: '12px 14px',
                                                border: `1.5px solid ${tier.color}30`,
                                                background: `linear-gradient(135deg, ${tier.color}08, ${tier.color}15)`,
                                                position: 'relative',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                    <span style={{ fontSize: 20 }}>{tier.icon}</span>
                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Input size="small" value={tier.name}
                                                            onChange={e => handleTierChange(idx, 'name', e.target.value)}
                                                            style={{ fontWeight: 700, fontSize: 13, border: 'none', background: 'transparent', padding: '0 4px', width: 100 }} />
                                                        <div style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${tier.color}`, overflow: 'hidden' }}>
                                                            <Input type="color" value={tier.color}
                                                                onChange={e => handleTierChange(idx, 'color', e.target.value)}
                                                                style={{ width: 32, height: 32, padding: 0, border: 'none', marginTop: -4, marginLeft: -4, cursor: 'pointer' }} />
                                                        </div>
                                                    </div>
                                                    {settings.tiers.length > 1 && (
                                                        <Button size="small" type="text" danger icon={<MinusOutlined />} onClick={() => removeTier(idx)}
                                                            style={{ borderRadius: 6, padding: '0 6px' }} />
                                                    )}
                                                </div>
                                                <Row gutter={8}>
                                                    <Col span={12}>
                                                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>Min. Puan</div>
                                                        <InputNumber size="small" style={{ width: '100%' }} value={tier.minPoints}
                                                            onChange={v => handleTierChange(idx, 'minPoints', v || 0)}
                                                            min={0} placeholder="0" />
                                                    </Col>
                                                    <Col span={12}>
                                                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>İndirim %</div>
                                                        <InputNumber size="small" style={{ width: '100%' }} value={tier.discountPercent}
                                                            onChange={v => handleTierChange(idx, 'discountPercent', v || 0)}
                                                            addonAfter="%" min={0} max={50} />
                                                    </Col>
                                                </Row>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </div>
                        </Col>

                        {/* ── Right: Members ── */}
                        <Col xs={24} lg={14}>
                            <Card
                                style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}
                                bodyStyle={{ padding: 0 }}
                                loading={membersLoading}
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <TeamOutlined style={{ color: '#fff', fontSize: 14 }} />
                                        </div>
                                        <Text strong style={{ fontSize: 14 }}>Sadakat Üyeleri</Text>
                                        <Tag style={{ background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', fontWeight: 700, borderRadius: 10 }}>
                                            {membersTotal}
                                        </Tag>
                                    </div>
                                }
                            >
                                {members.length > 0 ? (
                                    <Table
                                        dataSource={members}
                                        columns={memberColumns}
                                        rowKey="id"
                                        pagination={{ pageSize: 20, showTotal: (t) => `${t} üye`, size: 'small' }}
                                        size="middle"
                                        scroll={{ x: 600 }}
                                        style={{ borderRadius: '0 0 16px 16px', overflow: 'hidden' }}
                                        rowClassName={() => 'loyalty-member-row'}
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                                        <div style={{
                                            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
                                            background: 'linear-gradient(135deg,#fef3c7,#fde68a)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <TrophyOutlined style={{ fontSize: 34, color: '#d97706' }} />
                                        </div>
                                        <Text strong style={{ fontSize: 15, display: 'block', color: '#374151' }}>
                                            Henüz sadakat üyesi yok
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6, maxWidth: 300, margin: '6px auto 0' }}>
                                            Müşteriler rezervasyon yaptıkça otomatik olarak programa katılır ve puan kazanır.
                                        </Text>
                                    </div>
                                )}
                            </Card>
                        </Col>
                    </Row>
                </div>

                {/* ── Adjust Points Modal ── */}
                <Modal
                    open={adjustModal}
                    onCancel={() => { setAdjustModal(false); setAdjustPoints(0); setAdjustDesc(''); }}
                    onOk={handleAdjust}
                    confirmLoading={adjustSaving}
                    okText="Uygula"
                    cancelText="İptal"
                    width={420}
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <EditOutlined style={{ color: '#fff', fontSize: 14 }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>Puan Düzenle</div>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{adjustUser?.fullName}</div>
                            </div>
                        </div>
                    }
                    styles={{ body: { paddingTop: 8 } }}
                >
                    {adjustUser && (
                        <div style={{
                            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20,
                            padding: '16px 20px', marginBottom: 20,
                            background: 'linear-gradient(135deg,#fef3c7,#fde68a)',
                            borderRadius: 12,
                        }}>
                            <Avatar icon={<UserOutlined />} src={adjustUser.avatar} size={48}
                                style={{ background: adjustUser.tier?.color || '#f59e0b', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                            <div>
                                <Text strong style={{ fontSize: 14 }}>{adjustUser.fullName}</Text>
                                <div style={{ marginTop: 2 }}>
                                    <span style={{ fontSize: 11, color: '#92400e' }}>Mevcut puan: </span>
                                    <span style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>{adjustUser.totalPoints.toLocaleString('tr-TR')}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <Form layout="vertical">
                        <Form.Item label={<Text strong style={{ fontSize: 12 }}>Eklenecek / Düşülecek Puan</Text>}
                            extra={<Text style={{ fontSize: 11 }}>Negatif değer girerek puan düşebilirsiniz</Text>}>
                            <InputNumber value={adjustPoints} onChange={v => setAdjustPoints(v || 0)}
                                style={{ width: '100%', height: 40 }} placeholder="Örn: 100 veya -50" />
                        </Form.Item>
                        <Form.Item label={<Text strong style={{ fontSize: 12 }}>Açıklama</Text>}>
                            <Input value={adjustDesc} onChange={e => setAdjustDesc(e.target.value)}
                                placeholder="Opsiyonel not (müşteriye görünmez)" style={{ borderRadius: 8 }} />
                        </Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
}
