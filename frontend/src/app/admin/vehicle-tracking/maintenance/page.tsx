'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, InputNumber, Select,
    DatePicker, Space, message, Popconfirm, Typography, Row, Col, Statistic, Tag, Divider,
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

const MAINT_TYPES = ['YAĞ DEĞİŞİMİ', 'LASTİK', 'FREN', 'AKÜ', 'FİLTRE', 'KAPORTA', 'MOTOR', 'ŞANZIMAN', 'AMORTISÖR', 'KLİMA', 'GENEL BAKIM', 'DİĞER'];
const MAINT_COLORS: Record<string, string> = {
    'YAĞ DEĞİŞİMİ': '#d97706', 'LASTİK': '#7c3aed', 'FREN': '#dc2626',
    'AKÜ': '#2563eb', 'FİLTRE': '#16a34a', 'KAPORTA': '#0891b2',
    'MOTOR': '#ea580c', 'ŞANZIMAN': '#9333ea', 'GENEL BAKIM': '#6366f1',
};

const MaintenancePage: React.FC = () => {
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
            if (res.data.success) setRecords(res.data.data.maintenance || []);
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
            const payload = { ...values, date: values.date?.toISOString() };
            if (editing) {
                await apiClient.put(`/api/vehicle-tracking/${selected.id}/maintenance/${editing.id}`, payload);
                message.success('Güncellendi');
            } else {
                await apiClient.post(`/api/vehicle-tracking/${selected.id}/maintenance`, payload);
                message.success('Bakım kaydı eklendi');
            }
            setModalVisible(false);
            fetchRecords(selected.id);
        } catch (e: any) { if (!e?.errorFields) message.error('Kayıt başarısız'); }
        finally { setSubmitting(false); }
    };
    const handleDelete = async (rec: any) => {
        if (!selected) return;
        try {
            await apiClient.delete(`/api/vehicle-tracking/${selected.id}/maintenance/${rec.id}`);
            message.success('Silindi'); fetchRecords(selected.id);
        } catch { message.error('Silinemedi'); }
    };

    const totalCost = records.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const byType: Record<string, number> = {};
    records.forEach(r => { byType[r.type || 'DİĞER'] = (byType[r.type || 'DİĞER'] || 0) + (Number(r.cost) || 0); });
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

    const columns = [
        { title: 'Tarih', dataIndex: 'date', render: (v: string) => v ? new Date(v).toLocaleDateString('tr-TR') : '—', sorter: (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime() },
        { title: 'Tür', dataIndex: 'type', render: (v: string) => <Tag style={{ borderRadius: 6, fontWeight: 600 }} color={MAINT_COLORS[v] || '#6b7280'}>{v || '—'}</Tag> },
        { title: 'Açıklama', dataIndex: 'description', render: (v: string) => <Text>{v || '—'}</Text> },
        { title: 'KM', dataIndex: 'km', render: (v: number) => v ? `${v.toLocaleString('tr-TR')} km` : '—' },
        { title: 'Servis', dataIndex: 'workshop', render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Maliyet', dataIndex: 'cost', align: 'right' as const, sorter: (a: any, b: any) => a.cost - b.cost, render: (v: number) => <Text style={{ color: '#7c3aed', fontWeight: 700, fontFamily: 'monospace' }}>{fmtTRY(v)}</Text> },
        { title: 'Notlar', dataIndex: 'notes', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
        {
            title: '', render: (_: any, r: any) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    <Popconfirm title="Sil?" onConfirm={() => handleDelete(r)} okText="Evet" cancelText="Hayır">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-tracking-maintenance">
                <div style={{ paddingBottom: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')} size="small" />
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>🔧</div>
                            <div>
                                <Title level={3} style={{ margin: 0, fontWeight: 800 }}>Bakım & Onarım</Title>
                                <Text type="secondary">Araç bakım kayıtları · {selected?.plateNumber}</Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={() => selected && fetchRecords(selected.id)} loading={loading}>Yenile</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} disabled={!selected}
                                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                                Bakım Ekle
                            </Button>
                        </Space>
                    </div>

                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={6}>
                            <Card variant="borderless" style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 12 }}>
                                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Araç Seçin</div>
                                {vehicles.map(v => (
                                    <div key={v.id} onClick={() => selectVehicle(v)} style={{
                                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                                        background: selected?.id === v.id ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : '#f8fafc',
                                        color: selected?.id === v.id ? 'white' : '#374151',
                                        border: `1px solid ${selected?.id === v.id ? '#7c3aed' : '#f0f0f0'}`, transition: 'all 0.2s',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{v.brand} {v.model}</div>
                                        <div style={{ fontSize: 11, opacity: 0.75 }}>{v.plateNumber}</div>
                                    </div>
                                ))}
                            </Card>
                        </Col>
                        <Col xs={24} md={18}>
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                <Col xs={8}><Card variant="borderless" style={{ borderRadius: 10, background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', border: '1px solid #c4b5fd' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#7c3aed', fontSize: 11 }}>Toplam Bakım Gideri</Text>} value={totalCost} precision={2} suffix="₺" styles={{content: { color: '#7c3aed', fontSize: 16, fontWeight: 700 }}} />
                                </Card></Col>
                                <Col xs={8}><Card variant="borderless" style={{ borderRadius: 10, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #93c5fd' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#2563eb', fontSize: 11 }}>Toplam Kayıt</Text>} value={records.length} styles={{content: { color: '#2563eb', fontSize: 20, fontWeight: 700 }}} />
                                </Card></Col>
                                <Col xs={8}><Card variant="borderless" style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fff7ed,#fed7aa)', border: '1px solid #fdba74' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <div style={{ fontSize: 11, color: '#d97706', fontWeight: 700 }}>En Maliyetli Tür</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706', marginTop: 4 }}>{topType ? topType[0] : '—'}</div>
                                    {topType && <div style={{ fontSize: 12, color: '#d97706', fontFamily: 'monospace' }}>{fmtTRY(topType[1])}</div>}
                                </Card></Col>
                            </Row>
                            <Card variant="borderless" style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
                                <Table columns={columns} dataSource={[...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())} rowKey="id" loading={loading} pagination={{ pageSize: 12 }} size="middle" locale={{ emptyText: 'Bakım kaydı yok.' }} />
                            </Card>
                        </Col>
                    </Row>
                </div>

                <Modal title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>🔧 {editing ? 'Bakım Düzenle' : 'Bakım Ekle'} {selected && `— ${selected.plateNumber}`}</div>}
                    open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)} confirmLoading={submitting} okText="Kaydet" cancelText="İptal" width={560}
                    okButtonProps={{ style: { background: 'linear-gradient(135deg,#7c3aed,#a855f7)', border: 'none' } }}>
                    <Divider style={{ margin: '12px 0' }} />
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col span={12}><Form.Item name="date" label="Tarih" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item></Col>
                            <Col span={12}><Form.Item name="type" label="Bakım Türü" rules={[{ required: true }]}>
                                <Select placeholder="Seçin" showSearch>
                                    {MAINT_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                </Select>
                            </Form.Item></Col>
                        </Row>
                        <Form.Item name="description" label="Açıklama"><Input.TextArea rows={2} placeholder="Yapılan işlemler..." /></Form.Item>
                        <Row gutter={16}>
                            <Col span={12}><Form.Item name="cost" label="Maliyet (₺)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" /></Form.Item></Col>
                            <Col span={12}><Form.Item name="km" label="Kilometre"><InputNumber style={{ width: '100%' }} min={0} placeholder="Mevcut KM" /></Form.Item></Col>
                        </Row>
                        <Form.Item name="workshop" label="Servis / Usta"><Input placeholder="Servis adı..." /></Form.Item>
                        <Form.Item name="notes" label="Notlar"><Input.TextArea rows={2} /></Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default MaintenancePage;
