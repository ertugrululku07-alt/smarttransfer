'use client';

import React, { useEffect, useState } from 'react';
import { Skeleton, message } from 'antd';
import {
    CarOutlined, ClockCircleOutlined,
    StarFilled, RightOutlined, HistoryOutlined, PhoneOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AccountGuard from './AccountGuard';
import AccountLayout from './AccountLayout';
import api from '@/lib/api-client';
import { useAuth } from '../context/AuthContext';

interface BookingItem {
    id: string;
    bookingNumber: string;
    status: string;
    paymentStatus: string;
    startDate: string;
    total: number | string;
    currency: string;
    contactName: string;
    pickedUpAt?: string | null;
    droppedOffAt?: string | null;
    metadata?: {
        pickup?: string;
        dropoff?: string;
        vehicleType?: string;
        flightNumber?: string;
        rating?: { overall: number; submittedAt: string } | null;
    };
    driver?: { id: string; fullName: string; phone?: string; avatar?: string };
}

const STATUS_INFO: Record<string, { label: string; bg: string; text: string }> = {
    PENDING:     { label: 'Onay Bekliyor', bg: '#fff7ed', text: '#c2410c' },
    CONFIRMED:   { label: 'Onaylandı',    bg: '#ecfdf5', text: '#065f46' },
    IN_PROGRESS: { label: 'Devam Ediyor', bg: '#ede9fe', text: '#5b21b6' },
    COMPLETED:   { label: 'Tamamlandı',   bg: '#f0fdf4', text: '#166534' },
    CANCELLED:   { label: 'İptal',         bg: '#fef2f2', text: '#b91c1c' },
    NO_SHOW:     { label: 'Gelmedi',       bg: '#fef2f2', text: '#b91c1c' },
};

const STAT_CARDS = [
    { key: 'active',    label: 'Aktif Transfer', icon: CarOutlined,    from: '#6366f1', to: '#8b5cf6' },
    { key: 'completed', label: 'Tamamlanan',     icon: HistoryOutlined, from: '#10b981', to: '#059669' },
    { key: 'rated',     label: 'Verilen Puan',   icon: StarFilled,      from: '#f59e0b', to: '#d97706' },
];

const fmtMoney = (amount: number | string, currency: string) => {
    const n = Number(amount || 0);
    return `${n.toFixed(2)} ${currency || 'TRY'}`;
};

const fmtDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_INFO[status] || { label: status, bg: '#f1f5f9', text: '#64748b' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: s.bg, color: s.text,
        }}>
            <span style={{
                width: 6, height: 6, borderRadius: '50%', background: s.text, display: 'inline-block'
            }} />
            {s.label}
        </span>
    );
}

