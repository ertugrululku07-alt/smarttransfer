'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Tabs, Table, Card, Button, Modal, Form, Input, InputNumber, Select,
    DatePicker, Space, message, Popconfirm, Typography, Row, Col,
    Tag, Divider, Badge, Tooltip, Statistic, Alert, Collapse,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, PrinterOutlined,
    SendOutlined, CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined,
    ReloadOutlined, EyeOutlined, CopyOutlined, ThunderboltOutlined,
    UserOutlined, ShopOutlined, DollarOutlined, SafetyOutlined,
    ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useBranding } from '@/app/context/BrandingContext';
import { useRouter, useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.locale('tr');

const { Title, Text } = Typography;

/* ──────────────────────────────────────────────────────
   Types
────────────────────────────────────────────────────── */
interface InvoiceLine {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    lineTotal: number;
    vatAmount: number;
    unit: string;
}
interface Invoice {
    id: string;
    invoiceNo: string;
    invoiceType: 'SALES' | 'PURCHASE';
    invoiceKind: 'STANDARD' | 'EFATURA' | 'EARCHIVE';
    status: 'DRAFT' | 'APPROVED' | 'SENT' | 'PAID' | 'CANCELLED';
    sellerInfo: any;
    buyerInfo: any;
    lines: InvoiceLine[];
    subTotal: number;
    totalVat: number;
    discount: number;
    grandTotal: number;
    currency: string;
    invoiceDate: string;
    dueDate?: string;
    eInvoiceUUID?: string;
    eInvoiceScenario?: string;
    paymentMethod: string;
    notes?: string;
    createdAt: string;
    sentAt?: string;
}

/* ──────────────────────────────────────────────────────
   Constants
────────────────────────────────────────────────────── */
const VAT_RATES = [0, 1, 8, 10, 18, 20];
const UNITS = ['Adet', 'Saat', 'Gün', 'Km', 'Hizmet', 'Paket'];
const CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP'];
const PAYMENT_METHODS = [
    { value: 'BANK_TRANSFER', label: 'Banka Havalesi/EFT' },
    { value: 'CREDIT_CARD', label: 'Kredi Kartı' },
    { value: 'CASH', label: 'Nakit' },
    { value: 'CHECK', label: 'Çek' },
    { value: 'CREDIT', label: 'Açık Hesap' },
];

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    DRAFT: { label: 'Taslak', color: '#6b7280', icon: <FileTextOutlined /> },
    APPROVED: { label: 'Onaylandı', color: '#2563eb', icon: <CheckCircleOutlined /> },
    SENT: { label: 'Gönderildi', color: '#7c3aed', icon: <SendOutlined /> },
    PAID: { label: 'Ödendi', color: '#16a34a', icon: <CheckCircleOutlined /> },
    CANCELLED: { label: 'İptal', color: '#dc2626', icon: <ClockCircleOutlined /> },
};
const KIND_CFG: Record<string, { label: string; color: string }> = {
    STANDARD: { label: 'Fatura', color: '#6b7280' },
    EFATURA: { label: 'e-Fatura', color: '#7c3aed' },
    EARCHIVE: { label: 'e-Arşiv', color: '#0891b2' },
};

const fmtTRY = (v: number, cur = 'TRY') =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur }).format(Number(v) || 0);

function newLine(): InvoiceLine {
    return {
        id: Math.random().toString(36).slice(2),
        description: '',
        quantity: 1,
        unitPrice: 0,
        vatRate: 18,
        unit: 'Adet',
        lineTotal: 0,
        vatAmount: 0,
    };
}

