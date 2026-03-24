'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, InputNumber, Select,
    DatePicker, Space, Tag, message, Popconfirm, Typography,
    Row, Col, Avatar, Statistic, Divider, Badge,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, CarOutlined,
    SafetyOutlined, ReloadOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface Vehicle { id: string; plateNumber: string; brand: string; model: string; }

const fmtTRY = (v: number) => Number(v || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

const VehicleInsurancePage: React.FC = () => {
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
            if (list.length > 0 && !selected) {
                setSelected(list[0]);
                fetchRecords(list[0].id);
            }
        } catch { message.error('Araçlar yüklenemedi'); }
    };

    const fetchRecords = async (vehicleId: string) => {
        setLoading(true);
        try {
            const res = await apiClient.get(`/api/vehicle-tracking/${vehicleId}`);
            if (res.data.success) setRecords(res.data.data.insurance || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    };

    const selectVehicle = (v: Vehicle) => {
        setSelected(v);
        fetchRecords(v.id);
    };

    const openAdd = () => {
        setEditing(null);
        form.resetFields();
        setModalVisible(true);
    };

    const openEdit = (rec: any) => {
        setEditing(rec);
        form.setFieldsValue({
            ...rec,
            startDate: rec.startDate ? dayjs(rec.startDate) : undefined,
            endDate: rec.endDate ? dayjs(rec.endDate) : undefined,
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!selected) return;
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const payload = {
                ...values,
                startDate: values.startDate?.toISOString(),
                endDate: values.endDate?.toISOString(),
            };
            if (editing) {
                await apiClient.put(`/api/vehicle-tracking/${selected.id}/insurance/${editing.id}`, payload);
                message.success('Sigorta güncellendi');
            } else {
                await apiClient.post(`/api/vehicle-tracking/${selected.id}/insurance`, payload);
                message.success('Sigorta eklendi');
            }
            setModalVisible(false);
            fetchRecords(selected.id);
        } catch (e: any) {
            if (!e?.errorFields) message.error('Kayıt başarısız');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (rec: any) => {
        if (!selected) return;
        try {
            await apiClient.delete(`/api/vehicle-tracking/${selected.id}/insurance/${rec.id}`);
            message.success('Silindi');
            fetchRecords(selected.id);
        } catch { message.error('Silinemedi'); }
    };

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const getStatus = (rec: any) => {
        if (!rec.endDate) return { label: 'Belirsiz', color: '#6b7280' };
        const end = new Date(rec.endDate);
        if (end < now) return { label: 'Süresi Doldu', color: '#dc2626' };
        if (end < in30) return { label: 'Yakında Bitiyor', color: '#d97706' };
        return { label: 'Geçerli', color: '#16a34a' };
    };

    const totalCost = records.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const activeIns = records.filter(r => r.endDate && new Date(r.endDate) >= now).length;

    const columns = [
        {
            title: 'Şirket / Poliçe',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.company}</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{r.policyNo}</Text>
                </div>
            ),
        },
        {
            title: 'Durum',
            render: (_: any, r: any) => {
                const s = getStatus(r);
                return <Tag color={s.color} style={{ borderRadius: 6 }}>{s.label}</Tag>;
            },
        },
        {
            title: 'Başlangıç',
            dataIndex: 'startDate',
            render: (v: string) => v ? new Date(v).toLocaleDateString('tr-TR') : '—',
        },
        {
            title: 'Bitiş',
            dataIndex: 'endDate',
            render: (v: string) => v ? new Date(v).toLocaleDateString('tr-TR') : '—',
        },
        {
            title: 'Prim',
            dataIndex: 'cost',
            align: 'right' as const,
            render: (v: number) => <Text style={{ color: '#dc2626', fontWeight: 600, fontFamily: 'monospace' }}>{fmtTRY(v)}</Text>,
        },
        {
            title: 'Notlar',
            dataIndex: 'notes',
            render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text>,
        },
        {
            title: '',
            render: (_: any, r: any) => (
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
            <AdminLayout selectedKey="vehicle-tracking-insurance">
                <div style={{ paddingBottom: 32 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/admin/vehicle-tracking')} size="small" />
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#16a34a,#4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>
                                <SafetyOutlined />
                            </div>
                            <div>
                                <Title level={3} style={{ margin: 0, fontWeight: 800 }}>Sigorta Takibi</Title>
                                <Text type="secondary">Araç sigortaları · {selected?.plateNumber}</Text>
                            </div>
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={() => selected && fetchRecords(selected.id)} loading={loading}>Yenile</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}
                                disabled={!selected}
                                style={{ background: 'linear-gradient(135deg,#16a34a,#4ade80)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                                Sigorta Ekle
                            </Button>
                        </Space>
                    </div>

                    <Row gutter={[16, 16]}>
                        {/* Vehicle Selector */}
                        <Col xs={24} md={6}>
                            <Card bordered={false} style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 12 }}>
                                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Araç Seçin</div>
                                {vehicles.map(v => (
                                    <div
                                        key={v.id}
                                        onClick={() => selectVehicle(v)}
                                        style={{
                                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                                            background: selected?.id === v.id ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#f8fafc',
                                            color: selected?.id === v.id ? 'white' : '#374151',
                                            border: `1px solid ${selected?.id === v.id ? '#6366f1' : '#f0f0f0'}`,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{v.brand} {v.model}</div>
                                        <div style={{ fontSize: 11, opacity: 0.75 }}>{v.plateNumber}</div>
                                    </div>
                                ))}
                            </Card>
                        </Col>

                        {/* Main Content */}
                        <Col xs={24} md={18}>
                            {/* Summary */}
                            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                                <Col xs={8}>
                                    <Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #bbf7d0' }} bodyStyle={{ padding: '12px 16px' }}>
                                        <Statistic title={<Text style={{ color: '#16a34a', fontSize: 11 }}>Aktif Sigorta</Text>} value={activeIns} valueStyle={{ color: '#16a34a', fontSize: 20, fontWeight: 700 }} />
                                    </Card>
                                </Col>
                                <Col xs={8}>
                                    <Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#fef2f2,#fecaca)', border: '1px solid #fca5a5' }} bodyStyle={{ padding: '12px 16px' }}>
                                        <Statistic title={<Text style={{ color: '#dc2626', fontSize: 11 }}>Toplam Prim</Text>} value={totalCost} precision={2} suffix="₺" valueStyle={{ color: '#dc2626', fontSize: 16, fontWeight: 700 }} />
                                    </Card>
                                </Col>
                                <Col xs={8}>
                                    <Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #93c5fd' }} bodyStyle={{ padding: '12px 16px' }}>
                                        <Statistic title={<Text style={{ color: '#2563eb', fontSize: 11 }}>Toplam Kayıt</Text>} value={records.length} valueStyle={{ color: '#2563eb', fontSize: 20, fontWeight: 700 }} />
                                    </Card>
                                </Col>
                            </Row>
                            <Card bordered={false} style={{ borderRadius: 14, border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
                                <Table
                                    columns={columns}
                                    dataSource={[...records].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 10 }}
                                    size="middle"
                                    locale={{ emptyText: selected ? 'Bu araç için sigorta kaydı yok. Eklemek için butona tıklayın.' : 'Lütfen bir araç seçin.' }}
                                />
                            </Card>
                        </Col>
                    </Row>
                </div>

                {/* Modal */}
                <Modal
                    title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SafetyOutlined style={{ color: '#16a34a' }} />{editing ? 'Sigorta Düzenle' : 'Yeni Sigorta Ekle'} {selected && `— ${selected.plateNumber}`}</div>}
                    open={modalVisible}
                    onOk={handleSave}
                    onCancel={() => setModalVisible(false)}
                    confirmLoading={submitting}
                    okText="Kaydet" cancelText="İptal"
                    width={560}
                    okButtonProps={{ style: { background: 'linear-gradient(135deg,#16a34a,#4ade80)', border: 'none' } }}
                >
                    <Divider style={{ margin: '12px 0' }} />
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="company" label="Sigorta Şirketi" rules={[{ required: true }]}>
                                    <Input placeholder="Allianz, Axa, Mapfre..." />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="policyNo" label="Poliçe No">
                                    <Input placeholder="POL-2024-XXXXX" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="startDate" label="Başlangıç Tarihi" rules={[{ required: true }]}>
                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="endDate" label="Bitiş Tarihi" rules={[{ required: true }]}>
                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="cost" label="Prim Tutarı (₺)">
                                    <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="type" label="Sigorta Türü">
                                    <Select placeholder="Seçin">
                                        <Select.Option value="KASKO">Kasko</Select.Option>
                                        <Select.Option value="TRAFIK">Trafik</Select.Option>
                                        <Select.Option value="KASKO_TRAFIK">Kasko + Trafik</Select.Option>
                                        <Select.Option value="DIGER">Diğer</Select.Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="notes" label="Notlar">
                            <Input.TextArea rows={2} placeholder="Ek notlar..." />
                        </Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default VehicleInsurancePage;
