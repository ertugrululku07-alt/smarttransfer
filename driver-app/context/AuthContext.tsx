import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

interface AuthContextType {
    user: any | null;
    token: string | null;
    isLoading: boolean;
    signIn: (token: string, user: any) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isLoading: true,
    signIn: async () => { },
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check for stored session
        const loadSession = async () => {
            try {
                const storedToken = await SecureStore.getItemAsync('token');
                const storedUser = await SecureStore.getItemAsync('user');

                if (storedToken && storedUser) {
                    setToken(storedToken);
                    setUser(JSON.parse(storedUser));
                }
            } catch (e) {
                console.error('Failed to load session', e);
            } finally {
                setIsLoading(false);
            }
        };

        loadSession();
    }, []);

    const signIn = async (newToken: string, newUser: any) => {
        setToken(newToken);
        setUser(newUser);
        await SecureStore.setItemAsync('token', newToken);
        await SecureStore.setItemAsync('user', JSON.stringify(newUser));
    };

    const signOut = async () => {
        // 1. Clear persisted data first
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('user');
        // 2. Clear in-memory state (triggers AuthGuard redirect)
        setToken(null);
        setUser(null);
        // 3. Force navigate to login as fallback (AuthGuard also handles this)
        try {
            router.replace('/');
        } catch (e) {
            console.warn('signOut navigation fallback:', e);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
