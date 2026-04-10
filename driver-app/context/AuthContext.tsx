import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
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
        // 1. Stop all background tasks so the app truly stops
        try {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
            if (isRegistered) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            }
        } catch (e) {
            console.warn('Stop location task error:', e);
        }

        // 2. Clear all persisted data
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('user');

        // 3. Clear in-memory state — triggers AuthGuard redirect
        setToken(null);
        setUser(null);

        // 4. Navigate to login
        //    On Android we try router.replace first, then exitApp as fallback.
        //    Stopping the location task above kills the foreground service,
        //    so the app won't linger in background anymore.
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
