import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { router } from 'expo-router';
import { Platform, BackHandler } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';

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
                let storedToken = await SecureStore.getItemAsync('token');
                let storedUser = await SecureStore.getItemAsync('user');
                
                // Fallback to AsyncStorage if SecureStore fails
                if (!storedToken) {
                    storedToken = await AsyncStorage.getItem('token');
                    storedUser = await AsyncStorage.getItem('user');
                }

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
        await AsyncStorage.setItem('token', newToken); // Headless JS Fallback
        await SecureStore.setItemAsync('user', JSON.stringify(newUser));
        await AsyncStorage.setItem('user', JSON.stringify(newUser));
    };

    const signOut = async () => {
        const API_URL = 'https://backend-production-69e7.up.railway.app/api';

        // 1. Clear push token on backend (stops silent push notifications)
        try {
            if (token) {
                await fetch(`${API_URL}/driver/push-token`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (e) {
            console.warn('Push token cleanup error (non-fatal):', e);
        }

        // 2. Stop background location task
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

        // 4. Clear ALL persisted data (prevents bg tasks from re-activating)
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('user');
        await SecureStore.deleteItemAsync('lastSyncTime');

        // 5. Clear in-memory state — triggers AuthGuard redirect
        setToken(null);
        setUser(null);

        // 6. Navigate to login
        try {
            router.replace('/');
        } catch (e) {
            console.warn('signOut navigation error:', e);
        }
        // Fallback: if navigation didn't work (Samsung quirk), force close
        if (Platform.OS === 'android') {
            setTimeout(() => {
                BackHandler.exitApp();
            }, 500);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
