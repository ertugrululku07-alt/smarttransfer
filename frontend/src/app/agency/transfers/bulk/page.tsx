'use client';

import React, { useState } from 'react';
import { Card, Button, Typography, message, Upload, Table, Alert, Space } from 'antd';
import { InboxOutlined, CloudUploadOutlined, DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../../AgencyLayout';
import AgencyGuard from '../../AgencyGuard';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

type ParsedTransfer = {
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
    pickup?: string;
    dropoff?: string;
    date: string;
    passengers: number;
    amount: number;
    currency?: string;
    vehicleType?: string;
    paymentMethod?: string;
    notes?: string;
};

// Header alias mapping (case-insensitive)
const HEADER_ALIASES: Record<string, keyof ParsedTransfer> = {
    'ad soyad': 'contactName',
    'isim': 'contactName',
    'müşteri': 'contactName',
    'musteri': 'contactName',
    'name': 'contactName',
    'contactname': 'contactName',
    'telefon': 'contactPhone',
    'phone': 'contactPhone',
    'contactphone': 'contactPhone',
    'email': 'contactEmail',
    'e-posta': 'contactEmail',
    'eposta': 'contactEmail',
    'contactemail': 'contactEmail',
    'alış': 'pickup',
    'alis': 'pickup',
    'pickup': 'pickup',
    'kalkış': 'pickup',
    'kalkis': 'pickup',
    'varış': 'dropoff',
    'varis': 'dropoff',
    'dropoff': 'dropoff',
    'iniş': 'dropoff',
    'inis': 'dropoff',
    'tarih': 'date',
    'date': 'date',
    'datetime': 'date',
    'yolcu': 'passengers',
    'yolcusayısı': 'passengers',
    'yolcusayisi': 'passengers',
    'passengers': 'passengers',
    'pax': 'passengers',
    'tutar': 'amount',
    'fiyat': 'amount',
    'amount': 'amount',
    'price': 'amount',
    'paraBirimi': 'currency',
    'parabirimi': 'currency',
    'currency': 'currency',
    'araç': 'vehicleType',
    'arac': 'vehicleType',
    'vehicletype': 'vehicleType',
    'ödeme': 'paymentMethod',
    'odeme': 'paymentMethod',
    'paymentmethod': 'paymentMethod',
    'not': 'notes',
    'notes': 'notes',
    'açıklama': 'notes',
    'aciklama': 'notes',
};

const normalizeKey = (k: string) => String(k || '').trim().toLowerCase().replace(/\s+/g, '');

const parseDate = (v: any): string => {
    if (!v) return new Date().toISOString();
    if (v instanceof Date) return v.toISOString();
    // Excel serial number
    if (typeof v === 'number' && v > 25569) {
        const ms = (v - 25569) * 86400 * 1000;
        return new Date(ms).toISOString();
    }
    const s = String(v).trim();
    // dd/mm/yyyy or dd.mm.yyyy
    const trMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (trMatch) {
        const [, d, m, y, hh, mm] = trMatch;
        const yr = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
        const dt = new Date(yr, parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hh || '0', 10), parseInt(mm || '0', 10));
        if (!isNaN(dt.getTime())) return dt.toISOString();
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
};

const parseFile = async (file: File): Promise<ParsedTransfer[]> => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('Dosyada okunabilir sayfa yok');

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: true });
    if (rows.length === 0) throw new Error('Dosya boş veya geçerli satır yok');

    return rows
        .map((row) => {
            const out: any = {};
            for (const [key, value] of Object.entries(row)) {
                const norm = normalizeKey(key);
                const mapped = HEADER_ALIASES[norm];
                if (mapped) out[mapped] = value;
            }
            const transfer: ParsedTransfer = {
                contactName: String(out.contactName || '').trim(),
                contactPhone: String(out.contactPhone || '').trim(),
                contactEmail: out.contactEmail ? String(out.contactEmail).trim() : undefined,
                pickup: out.pickup ? String(out.pickup).trim() : undefined,
                dropoff: out.dropoff ? String(out.dropoff).trim() : undefined,
                date: parseDate(out.date),
                passengers: parseInt(String(out.passengers || '1'), 10) || 1,
                amount: parseFloat(String(out.amount || '0').replace(',', '.')) || 0,
                currency: out.currency ? String(out.currency).trim().toUpperCase() : undefined,
                vehicleType: out.vehicleType ? String(out.vehicleType).trim() : undefined,
                paymentMethod: out.paymentMethod ? String(out.paymentMethod).trim().toUpperCase() : undefined,
                notes: out.notes ? String(out.notes).trim() : undefined,
            };
            return transfer;
        })
        .filter((t) => t.contactName && t.contactPhone);
};

