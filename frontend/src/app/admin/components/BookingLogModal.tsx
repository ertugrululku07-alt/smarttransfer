'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Timeline, Tag, Typography, Spin, Empty, Tooltip, Button } from 'antd';
import {
    ClockCircleOutlined, UserOutlined, CheckCircleOutlined, CloseCircleOutlined,
    CarOutlined, EditOutlined, SafetyCertificateOutlined, TeamOutlined,
    RocketOutlined, SwapOutlined, ReloadOutlined, FileTextOutlined,
    EnvironmentOutlined, PlusCircleOutlined, ExclamationCircleOutlined,
    StopOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const { Text, Title } = Typography;

interface BookingLogModalProps {
    open: boolean;
    bookingId: string | null;
    bookingNumber?: string;
    onClose: () => void;
}

interface LogEntry {
    id: string;
    action: string;
    userName: string;
    userEmail?: string;
    userRole?: string;
    details?: any;
    createdAt: string;
    ipAddress?: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    CREATE_BOOKING:         { icon: <PlusCircleOutlined />,        color: '#10b981', label: 'Rezervasyon Oluşturuldu' },
    UPDATE_BOOKING:         { icon: <EditOutlined />,              color: 'var(--brand-primary)', label: 'Rezervasyon Düzenlendi' },
    UPDATE_BOOKING_STATUS:  { icon: <SwapOutlined />,              color: 'var(--brand-accent)', label: 'Durum Değiştirildi' },
    CONFIRM_BOOKING:        { icon: <CheckCircleOutlined />,       color: '#10b981', label: 'Onaylandı' },
    CONFIRM_TO_OPERATION:   { icon: <SafetyCertificateOutlined />, color: '#10b981', label: 'Operasyona Aktarıldı' },
    CONFIRM_TO_POOL:        { icon: <TeamOutlined />,              color: '#06b6d4', label: 'Havuza Aktarıldı' },
    CANCEL_BOOKING:         { icon: <CloseCircleOutlined />,       color: '#ef4444', label: 'İptal Edildi' },
    COMPLETE_BOOKING:       { icon: <CheckCircleOutlined />,       color: '#10b981', label: 'Tamamlandı' },
    NO_SHOW_BOOKING:        { icon: <StopOutlined />,              color: '#9ca3af', label: 'Gelmedi' },
    ASSIGN_DRIVER:          { icon: <CarOutlined />,               color: '#f59e0b', label: 'Şoför Atandı' },
    RETURN_TO_RESERVATION:  { icon: <ExclamationCircleOutlined />, color: '#f97316', label: 'Rezervasyona İade' },
};

const getRoleLabel = (role?: string) => {
    if (!role) return '';
    const map: Record<string, string> = {
        SUPER_ADMIN: 'Süper Admin',
        TENANT_ADMIN: 'Admin',
        AGENCY_ADMIN: 'Acente Admin',
        AGENCY_STAFF: 'Acente Personel',
        PARTNER: 'Partner',
        DRIVER: 'Şoför',
        CUSTOMER: 'Müşteri',
    };
    return map[role] || role;
};

const BookingLogModal: React.FC<BookingLogModalProps> = ({ open, bookingId, bookingNumber, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [booking, setBooking] = useState<any>(null);

    const fetchLogs = async () => {
        if (!bookingId) return;
        setLoading(true);
        try {
            const res = await apiClient.get(`/api/admin/logs/booking/${bookingId}`);
            if (res.data.success) {
                setLogs(res.data.data.logs || []);
                setBooking(res.data.data.booking || null);
            }
        } catch {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && bookingId) fetchLogs();
        if (!open) { setLogs([]); setBooking(null); }
    }, [open, bookingId]);

    const getActionConfig = (action: string) => {
        return ACTION_CONFIG[action] || {
            icon: <FileTextOutlined />,
            color: '#94a3b8',
            label: action.replace(/_/g, ' ')
        };
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <FileTextOutlined style={{ color: '#fff', fontSize: 16 }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>Rezervasyon Logu</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {bookingNumber || booking?.bookingNumber || bookingId}
                        </Text>
                    </div>
                </div>
            }
            open={open}
            onCancel={onClose}
            width={640}
            footer={[
                <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
                    Yenile
                </Button>,
                <Button key="close" type="primary" onClick={onClose}>
                    Kapat
                </Button>
            ]}
            styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', padding: '16px 24px' } }}
        >
            {/* Booking Summary */}
            {booking && (
                <div style={{
                    background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
                    marginBottom: 16, border: '1px solid #e2e8f0',
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8
                }}>
                    <div>
                        <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>Müşteri</Text>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{booking.contactName || '-'}</div>
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>Transfer</Text>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {booking.startDate ? dayjs(booking.startDate).format('DD.MM.YYYY HH:mm') : '-'}
                        </div>
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>Durum</Text>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{booking.status}</div>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 12, color: '#94a3b8' }}>Log yükleniyor...</div>
                </div>
            ) : logs.length === 0 ? (
                <Empty
                    description="Bu rezervasyona ait log kaydı bulunamadı."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ padding: '40px 0' }}
                />
            ) : (
                <Timeline
                    items={logs.map((log) => {
                        const config = getActionConfig(log.action);
                        const changes = log.details?.changes || [];
                        const msg = log.details?.message || '';

                        return {
                            dot: <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: `${config.color}18`,
                                border: `2px solid ${config.color}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: config.color, fontSize: 13
                            }}>
                                {config.icon}
                            </div>,
                            children: (
                                <div style={{ paddingBottom: 8 }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                        <div>
                                            <Tag color={config.color} style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                                                {config.label}
                                            </Tag>
                                        </div>
                                        <Tooltip title={dayjs(log.createdAt).format('DD.MM.YYYY HH:mm:ss')}>
                                            <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                                                <ClockCircleOutlined style={{ marginRight: 3 }} />
                                                {dayjs(log.createdAt).format('DD.MM HH:mm')}
                                            </Text>
                                        </Tooltip>
                                    </div>

                                    {/* User */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <UserOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                                        <Text style={{ fontSize: 12, fontWeight: 500 }}>{log.userName}</Text>
                                        {log.userRole && (
                                            <Tag style={{ fontSize: 10, margin: 0, lineHeight: '16px' }} color="default">
                                                {getRoleLabel(log.userRole)}
                                            </Tag>
                                        )}
                                    </div>

                                    {/* Message */}
                                    {msg && (
                                        <div style={{
                                            fontSize: 12, color: '#475569', lineHeight: 1.5,
                                            background: '#f8fafc', borderRadius: 6, padding: '6px 10px',
                                            marginTop: 4, borderLeft: `3px solid ${config.color}30`
                                        }}>
                                            {msg}
                                        </div>
                                    )}

                                    {/* Changes list */}
                                    {changes.length > 0 && (
                                        <div style={{
                                            marginTop: 6, fontSize: 11, color: '#64748b',
                                            background: '#fafbfc', borderRadius: 6, padding: '6px 10px'
                                        }}>
                                            {changes.map((c: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                                    <span style={{ color: config.color, fontWeight: 700 }}>›</span> {c}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* IP */}
                                    {log.ipAddress && (
                                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 3 }}>
                                            IP: {log.ipAddress}
                                        </Text>
                                    )}
                                </div>
                            )
                        };
                    })}
                />
            )}
        </Modal>
    );
};

export default BookingLogModal;
