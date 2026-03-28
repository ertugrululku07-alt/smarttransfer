'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageOutlined, CloseOutlined, SendOutlined, WifiOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { io as socketIO, Socket } from 'socket.io-client';

const RAILWAY_URL = 'https://backend-production-69e7.up.railway.app';
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || RAILWAY_URL;
const API_URL = BASE_URL.endsWith('/api') ? BASE_URL : `${BASE_URL}/api`;
const rawSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || RAILWAY_URL;
const SOCKET_URL = rawSocketUrl.replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo';

interface Driver {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    location: { lat: number; lng: number } | null;
    connectedAt: string;
    avatar?: string | null;
}

interface Message {
    id: string;
    content: string;
    senderId: string;
    receiverId: string;
    createdAt: string;
    format?: string;
}

export default function FloatingDriverChat() {
    const { user, token, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [onlineDrivers, setOnlineDrivers] = useState<Driver[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [lastActivity, setLastActivity] = useState<Record<string, number>>({});
    const activeChatRef = useRef<{ driverId: string | undefined, userId: string | undefined }>({ driverId: undefined, userId: undefined });
    const processedMessages = useRef<Set<string>>(new Set());

    useEffect(() => {
        activeChatRef.current = { driverId: selectedDriver?.id, userId: user?.id };
    }, [selectedDriver, user]);

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const getImageUrl = (url: string | undefined | null) => {
        if (!url) return '';
        const baseApi = API_URL.replace('/api', '');
        if (url.startsWith('/uploads')) {
            return `${baseApi}${url}`;
        }
        if (url.includes('localhost')) {
            return url.replace(/https?:\/\/localhost(:\d+)?/, baseApi);
        }
        return url;
    };

    // Helper: fetch with auth, auto-logout on 401
    const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
        const res = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Tenant-Slug': TENANT_SLUG,
            }
        });
        if (res.status === 401) {
            console.warn('Token expired - logging out');
            logout();
            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
            throw new Error('Unauthorized');
        }
        return res;
    };

    // Connect socket for real-time driver online/offline events
    useEffect(() => {
        if (!token) return;

        const socket = socketIO(SOCKET_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('authenticate', token);
        });

        // Socket events are bonuses — they work when driver and admin are on the same server
        socket.on('driver_online', (data: any) => {
            setOnlineDrivers(prev => {
                const exists = prev.find(d => d.id === data.driverId);
                if (exists) return prev;
                return [...prev, { id: data.driverId, fullName: data.driverName, firstName: '', lastName: '', location: null, connectedAt: new Date().toISOString(), avatar: data.avatar || null }];
            });
        });

        // *** DO NOT listen to driver_offline socket events ***
        // The DB poll (every 30s) is the source of truth for who is online.
        // A socket driver_offline event can arrive even when the driver's background task
        // is still alive and sending HTTP pings — because the socket connection itself can
        // drop without the background task stopping.

        socket.on('driver_location', (data: any) => {
            setOnlineDrivers(prev => {
                const exists = prev.find(d => d.id === data.driverId);
                if (exists) {
                    return prev.map(d =>
                        d.id === data.driverId
                            ? { ...d, location: { lat: data.lat, lng: data.lng } }
                            : d
                    );
                }
                return [...prev, {
                    id: data.driverId, fullName: data.driverName,
                    firstName: '', lastName: '',
                    location: { lat: data.lat, lng: data.lng },
                    connectedAt: new Date().toISOString(), avatar: data.avatar || null
                }];
            });
        });

        socket.on('new_message', (msg: any) => {
            if (processedMessages.current.has(msg.id)) return;
            processedMessages.current.add(msg.id);
            if (processedMessages.current.size > 200) {
                const it = processedMessages.current.values();
                processedMessages.current.delete(it.next().value as string);
            }

            const { driverId, userId } = activeChatRef.current;
            const isMe = msg.senderId === userId;
            const otherPartyId = isMe ? msg.receiverId : msg.senderId;

            setLastActivity(prev => ({
                ...prev,
                [otherPartyId]: Date.now()
            }));

            if (driverId === otherPartyId) {
                // Chat is actively open with this driver
                setMessages(prev => {
                    if (prev.find(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
                setTimeout(scrollToBottom, 100);
            } else if (!isMe) {
                // Message from someone else while chat is not active
                setUnreadCounts(prev => ({
                    ...prev,
                    [msg.senderId]: (prev[msg.senderId] || 0) + 1
                }));
                // Try to play notification tone
                playNotificationSound();
            }
        });

        // Initial load + poll every 30 seconds (DB is source of truth)
        fetchOnlineDrivers();
        const pollInterval = setInterval(fetchOnlineDrivers, 30000);

        return () => {
            clearInterval(pollInterval);
            socket.disconnect();
        };
    }, [token]);

    useEffect(() => {
        if (view === 'chat' && selectedDriver) {
            fetchMessages(selectedDriver.id);
        }
    }, [view, selectedDriver]);

    useEffect(() => {
        setTimeout(scrollToBottom, 100);
    }, [messages]);

    const fetchOnlineDrivers = async () => {
        try {
            const res = await fetchWithAuth(`${API_URL}/driver/online`);
            const json = await res.json();
            if (json.success) setOnlineDrivers(json.data);
        } catch (e) {
            if ((e as Error).message !== 'Unauthorized')
                console.error('Fetch online drivers error:', e);
        }
    };

    const fetchMessages = async (contactId: string) => {
        try {
            const res = await fetchWithAuth(`${API_URL}/messages?contactId=${contactId}`);
            const json = await res.json();
            if (json.success) setMessages(json.data);
        } catch (e) {
            console.error('Fetch messages error:', e);
        }
    };

    const sendMessage = async () => {
        if (!inputText.trim() || !selectedDriver) return;
        const content = inputText.trim();
        setInputText('');
        setSending(true);

        try {
            const res = await fetchWithAuth(`${API_URL}/messages`, {
                method: 'POST',
                body: JSON.stringify({ receiverId: selectedDriver.id, content })
            });
            const json = await res.json();
            if (json.success) {
                if (!processedMessages.current.has(json.data.id)) {
                    processedMessages.current.add(json.data.id);
                }
                setLastActivity(prev => ({
                    ...prev,
                    [selectedDriver.id]: Date.now()
                }));
                setMessages(prev => {
                    if (prev.find(m => m.id === json.data.id)) return prev;
                    return [...prev, json.data];
                });
                setTimeout(scrollToBottom, 100);
            } else {
                console.error('Send failed:', json.error);
            }
        } catch (e) {
            if ((e as Error).message !== 'Unauthorized')
                console.error('Send error:', e);
        } finally {
            setSending(false);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    };

    const playNotificationSound = () => {
        try {
            // A short, unobtrusive generic beep sound encoded in base64
            // Usually we'd place an mp3 in /public/sounds but this guarantees it works immediately.
            const audio = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAQAAAANIAAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
            // Simplified standard sound instead to avoid base64 complexity if browser blocks it.
            // Creating an oscillator based context ping could also work. Here's a tiny generic success ping
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            console.error('Audio play error:', e);
        }
    };

    const openChat = (driver: Driver) => {
        // Reset unread count for this driver when opened
        setUnreadCounts(prev => {
            const newCounts = { ...prev };
            delete newCounts[driver.id];
            return newCounts;
        });

        setSelectedDriver(driver);
        setMessages([]);
        setView('chat');
    };

    const sortedDrivers = [...onlineDrivers].sort((a, b) => {
        const unreadA = unreadCounts[a.id] || 0;
        const unreadB = unreadCounts[b.id] || 0;
        if (unreadA > 0 && unreadB === 0) return -1;
        if (unreadB > 0 && unreadA === 0) return 1;

        const timeA = lastActivity[a.id] || 0;
        const timeB = lastActivity[b.id] || 0;
        if (timeA !== timeB) return timeB - timeA;

        return a.fullName.localeCompare(b.fullName);
    });

    return (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999 }}>
            {/* Floating Button */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #4361ee, #3a0ca3)',
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(67,97,238,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', color: '#fff', fontSize: 24,
                        transition: 'transform 0.2s'
                    }}
                >
                    <MessageOutlined />
                    {Object.keys(unreadCounts).length > 0 ? (
                        <span style={{
                            position: 'absolute', top: -4, right: -4,
                            background: '#ef4444', color: '#fff', borderRadius: '50%',
                            width: 22, height: 22, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold',
                            boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)'
                        }}>
                            {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
                        </span>
                    ) : onlineDrivers.length > 0 && (
                        <span style={{
                            position: 'absolute', top: -4, right: -4,
                            background: '#10b981', color: '#fff', borderRadius: '50%',
                            width: 20, height: 20, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold'
                        }}>
                            {onlineDrivers.length}
                        </span>
                    )}
                </button>
            )}

            {/* Chat Panel */}
            {open && (
                <div style={{
                    width: 360,
                    height: 520,
                    background: '#fff',
                    borderRadius: 20,
                    boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: '1px solid rgba(67,97,238,0.1)'
                }}>
                    {/* Panel Header */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1e3a8a, #4361ee)',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {view === 'chat' && (
                                <button
                                    onClick={() => { setView('list'); setSelectedDriver(null); }}
                                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, padding: '0 4px 0 0' }}
                                >
                                    ‹
                                </button>
                            )}
                            <WifiOutlined style={{ color: '#10b981', fontSize: 16 }} />
                            <div>
                                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                                    {view === 'list' ? 'Sürücü İletişim Merkezi' : selectedDriver?.fullName}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                                    {view === 'list'
                                        ? `${onlineDrivers.length} sürücü online`
                                        : 'Mesaj gönder'
                                    }
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => { setOpen(false); setView('list'); setSelectedDriver(null); }}
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 8, padding: '4px 8px' }}
                        >
                            <CloseOutlined />
                        </button>
                    </div>

                    {/* Driver List */}
                    {view === 'list' && (
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {sortedDrivers.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: 60 }}>
                                    <UserOutlined style={{ fontSize: 40, marginBottom: 12 }} />
                                    <p style={{ margin: 0 }}>Şu an online sürücü yok</p>
                                </div>
                            ) : (
                                sortedDrivers.map(driver => (
                                    <div
                                        key={driver.id}
                                        onClick={() => openChat(driver)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '12px 14px', borderRadius: 14,
                                            cursor: 'pointer', marginBottom: 8,
                                            backgroundColor: '#f8faff',
                                            border: '1px solid #e8efff',
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#eff3ff')}
                                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f8faff')}
                                    >
                                        {driver.avatar ? (
                                            <img
                                                src={getImageUrl(driver.avatar)}
                                                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                alt={driver.fullName}
                                            />
                                        ) : (
                                            <div style={{
                                                width: 44, height: 44, borderRadius: 22,
                                                background: 'linear-gradient(135deg, #4361ee, #3a0ca3)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 'bold', fontSize: 16, flexShrink: 0
                                            }}>
                                                {driver.fullName?.charAt(0) ?? '?'}
                                            </div>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{driver.fullName}</div>
                                            <div style={{ color: '#9ca3af', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: 3, background: '#10b981', display: 'inline-block' }} />
                                                {driver.location ? `${driver.location.lat?.toFixed(4)}, ${driver.location.lng?.toFixed(4)}` : 'Konum bekleniyor...'}
                                            </div>
                                        </div>

                                        {/* Unread Badge / Chat Icon */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            {unreadCounts[driver.id] ? (
                                                <div style={{
                                                    background: '#ef4444', color: '#fff',
                                                    width: 24, height: 24, borderRadius: 12,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 12, fontWeight: 'bold', border: '2px solid #fff'
                                                }}>
                                                    {unreadCounts[driver.id]}
                                                </div>
                                            ) : null}
                                            <MessageOutlined style={{ color: '#4361ee', fontSize: 18 }} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Chat View */}
                    {view === 'chat' && (
                        <>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', background: '#f8faff' }}>
                                {messages.map(msg => {
                                    const isMe = msg.senderId === user?.id;
                                    return (
                                        <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                                            <div style={{
                                                maxWidth: '78%', padding: '10px 14px', borderRadius: 18,
                                                background: isMe ? 'linear-gradient(135deg, #4361ee, #3a0ca3)' : '#fff',
                                                color: isMe ? '#fff' : '#111827',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                                borderBottomRightRadius: isMe ? 4 : 18,
                                                borderBottomLeftRadius: isMe ? 18 : 4,
                                            }}>
                                                {msg.format === 'IMAGE' ? (
                                                    <img src={getImageUrl(msg.content)} alt="Fotoğraf" style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover', cursor: 'pointer' }} onClick={() => window.open(getImageUrl(msg.content), '_blank')} />
                                                ) : (
                                                    <div style={{ fontSize: 14 }}>{msg.content}</div>
                                                )}
                                                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, textAlign: 'right' }}>
                                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, background: '#fff', flexShrink: 0 }}>
                                <input
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                    placeholder="Mesaj yazın..."
                                    style={{
                                        flex: 1, borderRadius: 20, border: '1px solid #e5e7eb',
                                        padding: '10px 16px', fontSize: 14, outline: 'none',
                                        backgroundColor: '#f9fafb'
                                    }}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!inputText.trim() || sending}
                                    style={{
                                        width: 40, height: 40, borderRadius: 20,
                                        background: inputText.trim() ? 'linear-gradient(135deg, #4361ee, #3a0ca3)' : '#e5e7eb',
                                        border: 'none', cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', flexShrink: 0
                                    }}
                                >
                                    <SendOutlined />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
