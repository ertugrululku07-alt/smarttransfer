'use client';

import React, { useEffect, useState } from 'react';
import {
    Card, Table, Tag, Typography, Tabs, Button, Space, Empty, message
} from 'antd';
import { RightOutlined, CarOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AccountGuard from '../AccountGuard';
import AccountLayout from '../AccountLayout';
import api from '@/lib/api-client';

const { Title, Text } = Typography;

const STATUS_INFO: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Onay Bekliyor', color: 'orange' },
    CONFIRMED: { label: 'Onaylandı', color: 'cyan' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'magenta' },
    COMPLETED: { label: 'Tamamlandı', color: 'green' },
    CANCELLED: { label: 'İptal', color: 'red' },
    NO_SHOW: { label: 'Gelmedi', color: 'red' },
};

export default function BookingsListPage() {
    const router = useRouter();
    const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const pageSize = 10;

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/customer/bookings?status=${filter}&page=${page}&pageSize=${pageSize}`);
                if (res.data.success) {
                    setItems(res.data.data.items || []);
                    setTotal(res.data.data.total || 0);
                }
            } catch (e: any) {
                message.error(e?.response?.data?.error || 'Liste alınamadı');
            } finally {
                setLoading(false);
            }
        })();
    }, [filter, page]);

    const columns = [
        {
            title: 'PNR',
            dataIndex: 'bookingNumber',
            render: (v: string) => <Text code>{v}</Text>,
        },
        {
            title: 'Güzergah',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.metadata?.pickup || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>↓ {r.metadata?.dropoff || '—'}</div>
                </div>
            )
        },
        {
            title: 'Tarih',
            dataIndex: 'startDate',
            render: (v: string) => v ? new Date(v).toLocaleString('tr-TR', {
                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
            }) : '-'
        },
        {
            title: 'Şoför',
            dataIndex: 'driver',
            render: (d: any) => d?.fullName || <Text type="secondary">—</Text>
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            render: (v: string) => {
                const s = STATUS_INFO[v] || { label: v, color: 'default' };
                return <Tag color={s.color}>{s.label}</Tag>;
            }
        },
        {
            title: 'Tutar',
            render: (_: any, r: any) => `${Number(r.total || 0).toFixed(2)} ${r.currency || ''}`
        },
        {
            title: '',
            render: (_: any, r: any) => (
                <Button type="link" onClick={() => router.push(`/account/bookings/${r.id}`)}>
                    Detay <RightOutlined />
                </Button>
            )
        }
    ];

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>
                    <Title level={3} style={{ margin: '0 0 16px 0' }}>
                        <CarOutlined /> Rezervasyonlarım
                    </Title>

                    <Card>
                        <Tabs
                            activeKey={filter}
                            onChange={(k) => { setFilter(k as any); setPage(1); }}
                            items={[
                                { key: 'all', label: 'Tümü' },
                                { key: 'active', label: 'Aktif' },
                                { key: 'past', label: 'Geçmiş' },
                            ]}
                        />

                        <Table
                            rowKey="id"
                            loading={loading}
                            columns={columns as any}
                            dataSource={items}
                            pagination={{
                                current: page,
                                pageSize,
                                total,
                                onChange: setPage,
                                showSizeChanger: false,
                            }}
                            locale={{ emptyText: <Empty description="Kayıt bulunamadı" /> }}
                            scroll={{ x: 800 }}
                            onRow={(r) => ({ onClick: () => router.push(`/account/bookings/${r.id}`), style: { cursor: 'pointer' } })}
                        />
                    </Card>
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