/* ──────────────────────────────────────────────────────
   Print Modal
────────────────────────────────────────────────────── */
const PrintModal: React.FC<{ invoice: Invoice | null; open: boolean; onClose: () => void; sellerName: string }> =
    ({ invoice, open, onClose, sellerName }) => {
        if (!invoice) return null;
        const inv = invoice;
        const isSales = inv.invoiceType === 'SALES';
        const buyer = inv.buyerInfo || {};
        const seller = inv.sellerInfo || {};

        return (
            <Modal
                open={open}
                onCancel={onClose}
                footer={[
                    <Button key="print" type="primary" icon={<PrinterOutlined />}
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }}
                        onClick={() => window.print()}>
                        Yazdır / PDF
                    </Button>,
                    <Button key="close" onClick={onClose}>Kapat</Button>,
                ]}
                width={820}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {KIND_CFG[inv.invoiceKind]?.label} Önizleme
                        <Tag style={{ margin: 0 }} color={STATUS_CFG[inv.status]?.color}>{STATUS_CFG[inv.status]?.label}</Tag>
                    </div>
                }
            >
                <div id="invoice-print" style={{
                    fontFamily: "'Segoe UI', Arial, sans-serif",
                    fontSize: 12,
                    color: '#1e293b',
                    padding: '24px 0',
                    lineHeight: 1.5,
                }}>
                    {/* Header gradient bar */}
                    <div style={{
                        background: isSales
                            ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                            : 'linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)',
                        borderRadius: '12px 12px 0 0',
                        padding: '20px 28px',
                        color: 'white',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                    }}>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
                                {KIND_CFG[inv.invoiceKind]?.label?.toUpperCase()}
                            </div>
                            <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
                                {isSales ? 'SATIŞ FATURASI' : 'ALIŞ FATURASI'}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{inv.invoiceNo}</div>
                            <div style={{ opacity: 0.85, fontSize: 12, marginTop: 2 }}>
                                {dayjs(inv.invoiceDate).format('DD MMMM YYYY')}
                            </div>
                            {inv.eInvoiceUUID && (
                                <div style={{ opacity: 0.7, fontSize: 10, marginTop: 4, fontFamily: 'monospace' }}>
                                    UUID: {inv.eInvoiceUUID.substring(0, 16)}...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Seller / Buyer info */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
                        border: '1px solid #e2e8f0', borderTop: 'none',
                    }}>
                        {/* Seller */}
                        <div style={{ padding: '16px 20px', borderRight: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
                                SATICI / GÖNDERECİ
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{seller.companyName || sellerName}</div>
                            {seller.taxNo && <div style={{ color: '#4b5563', fontSize: 11 }}>VKN: {seller.taxNo} — {seller.taxOffice}</div>}
                            {seller.address && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>{seller.address}</div>}
                            {seller.phone && <div style={{ color: '#6b7280', fontSize: 11 }}>☎ {seller.phone}</div>}
                            {seller.email && <div style={{ color: '#6b7280', fontSize: 11 }}>✉ {seller.email}</div>}
                        </div>
                        {/* Buyer */}
                        <div style={{ padding: '16px 20px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
                                ALICI / MÜŞTERİ
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{buyer.companyName || buyer.fullName}</div>
                            {buyer.taxNo && <div style={{ color: '#4b5563', fontSize: 11 }}>VKN/TCKN: {buyer.taxNo} — {buyer.taxOffice}</div>}
                            {buyer.address && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>{buyer.address}</div>}
                            {buyer.phone && <div style={{ color: '#6b7280', fontSize: 11 }}>☎ {buyer.phone}</div>}
                            {buyer.email && <div style={{ color: '#6b7280', fontSize: 11 }}>✉ {buyer.email}</div>}
                        </div>
                    </div>

                    {/* Payment info bar */}
                    <div style={{
                        background: '#f8fafc', borderLeft: '1px solid #e2e8f0',
                        borderRight: '1px solid #e2e8f0',
                        padding: '10px 20px', display: 'flex', gap: 32, fontSize: 11,
                    }}>
                        <span><b>Ödeme:</b> {PAYMENT_METHODS.find(p => p.value === inv.paymentMethod)?.label || inv.paymentMethod}</span>
                        {inv.dueDate && <span><b>Vade:</b> {dayjs(inv.dueDate).format('DD.MM.YYYY')}</span>}
                        {inv.eInvoiceScenario && <span><b>Senaryo:</b> {inv.eInvoiceScenario}</span>}
                        <span><b>Para Birimi:</b> {inv.currency}</span>
                    </div>

                    {/* Line items table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderTop: 'none', marginBottom: 0 }}>
                        <thead>
                            <tr style={{ background: '#1e293b', color: 'white' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>#</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>AÇIKLAMA</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 11 }}>BİRM</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>MİKTAR</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>BİRM FİYAT</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>KDV %</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>KDV TUT.</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>TOPLAM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(inv.lines || []).map((l, i) => (
                                <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>{i + 1}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500 }}>{l.description}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'center', color: '#4b5563' }}>{l.unit}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right' }}>{l.quantity}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>{fmtTRY(l.unitPrice, inv.currency)}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right', color: '#7c3aed' }}>%{l.vatRate}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right', fontFamily: 'monospace', color: '#7c3aed' }}>{fmtTRY(l.vatAmount, inv.currency)}</td>
                                    <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmtTRY(l.lineTotal + l.vatAmount, inv.currency)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div style={{
                        display: 'flex', justifyContent: 'flex-end',
                        border: '1px solid #e2e8f0', borderTop: 'none',
                        padding: '12px 20px',
                    }}>
                        <table style={{ minWidth: 280 }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '4px 8px', color: '#4b5563', fontSize: 12 }}>Ara Toplam</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmtTRY(inv.subTotal, inv.currency)}</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '4px 8px', color: '#7c3aed', fontSize: 12 }}>Toplam KDV</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#7c3aed' }}>{fmtTRY(inv.totalVat, inv.currency)}</td>
                                </tr>
                                {inv.discount > 0 && (
                                    <tr>
                                        <td style={{ padding: '4px 8px', color: '#dc2626', fontSize: 12 }}>İndirim</td>
                                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#dc2626' }}>-{fmtTRY(inv.discount, inv.currency)}</td>
                                    </tr>
                                )}
                                <tr style={{ background: '#1e293b', color: 'white' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14, borderRadius: '4px 0 0 4px' }}>GENEL TOPLAM</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 16, borderRadius: '0 4px 4px 0' }}>{fmtTRY(inv.grandTotal, inv.currency)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Notes + Legal */}
                    {inv.notes && (
                        <div style={{ marginTop: 12, padding: '10px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11, color: '#92400e' }}>
                            <b>Not:</b> {inv.notes}
                        </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 10, color: '#9ca3af', textAlign: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                        Bu fatura {KIND_CFG[inv.invoiceKind]?.label} olarak düzenlenmiştir. {inv.eInvoiceUUID && `GİB UUID: ${inv.eInvoiceUUID}`}
                    </div>
                </div>

                <style>{`@media print { body * { visibility: hidden; } #invoice-print, #invoice-print * { visibility: visible; } #invoice-print { position: fixed; left: 0; top: 0; width: 100%; } }`}</style>
            </Modal>
        );
    };

/* ──────────────────────────────────────────────────────
   Main Invoice Page
────────────────────────────────────────────────────── */
export default function InvoicesPage() {
    const { branding } = useBranding();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASE'>('SALES');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Invoice | null>(null);
    const [printInv, setPrintInv] = useState<Invoice | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [lines, setLines] = useState<InvoiceLine[]>([newLine()]);
    const [currency, setCurrency] = useState('TRY');
    const [discount, setDiscount] = useState(0);
    const [form] = Form.useForm();

    // Cari picker state
    const [cariPickerOpen, setCariPickerOpen] = useState(false);
    const [cariList, setCariList] = useState<any[]>([]);
    const [cariSearch, setCariSearch] = useState('');

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/invoices');
            if (res.data.success) setInvoices(res.data.data);
        } catch { message.error('Faturalar yüklenemedi'); }
        finally { setLoading(false); }
    };

    const openCariPicker = async () => {
        setCariSearch('');
        if (cariList.length === 0) {
            try {
                const r = await apiClient.get('/api/accounting/accounts');
                if (r.data.success) setCariList(r.data.data);
            } catch { message.error('Cariler yüklenemedi'); }
        }
        setCariPickerOpen(true);
    };

    /* Cari seçilince formu doldur */
    const selectCari = (acc: any) => {
        const isSalesLocal = activeTab === 'SALES';
        const partyField = isSalesLocal ? 'buyerInfo' : 'sellerInfo';
        form.setFieldsValue({
            [partyField]: {
                accountId: acc.id,
                companyName: acc.name,
                taxNo: acc.taxNumber || '',
                taxOffice: acc.taxOffice || '',
                phone: acc.phone || '',
                email: acc.email || '',
                address: acc.address || '',
            },
        });
        setCariPickerOpen(false);
    };

    // Read URL params passed from accounts page İşlem menu
    const searchParams = useSearchParams();

    useEffect(() => {
        fetchInvoices().then(() => {
            const tab = searchParams.get('tab') as 'SALES' | 'PURCHASE' | null;
            const name = searchParams.get('name');
            if (!tab || !name) return;

            setActiveTab(tab);
            setEditing(null);
            setLines([newLine()]);
            setDiscount(0);
            setCurrency('TRY');

            const partyInfo = {
                companyName: name,
                taxNo: searchParams.get('taxNo') || '',
                taxOffice: searchParams.get('taxOffice') || '',
                phone: searchParams.get('phone') || '',
                email: searchParams.get('email') || '',
            };

            apiClient.get(`/api/invoices/next-no/${tab}`).then(r => {
                form.setFieldsValue({
                    invoiceNo: r.data?.data,
                    invoiceType: tab,
                    invoiceKind: 'EFATURA',
                    invoiceDate: dayjs(),
                    dueDate: dayjs().add(30, 'day'),
                    paymentMethod: 'BANK_TRANSFER',
                    eInvoiceScenario: 'COMMERCIAL',
                    currency: 'TRY',
                    // SALES  → alıcı = account, PURCHASE → satıcı = account
                    buyerInfo: tab === 'SALES' ? partyInfo : {},
                    sellerInfo: tab === 'PURCHASE' ? partyInfo : {},
                });
                setModalOpen(true);
            }).catch(() => { });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const list = invoices.filter(i => i.invoiceType === activeTab);

    /* ── Line helpers ── */
    const calcLine = (l: InvoiceLine): InvoiceLine => ({
        ...l,
        lineTotal: Number(l.quantity) * Number(l.unitPrice),
        vatAmount: Number(l.quantity) * Number(l.unitPrice) * (Number(l.vatRate) / 100),
    });
    const updateLine = (idx: number, field: keyof InvoiceLine, val: any) => {
        setLines(prev => {
            const next = [...prev];
            next[idx] = calcLine({ ...next[idx], [field]: val });
            return next;
        });
    };
    const addLine = () => setLines(p => [...p, newLine()]);
    const removeLine = (idx: number) => setLines(p => p.filter((_, i) => i !== idx));

    const subTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const totalVat = lines.reduce((s, l) => s + l.vatAmount, 0);
    const grandTotal = subTotal + totalVat - discount;

    /* ── Open modal ── */
    const openNew = async () => {
        setEditing(null);
        setLines([newLine()]);
        setDiscount(0);
        setCurrency('TRY');
        form.resetFields();
        try {
            const res = await apiClient.get(`/api/invoices/next-no/${activeTab}`);
            if (res.data.success) form.setFieldValue('invoiceNo', res.data.data);
        } catch { }
        form.setFieldsValue({
            invoiceType: activeTab,
            invoiceKind: 'EFATURA',
            invoiceDate: dayjs(),
            dueDate: dayjs().add(30, 'day'),
            paymentMethod: 'BANK_TRANSFER',
            eInvoiceScenario: 'COMMERCIAL',
            currency: 'TRY',
        });
        setModalOpen(true);
    };

    const openEdit = (inv: Invoice) => {
        setEditing(inv);
        setLines(inv.lines?.map(l => calcLine(l)) || [newLine()]);
        setDiscount(inv.discount || 0);
        setCurrency(inv.currency || 'TRY');
        form.setFieldsValue({
            ...inv,
            invoiceDate: dayjs(inv.invoiceDate),
            dueDate: inv.dueDate ? dayjs(inv.dueDate) : undefined,
        });
        setModalOpen(true);
    };

    /* ── Save ── */
    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const payload = {
                ...values,
                invoiceDate: values.invoiceDate?.toISOString(),
                dueDate: values.dueDate?.toISOString(),
                lines,
                discount,
                currency,
                invoiceType: activeTab,
            };
            if (editing) {
                await apiClient.put(`/api/invoices/${editing.id}`, payload);
                message.success('Fatura güncellendi');
            } else {
                await apiClient.post('/api/invoices', payload);
                message.success('Fatura oluşturuldu');
            }
            setModalOpen(false);
            fetchInvoices();
        } catch (e: any) {
            if (!e?.errorFields) message.error('Kayıt başarısız');
        } finally { setSubmitting(false); }
    };

    /* ── Status ── */
    const changeStatus = async (id: string, status: string) => {
        try {
            await apiClient.patch(`/api/invoices/${id}/status`, { status });
            message.success('Durum güncellendi');
            fetchInvoices();
        } catch { message.error('Güncellenemedi'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/invoices/${id}`);
            message.success('Silindi');
            fetchInvoices();
        } catch { message.error('Silinemedi'); }
    };

    /* ── Aggregates ── */
    const total = list.reduce((s, i) => s + i.grandTotal, 0);
    const paid = list.filter(i => i.status === 'PAID').reduce((s, i) => s + i.grandTotal, 0);
    const draft = list.filter(i => i.status === 'DRAFT').length;
    const sent = list.filter(i => i.status === 'SENT').length;

    /* ── Columns ── */
    const columns = [
        {
            title: 'Fatura No',
            dataIndex: 'invoiceNo',
            width: 180,
            render: (v: string, r: Invoice) => (
                <div>
                    <Tag style={{
                        fontFamily: 'monospace', fontWeight: 700, fontSize: 11,
                        background: KIND_CFG[r.invoiceKind]?.color + '18',
                        color: KIND_CFG[r.invoiceKind]?.color,
                        border: `1px solid ${KIND_CFG[r.invoiceKind]?.color}44`,
                        borderRadius: 6, padding: '1px 8px',
                    }}>
                        {v}
                    </Tag>
                    <div style={{ marginTop: 3 }}>
                        <Tag style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, margin: 0 }}
                            color={KIND_CFG[r.invoiceKind]?.color}>
                            {KIND_CFG[r.invoiceKind]?.label}
                        </Tag>
                    </div>
                </div>
            ),
        },
        {
            title: 'Tarih',
            dataIndex: 'invoiceDate',
            width: 110,
            sorter: (a: Invoice, b: Invoice) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
            render: (v: string) => dayjs(v).format('DD.MM.YYYY'),
        },
        {
            title: activeTab === 'SALES' ? 'Alıcı' : 'Satıcı',
            key: 'party',
            render: (_: any, r: Invoice) => {
                const p = activeTab === 'SALES' ? r.buyerInfo : r.sellerInfo;
                return (
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{p?.companyName || p?.fullName || '—'}</div>
                        {p?.taxNo && <div style={{ fontSize: 10, color: '#9ca3af' }}>VKN: {p.taxNo}</div>}
                    </div>
                );
            },
        },
        {
            title: 'Tutar',
            dataIndex: 'grandTotal',
            width: 140,
            align: 'right' as const,
            sorter: (a: Invoice, b: Invoice) => a.grandTotal - b.grandTotal,
            render: (v: number, r: Invoice) => (
                <div>
                    <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: activeTab === 'SALES' ? '#16a34a' : '#dc2626' }}>
                        {fmtTRY(v, r.currency)}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>KDV dahil</div>
                </div>
            ),
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            width: 130,
            render: (s: string, r: Invoice) => {
                const cfg = STATUS_CFG[s];
                return (
                    <Select
                        value={s}
                        size="small"
                        style={{ width: 130 }}
                        onChange={(v) => changeStatus(r.id, v)}
                        options={Object.entries(STATUS_CFG).map(([k, c]) => ({
                            value: k, label: <span style={{ color: c.color, fontWeight: 600 }}>{c.icon} {c.label}</span>
                        }))}
                    />
                );
            },
        },
        {
            title: 'Vade',
            dataIndex: 'dueDate',
            width: 100,
            render: (v: string, r: Invoice) => {
                if (!v) return '—';
                const past = new Date(v) < new Date() && r.status !== 'PAID';
                return <Text style={{ color: past ? '#dc2626' : '#374151', fontWeight: past ? 700 : 400, fontSize: 12 }}>
                    {dayjs(v).format('DD.MM.YYYY')}
                </Text>;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 130,
            render: (_: any, r: Invoice) => (
                <Space>
                    <Tooltip title="Önizle / Yazdır">
                        <Button size="small" icon={<PrinterOutlined />} onClick={() => setPrintInv(r)}
                            style={{ color: '#6366f1', borderColor: '#6366f1' }} />
                    </Tooltip>
                    <Tooltip title="Düzenle">
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}
                            disabled={r.status === 'PAID' || r.status === 'CANCELLED'} />
                    </Tooltip>
                    <Tooltip title="Sil">
                        <Popconfirm title="Faturayı sil?" onConfirm={() => handleDelete(r.id)} okText="Evet" cancelText="Hayır">
                            <Button size="small" danger icon={<DeleteOutlined />} disabled={r.status === 'PAID'} />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const isSales = activeTab === 'SALES';

    return (
        <AdminGuard>
            <AdminLayout selectedKey="accounting-invoices">
                <div style={{ paddingBottom: 32 }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: isSales ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#0891b2,#22d3ee)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18,
                                }}>
                                    <FileTextOutlined />
                                </div>
                                <Title level={2} style={{ margin: 0, fontWeight: 800 }}>Fatura Yönetimi</Title>
                            </div>
                            <Text type="secondary">Satış ve Alış Faturaları · e-Fatura & e-Arşiv uyumlu</Text>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={fetchInvoices} loading={loading} size="small">Yenile</Button>
                            <Button
                                type="primary" icon={<PlusOutlined />} size="middle"
                                onClick={openNew}
                                style={{
                                    background: isSales
                                        ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                                        : 'linear-gradient(135deg,#0891b2,#22d3ee)',
                                    border: 'none', fontWeight: 700, borderRadius: 8, height: 36,
                                }}
                            >
                                {isSales ? 'Satış Faturası Oluştur' : 'Alış Faturası Oluştur'}
                            </Button>
                        </Space>
                    </div>

                    {/* ── KPI Cards ── */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                        {[
                            { title: 'Toplam Tutar', value: total, color: isSales ? '#16a34a' : '#dc2626', icon: isSales ? <ArrowUpOutlined /> : <ArrowDownOutlined />, grad: isSales ? 'linear-gradient(135deg,#16a34a,#4ade80)' : 'linear-gradient(135deg,#dc2626,#f87171)', raw: fmtTRY(total) },
                            { title: 'Tahsil Edilen', value: paid, color: '#2563eb', icon: <CheckCircleOutlined />, grad: 'linear-gradient(135deg,#2563eb,#60a5fa)', raw: fmtTRY(paid) },
                            { title: 'Taslak', value: draft, color: '#6b7280', icon: <FileTextOutlined />, grad: 'linear-gradient(135deg,#6b7280,#9ca3af)' },
                            { title: 'Gönderilen', value: sent, color: '#7c3aed', icon: <SendOutlined />, grad: 'linear-gradient(135deg,#7c3aed,#a855f7)' },
                        ].map((k, i) => (
                            <Col key={i} xs={24} sm={12} lg={6}>
                                <div style={{
                                    borderRadius: 14, padding: '18px 20px',
                                    background: k.grad, color: 'white',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
                                    position: 'relative', overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', right: -12, top: -12, width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{k.title}</div>
                                            <div style={{ fontSize: k.raw ? 18 : 26, fontWeight: 800, marginTop: 4, fontFamily: 'monospace' }}>
                                                {k.raw ?? k.value}
                                            </div>
                                        </div>
                                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                                            {k.icon}
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        ))}
                    </Row>

                    {/* ── Tabs + Table ── */}
                    <Card bordered={false} style={{ borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
                        <div style={{ padding: '16px 24px 0' }}>
                            <Tabs
                                activeKey={activeTab}
                                onChange={(k) => setActiveTab(k as 'SALES' | 'PURCHASE')}
                                items={[
                                    {
                                        key: 'SALES',
                                        label: (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                                <ArrowUpOutlined style={{ color: '#16a34a' }} />
                                                Satış Faturaları
                                                <Badge count={invoices.filter(i => i.invoiceType === 'SALES').length} style={{ background: '#6366f1' }} />
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'PURCHASE',
                                        label: (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                                <ArrowDownOutlined style={{ color: '#dc2626' }} />
                                                Alış Faturaları
                                                <Badge count={invoices.filter(i => i.invoiceType === 'PURCHASE').length} style={{ background: '#0891b2' }} />
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                        <Table
                            columns={columns}
                            dataSource={list}
                            rowKey="id"
                            loading={loading}
                            size="middle"
                            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} fatura` }}
                            locale={{ emptyText: `Henüz ${isSales ? 'satış' : 'alış'} faturası yok.` }}
                        />
                    </Card>
                </div>

                {/* ══════════════════════════════════════
                    INVOICE FORM MODAL
                ══════════════════════════════════════ */}
                <Modal
                    open={modalOpen}
                    onCancel={() => setModalOpen(false)}
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: isSales ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#0891b2,#22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16 }}>
                                <FileTextOutlined />
                            </div>
                            <span>{editing ? 'Fatura Düzenle' : (isSales ? 'Satış Faturası Oluştur' : 'Alış Faturası Oluştur')}</span>
                        </div>
                    }
                    width={820}
                    onOk={handleSave}
                    confirmLoading={submitting}
                    okText="Kaydet"
                    cancelText="İptal"
                    okButtonProps={{ style: { background: isSales ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#0891b2,#22d3ee)', border: 'none', height: 36, fontWeight: 700 } }}
                >
                    <Form form={form} layout="vertical" style={{ marginTop: 8 }}>

                        {/* ── Fatura Bilgileri (Collapsible ─ başlangıçta kapalı) ── */}
                        <Collapse
                            size="small"
                            style={{ marginBottom: 16, borderRadius: 10 }}
                            items={[{
                                key: 'meta',
                                label: <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>📋 Fatura Bilgileri</span>,
                                children: (
                                    <>
                                        <Row gutter={12}>
                                            <Col span={6}>
                                                <Form.Item name="invoiceNo" label="Fatura No" rules={[{ required: true }]}>
                                                    <Input style={{ fontFamily: 'monospace', fontWeight: 700 }} />
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item name="invoiceKind" label="Fatura Türü" rules={[{ required: true }]}>
                                                    <Select>
                                                        <Select.Option value="STANDARD">Kağıt Fatura</Select.Option>
                                                        <Select.Option value="EFATURA">e-Fatura</Select.Option>
                                                        <Select.Option value="EARCHIVE">e-Arşiv</Select.Option>
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item name="eInvoiceScenario" label="Senaryo">
                                                    <Select>
                                                        <Select.Option value="COMMERCIAL">Ticari</Select.Option>
                                                        <Select.Option value="EXPORT">İhracat</Select.Option>
                                                        <Select.Option value="BASIC">Temel</Select.Option>
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item label="Para Birimi">
                                                    <Select value={currency} onChange={setCurrency}>
                                                        {CURRENCIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        <Row gutter={12}>
                                            <Col span={6}>
                                                <Form.Item name="invoiceDate" label="Fatura Tarihi" rules={[{ required: true }]}>
                                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item name="dueDate" label="Vade Tarihi">
                                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={12}>
                                                <Form.Item name="paymentMethod" label="Ödeme Yöntemi">
                                                    <Select>
                                                        {PAYMENT_METHODS.map(p => <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>)}
                                                    </Select>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </>
                                ),
                            }]}
                        />

                        {/* ── Karşı Taraf (tek panel) ── */}
                        <div style={{
                            background: isSales ? '#eff6ff' : '#f0fdf4',
                            borderRadius: 10,
                            padding: '16px 20px',
                            border: `1.5px solid ${isSales ? '#bfdbfe' : '#86efac'}`,
                            marginBottom: 18,
                        }}>
                            {/* Başlık */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: isSales ? '#2563eb' : '#16a34a' }}>
                                    {isSales ? '🛒 Alıcı / Müşteri Bilgileri' : '🏭 Satıcı / Tedarikçi Bilgileri'}
                                    <span style={{ fontSize: 10, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                                        {isSales ? '(Bize satan değil, biz ona satıyoruz)' : '(Bizden değil, biz ondan alıyoruz)'}
                                    </span>
                                </div>
                                <Button
                                    size="small"
                                    icon={<span style={{ fontSize: 14, letterSpacing: 1 }}>···</span>}
                                    onClick={openCariPicker}
                                    style={{
                                        background: isSales ? '#2563eb' : '#16a34a',
                                        color: 'white', border: 'none', borderRadius: 6,
                                        fontWeight: 700, paddingInline: 12,
                                    }}
                                >
                                    Cari Seç
                                </Button>
                            </div>

                            {/* Fields — alway write to the correct side (buyerInfo for SALES, sellerInfo for PURCHASE) */}
                            {isSales ? (
                                <>
                                    <Form.Item name={['buyerInfo', 'accountId']} hidden><Input /></Form.Item>
                                    <Form.Item name={['buyerInfo', 'companyName']} label="Firma / Kişi Adı" rules={[{ required: true, message: 'Firma adı zorunlu' }]} style={{ marginBottom: 10 }}>
                                        <Input placeholder="Müşteri firma adı..." />
                                    </Form.Item>
                                    <Row gutter={12}>
                                        <Col span={9}><Form.Item name={['buyerInfo', 'taxNo']} label="VKN / TCKN" style={{ marginBottom: 10 }}><Input placeholder="1234567890" /></Form.Item></Col>
                                        <Col span={9}><Form.Item name={['buyerInfo', 'taxOffice']} label="Vergi Dairesi" style={{ marginBottom: 10 }}><Input placeholder="Kadıköy" /></Form.Item></Col>
                                        <Col span={6}><Form.Item name={['buyerInfo', 'phone']} label="Telefon" style={{ marginBottom: 10 }}><Input placeholder="+90..." /></Form.Item></Col>
                                    </Row>
                                    <Row gutter={12}>
                                        <Col span={14}><Form.Item name={['buyerInfo', 'address']} label="Adres" style={{ marginBottom: 0 }}><Input placeholder="Açık adres..." /></Form.Item></Col>
                                        <Col span={10}><Form.Item name={['buyerInfo', 'email']} label="E-posta" style={{ marginBottom: 0 }}><Input placeholder="info@..." /></Form.Item></Col>
                                    </Row>
                                </>
                            ) : (
                                <>
                                    <Form.Item name={['sellerInfo', 'accountId']} hidden><Input /></Form.Item>
                                    <Form.Item name={['sellerInfo', 'companyName']} label="Firma Adı" rules={[{ required: true, message: 'Firma adı zorunlu' }]} style={{ marginBottom: 10 }}>
                                        <Input placeholder="Satıcı firma adı..." />
                                    </Form.Item>
                                    <Row gutter={12}>
                                        <Col span={9}><Form.Item name={['sellerInfo', 'taxNo']} label="VKN / TCKN" style={{ marginBottom: 10 }}><Input placeholder="1234567890" /></Form.Item></Col>
                                        <Col span={9}><Form.Item name={['sellerInfo', 'taxOffice']} label="Vergi Dairesi" style={{ marginBottom: 10 }}><Input placeholder="Kadıköy" /></Form.Item></Col>
                                        <Col span={6}><Form.Item name={['sellerInfo', 'phone']} label="Telefon" style={{ marginBottom: 10 }}><Input placeholder="+90..." /></Form.Item></Col>
                                    </Row>
                                    <Row gutter={12}>
                                        <Col span={14}><Form.Item name={['sellerInfo', 'address']} label="Adres" style={{ marginBottom: 0 }}><Input placeholder="Açık adres..." /></Form.Item></Col>
                                        <Col span={10}><Form.Item name={['sellerInfo', 'email']} label="E-posta" style={{ marginBottom: 0 }}><Input placeholder="info@..." /></Form.Item></Col>
                                    </Row>
                                </>
                            )}
                        </div>

                        {/* ── Line Items ── */}
                        <div style={{ background: '#1e293b', borderRadius: '10px 10px 0 0', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>📦 Kalemler</span>
                            <Button size="small" icon={<PlusOutlined />} onClick={addLine}
                                style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontWeight: 600 }}>
                                Kalem Ekle
                            </Button>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 10px 10px', marginBottom: 16, overflow: 'hidden' }}>
                            {/* Header row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '3fr 80px 80px 110px 70px 70px 32px', gap: 8, background: '#f1f5f9', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                                <div>AÇIKLAMA</div>
                                <div style={{ textAlign: 'center' }}>BİRİM</div>
                                <div style={{ textAlign: 'right' }}>MİKTAR</div>
                                <div style={{ textAlign: 'right' }}>BİRM FİYAT</div>
                                <div style={{ textAlign: 'right' }}>KDV %</div>
                                <div style={{ textAlign: 'right' }}>TOPLAM</div>
                                <div />
                            </div>
                            {lines.map((l, idx) => (
                                <div key={l.id} style={{
                                    display: 'grid', gridTemplateColumns: '3fr 80px 80px 110px 70px 70px 32px',
                                    gap: 8, padding: '6px 10px', alignItems: 'center',
                                    borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none',
                                    background: idx % 2 === 0 ? 'white' : '#fafafa',
                                }}>
                                    <Input size="small" value={l.description} placeholder="Ürün/Hizmet açıklaması..."
                                        onChange={e => updateLine(idx, 'description', e.target.value)} />
                                    <Select size="small" value={l.unit} onChange={v => updateLine(idx, 'unit', v)}>
                                        {UNITS.map(u => <Select.Option key={u} value={u}>{u}</Select.Option>)}
                                    </Select>
                                    <InputNumber size="small" value={l.quantity} min={0} precision={2} style={{ width: '100%' }}
                                        onChange={v => updateLine(idx, 'quantity', v || 0)} />
                                    <InputNumber size="small" value={l.unitPrice} min={0} precision={2} style={{ width: '100%' }}
                                        onChange={v => updateLine(idx, 'unitPrice', v || 0)} />
                                    <Select size="small" value={l.vatRate} onChange={v => updateLine(idx, 'vatRate', v)}>
                                        {VAT_RATES.map(r => <Select.Option key={r} value={r}>%{r}</Select.Option>)}
                                    </Select>
                                    <div style={{ fontFamily: 'monospace', fontSize: 11, textAlign: 'right', fontWeight: 700, color: '#374151' }}>
                                        {fmtTRY(l.lineTotal + l.vatAmount, currency)}
                                    </div>
                                    <Button size="small" type="text" danger icon={<DeleteOutlined />}
                                        onClick={() => removeLine(idx)} disabled={lines.length === 1} />
                                </div>
                            ))}
                        </div>

                        {/* ── Totals + Notes ── */}
                        <Row gutter={16}>
                            <Col span={14}>
                                <Form.Item name="notes" label="Notlar / Açıklamalar">
                                    <Input.TextArea rows={3} placeholder="Fatura notu, ödeme şartları vb..." />
                                </Form.Item>
                            </Col>
                            <Col span={10}>
                                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                                        <Text type="secondary">Ara Toplam</Text>
                                        <Text style={{ fontFamily: 'monospace' }}>{fmtTRY(subTotal, currency)}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                                        <Text style={{ color: '#7c3aed' }}>Toplam KDV</Text>
                                        <Text style={{ fontFamily: 'monospace', color: '#7c3aed' }}>{fmtTRY(totalVat, currency)}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, alignItems: 'center' }}>
                                        <Text style={{ color: '#dc2626' }}>İndirim</Text>
                                        <InputNumber size="small" value={discount} min={0} precision={2} style={{ width: 120, fontFamily: 'monospace' }}
                                            onChange={v => setDiscount(v || 0)} prefix="-" />
                                    </div>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800 }}>
                                        <Text strong>Genel Toplam</Text>
                                        <Text style={{
                                            fontFamily: 'monospace', fontWeight: 800,
                                            color: isSales ? '#16a34a' : '#dc2626',
                                        }}>
                                            {fmtTRY(grandTotal, currency)}
                                        </Text>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    </Form>
                </Modal>

                {/* Print Modal */}
                <PrintModal
                    invoice={printInv}
                    open={!!printInv}
                    onClose={() => setPrintInv(null)}
                    sellerName={branding.companyName}
                />

                {/* Cari Seçim Modalı */}
                <Modal
                    title="Cari Seç"
                    open={cariPickerOpen}
                    onCancel={() => setCariPickerOpen(false)}
                    footer={null}
                    width={700}
                >
                    <Input.Search
                        placeholder="Firma Adı, VKN veya Telefon ara..."
                        allowClear
                        onChange={e => setCariSearch(e.target.value)}
                        style={{ marginBottom: 16 }}
                    />
                    <Table
                        size="small"
                        dataSource={cariList.filter(c =>
                            c.name?.toLowerCase().includes(cariSearch.toLowerCase()) ||
                            c.taxNumber?.includes(cariSearch) ||
                            c.phone?.includes(cariSearch)
                        )}
                        rowKey="id"
                        pagination={{ pageSize: 8 }}
                        columns={[
                            { title: 'Firma Adı', dataIndex: 'name', key: 'name', render: (t) => <b>{t}</b> },
                            { title: 'Telefon', dataIndex: 'phone', key: 'phone' },
                            { title: 'VKN', dataIndex: 'taxNumber', key: 'taxNumber' },
                            {
                                title: '',
                                key: 'action',
                                align: 'right',
                                render: (_, r) => <Button size="small" type="primary" onClick={() => selectCari(r)}>Seç</Button>
                            }
                        ]}
                    />
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
}
