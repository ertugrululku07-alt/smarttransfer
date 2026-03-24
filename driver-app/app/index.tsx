import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, Dimensions, Animated, KeyboardAvoidingView,
    Platform, ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://smarttransfer-backend-production.up.railway.app/api';
const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
    const { signIn, isLoading, token } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        if (isLoading) return; // Wait until auth state is loaded

        if (token) {
            // Already logged in → redirect to dashboard
            router.replace('/(tabs)');
            return;
        }
        // Not logged in → load remembered email and animate form in
        loadRemembered();
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, [isLoading, token]);

    const loadRemembered = async () => {
        try {
            const savedEmail = await SecureStore.getItemAsync('remembered_email');
            const savedRemember = await SecureStore.getItemAsync('remember_me');
            if (savedRemember === 'true' && savedEmail) {
                setEmail(savedEmail);
                setRememberMe(true);
            }
        } catch (e) { /* ignore */ }
    };



    const handleLogin = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Eksik Bilgi', 'Lütfen e-posta ve şifrenizi girin.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase(), password })
            });

            const data = await response.json();

            if (data.success) {
                const { user, token: newToken } = data.data;
                const isDriver = user.role?.code === 'DRIVER' ||
                    user.role?.type === 'DRIVER' ||
                    user.role?.type === 'PARTNER';

                if (!isDriver) {
                    Alert.alert('Yetkisiz Giriş', 'Bu uygulama yalnızca sürücüler içindir.');
                    return;
                }

                // Handle Remember Me
                if (rememberMe) {
                    await SecureStore.setItemAsync('remembered_email', email.trim());
                    await SecureStore.setItemAsync('remember_me', 'true');
                } else {
                    await SecureStore.deleteItemAsync('remembered_email');
                    await SecureStore.deleteItemAsync('remember_me');
                }

                await signIn(newToken, user);
                router.replace('/(tabs)');
            } else {
                Alert.alert('Giriş Başarısız', data.error || 'E-posta veya şifre hatalı.');
            }
        } catch (error) {
            Alert.alert('Bağlantı Hatası', 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.splash}>
                <View style={styles.splashLogo}>
                    <Ionicons name="car-sport" size={48} color="#fff" />
                </View>
                <Text style={styles.splashText}>SmartTransfer</Text>
                <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
            </View>
        );
    }

    return (
        <>
            <StatusBar style="light" />
            <View style={styles.bg}>
                {/* Background decorations */}
                <View style={styles.circle1} />
                <View style={styles.circle2} />

                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScrollView
                        contentContainerStyle={styles.scroll}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Logo section */}
                        <Animated.View style={[styles.logoSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                            <View style={styles.logoCircle}>
                                <Ionicons name="car-sport" size={42} color="#fff" />
                            </View>
                            <Text style={styles.appName}>SmartTransfer</Text>
                            <Text style={styles.tagline}>Sürücü Uygulaması</Text>
                        </Animated.View>

                        {/* Form Card */}
                        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                            <Text style={styles.welcomeText}>Hoş Geldiniz</Text>
                            <Text style={styles.welcomeSub}>Hesabınıza giriş yapın</Text>

                            {/* Email */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.fieldLabel}>E-posta</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="mail-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="ornek@mail.com"
                                        placeholderTextColor="#9ca3af"
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        returnKeyType="next"
                                    />
                                </View>
                            </View>

                            {/* Password */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.fieldLabel}>Şifre</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="lock-closed-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="••••••••"
                                        placeholderTextColor="#9ca3af"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                        returnKeyType="done"
                                        onSubmitEditing={handleLogin}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                                        <Ionicons
                                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                            size={20}
                                            color="#9ca3af"
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Remember Me */}
                            <TouchableOpacity
                                style={styles.rememberRow}
                                onPress={() => setRememberMe(!rememberMe)}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                                    {rememberMe && <Ionicons name="checkmark" size={13} color="#fff" />}
                                </View>
                                <Text style={styles.rememberText}>Beni Hatırla</Text>
                            </TouchableOpacity>

                            {/* Login Button */}
                            <TouchableOpacity
                                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                                onPress={handleLogin}
                                disabled={loading}
                                activeOpacity={0.85}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <View style={styles.loginBtnInner}>
                                        <Text style={styles.loginBtnText}>Giriş Yap</Text>
                                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>

                        <Text style={styles.footer}>SmartTransfer v1.0 • Sadece sürücüler için</Text>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    // Splash
    splash: {
        flex: 1, backgroundColor: '#1e3a8a',
        justifyContent: 'center', alignItems: 'center'
    },
    splashLogo: {
        width: 90, height: 90, borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16
    },
    splashText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },

    // Background
    bg: { flex: 1, backgroundColor: '#0f172a' },
    circle1: {
        position: 'absolute', width: 320, height: 320, borderRadius: 160,
        backgroundColor: '#1e40af', top: -100, right: -80, opacity: 0.6
    },
    circle2: {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        backgroundColor: '#3730a3', bottom: 80, left: -60, opacity: 0.4
    },

    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

    // Logo
    logoSection: { alignItems: 'center', marginBottom: 32 },
    logoCircle: {
        width: 88, height: 88, borderRadius: 26,
        backgroundColor: '#4361ee',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#4361ee',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 12,
    },
    appName: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
    tagline: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 },

    // Card
    card: {
        backgroundColor: '#fff',
        borderRadius: 28,
        padding: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.25,
        shadowRadius: 32,
        elevation: 16,
    },
    welcomeText: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 4 },
    welcomeSub: { fontSize: 14, color: '#6b7280', marginBottom: 28 },

    // Fields
    fieldGroup: { marginBottom: 18 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        paddingHorizontal: 14,
        height: 52,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 15, color: '#111827' },
    eyeBtn: { padding: 4 },

    // Remember Me
    rememberRow: {
        flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 4
    },
    checkbox: {
        width: 20, height: 20, borderRadius: 6,
        borderWidth: 2, borderColor: '#d1d5db',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 10,
    },
    checkboxChecked: { backgroundColor: '#4361ee', borderColor: '#4361ee' },
    rememberText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

    // Button
    loginBtn: {
        height: 56, borderRadius: 16,
        backgroundColor: '#4361ee',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#4361ee',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    loginBtnDisabled: { backgroundColor: '#a5b4fc', shadowOpacity: 0 },
    loginBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    loginBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

    footer: {
        textAlign: 'center', color: 'rgba(255,255,255,0.3)',
        fontSize: 12, marginTop: 24
    },
});