function ActiveTransferCard({ booking, onOpen }: { booking: BookingItem; onOpen: () => void }) {
    const minutesUntil = booking.startDate
        ? Math.round((new Date(booking.startDate).getTime() - Date.now()) / 60000)
        : null;

    let countdownText = '';
    if (minutesUntil !== null) {
        if (minutesUntil > 60) countdownText = `${Math.round(minutesUntil / 60)} saat sonra`;
        else if (minutesUntil > 0) countdownText = `${minutesUntil} dk sonra`;
        else if (minutesUntil > -60 && minutesUntil <= 0) countdownText = 'Şu anda';
    }

    const driverInitials = booking.driver?.fullName
        ? booking.driver.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        : '?';

    return (
        <div
            onClick={onOpen}
            style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 60%, #8b5cf6 100%)',
                borderRadius: 20, padding: 28, marginBottom: 16, cursor: 'pointer',
                boxShadow: '0 20px 40px -12px rgba(99,102,241,0.45)',
                position: 'relative', overflow: 'hidden',
                transition: 'transform 0.18s, box-shadow 0.18s',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 28px 48px -12px rgba(99,102,241,0.55)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px -12px rgba(99,102,241,0.45)';
            }}
        >
            {/* decorative circles */}
            <div style={{
                position: 'absolute', width: 200, height: 200, borderRadius: '50%',
                background: 'rgba(255,255,255,0.07)', top: -60, right: -40, pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute', width: 120, height: 120, borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)', bottom: -30, left: 60, pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{
                            background: 'rgba(255,255,255,0.2)', color: '#fff',
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1,
                        }}>AKTİF</span>
                        <StatusBadge status={booking.status} />
                        {countdownText && (
                            <span style={{
                                background: 'rgba(251,191,36,0.25)', color: '#fde68a',
                                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                                <ClockCircleOutlined />{countdownText}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#a5f3fc', flexShrink: 0
                            }} />
                            <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
                                {booking.metadata?.pickup || '—'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                            <div style={{
                                width: 4, borderLeft: '2px dashed rgba(255,255,255,0.3)',
                                height: 18, marginLeft: 2
                            }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: 2,
                                background: '#fca5a5', flexShrink: 0
                            }} />
                            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: 700 }}>
                                {booking.metadata?.dropoff || '—'}
                            </span>
                        </div>
                    </div>

                    <div style={{ marginTop: 16, color: 'rgba(255,255,255,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarOutlined />
                        <span>{fmtDate(booking.startDate)}</span>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.12)', padding: '1px 8px', borderRadius: 6 }}>
                            {booking.bookingNumber}
                        </span>
                    </div>
                </div>

                {/* Driver card */}
                <div style={{
                    background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)',
                    borderRadius: 16, padding: 16, minWidth: 200, flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.15)',
                }}>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>ŞÖFÖRÜNÜZ</div>
                    {booking.driver ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{
                                    width: 42, height: 42, borderRadius: '50%',
                                    background: 'linear-gradient(135deg,#c7d2fe,#a5b4fc)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 800, fontSize: 14, color: '#3730a3', flexShrink: 0,
                                }}>{driverInitials}</div>
                                <div>
                                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{booking.driver.fullName}</div>
                                    {booking.driver.phone && (
                                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                                            <PhoneOutlined style={{ marginRight: 4 }} />{booking.driver.phone}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 12 }}>Atama bekleniyor…</div>
                    )}
                    <button
                        style={{
                            width: '100%', padding: '8px 0', borderRadius: 10,
                            background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)',
                            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.28)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                    >
                        Detayları Gör <RightOutlined />
                    </button>
                </div>
            </div>
        </div>
    );
}