const downloadTemplate = () => {
    const headers = [
        ['Ad Soyad', 'Telefon', 'Email', 'Alış', 'Varış', 'Tarih', 'Yolcu', 'Tutar', 'Para Birimi', 'Ödeme'],
    ];
    const sample = [
        ['Ali Veli', '5551234567', 'ali@example.com', 'Antalya Havalimanı', 'Kemer Otel', '01.06.2026 14:30', 2, 1500, 'TRY', 'BALANCE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transferler');
    XLSX.writeFile(wb, 'toplu-transfer-sablon.xlsx');
};

const AgencyBulkTransferPage = () => {
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<any[]>([]);
    const [parsed, setParsed] = useState<ParsedTransfer[]>([]);
    const [parseError, setParseError] = useState<string>('');

    const handleFileChange = async (info: any) => {
        const next = info.fileList.slice(-1);
        setFileList(next);
        setParseError('');
        setParsed([]);
        const f: File | undefined = next[0]?.originFileObj;
        if (!f) return;
        try {
            const rows = await parseFile(f);
            if (rows.length === 0) {
                setParseError('Dosyada geçerli satır bulunamadı. Şablonu kontrol edin (Ad Soyad ve Telefon zorunlu).');
            } else {
                setParsed(rows);
            }
        } catch (err: any) {
            setParseError(err?.message || 'Dosya okunamadı');
        }
    };

    const handleUpload = async () => {
        if (parsed.length === 0) {
            return message.warning('Önce geçerli bir dosya yükleyin.');
        }
        try {
            setLoading(true);
            const res = await apiClient.post('/api/agency/bookings/bulk', { transfers: parsed });
            if (res.data?.success) {
                message.success(`${parsed.length} transfer başarıyla içeri aktarıldı.`);
                setFileList([]);
                setParsed([]);
            } else {
                message.error(res.data?.error || 'Yükleme başarısız');
            }
        } catch (error: any) {
            console.error('Bulk upload error:', error);
            message.error(error?.response?.data?.error || 'Toplu yükleme sırasında hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'Ad Soyad', dataIndex: 'contactName', key: 'contactName' },
        { title: 'Telefon', dataIndex: 'contactPhone', key: 'contactPhone' },
        { title: 'Alış', dataIndex: 'pickup', key: 'pickup' },
        { title: 'Varış', dataIndex: 'dropoff', key: 'dropoff' },
        { title: 'Tarih', dataIndex: 'date', key: 'date', render: (v: string) => new Date(v).toLocaleString('tr-TR') },
        { title: 'Yolcu', dataIndex: 'passengers', key: 'passengers', width: 70 },
        { title: 'Tutar', dataIndex: 'amount', key: 'amount', render: (v: number, r: ParsedTransfer) => `${v} ${r.currency || ''}` },
    ];

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="bulk-transfer">
                <Card bordered={false}>
                    <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Toplu Transfer Yükleme (Excel / CSV)</Title>
                            <Text type="secondary">Elinizdeki listeyi Excel veya CSV formatında tek seferde sisteme aktarabilirsiniz.</Text>
                        </div>
                        <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
                            Şablonu İndir
                        </Button>
                    </div>

                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Beklenen sütunlar"
                        description="Ad Soyad, Telefon, Email, Alış, Varış, Tarih (gg.aa.yyyy ss:dd), Yolcu, Tutar, Para Birimi, Ödeme. Sütun başlıkları Türkçe veya İngilizce yazılabilir."
                    />

                    <div style={{ border: '1px solid #d9d9d9', padding: 24, borderRadius: 8, background: '#fafafa' }}>
                        <Dragger
                            name="file"
                            multiple={false}
                            fileList={fileList}
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileChange}
                            beforeUpload={() => false}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">Dosyayı seçmek için tıklayın veya buraya sürükleyin</p>
                            <p className="ant-upload-hint">.xlsx, .xls ve .csv dosyaları desteklenmektedir.</p>
                        </Dragger>

                        {parseError && (
                            <Alert type="error" showIcon style={{ marginTop: 16 }} message={parseError} />
                        )}

                        {parsed.length > 0 && (
                            <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
                                <Paragraph strong style={{ margin: 0 }}>Önizleme — {parsed.length} satır</Paragraph>
                                <Table
                                    rowKey={(_r, i) => String(i)}
                                    size="small"
                                    columns={columns}
                                    dataSource={parsed}
                                    pagination={{ pageSize: 10 }}
                                    scroll={{ x: 'max-content' }}
                                />
                            </Space>
                        )}

                        <div style={{ marginTop: 24, textAlign: 'center' }}>
                            <Button
                                type="primary"
                                onClick={handleUpload}
                                disabled={parsed.length === 0}
                                loading={loading}
                                icon={<CloudUploadOutlined />}
                                size="large"
                            >
                                {parsed.length > 0 ? `${parsed.length} Transferi Yükle` : 'Yüklemeyi Başlat'}
                            </Button>
                        </div>
                    </div>
                </Card>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyBulkTransferPage;
