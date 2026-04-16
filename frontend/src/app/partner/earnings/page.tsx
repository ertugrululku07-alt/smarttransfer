'use client';

import React, { useState, useEffect } from 'react';
import { useDefinitions } from '@/app/hooks/useDefinitions';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import { Spin, message } from 'antd';
import {
    DollarOutlined,
    RiseOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    InboxOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

export default function EarningsPage() {
    const { defaultCurrency: defCurrency } = useDefinitions();
    const [loading, setLoading] = useState(true);
    const [earnings, setEarnings] = useState<any[]>([]);
    const [stats, setStats] = useState({ totalNet: 0, pending: 0, paid: 0 });

    useEffect(() => { fetchStats(); fetchEarnings(); }, []);

    const fetchStats = async () => {
        try {
            const res = await apiClient.get('/api/transfer/partner/stats');
            if (res.data.success && res.data.data.financials) {
                const fin = res.data.data.financials;
                setStats({ totalNet: fin.credit, pending: fin.balance, paid: fin.debit });
            }
        } catch (error) { console.error('Error fetching stats:', error); }
    };

    const fetchEarnings = async () => {
        try {
            const response = await apiClient.get('/api/transfer/partner/completed-bookings');
            if (response.data.success) {
                const processedEarnings = response.data.data.map((booking: any) => ({
                    key: booking.id, id: booking.id, bookingNumber: booking.bookingNumber,
                    date: booking.pickup.time,
                    route: { from: booking.pickup.location, to: booking.dropoff.location },
                    amount: Number(booking.price.amount),
                    deduction: Number(booking.price.commissionAmount || 0),
                    net: Number(booking.price.netEarning || booking.price.amount),
                    commissionRate: booking.price.commissionRate,
                    currency: booking.price.currency,
                    status: booking.paymentStatus || 'PENDING',
                    customer: booking.customer.name
                }));
                setEarnings(processedEarnings);
            }
        } catch (error) {
            console.error('Error fetching earnings:', error);
            message.error('Kazanç bilgileri alınamadı');
        } finally { setLoading(false); }
    };

    const cur = defCurrency?.code || 'TRY';

    return (
        <PartnerGuard>
            <PartnerLayout>
                <style jsx global>{`
                    .earnings-container { max-width: 1200px; margin: 0 auto; }
                    .earnings-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
                    .earnings-list { display: flex; flex-direction: column; gap: 10px; }
                    @media (max-width: 768px) {
                        .earnings-container { padding-top: 68px; }
                        .earnings-stat-grid { grid-template-columns: 1fr !important; gap: 12px; }
                    }
                `}</style>

                <div className="earnings-container">
                    {/* Header */}
                    <div style={{ marginBottom: 8 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>💰 Kazanç Raporu</h1>
                        <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Tamamlanan transferleriniz ve ödeme detayları</p>
                    </div>

                    {/* Stats */}
                    <div className="earnings-stat-grid">
                        <div style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 16,
                            padding: '22px 24px', color: '#fff', position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', right: -12, top: -12, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <RiseOutlined /> Toplam Net Kazanç
                            </div>
                            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginTop: 8 }}>
                                {stats.totalNet.toFixed(2)}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{cur}</div>
                        </div>
                        <div style={{
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 16,
                            padding: '22px 24px', color: '#fff', position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', right: -12, top: -12, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ClockCircleOutlined /> Bekleyen Ödeme
                            </div>
                            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginTop: 8 }}>
                                {stats.pending.toFixed(2)}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{cur}</div>
                        </div>
                        <div style={{
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)', borderRadius: 16,
                            padding: '22px 24px', color: '#fff', position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', right: -12, top: -12, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <DollarOutlined /> Yapılan Ödeme
                            </div>
                            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginTop: 8 }}>
                                {stats.paid.toFixed(2)}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{cur}</div>
                        </div>
                    </div>

                    {/* Earnings List */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <Spin size="large" />
                            <p style={{ color: '#94a3b8', marginTop: 12 }}>Yükleniyor...</p>
                        </div>
                    ) : earnings.length === 0 ? (
                        <div style={{
                            background: '#fff', borderRadius: 20, padding: '60px 24px', textAlign: 'center',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                        }}>
                            <InboxOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />
                            <h3 style={{ color: '#475569', fontWeight: 600, margin: '16px 0 8px' }}>Henüz kazanç kaydı yok</h3>
                            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Tamamlanan transferleriniz burada görünecek</p>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', borderRadius: 18, overflow: 'hidden',
                            boxShadow: '0 2px 16px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                        }}>
                            {/* Table Header - hidden on mobile */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr 0.8fr',
                                padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
                                fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8,
                            }}>
                                <span>Tarih</span><span>Güzergah</span><span style={{ textAlign: 'right' }}>Tutar</span>
                                <span style={{ textAlign: 'right' }}>Kesinti</span><span style={{ textAlign: 'right' }}>Net</span>
                                <span style={{ textAlign: 'center' }}>Durum</span>
                            </div>

                            {earnings.map((e, i) => (
                                <div key={e.id} style={{
                                    display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr 0.8fr',
                                    padding: '14px 20px', borderBottom: i < earnings.length - 1 ? '1px solid #f8fafc' : 'none',
                                    alignItems: 'center', fontSize: 13, transition: 'background 0.2s',
                                }}>
                                    {/* Date */}
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{e.date}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{e.bookingNumber}</div>
                                    </div>
                                    {/* Route */}
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }}>{e.route.from}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }}>{e.route.to}</span>
                                        </div>
                                    </div>
                                    {/* Amount */}
                                    <div style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                                        {e.amount.toFixed(2)} {e.currency}
                                    </div>
                                    {/* Deduction */}
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ color: e.deduction > 0 ? '#ef4444' : '#94a3b8', fontWeight: 500 }}>
                                            {e.deduction > 0 ? `-${e.deduction.toFixed(2)}` : '0.00'} {e.currency}
                                        </span>
                                        {e.commissionRate != null && (
                                            <div style={{ fontSize: 10, color: '#94a3b8' }}>%{e.commissionRate}</div>
                                        )}
                                    </div>
                                    {/* Net */}
                                    <div style={{ textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: 14 }}>
                                        +{e.net.toFixed(2)} {e.currency}
                                    </div>
                                    {/* Status */}
                                    <div style={{ textAlign: 'center' }}>
                                        <span style={{
                                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                            background: e.status === 'PAID' ? '#d1fae5' : '#fef3c7',
                                            color: e.status === 'PAID' ? '#065f46' : '#92400e',
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                        }}>
                                            {e.status === 'PAID' ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                                            {e.status === 'PAID' ? 'Ödendi' : 'Bekliyor'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PartnerLayout>
        </PartnerGuard>
    );
}
