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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Brand } from '../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';
const { width, height } = Dimensions.get('window');
const LOGIN_TIMEOUT_MS = 12000;

export default function LoginScreen() {
    const { signIn, isLoading, token } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [emailFocused, setEmailFocused] = useState(false);
    const [passFocused, setPassFocused] = useState(false);

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
            Animated.parallel([
                Animated.timing(cardSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
            ]),
        ]).start();
    }, [isLoading, token]);

    const loadRemembered = async () => {
        try {
            const savedEmail = await SecureStore.getItemAsync('remembered_email');
            const savedRemember = await SecureStore.getItemAsync('remember_me');
            if (savedRemember === 'true' && savedEmail) { setEmail(savedEmail); setRememberMe(true); }
        } catch { }
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
                    Alert.alert('Zaman Aşımı', 'Sunucu yanıt vermedi. İnternet bağlantınızı kontrol edip tekrar deneyin.');
                } else {
                    Alert.alert('Bağlantı Hatası', 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
                }
                return;
            }
            clearTimeout(timeoutId);
            if (!response.ok && response.status >= 500) {
                Alert.alert('Sunucu Hatası', `Sunucu hizmet veremiyor (HTTP ${response.status}).`);
                return;
            }
            const data = await response.json();
            if (data.success) {
                const { user, token: newToken, refreshToken } = data.data;
                const isDriver = user.role?.code === 'DRIVER' || user.role?.type === 'DRIVER' || user.role?.type === 'PARTNER';
                if (!isDriver) {
                    Alert.alert('Yetkisiz Giriş', 'Bu uygulama yalnızca sürücüler içindir.');
                    return;
                }
                if (rememberMe) {
                    await SecureStore.setItemAsync('remembered_email', email.trim());
                    await SecureStore.setItemAsync('remember_me', 'true');
                } else {
                    await SecureStore.deleteItemAsync('remembered_email');
                    await SecureStore.deleteItemAsync('remember_me');
                }
                await signIn(newToken, user, refreshToken);
                router.replace('/(tabs)');
            } else {
                Alert.alert('Giriş Başarısız', data.error || 'Kullanıcı adı veya şifre hatalı.');
            }
        } catch {
            Alert.alert('Beklenmeyen Hata', 'Giriş sırasında bir sorun oluştu.');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={s.splash}>
                <View style={s.splashIconRing}>
                    <View style={s.splashIconInner}>
                        <Ionicons name="navigate" size={40} color="#fff" />
                    </View>
                </View>
                <Text style={s.splashTitle}>SmartTransfer</Text>
                <Text style={s.splashSub}>Sürücü Platformu</Text>
                <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" style={{ marginTop: 32 }} />
            </View>
        );
    }

    return (
        <>
            <StatusBar style="light" />
            <View style={s.bg}>
                {/* Gradient-like layered background */}
                <View style={s.bgLayer1} />
                <View style={s.bgLayer2} />
                <View style={s.bgLayer3} />
                <View style={s.bgGlow} />

                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView
                        contentContainerStyle={s.scroll}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >

                        {/* Logo */}
                        <Animated.View style={[s.logoSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: logoScale }] }]}>
                            <View style={s.logoOuter}>
                                <View style={s.logoInner}>
                                    <Ionicons name="navigate" size={36} color="#fff" />
                                </View>
                            </View>
                            <Text style={s.brandName}>SmartTransfer</Text>
                            <View style={s.taglineRow}>
                                <View style={s.taglineLine} />
                                <Text style={s.tagline}>SÜRÜCÜ PLATFORMU</Text>
                                <View style={s.taglineLine} />
                            </View>
                        </Animated.View>

                        {/* Card */}
                        <Animated.View style={[s.card, { opacity: fadeAnim, transform: [{ translateY: cardSlide }] }]}>
                            <View style={s.cardHeader}>
                                <Text style={s.welcomeTitle}>Giriş Yap</Text>
                                <Text style={s.welcomeSub}>Hesabınıza erişmek için bilgilerinizi girin</Text>
                            </View>

                            {/* Email */}
                            <View style={s.fieldGroup}>
                                <Text style={s.fieldLabel}>E-posta Adresi</Text>
                                <View style={[s.inputWrapper, emailFocused && s.inputFocused]}>
                                    <View style={[s.inputIconBox, emailFocused && s.inputIconBoxFocused]}>
                                        <Ionicons name="mail" size={16} color={emailFocused ? '#fff' : '#94a3b8'} />
                                    </View>
                                    <TextInput
                                        style={s.input}
                                        placeholder="ornek@sirket.com"
                                        placeholderTextColor="#cbd5e1"
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        returnKeyType="next"
                                        onFocus={() => setEmailFocused(true)}
                                        onBlur={() => setEmailFocused(false)}
                                    />
                                </View>
                            </View>

                            {/* Password */}
                            <View style={s.fieldGroup}>
                                <Text style={s.fieldLabel}>Şifre</Text>
                                <View style={[s.inputWrapper, passFocused && s.inputFocused]}>
                                    <View style={[s.inputIconBox, passFocused && s.inputIconBoxFocused]}>
                                        <Ionicons name="lock-closed" size={16} color={passFocused ? '#fff' : '#94a3b8'} />
                                    </View>
                                    <TextInput
                                        style={s.input}
                                        placeholder="••••••••"
                                        placeholderTextColor="#cbd5e1"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                        returnKeyType="done"
                                        onSubmitEditing={handleLogin}
                                        onFocus={() => setPassFocused(true)}
                                        onBlur={() => setPassFocused(false)}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Remember */}
                            <TouchableOpacity style={s.rememberRow} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.7}>
                                <View style={[s.toggle, rememberMe && s.toggleActive]}>
                                    <View style={[s.toggleDot, rememberMe && s.toggleDotActive]} />
                                </View>
                                <Text style={s.rememberText}>Beni hatırla</Text>
                            </TouchableOpacity>

                            {/* Login Button */}
                            <TouchableOpacity
                                style={[s.loginBtn, loading && s.loginBtnLoading]}
                                onPress={handleLogin}
                                disabled={loading}
                                activeOpacity={0.85}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <View style={s.loginBtnInner}>
                                        <Text style={s.loginBtnText}>Giriş Yap</Text>
                                        <View style={s.loginBtnArrow}>
                                            <Ionicons name="arrow-forward" size={16} color={Brand.primary} />
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Footer */}
                        <View style={s.footerRow}>
                            <View style={s.footerDot} />
                            <Text style={s.footerText}>SmartTransfer v1.1</Text>
                            <View style={s.footerDot} />
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </>
    );
}

