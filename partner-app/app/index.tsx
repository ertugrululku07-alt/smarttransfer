import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, Dimensions, Animated, KeyboardAvoidingView,
    Platform, ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Brand, API_URL } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const LOGIN_TIMEOUT_MS = 12000;

export default function LoginScreen() {
    const { signIn, isLoading, token } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;
    const logoScale = useRef(new Animated.Value(0.8)).current;
    const cardSlide = useRef(new Animated.Value(60)).current;

    useEffect(() => {
        if (isLoading) return;
        if (token) { router.replace('/(tabs)'); return; }
        loadRemembered();
        Animated.stagger(150, [
            Animated.parallel([
                Animated.spring(logoScale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
            ]),
            Animated.timing(cardSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, [isLoading, token]);

    const loadRemembered = async () => {
        try {
            const savedEmail = await SecureStore.getItemAsync('partner_remembered_email');
            const savedRemember = await SecureStore.getItemAsync('partner_remember_me');
            if (savedRemember === 'true' && savedEmail) { setEmail(savedEmail); setRememberMe(true); }
        } catch {}
    };

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Eksik Bilgi', 'Lütfen e-posta ve şifrenizi girin.');
            return;
        }
        setLoading(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
            let response: Response;
            try {
                response = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
                    signal: controller.signal,
                });
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    Alert.alert('Zaman Aşımı', 'Sunucu yanıt vermedi.');
                } else {
                    Alert.alert('Bağlantı Hatası', 'Sunucuya bağlanılamadı.');
                }
                return;
            }
            clearTimeout(timeoutId);
            if (!response.ok && response.status >= 500) {
                Alert.alert('Sunucu Hatası', `HTTP ${response.status}`);
                return;
            }
            const data = await response.json();
            if (data.success) {
                const { user, token: newToken, refreshToken } = data.data;
                const isPartner = user.role?.code === 'PARTNER' || user.role?.type === 'PARTNER';
                if (!isPartner) {
                    Alert.alert('Yetkisiz Giriş', 'Bu uygulama yalnızca partner kullanıcılar içindir.');
                    return;
                }
                if (rememberMe) {
                    await SecureStore.setItemAsync('partner_remembered_email', email.trim());
                    await SecureStore.setItemAsync('partner_remember_me', 'true');
                } else {
                    await SecureStore.deleteItemAsync('partner_remembered_email');
                    await SecureStore.deleteItemAsync('partner_remember_me');
                }
                await signIn(newToken, user, refreshToken);
                router.replace('/(tabs)');
            } else {
                Alert.alert('Giriş Başarısız', data.error || 'E-posta veya şifre hatalı.');
            }
        } catch (err: any) {
            Alert.alert('Hata', err.message || 'Beklenmeyen bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={s.loadingContainer}>
                <ActivityIndicator size="large" color={Brand.primary} />
            </View>
        );
    }

    return (
        <LinearGradient colors={['#0f172a', '#1e293b', '#064e3b']} style={s.container}>
            <StatusBar style="light" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                    {/* Logo */}
                    <Animated.View style={[s.logoWrap, { opacity: fadeAnim, transform: [{ scale: logoScale }, { translateY: slideAnim }] }]}>
                        <View style={s.logoBox}>
                            <Ionicons name="car-sport" size={36} color="#fff" />
                        </View>
                        <Text style={s.appName}>Partner</Text>
                        <Text style={s.appSub}>Partner Uygulaması</Text>
                    </Animated.View>

                    {/* Form */}
                    <Animated.View style={[s.formCard, { opacity: fadeAnim, transform: [{ translateY: cardSlide }] }]}>
                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>E-posta Adresi</Text>
                            <View style={s.inputWrap}>
                                <Ionicons name="mail-outline" size={18} color="#94a3b8" style={s.inputIcon} />
                                <TextInput
                                    style={s.input}
                                    placeholder="ornek@email.com"
                                    placeholderTextColor="#64748b"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>
                        </View>

                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>Şifre</Text>
                            <View style={s.inputWrap}>
                                <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={s.inputIcon} />
                                <TextInput
                                    style={s.input}
                                    placeholder="••••••••"
                                    placeholderTextColor="#64748b"
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    onChangeText={setPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94a3b8" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={s.rememberRow}>
                            <TouchableOpacity onPress={() => setRememberMe(!rememberMe)} style={s.checkRow}>
                                <View style={[s.checkbox, rememberMe && s.checkboxActive]}>
                                    {rememberMe && <Ionicons name="checkmark" size={12} color="#fff" />}
                                </View>
                                <Text style={s.rememberText}>Beni hatırla</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={s.loginBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
                            <LinearGradient colors={['#059669', '#10b981']} style={s.loginGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Text style={s.loginText}>Giriş Yap</Text>
                                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>

                    <Text style={s.version}>v1.0.0 • Partner</Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    logoWrap: { alignItems: 'center', marginBottom: 40 },
    logoBox: {
        width: 80, height: 80, borderRadius: 20, backgroundColor: '#059669',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 15,
    },
    appName: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    appSub: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
    formCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    inputGroup: { marginBottom: 18 },
    inputLabel: { fontSize: 12, fontWeight: '600', color: '#cbd5e1', marginBottom: 6, marginLeft: 4 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, height: 50,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 14, color: '#fff' },
    eyeBtn: { padding: 4 },
    rememberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: {
        width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center', alignItems: 'center',
    },
    checkboxActive: { backgroundColor: '#059669', borderColor: '#059669' },
    rememberText: { fontSize: 12, color: '#94a3b8' },
    loginBtn: { borderRadius: 14, overflow: 'hidden' },
    loginGrad: {
        height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
    },
    loginText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    version: { textAlign: 'center', color: '#475569', fontSize: 10, marginTop: 32 },
});
