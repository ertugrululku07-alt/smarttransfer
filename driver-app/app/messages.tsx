import React, { useEffect, useState, useRef } from 'react';
import {
    StyleSheet, View, Text, FlatList, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Image, Alert, Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

export default function MessagesScreen() {
    const { user, token } = useAuth();
    const { socket, setUnreadCount } = useSocket();
    const router = useRouter();
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [contactId, setContactId] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);

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

    // Clear unread count when screen is open
    useFocusEffect(
        React.useCallback(() => {
            setUnreadCount(0);
        }, [setUnreadCount])
    );

    // Step 1: fetch the contact (admin) first
    useEffect(() => {
        fetchContact();
    }, []);

    // Step 2: when contactId is ready, fetch messages
    useEffect(() => {
        if (contactId) {
            fetchMessages(contactId);
        }
    }, [contactId]);

    // Socket listener for incoming messages
    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (msg: any) => {
            // Check if it's already in the list to avoid duplicate renders
            setMessages(prev => {
                if (prev.find(m => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
            setUnreadCount(0); // If a message comes in while we are here, immediately clear it
        };

        socket.on('new_message', handleNewMessage);
        return () => {
            socket.off('new_message', handleNewMessage);
        };
    }, [socket, user?.id]);

    const fetchContact = async () => {
        try {
            const res = await fetch(`${API_URL}/driver/contact`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success && json.data?.id) {
                setContactId(json.data.id);
            } else {
                // No admin contact found, stop loading
                setLoading(false);
            }
        } catch (e) {
            console.error('Contact fetch error:', e);
            setLoading(false);
        }
    };

    const fetchMessages = async (cId: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/messages?contactId=${cId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setMessages(json.data);
            }
        } catch (e) {
            console.error('Fetch messages error:', e);
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async () => {
        const content = inputText.trim();
        if (!content || !contactId) return;

        Keyboard.dismiss();
        setInputText('');
        setSending(true);

        try {
            const res = await fetch(`${API_URL}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ receiverId: contactId, content })
            });
            const json = await res.json();
            if (json.success) {
                setMessages(prev => {
                    if (prev.find((m: any) => m.id === json.data.id)) return prev;
                    return [...prev, json.data];
                });
            } else {
                console.error('Send failed:', json.error);
            }
        } catch (e) {
            console.error('Send error:', e);
        } finally {
            setSending(false);
        }
    };

    const openCamera = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('İzin Gerekli', 'Kamera erişimine izin vermeniz gerekiyor.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6,
        });

        if (!result.canceled && result.assets[0] && contactId) {
            uploadAndSendImage(result.assets[0], contactId);
        }
    };

    const uploadAndSendImage = async (imageAsset: ImagePicker.ImagePickerAsset, receiverId: string) => {
        setSending(true);

        try {
            // 1. Upload the image
            const formData = new FormData();
            formData.append('file', {
                uri: imageAsset.uri,
                name: 'photo.jpg',
                type: 'image/jpeg',
            } as any);

            const uploadRes = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const uploadJson = await uploadRes.json();

            if (!uploadJson.success) {
                Alert.alert('Hata', 'Fotoğraf yüklenemedi: ' + uploadJson.error);
                setSending(false);
                return;
            }

            const imageUrl = uploadJson.data.url;

            // 2. Send the message with format IMAGE
            const res = await fetch(`${API_URL}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    receiverId,
                    content: imageUrl,
                    format: 'IMAGE'
                })
            });

            const json = await res.json();
            if (json.success) {
                setMessages(prev => {
                    if (prev.find((m: any) => m.id === json.data.id)) return prev;
                    return [...prev, json.data];
                });
            } else {
                console.error('Image send failed:', json.error);
            }
        } catch (error) {
            console.error('Image upload/send error:', error);
            Alert.alert('Hata', 'Fotoğraf gönderilirken bir hata oluştu.');
        } finally {
            setSending(false);
        }
    };

    const scrollToBottom = () => {
        // Obsolete now that we use an inverted list!
    };

    const renderItem = ({ item }: { item: any }) => {
        const isMe = item.senderId === user?.id;
        const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return (
            <View style={[styles.bubbleRow, isMe ? styles.rowRight : styles.rowLeft]}>
                {!isMe && (
                    <View style={styles.avatarSmall}>
                        <Ionicons name="headset" size={14} color="#4361ee" />
                    </View>
                )}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    {item.format === 'IMAGE' ? (
                        <TouchableOpacity onPress={() => setSelectedImage(getImageUrl(item.content))}>
                            <Image
                                source={{ uri: getImageUrl(item.content) }}
                                style={styles.attachedImage}
                                resizeMode="cover"
                            />
                        </TouchableOpacity>
                    ) : (
                        <Text style={[styles.bubbleText, isMe ? styles.textMe : styles.textOther]}>
                            {item.content}
                        </Text>
                    )}
                    <Text style={[styles.timeText, isMe ? { color: 'rgba(255,255,255,0.6)' } : { color: '#9ca3af' }]}>
                        {time}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <View style={styles.headerAvatar}>
                        <Ionicons name="headset" size={20} color="#fff" />
                    </View>
                    <View>
                        <Text style={styles.headerName}>Operasyon Merkezi</Text>
                        <Text style={styles.headerSub}>
                            {contactId ? 'Bağlantı kuruldu' : 'Bağlanıyor...'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Messages + Input with Keyboard Avoidance */}
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {loading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#4361ee" />
                        <Text style={{ color: '#9ca3af', marginTop: 12 }}>Mesajlar yükleniyor...</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={[...messages].reverse()}
                        inverted={true}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.list}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
                                <Text style={styles.emptyText}>
                                    {contactId ? 'Henüz mesaj yok.\nOperasyona mesaj gönderin.' : 'Operasyon yöneticisi bulunamadı.'}
                                </Text>
                            </View>
                        }
                    />
                )}

                <View style={styles.inputBar}>
                    <TouchableOpacity
                        style={styles.cameraBtn}
                        onPress={openCamera}
                        disabled={!contactId || sending}
                    >
                        <Ionicons name="camera" size={24} color="#6b7280" />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.input}
                        placeholder="Mesaj yazın..."
                        placeholderTextColor="#9ca3af"
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={500}
                        returnKeyType="send"
                        onSubmitEditing={sendMessage}
                        editable={!!contactId}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!inputText.trim() || !contactId || sending) && styles.sendBtnDisabled]}
                        onPress={sendMessage}
                        disabled={!inputText.trim() || !contactId || sending}
                    >
                        {sending
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="send" size={18} color="#fff" />
                        }
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Image Modal for Fullscreen View */}
            {!!selectedImage && (
                <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
                    <View style={styles.modalBg}>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedImage(null)}>
                            <Ionicons name="close-circle" size={40} color="#fff" />
                        </TouchableOpacity>
                        <Image source={{ uri: selectedImage }} style={styles.modalImage} resizeMode="contain" />
                    </View>
                </Modal>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f0f2f8' },

    // Header
    header: {
        backgroundColor: '#1e3a8a',
        paddingHorizontal: 16,
        paddingBottom: 10,
        paddingTop: Platform.OS === 'ios' ? 24 : 10,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#1e3a8a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    backBtn: { marginRight: 10, padding: 4 },
    headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerAvatar: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#4361ee',
        justifyContent: 'center', alignItems: 'center'
    },
    headerName: { color: '#fff', fontWeight: '700', fontSize: 16 },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

    // List
    list: { paddingHorizontal: 14, paddingVertical: 16, gap: 10, flexGrow: 1 },

    // Empty state
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText: { color: '#9ca3af', textAlign: 'center', marginTop: 14, lineHeight: 22 },

    // Bubbles
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    rowRight: { justifyContent: 'flex-end' },
    rowLeft: { justifyContent: 'flex-start' },
    avatarSmall: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#e0e7ff',
        justifyContent: 'center', alignItems: 'center'
    },
    bubble: { maxWidth: '78%', padding: 12, borderRadius: 18, elevation: 1 },
    bubbleMe: { backgroundColor: '#4361ee', borderBottomRightRadius: 4 },
    bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 15, lineHeight: 20 },
    attachedImage: { width: 220, height: 300, borderRadius: 12 },
    textMe: { color: '#fff' },
    textOther: { color: '#111827' },
    timeText: { fontSize: 10, marginTop: 4, textAlign: 'right' },

    // Modal
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
    modalClose: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, right: 20, zIndex: 10, padding: 10 },
    modalImage: { width: '100%', height: '80%' },

    // Input Bar
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        gap: 8,
    },
    cameraBtn: {
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        fontSize: 15,
        color: '#111827',
        maxHeight: 120,
        minHeight: 44,
    },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#4361ee',
        justifyContent: 'center', alignItems: 'center'
    },
    sendBtnDisabled: { backgroundColor: '#a5b4fc' },
});
