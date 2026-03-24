'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, InputNumber, Select,
    DatePicker, Space, message, Popconfirm, Typography, Row, Col, Statistic, Tag, Divider,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    ReloadOutlined, ArrowLeftOutlined, ToolOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
interface Vehicle { id: string; plateNumber: string; brand: string; model: string; }

const InspectionPage: React.FC = () => {
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
            if (res.data.success) setRecords(res.data.data.inspection || []);
        } catch { } finally { setLoading(false); }
    };
    const selectVehicle = (v: Vehicle) => { setSelected(v); fetchRecords(v.id); };
    const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalVisible(true); };
    const openEdit = (rec: any) => {
        setEditing(rec);
        form.setFieldsValue({ ...rec, date: rec.date ? dayjs(rec.date) : undefined, nextDate: rec.nextDate ? dayjs(rec.nextDate) : undefined });
        setModalVisible(true);
    };
    const handleSave = async () => {
        if (!selected) return;
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const payload = { ...values, date: values.date?.toISOString(), nextDate: values.nextDate?.toISOString() };
            if (editing) {
                await apiClient.put(`/api/vehicle-tracking/${selected.id}/inspection/${editing.id}`, payload);
                message.success('Güncellendi');
            } else {
                await apiClient.post(`/api/vehicle-tracking/${selected.id}/inspection`, payload);
                message.success('Muayene kaydı eklendi');
            }
            setModalVisible(false);
            fetchRecords(selected.id);
        } catch (e: any) { if (!e?.errorFields) message.error('Kayıt başarısız'); }
        finally { setSubmitting(false); }
    };
    const handleDelete = async (rec: any) => {
        if (!selected) return;
        try {
            await apiClient.delete(`/api/vehicle-tracking/${selected.id}/inspection/${rec.id}`);
            message.success('Silindi'); fetchRecords(selected.id);
        } catch { message.error('Silinemedi'); }
    };

    const now = new Date();
    const resultsMap: Record<string, string> = { GECTI: '#16a34a', KALDI: '#dc2626', BEKLENIYOR: '#d97706' };
    const totalCost = records.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const upcoming = records.filter(r => r.nextDate && new Date(r.nextDate) > now);
    const overdue = records.filter(r => r.nextDate && new Date(r.nextDate) < now);

    const columns = [
        { title: 'Muayene Tarihi', dataIndex: 'date', render: (v: string) => v ? new Date(v).toLocaleDateString('tr-TR') : '—', sorter: (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime() },
        {
            title: 'Sonraki Muayene', dataIndex: 'nextDate', render: (v: string) => {
                if (!v) return '—';
                const d = new Date(v);
                const color = d < now ? '#dc2626' : d < new Date(now.getTime() + 30 * 86400000) ? '#d97706' : '#16a34a';
                return <Text style={{ color, fontWeight: 600 }}>{d.toLocaleDateString('tr-TR')}</Text>;
            }
        },
        { title: 'İstasyon', dataIndex: 'station', render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Sonuç', dataIndex: 'result', render: (v: string) => v ? <Tag color={resultsMap[v] || '#6b7280'}>{v}</Tag> : '—' },
        { title: 'Maliyet', dataIndex: 'cost', align: 'right' as const, render: (v: number) => <Text style={{ color: '#dc2626', fontWeight: 600, fontFamily: 'monospace' }}>{fmtTRY(v)}</Text> },
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
            <AdminLayout selectedKey="vehicle-tracking-inspection">
                <div style={{ paddingBottom: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')} size="small" />
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}><ToolOutlined /></div>
                            <div>
                                <Title level={3} style={{ margin: 0, fontWeight: 800 }}>Araç Muayene</Title>
                                <Text type="secondary">Muayene kayıtları · {selected?.plateNumber}</Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={() => selected && fetchRecords(selected.id)} loading={loading}>Yenile</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} disabled={!selected}
                                style={{ background: 'linear-gradient(135deg,#2563eb,#60a5fa)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                                Muayene Ekle
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
                                        background: selected?.id === v.id ? 'linear-gradient(135deg,#2563eb,#60a5fa)' : '#f8fafc',
                                        color: selected?.id === v.id ? 'white' : '#374151',
                                        border: `1px solid ${selected?.id === v.id ? '#2563eb' : '#f0f0f0'}`, transition: 'all 0.2s',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{v.brand} {v.model}</div>
                                        <div style={{ fontSize: 11, opacity: 0.75 }}>{v.plateNumber}</div>
                                    </div>
                                ))}
                            </Card>
                        </Col>
                        <Col xs={24} md={18}>
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                <Col xs={8}><Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fef2f2,#fecaca)', border: '1px solid #fca5a5' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#dc2626', fontSize: 11 }}>Gecikmiş Muayene</Text>} value={overdue.length} valueStyle={{ color: '#dc2626', fontSize: 20, fontWeight: 700 }} />
                                </Card></Col>
                                <Col xs={8}><Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fffbeb,#fef9c3)', border: '1px solid #fde68a' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#d97706', fontSize: 11 }}>Yaklaşan Muayene</Text>} value={upcoming.length} valueStyle={{ color: '#d97706', fontSize: 20, fontWeight: 700 }} />
                                </Card></Col>
                                <Col xs={8}><Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fef2f2,#fecaca)', border: '1px solid #fca5a5' }} bodyStyle={{ padding: '12px 16px' }}>
                                    <Statistic title={<Text style={{ color: '#dc2626', fontSize: 11 }}>Toplam Muayene Gideri</Text>} value={totalCost} precision={2} suffix="₺" valueStyle={{ color: '#dc2626', fontSize: 14, fontWeight: 700 }} />
                                </Card></Col>
                            </Row>
                            <Card bordered={false} style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
                                <Table columns={columns} dataSource={[...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())} rowKey="id" loading={loading} pagination={{ pageSize: 12 }} size="middle" locale={{ emptyText: 'Muayene kaydı yok.' }} />
                            </Card>
                        </Col>
                    </Row>
                </div>

                <Modal title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ToolOutlined style={{ color: '#2563eb' }} /> {editing ? 'Muayene Düzenle' : 'Muayene Ekle'} {selected && `— ${selected.plateNumber}`}</div>}
                    open={modalVisible} onOk={handleSave} onCancel={() => setModalVisible(false)} confirmLoading={submitting} okText="Kaydet" cancelText="İptal" width={520}
                    okButtonProps={{ style: { background: 'linear-gradient(135deg,#2563eb,#60a5fa)', border: 'none' } }}>
                    <Divider style={{ margin: '12px 0' }} />
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col span={12}><Form.Item name="date" label="Muayene Tarihi" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item></Col>
                            <Col span={12}><Form.Item name="nextDate" label="Sonraki Muayene" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item></Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}><Form.Item name="station" label="İstasyon / Muayene Merkezi"><Input placeholder="TÜVTÜRK, resmi..." /></Form.Item></Col>
                            <Col span={12}><Form.Item name="result" label="Sonuç">
                                <Select placeholder="Seçin">
                                    <Select.Option value="GECTI">Geçti ✅</Select.Option>
                                    <Select.Option value="KALDI">Kaldı ❌</Select.Option>
                                    <Select.Option value="BEKLENIYOR">Bekleniyor ⏳</Select.Option>
                                </Select>
                            </Form.Item></Col>
                        </Row>
                        <Form.Item name="cost" label="Muayene Ücreti (₺)"><InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" /></Form.Item>
                        <Form.Item name="notes" label="Notlar"><Input.TextArea rows={2} /></Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default InspectionPage;
