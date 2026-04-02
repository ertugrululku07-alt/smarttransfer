'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Space, Tag, DatePicker, Row, Col, Statistic, Button, Spin, Alert, Divider } from 'antd';
import { PrinterOutlined, ArrowUpOutlined, ArrowDownOutlined, FileTextOutlined, CalendarOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../AgencyLayout';
import AgencyGuard from '../AgencyGuard';
import { useCurrency } from '@/app/context/CurrencyContext';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface TransactionEntry {
    id: string;
    date: string;
    type: string;
    amount: number;
    isCredit: boolean;
    description: string;
    personnelName: string;
    referenceData?: string;
    runningBalance: number;
}

export default function AccountStatementPage() {
    const { formatPrice } = useCurrency();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
    const [currentBalance, setCurrentBalance] = useState<number>(0);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
    const [error, setError] = useState<string | null>(null);

    const [agencyInfo, setAgencyInfo] = useState<any>(null);

    useEffect(() => {
        fetchAgencyInfo();
        fetchStatement();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchAgencyInfo = async () => {
        try {
            const res = await apiClient.get('/api/agency/settings');
            if (res.data.success) {
                setAgencyInfo(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch agency info', err);
        }
    };

    const fetchStatement = async (dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null]) => {
        setLoading(true);
        setError(null);
        try {
            let url = '/api/agency/statement';
            const rangeToUse = dates !== undefined ? dates : dateRange;
            
            if (rangeToUse[0] && rangeToUse[1]) {
                const startStr = rangeToUse[0].format('YYYY-MM-DD');
                const endStr = rangeToUse[1].format('YYYY-MM-DD');
                url += `?startDate=${startStr}&endDate=${endStr}`;
            }

            const res = await apiClient.get(url);
            if (res.data.success) {
                setTransactions(res.data.data.transactions);
                setCurrentBalance(res.data.data.currentBalance);
            } else {
                setError(res.data.error || 'Ekstre alınamadı');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Ekstre yüklenirken hata oluştu');
            console.error('Fetch statement error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (dates: any) => {
        setDateRange(dates || [null, null]);
        fetchStatement(dates || [null, null]);
    };

    const handlePrint = () => {
        window.print();
    };

    const columns = [
        {
            title: 'Tarih',
            dataIndex: 'date',
            key: 'date',
            render: (text: string) => (
                <Text style={{ whiteSpace: 'nowrap' }}><CalendarOutlined /> {dayjs(text).format('DD.MM.YYYY HH:mm')}</Text>
            ),
        },
        {
            title: 'İşlem',
            dataIndex: 'type',
            key: 'type',
            render: (type: string, record: TransactionEntry) => {
                let color = 'default';
                let label = type;
                if (type === 'DEPOSIT') { color = 'green'; label = 'Depozito Yükleme'; }
                if (type === 'MANUAL_OUT') { color = 'red'; label = 'Transfer (Cari Çıkış)'; }
                if (type === 'MANUAL_IN') { color = 'green'; label = 'İade (Cari Giriş)'; }

                return (
                    <Space direction="vertical" size={0}>
                        <Tag color={color}>{label}</Tag>
                        {record.referenceData && <Text type="secondary" style={{ fontSize: '12px' }}>{record.referenceData}</Text>}
                    </Space>
                );
            }
        },
        {
            title: 'Açıklama',
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: 'İşlemi Yapan',
            dataIndex: 'personnelName',
            key: 'personnelName',
            render: (text: string) => (
                <Space><UserOutlined style={{ color: '#8c8c8c' }}/> <Text>{text}</Text></Space>
            )
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            render: (amount: number, record: TransactionEntry) => (
                <Text type={record.isCredit ? 'success' : 'danger'} strong>
                    {record.isCredit ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {' '}{formatPrice(amount, 'TRY')}
                </Text>
            )
        },
        {
            title: 'Bakiye',
            dataIndex: 'runningBalance',
            key: 'runningBalance',
            align: 'right' as const,
            render: (bal: number) => (
                <Text strong style={{ color: '#1890ff' }}>{formatPrice(bal, 'TRY')}</Text>
            )
        }
    ];

    const totalIncome = transactions.filter(t => t.isCredit).reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions.filter(t => !t.isCredit).reduce((acc, t) => acc + t.amount, 0);

    return (
        <AgencyGuard>
            <AgencyLayout>
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }} className="print-container">
                    
                    {/* Header area hidden in print */}
                    <div className="no-print" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Title level={2} style={{ margin: 0 }}><FileTextOutlined /> Hesap Ekstresi</Title>
                            <Text type="secondary">Cari hesabınızla ilgili tüm işlemleri, tarihi ve personeliyle birlikte inceleyin.</Text>
                        </div>
                        <Space>
                            <RangePicker value={dateRange} onChange={handleDateChange} format="DD.MM.YYYY" />
                            <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>Yazdır / PDF</Button>
                        </Space>
                    </div>

                    {/* Print Header (Only visible when printing) */}
                    <div className="print-only" style={{ display: 'none', marginBottom: 30 }}>
                        <Row justify="space-between" align="middle" style={{ borderBottom: '2px solid #000', paddingBottom: 16 }}>
                            <Col>
                                <Title level={2} style={{ margin: 0, color: '#000' }}>HESAP EKSTRESİ</Title>
                                <Text strong style={{ fontSize: 16 }}>{agencyInfo?.companyName || agencyInfo?.name || 'Acente'}</Text>
                                <div><Text>{agencyInfo?.contactEmail} | {agencyInfo?.contactPhone}</Text></div>
                            </Col>
                            <Col style={{ textAlign: 'right' }}>
                                <Text type="secondary" style={{ display: 'block' }}>Oluşturulma Tarihi</Text>
                                <Text strong>{dayjs().format('DD.MM.YYYY HH:mm')}</Text>
                                {(dateRange[0] && dateRange[1]) && (
                                    <div style={{ marginTop: 8 }}>
                                        <Text type="secondary">Dönem: </Text>
                                        <Text strong>{dateRange[0].format('DD.MM.YYYY')} - {dateRange[1].format('DD.MM.YYYY')}</Text>
                                    </div>
                                )}
                            </Col>
                        </Row>
                    </div>

                    {error && <Alert type="error" message={error} style={{ marginBottom: 24 }} className="no-print" />}

                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col xs={24} md={8}>
                            <Card className="stat-card" style={{ background: '#f6ffed', borderColor: '#b7eb8f', height: '100%' }}>
                                <Statistic
                                    title="Dönem İçi Girişler (Kredi/Depozito)"
                                    value={totalIncome}
                                    prefix={<ArrowUpOutlined />}
                                    precision={2}
                                    suffix="₺"
                                    styles={{ content: { color: '#3f8600' } }}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card className="stat-card" style={{ background: '#fff1f0', borderColor: '#ffa39e', height: '100%' }}>
                                <Statistic
                                    title="Dönem İçi Çıkışlar (Satın Alım)"
                                    value={totalExpense}
                                    prefix={<ArrowDownOutlined />}
                                    precision={2}
                                    suffix="₺"
                                    styles={{ content: { color: '#cf1322' } }}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card className="stat-card" style={{ background: '#e6f7ff', borderColor: '#91d5ff', height: '100%' }}>
                                <Statistic
                                    title="Güncel Bakiye (Tüm Zamanlar)"
                                    value={currentBalance}
                                    precision={2}
                                    suffix="₺"
                                    styles={{ content: { color: '#1890ff', fontWeight: 'bold' } }}
                                />
                            </Card>
                        </Col>
                    </Row>

                    <Card variant="borderless" className="table-card" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <Table
                            dataSource={transactions}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            pagination={{
                                pageSize: 100,
                                hideOnSinglePage: true,
                                size: 'small',
                                className: 'no-print' // hide pagination in print
                            }}
                            size="middle"
                        />
                    </Card>

                    <style jsx global>{`
                        @media print {
                            /* Bütün layout yapısını kırıp normal akışa döndür */
                            body, html, #__next, .ant-layout {
                                display: block !important;
                                width: 100% !important;
                                max-width: 100% !important;
                                min-width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background: #ffffff !important;
                                position: static !important;
                            }
                            
                            /* Gizlenecek Elemanlar */
                            .ant-layout-sider,
                            .ant-layout-header,
                            .no-print {
                                display: none !important;
                            }
                            
                            /* Content marginlarını sıfırla */
                            .ant-layout-content {
                                margin: 0 !important;
                                padding: 0 !important;
                                overflow: visible !important;
                            }

                            .print-only {
                                display: block !important;
                            }
                            
                            .print-container {
                                max-width: 100% !important;
                                width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                            }

                            @page {
                                margin: 10mm 15mm;
                                size: a4 portrait;
                            }

                            /* İstatistik Kartları - Print Görünümü */
                            .ant-row {
                                display: flex !important;
                                flex-wrap: nowrap !important;
                                flex-direction: row !important;
                                gap: 10px !important;
                            }
                            .ant-col-xs-24.ant-col-md-8 {
                                flex: 1 1 33% !important;
                                max-width: 33% !important;
                            }
                            .stat-card {
                                border: 1px solid #d9d9d9 !important;
                                box-shadow: none !important;
                                break-inside: avoid;
                                padding: 12px !important;
                            }
                            .stat-card .ant-card-body {
                                padding: 8px !important;
                            }

                            /* Tablo Stil ve Genişlikleri */
                            .table-card {
                                box-shadow: none !important;
                                padding: 0 !important;
                                border: none !important;
                                margin-top: 15px !important;
                            }
                            .ant-table-wrapper, 
                            .ant-table, 
                            .ant-table-container, 
                            .ant-table-content,
                            table {
                                width: 100% !important;
                                max-width: 100% !important;
                            }
                            .ant-table-thead > tr > th {
                                background-color: #f0f0f0 !important;
                                -webkit-print-color-adjust: exact;
                                color-adjust: exact;
                                border-bottom: 2px solid #000 !important;
                                font-weight: bold !important;
                                padding: 8px !important;
                                font-size: 12px !important;
                                white-space: nowrap !important;
                            }
                            .ant-table-tbody > tr > td {
                                border-bottom: 1px solid #f0f0f0 !important;
                                padding: 6px 8px !important;
                                font-size: 11px !important;
                            }
                            .ant-table-tbody > tr > td:first-child {
                                white-space: nowrap !important;
                            }

                            /* Tag vs diğer ufak ayarlar */
                            .ant-tag {
                                border: 1px solid #d9d9d9 !important;
                                background: transparent !important;
                                padding: 0 4px !important;
                                font-size: 10px !important;
                            }
                            .ant-space {
                                display: flex !important;
                                gap: 2px !important;
                            }
                            .ant-space-item {
                                display: block !important;
                            }
                        }
                    `}</style>

                </div>
            </AgencyLayout>
        </AgencyGuard>
    );
}