function BookingMiniCard({ booking, onOpen }: { booking: BookingItem; onOpen: () => void }) {
    return (
        <div
            onClick={onOpen}
            style={{
                background: '#fff', borderRadius: 14, padding: '14px 16px',
                marginBottom: 8, cursor: 'pointer',
                border: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all 0.15s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#c7d2fe';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
            }}
        >
            <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <CarOutlined style={{ color: '#6366f1', fontSize: 18 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <StatusBadge status={booking.status} />
                    <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{booking.bookingNumber}</span>
                </div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {booking.metadata?.pickup || '—'} → {booking.metadata?.dropoff || '—'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    <CalendarOutlined style={{ marginRight: 4 }} />{fmtDate(booking.startDate)}
                    <span style={{ margin: '0 6px' }}>•</span>
                    {fmtMoney(booking.total, booking.currency)}
                </div>
            </div>
            <RightOutlined style={{ color: '#cbd5e1', fontSize: 14, flexShrink: 0 }} />
        </div>
    );
}

export default function AccountDashboardPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [activeBookings, setActiveBookings] = useState<BookingItem[]>([]);
    const [pastBookings, setPastBookings] = useState<BookingItem[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const [activeRes, pastRes] = await Promise.all([
                    api.get('/api/customer/bookings?status=active'),
                    api.get('/api/customer/bookings?status=past&pageSize=5'),
                ]);
                if (activeRes.data.success) setActiveBookings(activeRes.data.data.items || []);
                if (pastRes.data.success) setPastBookings(pastRes.data.data.items || []);
            } catch (e: any) {
                message.error(e?.response?.data?.error || 'Veriler alınamadı');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const completedTrips = pastBookings.filter(b => b.status === 'COMPLETED').length;
    const ratedTrips = pastBookings.filter(b => b.metadata?.rating?.overall).length;

    const statValues: Record<string, number> = {
        active: activeBookings.length,
        completed: completedTrips,
        rated: ratedTrips,
    };

    const greetHour = new Date().getHours();
    const greetWord = greetHour < 12 ? 'Günaydın' : greetHour < 18 ? 'İyi günler' : 'İyi akşamlar';

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>

                    {/* Hero greeting */}
                    <div style={{
                        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)',
                        borderRadius: 24, padding: '32px 36px', marginBottom: 24,
                        position: 'relative', overflow: 'hidden',
                        boxShadow: '0 16px 40px rgba(15,23,42,0.25)',
                    }}>
                        <div style={{
                            position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                            background: 'rgba(99,102,241,0.12)', top: -100, right: 60, pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute', width: 180, height: 180, borderRadius: '50%',
                            background: 'rgba(139,92,246,0.1)', bottom: -60, right: 220, pointerEvents: 'none'
                        }} />
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{ color: 'rgba(199,210,254,0.7)', fontSize: 13, marginBottom: 4 }}>{greetWord} 👋</div>
                            <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.2 }}>
                                {user?.fullName || user?.email}
                            </h1>
                            <p style={{ color: 'rgba(199,210,254,0.65)', margin: 0, fontSize: 14 }}>
                                Aktif transferlerinizi takip edin, geçmiş rezervasyonlarınızı görüntüleyin.
                            </p>
                        </div>
                    </div>

                    {/* Stat cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
                        {STAT_CARDS.map(s => {
                            const Icon = s.icon;
                            return (
                                <div key={s.key} style={{
                                    background: '#fff', borderRadius: 16, padding: '20px 20px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
                                    display: 'flex', alignItems: 'center', gap: 14,
                                }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                                        background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: `0 6px 16px -4px ${s.from}66`,
                                    }}>
                                        <Icon style={{ color: '#fff', fontSize: 20 }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                                            {loading ? '—' : statValues[s.key]}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{s.label}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Active transfers */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Aktif Transferler</h2>
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Yaklaşan ve devam eden yolculuklarınız</p>
                        </div>
                    </div>

                    {loading ? (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    ) : activeBookings.length === 0 ? (
                        <div style={{
                            background: '#fff', borderRadius: 16, border: '2px dashed #e2e8f0',
                            padding: '40px 24px', textAlign: 'center', marginBottom: 24,
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px',
                            }}>
                                <CarOutlined style={{ color: '#6366f1', fontSize: 28 }} />
                            </div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16, marginBottom: 6 }}>Aktif transfer yok</div>
                            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Yeni bir transfer aramak için tıklayın</div>
                            <button
                                onClick={() => router.push('/')}
                                style={{
                                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                    color: '#fff', border: 'none', borderRadius: 10,
                                    padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    boxShadow: '0 6px 16px rgba(99,102,241,0.35)',
                                }}
                            >
                                Transfer Ara
                            </button>
                        </div>
                    ) : (
                        activeBookings.map(b => (
                            <ActiveTransferCard
                                key={b.id}
                                booking={b}
                                onOpen={() => router.push(`/account/bookings/${b.id}`)}
                            />
                        ))
                    )}

                    {/* Recent past */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '28px 0 14px' }}>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Son Rezervasyonlar</h2>
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Son 5 rezervasyonunuz</p>
                        </div>
                        <button
                            onClick={() => router.push('/account/bookings')}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: '#6366f1', fontWeight: 600, fontSize: 13,
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            Tümünü Gör <RightOutlined style={{ fontSize: 11 }} />
                        </button>
                    </div>

                    {loading ? (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    ) : pastBookings.length === 0 ? (
                        <div style={{
                            background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
                            padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: 14,
                        }}>
                            Henüz tamamlanmış rezervasyon yok
                        </div>
                    ) : (
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            {pastBookings.map((b, i) => (
                                <div key={b.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                                    <BookingMiniCard booking={b} onOpen={() => router.push(`/account/bookings/${b.id}`)} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
