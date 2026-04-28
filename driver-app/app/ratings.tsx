import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
    RefreshControl, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Brand } from '../constants/theme';

const API_URL = 'https://backend-production-69e7.up.railway.app/api';

interface RatingItem {
    bookingId: string;
    bookingNumber: string;
    customerName: string;
    startDate: string;
    submittedAt: string;
    overall: number;
    answers: { questionId: string; stars: number }[];
    comment?: string | null;
}

interface PerQuestion {
    questionId: string;
    text: string;
    average: number;
    count: number;
}

interface RatingData {
    total: number;
    average: number;
    distribution: Record<string, number>;
    perQuestion: PerQuestion[];
    ratings: RatingItem[];
}

export default function MyRatingsScreen() {
    const { token } = useAuth();
    const [data, setData] = useState<RatingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRatings = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/ratings/driver/my-ratings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            }
        } catch (e) {
            console.warn('Ratings fetch error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) fetchRatings();
    }, [token, fetchRatings]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchRatings();
    };

    const renderStars = (rating: number, size = 16) => {
        const stars: React.ReactElement[] = [];
        const full = Math.floor(rating);
        const half = rating - full >= 0.5;
        for (let i = 0; i < 5; i++) {
            const isFull = i < full;
            const isHalf = i === full && half;
            stars.push(
                <Ionicons
                    key={i}
                    name={isFull ? 'star' : (isHalf ? 'star-half' : 'star-outline')}
                    size={size}
                    color={isFull || isHalf ? '#f59e0b' : '#e5e7eb'}
                />
            );
        }
        return <View style={{ flexDirection: 'row', gap: 2 }}>{stars}</View>;
    };

    if (loading) {
        return (
            <View style={s.center}>
                <ActivityIndicator color={Brand.primary} size="large" />
            </View>
        );
    }

    return (
        <ScrollView
            style={s.container}
            contentContainerStyle={s.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Puanlarım</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Big rating card */}
            <View style={s.heroCard}>
                <View style={s.heroLeft}>
                    <Text style={s.heroValue}>
                        {(data?.total || 0) > 0 ? data!.average.toFixed(1) : '—'}
                    </Text>
                    <Text style={s.heroOf}>/ 5.0</Text>
                </View>
                <View style={s.heroRight}>
                    {(data?.total || 0) > 0 ? renderStars(data!.average, 22) : null}
                    <Text style={s.heroSub}>
                        {data?.total || 0} değerlendirme
                    </Text>
                </View>
            </View>

            {/* Distribution bars */}
            {(data?.total || 0) > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>📊 Puan Dağılımı</Text>
                    {[5, 4, 3, 2, 1].map(star => {
                        const count = data?.distribution?.[star] || 0;
                        const pct = (data?.total || 0) > 0 ? (count / data!.total) * 100 : 0;
                        return (
                            <View key={star} style={s.distRow}>
                                <Text style={s.distLabel}>{star} ★</Text>
                                <View style={s.distBarBg}>
                                    <View style={[s.distBarFill, { width: `${pct}%` }]} />
                                </View>
                                <Text style={s.distCount}>{count}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            {/* Per question averages */}
            {data?.perQuestion && data.perQuestion.length > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>🎯 Soru Bazlı Ortalamalar</Text>
                    {data.perQuestion.map((q, idx) => (
                        <View key={q.questionId} style={s.qRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.qText}>
                                    <Text style={{ color: Brand.primary, fontWeight: '700' }}>{idx + 1}. </Text>
                                    {q.text}
                                </Text>
                                <Text style={s.qCount}>{q.count} cevap</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                {q.count > 0 ? (
                                    <>
                                        {renderStars(q.average, 14)}
                                        <Text style={s.qAvg}>{q.average.toFixed(1)}</Text>
                                    </>
                                ) : (
                                    <Text style={s.qNoData}>—</Text>
                                )}
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Recent reviews */}
            <View style={s.card}>
                <Text style={s.cardTitle}>💬 Son Değerlendirmeler</Text>
                {(data?.ratings || []).length === 0 ? (
                    <View style={s.empty}>
                        <Ionicons name="star-outline" size={48} color="#cbd5e1" />
                        <Text style={s.emptyText}>Henüz değerlendirme yok.</Text>
                        <Text style={s.emptySub}>Tamamladığınız transferler için müşterilerinizden puan beklenmektedir.</Text>
                    </View>
                ) : (
                    data!.ratings.map(r => (
                        <View key={r.bookingId} style={s.reviewItem}>
                            <View style={s.reviewHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.reviewName}>{r.customerName || 'Anonim'}</Text>
                                    <Text style={s.reviewMeta}>
                                        PNR {r.bookingNumber} • {new Date(r.submittedAt).toLocaleDateString('tr-TR')}
                                    </Text>
                                </View>
                                <View style={s.reviewBadge}>
                                    <Ionicons name="star" size={14} color="#f59e0b" />
                                    <Text style={s.reviewBadgeText}>{r.overall.toFixed(1)}</Text>
                                </View>
                            </View>
                            {renderStars(r.overall, 14)}
                            {r.comment ? (
                                <Text style={s.reviewComment}>"{r.comment}"</Text>
                            ) : null}
                        </View>
                    ))
                )}
            </View>

            <View style={{ height: 32 }} />
        </ScrollView>
    );
}

const { width } = Dimensions.get('window');

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
    content: { paddingBottom: 24 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Brand.primary,
        paddingTop: 50,
        paddingBottom: 16,
        paddingHorizontal: 12,
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },

    heroCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', marginHorizontal: 16, marginTop: -12,
        padding: 24, borderRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
        gap: 16,
    },
    heroLeft: { flexDirection: 'row', alignItems: 'baseline' },
    heroValue: { fontSize: 56, fontWeight: '900', color: '#f59e0b', lineHeight: 60 },
    heroOf: { fontSize: 18, color: '#94a3b8', fontWeight: '600', marginLeft: 4 },
    heroRight: { flex: 1, gap: 6 },
    heroSub: { color: '#64748b', fontSize: 13, fontWeight: '600' },

    card: {
        backgroundColor: '#fff', marginHorizontal: 16, marginTop: 14,
        padding: 18, borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 14, letterSpacing: 0.3 },

    distRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    distLabel: { width: 32, fontSize: 12, fontWeight: '700', color: '#475569' },
    distBarBg: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
    distBarFill: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 4 },
    distCount: { width: 24, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#0f172a' },

    qRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
        gap: 10,
    },
    qText: { fontSize: 13, color: '#0f172a', lineHeight: 18, fontWeight: '500' },
    qCount: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
    qAvg: { fontSize: 13, fontWeight: '800', color: '#f59e0b', marginTop: 2 },
    qNoData: { fontSize: 13, color: '#cbd5e1', fontWeight: '600' },

    empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyText: { fontSize: 15, fontWeight: '700', color: '#475569', marginTop: 12 },
    emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },

    reviewItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 6 },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    reviewMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    reviewBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    },
    reviewBadgeText: { fontSize: 13, fontWeight: '800', color: '#b45309' },
    reviewComment: { fontSize: 13, color: '#475569', fontStyle: 'italic', lineHeight: 18, marginTop: 4 },
});
