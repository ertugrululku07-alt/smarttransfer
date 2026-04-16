'use client';

import React, { useState, useEffect } from 'react';
import {
    Card, Typography, Table, Tag, Button, message,
    Space, Spin, Badge, Tooltip, Modal
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
    BankOutlined, CreditCardOutlined, EyeOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AdminLayout from '../../AdminLayout';

const { Title, Text } = Typography;

interface Deposit {
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    transactionRef: string;
    notes?: string;
    createdAt: string;
    approvedAt?: string;
    agency: { name: string; contactName: string };
    bankAccount?: { accountName: string; iban: string; bank: { name: string } };
    approvedBy?: { firstName: string; lastName: string };
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    PENDING: { color: 'orange', label: 'Onay Bekliyor', icon: <ClockCircleOutlined /> },
    APPROVED: { color: 'green', label: 'Onaylandı', icon: <CheckCircleOutlined /> },
    REJECTED: { color: 'red', label: 'Reddedildi', icon: <CloseCircleOutlined /> },
};

const methodLabel: Record<string, string> = {
    CREDIT_CARD: 'Kredi Kartı',
    BANK_TRANSFER: 'Havale / EFT',
};

export default function AdminAgencyDepositsPage() {
    const [deposits, setDeposits] = useState<Deposit[]>([]);
    const [loading, setLoading] = useState(true);
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [detailDeposit, setDetailDeposit] = useState<Deposit | null>(null);

    const fetchDeposits = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/admin/agencies/deposits');
            if (res.data?.data) setDeposits(res.data.data);
        } catch (err) {
            message.error('Depozitolar yüklenirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDeposits(); }, []);

    const handleApprove = async (id: string) => {
        Modal.confirm({
            title: 'Depozitoyu Onayla',
            content: 'Bu havalesi/EFT talebi onaylanacak ve acentenin bakiyesine eklenecektir. Devam etmek istiyor musunuz?',
            okText: 'Evet, Onayla',
            cancelText: 'İptal',
            okType: 'primary',
            onOk: async () => {
                setApprovingId(id);
                try {
                    const res = await apiClient.post(`/api/admin/agencies/deposits/${id}/approve`);
                    if (res.data?.success) {
                        message.success('Depozito onaylandı ve bakiye güncellendi!');
                        fetchDeposits();
                    }
                } catch (err: any) {
                    message.error(err?.response?.data?.error || 'Onaylama başarısız.');
                } finally {
                    setApprovingId(null);
                }
            }
        });
    };

    const pendingCount = deposits.filter(d => d.status === 'PENDING').length;

    const columns: ColumnsType<Deposit> = [
        {
            title: 'Acente',
            key: 'agency',
            render: (_: any, r: Deposit) => (
                <div>
                    <Text strong>{r.agency.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.agency.contactName}</Text>
                </div>
            )
        },
        {
            title: 'Referans No',
            dataIndex: 'transactionRef',
            render: (ref: string) => <Text code>{ref}</Text>
        },
        {
            title: 'Tutar',
            dataIndex: 'amount',
            render: (amt: number, r: Deposit) => (
                <Text strong style={{ color: '#1890ff', fontSize: 15 }}>
                    {Number(amt).toLocaleString('tr-TR', { style: 'currency', currency: r.currency || 'TRY' })}
                </Text>
            ),
            sorter: (a, b) => a.amount - b.amount
        },
        {
            title: 'Yöntem',
            dataIndex: 'method',
            render: (m: string) => (
                <Tag icon={m === 'CREDIT_CARD' ? <CreditCardOutlined /> : <BankOutlined />}>
                    {methodLabel[m] || m}
                </Tag>
            )
        },
        {
            title: 'Banka / Hesap',
            key: 'bank',
            render: (_: any, r: Deposit) => r.bankAccount
                ? (
                    <div>
                        <Text>{r.bankAccount.bank.name}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>{r.bankAccount.iban}</Text>
                    </div>
                )
                : <Text type="secondary">—</Text>
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            filters: [
                { text: 'Onay Bekliyor', value: 'PENDING' },
                { text: 'Onaylandı', value: 'APPROVED' },
                { text: 'Reddedildi', value: 'REJECTED' }
            ],
            onFilter: (val, rec) => rec.status === val,
            render: (status: string) => {
                const cfg = statusConfig[status] || { color: 'default', label: status, icon: null };
                return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
            }
        },
        {
            title: 'Tarih',
            dataIndex: 'createdAt',
            render: (d: string) => new Date(d).toLocaleDateString('tr-TR', { dateStyle: 'medium' }),
            sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            defaultSortOrder: 'descend'
        },
        {
            title: 'İşlem',
            key: 'action',
            render: (_: any, r: Deposit) => (
                <Space>
                    <Tooltip title="Detay">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailDeposit(r)} />
                    </Tooltip>
                    {r.status === 'PENDING' && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            loading={approvingId === r.id}
                            onClick={() => handleApprove(r.id)}
                        >
                            Onayla
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <AdminLayout selectedKey="agency-deposits">
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Title level={3} style={{ margin: 0 }}>
                        Acente Depozito Yönetimi
                        {pendingCount > 0 && (
                            <Badge count={pendingCount} style={{ marginLeft: 12, backgroundColor: '#fa8c16' }} />
                        )}
                    </Title>
                    <Button onClick={fetchDeposits} loading={loading}>Yenile</Button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                ) : (
                    <Card>
                        <Table
                            dataSource={deposits}
                            columns={columns}
                            rowKey="id"
                            pagination={{ pageSize: 20 }}
                            rowClassName={(r) => r.status === 'PENDING' ? 'pending-row' : ''}
                            locale={{ emptyText: 'Henüz depozito kaydı yok.' }}
                        />
                    </Card>
                )}

                {/* Detail Modal */}
                <Modal
                    title="Depozito Detayı"
                    open={!!detailDeposit}
                    onCancel={() => setDetailDeposit(null)}
                    footer={
                        detailDeposit?.status === 'PENDING' ? (
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={() => {
                                    handleApprove(detailDeposit!.id);
                                    setDetailDeposit(null);
                                }}
                            >
                                Onayla
                            </Button>
                        ) : null
                    }
                >
                    {detailDeposit && (
                        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                            <div><Text strong>Acente: </Text><Text>{detailDeposit.agency.name}</Text></div>
                            <div><Text strong>Referans No: </Text><Text code>{detailDeposit.transactionRef}</Text></div>
                            <div>
                                <Text strong>Tutar: </Text>
                                <Text style={{ color: '#1890ff', fontSize: 16 }}>
                                    {Number(detailDeposit.amount).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                </Text>
                            </div>
                            <div><Text strong>Yöntem: </Text><Text>{methodLabel[detailDeposit.method]}</Text></div>
                            {detailDeposit.bankAccount && (
                                <>
                                    <div><Text strong>Banka: </Text><Text>{detailDeposit.bankAccount.bank.name}</Text></div>
                                    <div><Text strong>IBAN: </Text><Text code>{detailDeposit.bankAccount.iban}</Text></div>
                                </>
                            )}
                            <div>
                                <Text strong>Durum: </Text>
                                <Tag color={statusConfig[detailDeposit.status]?.color}>
                                    {statusConfig[detailDeposit.status]?.label}
                                </Tag>
                            </div>
                            {detailDeposit.approvedBy && (
                                <div>
                                    <Text strong>Onaylayan: </Text>
                                    <Text>{detailDeposit.approvedBy.firstName} {detailDeposit.approvedBy.lastName}</Text>
                                </div>
                            )}
                            {detailDeposit.notes && (
                                <div><Text strong>Not: </Text><Text>{detailDeposit.notes}</Text></div>
                            )}
                        </Space>
                    )}
                </Modal>
            </div>
        </AdminLayout>
    );
}
