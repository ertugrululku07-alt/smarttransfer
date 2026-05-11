'use client';

import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, message, Spin, Upload, Select } from 'antd';
import type { UploadProps } from 'antd';
import {
    SaveOutlined, PercentageOutlined, UploadOutlined, LoadingOutlined,
    BankOutlined, SettingOutlined, ShopOutlined, PhoneOutlined,
    MailOutlined, GlobalOutlined, EnvironmentOutlined, IdcardOutlined,
    PictureOutlined, TrophyOutlined, CreditCardOutlined, SwapOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../AgencyLayout';
import AgencyGuard from '../AgencyGuard';

const SECTION_HEADER = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg,#6366f1,#818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#fff', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
        }}>{icon}</div>
        <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{subtitle}</div>
        </div>
    </div>
);

const FIELD_LABEL = ({ children }: { children: React.ReactNode }) => (
    <span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>{children}</span>
);

const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 20,
    border: '1px solid #e8ecf4',
    padding: '28px 32px',
    marginBottom: 20,
    boxShadow: '0 2px 16px rgba(0,0,0,0.04)'
};

const inputStyle: React.CSSProperties = { borderRadius: 10, height: 42 };
const saveBtn = (loading: boolean, label: string) => (
    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large" loading={loading}
        style={{ minWidth: 180, height: 46, borderRadius: 12, fontWeight: 700, background: 'linear-gradient(135deg,#6366f1,#818cf8)', border: 'none', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
        {label}
    </Button>
);

export default function AgencySettingsPage() {
    const [brandForm] = Form.useForm();
    const [companyForm] = Form.useForm();
    const [bankForm] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [savingBrand, setSavingBrand] = useState(false);
    const [savingCompany, setSavingCompany] = useState(false);
    const [savingBank, setSavingBank] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'brand' | 'company' | 'bank'>('brand');

    useEffect(() => { fetchSettings(); }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/api/agency/settings');
            if (response.data?.success && response.data?.data) {
                const d = response.data.data;
                brandForm.setFieldsValue({ logo: d.logo || '', markup: d.markup || 0 });
                companyForm.setFieldsValue({
                    companyName: d.companyName || '',
                    address: d.address || '',
                    taxOffice: d.taxOffice || '',
                    taxNumber: d.taxNumber || '',
                    contactPhone: d.contactPhone || '',
                    gsm: d.gsm || '',
                    contactEmail: d.contactEmail || '',
                    website: d.website || ''
                });
                const bi = d.bankInfo || {};
                bankForm.setFieldsValue({
                    bankName: bi.bankName || '',
                    accountName: bi.accountName || '',
                    iban: bi.iban || '',
                    branchName: bi.branchName || '',
                    branchCode: bi.branchCode || '',
                    swiftCode: bi.swiftCode || '',
                    currency: bi.currency || 'TRY'
                });
                if (d.logo) setImageUrl(d.logo);
            }
        } catch { message.error('Ayarlar yüklenirken bir hata oluştu.'); }
        finally { setLoading(false); }
    };

    const handleSaveBrand = async (values: any) => {
        try {
            setSavingBrand(true);
            const res = await apiClient.put('/api/agency/settings', { logo: imageUrl, markup: values.markup });
            if (res.data?.success) message.success('Marka ayarları güncellendi.');
            else throw new Error(res.data?.error);
        } catch (error: any) { message.error(error.message || 'Kaydedilemedi.'); }
        finally { setSavingBrand(false); }
    };

    const handleSaveCompany = async (values: any) => {
        try {
            setSavingCompany(true);
            const res = await apiClient.put('/api/agency/settings', values);
            if (res.data?.success) message.success('Firma bilgileri güncellendi.');
            else throw new Error(res.data?.error);
        } catch (error: any) { message.error(error.message || 'Kaydedilemedi.'); }
        finally { setSavingCompany(false); }
    };

    const handleSaveBank = async (values: any) => {
        try {
            setSavingBank(true);
            const res = await apiClient.put('/api/agency/settings', { bankInfo: values });
            if (res.data?.success) message.success('Banka bilgileri güncellendi.');
            else throw new Error(res.data?.error);
        } catch (error: any) { message.error(error.message || 'Kaydedilemedi.'); }
        finally { setSavingBank(false); }
    };

    const handleLogoSelect = (file: File) => {
        const ok = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'].includes(file.type);
        if (!ok) { message.error('Sadece JPG/PNG/SVG/WebP yükleyebilirsiniz!'); return false; }
        if (file.size / 1024 / 1024 >= 2) { message.error("Dosya 2MB'dan küçük olmalıdır!"); return false; }
        setUploading(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = e.target?.result as string;
            setImageUrl(b64);
            brandForm.setFieldsValue({ logo: b64 });
            setUploading(false);
            message.success('Logo seçildi. Kaydet butonuna basın.');
        };
        reader.onerror = () => { setUploading(false); message.error('Dosya okunamadı.'); };
        reader.readAsDataURL(file);
        return false;
    };

    const uploadProps: UploadProps = { showUploadList: false, beforeUpload: handleLogoSelect, accept: 'image/jpeg,image/png,image/svg+xml,image/webp' };

    const TABS = [
        { key: 'brand', icon: <SettingOutlined />, label: 'Marka & Fiyatlandırma' },
        { key: 'company', icon: <ShopOutlined />, label: 'Firma Bilgileri' },
        { key: 'bank', icon: <BankOutlined />, label: 'Banka Bilgileri' },
    ];

    if (loading) return (
        <AgencyGuard>
            <AgencyLayout selectedKey="settings">
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                    <Spin size="large" />
                </div>
            </AgencyLayout>
        </AgencyGuard>
    );

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="settings">
                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    {/* Page Header */}
                    <div style={{ marginBottom: 28 }}>
                        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', margin: 0 }}>Acente Ayarları</h1>
                        <p style={{ color: '#94a3b8', margin: '4px 0 0', fontSize: 14 }}>Logo, fiyatlandırma, firma ve banka bilgilerinizi yönetin</p>
                    </div>

                    {/* Tab Bar */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#f1f5f9', padding: 6, borderRadius: 16, width: 'fit-content' }}>
                        {TABS.map(t => (
                            <button key={t.key} type="button" onClick={() => setActiveTab(t.key as any)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '9px 20px', borderRadius: 11, border: 'none', cursor: 'pointer',
                                    fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
                                    background: activeTab === t.key ? '#fff' : 'transparent',
                                    color: activeTab === t.key ? '#6366f1' : '#64748b',
                                    boxShadow: activeTab === t.key ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                                }}>
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ── TAB 1: Marka & Fiyatlandırma ── */}
                    {activeTab === 'brand' && (
                        <Form form={brandForm} layout="vertical" onFinish={handleSaveBrand}>
                            <div style={cardStyle}>
                                <SECTION_HEADER icon={<PictureOutlined />} title="Acente Logosu" subtitle="Tekliflerde ve belgelerde görünecek marka görseli" />
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 8 }}>
                                    {imageUrl ? (
                                        <div style={{ width: 90, height: 90, borderRadius: 16, border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: '#f8fafc' }}>
                                            <img src={imageUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                        </div>
                                    ) : (
                                        <div style={{ width: 90, height: 90, borderRadius: 16, border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#f8fafc', color: '#cbd5e1', fontSize: 28 }}>🖼</div>
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                            <Upload {...uploadProps}>
                                                <Button icon={uploading ? <LoadingOutlined /> : <UploadOutlined />} style={{ borderRadius: 10, height: 40 }}>
                                                    {uploading ? 'Yükleniyor...' : 'Logo Yükle'}
                                                </Button>
                                            </Upload>
                                            {imageUrl && <Button danger onClick={() => { setImageUrl(''); brandForm.setFieldsValue({ logo: '' }); }} style={{ borderRadius: 10, height: 40 }}>Kaldır</Button>}
                                        </div>
                                        <Input
                                            placeholder="Veya logo URL'si yapıştırın (https://...)"
                                            value={imageUrl}
                                            onChange={e => setImageUrl(e.target.value)}
                                            style={{ ...inputStyle }}
                                            prefix={<GlobalOutlined style={{ color: '#cbd5e1' }} />}
                                        />
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>JPG, PNG, SVG veya WebP · Maks 2MB</div>
                                    </div>
                                </div>
                            </div>

                            <div style={cardStyle}>
                                <SECTION_HEADER icon={<TrophyOutlined />} title="Fiyatlandırma & Kâr Marjı" subtitle="B2B taban fiyatlara otomatik eklenen yüzde" />
                                <div style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, border: '1px solid #dbeafe', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                                    💡 Arama sonuçlarında taban B2B fiyatlarına bu yüzde <strong>otomatik eklenir</strong>. Temsilci ve acente kullanıcılarınız yalnızca kârlı son fiyatı görür.
                                </div>
                                <Form.Item name="markup" label={<FIELD_LABEL>Kâr Marjı (%)</FIELD_LABEL>} rules={[{ required: true, message: 'Kâr marjı zorunludur' }]} style={{ marginBottom: 0 }}>
                                    <InputNumber addonAfter={<PercentageOutlined />} min={0} max={500} step={0.5} style={{ width: 180 }} size="large" />
                                </Form.Item>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{saveBtn(savingBrand, 'Marka Ayarlarını Kaydet')}</div>
                        </Form>
                    )}

                    {/* ── TAB 2: Firma Bilgileri ── */}
                    {activeTab === 'company' && (
                        <Form form={companyForm} layout="vertical" onFinish={handleSaveCompany}>
                            <div style={cardStyle}>
                                <SECTION_HEADER icon={<ShopOutlined />} title="Firma Bilgileri" subtitle="Teklif, fatura ve iletişim formlarında kullanılır" />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                                    <Form.Item name="companyName" label={<FIELD_LABEL>Firma Adı</FIELD_LABEL>}>
                                        <Input prefix={<ShopOutlined style={{ color: '#cbd5e1' }} />} placeholder="ABC Turizm A.Ş." style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="website" label={<FIELD_LABEL>Web Sitesi</FIELD_LABEL>}>
                                        <Input prefix={<GlobalOutlined style={{ color: '#cbd5e1' }} />} placeholder="https://www.firmaadi.com" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="taxOffice" label={<FIELD_LABEL>Vergi Dairesi</FIELD_LABEL>}>
                                        <Input prefix={<IdcardOutlined style={{ color: '#cbd5e1' }} />} placeholder="Kadıköy Vergi Dairesi" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="taxNumber" label={<FIELD_LABEL>Vergi Numarası</FIELD_LABEL>}>
                                        <Input prefix={<IdcardOutlined style={{ color: '#cbd5e1' }} />} placeholder="1234567890" maxLength={12} style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="contactPhone" label={<FIELD_LABEL>Sabit Telefon</FIELD_LABEL>}>
                                        <Input prefix={<PhoneOutlined style={{ color: '#cbd5e1' }} />} placeholder="+90 212 000 00 00" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="gsm" label={<FIELD_LABEL>GSM / Mobil</FIELD_LABEL>}>
                                        <Input prefix={<PhoneOutlined style={{ color: '#6366f1' }} />} placeholder="+90 532 000 00 00" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="contactEmail" label={<FIELD_LABEL>E-Posta</FIELD_LABEL>} rules={[{ type: 'email', message: 'Geçerli e-posta girin' }]} style={{ gridColumn: '1 / -1' }}>
                                        <Input prefix={<MailOutlined style={{ color: '#cbd5e1' }} />} placeholder="info@firma.com" style={inputStyle} />
                                    </Form.Item>
                                </div>
                                <Form.Item name="address" label={<FIELD_LABEL>Adres</FIELD_LABEL>}>
                                    <Input.TextArea rows={3} placeholder="Firma açık adresi..." style={{ borderRadius: 10 }} />
                                </Form.Item>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{saveBtn(savingCompany, 'Firma Bilgilerini Kaydet')}</div>
                        </Form>
                    )}

                    {/* ── TAB 3: Banka Bilgileri ── */}
                    {activeTab === 'bank' && (
                        <Form form={bankForm} layout="vertical" onFinish={handleSaveBank}>
                            <div style={cardStyle}>
                                <SECTION_HEADER icon={<BankOutlined />} title="Banka Hesap Bilgileri" subtitle="Müşteri ve iş ortaklarına gösterilen hesap bilgileri" />
                                <div style={{ background: 'linear-gradient(135deg,#fef9ec,#fff7ed)', borderRadius: 14, padding: '14px 18px', marginBottom: 22, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
                                    🏦 Bu bilgiler tekliflerde ve ödeme talimatlarında kullanılır. IBAN numarasını eksiksiz ve doğru girin.
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                                    <Form.Item name="bankName" label={<FIELD_LABEL>Banka Adı</FIELD_LABEL>}>
                                        <Input prefix={<BankOutlined style={{ color: '#cbd5e1' }} />} placeholder="Ör: Ziraat Bankası" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="currency" label={<FIELD_LABEL>Hesap Dövizi</FIELD_LABEL>}>
                                        <Select size="large" style={{ borderRadius: 10 }} options={[
                                            { value: 'TRY', label: '🇹🇷 Türk Lirası (TRY)' },
                                            { value: 'EUR', label: '🇪🇺 Euro (EUR)' },
                                            { value: 'USD', label: '🇺🇸 US Dollar (USD)' },
                                            { value: 'GBP', label: '🇬🇧 Pound (GBP)' },
                                        ]} />
                                    </Form.Item>
                                    <Form.Item name="accountName" label={<FIELD_LABEL>Hesap Sahibi Adı</FIELD_LABEL>} style={{ gridColumn: '1 / -1' }}>
                                        <Input prefix={<IdcardOutlined style={{ color: '#cbd5e1' }} />} placeholder="Ör: ABC Turizm A.Ş." style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="iban" label={<FIELD_LABEL>IBAN</FIELD_LABEL>} style={{ gridColumn: '1 / -1' }}
                                        rules={[{ pattern: /^TR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}$|^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/, message: 'Geçerli bir IBAN girin', warningOnly: true }]}>
                                        <Input prefix={<CreditCardOutlined style={{ color: '#6366f1' }} />} placeholder="TR00 0000 0000 0000 0000 0000 00" style={{ ...inputStyle, letterSpacing: 1, fontFamily: 'monospace', fontSize: 14 }} maxLength={34} />
                                    </Form.Item>
                                    <Form.Item name="branchName" label={<FIELD_LABEL>Şube Adı</FIELD_LABEL>}>
                                        <Input prefix={<EnvironmentOutlined style={{ color: '#cbd5e1' }} />} placeholder="Ör: Kadıköy Şubesi" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="branchCode" label={<FIELD_LABEL>Şube Kodu</FIELD_LABEL>}>
                                        <Input prefix={<SwapOutlined style={{ color: '#cbd5e1' }} />} placeholder="Ör: 1234" style={inputStyle} />
                                    </Form.Item>
                                    <Form.Item name="swiftCode" label={<FIELD_LABEL>SWIFT / BIC Kodu</FIELD_LABEL>}>
                                        <Input prefix={<GlobalOutlined style={{ color: '#cbd5e1' }} />} placeholder="Ör: TCZBTR2A" style={{ ...inputStyle, fontFamily: 'monospace' }} maxLength={11} />
                                    </Form.Item>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{saveBtn(savingBank, 'Banka Bilgilerini Kaydet')}</div>
                        </Form>
                    )}
                </div>
            </AgencyLayout>
        </AgencyGuard>
    );
}
