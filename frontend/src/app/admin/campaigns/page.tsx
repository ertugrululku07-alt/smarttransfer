'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
    Switch, Tag, Space, Card, Typography, message, Popconfirm, Row, Col,
    Statistic, Tooltip, Badge, Descriptions, Divider, Empty
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, GiftOutlined,
    TagOutlined, ReloadOutlined, EyeOutlined, CopyOutlined,
    CheckCircleOutlined, CloseCircleOutlined, BarChartOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import api from '@/lib/api-client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface Campaign {
    id: string;
    name: string;
    description?: string;
    code: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: number;
    maxDiscount?: number;
    minOrderAmount?: number;
    startDate: string;
    endDate: string;
    usageLimit?: number;
    usageLimitPerUser?: number;
    usedCount: number;
    vehicleTypes: string[];
    isActive: boolean;
    createdAt: string;
    _count?: { usages: number };
}

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const [detailModal, setDetailModal] = useState(false);
    const [detailData, setDetailData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [stats, setStats] = useState<any>(null);

    const fetchCampaigns = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/campaigns/admin', { params: { page, pageSize: 50 } });
            if (res.data.success) {
                setCampaigns(res.data.data.items);
                setTotal(res.data.data.total);
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Kampanyalar alınamadı');
        } finally {
            setLoading(false);
        }
    }, [page]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await api.get('/api/campaigns/admin/stats/summary');
            if (res.data.success) setStats(res.data.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchCampaigns(); fetchStats(); }, [fetchCampaigns, fetchStats]);

    const openCreate = () => {
        setEditingCampaign(null);
        form.resetFields();
        form.setFieldsValue({ discountType: 'PERCENTAGE', isActive: true });
        setModalOpen(true);
    };

    const openEdit = (c: Campaign) => {
        setEditingCampaign(c);
        form.setFieldsValue({
            name: c.name,
            description: c.description,
            code: c.code,
            discountType: c.discountType,
            discountValue: Number(c.discountValue),
            maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : undefined,
            minOrderAmount: c.minOrderAmount ? Number(c.minOrderAmount) : undefined,
            dateRange: [dayjs(c.startDate), dayjs(c.endDate)],
            usageLimit: c.usageLimit,
            usageLimitPerUser: c.usageLimitPerUser,
            vehicleTypes: c.vehicleTypes,
            isActive: c.isActive,
        });
        setModalOpen(true);
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const payload = {
                name: values.name,
                description: values.description,
                code: values.code,
                discountType: values.discountType,
                discountValue: values.discountValue,
                maxDiscount: values.maxDiscount || null,
                minOrderAmount: values.minOrderAmount || null,
                startDate: values.dateRange[0].toISOString(),
                endDate: values.dateRange[1].toISOString(),
                usageLimit: values.usageLimit || null,
                usageLimitPerUser: values.usageLimitPerUser || null,
                vehicleTypes: values.vehicleTypes || [],
                isActive: values.isActive,
            };

            if (editingCampaign) {
                await api.put(`/api/campaigns/admin/${editingCampaign.id}`, payload);
                message.success('Kampanya güncellendi');
            } else {
                await api.post('/api/campaigns/admin', payload);
                message.success('Kampanya oluşturuldu');
            }
            setModalOpen(false);
            fetchCampaigns();
            fetchStats();
        } catch (e: any) {
            if (e?.response?.data?.error) message.error(e.response.data.error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/api/campaigns/admin/${id}`);
            message.success('Kampanya silindi');
            fetchCampaigns();
            fetchStats();
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Silinemedi');
        }
    };

    const openDetail = async (id: string) => {
        setDetailLoading(true);
        setDetailModal(true);
        try {
            const res = await api.get(`/api/campaigns/admin/${id}`);
            if (res.data.success) setDetailData(res.data.data);
        } catch (e: any) {
            message.error('Detay alınamadı');
        } finally {
            setDetailLoading(false);
        }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        message.success(`${code} kopyalandı`);
    };

    const columns = [
        {
            title: 'Kampanya',
            key: 'name',
            render: (_: any, r: Campaign) => (
                <div>
                    <Text strong>{r.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.description || '-'}</Text>
                </div>
            )
        },
        {
            title: 'Kupon Kodu',
            dataIndex: 'code',
            key: 'code',
            render: (code: string) => (
                <Space>
                    <Tag color="blue" style={{ fontWeight: 700, fontSize: 13, cursor: 'pointer' }} onClick={() => copyCode(code)}>
                        {code}
                    </Tag>
                    <Tooltip title="Kopyala"><CopyOutlined style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => copyCode(code)} /></Tooltip>
                </Space>
            )
        },
        {
            title: 'İndirim',
            key: 'discount',
            render: (_: any, r: Campaign) => (
                <Tag color="green" style={{ fontWeight: 600 }}>
                    {r.discountType === 'PERCENTAGE' ? `%${Number(r.discountValue)}` : `${Number(r.discountValue).toFixed(2)} ₺`}
                    {r.maxDiscount ? ` (max ${Number(r.maxDiscount).toFixed(0)}₺)` : ''}
                </Tag>
            )
        },
        {
            title: 'Geçerlilik',
            key: 'dates',
            render: (_: any, r: Campaign) => {
                const now = new Date();
                const start = new Date(r.startDate);
                const end = new Date(r.endDate);
                const active = now >= start && now <= end;
                return (
                    <div>
                        <Text style={{ fontSize: 12 }}>
                            {dayjs(r.startDate).format('DD.MM.YYYY')} - {dayjs(r.endDate).format('DD.MM.YYYY')}
                        </Text>
                        <br />
                        <Tag color={active ? 'green' : 'default'} style={{ fontSize: 11 }}>
                            {now < start ? 'Başlamadı' : now > end ? 'Süresi Doldu' : 'Aktif'}
                        </Tag>
                    </div>
                );
            }
        },
        {
            title: 'Kullanım',
            key: 'usage',
            render: (_: any, r: Campaign) => (
                <Text>
                    <strong>{r.usedCount}</strong>
                    {r.usageLimit ? ` / ${r.usageLimit}` : ' / ∞'}
                </Text>
            )
        },
        {
            title: 'Durum',
            key: 'isActive',
            render: (_: any, r: Campaign) => (
                <Badge status={r.isActive ? 'success' : 'default'} text={r.isActive ? 'Aktif' : 'Pasif'} />
            )
        },
        {
            title: 'İşlem',
            key: 'actions',
            width: 140,
            render: (_: any, r: Campaign) => (
                <Space>
                    <Tooltip title="Detay"><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)} /></Tooltip>
                    <Tooltip title="Düzenle"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
                    <Popconfirm title="Kampanyayı silmek istediğinize emin misiniz?" onConfirm={() => handleDelete(r.id)} okText="Evet" cancelText="Hayır">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="campaigns">
                <div style={{ padding: 24 }}>
                    <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
                        <Col>
                            <Title level={3} style={{ margin: 0 }}>
                                <GiftOutlined style={{ marginRight: 8 }} />
                                Kampanya Yönetimi
                            </Title>
                        </Col>
                        <Col>
                            <Space>
                                <Button icon={<ReloadOutlined />} onClick={() => { fetchCampaigns(); fetchStats(); }}>Yenile</Button>
                                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
                                    style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
                                    Yeni Kampanya
                                </Button>
                            </Space>
                        </Col>
                    </Row>

                    {/* Stats */}
                    {stats && (
                        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                            <Col xs={12} sm={6}>
                                <Card styles={{ body: { padding: 16 } }}>
                                    <Statistic title="Aktif Kampanyalar" value={stats.activeCampaigns} valueStyle={{ color: '#4f46e5' }} prefix={<GiftOutlined />} />
                                </Card>
                            </Col>
                            <Col xs={12} sm={6}>
                                <Card styles={{ body: { padding: 16 } }}>
                                    <Statistic title="Toplam Kullanım" value={stats.totalUsages} prefix={<TagOutlined />} />
                                </Card>
                            </Col>
                            <Col xs={12} sm={6}>
                                <Card styles={{ body: { padding: 16 } }}>
                                    <Statistic title="Toplam İndirim" value={Number(stats.totalDiscountGiven).toFixed(2)} suffix="₺" valueStyle={{ color: '#dc2626' }} />
                                </Card>
                            </Col>
                            <Col xs={12} sm={6}>
                                <Card styles={{ body: { padding: 16 } }}>
                                    <Statistic title="Sadakat Üyeleri" value={stats.loyaltyMemberCount} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#059669' }} />
                                </Card>
                            </Col>
                        </Row>
                    )}

                    <Card>
                        <Table
                            dataSource={campaigns}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            pagination={{
                                current: page,
                                total,
                                pageSize: 50,
                                onChange: (p) => setPage(p),
                                showTotal: (t) => `Toplam ${t} kampanya`,
                            }}
                            scroll={{ x: 900 }}
                        />
                    </Card>

                    {/* Create/Edit Modal */}
                    <Modal
                        title={editingCampaign ? 'Kampanya Düzenle' : 'Yeni Kampanya'}
                        open={modalOpen}
                        onCancel={() => setModalOpen(false)}
                        onOk={handleSave}
                        confirmLoading={saving}
                        width={680}
                        okText="Kaydet"
                        cancelText="İptal"
                    >
                        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                            <Row gutter={16}>
                                <Col span={16}>
                                    <Form.Item name="name" label="Kampanya Adı" rules={[{ required: true, message: 'Zorunlu' }]}>
                                        <Input placeholder="Yaz İndirimi 2025" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="code" label="Kupon Kodu" rules={[{ required: true, message: 'Zorunlu' }]}>
                                        <Input placeholder="SUMMER25" style={{ textTransform: 'uppercase', fontWeight: 700 }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="description" label="Açıklama">
                                <Input.TextArea rows={2} placeholder="Kampanya açıklaması (opsiyonel)" />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="discountType" label="İndirim Tipi" rules={[{ required: true }]}>
                                        <Select options={[
                                            { value: 'PERCENTAGE', label: 'Yüzde (%)' },
                                            { value: 'FIXED_AMOUNT', label: 'Sabit Tutar (₺)' },
                                        ]} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="discountValue" label="İndirim Değeri" rules={[{ required: true, message: 'Zorunlu' }]}>
                                        <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="20" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="maxDiscount" label="Maks. İndirim (₺)" tooltip="Yüzde indirimde üst limit">
                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="100" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="dateRange" label="Geçerlilik Aralığı" rules={[{ required: true, message: 'Zorunlu' }]}>
                                        <RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="minOrderAmount" label="Min. Sipariş Tutarı (₺)">
                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="50" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="usageLimit" label="Toplam Kullanım Limiti" tooltip="Boş = sınırsız">
                                        <InputNumber min={1} style={{ width: '100%' }} placeholder="100" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="usageLimitPerUser" label="Kişi Başı Limit" tooltip="Boş = sınırsız">
                                        <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="isActive" label="Aktif" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="vehicleTypes" label="Araç Tipi Kısıtlaması" tooltip="Boş bırakılırsa tüm araç tiplerine uygulanır">
                                <Select mode="tags" placeholder="Sedan, Van, VIP..." />
                            </Form.Item>
                        </Form>
                    </Modal>

                    {/* Detail Modal */}
                    <Modal
                        title="Kampanya Detay"
                        open={detailModal}
                        onCancel={() => { setDetailModal(false); setDetailData(null); }}
                        footer={null}
                        width={700}
                    >
                        {detailLoading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}><ReloadOutlined spin style={{ fontSize: 24 }} /></div>
                        ) : detailData ? (
                            <div>
                                <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
                                    <Descriptions.Item label="Ad">{detailData.name}</Descriptions.Item>
                                    <Descriptions.Item label="Kod">
                                        <Tag color="blue" style={{ fontWeight: 700 }}>{detailData.code}</Tag>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="İndirim">
                                        {detailData.discountType === 'PERCENTAGE' ? `%${Number(detailData.discountValue)}` : `${Number(detailData.discountValue).toFixed(2)} ₺`}
                                        {detailData.maxDiscount ? ` (max ${Number(detailData.maxDiscount)}₺)` : ''}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Min. Tutar">
                                        {detailData.minOrderAmount ? `${Number(detailData.minOrderAmount).toFixed(2)} ₺` : '-'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Başlangıç">{dayjs(detailData.startDate).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                                    <Descriptions.Item label="Bitiş">{dayjs(detailData.endDate).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                                    <Descriptions.Item label="Kullanım">{detailData.usedCount} / {detailData.usageLimit || '∞'}</Descriptions.Item>
                                    <Descriptions.Item label="Kişi Başı">{detailData.usageLimitPerUser || '∞'}</Descriptions.Item>
                                    <Descriptions.Item label="Toplam İndirim" span={2}>
                                        <Text strong style={{ color: '#dc2626' }}>{Number(detailData.totalDiscountGiven).toFixed(2)} ₺</Text>
                                    </Descriptions.Item>
                                </Descriptions>

                                <Divider>Son Kullanımlar</Divider>
                                {detailData.usages?.length > 0 ? (
                                    <Table
                                        dataSource={detailData.usages}
                                        rowKey="id"
                                        size="small"
                                        pagination={false}
                                        columns={[
                                            {
                                                title: 'Müşteri', key: 'user',
                                                render: (_: any, r: any) => r.user?.fullName || r.user?.email || 'Misafir'
                                            },
                                            {
                                                title: 'Rezervasyon', key: 'booking',
                                                render: (_: any, r: any) => r.booking?.bookingNumber || '-'
                                            },
                                            {
                                                title: 'İndirim', key: 'discount',
                                                render: (_: any, r: any) => `${Number(r.discount).toFixed(2)} ₺`
                                            },
                                            {
                                                title: 'Tarih', key: 'date',
                                                render: (_: any, r: any) => dayjs(r.createdAt).format('DD.MM.YYYY HH:mm')
                                            },
                                        ]}
                                    />
                                ) : (
                                    <Empty description="Henüz kullanım yok" />
                                )}
                            </div>
                        ) : null}
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
