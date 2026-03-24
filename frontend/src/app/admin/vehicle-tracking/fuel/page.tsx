'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, InputNumber,
    DatePicker, Space, message, Popconfirm, Typography,
    Row, Col, Statistic, Divider,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    ReloadOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

interface Vehicle { id: string; plateNumber: string; brand: string; model: string; }

const FuelPage: React.FC = () => {
    const router = useRouter();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selected, setSelected] = useState<Vehicle | null>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
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
            const res = await apiClient.get(`/api/vehicle-tracking/${vid}`);
            if (res.data.success) setRecords(res.data.data.fuel || []);
        } catch { } finally { setLoading(false); }
    };

    const selectVehicle = (v: Vehicle) => { setSelected(v); fetchRecords(v.id); };

    const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalVisible(true); };
    const openEdit = (rec: any) => {
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

    const totalCost = records.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
    const totalLiters = records.reduce((s, r) => s + (Number(r.liters) || 0), 0);
    const avgUnitPrice = records.length > 0 ? totalCost / totalLiters : 0;

    const columns = [
        { title: 'Tarih', dataIndex: 'date', render: (v: string) => v ? new Date(v).toLocaleDateString('tr-TR') : '—', sorter: (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime() },
        { title: 'Litre', dataIndex: 'liters', render: (v: number) => <Text style={{ fontWeight: 600 }}>{v} L</Text> },
        { title: 'Birim Fiyat', dataIndex: 'unitPrice', render: (v: number) => <Text style={{ color: '#d97706', fontFamily: 'monospace' }}>{fmtTRY(v)}</Text> },
        { title: 'Toplam', dataIndex: 'totalCost', align: 'right' as const, render: (v: number, r: any) => <Text style={{ color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>{fmtTRY(v || (r.liters * r.unitPrice))}</Text>, sorter: (a: any, b: any) => a.totalCost - b.totalCost },
        { title: 'KM', dataIndex: 'km', render: (v: number) => v ? `${v.toLocaleString('tr-TR')} km` : '—' },
        { title: 'İstasyon', dataIndex: 'station', render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Notlar', dataIndex: 'notes', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
        {
            title: '', render: (_: any, r: any) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    <Popconfirm title="Sil?" onConfirm={() => handleDelete(r)} okText="Evet" cancelText="Hayır">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking-fuel">
                <div style={{ paddingBottom: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')} size="small" />
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#d97706,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>⛽</div>
                            <div>
                                <Title level={3} style={{ margin: 0, fontWeight: 800 }}>Yakıt Giderleri</Title>
                                <Text type="secondary">Araç yakıt kayıtları · {selected?.plateNumber}</Text>
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
                        <Col xs={24} md={6}>
                            <Card bordered={false} style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 12 }}>
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
                        <Col xs={24} md={18}>
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                <Col xs={8}><Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fffbeb,#fef9c3)', border: '1px solid #fde68a' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#d97706', fontSize: 11 }}>Toplam Yakıt Gideri</Text>} value={totalCost} precision={2} suffix="₺" valueStyle={{ color: '#d97706', fontSize: 16, fontWeight: 700 }} />
                                </Card></Col>
                                <Col xs={8}><Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #bbf7d0' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#16a34a', fontSize: 11 }}>Toplam Litre</Text>} value={totalLiters.toFixed(1)} suffix="L" valueStyle={{ color: '#16a34a', fontSize: 20, fontWeight: 700 }} />
                                </Card></Col>
                                <Col xs={8}><Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #93c5fd' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#2563eb', fontSize: 11 }}>Ort. Litre Fiyatı</Text>} value={avgUnitPrice.toFixed(2)} suffix="₺" valueStyle={{ color: '#2563eb', fontSize: 20, fontWeight: 700 }} />
                                </Card></Col>
                            </Row>
                            <Card bordered={false} style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
                                <Table columns={columns} dataSource={[...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())} rowKey="id" loading={loading} pagination={{ pageSize: 12 }} size="middle" locale={{ emptyText: 'Yakıt kaydı yok.' }} />
                            </Card>
                        </Col>
                    </Row>
                </div>

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
                        <Form.Item name="station" label="İstasyon / Pump"><Input placeholder="BP, Shell, Opet..." /></Form.Item>
                        <Form.Item name="notes" label="Notlar"><Input.TextArea rows={2} /></Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default FuelPage;
