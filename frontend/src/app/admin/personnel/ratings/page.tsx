'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Tabs, Button, Input, List, message, Modal, Switch, InputNumber,
    Table, Rate, Tag, Empty, Statistic, Row, Col, Typography, Space, Popconfirm
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined,
    StarFilled, ReloadOutlined, EditOutlined, SaveOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import api from '@/lib/api-client';

const { Title, Text } = Typography;

interface Question {
    id: string;
    text: string;
    order: number;
    isActive: boolean;
}

interface RatingRow {
    bookingId: string;
    bookingNumber: string;
    customerName: string;
    customerPhone: string;
    driverId: string;
    driverName: string;
    startDate: string;
    submittedAt: string;
    overall: number;
    answers: { questionId: string; stars: number }[];
    comment?: string | null;
}

interface DriverStat {
    driverId: string;
    driverName: string;
    count: number;
    sum: number;
    average: number;
}

export default function DriverRatingsAdminPage() {
    const [activeTab, setActiveTab] = useState('questions');

    // ─── Questions tab ──
    const [questions, setQuestions] = useState<Question[]>([]);
    const [defaults, setDefaults] = useState<Question[]>([]);
    const [loadingQs, setLoadingQs] = useState(false);
    const [savingQs, setSavingQs] = useState(false);

    // ─── Ratings list tab ──
    const [ratings, setRatings] = useState<RatingRow[]>([]);
    const [driverStats, setDriverStats] = useState<DriverStat[]>([]);
    const [loadingList, setLoadingList] = useState(false);

    // ─── Modal for editing question ──
    const [editingQ, setEditingQ] = useState<Question | null>(null);
    const [editText, setEditText] = useState('');

    useEffect(() => {
        fetchQuestions();
    }, []);

    useEffect(() => {
        if (activeTab === 'list') fetchRatings();
    }, [activeTab]);

    const fetchQuestions = async () => {
        setLoadingQs(true);
        try {
            const res = await api.get('/api/ratings/admin/questions');
            if (res.data.success) {
                setQuestions(res.data.data.questions || []);
                setDefaults(res.data.data.defaults || []);
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Sorular alınamadı');
        } finally {
            setLoadingQs(false);
        }
    };

    const fetchRatings = async () => {
        setLoadingList(true);
        try {
            const res = await api.get('/api/ratings/admin/list');
            if (res.data.success) {
                setRatings(res.data.data.ratings || []);
                setDriverStats(res.data.data.driverStats || []);
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Liste alınamadı');
        } finally {
            setLoadingList(false);
        }
    };

    const saveQuestions = async () => {
        setSavingQs(true);
        try {
            const cleaned = questions.map((q, i) => ({ ...q, order: i + 1 }));
            const res = await api.put('/api/ratings/admin/questions', { questions: cleaned });
            if (res.data.success) {
                message.success('Sorular kaydedildi');
                setQuestions(res.data.data.questions || cleaned);
            }
        } catch (e: any) {
            message.error(e?.response?.data?.error || 'Kaydedilemedi');
        } finally {
            setSavingQs(false);
        }
    };

    const addQuestion = () => {
        const newQ: Question = {
            id: `q_${Date.now()}`,
            text: 'Yeni soru…',
            order: questions.length + 1,
            isActive: true,
        };
        setQuestions([...questions, newQ]);
        setEditingQ(newQ);
        setEditText(newQ.text);
    };

    const removeQuestion = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    const moveQuestion = (id: string, dir: -1 | 1) => {
        const idx = questions.findIndex(q => q.id === id);
        if (idx < 0) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= questions.length) return;
        const arr = [...questions];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        setQuestions(arr.map((q, i) => ({ ...q, order: i + 1 })));
    };

    const toggleActive = (id: string, value: boolean) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, isActive: value } : q));
    };

    const startEdit = (q: Question) => {
        setEditingQ(q);
        setEditText(q.text);
    };

    const commitEdit = () => {
        if (!editingQ) return;
        setQuestions(questions.map(q => q.id === editingQ.id ? { ...q, text: editText } : q));
        setEditingQ(null);
        setEditText('');
    };

    const restoreDefaults = () => {
        Modal.confirm({
            title: 'Varsayılan soruları yükle',
            content: 'Mevcut sorular varsayılanlarla değiştirilecek. Onaylıyor musunuz?',
            okText: 'Evet, yükle',
            cancelText: 'Vazgeç',
            onOk: () => setQuestions(defaults.map(d => ({ ...d }))),
        });
    };

    // ─── Tab 1: Questions ──
    const QuestionsTab = (
        <div>
            <Card
                title="Müşteriye Yöneltilecek Sorular"
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={restoreDefaults}>Varsayılana Dön</Button>
                        <Button icon={<PlusOutlined />} type="dashed" onClick={addQuestion}>Soru Ekle</Button>
                        <Button icon={<SaveOutlined />} type="primary" loading={savingQs} onClick={saveQuestions}>Kaydet</Button>
                    </Space>
                }
                loading={loadingQs}
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    Müşteri WhatsApp linkine tıkladığında bu sorulara 1-5 yıldız puan verecek. Sorular aktif değilse puanlama sayfasında görünmez.
                </Text>

                <List
                    dataSource={questions}
                    locale={{ emptyText: <Empty description="Henüz soru yok. Soru ekleyerek başlayın." /> }}
                    renderItem={(q, idx) => (
                        <List.Item
                            actions={[
                                <Button key="up" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveQuestion(q.id, -1)} />,
                                <Button key="dn" size="small" icon={<ArrowDownOutlined />} disabled={idx === questions.length - 1} onClick={() => moveQuestion(q.id, 1)} />,
                                <Switch key="act" checked={q.isActive} onChange={(v) => toggleActive(q.id, v)} checkedChildren="Aktif" unCheckedChildren="Pasif" />,
                                <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => startEdit(q)} />,
                                <Popconfirm key="del" title="Sorulu silmek istediğinize emin misiniz?" onConfirm={() => removeQuestion(q.id)} okText="Sil" cancelText="Vazgeç">
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            ]}
                        >
                            <List.Item.Meta
                                avatar={<Tag color="blue">{idx + 1}</Tag>}
                                title={<span style={{ opacity: q.isActive ? 1 : 0.5 }}>{q.text}</span>}
                                description={<Rate disabled defaultValue={5} character={<StarFilled />} style={{ fontSize: 14 }} />}
                            />
                        </List.Item>
                    )}
                />
            </Card>

            <Modal
                title="Soruyu Düzenle"
                open={!!editingQ}
                onOk={commitEdit}
                onCancel={() => { setEditingQ(null); setEditText(''); }}
                okText="Kaydet"
                cancelText="İptal"
            >
                <Input.TextArea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={3}
                    maxLength={200}
                    showCount
                    placeholder="Örn: Şoför zamanında geldi mi?"
                />
            </Modal>
        </div>
    );

    // ─── Tab 2: Ratings ──
    const ratingColumns = [
        {
            title: 'Şoför',
            dataIndex: 'driverName',
            key: 'driverName',
            render: (v: string) => <strong>{v || '-'}</strong>
        },
        {
            title: 'PNR',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            render: (v: string) => <Tag color="blue">{v}</Tag>
        },
        { title: 'Müşteri', dataIndex: 'customerName', key: 'customerName' },
        {
            title: 'Puan',
            dataIndex: 'overall',
            key: 'overall',
            sorter: (a: RatingRow, b: RatingRow) => a.overall - b.overall,
            render: (v: number) => (
                <Space>
                    <Rate disabled allowHalf value={v} character={<StarFilled />} style={{ fontSize: 14 }} />
                    <strong style={{ color: '#f59e0b' }}>{v?.toFixed(1)}</strong>
                </Space>
            )
        },
        {
            title: 'Yorum',
            dataIndex: 'comment',
            key: 'comment',
            render: (v: string | null) => v ? <Text italic style={{ color: '#475569' }}>"{v}"</Text> : <Text type="secondary">—</Text>
        },
        {
            title: 'Tarih',
            dataIndex: 'submittedAt',
            key: 'submittedAt',
            render: (v: string) => v ? new Date(v).toLocaleString('tr-TR') : '-'
        }
    ];

    const RatingsTab = (
        <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                    <Card>
                        <Statistic title="Toplam Değerlendirme" value={ratings.length} prefix={<StarFilled style={{ color: '#f59e0b' }} />} />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card>
                        <Statistic
                            title="Genel Ortalama"
                            value={ratings.length > 0 ? Math.round((ratings.reduce((s, r) => s + Number(r.overall || 0), 0) / ratings.length) * 10) / 10 : 0}
                            precision={1}
                            suffix="/ 5.0"
                            valueStyle={{ color: '#f59e0b' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card>
                        <Statistic title="Puanlanan Şoför Sayısı" value={driverStats.length} />
                    </Card>
                </Col>
            </Row>

            {/* Per-driver leaderboard */}
            <Card title="Şoför Sıralaması" style={{ marginBottom: 16 }}>
                <Table
                    size="small"
                    rowKey="driverId"
                    dataSource={[...driverStats].sort((a, b) => b.average - a.average)}
                    pagination={false}
                    columns={[
                        {
                            title: '#',
                            render: (_, __, idx) => <Tag color={idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'orange' : 'default'}>{idx + 1}</Tag>
                        },
                        { title: 'Şoför', dataIndex: 'driverName' },
                        { title: 'Değerlendirme', dataIndex: 'count', render: (v) => <Tag>{v} adet</Tag> },
                        {
                            title: 'Ortalama',
                            dataIndex: 'average',
                            render: (v) => (
                                <Space>
                                    <Rate disabled allowHalf value={v} character={<StarFilled />} style={{ fontSize: 14 }} />
                                    <strong style={{ color: '#f59e0b' }}>{v.toFixed(1)}</strong>
                                </Space>
                            )
                        }
                    ]}
                />
            </Card>

            <Card title="Tüm Değerlendirmeler" extra={<Button icon={<ReloadOutlined />} onClick={fetchRatings}>Yenile</Button>}>
                <Table
                    size="small"
                    rowKey="bookingId"
                    columns={ratingColumns as any}
                    dataSource={ratings}
                    loading={loadingList}
                    pagination={{ pageSize: 20 }}
                />
            </Card>
        </div>
    );

    return (
        <AdminGuard>
            <AdminLayout>
                <div style={{ padding: 24 }}>
                    <Title level={3} style={{ margin: 0, marginBottom: 16 }}>
                        <StarFilled style={{ color: '#f59e0b', marginRight: 8 }} />
                        Şoför Puanlama Sistemi
                    </Title>

                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={[
                            { key: 'questions', label: 'Sorular', children: QuestionsTab },
                            { key: 'list', label: 'Gelen Puanlamalar', children: RatingsTab },
                        ]}
                    />
                </div>
            </AdminLayout>
        </AdminGuard>
    );
}
