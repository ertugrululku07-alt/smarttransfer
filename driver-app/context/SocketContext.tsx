import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { AppState, AppStateStatus, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

const SOCKET_URL = 'https://smarttransfer-backend-production.up.railway.app';

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
    const { token, user } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const socketRef = useRef<Socket | null>(null);
    const appState = useRef<AppStateStatus>(AppState.currentState);
    const soundRef = useRef<Audio.Sound | null>(null);
    const userIdRef = useRef(user?.id);

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
        });

        instance.on('disconnect', (reason: string) => {
            console.log('[Socket] Disconnected:', reason);
            setIsConnected(false);
            // If server dropped us, try to reconnect immediately
            if (reason === 'io server disconnect') {
                setTimeout(() => instance.connect(), 1000);
            }
        });

        instance.on('connect_error', (err: any) => {
            console.warn('[Socket] Connect error:', err.message);
            setIsConnected(false);
        });

        instance.on('reconnect', () => {
            console.log('[Socket] Reconnected - re-authenticating');
            instance.emit('authenticate', tkn);
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

    // Reconnect when app comes to foreground
    useEffect(() => {
        const handleAppStateChange = (nextState: AppStateStatus) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextState === 'active' &&
                token &&
                socketRef.current &&
                !socketRef.current.connected
            ) {
                console.log('[Socket] App foregrounded - reconnecting');
                socketRef.current.connect();
            }
            appState.current = nextState;
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => subscription.remove();
    }, [token]);

    return (
        <SocketContext.Provider value={{ socket, isConnected, unreadCount, setUnreadCount }}>
            {children}
        </SocketContext.Provider>
    );
};
