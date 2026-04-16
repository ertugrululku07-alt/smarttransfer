'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Card, Layout, List, Input, Button, Typography, Tag, notification, Space, Empty, Spin } from 'antd';
import { SendOutlined, UserOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';

const { Sider, Content } = Layout;
const { Text } = Typography;

interface ChatSession {
    id: string;
    status: 'BOT' | 'HUMAN' | 'CLOSED';
    updatedAt: string;
    messages: { content: string, createdAt: string }[];
}

interface ChatMessage {
    id: string;
    sender: 'USER' | 'BOT' | 'ADMIN';
    content: string;
    createdAt: string;
}

export default function AdminLiveSupportPage() {
    const { socket, isConnected } = useSocket();
    const { token } = useAuth();
    
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchSessions = async () => {
        try {
            const URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app';
            const { data } = await axios.get(`${URL}/api/live-chat/sessions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.success) {
                setSessions(data.sessions);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchMessages = async (sid: string) => {
        setLoading(true);
        try {
            const URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app';
            const { data } = await axios.get(`${URL}/api/live-chat/sessions/${sid}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.success) {
                setMessages(data.messages);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            scrollToBottom();
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
    };

    useEffect(() => {
        if (!token) return;
        fetchSessions();
        // Refresh every 30s
        const interval = setInterval(fetchSessions, 30000);
        return () => clearInterval(interval);
    }, [token]);

    useEffect(() => {
        if (!socket || !isConnected) return;

        // Listen for new connections / human requests
        socket.on('chat:request_human', (data) => {
            notification.warning({
                message: 'Canlı Destek Talebi',
                description: 'Bir müşteri temsilciye bağlanmak istiyor.',
                placement: 'bottomRight'
            });
            fetchSessions();
        });

        socket.on('chat:admin_receive', (msg: ChatMessage) => {
            // Update active chat if matches
            if (msg.sessionId === activeSessionId) {
                setMessages(prev => [...prev, msg]);
                scrollToBottom();
            }
            // Move session to top / update last message
            fetchSessions();
        });

        // Cleanup
        return () => {
            socket.off('chat:request_human');
            socket.off('chat:admin_receive');
        };
    }, [socket, isConnected, activeSessionId]);

    const handleSelectSession = (sid: string) => {
        setActiveSessionId(sid);
        fetchMessages(sid);
        if (socket) {
            socket.emit('admin:join_chat', { sessionId: sid });
        }
    };

    const handleSend = () => {
        if (!draft.trim() || !activeSessionId || !socket) return;
        socket.emit('admin:send_message', {
            sessionId: activeSessionId,
            content: draft.trim()
        });
        setDraft('');
    };

    const handleCloseChat = () => {
        if (!activeSessionId || !socket) return;
        socket.emit('admin:close_chat', { sessionId: activeSessionId });
        notification.success({ message: 'Sohbet kapatıldı' });
        setActiveSessionId(null);
        fetchSessions();
    };

    return (
        <Card title="Canlı Destek Yönetimi" bodyStyle={{ padding: 0 }}>
            <Layout style={{ height: '70vh', background: '#fff' }}>
                <Sider width={300} style={{ background: '#fff', borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
                    <List
                        dataSource={sessions}
                        renderItem={(item) => (
                            <List.Item 
                                style={{ 
                                    padding: '16px', 
                                    cursor: 'pointer', 
                                    background: item.id === activeSessionId ? '#e6f7ff' : '#fff',
                                    borderBottom: '1px solid #f0f0f0'
                                }}
                                onClick={() => handleSelectSession(item.id)}
                            >
                                <List.Item.Meta
                                    avatar={<UserOutlined style={{ fontSize: 24, color: item.status === 'HUMAN' ? '#faad14' : '#1890ff' }} />}
                                    title={
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Müşteri {item.id.substring(0,6)}</span>
                                            <Tag color={item.status === 'HUMAN' ? 'orange' : item.status === 'BOT' ? 'blue' : 'default'} style={{ margin: 0 }}>
                                                {item.status}
                                            </Tag>
                                        </div>
                                    }
                                    description={
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                            <Text ellipsis style={{ width: 180, fontSize: 12 }}>
                                                {item.messages?.[0]?.content || 'Henüz mesaj yok'}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 10 }}>
                                                {dayjs(item.updatedAt).format('HH:mm')}
                                            </Text>
                                        </div>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </Sider>
                <Content style={{ display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
                    {activeSessionId ? (
                        <>
                            <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
                                <h3>Oturum: {activeSessionId}</h3>
                                <Button danger icon={<CheckCircleOutlined />} onClick={handleCloseChat}>
                                    Sohbeti Sonlandır
                                </Button>
                            </div>
                            
                            <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                                {loading ? <div style={{ textAlign: 'center' }}><Spin /></div> : (
                                    messages.map((msg, i) => {
                                        const isAdmin = msg.sender === 'ADMIN';
                                        const isBot = msg.sender === 'BOT';
                                        
                                        return (
                                            <div key={msg.id || i} style={{
                                                display: 'flex',
                                                justifyContent: isAdmin ? 'flex-end' : 'flex-start',
                                                marginBottom: 16
                                            }}>
                                                <div style={{
                                                    maxWidth: '70%',
                                                    padding: '12px 16px',
                                                    borderRadius: 8,
                                                    background: isAdmin ? '#1890ff' : isBot ? '#f0f5ff' : '#fff',
                                                    color: isAdmin ? '#fff' : '#333',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                                    border: isBot ? '1px solid #adc6ff' : '1px solid #f0f0f0'
                                                }}>
                                                    {isBot && <div style={{ fontSize: 10, color: '#1890ff', marginBottom: 4 }}><RobotOutlined /> Akıllı Asistan</div>}
                                                    {msg.content}
                                                    <div style={{ fontSize: 10, textAlign: 'right', marginTop: 4, opacity: 0.7 }}>
                                                        {dayjs(msg.createdAt).format('HH:mm')}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div style={{ padding: 16, background: '#fff', borderTop: '1px solid #f0f0f0' }}>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input 
                                        size="large"
                                        placeholder="Müşteriye yanıtınızı yazın..." 
                                        value={draft}
                                        onChange={e => setDraft(e.target.value)}
                                        onPressEnter={handleSend}
                                    />
                                    <Button size="large" type="primary" onClick={handleSend} icon={<SendOutlined />} />
                                </Space.Compact>
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Empty description="Yazışma başlatmak için soldan bir oturum seçin" />
                        </div>
                    )}
                </Content>
            </Layout>
        </Card>
    );
}
