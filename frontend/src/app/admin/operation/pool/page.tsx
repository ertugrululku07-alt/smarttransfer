'use client';

import React, { useState, useEffect } from 'react';
import {
    Table, Tag, Button, Space, Typography, message, Tooltip, Modal, Card, Badge, Input
} from 'antd';
import {
    ReloadOutlined, CarOutlined, EnvironmentOutlined, CalendarOutlined,
    UserOutlined, SwapOutlined, ExportOutlined, CheckCircleOutlined,
    ClockCircleOutlined, PhoneOutlined, DollarOutlined,
    SendOutlined, RollbackOutlined, ExclamationCircleOutlined,
    InboxOutlined, SearchOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

dayjs.locale('tr');
const { Text } = Typography;

export default function PoolTransfersPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');

    const fetchPoolBookings = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/api/transfer/pool-bookings');
            if (response.data.success) {
                setBookings(response.data.data);
            } else {
                message.error('Veriler alınamadı: ' + response.data.error);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Bağlantı hatası');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPoolBookings(); }, []);

    // === ACTIONS ===
    const handleMoveToOperation = async (booking: any) => {
        Modal.confirm({
            title: 'Operasyona Aktar',
            icon: <SendOutlined style={{ color: '#6366f1' }} />,
            content: (
                <div>
                    <p style={{ margin: '8px 0', color: '#64748b' }}>
                        <strong>{booking.bookingNumber}</strong> numaralı transfer havuzdan çıkarılıp operasyon listesine aktarılacak.
                    </p>
                    <div style={{
                        padding: '10px 14px', borderRadius: 8, background: '#f0fdf4',
                        border: '1px solid #bbf7d0', fontSize: 13
                    }}>
                        <EnvironmentOutlined style={{ color: '#10b981', marginRight: 6 }} />
                        {booking.pickup?.location}
                        <SwapOutlined style={{ margin: '0 8px', color: '#94a3b8' }} />
                        {booking.dropoff?.location}
                    </div>
                </div>
            ),
            okText: 'Operasyona Aktar',
            cancelText: 'İptal',
            okButtonProps: {
                style: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', fontWeight: 600 }
            },
            onOk: async () => {
                setActionLoading(booking.id);
                try {
                    await apiClient.patch(`/api/transfer/bookings/${booking.id}`, {
                        operationalStatus: null,
                        status: 'CONFIRMED'
                    });
                    message.success(`${booking.bookingNumber} operasyona aktarıldı!`);
                    fetchPoolBookings();
                } catch (error) {
                    console.error(error);
                    message.error('Aktarma sırasında hata oluştu');
                } finally {
                    setActionLoading(null);
                }
            }
        });
    };

    const handleReturnToReservation = async (booking: any) => {
        Modal.confirm({
            title: 'Rezervasyona İade',
            icon: <RollbackOutlined style={{ color: '#f59e0b' }} />,
            content: (
                <div>
                    <p style={{ margin: '8px 0', color: '#64748b' }}>
                        <strong>{booking.bookingNumber}</strong> havuzdan çıkarılıp rezervasyon listesine geri gönderilecek.
                    </p>
                    <div style={{
                        padding: '8px 14px', borderRadius: 8, background: '#fffbeb',
                        border: '1px solid #fde68a', fontSize: 13, color: '#92400e'
                    }}>
                        <ExclamationCircleOutlined style={{ marginRight: 6 }} />
                        Transfer, atanmamış rezervasyon olarak kalacak.
                    </div>
                </div>
            ),
            okText: 'Rezervasyona İade Et',
            cancelText: 'İptal',
            okButtonProps: {
                style: { background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', fontWeight: 600 }
            },
            onOk: async () => {
                setActionLoading(booking.id);
                try {
                    await apiClient.patch(`/api/transfer/bookings/${booking.id}`, {
                        returnToReservation: true,
                        returnReason: 'Havuzdan iade edildi'
                    });
                    message.success(`${booking.bookingNumber} rezervasyona iade edildi!`);
                    fetchPoolBookings();
                } catch (error) {
                    console.error(error);
                    message.error('İade sırasında hata oluştu');
                } finally {
                    setActionLoading(null);
                }
            }
        });
    };

    // === Filter ===
    const filteredBookings = bookings.filter(b => {
        if (!searchText) return true;
        const q = searchText.toLowerCase();
        return (
            b.bookingNumber?.toLowerCase().includes(q) ||
            b.customer?.name?.toLowerCase().includes(q) ||
            b.pickup?.location?.toLowerCase().includes(q) ||
            b.dropoff?.location?.toLowerCase().includes(q)
        );
    });

    const columns: any[] = [
        {
            title: 'Transfer',
            key: 'transfer',
            width: 360,
            render: (_: any, record: any) => (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(245,158,11,0.25)'
                    }}>
                        <InboxOutlined style={{ color: '#fff', fontSize: 20 }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                                fontWeight: 800, fontSize: 14, color: '#1e293b', fontFamily: 'monospace',
                                background: '#f1f5f9', padding: '1px 8px', borderRadius: 6
                            }}>
                                {record.bookingNumber}
                            </span>
                            <Tag color="orange" style={{ margin: 0, fontSize: 11, borderRadius: 6, fontWeight: 700, lineHeight: '18px' }}>
                                HAVUZDA
                            </Tag>
                        </div>
                        {/* Route */}
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334155' }}>
                                <EnvironmentOutlined style={{ color: '#10b981', fontSize: 12 }} />
                                <span style={{ fontWeight: 500 }}>{record.pickup?.location || 'Belirtilmemiş'}</span>
                            </div>
                            <div style={{ marginLeft: 6, borderLeft: '2px dashed #e2e8f0', height: 6 }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334155' }}>
                                <EnvironmentOutlined style={{ color: '#ef4444', fontSize: 12 }} />
                                <span style={{ fontWeight: 500 }}>{record.dropoff?.location || 'Belirtilmemiş'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: 'Tarih / Saat',
            key: 'datetime',
            width: 160,
            render: (_: any, record: any) => (
                <div>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                        borderRadius: 8, background: '#eff6ff', color: '#1d4ed8',
                        fontWeight: 700, fontSize: 13
                    }}>
                        <CalendarOutlined style={{ fontSize: 12 }} />
                        {record.pickup?.time || '-'}
                    </div>
                    {record.flightNumber && (
                        <div style={{
                            marginTop: 5, fontSize: 12, color: '#6366f1', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 4
                        }}>
                            ✈️ {record.flightNumber}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Müşteri',
            key: 'customer',
            width: 160,
            render: (_: any, record: any) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: 12, color: '#4338ca'
                        }}>
                            {record.customer?.avatar || '?'}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                                {record.customer?.name || '-'}
                            </div>
                            {record.customer?.phone && (
                                <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <PhoneOutlined style={{ fontSize: 10 }} />
                                    {record.customer.phone}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: 'Araç',
            key: 'vehicle',
            width: 110,
            align: 'center' as const,
            render: (_: any, record: any) => (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                    borderRadius: 8, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
                    fontWeight: 600, fontSize: 12
                }}>
                    <CarOutlined style={{ fontSize: 12 }} />
                    {record.vehicle?.type || '-'}
                </div>
            ),
        },
        {
            title: 'Tutar',
            key: 'price',
            width: 100,
            align: 'center' as const,
            render: (_: any, record: any) => (
                <div style={{
                    fontWeight: 800, fontSize: 16, letterSpacing: -0.5,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    {record.price?.amount || 0} {record.price?.currency || '₺'}
                </div>
            ),
        },
        {
            title: 'İşlemler',
            key: 'actions',
            width: 120,
            align: 'center' as const,
            render: (_: any, record: any) => (
                <Space direction="vertical" size={6}>
                    <Tooltip title="Operasyona Aktar">
                        <Button
                            size="small"
                            icon={<SendOutlined />}
                            onClick={() => handleMoveToOperation(record)}
                            loading={actionLoading === record.id}
                            style={{
                                width: '100%', borderRadius: 8, fontWeight: 600, fontSize: 12,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', border: 'none', height: 30,
                                boxShadow: '0 2px 8px rgba(99,102,241,0.25)'
                            }}
                        >
                            Operasyona
                        </Button>
                    </Tooltip>
                    <Tooltip title="Rezervasyona İade Et">
                        <Button
                            size="small"
                            icon={<RollbackOutlined />}
                            onClick={() => handleReturnToReservation(record)}
                            loading={actionLoading === record.id}
                            style={{
                                width: '100%', borderRadius: 8, fontWeight: 600, fontSize: 12,
                                background: '#fff', color: '#d97706', border: '1px solid #fde68a',
                                height: 30,
                            }}
                        >
                            Rezervasyona
                        </Button>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="pool-transfers">
                {/* ========== HERO HEADER ========== */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    marginBottom: 28, flexWrap: 'wrap', gap: 16
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <div style={{
                                width: 46, height: 46, borderRadius: 14,
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 6px 20px rgba(245,158,11,0.3)'
                            }}>
                                <InboxOutlined style={{ color: '#fff', fontSize: 22 }} />
                            </div>
                            <div>
                                <h1 style={{
                                    margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
                                    background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text', lineHeight: 1.2
                                }}>
                                    Havuzdaki Transferler
                                </h1>
                                <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 2, display: 'block' }}>
                                    Partner'lere açık bekleyen transferleri yönetin
                                </Text>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Stats */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                            background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a'
                        }}>
                            <span style={{ fontSize: 18 }}>📦</span>
                            <span style={{ fontWeight: 700, fontSize: 16, color: '#92400e' }}>{bookings.length}</span>
                            <span style={{ fontSize: 12, color: '#d97706' }}>Bekliyor</span>
                        </div>

                        {/* Search */}
                        <Input
                            placeholder="Ara..."
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                            style={{
                                width: 200, borderRadius: 10, border: '1px solid #e2e8f0',
                                background: '#f8fafc'
                            }}
                        />

                        <button
                            onClick={fetchPoolBookings}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 20px', border: 'none', borderRadius: 12, cursor: 'pointer',
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                color: '#fff', fontWeight: 700, fontSize: 14,
                                boxShadow: '0 6px 24px rgba(245,158,11,0.3)',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(245,158,11,0.4)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(245,158,11,0.3)'; }}
                        >
                            <ReloadOutlined style={{ fontSize: 14 }} />
                            Yenile
                        </button>
                    </div>
                </div>

                {/* ========== TABLE ========== */}
                <Card
                    styles={{ body: { padding: 0 } }}
                    style={{
                        borderRadius: 16, overflow: 'hidden',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
                    }}
                >
                    <Table
                        columns={columns}
                        dataSource={filteredBookings}
                        rowKey="id"
                        loading={loading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: false,
                            showTotal: (total) => `Toplam ${total} transfer`,
                            style: { padding: '12px 20px', margin: 0 },
                        }}
                        size="middle"
                        locale={{
                            emptyText: (
                                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                                    <InboxOutlined style={{ fontSize: 48, color: '#d1d5db', marginBottom: 12 }} />
                                    <div style={{ fontSize: 16, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                        Havuzda transfer yok
                                    </div>
                                    <div style={{ fontSize: 13, color: '#9ca3af' }}>
                                        Tüm transferler operasyona aktarılmış görünüyor
                                    </div>
                                </div>
                            )
                        }}
                    />
                </Card>

                {/* ========== STYLES ========== */}
                <style>{`
                    .ant-table-thead > tr > th {
                        background: #f8fafc !important;
                        font-weight: 700 !important;
                        font-size: 12px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.5px !important;
                        color: #64748b !important;
                        border-bottom: 2px solid #e2e8f0 !important;
                        padding: 12px 16px !important;
                    }
                    .ant-table-tbody > tr > td {
                        padding: 14px 16px !important;
                        border-bottom: 1px solid #f1f5f9 !important;
                    }
                    .ant-table-tbody > tr:hover > td {
                        background: #fffbeb !important;
                    }
                `}</style>
            </AdminLayout>
        </AdminGuard>
    );
}
