'use client';

import React, { useState, useEffect } from 'react';
import {
    Typography, Card, Button, Table, Tag, Space, Modal, Form,
    Input, Select, message, Spin, Row, Col, Statistic,
    Tooltip, Popconfirm, Alert, Divider, Progress, Badge
} from 'antd';
import {
    MailOutlined, MessageOutlined, PlusOutlined, SendOutlined,
    DeleteOutlined, EditOutlined, EyeOutlined, ReloadOutlined,
    TeamOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ClockCircleOutlined, RocketOutlined, FileTextOutlined,
    ThunderboltOutlined, GlobalOutlined, FilterOutlined,
    BarChartOutlined, BgColorsOutlined, AppstoreOutlined,
    ArrowRightOutlined, InfoCircleOutlined
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

const LANG_LABELS: Record<string, { flag: string; name: string }> = {
    tr: { flag: '🇹🇷', name: 'Türkçe' },
    en: { flag: '🇬🇧', name: 'English' },
    de: { flag: '🇩🇪', name: 'Deutsch' },
    ru: { flag: '🇷🇺', name: 'Русский' },
    fr: { flag: '🇫🇷', name: 'Français' },
    ar: { flag: '🇸🇦', name: 'العربية' },
    pl: { flag: '🇵🇱', name: 'Polski' },
    nl: { flag: '🇳🇱', name: 'Nederlands' },
    fi: { flag: '🇫🇮', name: 'Suomi' },
    es: { flag: '🇪🇸', name: 'Español' },
    it: { flag: '🇮🇹', name: 'Italiano' },
    pt: { flag: '🇵🇹', name: 'Português' },
    sv: { flag: '🇸🇪', name: 'Svenska' },
    no: { flag: '🇳🇴', name: 'Norsk' },
    da: { flag: '🇩🇰', name: 'Dansk' },
    cs: { flag: '🇨🇿', name: 'Čeština' },
    uk: { flag: '🇺🇦', name: 'Українська' },
};

const FALLBACK_LANGUAGES = Object.keys(LANG_LABELS).map((code) => ({ code, count: 0 }));

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

    // Language filter
    const [languages, setLanguages] = useState<{ code: string; count: number }[]>([]);
    const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
    const [langTotal, setLangTotal] = useState(0);
    const [langLoading, setLangLoading] = useState(true);
    const [langLoadError, setLangLoadError] = useState(false);
    const [selectedChannel, setSelectedChannel] = useState<string>('');

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
        fetchLanguages();
        fetchRecipientCount([]);
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
        setSelectedChannel('');
        setSelectedLocales([]);
        if (tpl) {
            campaignForm.setFieldsValue({
                name: `${tpl.name} - ${dayjs().format('DD.MM.YYYY')}`,
                channel: tpl.channel,
                templateId: tpl.id,
                subject: tpl.subject || '',
                body: tpl.body || '',
            });
            setSelectedChannel(tpl.channel || '');
        }
        setCampaignModal(true);
        setRecipientCount(null);
        fetchRecipientCount([]);
        fetchLanguages();
    };

    const fetchLanguages = async () => {
        setLangLoading(true);
        setLangLoadError(false);
        try {
            const res = await apiClient.get('/api/messaging/recipients/languages');
            if (res.data.success) {
                setLanguages(res.data.data.languages || []);
                setLangTotal(res.data.data.total || 0);
            } else {
                setLangLoadError(true);
            }
        } catch (err) {
            console.warn('[Messaging] Languages endpoint not available, using fallback');
            setLangLoadError(true);
            setLanguages(FALLBACK_LANGUAGES);
        } finally {
            setLangLoading(false);
        }
    };

    const fetchRecipientCount = async (locales: string[]) => {
        setCountLoading(true);
        try {
            const filter: any = { all: true };
            if (locales.length > 0) filter.locales = locales;
            const res = await apiClient.get('/api/messaging/recipients/count', {
                params: { filter: JSON.stringify(filter) }
            });
            if (res.data.success) setRecipientCount(res.data.count);
        } catch { /* ignore */ }
        finally { setCountLoading(false); }
    };

    const handleLocaleChange = (locales: string[]) => {
        setSelectedLocales(locales);
        fetchRecipientCount(locales);
    };

    const sendCampaign = async (values: any) => {
        setCampaignSaving(true);
        try {
            const filter: any = { all: true };
            if (selectedLocales.length > 0) filter.locales = selectedLocales;
            const payload = {
                ...values,
                recipientFilter: filter,
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

    const NAV_ITEMS = [
        { key: 'dashboard', icon: <BarChartOutlined />, label: 'Genel Bakış' },
        { key: 'new-campaign', icon: <SendOutlined />, label: 'Yeni Kampanya' },
        { key: 'templates', icon: <FileTextOutlined />, label: 'Şablonlar', badge: templates.length },
        { key: 'history', icon: <ClockCircleOutlined />, label: 'Geçmiş', badge: campaigns.length },
    ];

    // ── Dashboard Tab ──
    const DashboardTab = () => {
        const totalSent = stats?.totalSent || 0;
        const totalDelivered = stats?.totalDelivered || 0;
        const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
        const statCards = [
            { label: 'Toplam Kampanya', value: stats?.totalCampaigns || 0, icon: <RocketOutlined />, color: '#6366f1', bg: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
            { label: 'Gönderilen', value: totalSent, icon: <SendOutlined />, color: '#0ea5e9', bg: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' },
            { label: 'Teslim Edildi', value: totalDelivered, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'linear-gradient(135deg,#10b981,#34d399)' },
            { label: 'Şablon Sayısı', value: stats?.totalTemplates || 0, icon: <FileTextOutlined />, color: '#f59e0b', bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
        ];
        return (
            <div>
                {/* Stat Cards */}
                <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
                    {statCards.map((s, i) => (
                        <Col xs={12} sm={6} key={i}>
                            <div style={{
                                borderRadius: 16, padding: '20px 22px',
                                background: s.bg,
                                boxShadow: `0 4px 20px ${s.color}33`,
                                color: '#fff',
                                display: 'flex', alignItems: 'center', gap: 16,
                            }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: 'rgba(255,255,255,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 22,
                                }}>
                                    {s.icon}
                                </div>
                                <div>
                                    <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{s.value.toLocaleString()}</div>
                                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{s.label}</div>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>

                <Row gutter={16} style={{ marginBottom: 24 }}>
                    {/* Quick actions */}
                    <Col xs={24} md={10}>
                        <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0', height: '100%' }} bodyStyle={{ padding: 24 }}>
                            <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 16, color: '#374151' }}>Hızlı İşlemler</Text>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Button
                                    type="primary" block icon={<SendOutlined />} size="large"
                                    style={{ borderRadius: 10, height: 46, fontWeight: 600, background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))', border: 'none' }}
                                    onClick={() => setActiveTab('new-campaign')}
                                >
                                    Yeni Kampanya Gönder
                                </Button>
                                <Button block icon={<ThunderboltOutlined />} size="large"
                                    style={{ borderRadius: 10, height: 46, fontWeight: 500 }}
                                    onClick={() => setActiveTab('templates')}
                                >
                                    Şablonları Yönet
                                </Button>
                                {templates.filter((t: any) => t.isSystem).length === 0 && (
                                    <Button block icon={<AppstoreOutlined />} size="large"
                                        style={{ borderRadius: 10, height: 46 }}
                                        onClick={seedTemplates}
                                    >
                                        Hazır Şablonları Yükle
                                    </Button>
                                )}
                            </div>
                            {totalSent > 0 && (
                                <div style={{ marginTop: 20, padding: '12px 16px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                                    <Text style={{ fontSize: 12, color: '#166534' }}>
                                        <CheckCircleOutlined style={{ marginRight: 6 }} />
                                        Teslim oranı: <strong>{deliveryRate}%</strong> ({totalDelivered}/{totalSent} mesaj)
                                    </Text>
                                    <Progress percent={deliveryRate} size="small" showInfo={false} strokeColor="#10b981" style={{ marginTop: 6, marginBottom: 0 }} />
                                </div>
                            )}
                        </Card>
                    </Col>

                    {/* Recent campaigns */}
                    <Col xs={24} md={14}>
                        <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 0 }}
                            title={<span style={{ fontSize: 14, fontWeight: 600 }}>Son Kampanyalar</span>}
                            extra={<Button type="link" size="small" onClick={() => setActiveTab('history')} icon={<ArrowRightOutlined />}>Tümü</Button>}
                        >
                            {(stats?.recentCampaigns || []).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                                    <RocketOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                                    Henüz kampanya yok
                                </div>
                            ) : (
                                <Table
                                    dataSource={stats.recentCampaigns}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    style={{ borderRadius: '0 0 16px 16px', overflow: 'hidden' }}
                                    columns={[
                                        { title: 'Ad', dataIndex: 'name', render: (n: string) => <Text strong style={{ fontSize: 12 }}>{n}</Text> },
                                        { title: 'Kanal', dataIndex: 'channel', width: 110, render: (ch: string) => <Tag color={CHANNEL_CONFIG[ch]?.color} style={{ fontSize: 10 }}>{CHANNEL_CONFIG[ch]?.label || ch}</Tag> },
                                        { title: 'Durum', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={STATUS_CONFIG[s]?.color} style={{ fontSize: 10 }}>{STATUS_CONFIG[s]?.label}</Tag> },
                                        { title: 'Tarih', dataIndex: 'createdAt', width: 85, render: (d: string) => <Text style={{ fontSize: 11, color: '#64748b' }}>{dayjs(d).format('DD.MM.YY')}</Text> },
                                    ]}
                                />
                            )}
                        </Card>
                    </Col>
                </Row>

                {/* Language Breakdown */}
                {languages.length > 0 && (
                    <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}
                        title={<span style={{ fontSize: 14, fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 8, color: '#0284c7' }} />Müşteri Dil Dağılımı</span>}
                        extra={<Text type="secondary" style={{ fontSize: 12 }}>{langTotal} toplam müşteri</Text>}
                    >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {languages.map(lang => {
                                const info = LANG_LABELS[lang.code] || { flag: '🌐', name: lang.code.toUpperCase() };
                                const pct = langTotal > 0 ? Math.round((lang.count / langTotal) * 100) : 0;
                                return (
                                    <div key={lang.code} style={{
                                        minWidth: 130, padding: '12px 16px', borderRadius: 12,
                                        background: '#f8fafc', border: '1px solid #e2e8f0',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span style={{ fontSize: 20 }}>{info.flag}</span>
                                            <Text strong style={{ fontSize: 12 }}>{info.name}</Text>
                                        </div>
                                        <Text style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-primary)' }}>{lang.count}</Text>
                                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>müşteri</Text>
                                        <Progress percent={pct} size="small" showInfo={false} strokeColor="var(--brand-primary)" style={{ marginTop: 6, marginBottom: 0 }} />
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                )}
            </div>
        );
    };

    // ── Templates Tab ──
    const TemplatesTab = () => (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <Text strong style={{ fontSize: 15 }}>Mesaj Şablonları</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>({templates.length} şablon)</Text>
                </div>
                <Space>
                    {templates.filter((t: any) => t.isSystem).length === 0 && (
                        <Button icon={<ThunderboltOutlined />} onClick={seedTemplates}>Hazır Şablonları Yükle</Button>
                    )}
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openTemplateModal()}
                        style={{ borderRadius: 8, background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))', border: 'none' }}>
                        Yeni Şablon
                    </Button>
                </Space>
            </div>
            <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 0 }}>
                <Table
                    dataSource={templates}
                    columns={templateColumns}
                    rowKey="id"
                    pagination={{ pageSize: 10, size: 'small' }}
                    size="middle"
                    style={{ borderRadius: 16, overflow: 'hidden' }}
                />
            </Card>
        </div>
    );

    // ── New Campaign Tab ──
    const NewCampaignTab = () => (
        <Row gutter={24}>
            {/* Left: Form */}
            <Col xs={24} lg={15}>
                <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 28 }}>
                    <div style={{ marginBottom: 24 }}>
                        <Title level={5} style={{ margin: 0, color: '#1e293b' }}>
                            <SendOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} />
                            Yeni Toplu Mesaj Gönder
                        </Title>
                        <Text type="secondary" style={{ fontSize: 12 }}>Tüm alanlari doldurun ve gönder butonuna basın</Text>
                    </div>

                    <Form form={campaignForm} layout="vertical" onFinish={sendCampaign}>
                        <Row gutter={14}>
                            <Col xs={24} sm={15}>
                                <Form.Item name="name" label={<Text strong style={{ fontSize: 12 }}>Kampanya Adı</Text>} rules={[{ required: true, message: 'Zorunlu' }]}>
                                    <Input placeholder="Örn: Yılbaşı Tebrik 2026" style={{ borderRadius: 8, height: 38 }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={9}>
                                <Form.Item name="channel" label={<Text strong style={{ fontSize: 12 }}>Kanal</Text>} rules={[{ required: true, message: 'Zorunlu' }]}>
                                    <Select placeholder="Seçin" style={{ width: '100%' }} onChange={(val: string) => setSelectedChannel(val)}>
                                        <Select.Option value="EMAIL"><MailOutlined style={{ marginRight: 6, color: '#3b82f6' }} />E-posta</Select.Option>
                                        <Select.Option value="WHATSAPP"><MessageOutlined style={{ marginRight: 6, color: '#10b981' }} />WhatsApp</Select.Option>
                                        <Select.Option value="BOTH"><SendOutlined style={{ marginRight: 6, color: '#8b5cf6' }} />Her İkisi</Select.Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item name="templateId" label={<Text strong style={{ fontSize: 12 }}>Şablon <Text type="secondary">(Opsiyonel)</Text></Text>}>
                            <Select allowClear placeholder="Hazır şablon seçin veya boş bırakın"
                                onChange={(val) => {
                                    if (val) {
                                        const tpl = templates.find((t: any) => t.id === val);
                                        if (tpl) {
                                            campaignForm.setFieldsValue({ subject: tpl.subject, body: tpl.body, channel: tpl.channel });
                                            setSelectedChannel(tpl.channel || '');
                                        }
                                    }
                                }}
                            >
                                {templates.filter((t: any) => t.isActive).map((t: any) => (
                                    <Select.Option key={t.id} value={t.id}>
                                        <span style={{ marginRight: 6 }}>{CATEGORY_OPTIONS.find(c => c.value === t.category)?.icon}</span>
                                        {t.name}
                                        <Tag style={{ marginLeft: 8, fontSize: 10 }} color={CHANNEL_CONFIG[t.channel]?.color}>{CHANNEL_CONFIG[t.channel]?.label}</Tag>
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>

                        {(selectedChannel === 'EMAIL' || selectedChannel === 'BOTH') && (
                            <Form.Item name="subject" label={<Text strong style={{ fontSize: 12 }}>E-posta Konusu</Text>}
                                extra={<Text style={{ fontSize: 11 }}>{'{{name}} — müşteri adı ile değiştirilir'}</Text>}>
                                <Input placeholder="Yeni Yılınız Kutlu Olsun!" style={{ borderRadius: 8, height: 38 }} />
                            </Form.Item>
                        )}

                        <Form.Item
                            name="body"
                            label={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Text strong style={{ fontSize: 12 }}>Mesaj İçeriği</Text>
                                    <Tag style={{ fontSize: 10, margin: 0 }}>HTML destekler</Tag>
                                </div>
                            }
                            rules={[{ required: true, message: 'İçerik zorunlu' }]}
                            extra={<Text style={{ fontSize: 11, color: '#94a3b8' }}>{'Değişkenler: {{name}}, {{email}}, {{phone}}'}</Text>}
                        >
                            <TextArea rows={9} placeholder="Mesaj içeriğinizi buraya yazın..." style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }} />
                        </Form.Item>

                        <Form.Item style={{ marginBottom: 0 }}>
                            <Button
                                type="primary" htmlType="submit" icon={<SendOutlined />}
                                loading={campaignSaving} block size="large"
                                style={{
                                    height: 48, borderRadius: 12, fontWeight: 700, fontSize: 15,
                                    background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))',
                                    border: 'none', boxShadow: '0 4px 14px rgba(var(--brand-primary-rgb),0.4)',
                                }}
                            >
                                {campaignSaving ? 'Gönderiliyor...' : 'Kampanyayı Gönder'}
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            </Col>

            {/* Right: Audience & Info Panel */}
            <Col xs={24} lg={9}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Recipient Count */}
                    <div style={{
                        borderRadius: 16, padding: '20px 22px',
                        background: 'linear-gradient(135deg, #1e293b, #334155)',
                        color: '#fff',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <TeamOutlined style={{ fontSize: 18, color: '#94a3b8' }} />
                            <Text style={{ color: '#94a3b8', fontSize: 13 }}>Hedef Kitle</Text>
                            <Button size="small" icon={<ReloadOutlined />}
                                onClick={() => fetchRecipientCount(selectedLocales)}
                                style={{ marginLeft: 'auto', borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#cbd5e1', fontSize: 11 }}
                            >Yenile</Button>
                        </div>
                        {countLoading ? (
                            <Spin size="small" />
                        ) : (
                            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1 }}>
                                {recipientCount !== null ? recipientCount.toLocaleString() : '—'}
                                <span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>müşteri</span>
                            </div>
                        )}
                        {selectedLocales.length > 0 && (
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#38bdf8', fontSize: 11 }} />
                                <Text style={{ color: '#7dd3fc', fontSize: 11 }}>
                                    {selectedLocales.map(l => LANG_LABELS[l]?.flag || l).join(' ')} dil filtresi aktif
                                </Text>
                                <Button type="link" size="small" onClick={() => handleLocaleChange([])}
                                    style={{ color: '#f87171', fontSize: 11, padding: 0 }}>Temizle</Button>
                            </div>
                        )}
                    </div>

                    {/* Language Filter */}
                    <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <GlobalOutlined style={{ color: '#fff', fontSize: 13 }} />
                            </div>
                            <Text strong style={{ fontSize: 13 }}>Hedef Diller</Text>
                            <Tooltip title="Belirli dil seçerseniz, yalnızca o dilde telefon numarası ile kayıtlı müşterilere gönderilir.">
                                <InfoCircleOutlined style={{ color: '#94a3b8', fontSize: 12, marginLeft: 2 }} />
                            </Tooltip>
                        </div>

                        {langLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                                <Spin size="small" />
                                <Text type="secondary" style={{ fontSize: 12 }}>Dil verisi yükleniyor...</Text>
                            </div>
                        ) : languages.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {languages.map(lang => {
                                    const info = LANG_LABELS[lang.code] || { flag: '🌐', name: lang.code.toUpperCase() };
                                    const isSelected = selectedLocales.includes(lang.code);
                                    const pct = langTotal > 0 ? Math.round((lang.count / langTotal) * 100) : 0;
                                    return (
                                        <div key={lang.code} onClick={() => {
                                            const next = isSelected
                                                ? selectedLocales.filter(l => l !== lang.code)
                                                : [...selectedLocales, lang.code];
                                            handleLocaleChange(next);
                                        }} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                                            border: isSelected ? '1.5px solid #0284c7' : '1px solid #f1f5f9',
                                            background: isSelected ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fafafa',
                                            transition: 'all 0.15s', userSelect: 'none',
                                        }}>
                                            <span style={{ fontSize: 18 }}>{info.flag}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#1d4ed8' : '#374151' }}>{info.name}</div>
                                                <Progress percent={pct} size="small" showInfo={false}
                                                    strokeColor={isSelected ? '#3b82f6' : '#e2e8f0'}
                                                    trailColor={isSelected ? '#bfdbfe' : '#f1f5f9'}
                                                    style={{ marginBottom: 0 }} />
                                            </div>
                                            <Text style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{lang.count}</Text>
                                            {isSelected && <CheckCircleOutlined style={{ color: '#2563eb', fontSize: 13 }} />}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>Henüz dil verisi yok — tüm müşterilere gönderilecek.</Text>
                        )}

                        {langLoadError && !langLoading && (
                            <div style={{ marginTop: 10 }}>
                                <Button size="small" icon={<ReloadOutlined />} onClick={fetchLanguages} block>Tekrar Dene</Button>
                            </div>
                        )}

                        {selectedLocales.length === 0 && !langLoading && (
                            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                                <Text style={{ fontSize: 11, color: '#92400e' }}>
                                    ⚠️ Seçim yapılmazsa tüm müşterilere gönderilir
                                </Text>
                            </div>
                        )}
                    </Card>

                    {/* Variable guide */}
                    <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 16 }}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                            <BgColorsOutlined style={{ marginRight: 6, color: '#8b5cf6' }} />Kullanılabilir Değişkenler
                        </Text>
                        {[
                            { var: '{{name}}', desc: 'Müşteri adı' },
                            { var: '{{email}}', desc: 'E-posta adresi' },
                            { var: '{{phone}}', desc: 'Telefon numarası' },
                        ].map(v => (
                            <div key={v.var} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#7c3aed' }}>{v.var}</code>
                                <Text type="secondary" style={{ fontSize: 11 }}>{v.desc}</Text>
                            </div>
                        ))}
                    </Card>
                </div>
            </Col>
        </Row>
    );

    // ── History Tab ──
    const HistoryTab = () => (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <Text strong style={{ fontSize: 15 }}>Kampanya Geçmişi</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>({campaigns.length} kampanya)</Text>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchAll} style={{ borderRadius: 8 }}>Yenile</Button>
            </div>
            <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} bodyStyle={{ padding: 0 }}>
                <Table
                    dataSource={campaigns}
                    columns={campaignColumns}
                    rowKey="id"
                    pagination={{ pageSize: 15, size: 'small' }}
                    size="middle"
                    style={{ borderRadius: 16, overflow: 'hidden' }}
                />
            </Card>
        </div>
    );

    const tabContent: Record<string, React.ReactNode> = {
        'dashboard': <DashboardTab />,
        'templates': <TemplatesTab />,
        'new-campaign': <NewCampaignTab />,
        'history': <HistoryTab />,
    };

    return (
        <AdminGuard>
            <AdminLayout selectedKey="messaging">
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
                        <div style={{
                            position: 'absolute', right: -60, top: -60,
                            width: 200, height: 200, borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
                        }} />
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                <div style={{
                                    width: 42, height: 42, borderRadius: 12,
                                    background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 14px rgba(var(--brand-primary-rgb),0.5)',
                                }}>
                                    <SendOutlined style={{ color: '#fff', fontSize: 18 }} />
                                </div>
                                <Title level={3} style={{ margin: 0, color: '#fff', fontWeight: 800 }}>
                                    Toplu Mesajlaşma
                                </Title>
                            </div>
                            <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                E-posta ve WhatsApp ile müşterilerinize dil bazlı toplu kampanyalar gönderin
                            </Text>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={fetchAll}
                                style={{ borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#cbd5e1' }}>
                                Yenile
                            </Button>
                            <Button type="primary" icon={<SendOutlined />}
                                onClick={() => setActiveTab('new-campaign')}
                                style={{ borderRadius: 8, fontWeight: 600, height: 36, background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))', border: 'none' }}>
                                Yeni Kampanya
                            </Button>
                        </Space>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
                    ) : (
                        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                            {/* ── Sidebar Navigation ── */}
                            <div style={{ width: 200, flexShrink: 0 }}>
                                <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }} bodyStyle={{ padding: 8 }}>
                                    {NAV_ITEMS.map(item => {
                                        const active = activeTab === item.key;
                                        return (
                                            <div key={item.key} onClick={() => setActiveTab(item.key)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                                    marginBottom: 2,
                                                    background: active ? 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))' : 'transparent',
                                                    color: active ? '#fff' : '#64748b',
                                                    fontWeight: active ? 600 : 400,
                                                    fontSize: 13,
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <span style={{ fontSize: 14, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                                                <span style={{ flex: 1 }}>{item.label}</span>
                                                {item.badge !== undefined && item.badge > 0 && (
                                                    <span style={{
                                                        background: active ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                                                        color: active ? '#fff' : '#64748b',
                                                        borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700,
                                                        minWidth: 18, textAlign: 'center',
                                                    }}>
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </Card>
                            </div>

                            {/* ── Content ── */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {tabContent[activeTab]}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Template Create/Edit Modal ── */}
                <Modal
                    open={templateModal}
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileTextOutlined style={{ color: '#fff', fontSize: 14 }} />
                            </div>
                            {editingTemplate ? 'Şablon Düzenle' : 'Yeni Şablon Oluştur'}
                        </div>
                    }
                    onCancel={() => setTemplateModal(false)}
                    footer={null}
                    width={700}
                    destroyOnClose
                    styles={{ body: { paddingTop: 8 } }}
                >
                    <Form form={templateForm} layout="vertical" onFinish={saveTemplate}>
                        <Row gutter={14}>
                            <Col xs={24} sm={12}>
                                <Form.Item name="name" label="Şablon Adı" rules={[{ required: true }]}>
                                    <Input placeholder="Yılbaşı Tebrik" style={{ borderRadius: 8 }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={6}>
                                <Form.Item name="category" label="Kategori" initialValue="custom">
                                    <Select>
                                        {CATEGORY_OPTIONS.map(c => (
                                            <Select.Option key={c.value} value={c.value}>{c.icon} {c.label}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={6}>
                                <Form.Item name="channel" label="Kanal" rules={[{ required: true }]}>
                                    <Select placeholder="Seçin">
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
                            <TextArea rows={12} style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }} placeholder="<div>Mesaj içeriği...</div>" />
                        </Form.Item>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <Button onClick={() => setTemplateModal(false)}>İptal</Button>
                            <Button type="primary" htmlType="submit" loading={templateSaving}
                                style={{ background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-accent))', border: 'none' }}>
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
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: previewModal.html }} />
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
                                    {[
                                        { label: 'Gönderilen', value: c.totalSent, color: '#0ea5e9', icon: <SendOutlined /> },
                                        { label: 'Teslim', value: c.totalDelivered, color: '#10b981', icon: <CheckCircleOutlined /> },
                                        { label: 'Başarısız', value: c.totalFailed, color: '#ef4444', icon: <CloseCircleOutlined /> },
                                    ].map((s, i) => (
                                        <Col span={6} key={i}>
                                            <div style={{ textAlign: 'center', padding: '12px 0', borderRadius: 10, background: '#f8fafc' }}>
                                                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
                                            </div>
                                        </Col>
                                    ))}
                                    <Col span={6}>
                                        <div style={{ textAlign: 'center', padding: '12px 0', borderRadius: 10, background: '#f8fafc' }}>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: successRate >= 80 ? '#10b981' : '#f59e0b' }}>{successRate}%</div>
                                            <Text type="secondary" style={{ fontSize: 11 }}>Başarı Oranı</Text>
                                        </div>
                                    </Col>
                                </Row>
                                <Progress percent={successRate} size="small" strokeColor={successRate >= 80 ? '#10b981' : '#f59e0b'}
                                    style={{ marginBottom: 20 }} />
                                <Divider style={{ margin: '12px 0' }} />
                                <Text strong style={{ fontSize: 13 }}>Gönderim Logları ({c.logs?.length || 0})</Text>
                                <Table
                                    dataSource={c.logs || []}
                                    rowKey="id"
                                    size="small"
                                    pagination={{ pageSize: 10, size: 'small' }}
                                    style={{ marginTop: 12 }}
                                    columns={[
                                        { title: 'Alıcı', dataIndex: 'recipientName', render: (n: string, r: any) => <span>{n || '—'} <Text type="secondary" style={{ fontSize: 11 }}>({r.recipient})</Text></span> },
                                        { title: 'Kanal', dataIndex: 'channel', width: 100, render: (ch: string) => <Tag color={CHANNEL_CONFIG[ch]?.color} style={{ fontSize: 10 }}>{CHANNEL_CONFIG[ch]?.label}</Tag> },
                                        { title: 'Durum', dataIndex: 'status', width: 90, render: (s: string) => { const clr: Record<string, string> = { PENDING: 'default', SENT: 'success', DELIVERED: 'success', FAILED: 'error', OPENED: 'blue' }; return <Tag color={clr[s] || 'default'} style={{ fontSize: 10 }}>{s}</Tag>; } },
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
