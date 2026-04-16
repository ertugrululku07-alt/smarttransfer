'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    SearchOutlined,
    RightOutlined,
    InboxOutlined
} from '@ant-design/icons';
import { Spin, Input } from 'antd';

export default function CompletedReservationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<any[]>([]);
    const [searchText, setSearchText] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');

    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) { router.push('/login'); return; }
                const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/transfer/partner/completed-bookings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const resData = await response.json();
                    if (resData.success) setBookings(resData.data);
                }
            } catch (error) {
                console.error('Fetch error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchBookings();
    }, [router]);

    const getFilteredBookings = () => {
        let filtered = bookings;
        if (activeTab !== 'ALL') filtered = filtered.filter(b => b.paymentStatus === activeTab);
        if (searchText) {
            const s = searchText.toLowerCase();
            filtered = filtered.filter(b =>
                b.bookingNumber?.toLowerCase().includes(s) ||
                b.customer?.name?.toLowerCase().includes(s) ||
                b.pickup?.location?.toLowerCase().includes(s)
            );
        }
        return filtered;
    };

    const getPaymentBadge = (status: string) => {
        if (status === 'PAID') return { bg: '#d1fae5', color: '#065f46', text: 'Ödendi', icon: <CheckCircleOutlined /> };
        if (status === 'DISPUTED') return { bg: '#fee2e2', color: '#991b1b', text: 'İtiraz', icon: <ExclamationCircleOutlined /> };
        return { bg: '#fef3c7', color: '#92400e', text: 'Beklemede', icon: <ClockCircleOutlined /> };
    };

    const tabs = [
        { key: 'ALL', label: 'Tümü', count: bookings.length },
        { key: 'PAID', label: 'Ödendi', count: bookings.filter(b => b.paymentStatus === 'PAID').length },
        { key: 'PENDING', label: 'Beklemede', count: bookings.filter(b => b.paymentStatus === 'PENDING').length },
        { key: 'DISPUTED', label: 'İtiraz', count: bookings.filter(b => b.paymentStatus === 'DISPUTED').length },
    ];

    const filtered = getFilteredBookings();

    return (
        <PartnerGuard>
            <PartnerLayout>
                <style jsx global>{`
                    .completed-container { max-width: 1200px; margin: 0 auto; }
                    .completed-list { display: flex; flex-direction: column; gap: 12px; }
                    @media (max-width: 768px) {
                        .completed-container { padding-top: 68px; }
                        .completed-search { width: 100% !important; }
                    }
                `}</style>

                <div className="completed-container">
                    {/* Header */}
                    <div style={{ marginBottom: 20 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>✅ Tamamlanmış Rezervasyonlar</h1>
                        <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Geçmiş transferlerinizi ve ödeme durumlarını görüntüleyin</p>
                    </div>

                    {/* Filters */}
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {tabs.map(t => (
                                    <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                                        padding: '7px 16px', border: 'none', borderRadius: 10,
                                        background: activeTab === t.key ? '#0f172a' : '#f1f5f9',
                                        color: activeTab === t.key ? '#fff' : '#64748b',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                    }}>
                                        {t.label} {t.count > 0 && <span style={{ opacity: 0.7, marginLeft: 4 }}>({t.count})</span>}
                                    </button>
                                ))}
                            </div>
                            <Input
                                className="completed-search"
                                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                placeholder="Ara..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                style={{ width: 260, borderRadius: 10, height: 38 }}
                            />
                        </div>
                    </div>

                    {/* List */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <Spin size="large" />
                            <p style={{ color: '#94a3b8', marginTop: 12 }}>Yükleniyor...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{
                            background: '#fff', borderRadius: 20, padding: '60px 24px', textAlign: 'center',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                        }}>
                            <InboxOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />
                            <h3 style={{ color: '#475569', fontWeight: 600, margin: '16px 0 8px' }}>Kayıt bulunamadı</h3>
                            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Tamamlanmış transferleriniz burada görünecek</p>
                        </div>
                    ) : (
                        <div className="completed-list">
                            {filtered.map((b: any) => {
                                const badge = getPaymentBadge(b.paymentStatus);
                                return (
                                    <div key={b.id} onClick={() => router.push(`/partner/booking/${b.id}`)} style={{
                                        background: '#fff', borderRadius: 16, padding: '16px 20px',
                                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                                        cursor: 'pointer', transition: 'all 0.2s ease',
                                        display: 'flex', alignItems: 'center', gap: 16,
                                    }}>
                                        {/* Avatar */}
                                        <div style={{
                                            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontWeight: 700, fontSize: 14,
                                        }}>
                                            {b.customer?.avatar || '?'}
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{b.bookingNumber}</span>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                    background: badge.bg, color: badge.color,
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                }}>
                                                    {badge.icon} {badge.text}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {b.customer?.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                                                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pickup?.location}</span>
                                                </div>
                                                <span style={{ color: '#cbd5e1' }}>→</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                                                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.dropoff?.location}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Price + Arrow */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                                {b.price?.amount} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{b.price?.currency}</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                {b.completedAt ? new Date(b.completedAt).toLocaleDateString('tr-TR') : ''}
                                            </div>
                                        </div>
                                        <RightOutlined style={{ color: '#cbd5e1', fontSize: 14, flexShrink: 0 }} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
