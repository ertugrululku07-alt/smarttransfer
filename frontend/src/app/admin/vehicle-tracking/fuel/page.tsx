'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, InputNumber,
    DatePicker, Space, message, Popconfirm, Typography,
    Row, Col, Statistic, Divider, Tag, Tooltip, Image, Badge, Tabs,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    ReloadOutlined, ArrowLeftOutlined, WarningOutlined,
    CameraOutlined, EnvironmentOutlined, UserOutlined,
    CarOutlined, DashboardOutlined, ExclamationCircleOutlined,
    CheckCircleOutlined, EyeOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app';
const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const fmtKm = (v: number) => v ? `${Number(v).toLocaleString('tr-TR')} km` : '—';

const ANOMALY_LABELS: Record<string, { label: string; color: string }> = {
    'KM_DECREASE': { label: 'KM Düşüşü', color: 'red' },
    'GPS_DISTANCE_MISMATCH': { label: 'GPS Uyumsuz', color: 'orange' },
    'HIGH_CONSUMPTION': { label: 'Yüksek Tüketim', color: 'volcano' },
    'HIGH_FREQUENCY': { label: 'Sık Yakıt Alımı', color: 'gold' },
    'OCR_KM_MISMATCH': { label: 'OCR KM Uyumsuz', color: 'magenta' },
};

interface Vehicle { id: string; plateNumber: string; brand: string; model: string; }

