import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

    useEffect(() => {
        userIdRef.current = user?.id;
    }, [user?.id]);

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

    const createSocket = (tkn: string) => {
        // Clean up existing socket first
        if (socketRef.current) {
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
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
            instance.emit('authenticate', tkn);
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
            // If server dropped us, try to reconnect immediately
            if (reason === 'io server disconnect') {
                setTimeout(() => instance.connect(), 1000);
            }
        });

        instance.on('connect_error', async (err: any) => {
            console.warn('[Socket] Connect error:', err.message);
            setIsConnected(false);
        });

        instance.on('reconnect', async () => {
            console.log('[Socket] Reconnected - re-authenticating with fresh token');
            reconnectAttemptsRef.current = 0;
            lastPongRef.current = Date.now();
            // Try to get fresh token before re-authenticating
            const freshToken = await refreshTokenNow();
            const authToken = freshToken || tokenRef.current || tkn;
            instance.emit('authenticate', authToken);
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
        setSocket(instance);
        return instance;
    };

    useEffect(() => {
        if (!token) {
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        createSocket(token);

        return () => {
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setIsConnected(false);
            }
        };
    }, [token]);

    // Keep tokenRef in sync with latest token
    useEffect(() => {
        tokenRef.current = token;
    }, [token]);

    // Reconnect when app comes to foreground + aggressive keep-alive
    useEffect(() => {
        const handleAppStateChange = async (nextState: AppStateStatus) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextState === 'active' &&
                token
            ) {
                console.log('[Socket] App foregrounded - checking connection');
                const timeSincePong = Date.now() - lastPongRef.current;

                // Get a fresh token first
                const freshToken = await refreshTokenNow();
                const activeToken = freshToken || tokenRef.current || token;

                // If socket is dead or stale (no pong >90s), recreate entirely
                if (!socketRef.current || !socketRef.current.connected || timeSincePong > 90000) {
                    console.log('[Socket] Connection stale/dead — full recreate');
                    createSocket(activeToken);
                } else {
                    // Force re-authenticate in case server dropped our session
                    socketRef.current.emit('authenticate', activeToken);
                }
                reconnectAttemptsRef.current = 0;
            }
            appState.current = nextState;
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Aggressive keep-alive: 25s interval
        const keepAliveInterval = setInterval(async () => {
            if (!token) return;

            if (!socketRef.current || !socketRef.current.connected) {
                reconnectAttemptsRef.current++;
                console.log(`[Socket] Keep-alive: disconnected (attempt ${reconnectAttemptsRef.current})`);

                // After 3 failed reconnects, get fresh token and recreate
                if (reconnectAttemptsRef.current >= 3) {
                    console.log('[Socket] Too many failed reconnects — refreshing token + full recreate');
                    const freshToken = await refreshTokenNow();
                    const activeToken = freshToken || tokenRef.current || token;
                    createSocket(activeToken);
                    reconnectAttemptsRef.current = 0;
                } else if (socketRef.current) {
                    socketRef.current.connect();
                } else {
                    createSocket(tokenRef.current || token);
                }
            } else {
                // Send a lightweight ping to keep the connection alive
                socketRef.current.emit('ping_keepalive', { ts: Date.now() });

                // Check if server is actually responding
                const timeSincePong = Date.now() - lastPongRef.current;
                if (timeSincePong > 120000) {
                    // Server hasn't responded in 2min — connection is zombie
                    console.log('[Socket] Zombie connection detected (no pong) — recreating');
                    const freshToken = await refreshTokenNow();
                    createSocket(freshToken || tokenRef.current || token);
                    reconnectAttemptsRef.current = 0;
                }
            }
        }, 25000);

        return () => {
            subscription.remove();
            clearInterval(keepAliveInterval);
        };
    }, [token]);

    return (
        <SocketContext.Provider value={{ socket, isConnected, unreadCount, setUnreadCount }}>
            {children}
        </SocketContext.Provider>
    );
};
