import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { AppState, AppStateStatus, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

const SOCKET_URL = 'https://backend-production-69e7.up.railway.app';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    unreadCount: number;
    setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
    unreadCount: 0,
    setUnreadCount: () => { }
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, user, refreshTokenNow } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const socketRef = useRef<Socket | null>(null);
    const appState = useRef<AppStateStatus>(AppState.currentState);
    const soundRef = useRef<Audio.Sound | null>(null);
    const userIdRef = useRef(user?.id);
    const lastPongRef = useRef<number>(Date.now());
    const reconnectAttemptsRef = useRef(0);
    const tokenRef = useRef<string | null>(token);
    // Track whether we've ever created a socket for this session
    const socketCreatedRef = useRef(false);

    useEffect(() => {
        userIdRef.current = user?.id;
    }, [user?.id]);

    // Keep tokenRef always in sync — but DON'T trigger socket recreation
    useEffect(() => {
        tokenRef.current = token;
    }, [token]);

    // Initial sound loader — use bundled fallback-safe approach
    useEffect(() => {
        async function loadSound() {
            try {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
                    { shouldPlay: false }
                );
                soundRef.current = sound;
            } catch (err) {
                console.warn('Could not load sound', err);
            }
        }
        loadSound();
        return () => {
            if (soundRef.current) soundRef.current.unloadAsync();
        };
    }, []);

    const playSound = async () => {
        try {
            if (soundRef.current) {
                await soundRef.current.replayAsync();
            }
        } catch (err) {
            console.warn("Failed to play notification sound", err);
        }
    };

    // Re-authenticate existing socket with fresh token (NO disconnect)
    const reAuthSocket = useCallback((tkn: string) => {
        if (socketRef.current) {
            console.log('[Socket] Re-authenticating with fresh token (no disconnect)');
            if (!socketRef.current.connected) {
                socketRef.current.connect();
            }
            socketRef.current.emit('authenticate', tkn);
        }
    }, []);

    const createSocket = useCallback((tkn: string) => {
        // Clean up existing socket first
        if (socketRef.current) {
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        const instance = io(SOCKET_URL, {
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000,
            transports: ['websocket'],
        });

        instance.on('connect', () => {
            console.log('[Socket] Connected:', instance.id);
            // Always use the latest token for authentication
            instance.emit('authenticate', tokenRef.current || tkn);
        });

        instance.on('authenticated', (data: any) => {
            console.log('[Socket] Authenticated');
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            lastPongRef.current = Date.now();
        });

        // Server sent us a fresh token (our token was expired but decoded)
        instance.on('token_refreshed', async (data: { token: string }) => {
            console.log('[Socket] Received fresh token from server');
            try {
                const SecureStore = require('expo-secure-store');
                const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                await SecureStore.setItemAsync('token', data.token);
                await AsyncStorage.setItem('token', data.token);
                tokenRef.current = data.token;
            } catch (e) {
                console.warn('[Socket] Failed to persist refreshed token:', e);
            }
        });

        instance.on('disconnect', (reason: string) => {
            console.log('[Socket] Disconnected:', reason);
            setIsConnected(false);

            // Auto-reconnect for all recoverable disconnect reasons
            if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'transport error') {
                console.log(`[Socket] Auto-reconnecting after ${reason}`);
                setTimeout(() => {
                    if (socketRef.current && !socketRef.current.connected) {
                        socketRef.current.connect();
                    }
                }, 1000);
            }
            // 'client namespace disconnect' = our code called disconnect() — do NOT reconnect
            // 'ping timeout' = Socket.IO will handle reconnect automatically
        });

        instance.on('connect_error', async (err: any) => {
            console.warn('[Socket] Connect error:', err.message);
            setIsConnected(false);
        });

        instance.on('reconnect', async () => {
            console.log('[Socket] Reconnected - re-authenticating');
            reconnectAttemptsRef.current = 0;
            lastPongRef.current = Date.now();
            // Use latest tokenRef — no need to call refreshTokenNow here (avoids race)
            instance.emit('authenticate', tokenRef.current || tkn);
        });

        // Pong response from server keeps connection health tracked
        instance.on('pong_keepalive', () => {
            lastPongRef.current = Date.now();
        });

        // Global message listener
        instance.on('new_message', async (message: any) => {
            console.log('[Socket] Incoming new_message for this driver:', message);

            // Ignore messages sent by ourselves
            if (message.senderId === userIdRef.current) return;

            setUnreadCount(prev => prev + 1);

            // Play sound
            await playSound();

            // Only show Alert popup if app is in foreground — prevents crash in background
            if (appState.current === 'active') {
                Alert.alert(
                    '💬 Yeni Mesaj',
                    message.content || 'Operasyon merkezinden yeni bir mesajınız var.'
                );
            }

            // Schedule Local Notification (works in both foreground & background)
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '💬 Yeni Mesaj',
                    body: message.content || 'Operasyon merkezinden yeni bir mesajınız var.',
                    sound: true,
                    data: { type: 'chatMessage', senderId: message.senderId },
                },
                trigger: null, // trigger immediately
            });
        });

        // Global operation assigned listener
        instance.on('operation_assigned', async (data: any) => {
            console.log('[Socket] Incoming operation_assigned for this driver:', data);

            // Play sound
            await playSound();

            const body = `${data.pickup || 'Yeni transfer'} • ${data.start ? new Date(data.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}`;

            // Only show Alert if foreground
            if (appState.current === 'active') {
                Alert.alert('🚗 Yeni İş Atandı!', body);
            }

            // Schedule Local Notification
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '🚗 Yeni İş Atandı!',
                    body,
                    sound: true,
                    data: { type: 'operationAssigned', bookingId: data.bookingId },
                },
                trigger: null,
            });
        });

        instance.connect();
        socketRef.current = instance;
        socketCreatedRef.current = true;
        setSocket(instance);
        return instance;
    }, []);

    // Socket lifecycle: ONLY create on first token, destroy on logout
    useEffect(() => {
        if (!token) {
            // Logout — destroy socket
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setIsConnected(false);
                socketCreatedRef.current = false;
            }
            return;
        }

        // First login or first token — create socket
        if (!socketCreatedRef.current) {
            createSocket(token);
        }
        // Token changed (refresh) — just re-authenticate, DON'T recreate
        // This is the KEY FIX: no more disconnect on token refresh
    }, [token, createSocket]);

    // Reconnect when app comes to foreground + aggressive keep-alive
    useEffect(() => {
        if (!token) return;

        const handleAppStateChange = async (nextState: AppStateStatus) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextState === 'active'
            ) {
                console.log('[Socket] App foregrounded — checking connection');
                const timeSincePong = Date.now() - lastPongRef.current;
                const activeToken = tokenRef.current || token;

                if (!socketRef.current) {
                    // Socket was garbage collected — recreate
                    console.log('[Socket] No socket instance — creating');
                    createSocket(activeToken);
                } else if (!socketRef.current.connected) {
                    // Socket exists but disconnected — just reconnect
                    console.log('[Socket] Socket disconnected — reconnecting');
                    socketRef.current.connect();
                } else if (timeSincePong > 90000) {
                    // Connected but no pong in 90s — zombie, recreate
                    console.log('[Socket] Zombie connection — full recreate');
                    createSocket(activeToken);
                } else {
                    // Healthy connection — just re-authenticate to be safe
                    console.log('[Socket] Connection alive — re-authenticating');
                    socketRef.current.emit('authenticate', activeToken);
                }
                reconnectAttemptsRef.current = 0;
            }
            appState.current = nextState;
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Aggressive keep-alive: 25s interval
        const keepAliveInterval = setInterval(async () => {
            if (!tokenRef.current) return;

            if (!socketRef.current || !socketRef.current.connected) {
                reconnectAttemptsRef.current++;
                console.log(`[Socket] Keep-alive: disconnected (attempt ${reconnectAttemptsRef.current})`);

                if (reconnectAttemptsRef.current >= 5) {
                    // After 5 failed attempts, full recreate
                    console.log('[Socket] Too many failed reconnects — full recreate');
                    createSocket(tokenRef.current || token);
                    reconnectAttemptsRef.current = 0;
                } else if (socketRef.current) {
                    // Try simple reconnect
                    socketRef.current.connect();
                } else {
                    // No socket at all
                    createSocket(tokenRef.current || token);
                    reconnectAttemptsRef.current = 0;
                }
            } else {
                // Send a lightweight ping to keep the connection alive
                socketRef.current.emit('ping_keepalive', { ts: Date.now() });

                // Check if server is actually responding
                const timeSincePong = Date.now() - lastPongRef.current;
                if (timeSincePong > 120000) {
                    // Server hasn't responded in 2min — connection is zombie
                    console.log('[Socket] Zombie connection detected (no pong) — recreating');
                    createSocket(tokenRef.current || token);
                    reconnectAttemptsRef.current = 0;
                }
            }
        }, 25000);

        return () => {
            subscription.remove();
            clearInterval(keepAliveInterval);
        };
    }, [token, createSocket]);

    return (
        <SocketContext.Provider value={{ socket, isConnected, unreadCount, setUnreadCount }}>
            {children}
        </SocketContext.Provider>
    );
};
