import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { router } from 'expo-router';
import { Platform, BackHandler, AppState, AppStateStatus, NativeModules } from 'react-native';
import { API_URL, apiHeaders } from '../config';

const { NativeLocation } = NativeModules;

const LOCATION_TASK_NAME = 'background-location-task';
const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; // Refresh token every 10 minutes proactively

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
    signIn: async () => { },
    signOut: async () => { },
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

    // Keep tokenRef in sync
    useEffect(() => { tokenRef.current = token; }, [token]);

    const signOut = useCallback(async () => {
        // 1. Clear push token on backend
        try {
            if (tokenRef.current) {
                await fetch(`${API_URL}/driver/push-token`, {
                    method: 'DELETE',
                    headers: apiHeaders(tokenRef.current),
                });
            }
        } catch (e) {
            console.warn('Push token cleanup error (non-fatal):', e);
        }

        // 2. Stop native GPS service
        try { NativeLocation?.stopTracking(); } catch (e) {}

        // 3. Stop background location task
        try {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
            if (isRegistered) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            }
        } catch (e) {
            console.warn('Stop location task error:', e);
        }

        // 3. Stop background fetch task
        try {
            const BG_FETCH_TASK = 'background-sync-task';
            const isBgRegistered = await TaskManager.isTaskRegisteredAsync(BG_FETCH_TASK);
            if (isBgRegistered) {
                await TaskManager.unregisterTaskAsync(BG_FETCH_TASK);
            }
        } catch (e) {
            console.warn('Stop BG fetch task error:', e);
        }

        // 4. Clear ALL persisted data
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('user');
        await SecureStore.deleteItemAsync('refreshToken');
        await SecureStore.deleteItemAsync('lastSyncTime');

        // 5. Clear in-memory state
        setToken(null);
        tokenRef.current = null;
        setUser(null);

        // 6. Navigate to login
        try {
            router.replace('/');
        } catch (e) {
            console.warn('signOut navigation error:', e);
        }
        if (Platform.OS === 'android') {
            setTimeout(() => {
                BackHandler.exitApp();
            }, 500);
        }
    }, []);

    // Core refresh function — called proactively before expiry
    const refreshTokenNow = useCallback(async (): Promise<string | null> => {
        try {
            const refreshTkn = await SecureStore.getItemAsync('refreshToken');
            if (!refreshTkn) {
                console.log('[Auth] No refresh token available');
                return null;
            }

            const res = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: apiHeaders(),
                body: JSON.stringify({ refreshToken: refreshTkn })
            });

            if (!res.ok) {
                console.log('[Auth] Refresh failed:', res.status);
                if (res.status === 401) {
                    await signOut();
                }
                return null;
            }

            const json = await res.json();
            const newToken = json?.data?.token;
            if (newToken) {
                await SecureStore.setItemAsync('token', newToken);
                const changed = newToken !== tokenRef.current;
                tokenRef.current = newToken;
                if (changed) {
                    setToken(newToken);
                }
                console.log('[Auth] Token refreshed successfully (changed:', changed, ')');
                return newToken;
            }
            return null;
        } catch (e) {
            console.warn('[Auth] Token refresh error:', e);
            return null;
        }
    }, [signOut]);

    // Proactive refresh interval — keeps token alive even in background
    useEffect(() => {
        if (!token) {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
            return;
        }

        // Refresh immediately on mount, then every 10 minutes
        refreshTimerRef.current = setInterval(() => {
            console.log('[Auth] Proactive token refresh tick');
            refreshTokenNow();
        }, TOKEN_REFRESH_INTERVAL);

        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [token, refreshTokenNow]);

    // When app comes to foreground, refresh token immediately
    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (appStateRef.current.match(/inactive|background/) && nextState === 'active' && tokenRef.current) {
                console.log('[Auth] App foregrounded — refreshing token');
                refreshTokenNow();
            }
            appStateRef.current = nextState;
        });
        return () => sub.remove();
    }, [refreshTokenNow]);

    useEffect(() => {
        const loadSession = async () => {
            try {
                const storedToken = await SecureStore.getItemAsync('token');
                const storedUser = await SecureStore.getItemAsync('user');

                if (storedToken && storedUser) {
                    setToken(storedToken);
                    tokenRef.current = storedToken;
                    setUser(JSON.parse(storedUser));
                    // Start native GPS service with saved token (survives reboot)
                    try { NativeLocation?.startTracking(storedToken); } catch (e) {}
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
        await SecureStore.setItemAsync('token', newToken);
        await SecureStore.setItemAsync('user', JSON.stringify(newUser));
        if (newRefreshToken) {
            await SecureStore.setItemAsync('refreshToken', newRefreshToken);
        }
        // Start native GPS service (survives app close + phone reboot)
        try { NativeLocation?.startTracking(newToken); } catch (e) {}
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, refreshTokenNow }}>
            {children}
        </AuthContext.Provider>
    );
};
