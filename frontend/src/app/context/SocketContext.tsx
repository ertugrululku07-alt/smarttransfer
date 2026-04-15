'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext'; // Import from same directory

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, user, logout } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!token || !user) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        // Initialize socket - connect to the same server as the API
        const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
        const rawSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || rawApiUrl;
        
        // Defensive check: Railway URLs use dashes, never underscores.
        const sanitizeUrl = (url: string) => {
            if (url.includes('up.railway.app') && url.includes('_')) {
                const parts = url.split('/');
                if (parts.length >= 3) {
                    parts[2] = parts[2].replace(/_/g, '-');
                    return parts.join('/');
                }
            }
            return url;
        };

        const SOCKET_URL = sanitizeUrl(rawSocketUrl.replace(/[\r\n]+/g, '').trim());
        
        console.log('Socket attempting connection to:', SOCKET_URL);

        const socketInstance = io(SOCKET_URL, {
            autoConnect: false,
            reconnection: true,
            transports: ['websocket', 'polling']
        });

        socketInstance.on('connect', () => {
            console.log('Socket connected:', socketInstance.id);
            // Authenticate immediately
            socketInstance.emit('authenticate', token);
        });

        socketInstance.on('authenticated', (data) => {
            console.log('Socket authenticated:', data);
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
        });

        socketInstance.on('error', (err) => {
            console.error('Socket error:', err);
            // Handle JWT expiration
            if (err?.message?.includes('jwt expired') || err?.message?.includes('Authentication failed')) {
                console.warn('Socket token expired, logging out...');
                logout();
                // Optionally redirect or show message
                // window.location.href = '/login'; 
            }
        });

        socketInstance.on('connect_error', (err) => {
            console.error('Socket Connection Error:', err.message);
            console.error('Socket Connection Details:', err);
        });

        socketInstance.connect();
        setSocket(socketInstance);

        return () => {
            socketInstance.removeAllListeners();
            socketInstance.disconnect();
        };
    }, [token, user?.id]); // Re-connect if user changes

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
