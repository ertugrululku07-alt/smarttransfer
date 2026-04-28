'use client';

import React, { useEffect, useState } from 'react';
import { Card, List, Avatar, Typography, Empty, Skeleton, Tag, Space, message } from 'antd';
import { MessageOutlined, UserOutlined, RightOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AccountGuard from '../AccountGuard';
import AccountLayout from '../AccountLayout';
import api from '@/lib/api-client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;

interface Conv {
    bookingId: string;
    bookingNumber: string;
    driverId: string;
    driverName: string;
    driverAvatar?: string | null;
    lastMessage?: string | null;
    lastAt?: string | null;
    unread: number;
}

export default function MessagesPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState<Conv[]>([]);

    useEffect(() => {
        (async () => {
            try {
                // Fetch all bookings with drivers — use them as conversation seeds
                const [bookingsRes, msgsRes] = await Promise.all([
                    api.get('/api/customer/bookings?status=all&pageSize=50'),
                    api.get('/api/messages')
                ]);

                const bookings = bookingsRes.data.data?.items || [];
                const allMessages = msgsRes.data.data || [];

                // Build per-booking conversation summaries
                const map = new Map<string, Conv>();
                bookings.forEach((b: any) => {
                    if (!b.driver) return;
                    map.set(b.id, {
                        bookingId: b.id,
                        bookingNumber: b.bookingNumber,
                        driverId: b.driver.id,
                        driverName: b.driver.fullName,
                        driverAvatar: b.driver.avatar,
                        lastMessage: null,
                        lastAt: null,
                        unread: 0,
                    });
                });

                allMessages.forEach((m: any) => {
                    if (!m.bookingId) return;
                    const c = map.get(m.bookingId);
                    if (!c) return;
                    if (!c.lastAt || new Date(m.createdAt) > new Date(c.lastAt)) {
                        c.lastMessage = m.content;
                        c.lastAt = m.createdAt;
                    }
                    if (m.receiverId === user?.id && !m.isRead) c.unread++;
                });

                const list = Array.from(map.values())
                    .filter(c => c.lastMessage || c.driverId)
                    .sort((a, b) => {
                        if (!a.lastAt) return 1;
                        if (!b.lastAt) return -1;
                        return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
                    });

                setConversations(list);
            } catch (e: any) {
                message.error(e?.response?.data?.error || 'Mesajlar alınamadı');
            } finally {
                setLoading(false);
            }
        })();
    }, [user?.id]);

    return (
        <AccountGuard>
            <AccountLayout>
                <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
                    <Title level={3} style={{ margin: '0 0 16px 0' }}>
                        <MessageOutlined /> Mesajlar
                    </Title>

                    <Card>
                        {loading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : conversations.length === 0 ? (
                            <Empty description="Henüz mesajlaşma yok. Aktif transferinizdeki şoförle iletişime geçebilirsiniz." />
                        ) : (
                            <List
                                dataSource={conversations}
                                renderItem={c => (
                                    <List.Item
                                        onClick={() => router.push(`/account/bookings/${c.bookingId}`)}
                                        style={{ cursor: 'pointer' }}
                                        actions={[<RightOutlined key="r" style={{ color: '#94a3b8' }} />]}
                                    >
                                        <List.Item.Meta
                                            avatar={
                                                <Avatar size={44} icon={<UserOutlined />} src={c.driverAvatar}>
                                                    {(c.driverName || 'S').charAt(0).toUpperCase()}
                                                </Avatar>
                                            }
                                            title={
                                                <Space>
                                                    <strong>{c.driverName}</strong>
                                                    <Tag color="blue" style={{ fontSize: 10 }}>{c.bookingNumber}</Tag>
                                                    {c.unread > 0 && <Tag color="red">{c.unread} yeni</Tag>}
                                                </Space>
                                            }
                                            description={
                                                <Space direction="vertical" size={0}>
                                                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                                        {c.lastMessage || 'Henüz mesaj yok'}
                                                    </Text>
                                                    {c.lastAt && (
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            {new Date(c.lastAt).toLocaleString('tr-TR')}
                                                        </Text>
                                                    )}
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </div>
            </AccountLayout>
        </AccountGuard>
    );
}
