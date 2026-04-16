'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import {
    Typography, Card, Tabs, Table, Button, Space, Modal, Form,
    Input, InputNumber, Switch, message, Spin, Tag, Popconfirm, Tooltip, Select
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, StarFilled,
    ClockCircleOutlined, CarOutlined, DollarOutlined, PercentageOutlined,
    InfoCircleOutlined, SaveOutlined, ThunderboltOutlined,
    MailOutlined, SendOutlined, EyeOutlined, CheckCircleOutlined,
    LockOutlined, SettingOutlined, FileTextOutlined, CopyOutlined,
    WhatsAppOutlined, ApiOutlined, PhoneOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import { invalidateDefinitions } from '@/app/hooks/useDefinitions';

const { Title, Text } = Typography;

// ── Section Header Component ──
const SectionHeader = ({ icon, title, subtitle, color }: { icon: React.ReactNode; title: string; subtitle: string; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(135deg, ${color}, ${color}dd)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, boxShadow: `0 4px 12px ${color}40`
        }}>{icon}</div>
        <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div>
        </div>
    </div>
);

// ── Stat Card ──
const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) => (
    <div style={{
        background: `linear-gradient(135deg, ${color}08, ${color}15)`,
        border: `1px solid ${color}25`, borderRadius: 12, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12, flex: 1
    }}>
        <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: color, fontSize: 16
        }}>{icon}</div>
        <div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{value}</div>
        </div>
    </div>
);

// Default voucher HTML for preview when no custom template is set
const DEFAULT_VOUCHER_PREVIEW = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:16px 16px 0 0;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Rezervasyon Onayı</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Rezervasyonunuz başarıyla oluşturulmuştur</p>
  </div>
  <div style="background:#fff;padding:20px 32px;text-align:center;border-bottom:2px dashed #e2e8f0;">
    <span style="background:#dbeafe;color:#1e40af;padding:8px 20px;border-radius:24px;font-size:15px;font-weight:700;letter-spacing:1px;">{{bookingNumber}}</span>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:1px;margin-bottom:12px;">Yolcu Bilgileri</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:130px;">Ad Soyad</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{passengerName}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">E-posta</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{passengerEmail}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Telefon</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{passengerPhone}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Yolcu Sayısı</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{totalPassengers}} kişi</td></tr>
      </table>
    </div>
    <div style="border-top:1px solid #f1f5f9;"></div>
    <div style="margin-top:24px;margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:1px;margin-bottom:12px;">Transfer Detayları</div>
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="margin-bottom:10px;"><strong style="color:#10b981;">A</strong> <span style="font-size:11px;color:#94a3b8;">Alış:</span> <span style="font-weight:600;color:#1e293b;">{{pickup}}</span></div>
        <div><strong style="color:#ef4444;">B</strong> <span style="font-size:11px;color:#94a3b8;">Varış:</span> <span style="font-weight:600;color:#1e293b;">{{dropoff}}</span></div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:130px;">Tarih</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{date}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Saat</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{time}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Araç Tipi</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{vehicleType}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Uçuş No</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{flightNumber}}</td></tr>
      </table>
    </div>
    <div style="margin-top:24px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;">
      <div style="font-size:11px;text-transform:uppercase;color:#16a34a;font-weight:600;letter-spacing:1px;">Toplam Tutar</div>
      <div style="font-size:32px;font-weight:800;color:#15803d;margin-top:4px;">{{price}} {{currency}}</div>
    </div>
  </div>
  <div style="text-align:center;padding:24px;color:#94a3b8;font-size:12px;">
    <p style="margin:0 0 4px;font-weight:600;color:#64748b;">{{companyName}}</p>
    <p style="margin:0;">{{companyPhone}} | {{companyEmail}}</p>
    <p style="margin:12px 0 0;font-size:11px;">&copy; {{year}} {{companyName}}. Tüm hakları saklıdır.</p>
  </div>