const s = StyleSheet.create({
    // Splash
    splash: { flex: 1, backgroundColor: '#0c1829', justifyContent: 'center', alignItems: 'center' },
    splashIconRing: {
        width: 100, height: 100, borderRadius: 50,
        borderWidth: 2, borderColor: 'rgba(99,102,241,0.3)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    splashIconInner: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: Brand.primary, justifyContent: 'center', alignItems: 'center',
    },
    splashTitle: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 1 },
    splashSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' },

    // Background
    bg: { flex: 1, backgroundColor: '#0c1829' },
    bgLayer1: {
        position: 'absolute', width: width * 1.5, height: width * 1.5, borderRadius: width * 0.75,
        backgroundColor: '#1e3a8a', top: -width * 0.6, right: -width * 0.4, opacity: 0.4,
    },
    bgLayer2: {
        position: 'absolute', width: width, height: width, borderRadius: width * 0.5,
        backgroundColor: '#312e81', bottom: -width * 0.3, left: -width * 0.3, opacity: 0.25,
    },
    bgLayer3: {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        backgroundColor: '#6366f1', top: height * 0.35, right: -40, opacity: 0.12,
    },
    bgGlow: {
        position: 'absolute', width: 300, height: 300, borderRadius: 150,
        backgroundColor: '#4f46e5', top: height * 0.15, left: width * 0.2, opacity: 0.08,
    },

    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },

    // Logo
    logoSection: { alignItems: 'center', marginBottom: 36 },
    logoOuter: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: 'rgba(99,102,241,0.15)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 18,
        borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.25)',
    },
    logoInner: {
        width: 56, height: 56, borderRadius: 18,
        backgroundColor: Brand.primary, justifyContent: 'center', alignItems: 'center',
        shadowColor: Brand.primary, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6, shadowRadius: 20, elevation: 15,
    },
    brandName: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 1 },
    taglineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
    taglineLine: { width: 24, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
    tagline: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '700', letterSpacing: 3 },

    // Card
    card: {
        backgroundColor: '#fff', borderRadius: 24, padding: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.15, shadowRadius: 40, elevation: 20,
    },
    cardHeader: { marginBottom: 24 },
    welcomeTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
    welcomeSub: { fontSize: 13, color: '#94a3b8', lineHeight: 18 },

    // Fields
    fieldGroup: { marginBottom: 16 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f8fafc', borderRadius: 14,
        borderWidth: 1.5, borderColor: '#e2e8f0',
        paddingRight: 12, height: 52, overflow: 'hidden',
    },
    inputFocused: { borderColor: Brand.primary, backgroundColor: '#f0f4ff' },
    inputIconBox: {
        width: 44, height: '100%', justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#f1f5f9', marginRight: 0,
    },
    inputIconBoxFocused: { backgroundColor: Brand.primary },
    input: { flex: 1, fontSize: 15, color: '#0f172a', paddingLeft: 12 },
    eyeBtn: { padding: 6 },

    // Remember toggle
    rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 4 },
    toggle: {
        width: 40, height: 22, borderRadius: 11,
        backgroundColor: '#e2e8f0', padding: 2, marginRight: 10,
        justifyContent: 'center',
    },
    toggleActive: { backgroundColor: Brand.primary },
    toggleDot: {
        width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
    },
    toggleDotActive: { alignSelf: 'flex-end' },
    rememberText: { fontSize: 13, color: '#64748b', fontWeight: '500' },

    // Button
    loginBtn: {
        height: 54, borderRadius: 16,
        backgroundColor: Brand.primary,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: Brand.primary, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45, shadowRadius: 16, elevation: 10,
    },
    loginBtnLoading: { backgroundColor: '#818cf8' },
    loginBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    loginBtnArrow: {
        width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },

    // Footer
    footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28, gap: 8 },
    footerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
    footerText: { color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: '500', letterSpacing: 1 },
});