const FuelPage: React.FC = () => {
    const router = useRouter();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selected, setSelected] = useState<Vehicle | null>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [detailModal, setDetailModal] = useState<any | null>(null);
    const [editing, setEditing] = useState<any | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { fetchVehicles(); }, []);

    const fetchVehicles = async () => {
        try {
            const res = await apiClient.get('/api/vehicles');
            const list = res.data?.data || [];
            setVehicles(list);
            if (list.length > 0) { setSelected(list[0]); fetchRecords(list[0].id); }
        } catch { message.error('Araçlar yüklenemedi'); }
    };

    const fetchRecords = async (vid: string) => {
        setLoading(true);
        try {
            const res = await apiClient.get(`/api/vehicle-tracking/${vid}/all-fuel`);
            if (res.data.success) {
                setRecords(res.data.data || []);
                setStats(res.data.stats || {});
            }
        } catch {
            // Fallback to old endpoint
            try {
                const res = await apiClient.get(`/api/vehicle-tracking/${vid}`);
                if (res.data.success) {
                    const fuel = res.data.data.fuel || [];
                    setRecords(fuel.map((f: any) => ({ ...f, source: 'admin' })));
                    const tc = fuel.reduce((s: number, r: any) => s + (Number(r.totalCost) || 0), 0);
                    const tl = fuel.reduce((s: number, r: any) => s + (Number(r.liters) || 0), 0);
                    setStats({ totalCost: tc, totalLiters: tl, avgPrice: tl > 0 ? tc / tl : 0, anomalyCount: 0, total: fuel.length });
                }
            } catch { }
        } finally { setLoading(false); }
    };

    const selectVehicle = (v: Vehicle) => { setSelected(v); fetchRecords(v.id); };

    const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalVisible(true); };
    const openEdit = (rec: any) => {
        if (rec.source === 'driver') return; // Driver records can't be edited
        setEditing(rec);
        form.setFieldsValue({ ...rec, date: rec.date ? dayjs(rec.date) : undefined });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!selected) return;
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const payload = { ...values, date: values.date?.toISOString(), totalCost: (values.liters || 0) * (values.unitPrice || 0) };
            if (editing) {
                await apiClient.put(`/api/vehicle-tracking/${selected.id}/fuel/${editing.id}`, payload);
                message.success('Güncellendi');
            } else {
                await apiClient.post(`/api/vehicle-tracking/${selected.id}/fuel`, payload);
                message.success('Yakıt kaydı eklendi');
            }
            setModalVisible(false);
            fetchRecords(selected.id);
        } catch (e: any) { if (!e?.errorFields) message.error('Kayıt başarısız'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async (rec: any) => {
        if (!selected) return;
        try {
            await apiClient.delete(`/api/vehicle-tracking/${selected.id}/fuel/${rec.id}`);
            message.success('Silindi');
            fetchRecords(selected.id);
        } catch { message.error('Silinemedi'); }
    };

    const photoUrl = (url?: string) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${API_BASE}${url}`;
    };

    const columns: any[] = [
        {
            title: 'Tarih / Saat', dataIndex: 'date', width: 150,
            render: (v: string, r: any) => {
                const d = new Date(v || r.createdAt);
                return (
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{d.toLocaleDateString('tr-TR')}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                );
            },
            sorter: (a: any, b: any) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime(),
            defaultSortOrder: 'descend' as const,
        },
        {
            title: 'Kaynak', dataIndex: 'source', width: 100,
            render: (v: string, r: any) => v === 'driver' ? (
                <Tooltip title={r.driverName}>
                    <Tag icon={<UserOutlined />} color="blue" style={{ fontSize: 10 }}>{r.driverName?.split(' ')[0] || 'Şoför'}</Tag>
                </Tooltip>
            ) : (
                <Tag icon={<DashboardOutlined />} color="default" style={{ fontSize: 10 }}>Manuel</Tag>
            ),
            filters: [{ text: 'Şoför', value: 'driver' }, { text: 'Manuel', value: 'admin' }],
            onFilter: (v: string, r: any) => r.source === v,
        },
        {
            title: 'Litre', dataIndex: 'liters', width: 80,
            render: (v: number) => <Text style={{ fontWeight: 700 }}>{Number(v).toFixed(1)} L</Text>,
            sorter: (a: any, b: any) => a.liters - b.liters,
        },
        {
            title: 'Birim Fiyat', dataIndex: 'unitPrice', width: 100,
            render: (v: number) => v ? <Text style={{ color: '#d97706', fontFamily: 'monospace', fontWeight: 600 }}>{fmtTRY(v)}</Text> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Toplam', dataIndex: 'totalCost', width: 110, align: 'right' as const,
            render: (v: number) => v ? <Text style={{ color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>{fmtTRY(v)}</Text> : <Text type="secondary">—</Text>,
            sorter: (a: any, b: any) => (a.totalCost || 0) - (b.totalCost || 0),
        },
        {
            title: 'KM', width: 130,
            render: (_: any, r: any) => {
                const km = r.km || r.odometer;
                if (!km) return <Text type="secondary">—</Text>;
                const hasOcrMismatch = r.ocrKm && Math.abs(r.ocrKm - km) / km > 0.1;
                return (
                    <div>
                        <div style={{ fontWeight: 700 }}>{fmtKm(km)}</div>
                        {r.ocrKm && (
                            <Tooltip title={`OCR okunan: ${fmtKm(r.ocrKm)} (güven: ${((r.ocrConfidence || 0) * 100).toFixed(0)}%)`}>
                                <div style={{ fontSize: 10, color: hasOcrMismatch ? '#dc2626' : '#16a34a' }}>
                                    {hasOcrMismatch ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />} OCR: {fmtKm(r.ocrKm)}
                                </div>
                            </Tooltip>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Fotoğraf', width: 70, align: 'center' as const,
            render: (_: any, r: any) => r.odometerPhotoUrl ? (
                <Image
                    src={photoUrl(r.odometerPhotoUrl)}
                    width={40} height={40}
                    style={{ borderRadius: 6, objectFit: 'cover', cursor: 'pointer' }}
                    preview={{ mask: <EyeOutlined /> }}
                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                />
            ) : <Text type="secondary" style={{ fontSize: 10 }}>—</Text>,
        },
        {
            title: 'Durum', width: 130,
            render: (_: any, r: any) => {
                if (!r.anomalyFlag) return <Tag color="green" style={{ fontSize: 10 }}>Temiz</Tag>;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(r.anomalyReasons || []).map((reason: string, i: number) => {
                            const info = ANOMALY_LABELS[reason] || { label: reason, color: 'default' };
                            return <Tag key={i} color={info.color} style={{ fontSize: 9, margin: 0 }}><WarningOutlined /> {info.label}</Tag>;
                        })}
                    </div>
                );
            },
            filters: [{ text: 'Şüpheli', value: 'yes' }, { text: 'Temiz', value: 'no' }],
            onFilter: (v: string, r: any) => v === 'yes' ? !!r.anomalyFlag : !r.anomalyFlag,
        },
        {
            title: 'Konum', width: 50, align: 'center' as const,
            render: (_: any, r: any) => r.gpsLocationLat ? (
                <Tooltip title={`${r.gpsLocationLat?.toFixed(4)}, ${r.gpsLocationLng?.toFixed(4)}`}>
                    <a href={`https://www.google.com/maps?q=${r.gpsLocationLat},${r.gpsLocationLng}`} target="_blank" rel="noreferrer">
                        <EnvironmentOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                    </a>
                </Tooltip>
            ) : <Text type="secondary" style={{ fontSize: 10 }}>—</Text>,
        },
        {
            title: 'Notlar', dataIndex: 'notes', ellipsis: true,
            render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text>,
        },
        {
            title: '', width: 80, fixed: 'right' as const,
            render: (_: any, r: any) => (
                <Space size={4}>
                    <Tooltip title="Detay">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)} />
                    </Tooltip>
                    {r.source !== 'driver' && (
                        <>
                            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                            <Popconfirm title="Sil?" onConfirm={() => handleDelete(r)} okText="Evet" cancelText="Hayır">
                                <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking-fuel">
                <div style={{ paddingBottom: 32 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')} size="small" />
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#d97706,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>⛽</div>
                            <div>
                                <Title level={3} style={{ margin: 0, fontWeight: 800 }}>Yakıt Giderleri</Title>
                                <Text type="secondary">Araç yakıt kayıtları · {selected?.plateNumber} · {records.length} kayıt</Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={() => selected && fetchRecords(selected.id)} loading={loading}>Yenile</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} disabled={!selected}
                                style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                                Yakıt Ekle
                            </Button>
                        </Space>
                    </div>

                    <Row gutter={[16, 16]}>
                        {/* Vehicle List */}
                        <Col xs={24} md={5}>
                            <Card variant="borderless" style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} styles={{ body: { padding: 12 } }}>
                                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Araç Seçin</div>
                                {vehicles.map(v => (
                                    <div key={v.id} onClick={() => selectVehicle(v)} style={{
                                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                                        background: selected?.id === v.id ? 'linear-gradient(135deg,#d97706,#fbbf24)' : '#f8fafc',
                                        color: selected?.id === v.id ? 'white' : '#374151',
                                        border: `1px solid ${selected?.id === v.id ? '#d97706' : '#f0f0f0'}`, transition: 'all 0.2s',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{v.brand} {v.model}</div>
                                        <div style={{ fontSize: 11, opacity: 0.75 }}>{v.plateNumber}</div>
                                    </div>
                                ))}
                            </Card>
                        </Col>

                        {/* Main Content */}
                        <Col xs={24} md={19}>
                            {/* Stats */}
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                <Col xs={6}>
                                    <Card variant="borderless" style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fffbeb,#fef9c3)', border: '1px solid #fde68a' }} styles={{ body: { padding: '12px 16px' } }}>
                                        <Statistic title={<Text style={{ color: '#d97706', fontSize: 11 }}>Toplam Yakıt Gideri</Text>} value={stats.totalCost || 0} precision={2} suffix="₺" styles={{ content: { color: '#d97706', fontSize: 18, fontWeight: 700 } }} />
                                    </Card>
                                </Col>
                                <Col xs={6}>
                                    <Card variant="borderless" style={{ borderRadius: 10, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #bbf7d0' }} styles={{ body: { padding: '12px 16px' } }}>
                                        <Statistic title={<Text style={{ color: '#16a34a', fontSize: 11 }}>Toplam Litre</Text>} value={(stats.totalLiters || 0).toFixed(1)} suffix="L" styles={{ content: { color: '#16a34a', fontSize: 18, fontWeight: 700 } }} />
                                    </Card>
                                </Col>
                                <Col xs={6}>
                                    <Card variant="borderless" style={{ borderRadius: 10, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #93c5fd' }} styles={{ body: { padding: '12px 16px' } }}>
                                        <Statistic title={<Text style={{ color: '#2563eb', fontSize: 11 }}>Ort. Litre Fiyatı</Text>} value={(stats.avgPrice || 0).toFixed(2)} suffix="₺" styles={{ content: { color: '#2563eb', fontSize: 18, fontWeight: 700 } }} />
                                    </Card>
                                </Col>
                                <Col xs={6}>
                                    <Card variant="borderless" style={{
                                        borderRadius: 10,
                                        background: (stats.anomalyCount || 0) > 0 ? 'linear-gradient(135deg,#fef2f2,#fecaca)' : 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                                        border: `1px solid ${(stats.anomalyCount || 0) > 0 ? '#fca5a5' : '#bbf7d0'}`
                                    }} styles={{ body: { padding: '12px 16px' } }}>
                                        <Statistic
                                            title={<Text style={{ color: (stats.anomalyCount || 0) > 0 ? '#dc2626' : '#16a34a', fontSize: 11 }}>{(stats.anomalyCount || 0) > 0 ? '⚠️ Şüpheli Kayıt' : '✅ Anomali Yok'}</Text>}
                                            value={stats.anomalyCount || 0}
                                            styles={{ content: { color: (stats.anomalyCount || 0) > 0 ? '#dc2626' : '#16a34a', fontSize: 18, fontWeight: 700 } }}
                                        />
                                    </Card>
                                </Col>
                            </Row>

                            {/* Table */}
                            <Card variant="borderless" style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} styles={{ body: { padding: 0 } }}>
                                <Table
                                    columns={columns}
                                    dataSource={records}
                                    rowKey={(r) => r.id || Math.random().toString()}
                                    loading={loading}
                                    pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} kayıt` }}
                                    size="small"
                                    locale={{ emptyText: 'Yakıt kaydı yok.' }}
                                    scroll={{ x: 1100 }}
                                    rowClassName={(r) => r.anomalyFlag ? 'fuel-row-warning' : ''}
                                />
                            </Card>
                        </Col>
                    </Row>
                </div>

                {/* Add/Edit Modal */}
                <Modal title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>⛽ {editing ? 'Yakıt Düzenle' : 'Yakıt Ekle'} {selected && `— ${selected.plateNumber}`}</div>}
                    open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)} confirmLoading={submitting} okText="Kaydet" cancelText="İptal" width={520}
                    okButtonProps={{ style: { background: 'linear-gradient(135deg,#d97706,#fbbf24)', border: 'none' } }}>
                    <Divider style={{ margin: '12px 0' }} />
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col span={12}><Form.Item name="date" label="Tarih" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item></Col>
                            <Col span={12}><Form.Item name="km" label="Kilometre"><InputNumber style={{ width: '100%' }} min={0} placeholder="Mevcut KM" /></Form.Item></Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}><Form.Item name="liters" label="Litre" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="50.00" /></Form.Item></Col>
                            <Col span={12}><Form.Item name="unitPrice" label="Litre Fiyatı (₺)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="40.00" /></Form.Item></Col>
                        </Row>
                        <Form.Item name="station" label="İstasyon"><Input placeholder="BP, Shell, Opet..." /></Form.Item>
                        <Form.Item name="notes" label="Notlar"><Input.TextArea rows={2} /></Form.Item>
                    </Form>
                </Modal>

                {/* Detail Modal */}
                <Modal
                    title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DashboardOutlined /> Yakıt Kayıt Detayı</div>}
                    open={!!detailModal}
                    onCancel={() => setDetailModal(null)}
                    footer={<Button onClick={() => setDetailModal(null)}>Kapat</Button>}
                    width={640}
                >
                    {detailModal && (
                        <div style={{ marginTop: 12 }}>
                            {/* Source & Status */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                                {detailModal.source === 'driver' ? (
                                    <Tag icon={<UserOutlined />} color="blue">Şoför: {detailModal.driverName}</Tag>
                                ) : (
                                    <Tag icon={<DashboardOutlined />} color="default">Manuel Giriş</Tag>
                                )}
                                {detailModal.fuelType && <Tag color="gold">{detailModal.fuelType}</Tag>}
                                {!detailModal.anomalyFlag && <Tag color="green"><CheckCircleOutlined /> Temiz</Tag>}
                                {(detailModal.anomalyReasons || []).map((r: string, i: number) => {
                                    const info = ANOMALY_LABELS[r] || { label: r, color: 'default' };
                                    return <Tag key={i} color={info.color}><WarningOutlined /> {info.label}</Tag>;
                                })}
                            </div>

                            <Row gutter={[16, 16]}>
                                {/* Info Grid */}
                                <Col span={detailModal.odometerPhotoUrl ? 14 : 24}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12 }}>
                                            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>Tarih & Saat</div>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>
                                                {new Date(detailModal.date || detailModal.createdAt).toLocaleDateString('tr-TR')}
                                                <span style={{ color: '#9ca3af', fontWeight: 500, marginLeft: 6 }}>
                                                    {new Date(detailModal.date || detailModal.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12 }}>
                                            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>Litre</div>
                                            <div style={{ fontWeight: 700, fontSize: 18, color: '#059669' }}>{Number(detailModal.liters).toFixed(1)} L</div>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12 }}>
                                            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>Girilen KM</div>
                                            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtKm(detailModal.km || detailModal.odometer)}</div>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12 }}>
                                            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>Toplam</div>
                                            <div style={{ fontWeight: 700, fontSize: 16, color: '#dc2626' }}>{detailModal.totalCost ? fmtTRY(detailModal.totalCost) : '—'}</div>
                                        </div>
                                    </div>

                                    {/* OCR Section */}
                                    {detailModal.ocrKm && (
                                        <div style={{
                                            background: Math.abs(detailModal.ocrKm - (detailModal.km || detailModal.odometer || 0)) / (detailModal.ocrKm || 1) > 0.1 ? '#fef2f2' : '#f0fdf4',
                                            borderRadius: 10, padding: 12, marginTop: 12,
                                            border: `1px solid ${Math.abs(detailModal.ocrKm - (detailModal.km || detailModal.odometer || 0)) / (detailModal.ocrKm || 1) > 0.1 ? '#fca5a5' : '#bbf7d0'}`
                                        }}>
                                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                                                <CameraOutlined /> OCR Doğrulama
                                            </div>
                                            <Row gutter={12}>
                                                <Col span={8}>
                                                    <div style={{ fontSize: 10, color: '#9ca3af' }}>OCR Okunan KM</div>
                                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtKm(detailModal.ocrKm)}</div>
                                                </Col>
                                                <Col span={8}>
                                                    <div style={{ fontSize: 10, color: '#9ca3af' }}>Girilen KM</div>
                                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtKm(detailModal.km || detailModal.odometer)}</div>
                                                </Col>
                                                <Col span={8}>
                                                    <div style={{ fontSize: 10, color: '#9ca3af' }}>Güven</div>
                                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{((detailModal.ocrConfidence || 0) * 100).toFixed(0)}%</div>
                                                </Col>
                                            </Row>
                                        </div>
                                    )}

                                    {/* GPS Distance Section */}
                                    {(detailModal.gpsDistanceKm || detailModal.previousOdometer) && (
                                        <div style={{ background: '#eff6ff', borderRadius: 10, padding: 12, marginTop: 12, border: '1px solid #bfdbfe' }}>
                                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                                                <EnvironmentOutlined /> GPS Doğrulama
                                            </div>
                                            <Row gutter={12}>
                                                {detailModal.gpsDistanceKm != null && (
                                                    <Col span={8}>
                                                        <div style={{ fontSize: 10, color: '#9ca3af' }}>GPS Mesafe</div>
                                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{detailModal.gpsDistanceKm} km</div>
                                                    </Col>
                                                )}
                                                {detailModal.odometerDeltaKm != null && (
                                                    <Col span={8}>
                                                        <div style={{ fontSize: 10, color: '#9ca3af' }}>KM Farkı</div>
                                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{detailModal.odometerDeltaKm} km</div>
                                                    </Col>
                                                )}
                                                {detailModal.previousOdometer && (
                                                    <Col span={8}>
                                                        <div style={{ fontSize: 10, color: '#9ca3af' }}>Önceki KM</div>
                                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtKm(detailModal.previousOdometer)}</div>
                                                    </Col>
                                                )}
                                            </Row>
                                        </div>
                                    )}

                                    {/* GPS Location */}
                                    {detailModal.gpsLocationLat && (
                                        <div style={{ marginTop: 12 }}>
                                            <a href={`https://www.google.com/maps?q=${detailModal.gpsLocationLat},${detailModal.gpsLocationLng}`} target="_blank" rel="noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
                                                <EnvironmentOutlined /> Yakıt alım konumunu haritada göster →
                                            </a>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    {detailModal.notes && (
                                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginTop: 12 }}>
                                            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700 }}>NOTLAR</div>
                                            <div style={{ fontSize: 13 }}>{detailModal.notes}</div>
                                        </div>
                                    )}
                                </Col>

                                {/* Photo */}
                                {detailModal.odometerPhotoUrl && (
                                    <Col span={10}>
                                        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 8, textAlign: 'center' }}>
                                            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                                                <CameraOutlined /> KM Saati Fotoğrafı
                                            </div>
                                            <Image
                                                src={photoUrl(detailModal.odometerPhotoUrl)}
                                                style={{ borderRadius: 10, maxHeight: 280, objectFit: 'contain' }}
                                                width="100%"
                                                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                                            />
                                        </div>
                                    </Col>
                                )}
                            </Row>
                        </div>
                    )}
                </Modal>

                {/* Styling for warning rows */}
                <style jsx global>{`
                    .fuel-row-warning td { background: #fff7f7 !important; }
                    .fuel-row-warning:hover td { background: #fef2f2 !important; }
                `}</style>
            </AdminLayout>
        </AdminGuard>
    );
};

export default FuelPage;
