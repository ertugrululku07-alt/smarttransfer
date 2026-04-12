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
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const soundRef = useRef<Audio.Sound | null>(null);
    const userIdRef = useRef(user?.id);
    const tokenRef = useRef<string | null>(token);
    // Mutex to prevent concurrent createSocket calls
    const creatingRef = useRef(false);

    useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
    useEffect(() => { tokenRef.current = token; }, [token]);

    // Sound loader
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
        return () => { if (soundRef.current) soundRef.current.unloadAsync(); };
    }, []);

    const playSound = async () => {
        try {
            if (soundRef.current) await soundRef.current.replayAsync();
        } catch (err) {
            console.warn("Failed to play notification sound", err);
        }
    };

    // Create socket — guarded by mutex, ONLY called on login and foreground recovery
    const createSocket = useCallback((tkn: string) => {
        if (creatingRef.current) {
            console.log('[Socket] createSocket skipped — already in progress');
            return;
        }
        creatingRef.current = true;

        // Clean up old socket WITHOUT calling disconnect (avoid "client namespace disconnect" log)
        if (socketRef.current) {
            console.log('[Socket] Destroying old socket before creating new one');
            socketRef.current.removeAllListeners();
            socketRef.current.io.opts.reconnection = false; // Prevent auto-reconnect during cleanup
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        console.log('[Socket] Creating new socket (optional — HTTP sync is primary)');
        const instance = io(SOCKET_URL, {
            autoConnect: false,
            // Limited reconnection — don't burn battery chasing socket
            reconnection: true,
            reconnectionAttempts: 3,
            reconnectionDelay: 5000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
            // Polling first, then upgrade — more reliable on mobile
            transports: ['polling', 'websocket'],
            upgrade: true,
            forceNew: true,
        });

        instance.on('connect', () => {
            console.log('[Socket] Connected:', instance.id);
            instance.emit('authenticate', tokenRef.current || tkn);
        });

        instance.on('authenticated', () => {
            console.log('[Socket] Authenticated');
            setIsConnected(true);
        });

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

            // In BACKGROUND: don't try to reconnect — it will just drain battery
            // Socket.IO built-in reconnection will handle foreground reconnects
            if (appStateRef.current !== 'active') {
                console.log('[Socket] App is in background — pausing reconnection');
                instance.io.opts.reconnection = false;
            }
            // In FOREGROUND: Socket.IO auto-reconnection handles it (reconnection = true)
        });

        instance.on('connect_error', (err: any) => {
            console.warn('[Socket] Connect error:', err.message);
            setIsConnected(false);
            // In background, stop trying
            if (appStateRef.current !== 'active') {
                instance.io.opts.reconnection = false;
            }
        });

        instance.on('reconnect', () => {
            console.log('[Socket] Reconnected — re-authenticating');
            instance.emit('authenticate', tokenRef.current || tkn);
        });

        instance.on('pong_keepalive', () => {
            // Connection is alive — no action needed
        });

        // Global message listener
        instance.on('new_message', async (message: any) => {
            if (message.senderId === userIdRef.current) return;
            setUnreadCount(prev => prev + 1);
            await playSound();
            if (appStateRef.current === 'active') {
                Alert.alert('💬 Yeni Mesaj', message.content || 'Operasyon merkezinden yeni bir mesajınız var.');
            }
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '💬 Yeni Mesaj',
                    body: message.content || 'Operasyon merkezinden yeni bir mesajınız var.',
                    sound: true,
                    data: { type: 'chatMessage', senderId: message.senderId },
                },
                trigger: null,
            });
        });

        // Global operation assigned listener
        instance.on('operation_assigned', async (data: any) => {
            await playSound();
            const body = `${data.pickup || 'Yeni transfer'} • ${data.start ? new Date(data.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}`;
            if (appStateRef.current === 'active') {
                Alert.alert('🚗 Yeni İş Atandı!', body);
            }
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
        creatingRef.current = false;
        return instance;
    }, []);

    // Socket lifecycle: create on login, destroy on logout
    useEffect(() => {
        if (!token) {
            // Logout — destroy socket
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }
        // Login — create socket (only if none exists)
        if (!socketRef.current) {
            createSocket(token);
        }
    }, [token, createSocket]);

    // Foreground/background handler + keep-alive (foreground only)
    useEffect(() => {
        if (!token) return;

        const handleAppStateChange = (nextState: AppStateStatus) => {
            const prev = appStateRef.current;
            appStateRef.current = nextState;

            // FOREGROUND transition
            if (prev.match(/inactive|background/) && nextState === 'active') {
                console.log('[Socket] App foregrounded');
                const activeToken = tokenRef.current || token;

                if (!socketRef.current) {
                    // No socket at all — create fresh
                    console.log('[Socket] No socket — creating');
                    createSocket(activeToken);
                } else {
                    // Re-enable reconnection (we disabled it in background)
                    socketRef.current.io.opts.reconnection = true;

                    if (!socketRef.current.connected) {
                        console.log('[Socket] Reconnecting on foreground');
                        socketRef.current.connect();
                    } else {
                        // Already connected — just re-authenticate to be safe
                        console.log('[Socket] Already connected — re-authenticating');
                        socketRef.current.emit('authenticate', activeToken);
                    }
                }
            }
            // BACKGROUND transition — no action needed, socket will die naturally
            // The disconnect handler above will pause reconnection
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Keep-alive: 30s, ONLY pings when foreground + connected
        const keepAliveInterval = setInterval(() => {
            if (appStateRef.current !== 'active') return; // Skip in background
            if (!socketRef.current?.connected) return;    // Skip if not connected
            socketRef.current.emit('ping_keepalive', { ts: Date.now() });
        }, 30000);

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
