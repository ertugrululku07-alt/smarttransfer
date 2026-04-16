'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import {
    Table, Button, Card, Tag, Space, Modal, Form, Input, InputNumber,
    Select, message, Popconfirm, Row, Col, Statistic, Drawer, Timeline,
    Badge, Tooltip, Divider, DatePicker, Typography, Avatar, Empty
} from 'antd';
import {
    PlusOutlined, DollarOutlined, WalletOutlined, UserOutlined,
    ArrowUpOutlined, ArrowDownOutlined, ClockCircleOutlined,
    DeleteOutlined, FileTextOutlined, ReloadOutlined, TeamOutlined,
    GiftOutlined
} from '@ant-design/icons';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient, { getImageUrl } from '@/lib/api-client';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.locale('tr');

const { Text, Title } = Typography;
const { Option } = Select;

interface PersonnelPayroll {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    department?: string;
    phone?: string;
    email?: string;
    salary: number;
    totalAdvance: number;
    totalSalary: number;
    balance: number;
    photo?: string;
    transactions: PayrollTx[];
}

interface PayrollTx {
    id: string;
    type: 'ADVANCE' | 'SALARY';
    amount: number;
    note?: string;
    period?: string;
    date: string;
}

export default function PayrollPage() {
    const { defaultCurrency: _defCur } = useDefinitions();
    const fmt = (n: number) => {
        const code = _defCur?.code || 'TRY';
        try { return n.toLocaleString('tr-TR', { style: 'currency', currency: code }); }
        catch { return `${n.toFixed(2)} ${code}`; }
    };
    const [personnel, setPersonnel] = useState<PersonnelPayroll[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPerson, setSelectedPerson] = useState<PersonnelPayroll | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [advanceModal, setAdvanceModal] = useState(false);
    const [salaryModal, setSalaryModal] = useState(false);
    const [advanceForm] = Form.useForm();
    const [salaryForm] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [searchText, setSearchText] = useState('');

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            // Use the existing /api/personnel endpoint (available on production)
            const res = await apiClient.get('/api/personnel');
            if (res.data.success) {
                const raw: any[] = res.data.data;
                const mapped: PersonnelPayroll[] = raw
                    .filter((p: any) => p.isActive !== false && !p.deletedAt)
                    .map((p: any) => {
                        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
                        const transactions: PayrollTx[] = Array.isArray(meta.transactions) ? meta.transactions : [];
                        const totalAdvance = transactions.filter(t => t.type === 'ADVANCE').reduce((s, t) => s + (t.amount || 0), 0);
                        const totalSalary = transactions.filter(t => t.type === 'SALARY').reduce((s, t) => s + (t.amount || 0), 0);
                        return {
                            id: p.id,
                            firstName: p.firstName,
                            lastName: p.lastName,
                            jobTitle: p.jobTitle,
                            department: p.department,
                            phone: p.phone,
                            email: p.email,
                            photo: p.photo || undefined,
                            salary: parseFloat(p.salary) || 0,
                            totalAdvance,
                            totalSalary,
                            balance: totalAdvance - totalSalary,
                            transactions
                        };
                    });
                setPersonnel(mapped);
            }
        } catch {
            message.error('Veriler yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, []);


    useEffect(() => { fetch(); }, [fetch]);

    const totalSalaryBudget = personnel.reduce((s, p) => s + p.salary, 0);
    const totalAdvances = personnel.reduce((s, p) => s + p.totalAdvance, 0);
    const totalPaid = personnel.reduce((s, p) => s + p.totalSalary, 0);

    const filtered = personnel.filter(p =>
        `${p.firstName} ${p.lastName} ${p.jobTitle || ''} ${p.department || ''}`.toLowerCase().includes(searchText.toLowerCase())
    );

    const openAdvance = (p: PersonnelPayroll) => {
        setSelectedPerson(p);
        advanceForm.resetFields();
        advanceForm.setFieldsValue({ personnelId: p.id, date: dayjs() });
        setAdvanceModal(true);
    };

    const openSalary = (p: PersonnelPayroll) => {
        setSelectedPerson(p);
        salaryForm.resetFields();
        salaryForm.setFieldsValue({
            personnelId: p.id,
            amount: p.salary,
            date: dayjs(),
            period: dayjs().format('MMMM YYYY')
        });
        setSalaryModal(true);
    };

    const openHistory = (p: PersonnelPayroll) => {
        setSelectedPerson(p);
        setDrawerOpen(true);
    };

    // Helper: persist updated transactions to personnel metadata via existing PUT endpoint
    const persistTransactions = async (person: PersonnelPayroll, updatedTxs: PayrollTx[]) => {
        await apiClient.put(`/api/personnel/${person.id}`, {
            metadata: { transactions: updatedTxs }
        });
    };

    const handleAdvance = async () => {
        try {
            const vals = await advanceForm.validateFields();
            if (!selectedPerson) return;
            setSubmitting(true);
            const newTx: PayrollTx = {
                id: `tx-${Date.now()}`,
                type: 'ADVANCE',
                amount: parseFloat(vals.amount),
                note: vals.note || '',
                date: vals.date?.toISOString() || new Date().toISOString()
            };
            const updatedTxs = [...selectedPerson.transactions, newTx];
            await persistTransactions(selectedPerson, updatedTxs);
            message.success('Avans kaydedildi');
            setAdvanceModal(false);
            fetch();
        } catch (e: any) {
            if (!e.errorFields) message.error('Avans kaydedilemedi');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSalary = async () => {
        try {
            const vals = await salaryForm.validateFields();
            if (!selectedPerson) return;
            setSubmitting(true);
            const newTx: PayrollTx = {
                id: `tx-${Date.now()}`,
                type: 'SALARY',
                amount: parseFloat(vals.amount),
                note: vals.note || '',
                period: vals.period || '',
                date: vals.date?.toISOString() || new Date().toISOString()
            };
            const updatedTxs = [...selectedPerson.transactions, newTx];
            await persistTransactions(selectedPerson, updatedTxs);
            message.success('Maaş ödemesi kaydedildi');
            setSalaryModal(false);
            fetch();
        } catch (e: any) {
            if (!e.errorFields) message.error('Kayıt başarısız');
        } finally {
            setSubmitting(false);
        }
    };

    const deleteTransaction = async (tx: PayrollTx) => {
        if (!selectedPerson) return;
        try {
            const updatedTxs = selectedPerson.transactions.filter(t => t.id !== tx.id);
            await persistTransactions(selectedPerson, updatedTxs);
            message.success('İşlem silindi');
            // update local state immediately
            const updatedPerson = { ...selectedPerson, transactions: updatedTxs };
            setSelectedPerson(updatedPerson);
            fetch();
        } catch {
            message.error('Silinemedi');
        }
    };

    const columns = [
        {
            title: 'Personel',
            key: 'name',
            render: (_: any, p: PersonnelPayroll) => (
                <Space>
                    <Avatar
                        src={getImageUrl(p.photo)}
                        style={{ background: '#6366f1' }}
                        icon={<UserOutlined />}
                        size={36}
                    />
                    <div>
                        <div style={{ fontWeight: 700 }}>{p.firstName} {p.lastName}</div>
                        <Text type="secondary" style={{ fontSize: 11 }}>{p.jobTitle || '—'}{p.department ? ` · ${p.department}` : ''}</Text>
                    </div>
                </Space>
            )
        },
        {
            title: 'Aylık Maaş',
            dataIndex: 'salary',
            key: 'salary',
            render: (v: number) => <Tag color="blue">{fmt(v)}</Tag>
        },
        {
            title: 'Toplam Avans',
            dataIndex: 'totalAdvance',
            key: 'totalAdvance',
            render: (v: number) => <span style={{ color: '#d97706', fontWeight: 600 }}>{fmt(v)}</span>
        },
        {
            title: 'Ödenen Maaş',
            dataIndex: 'totalSalary',
            key: 'totalSalary',
            render: (v: number) => <span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(v)}</span>
        },
        {
            title: 'Bakiye (Borç)',
            dataIndex: 'balance',
            key: 'balance',
            render: (v: number) => (
                <span style={{ color: v > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {v > 0 ? `▲ ${fmt(v)}` : v < 0 ? `▼ ${fmt(Math.abs(v))}` : '—'}
                </span>
            )
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, p: PersonnelPayroll) => (
                <Space size={4} wrap>
                    <Tooltip title="Avans Ver">
                        <Button size="small" icon={<GiftOutlined />} onClick={() => openAdvance(p)} style={{ borderRadius: 6, color: '#d97706', borderColor: '#d97706' }}>
                            Avans
                        </Button>
                    </Tooltip>
                    <Tooltip title="Maaş Öde">
                        <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openSalary(p)} style={{ borderRadius: 6 }}>
                            Maaş
                        </Button>
                    </Tooltip>
                    <Tooltip title="İşlem Geçmişi">
                        <Button size="small" icon={<FileTextOutlined />} onClick={() => openHistory(p)} style={{ borderRadius: 6 }}>
                            Geçmiş
                        </Button>
                    </Tooltip>
                </Space>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="payroll">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Stats */}
                    <Row gutter={16}>
                        <Col xs={24} sm={6}>
                            <Card variant="borderless" style={{ borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff' }}>
                                <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Toplam Personel</span>}
                                    value={personnel.length} prefix={<TeamOutlined />}
                                    styles={{ content: { color: '#fff' } }} />
                            </Card>
                        </Col>
                        <Col xs={24} sm={6}>
                            <Card variant="borderless" style={{ borderRadius: 12 }}>
                                <Statistic title="Aylık Maaş Bütçesi" value={totalSalaryBudget} precision={2}
                                    suffix="₺" prefix={<WalletOutlined />} styles={{ content: { color: '#2563eb' } }} />
                            </Card>
                        </Col>
                        <Col xs={24} sm={6}>
                            <Card variant="borderless" style={{ borderRadius: 12 }}>
                                <Statistic title="Toplam Avans" value={totalAdvances} precision={2}
                                    suffix="₺" prefix={<ArrowUpOutlined />} styles={{ content: { color: '#d97706' } }} />
                            </Card>
                        </Col>
                        <Col xs={24} sm={6}>
                            <Card variant="borderless" style={{ borderRadius: 12 }}>
                                <Statistic title="Ödenen Maaş (Toplam)" value={totalPaid} precision={2}
                                    suffix="₺" prefix={<ArrowDownOutlined />} styles={{ content: { color: '#16a34a' } }} />
                            </Card>
                        </Col>
                    </Row>

                    {/* Table */}
                    <Card
                        title={<span style={{ fontWeight: 700, fontSize: 16 }}>👥 Personel Maaş & Hakediş</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    placeholder="Personel ara..."
                                    size="small"
                                    style={{ width: 200 }}
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                />
                                <Button icon={<ReloadOutlined />} size="small" onClick={fetch} loading={loading}>Yenile</Button>
                            </Space>
                        }
                        style={{ borderRadius: 12 }}
                    >
                        <Table
                            columns={columns}
                            dataSource={filtered}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 15, showSizeChanger: true }}
                            size="small"
                            locale={{ emptyText: <Empty description="Aktif personel bulunamadı" /> }}
                        />
                    </Card>
                </div>

                {/* Advance Modal */}
                <Modal
                    title={<span>💸 Avans Ver — {selectedPerson?.firstName} {selectedPerson?.lastName}</span>}
                    open={advanceModal}
                    onOk={handleAdvance}
                    onCancel={() => setAdvanceModal(false)}
                    confirmLoading={submitting}
                    okText="Avans Kaydet"
                    cancelText="İptal"
                >
                    <Form form={advanceForm} layout="vertical">
                        <Form.Item name="personnelId" hidden><Input /></Form.Item>
                        <Form.Item name="amount" label="Avans Tutarı (₺)" rules={[{ required: true, message: 'Tutar zorunludur' }]}>
                            <InputNumber min={1} style={{ width: '100%' }} precision={2} formatter={v => `₺ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                        </Form.Item>
                        <Form.Item name="date" label="Tarih" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                        <Form.Item name="note" label="Açıklama">
                            <Input.TextArea rows={2} placeholder="İsteğe bağlı not..." />
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Salary Modal */}
                <Modal
                    title={<span>💰 Maaş Öde — {selectedPerson?.firstName} {selectedPerson?.lastName}</span>}
                    open={salaryModal}
                    onOk={handleSalary}
                    onCancel={() => setSalaryModal(false)}
                    confirmLoading={submitting}
                    okText="Maaş Ödemesi Kaydet"
                    cancelText="İptal"
                >
                    <Form form={salaryForm} layout="vertical">
                        <Form.Item name="personnelId" hidden><Input /></Form.Item>
                        <Row gutter={12}>
                            <Col span={12}>
                                <Form.Item name="amount" label="Ödeme Tutarı (₺)" rules={[{ required: true }]}>
                                    <InputNumber min={1} style={{ width: '100%' }} precision={2}
                                        formatter={v => `₺ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="period" label="Dönem (Ay/Yıl)">
                                    <Input placeholder="Şubat 2026" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="date" label="Ödeme Tarihi" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                        <Form.Item name="note" label="Açıklama">
                            <Input.TextArea rows={2} placeholder="İsteğe bağlı not..." />
                        </Form.Item>
                        {selectedPerson && (
                            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                                <b>Aylık Maaş:</b> {fmt(selectedPerson.salary)} &nbsp;|&nbsp;
                                <b>Toplam Avans:</b> {fmt(selectedPerson.totalAdvance)} &nbsp;|&nbsp;
                                <b>Önceki Ödemeler:</b> {fmt(selectedPerson.totalSalary)}
                            </div>
                        )}
                    </Form>
                </Modal>

                {/* Transaction History Drawer */}
                <Drawer
                    title={selectedPerson ? `${selectedPerson.firstName} ${selectedPerson.lastName} — İşlem Geçmişi` : ''}
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    styles={{ body: { width: 480, overflowX: 'hidden' } }}
                    size="large"
                    extra={
                        <Space>
                            <Button size="small" icon={<GiftOutlined />} onClick={() => { setDrawerOpen(false); selectedPerson && openAdvance(selectedPerson); }}>Avans</Button>
                            <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => { setDrawerOpen(false); selectedPerson && openSalary(selectedPerson); }}>Maaş</Button>
                        </Space>
                    }
                >
                    {selectedPerson && (
                        <>
                            {/* Summary */}
                            <Row gutter={12} style={{ marginBottom: 20 }}>
                                <Col span={8}>
                                    <Card size="small" variant="borderless" style={{ background: '#eff6ff', borderRadius: 8, textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#6b7280' }}>Aylık Maaş</div>
                                        <div style={{ fontWeight: 700, color: '#2563eb' }}>{fmt(selectedPerson.salary)}</div>
                                    </Card>
                                </Col>
                                <Col span={8}>
                                    <Card size="small" variant="borderless" style={{ background: '#fffbeb', borderRadius: 8, textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#6b7280' }}>Toplam Avans</div>
                                        <div style={{ fontWeight: 700, color: '#d97706' }}>{fmt(selectedPerson.totalAdvance)}</div>
                                    </Card>
                                </Col>
                                <Col span={8}>
                                    <Card size="small" variant="borderless" style={{ background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#6b7280' }}>Ödenen</div>
                                        <div style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(selectedPerson.totalSalary)}</div>
                                    </Card>
                                </Col>
                            </Row>

                            <Divider style={{ margin: '12px 0' }} />

                            {selectedPerson.transactions.length === 0 ? (
                                <Empty description="Henüz işlem yok" />
                            ) : (
                                <Timeline
                                    items={[...selectedPerson.transactions]
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map(tx => ({
                                            color: tx.type === 'ADVANCE' ? '#d97706' : '#16a34a',
                                            dot: tx.type === 'ADVANCE'
                                                ? <GiftOutlined style={{ color: '#d97706' }} />
                                                : <DollarOutlined style={{ color: '#16a34a' }} />,
                                            children: (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>
                                                            {tx.type === 'ADVANCE' ? '💸 Avans' : '💰 Maaş Ödemesi'}
                                                            <Tag color={tx.type === 'ADVANCE' ? 'orange' : 'green'} style={{ marginLeft: 6, fontSize: 11 }}>
                                                                {fmt(tx.amount)}
                                                            </Tag>
                                                        </div>
                                                        {tx.period && <Text type="secondary" style={{ fontSize: 11 }}>Dönem: {tx.period}</Text>}
                                                        {tx.note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{tx.note}</div>}
                                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                            {dayjs(tx.date).format('DD MMM YYYY')}
                                                        </div>
                                                    </div>
                                                    <Popconfirm
                                                        title="Bu işlemi silmek istediğinize emin misiniz?"
                                                        onConfirm={() => deleteTransaction(tx)}
                                                        okText="Sil" cancelText="İptal"
                                                    >
                                                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                                    </Popconfirm>
                                                </div>
                                            )
                                        }))
                                    }
                                />
                            )}
                        </>
                    )}
                </Drawer>
            </AdminLayout>
        </AdminGuard>
    );
}