</div>
</body>
</html>`;

export default function DefinitionsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [definitions, setDefinitions] = useState<{ vatRates: any[], currencies: any[] }>({
        vatRates: [],
        currencies: []
    });
    const [timeDefinitions, setTimeDefinitions] = useState<{
        privateTransferMinHours: number;
        shuttleTransferMinHours: number;
    }>({ privateTransferMinHours: 3, shuttleTransferMinHours: 7 });
    const [timeSaving, setTimeSaving] = useState(false);

    // Email Settings
    const [emailSettings, setEmailSettings] = useState<{
        smtpHost: string; smtpPort: number; smtpSecure: boolean;
        smtpUser: string; smtpPass: string;
        senderName: string; senderEmail: string;
        voucherSubject: string; autoSendVoucher: boolean;
    }>({
        smtpHost: '', smtpPort: 587, smtpSecure: false,
        smtpUser: '', smtpPass: '',
        senderName: '', senderEmail: '',
        voucherSubject: 'Rezervasyon Onayı - {{bookingNumber}} | {{companyName}}',
        autoSendVoucher: true,
    });
    const [emailSaving, setEmailSaving] = useState(false);
    const [emailTesting, setEmailTesting] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [showSmtpPass, setShowSmtpPass] = useState(false);

    // Voucher Template
    const [voucherHtml, setVoucherHtml] = useState('');
    const [templateSaving, setTemplateSaving] = useState(false);
    const [previewVisible, setPreviewVisible] = useState(false);

    // WhatsApp Settings
    const [whatsappSettings, setWhatsappSettings] = useState<{
        enabled: boolean; provider: string;
        metaPhoneNumberId: string; metaAccessToken: string;
        greenApiInstance: string; greenApiToken: string;
        webhookUrl: string; webhookHeaders: string;
        voucherMessage: string;
    }>({
        enabled: false, provider: 'greenapi',
        metaPhoneNumberId: '', metaAccessToken: '',
        greenApiInstance: '', greenApiToken: '',
        webhookUrl: '', webhookHeaders: '',
        voucherMessage: '',
    });
    const [whatsappSaving, setWhatsappSaving] = useState(false);
    const [whatsappTesting, setWhatsappTesting] = useState(false);
    const [testPhone, setTestPhone] = useState('');

    // Modals state
    const [vatModalVisible, setVatModalVisible] = useState(false);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    const [vatForm] = Form.useForm();
    const [currencyForm] = Form.useForm();

    useEffect(() => {
        fetchDefinitions();
    }, []);

    const fetchDefinitions = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/tenant/info');
            const settings = res.data?.data?.tenant?.settings || {};
            const defs = settings.definitions || { vatRates: [], currencies: [] };
            setDefinitions(defs);
            if (settings.timeDefinitions) {
                setTimeDefinitions({
                    privateTransferMinHours: settings.timeDefinitions.privateTransferMinHours ?? 3,
                    shuttleTransferMinHours: settings.timeDefinitions.shuttleTransferMinHours ?? 7,
                });
            }
            if (settings.emailSettings) {
                setEmailSettings(prev => ({ ...prev, ...settings.emailSettings }));
            }
            if (settings.emailTemplate?.voucherHtml) {
                setVoucherHtml(settings.emailTemplate.voucherHtml);
            }
            if (settings.whatsappSettings) {
                setWhatsappSettings(prev => ({ ...prev, ...settings.whatsappSettings }));
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Tanımlamalar yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const saveDefinitions = async (newDefinitions: any) => {
        try {
            setSaving(true);
            await apiClient.put('/api/tenant/settings', {
                definitions: newDefinitions
            });
            setDefinitions(newDefinitions);
            invalidateDefinitions();
            message.success('Tanımlamalar kaydedildi.');
        } catch (error) {
            console.error('Save error:', error);
            message.error('Kaydedilirken bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const saveTimeDefinitions = async () => {
        try {
            setTimeSaving(true);
            await apiClient.put('/api/tenant/settings', {
                timeDefinitions: timeDefinitions
            });
            message.success('Zaman tanımları kaydedildi.');
        } catch (error) {
            console.error('Save error:', error);
            message.error('Kaydedilirken bir hata oluştu.');
        } finally {
            setTimeSaving(false);
        }
    };

    const saveEmailSettings = async () => {
        try {
            setEmailSaving(true);
            await apiClient.put('/api/tenant/settings', { emailSettings });
            message.success('E-posta ayarları kaydedildi');
        } catch (error) {
            console.error('Save email settings error:', error);
            message.error('E-posta ayarları kaydedilirken hata oluştu');
        } finally {
            setEmailSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmail) {
            message.warning('Test göndermek için bir e-posta adresi girin');
            return;
        }
        try {
            setEmailTesting(true);
            const res = await apiClient.post('/api/tenant/test-email', { toEmail: testEmail });
            if (res.data.success) {
                message.success(`Test e-postası ${testEmail} adresine gönderildi!`);
            } else {
                message.error(res.data.error || 'Test e-postası gönderilemedi');
            }
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Test e-postası gönderilemedi');
        } finally {
            setEmailTesting(false);
        }
    };

    const saveVoucherTemplate = async () => {
        try {
            setTemplateSaving(true);
            await apiClient.put('/api/tenant/settings', { emailTemplate: { voucherHtml: voucherHtml } });
            message.success('Voucher şablonu kaydedildi');
        } catch (error) {
            console.error('Save template error:', error);
            message.error('Şablon kaydedilirken hata oluştu');
        } finally {
            setTemplateSaving(false);
        }
    };

    const resetVoucherTemplate = () => {
        setVoucherHtml('');
        message.info('Şablon varsayılana sıfırlandı. Kaydetmeyi unutmayın.');
    };

    // Preview helper: render placeholders with sample data
    const getPreviewHtml = () => {
        const template = voucherHtml || DEFAULT_VOUCHER_PREVIEW;
        const sampleData: Record<string, string> = {
            bookingNumber: 'TR-20250416-1234',
            passengerName: 'Ahmet Yılmaz',
            passengerEmail: 'ahmet@ornek.com',
            passengerPhone: '+90 555 123 45 67',
            pickup: 'Antalya Havalimanı (AYT)',
            dropoff: 'Kemer, Pine Beach Hotel',
            date: '16.04.2025',
            time: '14:30',
            vehicleType: 'Mercedes Vito VIP',
            flightNumber: 'TK 2414',
            adults: '2',
            children: '1',
            infants: '0',
            totalPassengers: '3',
            price: '85.00',
            currency: 'EUR',
            notes: '',
            companyName: 'SmartTransfer',
            companyPhone: '+90 242 123 45 67',
            companyEmail: 'info@smarttransfer.com',
            logoUrl: '',
            status: 'CONFIRMED',
            year: String(new Date().getFullYear()),
        };
        let html = template;
        Object.entries(sampleData).forEach(([key, value]) => {
            html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        });
        return html;
    };

    const saveWhatsappSettings = async () => {
        try {
            setWhatsappSaving(true);
            await apiClient.put('/api/tenant/settings', { whatsappSettings });
            message.success('WhatsApp ayarları kaydedildi');
        } catch (error) {
            console.error('Save WhatsApp settings error:', error);
            message.error('WhatsApp ayarları kaydedilirken hata oluştu');
        } finally {
            setWhatsappSaving(false);
        }
    };

    const handleTestWhatsApp = async () => {
        if (!testPhone) {
            message.warning('Test göndermek için bir telefon numarası girin');
            return;
        }
        try {
            setWhatsappTesting(true);
            const res = await apiClient.post('/api/tenant/test-whatsapp', { toPhone: testPhone });
            if (res.data.success) {
                message.success(`Test mesajı ${testPhone} numarasına gönderildi!`);
            } else {
                message.error(res.data.error || 'Test mesajı gönderilemedi');
            }
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Test mesajı gönderilemedi');
        } finally {
            setWhatsappTesting(false);
        }
    };

    const generateId = () => Math.random().toString(36).substr(2, 9);

    // --- VAT Handlers ---
    const openVatModal = (item: any = null) => {
        setEditingItem(item);
        if (item) {
            vatForm.setFieldsValue(item);
        } else {
            vatForm.resetFields();
        }
        setVatModalVisible(true);
    };

    const handleVatSubmit = async (values: any) => {
        let newVatRates: any[] = [...(definitions.vatRates || [])];
        if (values.isDefault) {
            newVatRates = newVatRates.map((v: any) => ({ ...v, isDefault: false }));
        } else if (newVatRates.length === 0) {
            values.isDefault = true;
        }
        if (editingItem && (editingItem as any).id) {
            newVatRates = newVatRates.map((v: any) => v.id === (editingItem as any).id ? { ...v, ...values } : v);
        } else {
            newVatRates.push({ ...values, id: generateId() });
        }
        const newDefs = { ...definitions, vatRates: newVatRates };
        await saveDefinitions(newDefs);
        setVatModalVisible(false);
    };

    const deleteVat = async (id: string) => {
        const newDefs = { ...definitions, vatRates: (definitions.vatRates || []).filter((v: any) => v.id !== id) };
        await saveDefinitions(newDefs);
    };

    const setVatDefault = async (id: string) => {
        const newVatRates = (definitions.vatRates || []).map((v: any) => ({ ...v, isDefault: v.id === id }));
        await saveDefinitions({ ...definitions, vatRates: newVatRates });
    };

    // --- Currency Handlers ---
    const openCurrencyModal = (item: any = null) => {
        setEditingItem(item);
        if (item) {
            currencyForm.setFieldsValue(item);
        } else {
            currencyForm.resetFields();
        }
        setCurrencyModalVisible(true);
    };

    const handleCurrencySubmit = async (values: any) => {
        let newCurrencies: any[] = [...(definitions.currencies || [])];
        if (values.isDefault) {
            newCurrencies = newCurrencies.map((c: any) => ({ ...c, isDefault: false }));
        } else if (newCurrencies.length === 0) {
            values.isDefault = true;
        }
        if (editingItem && (editingItem as any).id) {
            newCurrencies = newCurrencies.map((c: any) => c.id === (editingItem as any).id ? { ...c, ...values } : c);
        } else {
            newCurrencies.push({ ...values, id: generateId() });
        }
        const newDefs = { ...definitions, currencies: newCurrencies };
        await saveDefinitions(newDefs);
        setCurrencyModalVisible(false);
    };

    const deleteCurrency = async (id: string) => {
        const newDefs = { ...definitions, currencies: definitions.currencies.filter(c => c.id !== id) };
        await saveDefinitions(newDefs);
    };

    const setCurrencyDefault = async (id: string) => {
        const newCurrencies = definitions.currencies.map((c: any) => ({ ...c, isDefault: c.id === id }));
        await saveDefinitions({ ...definitions, currencies: newCurrencies });
    };

    // --- Table Columns ---
    const vatColumns = [
        {
            title: 'KDV Adı', dataIndex: 'name', key: 'name',
            render: (val: any) => <Text strong style={{ color: '#1e293b' }}>{val}</Text>
        },
        {
            title: 'Oran', dataIndex: 'rate', key: 'rate',
            render: (val: any) => (
                <span style={{ fontSize: 14, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 10px', borderRadius: 6 }}>%{val}</span>
            )
        },
        {
            title: 'Varsayılan', dataIndex: 'isDefault', key: 'isDefault',
            render: (isDefault: boolean, record: any) => (
                isDefault ?
                    <Tag color="green" style={{ borderRadius: 6, fontWeight: 600 }}><StarFilled /> Varsayılan</Tag> :
                    <Button size="small" type="dashed" style={{ borderRadius: 6 }} onClick={() => setVatDefault(record.id)}>Varsayılan Yap</Button>
            )
        },
        {
            title: 'İşlemler', key: 'actions', width: 100,
            render: (_: any, record: any) => (
                <Space size={4}>
                    <Tooltip title="Düzenle">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openVatModal(record)}
                            style={{ color: '#6366f1', borderRadius: 6 }} />
                    </Tooltip>
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteVat(record.id)} okText="Evet" cancelText="Hayır">
                        <Tooltip title="Sil">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const currencyColumns = [
        {
            title: 'Para Birimi', dataIndex: 'code', key: 'code',
            render: (val: any) => <Tag color="blue" style={{ borderRadius: 6, fontWeight: 700, fontSize: 13 }}>{val}</Tag>
        },
        {
            title: 'Sembol', dataIndex: 'symbol', key: 'symbol',
            render: (val: any) => <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{val}</span>
        },
        {
            title: 'Kur (TL)', dataIndex: 'rate', key: 'rate',
            render: (val: any) => <span style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>₺{val}</span>
        },
        {
            title: 'Varsayılan', dataIndex: 'isDefault', key: 'isDefault',
            render: (isDefault: boolean, record: any) => (
                isDefault ?
                    <Tag color="green" style={{ borderRadius: 6, fontWeight: 600 }}><StarFilled /> Varsayılan</Tag> :
                    <Button size="small" type="dashed" style={{ borderRadius: 6 }} onClick={() => setCurrencyDefault(record.id)}>Varsayılan Yap</Button>
            )
        },
        {
            title: 'İşlemler', key: 'actions', width: 100,
            render: (_: any, record: any) => (
                <Space size={4}>
                    <Tooltip title="Düzenle">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openCurrencyModal(record)}
                            style={{ color: '#6366f1', borderRadius: 6 }} />
                    </Tooltip>
                    <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => deleteCurrency(record.id)} okText="Evet" cancelText="Hayır">
                        <Tooltip title="Sil">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const tabItems = [
        {
            key: 'vat',
            label: <span><PercentageOutlined /> KDV Oranları</span>,
            children: (
                <div>
                    <SectionHeader icon={<PercentageOutlined />} title="KDV Oranları" subtitle="Faturalarda kullanılacak vergi oranlarını yönetin" color="#6366f1" />
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                        <StatCard icon={<PercentageOutlined />} label="Toplam Tanım" value={definitions.vatRates?.length || 0} color="#6366f1" />
                        <StatCard icon={<StarFilled />} label="Varsayılan Oran" value={definitions.vatRates?.find((v: any) => v.isDefault)?.rate ? `%${definitions.vatRates.find((v: any) => v.isDefault).rate}` : '—'} color="#10b981" />
                    </div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openVatModal()}
                            style={{ borderRadius: 8, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                            Yeni KDV Oranı Ekle
                        </Button>
                    </div>
                    <Table
                        dataSource={definitions.vatRates}
                        columns={vatColumns}
                        rowKey="id"
                        pagination={false}
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                    />
                </div>
            )
        },
        {
            key: 'currency',
            label: <span><DollarOutlined /> Para Birimleri</span>,
            children: (
                <div>
                    <SectionHeader icon={<DollarOutlined />} title="Para Birimleri ve Kur" subtitle="Döviz kurlarını ve para birimlerini yönetin" color="#10b981" />
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                        <StatCard icon={<DollarOutlined />} label="Toplam Para Birimi" value={definitions.currencies?.length || 0} color="#10b981" />
                        <StatCard icon={<StarFilled />} label="Varsayılan" value={definitions.currencies?.find((c: any) => c.isDefault)?.code || '—'} color="#f59e0b" />
                    </div>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCurrencyModal()}
                            style={{ borderRadius: 8, fontWeight: 600, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            Yeni Para Birimi Ekle
                        </Button>
                    </div>
                    <Table
                        dataSource={definitions.currencies}
                        columns={currencyColumns}
                        rowKey="id"
                        pagination={false}
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                    />
                </div>
            )
        },
        {
            key: 'email',
            label: <span><MailOutlined /> E-posta Ayarları</span>,
            children: (
                <div>
                    <SectionHeader icon={<MailOutlined />} title="E-posta (SMTP) Ayarları" subtitle="Rezervasyon voucher e-postalarının gönderimi için SMTP sunucu bilgilerinizi girin" color="#3b82f6" />

                    <div style={{
                        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #93c5fd',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 24,
                        display: 'flex', alignItems: 'flex-start', gap: 10
                    }}>
                        <InfoCircleOutlined style={{ color: '#3b82f6', fontSize: 18, marginTop: 2 }} />
                        <div>
                            <Text strong style={{ color: '#1e40af', fontSize: 13 }}>SMTP Nedir?</Text>
                            <div style={{ color: '#1e3a5f', fontSize: 12, marginTop: 2 }}>
                                E-posta göndermek için bir SMTP sunucusu gereklidir. Gmail, Yandex, ya da profesyonel SMTP servisleri (SendGrid, Mailgun vb.) kullanabilirsiniz.
                                Örneğin Gmail: <strong>smtp.gmail.com / Port: 587</strong> — Yandex: <strong>smtp.yandex.com / Port: 465</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                        {/* SMTP Server Card */}
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', padding: '18px 22px', color: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <SettingOutlined style={{ fontSize: 22 }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>SMTP Sunucu</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>Mail sunucu bağlantı bilgileri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>SMTP Sunucu Adresi</label>
                                    <Input
                                        placeholder="smtp.gmail.com"
                                        value={emailSettings.smtpHost}
                                        onChange={(e) => setEmailSettings(prev => ({ ...prev, smtpHost: e.target.value }))}
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Port</label>
                                        <InputNumber
                                            placeholder="587"
                                            value={emailSettings.smtpPort}
                                            onChange={(val) => setEmailSettings(prev => ({ ...prev, smtpPort: val || 587 }))}
                                            style={{ width: '100%', borderRadius: 8 }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>SSL/TLS</label>
                                        <Switch
                                            checked={emailSettings.smtpSecure}
                                            onChange={(val) => setEmailSettings(prev => ({ ...prev, smtpSecure: val }))}
                                            checkedChildren="SSL"
                                            unCheckedChildren="TLS"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Kullanıcı Adı (E-posta)</label>
                                    <Input
                                        placeholder="info@sirketiniz.com"
                                        value={emailSettings.smtpUser}
                                        onChange={(e) => setEmailSettings(prev => ({ ...prev, smtpUser: e.target.value }))}
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Şifre / Uygulama Parolası</label>
                                    <Input.Password
                                        placeholder="••••••••"
                                        value={emailSettings.smtpPass}
                                        onChange={(e) => setEmailSettings(prev => ({ ...prev, smtpPass: e.target.value }))}
                                        visibilityToggle={{ visible: showSmtpPass, onVisibleChange: setShowSmtpPass }}
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Sender & Options Card */}
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', padding: '18px 22px', color: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <SendOutlined style={{ fontSize: 22 }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Gönderici & Seçenekler</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>E-posta gönderici bilgileri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Gönderici Adı</label>
                                    <Input
                                        placeholder="SmartTransfer"
                                        value={emailSettings.senderName}
                                        onChange={(e) => setEmailSettings(prev => ({ ...prev, senderName: e.target.value }))}
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Gönderici E-posta</label>
                                    <Input
                                        placeholder="noreply@sirketiniz.com"
                                        value={emailSettings.senderEmail}
                                        onChange={(e) => setEmailSettings(prev => ({ ...prev, senderEmail: e.target.value }))}
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Voucher E-posta Konusu</label>
                                    <Input
                                        placeholder="Rezervasyon Onayı - {{bookingNumber}}"
                                        value={emailSettings.voucherSubject}
                                        onChange={(e) => setEmailSettings(prev => ({ ...prev, voucherSubject: e.target.value }))}
                                        style={{ borderRadius: 8 }}
                                    />
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                        Kullanılabilir değişkenler: {'{{bookingNumber}}'}, {'{{passengerName}}'}, {'{{companyName}}'}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Otomatik Gönder</label>
                                    <Switch
                                        checked={emailSettings.autoSendVoucher}
                                        onChange={(val) => setEmailSettings(prev => ({ ...prev, autoSendVoucher: val }))}
                                        checkedChildren="Aktif"
                                        unCheckedChildren="Pasif"
                                    />
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                        Aktif olduğunda her yeni rezervasyonda otomatik voucher e-postası gönderilir
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Test Email & Save */}
                    <div style={{
                        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                        padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                            <SendOutlined style={{ marginRight: 8, color: '#3b82f6' }} />
                            Test E-postası Gönder
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                            <Input
                                placeholder="test@ornek.com"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                style={{ borderRadius: 8, flex: 1 }}
                                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                            />
                            <Button
                                type="default"
                                icon={<SendOutlined />}
                                loading={emailTesting}
                                onClick={handleTestEmail}
                                style={{ borderRadius: 8, fontWeight: 600 }}
                            >
                                Test Gönder
                            </Button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={emailSaving}
                                onClick={saveEmailSettings}
                                size="large"
                                style={{
                                    borderRadius: 10, fontWeight: 700, height: 44, paddingInline: 32,
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                    border: 'none', boxShadow: '0 4px 12px #3b82f640'
                                }}
                            >
                                E-posta Ayarlarını Kaydet
                            </Button>
                        </div>
                    </div>
                </div>
            )
        },
        {
            key: 'template',
            label: <span><FileTextOutlined /> Voucher Şablonu</span>,
            children: (
                <div>
                    <SectionHeader icon={<FileTextOutlined />} title="Voucher E-posta Şablonu" subtitle="Rezervasyon onay e-postasının HTML şablonunu düzenleyin" color="#8b5cf6" />

                    <div style={{
                        background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', border: '1px solid #d8b4fe',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 24,
                        display: 'flex', alignItems: 'flex-start', gap: 10
                    }}>
                        <InfoCircleOutlined style={{ color: '#8b5cf6', fontSize: 18, marginTop: 2 }} />
                        <div>
                            <Text strong style={{ color: '#6b21a8', fontSize: 13 }}>Şablon Değişkenleri</Text>
                            <div style={{ color: '#581c87', fontSize: 12, marginTop: 2, lineHeight: 1.8 }}>
                                Şablonda aşağıdaki değişkenleri kullanabilirsiniz (çift süslü parantez ile):<br/>
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{bookingNumber}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{passengerName}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{passengerEmail}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{passengerPhone}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{pickup}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{dropoff}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{date}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{time}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{vehicleType}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{flightNumber}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{price}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{currency}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{totalPassengers}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{companyName}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{companyPhone}}'}</code>{' '}
                                <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>{'{{companyEmail}}'}</code>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 8 }}>
                            HTML Şablon Kodu
                        </label>
                        <Input.TextArea
                            rows={16}
                            value={voucherHtml}
                            onChange={(e) => setVoucherHtml(e.target.value)}
                            placeholder="Boş bırakılırsa varsayılan profesyonel şablon kullanılır..."
                            style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space>
                            <Button
                                icon={<EyeOutlined />}
                                onClick={() => setPreviewVisible(true)}
                                style={{ borderRadius: 8, fontWeight: 600 }}
                            >
                                Önizleme
                            </Button>
                            <Popconfirm
                                title="Şablonu varsayılana sıfırlamak istediğinize emin misiniz?"
                                onConfirm={resetVoucherTemplate}
                                okText="Evet"
                                cancelText="Hayır"
                            >
                                <Button
                                    danger
                                    style={{ borderRadius: 8, fontWeight: 600 }}
                                >
                                    Varsayılana Sıfırla
                                </Button>
                            </Popconfirm>
                        </Space>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={templateSaving}
                            onClick={saveVoucherTemplate}
                            size="large"
                            style={{
                                borderRadius: 10, fontWeight: 700, height: 44, paddingInline: 32,
                                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                border: 'none', boxShadow: '0 4px 12px #8b5cf640'
                            }}
                        >
                            Şablonu Kaydet
                        </Button>
                    </div>
                </div>
            )
        },
        {
            key: 'whatsapp',
            label: <span><WhatsAppOutlined /> WhatsApp</span>,
            children: (
                <div>
                    <SectionHeader icon={<WhatsAppOutlined />} title="WhatsApp Mesaj Ayarları" subtitle="Rezervasyon sonrası müşterinin telefonuna otomatik WhatsApp mesajı gönderin" color="#25D366" />

                    <div style={{
                        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 24,
                        display: 'flex', alignItems: 'flex-start', gap: 10
                    }}>
                        <InfoCircleOutlined style={{ color: '#25D366', fontSize: 18, marginTop: 2 }} />
                        <div>
                            <Text strong style={{ color: '#166534', fontSize: 13 }}>WhatsApp API Sağlayıcıları</Text>
                            <div style={{ color: '#14532d', fontSize: 12, marginTop: 2 }}>
                                <strong>Green API:</strong> En kolay kurulum. <a href="https://green-api.com" target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a' }}>green-api.com</a> adresinden ücretsiz hesap oluşturun, QR ile WhatsApp bağlayın.<br/>
                                <strong>Meta Business API:</strong> Resmi WhatsApp Business API. Meta Business Suite üzerinden yapılandırılır.<br/>
                                <strong>Custom Webhook:</strong> Kendi API servisinize POST isteği gönderir.
                            </div>
                        </div>
                    </div>

                    {/* Enable + Provider */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', padding: '18px 22px', color: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <WhatsAppOutlined style={{ fontSize: 22 }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Bağlantı Ayarları</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>API sağlayıcı ve kimlik bilgileri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>WhatsApp Entegrasyonu</label>
                                    <Switch
                                        checked={whatsappSettings.enabled}
                                        onChange={(val) => setWhatsappSettings(prev => ({ ...prev, enabled: val }))}
                                        checkedChildren="Aktif"
                                        unCheckedChildren="Pasif"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>API Sağlayıcı</label>
                                    <Select
                                        value={whatsappSettings.provider}
                                        onChange={(val) => setWhatsappSettings(prev => ({ ...prev, provider: val }))}
                                        style={{ width: '100%' }}
                                        options={[
                                            { value: 'greenapi', label: '🟢 Green API (Önerilen)' },
                                            { value: 'meta', label: '📘 Meta Business API (Resmi)' },
                                            { value: 'webhook', label: '🔗 Custom Webhook' },
                                        ]}
                                    />
                                </div>

                                {/* Green API Fields */}
                                {whatsappSettings.provider === 'greenapi' && (
                                    <>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Instance ID</label>
                                            <Input
                                                placeholder="1234567890"
                                                value={whatsappSettings.greenApiInstance}
                                                onChange={(e) => setWhatsappSettings(prev => ({ ...prev, greenApiInstance: e.target.value }))}
                                                style={{ borderRadius: 8 }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>API Token</label>
                                            <Input.Password
                                                placeholder="••••••••"
                                                value={whatsappSettings.greenApiToken}
                                                onChange={(e) => setWhatsappSettings(prev => ({ ...prev, greenApiToken: e.target.value }))}
                                                style={{ borderRadius: 8 }}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Meta API Fields */}
                                {whatsappSettings.provider === 'meta' && (
                                    <>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Phone Number ID</label>
                                            <Input
                                                placeholder="Meta Business Phone Number ID"
                                                value={whatsappSettings.metaPhoneNumberId}
                                                onChange={(e) => setWhatsappSettings(prev => ({ ...prev, metaPhoneNumberId: e.target.value }))}
                                                style={{ borderRadius: 8 }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Access Token</label>
                                            <Input.Password
                                                placeholder="Meta Access Token"
                                                value={whatsappSettings.metaAccessToken}
                                                onChange={(e) => setWhatsappSettings(prev => ({ ...prev, metaAccessToken: e.target.value }))}
                                                style={{ borderRadius: 8 }}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Webhook Fields */}
                                {whatsappSettings.provider === 'webhook' && (
                                    <>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Webhook URL</label>
                                            <Input
                                                placeholder="https://api.servisiniz.com/send-whatsapp"
                                                value={whatsappSettings.webhookUrl}
                                                onChange={(e) => setWhatsappSettings(prev => ({ ...prev, webhookUrl: e.target.value }))}
                                                style={{ borderRadius: 8 }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Ek Headers (JSON)</label>
                                            <Input.TextArea
                                                rows={2}
                                                placeholder='{"Authorization": "Bearer xxx"}'
                                                value={whatsappSettings.webhookHeaders}
                                                onChange={(e) => setWhatsappSettings(prev => ({ ...prev, webhookHeaders: e.target.value }))}
                                                style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Message Template Card */}
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ background: 'linear-gradient(135deg, #128C7E, #075E54)', padding: '18px 22px', color: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <FileTextOutlined style={{ fontSize: 22 }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Mesaj Şablonu</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>Rezervasyon bildirim mesajı</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '20px 22px' }}>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                                    Kullanılabilir değişkenler: {'{{bookingNumber}}'}, {'{{passengerName}}'}, {'{{pickup}}'}, {'{{dropoff}}'}, {'{{date}}'}, {'{{time}}'}, {'{{vehicleType}}'}, {'{{flightNumber}}'}, {'{{price}}'}, {'{{currency}}'}, {'{{totalPassengers}}'}, {'{{companyName}}'}, {'{{companyPhone}}'}
                                </div>
                                <Input.TextArea
                                    rows={12}
                                    value={whatsappSettings.voucherMessage}
                                    onChange={(e) => setWhatsappSettings(prev => ({ ...prev, voucherMessage: e.target.value }))}
                                    placeholder="Boş bırakılırsa varsayılan şablon kullanılır..."
                                    style={{ borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                                />
                                <div style={{
                                    marginTop: 10, padding: '10px 14px', borderRadius: 8,
                                    background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 11, color: '#166534'
                                }}>
                                    <strong>İpucu:</strong> WhatsApp bold yapmak için *metin*, italik için _metin_ kullanabilirsiniz.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Test & Save */}
                    <div style={{
                        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                        padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                            <WhatsAppOutlined style={{ marginRight: 8, color: '#25D366' }} />
                            Test Mesajı Gönder
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                            <Input
                                placeholder="+90 555 123 45 67"
                                value={testPhone}
                                onChange={(e) => setTestPhone(e.target.value)}
                                style={{ borderRadius: 8, flex: 1 }}
                                prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
                            />
                            <Button
                                type="default"
                                icon={<WhatsAppOutlined />}
                                loading={whatsappTesting}
                                onClick={handleTestWhatsApp}
                                style={{ borderRadius: 8, fontWeight: 600, color: '#25D366', borderColor: '#25D366' }}
                            >
                                Test Gönder
                            </Button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={whatsappSaving}
                                onClick={saveWhatsappSettings}
                                size="large"
                                style={{
                                    borderRadius: 10, fontWeight: 700, height: 44, paddingInline: 32,
                                    background: 'linear-gradient(135deg, #25D366, #128C7E)',
                                    border: 'none', boxShadow: '0 4px 12px #25D36640'
                                }}
                            >
                                WhatsApp Ayarlarını Kaydet
                            </Button>
                        </div>
                    </div>
                </div>
            )
        },
        {
            key: 'time',
            label: <span><ClockCircleOutlined /> Zaman Tanımları</span>,
            children: (
                <div>
                    <SectionHeader icon={<ClockCircleOutlined />} title="Zaman Tanımları" subtitle="Transfer aramalarında minimum zaman kısıtlamalarını belirleyin" color="#f59e0b" />

                    <div style={{
                        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fde68a',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 24,
                        display: 'flex', alignItems: 'flex-start', gap: 10
                    }}>
                        <InfoCircleOutlined style={{ color: '#f59e0b', fontSize: 18, marginTop: 2 }} />
                        <div>
                            <Text strong style={{ color: '#92400e', fontSize: 13 }}>Bu ayar ne işe yarar?</Text>
                            <div style={{ color: '#78350f', fontSize: 12, marginTop: 2 }}>
                                Müşteri transfer araması yaptığında, uçuş saatine belirlenen saatten daha az süre kaldıysa
                                ilgili transfer tipi sonuçlarda <strong>gösterilmez</strong>. Böylece yetiştirilemeyen transferlerin satışı engellenir.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        {/* Özel Transfer */}
                        <div style={{
                            background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                            overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                padding: '18px 22px', color: '#fff'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <CarOutlined style={{ fontSize: 22 }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Özel Transfer</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>VIP ve özel araç transferleri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '24px 22px' }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>
                                    Minimum Süre (Saat)
                                </label>
                                <InputNumber
                                    size="large"
                                    min={0}
                                    max={48}
                                    step={0.5}
                                    value={timeDefinitions.privateTransferMinHours}
                                    onChange={(val) => setTimeDefinitions(prev => ({ ...prev, privateTransferMinHours: val || 0 }))}
                                    style={{ width: '100%', borderRadius: 10 }}
                                    addonAfter="saat"
                                />
                                <div style={{
                                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                                    background: '#f8fafc', border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>
                                        <ThunderboltOutlined style={{ color: '#6366f1' }} /> Uçuşa <strong>{timeDefinitions.privateTransferMinHours} saatten</strong> az kaldıysa özel transfer <span style={{ color: '#ef4444', fontWeight: 700 }}>gösterilmez</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Shuttle Transfer */}
                        <div style={{
                            background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                            overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                padding: '18px 22px', color: '#fff'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 22 }}>🚌</span>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>Shuttle Transfer</div>
                                        <div style={{ fontSize: 11, opacity: 0.85 }}>Paylaşımlı shuttle seferleri</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '24px 22px' }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>
                                    Minimum Süre (Saat)
                                </label>
                                <InputNumber
                                    size="large"
                                    min={0}
                                    max={48}
                                    step={0.5}
                                    value={timeDefinitions.shuttleTransferMinHours}
                                    onChange={(val) => setTimeDefinitions(prev => ({ ...prev, shuttleTransferMinHours: val || 0 }))}
                                    style={{ width: '100%', borderRadius: 10 }}
                                    addonAfter="saat"
                                />
                                <div style={{
                                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                                    background: '#fffbeb', border: '1px solid #fde68a'
                                }}>
                                    <div style={{ fontSize: 11, color: '#78350f' }}>
                                        <ThunderboltOutlined style={{ color: '#f59e0b' }} /> Uçuşa <strong>{timeDefinitions.shuttleTransferMinHours} saatten</strong> az kaldıysa shuttle <span style={{ color: '#ef4444', fontWeight: 700 }}>gösterilmez</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={timeSaving}
                            onClick={saveTimeDefinitions}
                            size="large"
                            style={{
                                borderRadius: 10, fontWeight: 700, height: 44, paddingInline: 32,
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                border: 'none', boxShadow: '0 4px 12px #f59e0b40'
                            }}
                        >
                            Zaman Tanımlarını Kaydet
                        </Button>
                    </div>
                </div>
            )
        }
    ];

    return (
        <AdminLayout selectedKey="definitions">
            <div style={{ padding: '0 24px 24px 24px', maxWidth: 1200 }}>
                {/* Header */}
                <div style={{
                    marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 22, boxShadow: '0 4px 14px #6366f140'
                            }}>⚙</div>
                            <div>
                                <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Sistem Tanımlamaları</Title>
                                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                                    KDV, döviz kurları, zaman kısıtlamaları ve e-posta ayarlarını buradan yönetin
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                <Card style={{
                    borderRadius: 16, border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
                }} bodyStyle={{ padding: '20px 24px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 12, color: '#94a3b8' }}>Yükleniyor...</div>
                        </div>
                    ) : (
                        <Tabs
                            defaultActiveKey="vat"
                            items={tabItems}
                            type="card"
                            tabBarGutter={8}
                            tabBarStyle={{ marginBottom: 24 }}
                        />
                    )}
                </Card>
            </div>

            {/* VAT Modal */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PercentageOutlined style={{ color: '#6366f1' }} />
                    <span>{editingItem ? "KDV Oranını Düzenle" : "Yeni KDV Oranı Ekle"}</span>
                </div>}
                open={vatModalVisible}
                onCancel={() => setVatModalVisible(false)}
                confirmLoading={saving}
                onOk={() => vatForm.submit()}
                okText="Kaydet"
                cancelText="Vazgeç"
                styles={{ body: { paddingTop: 20 } }}
            >
                <Form form={vatForm} layout="vertical" onFinish={handleVatSubmit}>
                    <Form.Item name="name" label="Tanım Adı" rules={[{ required: true, message: 'Tanım adı girin' }]}>
                        <Input placeholder="Örn: KDV 20" size="large" style={{ borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="rate" label="KDV Oranı (%)" rules={[{ required: true, message: 'Oran girin' }]}>
                        <InputNumber placeholder="20" min={0} max={100} size="large" style={{ width: '100%', borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="isDefault" valuePropName="checked">
                        <Switch checkedChildren="Varsayılan" unCheckedChildren="Normal" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Currency Modal */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DollarOutlined style={{ color: '#10b981' }} />
                    <span>{editingItem ? "Para Birimini Düzenle" : "Yeni Para Birimi Ekle"}</span>
                </div>}
                open={currencyModalVisible}
                onCancel={() => setCurrencyModalVisible(false)}
                confirmLoading={saving}
                onOk={() => currencyForm.submit()}
                okText="Kaydet"
                cancelText="Vazgeç"
                styles={{ body: { paddingTop: 20 } }}
            >
                <Form form={currencyForm} layout="vertical" onFinish={handleCurrencySubmit}>
                    <Form.Item name="code" label="Para Birimi Kodu" rules={[{ required: true, message: 'Kodu girin' }]}>
                        <Input placeholder="Örn: USD" size="large" style={{ borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="symbol" label="Sembol" rules={[{ required: true, message: 'Sembolü girin' }]}>
                        <Input placeholder="Örn: $" size="large" style={{ borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="rate" label="Türk Lirası Karşılığı" rules={[{ required: true, message: 'Kuru girin' }]}
                        tooltip="1 birim = kaç TL?">
                        <InputNumber placeholder="35.50" min={0} step={0.01} size="large" style={{ width: '100%', borderRadius: 8 }} />
                    </Form.Item>
                    <Form.Item name="isDefault" valuePropName="checked">
                        <Switch checkedChildren="Varsayılan" unCheckedChildren="Normal" />
                    </Form.Item>
                </Form>
            </Modal>
            {/* Voucher Preview Modal */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EyeOutlined style={{ color: '#8b5cf6' }} />
                    <span>Voucher Önizleme</span>
                </div>}
                open={previewVisible}
                onCancel={() => setPreviewVisible(false)}
                footer={null}
                width={680}
                styles={{ body: { padding: 0 } }}
            >
                <div
                    style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                />
            </Modal>
        </AdminLayout>
    );
}
