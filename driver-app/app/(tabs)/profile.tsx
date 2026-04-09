import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    TouchableOpacity, Alert, ActivityIndicator, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { Brand } from '../../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

export default function ProfileScreen() {
    const { user, token, signOut } = useAuth();
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [saving, setSaving] = useState(false);

    const getImageUrl = (url: string | undefined | null) => {
        if (!url) return '';
        const baseApi = API_URL.replace('/api', '');
        if (url.startsWith('/uploads')) {
            return `${baseApi}${url}`;
        }
        if (url.includes('localhost')) {
            return url.replace(/https?:\/\/localhost(:\d+)?/, baseApi);
        }
        return url;
    };

    const initials = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`.toUpperCase();

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            Alert.alert('Eksik Bilgi', 'Tüm şifre alanlarını doldurun.');
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert('Geçersiz Şifre', 'Yeni şifre en az 6 karakter olmalı.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Şifre Uyumsuz', 'Yeni şifreler eşleşmiyor.');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/driver/profile/password`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const json = await res.json();
            if (json.success) {
                Alert.alert('Başarılı', 'Şifreniz güncellendi.', [
                    {
                        text: 'Tamam', onPress: () => {
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmPassword('');
                        }
                    }
                ]);
            } else {
                Alert.alert('Hata', json.error || 'Şifre değiştirilemedi.');
            }
        } catch (e) {
            Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamadı.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        Alert.alert('Çıkış Yap', 'Uygulamadan çıkmak istediğinizden emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış Yap', style: 'destructive', onPress: signOut }
        ]);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profilim</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                {/* Avatar */}
                <View style={styles.avatarSection}>
                    {user?.avatar ? (
                        <Image source={{ uri: getImageUrl(user.avatar) }} style={styles.avatarCircleImage} />
                    ) : (
                        <View style={styles.avatarCircle}>
                            <Text style={styles.avatarText}>{initials || '?'}</Text>
                        </View>
                    )}
                    <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
                    <View style={styles.roleBadge}>
                        <Ionicons name="car-sport" size={12} color="#4361ee" />
                        <Text style={styles.roleText}>Sürücü</Text>
                    </View>
                </View>

                {/* Info Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Kişisel Bilgiler</Text>

                    <InfoRow icon="person-outline" label="Ad Soyad" value={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`} />
                    <InfoRow icon="mail-outline" label="E-posta" value={user?.email ?? 'Belirtilmemiş'} />
                    <InfoRow icon="call-outline" label="Telefon" value={user?.phone ?? 'Belirtilmemiş'} />
                    <InfoRow icon="shield-checkmark-outline" label="Durum" value="Aktif" valueColor="#10b981" />
                </View>

                {/* Password Change Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Şifre Değiştir</Text>

                    <PasswordField
                        label="Mevcut Şifre"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        show={showCurrent}
                        onToggle={() => setShowCurrent(!showCurrent)}
                    />
                    <PasswordField
                        label="Yeni Şifre"
                        value={newPassword}
                        onChange={setNewPassword}
                        show={showNew}
                        onToggle={() => setShowNew(!showNew)}
                    />
                    <PasswordField
                        label="Yeni Şifre (Tekrar)"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        show={showConfirm}
                        onToggle={() => setShowConfirm(!showConfirm)}
                    />

                    <TouchableOpacity
                        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                        onPress={handleChangePassword}
                        disabled={saving}
                    >
                        {saving
                            ? <ActivityIndicator color="#fff" />
                            : <>
                                <Ionicons name="lock-closed" size={16} color="#fff" />
                                <Text style={styles.saveBtnText}>Şifreyi Güncelle</Text>
                            </>
                        }
                    </TouchableOpacity>
                </View>

                {/* Logout */}
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                    <Text style={styles.logoutText}>Çıkış Yap</Text>
                </TouchableOpacity>

                <Text style={styles.version}>SmartTransfer Sürücü v1.1</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
    return (
        <View style={styles.infoRow}>
            <View style={styles.infoIconWrap}>
                <Ionicons name={icon as any} size={18} color="#4361ee" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
            </View>
        </View>
    );
}

function PasswordField({ label, value, onChange, show, onToggle }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; onToggle: () => void;
}) {
    return (
        <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={16} color="#9ca3af" style={{ marginRight: 10 }} />
                <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry={!show}
                    placeholder="••••••••"
                    placeholderTextColor="#d1d5db"
                />
                <TouchableOpacity onPress={onToggle} style={{ padding: 4 }}>
                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9ca3af" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f0f2f8' },

    header: {
        backgroundColor: '#1e3a8a',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        shadowColor: '#1e3a8a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    backBtn: { width: 40 },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

    content: { padding: 20, paddingBottom: 40 },

    // Avatar
    avatarSection: { alignItems: 'center', marginBottom: 24 },
    avatarCircle: {
        width: 90, height: 90, borderRadius: 45,
        backgroundColor: '#4361ee',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#4361ee',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    avatarCircleImage: {
        width: 90, height: 90, borderRadius: 45,
        marginBottom: 12,
    },
    avatarText: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: 1 },
    userName: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 6 },
    roleBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#eff3ff', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 5,
    },
    roleText: { color: '#4361ee', fontWeight: '600', fontSize: 13 },

    // Card
    card: {
        backgroundColor: '#fff', borderRadius: 20, padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 16 },

    // Info rows
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    infoIconWrap: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#eff3ff',
        justifyContent: 'center', alignItems: 'center'
    },
    infoLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
    infoValue: { fontSize: 14, color: '#111827', fontWeight: '600', marginTop: 2 },

    // Password fields
    fieldGroup: { marginBottom: 14 },
    fieldLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 6 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f9fafb', borderRadius: 12,
        borderWidth: 1.5, borderColor: '#e5e7eb',
        paddingHorizontal: 12, height: 48,
    },
    input: { flex: 1, fontSize: 14, color: '#111827' },

    // Save button
    saveBtn: {
        height: 48, borderRadius: 14,
        backgroundColor: '#4361ee',
        flexDirection: 'row',
        justifyContent: 'center', alignItems: 'center', gap: 8,
        marginTop: 4,
        shadowColor: '#4361ee',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    saveBtnDisabled: { backgroundColor: '#a5b4fc' },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    // Logout
    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#fff', borderRadius: 16, padding: 16,
        borderWidth: 1.5, borderColor: '#fecaca',
        marginBottom: 20,
    },
    logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },

    version: { textAlign: 'center', color: '#9ca3af', fontSize: 12 },
});
