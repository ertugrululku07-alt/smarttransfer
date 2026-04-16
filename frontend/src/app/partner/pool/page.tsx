'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '../PartnerLayout';
import PartnerGuard from '../PartnerGuard';
import { Spin } from 'antd';
import {
    CarOutlined,
    UserOutlined,
    CalendarOutlined,
    RightOutlined,
    InboxOutlined,
    ReloadOutlined,
    PhoneOutlined
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';

export default function MyTransfersPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [transfers, setTransfers] = useState<any[]>([]);

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/api/transfer/partner/active-bookings');
            if (response.data.success) setTransfers(response.data.data);
        } catch (error) {
            console.error('Error fetching transfers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTransfers(); }, []);

    return (
        <PartnerGuard>
            <PartnerLayout>
                <style jsx global>{`
                    .pool-container { max-width: 1200px; margin: 0 auto; }
                    .pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }
                    @media (max-width: 768px) {
                        .pool-container { padding-top: 68px; }
                        .pool-grid { grid-template-columns: 1fr !important; gap: 16px; }
                    }
                `}</style>

                <div className="pool-container">
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>🚗 Transferlerim</h1>
                            <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Kabul ettiğiniz ve aktif olan transferler</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                                padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                                boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                            }}>
                                {transfers.length} Aktif
                            </div>
                            <button onClick={fetchTransfers} style={{
                                width: 40, height: 40, borderRadius: 12, border: '1px solid #e2e8f0',
                                background: '#fff', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', color: '#64748b',
                            }}>
                                <ReloadOutlined />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <Spin size="large" />
                            <p style={{ color: '#94a3b8', marginTop: 12 }}>Yükleniyor...</p>
                        </div>
                    ) : transfers.length === 0 ? (
                        <div style={{
                            background: '#fff', borderRadius: 20, padding: '60px 24px', textAlign: 'center',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                        }}>
                            <InboxOutlined style={{ fontSize: 52, color: '#cbd5e1' }} />
                            <h3 style={{ color: '#475569', fontWeight: 600, margin: '16px 0 8px' }}>Aktif transfer yok</h3>
                            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>Kabul ettiğiniz transferler burada görünecek</p>
                            <button onClick={() => router.push('/partner')} style={{
                                padding: '10px 24px', border: 'none', borderRadius: 12,
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                            }}>Transfer Havuzuna Git</button>
                        </div>
                    ) : (
                        <div className="pool-grid">
                            {transfers.map((t) => (
                                <div key={t.id} style={{
                                    background: '#fff', borderRadius: 18, overflow: 'hidden',
                                    boxShadow: '0 2px 16px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9',
                                }}>
                                    <div style={{ height: 4, background: 'linear-gradient(90deg, #10b981, #059669)' }} />
                                    <div style={{ padding: '18px 20px' }}>
                                        {/* Top row */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{t.bookingNumber}</div>
                                            <div style={{
                                                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                background: '#d1fae5', color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5,
                                            }}>Aktif</div>
                                        </div>

                                        {/* Route */}
                                        <div style={{
                                            background: '#f8fafc', borderRadius: 14, padding: '14px 16px', marginBottom: 14,
                                            border: '1px solid #f1f5f9',
                                        }}>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 0 3px rgba(16,185,129,0.2)' }} />
                                                    <div style={{ width: 2, flex: 1, background: 'linear-gradient(to bottom, #10b981, #e2e8f0)', margin: '4px 0', minHeight: 24 }} />
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.2)' }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ marginBottom: 14 }}>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>ALIŞ</div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>{t.pickup.location}</div>
                                                        <div style={{
                                                            marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5,
                                                            background: '#ecfdf5', padding: '3px 10px', borderRadius: 8,
                                                            fontSize: 12, fontWeight: 600, color: '#059669',
                                                        }}>
                                                            <CalendarOutlined style={{ fontSize: 11 }} />{t.pickup.time}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>VARIŞ</div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>{t.dropoff.location}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Info chips */}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#f1f5f9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                                                <CarOutlined style={{ fontSize: 12 }} />{t.vehicle.type}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#f1f5f9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                                                <UserOutlined style={{ fontSize: 12 }} />{t.customer.name}
                                            </div>
                                            {t.customer.phone && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#f1f5f9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                                                    <PhoneOutlined style={{ fontSize: 12 }} />{t.customer.phone}
                                                </div>
                                            )}
                                        </div>

                                        {/* Action */}
                                        <button onClick={() => router.push(`/partner/booking/${t.id}`)} style={{
                                            width: '100%', padding: '12px', border: 'none', borderRadius: 12,
                                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                        }}>
                                            Detay / İşlemler <RightOutlined style={{ fontSize: 12 }} />
                                        </button>
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
