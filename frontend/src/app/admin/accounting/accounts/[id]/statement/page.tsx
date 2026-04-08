'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Typography, Card, Table, Button, Space, Modal, Form,
    Input, InputNumber, Switch, message, Spin, Tag, Row, Col,
    Statistic, DatePicker, Select, Divider, Tooltip, Badge, Empty, Popover
} from 'antd';
import {
    ArrowLeftOutlined, EditOutlined, DownloadOutlined, PrinterOutlined,
    ArrowUpOutlined, ArrowDownOutlined, BankOutlined, FilterOutlined,
    SearchOutlined, ReloadOutlined, FileExcelOutlined, CalendarOutlined,
    PhoneOutlined, MailOutlined, UserOutlined, ClearOutlined,
    CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined,
    WarningOutlined
} from '@ant-design/icons';
import AdminGuard from '@/app/admin/AdminGuard';
import AdminLayout from '@/app/admin/AdminLayout';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// ---- type helpers ----
const TX_TYPE_MAP: Record<string, { label: string; color: string; group: string }> = {
    MANUAL_IN: { label: 'Cari Giriş (Tahsilat)', color: 'green', group: 'manual' },
    MANUAL_OUT: { label: 'Cari Çıkış (Ödeme)', color: 'volcano', group: 'manual' },
    SALES_INVOICE: { label: 'Satış Faturası', color: 'blue', group: 'invoice' },
    PURCHASE_INVOICE: { label: 'Alış Faturası', color: 'geekblue', group: 'invoice' },
    PAYMENT_RECEIVED: { label: 'Tahsilat (Banka/Kredi K.)', color: 'cyan', group: 'payment' },
    PAYMENT_SENT: { label: 'Tediye (Ödeme Yapıldı)', color: 'lime', group: 'payment' },
    DEPOSIT: { label: 'Depozito', color: 'gold', group: 'other' },
    SALARY: { label: 'Maaş / Hakediş', color: 'purple', group: 'other' },
    DEVIR: { label: 'Devir Bakiyesi', color: 'magenta', group: 'other' },
};

