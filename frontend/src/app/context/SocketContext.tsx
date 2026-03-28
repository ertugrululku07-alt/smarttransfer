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

        // Initialize socket - connect to Railway (same server as driver app)
        const rawSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://backend-production-69e7.up.railway.app';
        const SOCKET_URL = rawSocketUrl.replace(/[\r\n]+/g, '').trim();
        const socketInstance = io(SOCKET_URL, {
            autoConnect: false, // Wait for auth
            reconnection: true,
            transports: ['websocket', 'polling'] // Force websocket first
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
