'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, List, Typography, Space, Spin, Avatar, Badge } from 'antd';
import { MessageOutlined, CloseOutlined, SendOutlined, UserOutlined, RobotOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import dayjs from 'dayjs';

const { Text } = Typography;

interface ChatMessage {
    id: string;
    sender: 'USER' | 'BOT' | 'ADMIN';
    content: string;
    createdAt: string;
}

const LiveChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [chatStatus, setChatStatus] = useState<'BOT' | 'HUMAN' | 'CLOSED'>('BOT');
    const [socket, setSocket] = useState<Socket | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial setup
    useEffect(() => {
        let sid = localStorage.getItem('smart_chat_session_id');
        if (!sid) {
            sid = 'session_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('smart_chat_session_id', sid);
        }
        setSessionId(sid);

        const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
        const SOCKET_URL = rawApiUrl.includes('_') ? rawApiUrl.replace(/_/g, '-') : rawApiUrl;

        const newSocket = io(SOCKET_URL, {
            transports: ['polling', 'websocket']
        });

        newSocket.on('connect', () => {
            newSocket.emit('chat:join', { sessionId: sid });
        });

        newSocket.on('chat:history', (history: ChatMessage[]) => {
            setMessages(history);
        });

        newSocket.on('chat:status', (status: 'BOT' | 'HUMAN' | 'CLOSED') => {
            setChatStatus(status);
        });

        newSocket.on('chat:receive', (msg: ChatMessage) => {
            setMessages(prev => [...prev, msg]);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    // Scroll to bottom when messages update
    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    const handleSend = () => {
        if (!inputValue.trim() || !socket || !sessionId) return;

        socket.emit('chat:send_message', {
            sessionId,
            content: inputValue.trim()
        });
        
        setInputValue('');
    };

    const requestHuman = () => {
        if (!socket || !sessionId) return;
        socket.emit('chat:request_human', { sessionId });
    };

    return (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}>
            {!isOpen && (
                <Badge dot={messages.length > 0 && messages[messages.length - 1]?.sender !== 'USER'}>
                    <Button 
                        type="primary" 
                        shape="circle" 
                        icon={<MessageOutlined style={{ fontSize: 24 }} />} 
                        size="large"
                        style={{ width: 64, height: 64, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                        onClick={() => setIsOpen(true)}
                    />
                </Badge>
            )}

            {isOpen && (
                <div style={{
                    width: 350,
                    height: 500,
                    background: '#fff',
                    borderRadius: 16,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '16px',
                        background: chatStatus === 'HUMAN' ? '#faad14' : '#1890ff',
                        color: '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <Space>
                            {chatStatus === 'HUMAN' ? <CustomerServiceOutlined style={{ fontSize: 20 }} /> : <RobotOutlined style={{ fontSize: 20 }} />}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong style={{ fontSize: 16 }}>
                                    {chatStatus === 'HUMAN' ? 'Canlı Destek' : 'Akıllı Asistan'}
                                </strong>
                                <span style={{ fontSize: 12, opacity: 0.8 }}>
                                    {chatStatus === 'HUMAN' ? 'Müşteri Temsilcisi' : 'Size nasıl yardımcı olabilirim?'}
                                </span>
                            </div>
                        </Space>
                        <Button 
                            type="text" 
                            icon={<CloseOutlined />} 
                            style={{ color: '#fff' }} 
                            onClick={() => setIsOpen(false)}
                        />
                    </div>

                    {/* Messages Area */}
                    <div style={{ flex: 1, padding: 16, overflowY: 'auto', background: '#f5f5f5' }}>
                        {messages.length === 0 && (
                            <div style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>
                                Merhaba! Akıllı asistanımızla hemen yazışmaya başlayın.
                            </div>
                        )}
                        {messages.map((msg, index) => {
                            const isUser = msg.sender === 'USER';
                            return (
                                <div key={msg.id || index} style={{
                                    display: 'flex',
                                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                                    marginBottom: 12
                                }}>
                                    <div style={{
                                        maxWidth: '80%',
                                        padding: '10px 14px',
                                        borderRadius: '16px',
                                        borderBottomRightRadius: isUser ? 4 : 16,
                                        borderBottomLeftRadius: !isUser ? 4 : 16,
                                        background: isUser ? '#1890ff' : '#fff',
                                        color: isUser ? '#fff' : '#333',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                                        wordBreak: 'break-word',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {msg.content}
                                        <div style={{ fontSize: 10, textAlign: 'right', marginTop: 4, opacity: 0.7 }}>
                                            {msg.createdAt ? dayjs(msg.createdAt).format('HH:mm') : ''}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Actions Area */}
                    <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee' }}>
                        {chatStatus === 'BOT' && (
                            <div style={{ marginBottom: 8, textAlign: 'center' }}>
                                <Button size="small" type="link" onClick={requestHuman}>
                                    <CustomerServiceOutlined /> Müşteri Temsilcisine Bağlan
                                </Button>
                            </div>
                        )}
                        <Space.Compact style={{ width: '100%' }}>
                            <Input 
                                placeholder="Mesajınızı yazın..." 
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onPressEnter={handleSend}
                                disabled={chatStatus === 'CLOSED'}
                            />
                            <Button type="primary" onClick={handleSend} icon={<SendOutlined />} disabled={chatStatus === 'CLOSED'} />
                        </Space.Compact>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveChatWidget;