const fmt = (val: number) =>
    val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AccountStatementPage() {
    const params = useParams();
    const router = useRouter();
    const accountId = params.id as string;
    const printRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);
    const [accountInfo, setAccountInfo] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);

    // Filter state
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [searchText, setSearchText] = useState('');
    const [directionFilter, setDirectionFilter] = useState<string>('ALL'); // ALL | DEBIT | CREDIT

    // Edit Modal
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingTx, setEditingTx] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        if (accountId) fetchData();
    }, [accountId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const txRes = await apiClient.get(`/api/accounting/accounts/${accountId}/transactions`);
            if (txRes.data.success) {
                let txList = txRes.data.data;
                const account = txRes.data.account;
                if (account) {
                    setAccountInfo(account);
                    const realBalance = Number(account.balance || 0);
                    const txBalance = txList.reduce((acc: number, tx: any) =>
                        acc + (tx.isCredit ? Number(tx.amount) : -Number(tx.amount)), 0);
                    const openingBalance = realBalance - txBalance;
                    if (Math.abs(openingBalance) > 0.01) {
                        txList = [{
                            id: 'devir-bakiyesi',
                            type: 'DEVIR',
                            amount: Math.abs(openingBalance),
                            isCredit: openingBalance > 0,
                            description: 'Geçmiş Dönem Devir Bakiyesi (Sistem Öncesi)',
                            date: txList.length > 0
                                ? new Date(new Date(txList[0].date).getTime() - 1000).toISOString()
                                : new Date('2020-01-01').toISOString(),
                            isOpening: true
                        }, ...txList];
                    }
                }
                setTransactions(txList);
            }
        } catch {
            message.error('Ekstre yüklenirken bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    // ---- Filtering ----
    const filteredTransactions = useCallback(() => {
        return transactions.filter(tx => {
            // Date range
            if (dateRange) {
                const d = dayjs(tx.date);
                if (d.isBefore(dateRange[0].startOf('day')) || d.isAfter(dateRange[1].endOf('day'))) return false;
            }
            // Type
            if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
            // Direction
            if (directionFilter === 'DEBIT' && tx.isCredit) return false;
            if (directionFilter === 'CREDIT' && !tx.isCredit) return false;
            // Text search
            if (searchText) {
                const q = searchText.toLowerCase();
                const desc = (tx.description || '').toLowerCase();
                const type = (TX_TYPE_MAP[tx.type]?.label || tx.type).toLowerCase();
                if (!desc.includes(q) && !type.includes(q)) return false;
            }
            return true;
        });
    }, [transactions, dateRange, typeFilter, directionFilter, searchText]);

    // ---- Running Balance on filtered set ----
    const withRunningBalance = useCallback(() => {
        let running = 0;
        return filteredTransactions().map(tx => {
            running += tx.isCredit ? Number(tx.amount) : -Number(tx.amount);
            return { ...tx, runningBalance: running };
        });
    }, [filteredTransactions]);

    const dataSource = withRunningBalance();

    // Summary on FULL (unfiltered) data
    const totalDebit = transactions.filter(t => !t.isCredit).reduce((a, t) => a + Number(t.amount), 0);
    const totalCredit = transactions.filter(t => t.isCredit).reduce((a, t) => a + Number(t.amount), 0);
    const currentBalance = totalCredit - totalDebit;

    // Summary on FILTERED data
    const filteredDebit = filteredTransactions().filter(t => !t.isCredit).reduce((a, t) => a + Number(t.amount), 0);
    const filteredCredit = filteredTransactions().filter(t => t.isCredit).reduce((a, t) => a + Number(t.amount), 0);
    const isFiltered = dateRange || typeFilter !== 'ALL' || directionFilter !== 'ALL' || searchText;

    const clearFilters = () => {
        setDateRange(null);
        setTypeFilter('ALL');
        setDirectionFilter('ALL');
        setSearchText('');
    };

    // ---- Edit ----
    const handleEditClick = (record: any) => {
        if (record.isOpening) {
            message.warning('Devir bakiyesi geçmiş verilerin toplamıdır. Hesap kartında düzenleyin.');
            return;
        }
        if (record.type !== 'MANUAL_IN' && record.type !== 'MANUAL_OUT') {
            message.warning('Yalnızca manuel giriş/çıkış işlemleri düzenlenebilir.');
            return;
        }
        setEditingTx(record);
        form.setFieldsValue({
            date: dayjs(record.date),
            isCredit: record.isCredit,
            amount: Number(record.amount),
            description: record.description
        });
        setEditModalVisible(true);
    };

    const handleEditSubmit = async (values: any) => {
        try {
            setSaving(true);
            const res = await apiClient.put(`/api/accounting/transactions/${editingTx.id}`, {
                amount: values.amount,
                description: values.description,
                date: values.date.toDate(),
                isCredit: values.isCredit
            });
            if (res.data.success) {
                message.success('İşlem güncellendi');
                setEditModalVisible(false);
                fetchData();
            }
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Güncelleme hatası');
        } finally {
            setSaving(false);
        }
    };

    // ---- Print ----
    const handlePrint = () => {
        if (!printRef.current) return;
        const printContent = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        if (!printWindow) return;
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${accountInfo?.name || 'Hesap'} - Ekstre</title>
                <meta charset="utf-8"/>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; padding: 20px; }
                    .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1677ff; padding-bottom: 16px; }
                    .print-header .company-name { font-size: 22px; font-weight: 700; color: #1677ff; }
                    .print-header .info { text-align: right; color: #555; font-size: 11px; line-height: 1.7; }
                    .account-title { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 4px; }
                    .account-sub { font-size: 11px; color: #666; margin-bottom: 16px; }
                    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
                    .summary-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; text-align: center; }
                    .summary-card .label { font-size: 10px; color: #888; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .summary-card .value { font-size: 16px; font-weight: 700; }
                    .red { color: #cf1322; } .green { color: #389e0d; } .blue { color: #1677ff; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                    thead th { background: #1677ff; color: #fff; padding: 8px 10px; font-size: 11px; font-weight: 600; text-align: left; }
                    thead th:last-child, thead th:nth-last-child(2), thead th:nth-last-child(3) { text-align: right; }
                    tbody tr:nth-child(even) { background: #f9f9f9; }
                    tbody tr { border-bottom: 1px solid #eee; }
                    tbody td { padding: 7px 10px; font-size: 11px; }
                    tbody td:last-child, tbody td:nth-last-child(2), tbody td:nth-last-child(3) { text-align: right; }
                    .tag { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; }
                    .tag-green { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
                    .tag-volcano { background: #fff2e8; color: #d4380d; border: 1px solid #ffbb96; }
                    .tag-blue { background: #e6f4ff; color: #1677ff; border: 1px solid #91caff; }
                    .tag-geekblue { background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; }
                    .tag-cyan { background: #e6fffb; color: #08979c; border: 1px solid #87e8de; }
                    .tag-purple { background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; }
                    .tag-magenta { background: #fff0f6; color: #c41d7f; border: 1px solid #ffadd2; }
                    .tag-gold { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
                    .tag-lime { background: #fcffe6; color: #5b8c00; border: 1px solid #eaff8f; }
                    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; font-size: 10px; color: #aaa; text-align: center; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>${printContent}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    // ---- PDF Export (print-based) ----
    const handlePdfExport = () => {
        if (!printRef.current) return;
        const printContent = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        if (!printWindow) return;
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${accountInfo?.name || 'Hesap'} - Ekstre</title>
                <meta charset="utf-8"/>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; padding: 20px; }
                    .print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1677ff; padding-bottom: 16px; }
                    .print-header .company-name { font-size: 22px; font-weight: 700; color: #1677ff; }
                    .print-header .info { text-align: right; color: #555; font-size: 11px; line-height: 1.7; }
                    .account-title { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 4px; }
                    .account-sub { font-size: 11px; color: #666; margin-bottom: 16px; }
                    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
                    .summary-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; text-align: center; }
                    .summary-card .label { font-size: 10px; color: #888; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .summary-card .value { font-size: 16px; font-weight: 700; }
                    .red { color: #cf1322; } .green { color: #389e0d; } .blue { color: #1677ff; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                    thead th { background: #1677ff; color: #fff; padding: 8px 10px; font-size: 11px; font-weight: 600; text-align: left; }
                    thead th:last-child, thead th:nth-last-child(2), thead th:nth-last-child(3) { text-align: right; }
                    tbody tr:nth-child(even) { background: #f9f9f9; }
                    tbody tr { border-bottom: 1px solid #eee; }
                    tbody td { padding: 7px 10px; font-size: 11px; }
                    tbody td:last-child, tbody td:nth-last-child(2), tbody td:nth-last-child(3) { text-align: right; }
                    .tag { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; }
                    .tag-green { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
                    .tag-volcano { background: #fff2e8; color: #d4380d; border: 1px solid #ffbb96; }
                    .tag-blue { background: #e6f4ff; color: #1677ff; border: 1px solid #91caff; }
                    .tag-geekblue { background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; }
                    .tag-cyan { background: #e6fffb; color: #08979c; border: 1px solid #87e8de; }
                    .tag-purple { background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; }
                    .tag-magenta { background: #fff0f6; color: #c41d7f; border: 1px solid #ffadd2; }
                    .tag-gold { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
                    .tag-lime { background: #fcffe6; color: #5b8c00; border: 1px solid #eaff8f; }
                    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; font-size: 10px; color: #aaa; text-align: center; }
                    @page { size: A4 landscape; margin: 1cm; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body onload="window.print();window.close();">${printContent}</body>
            </html>
        `);
        printWindow.document.close();
    };

    // ---- Printable content builder ----
    const buildPrintContent = () => {
        const filterNote = isFiltered ? `
            <div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:11px;color:#d48806;">
                ⚠️ Bu ekstre aktif filtreler uygulanarak oluşturulmuştur.
                ${dateRange ? ` Tarih: ${dateRange[0].format('DD.MM.YYYY')} - ${dateRange[1].format('DD.MM.YYYY')}.` : ''}
                ${typeFilter !== 'ALL' ? ` Tür: ${TX_TYPE_MAP[typeFilter]?.label || typeFilter}.` : ''}
                ${directionFilter !== 'ALL' ? ` Yön: ${directionFilter === 'DEBIT' ? 'Yalnızca Borç' : 'Yalnızca Alacak'}.` : ''}
            </div>` : '';

        const rows = dataSource.map((tx, i) => {
            const meta = TX_TYPE_MAP[tx.type] || { label: tx.type, color: 'default' };
            const tagClass = `tag-${meta.color}`;
            const debit = !tx.isCredit ? `<span style="color:#cf1322;font-weight:600;">₺${fmt(Number(tx.amount))}</span>` : '-';
            const credit = tx.isCredit ? `<span style="color:#389e0d;font-weight:600;">₺${fmt(Number(tx.amount))}</span>` : '-';
            const bal = tx.runningBalance;
            const balStr = `<span style="color:${bal >= 0 ? '#389e0d' : '#cf1322'};font-weight:700;">₺${fmt(Math.abs(bal))} ${bal >= 0 ? '(A)' : '(B)'}</span>`;
            return `<tr>
                <td>${i + 1}</td>
                <td>${dayjs(tx.date).format('DD.MM.YYYY HH:mm')}</td>
                <td><span class="tag ${tagClass}">${meta.label}</span></td>
                <td>${tx.description || '-'}</td>
                <td style="text-align:right">${debit}</td>
                <td style="text-align:right">${credit}</td>
                <td style="text-align:right">${balStr}</td>
            </tr>`;
        }).join('');

        const bal = currentBalance;
        return `
            <div class="print-header">
                <div>
                    <div class="company-name">Hesap Ekstresi</div>
                    <div style="font-size:11px;color:#555;margin-top:4px;">Oluşturma: ${dayjs().format('DD.MM.YYYY HH:mm')}</div>
                </div>
                <div class="info">
                    ${accountInfo?.name ? `<strong>${accountInfo.name}</strong><br/>` : ''}
                    ${accountInfo?.phone ? `📞 ${accountInfo.phone}<br/>` : ''}
                    ${accountInfo?.email ? `✉️ ${accountInfo.email}` : ''}
                </div>
            </div>
            ${filterNote}
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="label">Toplam Borç (Bizden Çıkan)</div>
                    <div class="value red">₺${fmt(totalDebit)}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Toplam Alacak (Bize Gelen)</div>
                    <div class="value green">₺${fmt(totalCredit)}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Güncel Bakiye</div>
                    <div class="value ${bal >= 0 ? 'green' : 'red'}">₺${fmt(Math.abs(bal))} ${bal >= 0 ? '(Alacaklı)' : '(Borçlu)'}</div>
                </div>
            </div>
            <table>
                <thead><tr>
                    <th>#</th><th>Tarih</th><th>İşlem Tipi</th><th>Açıklama</th>
                    <th style="text-align:right">Borç (₺)</th>
                    <th style="text-align:right">Alacak (₺)</th>
                    <th style="text-align:right">Bakiye (₺)</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="footer">Bu belge sistem tarafından otomatik olarak oluşturulmuştur. • Toplam ${dataSource.length} işlem listelenmektedir.</div>
        `;
    };

    // ---- Columns ----
    const columns = [
        {
            title: '#',
            key: 'index',
            width: 50,
            render: (_: any, __: any, idx: number) => (
                <Text type="secondary" style={{ fontSize: 12 }}>{idx + 1}</Text>
            )
        },
        {
            title: 'Tarih',
            dataIndex: 'date',
            key: 'date',
            width: 130,
            render: (val: string) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{dayjs(val).format('HH:mm')}</div>
                </div>
            )
        },
        {
            title: 'İşlem Tipi',
            dataIndex: 'type',
            key: 'type',
            width: 190,
            render: (val: string) => {
                const meta = TX_TYPE_MAP[val] || { label: val, color: 'default' };
                return <Tag color={meta.color} style={{ fontSize: 11, padding: '2px 8px' }}>{meta.label}</Tag>;
            }
        },
        {
            title: 'Açıklama',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (val: string) => (
                <Tooltip title={val}>
                    <Text style={{ fontSize: 13 }}>{val || <Text type="secondary" italic>Açıklama yok</Text>}</Text>
                </Tooltip>
            )
        },
        {
            title: 'Borç (Debit)',
            dataIndex: 'amount',
            key: 'debit',
            align: 'right' as const,
            width: 140,
            render: (val: any, record: any) => !record.isCredit
                ? (
                    <div style={{ textAlign: 'right' }}>
                        <Text strong style={{ color: '#cf1322', fontSize: 14 }}>
                            ₺{fmt(Number(val))}
                        </Text>
                    </div>
                ) : <Text type="secondary">—</Text>
        },
        {
            title: 'Alacak (Credit)',
            dataIndex: 'amount',
            key: 'credit',
            align: 'right' as const,
            width: 140,
            render: (val: any, record: any) => record.isCredit
                ? (
                    <div style={{ textAlign: 'right' }}>
                        <Text strong style={{ color: '#389e0d', fontSize: 14 }}>
                            ₺{fmt(Number(val))}
                        </Text>
                    </div>
                ) : <Text type="secondary">—</Text>
        },
        {
            title: 'Bakiye',
            dataIndex: 'runningBalance',
            key: 'balance',
            align: 'right' as const,
            width: 160,
            render: (val: number) => {
                const isPos = val >= 0;
                return (
                    <div style={{ textAlign: 'right' }}>
                        <Text strong style={{ color: isPos ? '#389e0d' : '#cf1322', fontSize: 14 }}>
                            ₺{fmt(Math.abs(val))}
                        </Text>
                        <br />
                        <Text style={{ fontSize: 10, color: isPos ? '#52c41a' : '#ff4d4f' }}>
                            {isPos ? '● Alacaklı' : '● Borçlu'}
                        </Text>
                    </div>
                );
            }
        },
        {
            title: '',
            key: 'actions',
            width: 50,
            render: (_: any, record: any) => {
                const isEditable = record.type === 'MANUAL_IN' || record.type === 'MANUAL_OUT';
                return isEditable ? (
                    <Tooltip title="Düzenle">
                        <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined style={{ color: '#1677ff' }} />}
                            onClick={() => handleEditClick(record)}
                        />
                    </Tooltip>
                ) : null;
            }
        }
    ];

    const balStatus = currentBalance >= 0
        ? { label: 'Alacaklı', color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' }
        : { label: 'Borçlu', color: '#ff4d4f', bg: '#fff1f0', border: '#ffa39e' };

    return (
        <AdminGuard>
            <AdminLayout selectedKey="accounting-statements">
                <div style={{ maxWidth: 1400, margin: '0 auto' }}>

                    {/* ===== HEADER ===== */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
                        borderRadius: 16,
                        padding: '28px 32px',
                        marginBottom: 24,
                        color: '#fff',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        {/* decorative circles */}
                        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
                        <div style={{ position: 'absolute', bottom: -30, right: 80, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                            <div>
                                <Button
                                    type="text"
                                    icon={<ArrowLeftOutlined />}
                                    onClick={() => router.back()}
                                    style={{ color: 'rgba(255,255,255,0.8)', padding: 0, marginBottom: 8, fontSize: 13 }}
                                >
                                    Geri Dön
                                </Button>
                                <Title level={2} style={{ margin: 0, color: '#fff', fontSize: 26, fontWeight: 700 }}>
                                    {accountInfo ? `${accountInfo.name}` : 'Hesap Ekstresi'}
                                </Title>
                                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15 }}>
                                    Cari Hesap Ekstresi
                                </Text>

                                {accountInfo && (
                                    <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                        {accountInfo.code && (
                                            <Tag color="blue" style={{ fontSize: 12, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>
                                                {accountInfo.code}
                                            </Tag>
                                        )}
                                        {accountInfo.phone && (
                                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                                                <PhoneOutlined style={{ marginRight: 5 }} />{accountInfo.phone}
                                            </Text>
                                        )}
                                        {accountInfo.email && (
                                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                                                <MailOutlined style={{ marginRight: 5 }} />{accountInfo.email}
                                            </Text>
                                        )}
                                    </div>
                                )}
                            </div>

                            <Space direction="vertical" align="end">
                                <Space>
                                    <Button
                                        icon={<ReloadOutlined />}
                                        onClick={fetchData}
                                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
                                    >
                                        Yenile
                                    </Button>
                                    <Button
                                        icon={<PrinterOutlined />}
                                        onClick={handlePrint}
                                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
                                    >
                                        Yazdır
                                    </Button>
                                    <Button
                                        icon={<DownloadOutlined />}
                                        type="primary"
                                        onClick={handlePdfExport}
                                        style={{ background: '#fff', color: '#1677ff', border: 'none', fontWeight: 600 }}
                                    >
                                        PDF İndir
                                    </Button>
                                </Space>
                                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                                    Oluşturma: {dayjs().format('DD.MM.YYYY HH:mm')}
                                </Text>
                            </Space>
                        </div>
                    </div>

                    {/* ===== SUMMARY CARDS ===== */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col xs={24} sm={8}>
                            <Card
                                variant="borderless"
                                style={{ borderRadius: 12, border: '1px solid #ffccc7', background: 'linear-gradient(135deg, #fff1f0 0%, #fff7f5 100%)' }}
                                bodyStyle={{ padding: '20px 24px' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <Text style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                            Toplam Borç (Bizden Çıkan)
                                        </Text>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: '#cf1322', marginTop: 4, lineHeight: 1.2 }}>
                                            ₺{fmt(totalDebit)}
                                        </div>
                                        <Text style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                                            {transactions.filter(t => !t.isCredit).length} işlem
                                        </Text>
                                    </div>
                                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ff4d4f22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ArrowUpOutlined style={{ fontSize: 22, color: '#cf1322' }} />
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card
                                variant="borderless"
                                style={{ borderRadius: 12, border: '1px solid #b7eb8f', background: 'linear-gradient(135deg, #f6ffed 0%, #f9fff4 100%)' }}
                                bodyStyle={{ padding: '20px 24px' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <Text style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                            Toplam Alacak (Bize Gelen)
                                        </Text>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: '#389e0d', marginTop: 4, lineHeight: 1.2 }}>
                                            ₺{fmt(totalCredit)}
                                        </div>
                                        <Text style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                                            {transactions.filter(t => t.isCredit).length} işlem
                                        </Text>
                                    </div>
                                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#52c41a22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ArrowDownOutlined style={{ fontSize: 22, color: '#389e0d' }} />
                                    </div>
                                </div>
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card
                                variant="borderless"
                                style={{ borderRadius: 12, border: `1px solid ${balStatus.border}`, background: `linear-gradient(135deg, ${balStatus.bg} 0%, #ffffff 100%)` }}
                                bodyStyle={{ padding: '20px 24px' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <Text style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                            Güncel Bakiye
                                        </Text>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: balStatus.color, marginTop: 4, lineHeight: 1.2 }}>
                                            ₺{fmt(Math.abs(currentBalance))}
                                        </div>
                                        <Tag color={currentBalance >= 0 ? 'success' : 'error'} style={{ marginTop: 4, fontWeight: 600 }}>
                                            {balStatus.label}
                                        </Tag>
                                    </div>
                                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${balStatus.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <BankOutlined style={{ fontSize: 22, color: balStatus.color }} />
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    </Row>

                    {/* ===== FILTER PANEL ===== */}
                    <Card
                        variant="borderless"
                        style={{ borderRadius: 12, marginBottom: 16, border: '1px solid #e8e8e8' }}
                        bodyStyle={{ padding: '16px 20px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#1677ff' }} />
                                <Text strong style={{ fontSize: 14, whiteSpace: 'nowrap' }}>Filtrele:</Text>
                            </div>

                            <RangePicker
                                value={dateRange}
                                onChange={(val) => setDateRange(val as any)}
                                format="DD.MM.YYYY"
                                placeholder={['Başlangıç', 'Bitiş']}
                                style={{ minWidth: 230 }}
                                suffixIcon={<CalendarOutlined />}
                            />

                            <Select
                                value={typeFilter}
                                onChange={setTypeFilter}
                                style={{ minWidth: 180 }}
                                dropdownMatchSelectWidth={false}
                            >
                                <Option value="ALL">Tüm İşlem Türleri</Option>
                                {Object.entries(TX_TYPE_MAP).map(([key, val]) => (
                                    <Option key={key} value={key}>
                                        <Tag color={val.color} style={{ fontSize: 11 }}>{val.label}</Tag>
                                    </Option>
                                ))}
                            </Select>

                            <Select
                                value={directionFilter}
                                onChange={setDirectionFilter}
                                style={{ minWidth: 160 }}
                            >
                                <Option value="ALL">Tüm Yönler</Option>
                                <Option value="DEBIT">
                                    <Text style={{ color: '#cf1322' }}>↑ Yalnızca Borç</Text>
                                </Option>
                                <Option value="CREDIT">
                                    <Text style={{ color: '#389e0d' }}>↓ Yalnızca Alacak</Text>
                                </Option>
                            </Select>

                            <Input
                                prefix={<SearchOutlined />}
                                placeholder="Açıklama veya tür ara..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                style={{ flex: 1, minWidth: 200 }}
                                allowClear
                            />

                            {isFiltered && (
                                <Button
                                    icon={<ClearOutlined />}
                                    onClick={clearFilters}
                                    title="Filtreleri Temizle"
                                    type="dashed"
                                    danger
                                >
                                    Temizle
                                </Button>
                            )}
                        </div>

                        {/* Active filter summary row */}
                        {isFiltered && (
                            <div style={{ marginTop: 10, padding: '8px 12px', background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <WarningOutlined style={{ color: '#d48806' }} />
                                <Text style={{ fontSize: 12, color: '#d48806' }}>
                                    <strong>Filtre aktif:</strong> Gösterilen {dataSource.length} / {transactions.length} işlem •
                                    Filtreli Borç: <strong style={{ color: '#cf1322' }}>₺{fmt(filteredDebit)}</strong> •
                                    Filtreli Alacak: <strong style={{ color: '#389e0d' }}>₺{fmt(filteredCredit)}</strong>
                                </Text>
                            </div>
                        )}
                    </Card>

                    {/* ===== TABLE ===== */}
                    <Card
                        variant="borderless"
                        style={{ borderRadius: 12, border: '1px solid #e8e8e8' }}
                        bodyStyle={{ padding: 0 }}
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                                <Text strong style={{ fontSize: 15 }}>Hesap Hareketleri</Text>
                                <Badge count={dataSource.length} showZero color="#1677ff" style={{ fontSize: 11 }} />
                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                                    (çift tıklayarak manuel işlemleri düzenleyebilirsiniz)
                                </Text>
                            </div>
                        }
                    >
                        <Table
                            dataSource={dataSource}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            pagination={{
                                pageSize: 50,
                                showSizeChanger: true,
                                pageSizeOptions: ['25', '50', '100', '200'],
                                showTotal: (total) => `Toplam ${total} işlem`,
                                style: { padding: '12px 16px' }
                            }}
                            size="middle"
                            scroll={{ x: 900 }}
                            onRow={(record) => ({
                                onDoubleClick: () => handleEditClick(record),
                                style: {
                                    cursor: (record.type === 'MANUAL_IN' || record.type === 'MANUAL_OUT') ? 'pointer' : 'default',
                                    background: record.isOpening ? '#fffbe6' : undefined,
                                    transition: 'background 0.2s'
                                },
                                className: 'statement-row'
                            })}
                            rowClassName={(record) => record.isOpening ? 'opening-row' : ''}
                            locale={{ emptyText: <Empty description="İşlem bulunamadı" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                        />
                    </Card>

                    {/* ===== HIDDEN PRINT AREA ===== */}
                    <div style={{ display: 'none' }}>
                        <div ref={printRef} dangerouslySetInnerHTML={{ __html: buildPrintContent() }} />
                    </div>

                    {/* ===== EDIT MODAL ===== */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <EditOutlined style={{ color: '#1677ff' }} />
                                <span>Cari İşlem Düzenle</span>
                            </div>
                        }
                        open={editModalVisible}
                        onCancel={() => setEditModalVisible(false)}
                        onOk={() => form.submit()}
                        confirmLoading={saving}
                        okText="Kaydet"
                        cancelText="İptal"
                        okButtonProps={{ icon: <CheckCircleOutlined /> }}
                        cancelButtonProps={{ icon: <CloseCircleOutlined /> }}
                        width={500}
                    >
                        <div style={{ padding: '4px 0 12px' }}>
                            <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 12px', marginBottom: 16, display: 'flex', gap: 8, fontSize: 12, color: '#1677ff' }}>
                                <InfoCircleOutlined />
                                <span>Yalnızca manuel girilen Cari Giriş/Çıkış işlemleri düzenlenebilir.</span>
                            </div>
                        </div>
                        <Form form={form} layout="vertical" onFinish={handleEditSubmit}>
                            <Form.Item
                                name="date"
                                label="İşlem Tarihi"
                                rules={[{ required: true, message: 'Tarih seçiniz' }]}
                            >
                                <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                name="isCredit"
                                label="İşlem Yönü"
                                valuePropName="checked"
                                rules={[{ required: true }]}
                            >
                                <Switch
                                    checkedChildren="✅ Cari Giriş (Alacak +)"
                                    unCheckedChildren="❌ Cari Çıkış (Borç -)"
                                />
                            </Form.Item>
                            <Form.Item
                                name="amount"
                                label="Tutar (₺)"
                                rules={[{ required: true, message: 'Tutar giriniz' }]}
                            >
                                <InputNumber
                                    min={0.01}
                                    step={0.01}
                                    style={{ width: '100%' }}
                                    formatter={(v) => `₺ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={(v) => v!.replace(/₺\s?|(,*)/g, '') as any}
                                />
                            </Form.Item>
                            <Form.Item name="description" label="Açıklama">
                                <Input.TextArea rows={3} placeholder="İşlem açıklaması..." />
                            </Form.Item>
                        </Form>
                    </Modal>

                </div>

                <style>{`
                    .statement-row:hover td { background: #f0f7ff !important; }
                    .opening-row td { background: #fffbe6 !important; }
                    .opening-row:hover td { background: #fff3cc !important; }
                `}</style>

            </AdminLayout>
        </AdminGuard>
    );
}
