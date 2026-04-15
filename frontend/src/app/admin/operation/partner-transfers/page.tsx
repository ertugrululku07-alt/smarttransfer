'use client';

import React, { useState, useEffect } from 'react';
import {
    Table, Tag, Button, Space, Typography, message, Input, Card, Tooltip
} from 'antd';
import {
    ReloadOutlined, CarOutlined, EnvironmentOutlined, CalendarOutlined,
    UserOutlined, TeamOutlined, SearchOutlined, PhoneOutlined,
    SwapOutlined, ClockCircleOutlined, GlobalOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

dayjs.locale('tr');
const { Text } = Typography;

export default function PartnerTransfersPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    const fetchBookings = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/api/transfer/bookings');
            if (response.data.success) {
                const allBookings = response.data.data;
                const partnerBookings = allBookings.filter((b: any) =>
                    b.status === 'CONFIRMED' &&
                    b.partnerName &&
                    b.partnerRole === 'PARTNER'
                );
                setBookings(partnerBookings);
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

    useEffect(() => { fetchBookings(); }, []);

    const filteredBookings = bookings.filter((b: any) => {
        if (!searchText) return true;
        const q = searchText.toLowerCase();
        return (
            b.bookingNumber?.toLowerCase().includes(q) ||
            b.partnerName?.toLowerCase().includes(q) ||
            b.passengerName?.toLowerCase().includes(q) ||
            b.pickup?.location?.toLowerCase().includes(q) ||
            b.dropoff?.location?.toLowerCase().includes(q)
        );
    });

    // Group by partner for stats
    const partnerGroups = bookings.reduce((acc: Record<string, number>, b: any) => {
        const name = b.partnerName || 'Diğer';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});

    const columns: any[] = [
        {
            title: 'Transfer',
            key: 'transfer',
            width: 340,
            render: (_: any, record: any) => {
                const pickup = typeof record.pickup === 'string' ? record.pickup : record.pickup?.location;
                const dropoff = typeof record.dropoff === 'string' ? record.dropoff : record.dropoff?.location;
                return (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                            background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 14px rgba(124,58,237,0.25)'
                        }}>
                            <TeamOutlined style={{ color: '#fff', fontSize: 20 }} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{
                                    fontWeight: 800, fontSize: 14, color: '#1e293b', fontFamily: 'monospace',
                                    background: '#f1f5f9', padding: '1px 8px', borderRadius: 6
                                }}>
                                    {record.bookingNumber}
                                </span>
                                <Tag color="purple" style={{
                                    margin: 0, fontSize: 11, borderRadius: 6, fontWeight: 700, lineHeight: '18px',
                                    background: '#f3e8ff', color: '#7c3aed', border: '1px solid #ddd6fe'
                                }}>
                                    DIŞ OPERASYON
                                </Tag>
                            </div>
                            {/* Route */}
                            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334155' }}>
                                    <EnvironmentOutlined style={{ color: '#10b981', fontSize: 12 }} />
                                    <span style={{ fontWeight: 500 }}>{pickup || 'Belirtilmemiş'}</span>
                                </div>
                                <div style={{ marginLeft: 6, borderLeft: '2px dashed #e2e8f0', height: 6 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334155' }}>
                                    <EnvironmentOutlined style={{ color: '#ef4444', fontSize: 12 }} />
                                    <span style={{ fontWeight: 500 }}>{dropoff || 'Belirtilmemiş'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Partner',
            key: 'partner',
            width: 140,
            render: (_: any, record: any) => (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                    borderRadius: 10, background: 'linear-gradient(135deg, #f3e8ff, #ede9fe)',
                    border: '1px solid #ddd6fe'
                }}>
                    <div style={{
                        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                        background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 11, color: '#fff'
                    }}>
                        {record.partnerName?.charAt(0)?.toUpperCase() || 'P'}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#5b21b6' }}>
                        {record.partnerName || '-'}
                    </span>
                </div>
            ),
        },
        {
            title: 'Tarih / Saat',
            key: 'datetime',
            width: 150,
            render: (_: any, record: any) => {
                const dt = record.pickupDateTime;
                return (
                    <div>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                            borderRadius: 8, background: '#eff6ff', color: '#1d4ed8',
                            fontWeight: 700, fontSize: 13
                        }}>
                            <CalendarOutlined style={{ fontSize: 12 }} />
                            {dt ? dayjs(dt).format('DD MMM HH:mm') : '-'}
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
                );
            },
        },
        {
            title: 'Müşteri',
            key: 'customer',
            width: 160,
            render: (_: any, record: any) => {
                const name = record.passengerName || record.contactName || '-';
                const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: 12, color: '#4338ca'
                        }}>
                            {initials}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{name}</div>
                            {record.contactPhone && (
                                <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <PhoneOutlined style={{ fontSize: 10 }} />
                                    {record.contactPhone}
                                </div>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Araç',
            key: 'vehicle',
            width: 100,
            align: 'center' as const,
            render: (_: any, record: any) => (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                    borderRadius: 8, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
                    fontWeight: 600, fontSize: 12
                }}>
                    <CarOutlined style={{ fontSize: 12 }} />
                    {record.vehicleType || '-'}
                </div>
            ),
        },
        {
            title: 'Pax',
            key: 'pax',
            width: 80,
            align: 'center' as const,
            render: (_: any, record: any) => {
                const a = record.adults || 1;
                const c = record.children || 0;
                const inf = record.infants || 0;
                const total = a + c + inf;
                const parts: string[] = [];
                if (a > 0) parts.push(`${a}Y`);
                if (c > 0) parts.push(`${c}Ç`);
                if (inf > 0) parts.push(`${inf}B`);
                return (
                    <div style={{
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', padding: '3px 10px',
                        borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#475569' }}>👤 {total}</span>
                        <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{parts.join('+')}</span>
                    </div>
                );
            },
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="partner-transfers">
                {/* ========== HERO HEADER ========== */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    marginBottom: 28, flexWrap: 'wrap', gap: 16
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <div style={{
                                width: 46, height: 46, borderRadius: 14,
                                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 6px 20px rgba(124,58,237,0.3)'
                            }}>
                                <TeamOutlined style={{ color: '#fff', fontSize: 22 }} />
                            </div>
                            <div>
                                <h1 style={{
                                    margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
                                    background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text', lineHeight: 1.2
                                }}>
                                    Partner Transferleri
                                </h1>
                                <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 2, display: 'block' }}>
                                    Dış operasyona verilen transferleri takip edin
                                </Text>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Partner Stats Chips */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                                background: '#f3e8ff', borderRadius: 10, border: '1px solid #ddd6fe'
                            }}>
                                <span style={{ fontSize: 18 }}>🤝</span>
                                <span style={{ fontWeight: 700, fontSize: 16, color: '#7c3aed' }}>{bookings.length}</span>
                                <span style={{ fontSize: 12, color: '#a78bfa' }}>Toplam</span>
                            </div>
                            {Object.entries(partnerGroups).map(([name, count]) => (
                                <div key={name} style={{
                                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                                    background: '#faf5ff', borderRadius: 10, border: '1px solid #e9d5ff',
                                    fontSize: 12, fontWeight: 600, color: '#7c3aed'
                                }}>
                                    <TeamOutlined style={{ fontSize: 12 }} />
                                    {name}: <strong>{count as number}</strong>
                                </div>
                            ))}
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
                            onClick={fetchBookings}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 20px', border: 'none', borderRadius: 12, cursor: 'pointer',
                                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                color: '#fff', fontWeight: 700, fontSize: 14,
                                boxShadow: '0 6px 24px rgba(124,58,237,0.3)',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(124,58,237,0.4)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(124,58,237,0.3)'; }}
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
                        childrenColumnName="nested_children_disabled"
                        loading={loading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: false,
                            showTotal: (total) => `Toplam ${total} partner transfer`,
                            style: { padding: '12px 20px', margin: 0 },
                        }}
                        size="middle"
                        locale={{
                            emptyText: (
                                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                                    <TeamOutlined style={{ fontSize: 48, color: '#d1d5db', marginBottom: 12 }} />
                                    <div style={{ fontSize: 16, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                        Partner transferi bulunamadı
                                    </div>
                                    <div style={{ fontSize: 13, color: '#9ca3af' }}>
                                        Dış operasyona atanmış transfer henüz yok
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
                        color: '#64748b !important;
                        border-bottom: 2px solid #e2e8f0 !important;
                        padding: 12px 16px !important;
                    }
                    .ant-table-tbody > tr > td {
                        padding: 14px 16px !important;
                        border-bottom: 1px solid #f1f5f9 !important;
                    }
                    .ant-table-tbody > tr:hover > td {
                        background: #faf5ff !important;
                    }
                `}</style>
            </AdminLayout>
        </AdminGuard>
    );
}
