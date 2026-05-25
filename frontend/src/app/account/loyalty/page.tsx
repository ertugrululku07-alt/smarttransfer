'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Card, Row, Col, Typography, Tag, Space, Statistic, Table, Empty,
    Progress, Divider, Alert, Skeleton
} from 'antd';
import {
    GiftOutlined, TrophyOutlined, ArrowUpOutlined, ArrowDownOutlined,
    StarOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AccountGuard from '../AccountGuard';
import AccountLayout from '../AccountLayout';
import api from '@/lib/api-client';

const { Title, Text } = Typography;

const TX_LABELS: Record<string, { label: string; color: string }> = {
    EARN:   { label: 'Kazanıldı', color: 'green'  },
    REDEEM: { label: 'Harcandı',  color: 'red'    },
    EXPIRE: { label: 'Süresi Doldu', color: 'default' },
    BONUS:  { label: 'Bonus',     color: 'blue'   },
    ADJUST: { label: 'Düzeltme',  color: 'orange' },
};

export default function CustomerLoyaltyPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchLoyalty = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/campaigns/loyalty/me');
            if (res.data.success) setData(res.data.data);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchLoyalty(); }, [fetchLoyalty]);

    if (loading) {
        return (
            <AccountGuard>
                <AccountLayout>
                    <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
                </AccountLayout>
            </AccountGuard>
        );
    }

    if (!data?.enabled) {
        return (
            <AccountGuard>
                <AccountLayout>
                    <div style={{ padding: 24 }}>
                        <Alert
                            type="info"
                            showIcon
                            message="Sadakat Programı"
                            description="Sadakat programı henüz aktif değil. Yakında her transferden puan kazanmaya başlayabileceksiniz!"
                            icon={<GiftOutlined />}
                        />
                    </div>
                </AccountLayout>
            </AccountGuard>
        );
    }

    const { totalPoints, currentTier, nextTier, pointsToNextTier, redeemRate, earned, redeemed, history } = data;
    const progressPercent = nextTier
        ? Math.min(100, Math.round(((totalPoints - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100))
        : 100;

    const columns = [
        {
            title: 'Tarih',
            key: 'date',
            width: 140,
            render: (_: any, r: any) => (
                <Text style={{ fontSize: 13 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {dayjs(r.createdAt).format('DD.MM.YYYY HH:mm')}
                </Text>
            ),
        },
        {
            title: 'İşlem',
            key: 'type',
            render: (_: any, r: any) => {
                const tx = TX_LABELS[r.type] || { label: r.type, color: 'default' };
                return <Tag color={tx.color}>{tx.label}</Tag>;
            }
        },
        {
            title: 'Puan',
            key: 'points',
            render: (_: any, r: any) => (
                <Text strong style={{ color: r.points > 0 ? '#059669' : '#dc2626', fontSize: 14 }}>
                    {r.points > 0 ? '+' : ''}{r.points}
                </Text>
            ),
        },
        {
            title: 'Açıklama',
            dataIndex: 'description',
            key: 'desc',
            render: (d: string, r: any) => (
                <div>
                    <Text style={{ fontSize: 13 }}>{d || '-'}</Text>
                    {r.booking?.bookingNumber && (
                        <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>{r.booking.bookingNumber}</Tag>
                    )}
                </div>
            ),
        },
    ];

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
                    <Title level={3} style={{ marginBottom: 24 }}>
                        <GiftOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
                        Sadakat Puanım
                    </Title>

                    <Row gutter={[16, 16]}>
                        {/* Tier Card */}
                        <Col xs={24} md={8}>
                            <Card
                                style={{
                                    borderRadius: 16,
                                    background: `linear-gradient(135deg, ${currentTier.color}22, ${currentTier.color}44)`,
                                    border: `2px solid ${currentTier.color}`,
                                    textAlign: 'center',
                                }}
                                styles={{ body: { padding: 28 } }}
                            >
                                <div style={{ fontSize: 48 }}>{currentTier.icon}</div>
                                <Title level={3} style={{ margin: '8px 0 4px', color: currentTier.color }}>
                                    {currentTier.name}
                                </Title>
                                <Text type="secondary">Mevcut Seviyeniz</Text>
                                {currentTier.discountPercent > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <Tag color="green" style={{ fontSize: 14, padding: '4px 12px', fontWeight: 700 }}>
                                            %{currentTier.discountPercent} Seviye İndirimi
                                        </Tag>
                                    </div>
                                )}
                            </Card>
                        </Col>

                        {/* Points Summary */}
                        <Col xs={24} md={16}>
                            <Card style={{ borderRadius: 16 }} styles={{ body: { padding: 24 } }}>
                                <Row gutter={[24, 16]}>
                                    <Col xs={24} sm={8}>
                                        <Statistic
                                            title="Toplam Puanınız"
                                            value={totalPoints}
                                            valueStyle={{ color: 'var(--brand-accent)', fontWeight: 800, fontSize: 28 }}
                                            prefix={<StarOutlined />}
                                        />
                                    </Col>
                                    <Col xs={12} sm={8}>
                                        <Statistic
                                            title="Kazanılan"
                                            value={earned}
                                            valueStyle={{ color: '#059669' }}
                                            prefix={<ArrowUpOutlined />}
                                        />
                                    </Col>
                                    <Col xs={12} sm={8}>
                                        <Statistic
                                            title="Harcanan"
                                            value={redeemed}
                                            valueStyle={{ color: '#dc2626' }}
                                            prefix={<ArrowDownOutlined />}
                                        />
                                    </Col>
                                </Row>

                                {nextTier && (
                                    <div style={{ marginTop: 20 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {currentTier.icon} {currentTier.name}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {nextTier.icon} {nextTier.name}
                                            </Text>
                                        </div>
                                        <Progress
                                            percent={progressPercent}
                                            strokeColor={currentTier.color}
                                            showInfo={false}
                                            size="small"
                                        />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            Sonraki seviyeye <strong>{pointsToNextTier.toLocaleString('tr-TR')}</strong> puan kaldı
                                        </Text>
                                    </div>
                                )}

                                <Divider style={{ margin: '16px 0 8px' }} />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {redeemRate} puan = 1 ₺ indirim
                                </Text>
                            </Card>
                        </Col>
                    </Row>

                    {/* History */}
                    <Card title="Puan Geçmişi" style={{ marginTop: 24, borderRadius: 16 }}>
                        {history?.length > 0 ? (
                            <Table
                                dataSource={history}
                                columns={columns}
                                rowKey="id"
                                pagination={{ pageSize: 15 }}
                                size="small"
                                scroll={{ x: 600 }}
                            />
                        ) : (
                            <Empty description="Henüz puan hareketiniz yok. İlk transferinizle puan kazanmaya başlayın!" />
                        )}
                    </Card>
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
