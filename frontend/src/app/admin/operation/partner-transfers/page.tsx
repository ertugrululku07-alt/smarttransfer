'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Table, Tag, Button, Typography, message, Input, Card
} from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import {
    ReloadOutlined, CarOutlined, EnvironmentOutlined, CalendarOutlined,
    TeamOutlined, SearchOutlined, PhoneOutlined,
    SwapOutlined, IdcardOutlined, DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';

dayjs.locale('tr');
const { Text } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PENDING:      { label: 'Bekliyor',    color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    CONFIRMED:    { label: 'Onaylandı',   color: '#7c3aed', bg: '#f3e8ff', border: '#ddd6fe' },
    IN_PROGRESS:  { label: 'Yolda',       color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    COMPLETED:    { label: 'Tamamlandı',  color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    CANCELLED:    { label: 'İptal',       color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    NO_SHOW:      { label: 'Gelmedi',     color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' },
};

/* ── Helper: build unique filter list from data ── */
const uniqueFilters = (data: any[], key: string, labelFn?: (v: string) => string) => {
    const vals = [...new Set(data.map(d => d[key]).filter(Boolean))] as string[];
    return vals.sort().map(v => ({ text: labelFn ? labelFn(v) : v, value: v }));
};

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
                    b.partnerName && b.partnerRole === 'PARTNER'
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

    /* ── Search filter ── */
    const filteredBookings = useMemo(() => {
        if (!searchText) return bookings;
        const q = searchText.toLowerCase();
        return bookings.filter((b: any) => {
            const pickup = typeof b.pickup === 'string' ? b.pickup : b.pickup?.location || '';
            const dropoff = typeof b.dropoff === 'string' ? b.dropoff : b.dropoff?.location || '';
            return (
                b.bookingNumber?.toLowerCase().includes(q) ||
                b.partnerName?.toLowerCase().includes(q) ||
                b.passengerName?.toLowerCase().includes(q) ||
                b.driverName?.toLowerCase().includes(q) ||
                b.vehiclePlate?.toLowerCase().includes(q) ||
                b.contactPhone?.toLowerCase().includes(q) ||
                pickup.toLowerCase().includes(q) ||
                dropoff.toLowerCase().includes(q)
            );
        });
    }, [bookings, searchText]);

    /* ── Partner stats chips ── */
    const partnerGroups = useMemo(() => {
        return bookings.reduce((acc: Record<string, number>, b: any) => {
            const name = b.partnerName || 'Diğer';
            acc[name] = (acc[name] || 0) + 1;
            return acc;
        }, {});
    }, [bookings]);

    /* ── Dynamic filter options from data ── */
    const partnerFilters = useMemo(() => uniqueFilters(bookings, 'partnerName'), [bookings]);
    const driverFilters = useMemo(() => {
        const names = [...new Set(bookings.map(b => b.driverName).filter(Boolean))] as string[];
        const items = names.sort().map(n => ({ text: n, value: n }));
        items.unshift({ text: 'Atanmadı', value: '__NONE__' });
        return items;
    }, [bookings]);
    const vehicleTypeFilters = useMemo(() => uniqueFilters(bookings, 'vehicleType'), [bookings]);
    const statusFilters = useMemo(() =>
        Object.entries(STATUS_MAP).map(([key, val]) => ({ text: val.label, value: key })),
    []);
    const currencyFilters = useMemo(() => uniqueFilters(bookings, 'currency'), [bookings]);

    /* ── Columns ── */
    const columns: ColumnsType<any> = [
        {
            title: 'Transfer',
            dataIndex: 'bookingNumber',
            key: 'transfer',
            width: 280,
            fixed: 'left',
            sorter: (a, b) => (a.bookingNumber || '').localeCompare(b.bookingNumber || ''),
            render: (_, record) => {
                const pickup = typeof record.pickup === 'string' ? record.pickup : record.pickup?.location;
                const dropoff = typeof record.dropoff === 'string' ? record.dropoff : record.dropoff?.location;
                return (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <SwapOutlined style={{ color: '#fff', fontSize: 15 }} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{
                                    fontWeight: 800, fontSize: 11, color: '#1e293b', fontFamily: 'monospace',
                                    background: '#f1f5f9', padding: '1px 5px', borderRadius: 3
                                }}>
                                    {record.bookingNumber}
                                </span>
                                <Tag style={{
                                    margin: 0, fontSize: 9, borderRadius: 3, fontWeight: 700, lineHeight: '14px',
                                    background: '#f3e8ff', color: '#7c3aed', border: '1px solid #ddd6fe', padding: '0 4px'
                                }}>
                                    DIŞ OPERASYON
                                </Tag>
                            </div>
                            <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#334155' }}>
                                    <EnvironmentOutlined style={{ color: '#10b981', fontSize: 9 }} />
                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>
                                        {pickup || '-'}
                                    </span>
                                </div>
                                <div style={{ marginLeft: 4, borderLeft: '2px dashed #e2e8f0', height: 3 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#334155' }}>
                                    <EnvironmentOutlined style={{ color: '#ef4444', fontSize: 9 }} />
                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>
                                        {dropoff || '-'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Partner',
            dataIndex: 'partnerName',
            key: 'partner',
            width: 140,
            filters: partnerFilters,
            filterSearch: true,
            onFilter: (value, record) => record.partnerName === value,
            sorter: (a, b) => (a.partnerName || '').localeCompare(b.partnerName || ''),
            render: (_, record) => (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px',
                    borderRadius: 7, background: 'linear-gradient(135deg, #f3e8ff, #ede9fe)',
                    border: '1px solid #ddd6fe'
                }}>
                    <div style={{
                        width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                        background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 9, color: '#fff'
                    }}>
                        {record.partnerName?.charAt(0)?.toUpperCase() || 'P'}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 11, color: '#5b21b6' }}>
                        {record.partnerName || '-'}
                    </span>
                </div>
            ),
        },
        {
            title: 'Tarih / Saat',
            dataIndex: 'pickupDateTime',
            key: 'datetime',
            width: 120,
            sorter: (a, b) => new Date(a.pickupDateTime).getTime() - new Date(b.pickupDateTime).getTime(),
            defaultSortOrder: 'descend',
            render: (_, record) => {
                const dt = record.pickupDateTime;
                return (
                    <div>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px',
                            borderRadius: 5, background: '#eff6ff', color: '#1d4ed8',
                            fontWeight: 700, fontSize: 11
                        }}>
                            <CalendarOutlined style={{ fontSize: 10 }} />
                            {dt ? dayjs(dt).format('DD MMM HH:mm') : '-'}
                        </div>
                        {record.flightNumber && (
                            <div style={{ marginTop: 2, fontSize: 10, color: '#6366f1', fontWeight: 600 }}>
                                ✈ {record.flightNumber}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Müşteri',
            dataIndex: 'passengerName',
            key: 'customer',
            width: 170,
            sorter: (a, b) => (a.passengerName || '').localeCompare(b.passengerName || ''),
            render: (_, record) => {
                const name = record.passengerName || record.contactName || '-';
                const initials = name.split(' ').map((n: string) => n?.[0] || '').join('').substring(0, 2).toUpperCase();
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                            background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: 10, color: '#4338ca'
                        }}>
                            {initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                            {record.contactPhone && (
                                <div style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <PhoneOutlined style={{ fontSize: 8 }} />
                                    {record.contactPhone}
                                </div>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Şoför',
            dataIndex: 'driverName',
            key: 'driver',
            width: 150,
            filters: driverFilters,
            filterSearch: true,
            onFilter: (value, record) => {
                if (value === '__NONE__') return !record.driverName;
                return record.driverName === value;
            },
            sorter: (a, b) => (a.driverName || '').localeCompare(b.driverName || ''),
            render: (_, record) => {
                if (!record.driverName) {
                    return <span style={{ color: '#cbd5e1', fontSize: 11, fontStyle: 'italic' }}>Atanmadı</span>;
                }
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                            background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <IdcardOutlined style={{ fontSize: 12, color: '#16a34a' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 11, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {record.driverName}
                            </div>
                            {record.driverPhone && (
                                <div style={{ fontSize: 9, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <PhoneOutlined style={{ fontSize: 8 }} />
                                    {record.driverPhone}
                                </div>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Araç',
            dataIndex: 'vehicleType',
            key: 'vehicle',
            width: 130,
            filters: vehicleTypeFilters,
            filterSearch: true,
            onFilter: (value, record) => record.vehicleType === value,
            sorter: (a, b) => (a.vehicleType || '').localeCompare(b.vehicleType || ''),
            render: (_, record) => (
                <div>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px',
                        borderRadius: 5, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
                        fontWeight: 600, fontSize: 10
                    }}>
                        <CarOutlined style={{ fontSize: 10 }} />
                        {record.vehicleType || '-'}
                    </div>
                    {record.vehiclePlate && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', marginTop: 2 }}>
                            {record.vehiclePlate}
                        </div>
                    )}
                    {record.vehicleBrand && (
                        <div style={{ fontSize: 9, color: '#94a3b8' }}>{record.vehicleBrand}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'Pax',
            key: 'pax',
            width: 55,
            align: 'center',
            sorter: (a, b) => ((a.adults || 0) + (a.children || 0) + (a.infants || 0)) - ((b.adults || 0) + (b.children || 0) + (b.infants || 0)),
            render: (_, record) => {
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
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', padding: '1px 6px',
                        borderRadius: 5, background: '#f8fafc', border: '1px solid #e2e8f0',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#475569' }}>{total}</span>
                        <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>{parts.join('+')}</span>
                    </div>
                );
            },
        },
        {
            title: 'Fiyat',
            dataIndex: 'total',
            key: 'price',
            width: 100,
            align: 'right',
            sorter: (a, b) => (a.total || 0) - (b.total || 0),
            filters: currencyFilters,
            onFilter: (value, record) => record.currency === value,
            render: (_, record) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                        {record.total ? Number(record.total).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{record.currency || 'TRY'}</div>
                </div>
            ),
        },
        {
            title: 'Ödeme',
            dataIndex: 'paymentStatus',
            key: 'payment',
            width: 90,
            align: 'center',
            filters: [
                { text: 'Bekliyor', value: 'PENDING' },
                { text: 'Kısmi', value: 'PARTIAL' },
                { text: 'Ödendi', value: 'PAID' },
                { text: 'İade', value: 'REFUNDED' },
            ],
            onFilter: (value: any, record: any) => record.paymentStatus === value,
            render: (_: any, record: any) => {
                const PM: Record<string, { label: string; color: string; bg: string }> = {
                    PENDING:  { label: 'Bekliyor', color: '#d97706', bg: '#fffbeb' },
                    PARTIAL:  { label: 'Kısmi',    color: '#ea580c', bg: '#fff7ed' },
                    PAID:     { label: 'Ödendi',   color: '#16a34a', bg: '#f0fdf4' },
                    REFUNDED: { label: 'İade',     color: '#dc2626', bg: '#fef2f2' },
                };
                const p = PM[record.paymentStatus] || PM.PENDING;
                return (
                    <Tag style={{
                        margin: 0, fontSize: 10, borderRadius: 5, fontWeight: 700, lineHeight: '18px',
                        background: p.bg, color: p.color, border: 'none', padding: '1px 8px',
                    }}>
                        {p.label}
                    </Tag>
                );
            },
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            align: 'center',
            fixed: 'right',
            filters: statusFilters,
            onFilter: (value, record) => record.status === value,
            render: (_, record) => {
                const st = STATUS_MAP[record.status] || STATUS_MAP.PENDING;
                return (
                    <Tag style={{
                        margin: 0, fontSize: 10, borderRadius: 5, fontWeight: 700, lineHeight: '18px',
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                        padding: '1px 8px',
                    }}>
                        {st.label}
                    </Tag>
                );
            },
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="partner-transfers">
                {/* ═══ HEADER ═══ */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    marginBottom: 20, flexWrap: 'wrap', gap: 12
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 12,
                            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 16px rgba(124,58,237,0.25)'
                        }}>
                            <TeamOutlined style={{ color: '#fff', fontSize: 20 }} />
                        </div>
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5,
                                color: '#1e293b', lineHeight: 1.2
                            }}>
                                Partner Transferleri
                            </h1>
                            <Text style={{ color: '#94a3b8', fontSize: 12, display: 'block' }}>
                                Dış operasyona verilen transferleri takip edin
                            </Text>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {/* Stats */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                            background: '#f3e8ff', borderRadius: 8, border: '1px solid #ddd6fe'
                        }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: '#7c3aed' }}>{bookings.length}</span>
                            <span style={{ fontSize: 11, color: '#a78bfa' }}>Toplam</span>
                        </div>
                        {Object.entries(partnerGroups).map(([name, count]) => (
                            <div key={name} style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff',
                                fontSize: 11, fontWeight: 600, color: '#7c3aed'
                            }}>
                                <TeamOutlined style={{ fontSize: 10 }} />
                                {name}: <strong>{count as number}</strong>
                            </div>
                        ))}

                        <Input
                            placeholder="Ara (No, İsim, Tel, Plaka)"
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                            style={{ width: 220, borderRadius: 8, border: '1px solid #e2e8f0' }}
                            size="middle"
                        />

                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchBookings}
                            loading={loading}
                            type="primary"
                            style={{
                                borderRadius: 8, fontWeight: 700,
                                background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                                border: 'none',
                            }}
                        >
                            Yenile
                        </Button>
                    </div>
                </div>

                {/* ═══ TABLE ═══ */}
                <Card
                    styles={{ body: { padding: 0 } }}
                    style={{
                        borderRadius: 12, overflow: 'hidden',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
                    }}
                >
                    <Table
                        columns={columns}
                        dataSource={filteredBookings}
                        rowKey="id"
                        loading={loading}
                        scroll={{ x: 1500 }}
                        pagination={{
                            pageSize: 15,
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '15', '25', '50'],
                            showTotal: (total) => <span style={{ fontSize: 12, color: '#64748b' }}>Toplam <strong>{total}</strong> partner transfer</span>,
                            style: { padding: '10px 16px', margin: 0 },
                        }}
                        size="small"
                        locale={{
                            emptyText: (
                                <div style={{ padding: '50px 0', textAlign: 'center' }}>
                                    <TeamOutlined style={{ fontSize: 40, color: '#d1d5db', marginBottom: 10 }} />
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                        Partner transferi bulunamadı
                                    </div>
                                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                                        Dış operasyona atanmış transfer henüz yok
                                    </div>
                                </div>
                            ),
                            filterTitle: 'Filtrele',
                            filterConfirm: 'Uygula',
                            filterReset: 'Temizle',
                            filterEmptyText: 'Filtre yok',
                            filterSearchPlaceholder: 'Listede ara...',
                            filterCheckall: 'Tümünü Seç',
                            selectAll: 'Tümünü Seç',
                            selectNone: 'Hiçbirini Seçme',
                        }}
                    />
                </Card>

                <style>{`
                    .ant-table-thead > tr > th {
                        background: #f8fafc !important;
                        font-weight: 700 !important;
                        font-size: 11px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.4px !important;
                        color: #64748b !important;
                        border-bottom: 2px solid #e2e8f0 !important;
                        padding: 10px 12px !important;
                    }
                    .ant-table-tbody > tr > td {
                        padding: 10px 12px !important;
                        border-bottom: 1px solid #f1f5f9 !important;
                        vertical-align: middle !important;
                    }
                    .ant-table-tbody > tr:hover > td {
                        background: #faf5ff !important;
                    }
                    .ant-table-cell-fix-left, .ant-table-cell-fix-right {
                        background: inherit !important;
                    }
                    .ant-table-thead .ant-table-cell-fix-left,
                    .ant-table-thead .ant-table-cell-fix-right {
                        background: #f8fafc !important;
                    }
                    .ant-table-filter-dropdown {
                        border-radius: 10px !important;
                        box-shadow: 0 8px 30px rgba(0,0,0,0.12) !important;
                    }
                `}</style>
            </AdminLayout>
        </AdminGuard>
    );
}
