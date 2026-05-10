'use client';

import React, { useState, useEffect } from 'react';
import {
    Typography, Card, Button, Table, Tag, Space, Tabs, Modal, Form,
    Input, Select, Radio, message, Spin, Row, Col, Statistic, Badge,
    Tooltip, Popconfirm, Alert, Divider, Progress
} from 'antd';
import {
    MailOutlined, MessageOutlined, PlusOutlined, SendOutlined,
    DeleteOutlined, EditOutlined, EyeOutlined, ReloadOutlined,
    TeamOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ClockCircleOutlined, RocketOutlined, FileTextOutlined,
    ThunderboltOutlined, GiftOutlined, CalendarOutlined,
    BellOutlined, CopyOutlined
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── Channel colors/labels ─────────────────────────────────────────────────
const CHANNEL_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    EMAIL: { color: 'blue', icon: <MailOutlined />, label: 'E-posta' },
    WHATSAPP: { color: 'green', icon: <MessageOutlined />, label: 'WhatsApp' },
    BOTH: { color: 'purple', icon: <SendOutlined />, label: 'E-posta + WhatsApp' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    DRAFT: { color: 'default', label: 'Taslak' },
    SCHEDULED: { color: 'processing', label: 'Planlandı' },
    SENDING: { color: 'warning', label: 'Gönderiliyor' },
    SENT: { color: 'success', label: 'Gönderildi' },
    FAILED: { color: 'error', label: 'Başarısız' },
    CANCELLED: { color: 'default', label: 'İptal' },
};

const CATEGORY_OPTIONS = [
    { value: 'holiday', label: 'Bayram / Kutlama', icon: '🎉' },
    { value: 'seasonal', label: 'Sezon', icon: '☀️' },
    { value: 'promotional', label: 'Promosyon', icon: '🎁' },
    { value: 'notification', label: 'Bildirim', icon: '🔔' },
    { value: 'custom', label: 'Özel', icon: '✏️' },
];

export default function MessagingPage() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [templates, setTemplates] = useState<any[]>([]);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Template modal
    const [templateModal, setTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<any>(null);
    const [templateForm] = Form.useForm();
    const [templateSaving, setTemplateSaving] = useState(false);

    // Campaign modal
    const [campaignModal, setCampaignModal] = useState(false);
    const [campaignForm] = Form.useForm();
    const [campaignSaving, setCampaignSaving] = useState(false);
    const [recipientCount, setRecipientCount] = useState<number | null>(null);
    const [countLoading, setCountLoading] = useState(false);

    // Preview modal
    const [previewModal, setPreviewModal] = useState<{ visible: boolean; html: string; title: string }>({
        visible: false, html: '', title: ''
    });

    // Detail modal
    const [detailModal, setDetailModal] = useState<{ visible: boolean; campaign: any }>({
        visible: false, campaign: null
    });

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [tRes, cRes, sRes] = await Promise.all([
                apiClient.get('/api/messaging/templates'),
                apiClient.get('/api/messaging/campaigns'),
                apiClient.get('/api/messaging/stats'),
            ]);
            if (tRes.data.success) setTemplates(tRes.data.data || []);
            if (cRes.data.success) setCampaigns(cRes.data.data || []);
            if (sRes.data.success) setStats(sRes.data.data || null);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // ── Seed default templates ──
    const seedTemplates = async () => {
        try {
            const res = await apiClient.post('/api/messaging/templates/seed');
            if (res.data.success) {
                message.success(res.data.message || 'Şablonlar oluşturuldu');
                fetchAll();
            }
        } catch { message.error('Şablon oluşturma hatası'); }
    };

    // ── Template CRUD ──
    const openTemplateModal = (tpl?: any) => {
        setEditingTemplate(tpl || null);
        templateForm.resetFields();
        if (tpl) {
            templateForm.setFieldsValue({
                name: tpl.name,
                category: tpl.category,
                channel: tpl.channel,
                subject: tpl.subject,
                body: tpl.body,
            });
        }
        setTemplateModal(true);
    };

    const saveTemplate = async (values: any) => {
        setTemplateSaving(true);
        try {
            if (editingTemplate) {
                await apiClient.put(`/api/messaging/templates/${editingTemplate.id}`, values);
                message.success('Şablon güncellendi');
            } else {
                await apiClient.post('/api/messaging/templates', values);
                message.success('Şablon oluşturuldu');
            }
            setTemplateModal(false);
            fetchAll();
        } catch { message.error('Kaydetme hatası'); }
        finally { setTemplateSaving(false); }
    };

    const deleteTemplate = async (id: string) => {
        try {
            await apiClient.delete(`/api/messaging/templates/${id}`);
            message.success('Şablon silindi');
            fetchAll();
        } catch { message.error('Silme hatası'); }
    };

    // ── Campaign ──
    const openCampaignModal = (tpl?: any) => {
        campaignForm.resetFields();
        if (tpl) {
            campaignForm.setFieldsValue({
                name: `${tpl.name} - ${dayjs().format('DD.MM.YYYY')}`,
                channel: tpl.channel,
                templateId: tpl.id,
                subject: tpl.subject || '',
                body: tpl.body || '',
            });
        }
        setCampaignModal(true);
        setRecipientCount(null);
        fetchRecipientCount();
    };

    const fetchRecipientCount = async () => {
        setCountLoading(true);
        try {
            const res = await apiClient.get('/api/messaging/recipients/count', {
                params: { filter: JSON.stringify({ all: true }) }
            });
            if (res.data.success) setRecipientCount(res.data.count);
        } catch { /* ignore */ }
        finally { setCountLoading(false); }
    };

    const sendCampaign = async (values: any) => {
        setCampaignSaving(true);
        try {
            const payload = {
                ...values,
                recipientFilter: { all: true },
                sendNow: true,
            };
            const res = await apiClient.post('/api/messaging/campaigns', payload);
            if (res.data.success) {
                message.success('Kampanya gönderimi başlatıldı! Mesajlar arka planda gönderilecek.');
                setCampaignModal(false);
                fetchAll();
            } else {
                message.error(res.data.error || 'Hata');
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Kampanya oluşturma hatası');
        } finally { setCampaignSaving(false); }
    };

    const deleteCampaign = async (id: string) => {
        try {
            await apiClient.delete(`/api/messaging/campaigns/${id}`);
            message.success('Kampanya silindi');
            fetchAll();
        } catch { message.error('Silme hatası'); }
    };

    const viewCampaignDetail = async (id: string) => {
        try {
            const res = await apiClient.get(`/api/messaging/campaigns/${id}`);
            if (res.data.success) {
                setDetailModal({ visible: true, campaign: res.data.data });
            }
        } catch { message.error('Detay yüklenemedi'); }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // RENDER
    // ──────────────────────────────────────────────────────────────────────────

    const templateColumns = [
        {
            title: 'Şablon',
            dataIndex: 'name',
            render: (name: string, r: any) => (
                <div>
                    <Text strong>{name}</Text>
                    {r.isSystem && <Tag color="geekblue" style={{ marginLeft: 8, fontSize: 10, borderRadius: 4 }}>Sistem</Tag>}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {CATEGORY_OPTIONS.find(c => c.value === r.category)?.icon} {CATEGORY_OPTIONS.find(c => c.value === r.category)?.label || r.category}
                    </div>
                </div>
            )
        },
        {
            title: 'Kanal',
            dataIndex: 'channel',
            width: 140,
            render: (ch: string) => {
                const c = CHANNEL_CONFIG[ch];
                return c ? <Tag icon={c.icon} color={c.color}>{c.label}</Tag> : ch;
            }
        },
        {
            title: 'Tarih',
            dataIndex: 'createdAt',
            width: 120,
            render: (d: string) => dayjs(d).format('DD.MM.YYYY')
        },
        {
            title: 'İşlem',
            width: 200,
            render: (_: any, r: any) => (
                <Space size="small">
                    <Tooltip title="Önizleme">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewModal({ visible: true, html: r.body, title: r.name })} />
                    </Tooltip>
                    <Tooltip title="Kampanya Oluştur">
                        <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => openCampaignModal(r)} />
                    </Tooltip>
                    {!r.isSystem && (
                        <>
                            <Tooltip title="Düzenle">
                                <Button size="small" icon={<EditOutlined />} onClick={() => openTemplateModal(r)} />
                            </Tooltip>
                            <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteTemplate(r.id)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </>
                    )}
                </Space>
            )
        }
    ];

    const campaignColumns = [
        {
            title: 'Kampanya',
            dataIndex: 'name',
            render: (name: string, r: any) => (
                <div>
                    <Text strong>{name}</Text>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {r.template?.name || '—'}
                    </div>
                </div>
            )
        },
        {
            title: 'Kanal',
            dataIndex: 'channel',
            width: 140,
            render: (ch: string) => {
                const c = CHANNEL_CONFIG[ch];
                return c ? <Tag icon={c.icon} color={c.color}>{c.label}</Tag> : ch;
            }
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            width: 120,
            render: (s: string) => {
                const cfg = STATUS_CONFIG[s];
                return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : s;
            }
        },
        {
            title: 'Gönderim',
            width: 100,
            render: (_: any, r: any) => (
                <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#16a34a' }}>{r.totalSent || 0}</span>
                    {r.totalFailed > 0 && <span style={{ color: '#dc2626', marginLeft: 4 }}>/ {r.totalFailed} hata</span>}
                </div>
            )
        },
        {
            title: 'Tarih',
            dataIndex: 'createdAt',
            width: 130,
            render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm')
        },
        {
            title: 'İşlem',
            width: 120,
            render: (_: any, r: any) => (
                <Space size="small">
                    <Tooltip title="Detay">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => viewCampaignDetail(r.id)} />
                    </Tooltip>
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteCampaign(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // ── Dashboard Tab ──
    const DashboardTab = () => (
        <div>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <Statistic
                            title={<Text type="secondary" style={{ fontSize: 12 }}>Toplam Kampanya</Text>}
                            value={stats?.totalCampaigns || 0}
                            prefix={<RocketOutlined style={{ color: '#6366f1' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <Statistic
                            title={<Text type="secondary" style={{ fontSize: 12 }}>Gönderilen</Text>}
                            value={stats?.totalSent || 0}
                            prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <Statistic
                            title={<Text type="secondary" style={{ fontSize: 12 }}>Başarısız</Text>}
                            value={stats?.totalFailed || 0}
                            prefix={<CloseCircleOutlined style={{ color: '#dc2626' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <Statistic
                            title={<Text type="secondary" style={{ fontSize: 12 }}>Şablon Sayısı</Text>}
                            value={stats?.totalTemplates || 0}
                            prefix={<FileTextOutlined style={{ color: '#f59e0b' }} />}
                        />
                    </Card>
                </Col>
            </Row>

            {stats?.recentCampaigns?.length > 0 && (
                <Card title="Son Kampanyalar" size="small" style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <Table
                        dataSource={stats.recentCampaigns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        columns={[
                            { title: 'Ad', dataIndex: 'name' },
                            { title: 'Kanal', dataIndex: 'channel', render: (ch: string) => CHANNEL_CONFIG[ch]?.label || ch },
                            { title: 'Durum', dataIndex: 'status', render: (s: string) => <Tag color={STATUS_CONFIG[s]?.color}>{STATUS_CONFIG[s]?.label}</Tag> },
                            { title: 'Gönderim', dataIndex: 'totalSent' },
                            { title: 'Tarih', dataIndex: 'createdAt', render: (d: string) => dayjs(d).format('DD.MM.YY HH:mm') },
                        ]}
                    />
                </Card>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Space>
                    <Button type="primary" icon={<SendOutlined />} size="large" onClick={() => setActiveTab('new-campaign')}
                        style={{ borderRadius: 10, height: 48, fontWeight: 600 }}>
                        Yeni Kampanya Oluştur
                    </Button>
                    <Button icon={<FileTextOutlined />} size="large" onClick={() => setActiveTab('templates')}
                        style={{ borderRadius: 10, height: 48 }}>
                        Şablonları Yönet
                    </Button>
                </Space>
            </div>
        </div>
    );

    // ── Templates Tab ──
    const TemplatesTab = () => (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text strong style={{ fontSize: 15 }}>Mesaj Şablonları ({templates.length})</Text>
                <Space>
                    {templates.filter(t => t.isSystem).length === 0 && (
                        <Button icon={<ThunderboltOutlined />} onClick={seedTemplates}>
                            Hazır Şablonları Yükle
                        </Button>
                    )}
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openTemplateModal()}>
                        Yeni Şablon
                    </Button>
                </Space>
            </div>

            <Table
                dataSource={templates}
                columns={templateColumns}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                size="middle"
                style={{ borderRadius: 10, overflow: 'hidden' }}
            />
        </div>
    );

    // ── New Campaign Tab (quick send) ──
    const NewCampaignTab = () => (
        <div>
            <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0', maxWidth: 800, margin: '0 auto' }}>
                <Title level={5} style={{ marginTop: 0 }}>
                    <SendOutlined style={{ marginRight: 8, color: '#6366f1' }} />
                    Yeni Toplu Mesaj Gönder
                </Title>
                <Alert
                    type="info"
                    showIcon
                    message="Mesajınız tüm müşterilerinize gönderilecektir. Lütfen göndermeden önce içeriği kontrol edin."
                    style={{ borderRadius: 8, marginBottom: 20 }}
                />

                <Form form={campaignForm} layout="vertical" onFinish={sendCampaign}>
                    <Row gutter={16}>
                        <Col xs={24} sm={16}>
                            <Form.Item name="name" label="Kampanya Adı" rules={[{ required: true, message: 'Zorunlu' }]}>
                                <Input placeholder="Örn: Yılbaşı Tebrik 2026" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Form.Item name="channel" label="Kanal" rules={[{ required: true, message: 'Zorunlu' }]}>
                                <Select placeholder="Seçin" style={{ borderRadius: 8 }}>
                                    <Select.Option value="EMAIL"><MailOutlined /> E-posta</Select.Option>
                                    <Select.Option value="WHATSAPP"><MessageOutlined /> WhatsApp</Select.Option>
                                    <Select.Option value="BOTH"><SendOutlined /> Her İkisi</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="templateId" label="Şablon (Opsiyonel)">
                        <Select allowClear placeholder="Hazır şablon seçin" style={{ borderRadius: 8 }}
                            onChange={(val) => {
                                if (val) {
                                    const tpl = templates.find(t => t.id === val);
                                    if (tpl) {
                                        campaignForm.setFieldsValue({ subject: tpl.subject, body: tpl.body, channel: tpl.channel });
                                    }
                                }
                            }}
                        >
                            {templates.filter(t => t.isActive).map(t => (
                                <Select.Option key={t.id} value={t.id}>
                                    {CATEGORY_OPTIONS.find(c => c.value === t.category)?.icon} {t.name}
                                    <Tag style={{ marginLeft: 8, fontSize: 10 }} color={CHANNEL_CONFIG[t.channel]?.color}>{CHANNEL_CONFIG[t.channel]?.label}</Tag>
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="subject" label="E-posta Konusu" extra="{{name}} — müşteri adı ile değiştirilir">
                        <Input placeholder="Yeni Yılınız Kutlu Olsun!" style={{ borderRadius: 8 }} />
                    </Form.Item>

                    <Form.Item name="body" label="Mesaj İçeriği (HTML destekler)" rules={[{ required: true, message: 'İçerik zorunlu' }]}
                        extra="Değişkenler: {{name}}, {{email}}, {{phone}}">
                        <TextArea rows={10} placeholder="Mesaj içeriğinizi buraya yazın..." style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }} />
                    </Form.Item>

                    <Divider />

                    <div style={{
                        background: '#f8fafc', borderRadius: 10, padding: '14px 16px',
                        border: '1px solid #e2e8f0', marginBottom: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <div>
                            <TeamOutlined style={{ marginRight: 8, color: '#6366f1' }} />
                            <Text strong>Alıcılar: </Text>
                            {countLoading ? <Spin size="small" /> : (
                                <Text style={{ color: '#16a34a', fontWeight: 700, fontSize: 16 }}>
                                    {recipientCount !== null ? recipientCount : '—'} müşteri
                                </Text>
                            )}
                        </div>
                        <Button size="small" icon={<ReloadOutlined />} onClick={fetchRecipientCount}>Yenile</Button>
                    </div>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SendOutlined />}
                            loading={campaignSaving}
                            block
                            size="large"
                            style={{
                                height: 50, borderRadius: 12, fontWeight: 700, fontSize: 16,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none',
                            }}
                        >
                            Kampanyayı Gönder
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );

    // ── History Tab ──
    const HistoryTab = () => (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text strong style={{ fontSize: 15 }}>Kampanya Geçmişi ({campaigns.length})</Text>
                <Button icon={<ReloadOutlined />} onClick={fetchAll}>Yenile</Button>
            </div>
            <Table
                dataSource={campaigns}
                columns={campaignColumns}
                rowKey="id"
                pagination={{ pageSize: 15 }}
                size="middle"
            />
        </div>
    );

    return (
        <AdminGuard>
            <AdminLayout selectedKey="messaging">
                <div style={{ paddingBottom: 40 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div>
                            <Title level={2} style={{ margin: 0, color: '#1e293b' }}>
                                <SendOutlined style={{ marginRight: 12, color: '#6366f1' }} />
                                Toplu Mesajlaşma
                            </Title>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                E-posta ve WhatsApp ile müşterilerinize toplu mesaj gönderin
                            </Text>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={fetchAll}>Yenile</Button>
                            <Button type="primary" icon={<SendOutlined />} onClick={() => setActiveTab('new-campaign')}
                                style={{ borderRadius: 8, fontWeight: 600 }}>
                                Yeni Kampanya
                            </Button>
                        </Space>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                    ) : (
                        <Tabs
                            activeKey={activeTab}
                            onChange={setActiveTab}
                            type="card"
                            items={[
                                {
                                    key: 'dashboard',
                                    label: <span><RocketOutlined /> Dashboard</span>,
                                    children: <DashboardTab />
                                },
                                {
                                    key: 'templates',
                                    label: <span><FileTextOutlined /> Şablonlar ({templates.length})</span>,
                                    children: <TemplatesTab />
                                },
                                {
                                    key: 'new-campaign',
                                    label: <span><SendOutlined /> Yeni Kampanya</span>,
                                    children: <NewCampaignTab />
                                },
                                {
                                    key: 'history',
                                    label: <span><ClockCircleOutlined /> Geçmiş ({campaigns.length})</span>,
                                    children: <HistoryTab />
                                },
                            ]}
                        />
                    )}
                </div>

                {/* ── Template Create/Edit Modal ── */}
                <Modal
                    open={templateModal}
                    title={editingTemplate ? 'Şablon Düzenle' : 'Yeni Şablon Oluştur'}
                    onCancel={() => setTemplateModal(false)}
                    footer={null}
                    width={700}
                    destroyOnClose
                >
                    <Form form={templateForm} layout="vertical" onFinish={saveTemplate}>
                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item name="name" label="Şablon Adı" rules={[{ required: true }]}>
                                    <Input placeholder="Yılbaşı Tebrik" style={{ borderRadius: 8 }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={6}>
                                <Form.Item name="category" label="Kategori" initialValue="custom">
                                    <Select style={{ borderRadius: 8 }}>
                                        {CATEGORY_OPTIONS.map(c => (
                                            <Select.Option key={c.value} value={c.value}>{c.icon} {c.label}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={6}>
                                <Form.Item name="channel" label="Kanal" rules={[{ required: true }]}>
                                    <Select placeholder="Seçin" style={{ borderRadius: 8 }}>
                                        <Select.Option value="EMAIL">E-posta</Select.Option>
                                        <Select.Option value="WHATSAPP">WhatsApp</Select.Option>
                                        <Select.Option value="BOTH">Her İkisi</Select.Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item name="subject" label="E-posta Konusu">
                            <Input placeholder="Konu satırı" style={{ borderRadius: 8 }} />
                        </Form.Item>

                        <Form.Item name="body" label="İçerik (HTML)" rules={[{ required: true }]}>
                            <TextArea rows={12} style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                placeholder="<div>Mesaj içeriği...</div>" />
                        </Form.Item>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <Button onClick={() => setTemplateModal(false)}>İptal</Button>
                            <Button type="primary" htmlType="submit" loading={templateSaving}>
                                {editingTemplate ? 'Güncelle' : 'Oluştur'}
                            </Button>
                        </div>
                    </Form>
                </Modal>

                {/* ── Preview Modal ── */}
                <Modal
                    open={previewModal.visible}
                    title={`Önizleme: ${previewModal.title}`}
                    onCancel={() => setPreviewModal({ visible: false, html: '', title: '' })}
                    footer={null}
                    width={650}
                >
                    <div
                        style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: previewModal.html }}
                    />
                </Modal>

                {/* ── Campaign Detail Modal ── */}
                <Modal
                    open={detailModal.visible}
                    title="Kampanya Detayı"
                    onCancel={() => setDetailModal({ visible: false, campaign: null })}
                    footer={null}
                    width={800}
                >
                    {detailModal.campaign && (() => {
                        const c = detailModal.campaign;
                        const successRate = c.totalSent > 0 ? Math.round((c.totalDelivered / c.totalSent) * 100) : 0;
                        return (
                            <div>
                                <Row gutter={16} style={{ marginBottom: 20 }}>
                                    <Col span={6}>
                                        <Statistic title="Gönderilen" value={c.totalSent} prefix={<SendOutlined />} />
                                    </Col>
                                    <Col span={6}>
                                        <Statistic title="Teslim" value={c.totalDelivered} valueStyle={{ color: '#16a34a' }} prefix={<CheckCircleOutlined />} />
                                    </Col>
                                    <Col span={6}>
                                        <Statistic title="Başarısız" value={c.totalFailed} valueStyle={{ color: '#dc2626' }} prefix={<CloseCircleOutlined />} />
                                    </Col>
                                    <Col span={6}>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Başarı Oranı</Text>
                                        <Progress percent={successRate} size="small" status={successRate >= 80 ? 'success' : successRate >= 50 ? 'normal' : 'exception'} />
                                    </Col>
                                </Row>

                                <Divider />

                                <Text strong>Gönderim Logları ({c.logs?.length || 0})</Text>
                                <Table
                                    dataSource={c.logs || []}
                                    rowKey="id"
                                    size="small"
                                    pagination={{ pageSize: 10 }}
                                    style={{ marginTop: 12 }}
                                    columns={[
                                        { title: 'Alıcı', dataIndex: 'recipientName', render: (n: string, r: any) => <span>{n || '—'} <Text type="secondary" style={{ fontSize: 11 }}>({r.recipient})</Text></span> },
                                        { title: 'Kanal', dataIndex: 'channel', render: (ch: string) => <Tag color={CHANNEL_CONFIG[ch]?.color}>{CHANNEL_CONFIG[ch]?.label}</Tag> },
                                        {
                                            title: 'Durum', dataIndex: 'status', render: (s: string) => {
                                                const colors: Record<string, string> = { PENDING: 'default', SENT: 'success', DELIVERED: 'success', FAILED: 'error', OPENED: 'blue' };
                                                return <Tag color={colors[s] || 'default'}>{s}</Tag>;
                                            }
                                        },
                                        { title: 'Hata', dataIndex: 'errorMessage', render: (e: string) => e ? <Text type="danger" style={{ fontSize: 11 }}>{e}</Text> : '—' },
                                    ]}
                                />
                            </div>
                        );
                    })()}
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
}
