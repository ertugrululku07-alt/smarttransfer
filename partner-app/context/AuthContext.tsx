import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { AppState, AppStateStatus } from 'react-native';
import { API_URL, apiHeaders } from '../config';

const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000;

interface AuthContextType {
    user: any | null;
    token: string | null;
    isLoading: boolean;
    signIn: (token: string, user: any, refreshToken?: string) => Promise<void>;
    signOut: () => Promise<void>;
    refreshTokenNow: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isLoading: true,
    signIn: async () => {},
    signOut: async () => {},
    refreshTokenNow: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const tokenRef = useRef<string | null>(null);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    useEffect(() => { tokenRef.current = token; }, [token]);

    const signOut = useCallback(async () => {
        await SecureStore.deleteItemAsync('partner_token');
        await SecureStore.deleteItemAsync('partner_user');
        await SecureStore.deleteItemAsync('partner_refreshToken');
        setToken(null);
        tokenRef.current = null;
        setUser(null);
        try { router.replace('/'); } catch {}
    }, []);

    const refreshTokenNow = useCallback(async (): Promise<string | null> => {
        try {
            const refreshTkn = await SecureStore.getItemAsync('partner_refreshToken');
            if (!refreshTkn) return null;

            const res = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refreshTkn }),
            });

            if (res.status === 401) {
                await signOut();
                return null;
            }

            if (!res.ok) return null;

            const json = await res.json();
            const newToken = json?.data?.token;
            const newRefreshToken = json?.data?.refreshToken;

            if (newToken) {
                await SecureStore.setItemAsync('partner_token', newToken);
                if (newRefreshToken) {
                    await SecureStore.setItemAsync('partner_refreshToken', newRefreshToken);
                }
                const changed = newToken !== tokenRef.current;
                tokenRef.current = newToken;
                if (changed) setToken(newToken);
                return newToken;
            }
            return null;
        } catch (e) {
            console.warn('[Auth] Token refresh error:', e);
            return null;
        }
    }, [signOut]);

    useEffect(() => {
        if (!token) {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
            return;
        }
        refreshTimerRef.current = setInterval(() => { refreshTokenNow(); }, TOKEN_REFRESH_INTERVAL);
        return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }, [token, refreshTokenNow]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (appStateRef.current.match(/inactive|background/) && nextState === 'active' && tokenRef.current) {
                refreshTokenNow();
            }
            appStateRef.current = nextState;
        });
        return () => sub.remove();
    }, [refreshTokenNow]);

    useEffect(() => {
        const loadSession = async () => {
            try {
                const storedToken = await SecureStore.getItemAsync('partner_token');
                const storedUser = await SecureStore.getItemAsync('partner_user');
                if (storedToken && storedUser) {
                    setToken(storedToken);
                    tokenRef.current = storedToken;
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

    const signIn = async (newToken: string, newUser: any, newRefreshToken?: string) => {
        setToken(newToken);
        tokenRef.current = newToken;
        setUser(newUser);
        await SecureStore.setItemAsync('partner_token', newToken);
        await SecureStore.setItemAsync('partner_user', JSON.stringify(newUser));
        if (newRefreshToken) {
            await SecureStore.setItemAsync('partner_refreshToken', newRefreshToken);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, refreshTokenNow }}>
            {children}
        </AuthContext.Provider>
    );
};

export { apiHeaders };
