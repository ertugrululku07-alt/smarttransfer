'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();

interface RatingQuestion {
    id: string;
    text: string;
    order?: number;
}

interface RatingPageData {
    bookingNumber: string;
    customerName: string;
    driverName: string;
    startDate: string;
    companyName: string;
    companyLogo?: string | null;
    questions: RatingQuestion[];
    submitted: boolean;
    submittedRating?: {
        overall: number;
        answers: { questionId: string; stars: number }[];
        comment?: string | null;
    } | null;
}

export default function RatePage() {
    const params = useParams<{ token: string }>();
    const token = params.token;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RatingPageData | null>(null);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [comment, setComment] = useState('');
    const [submittedNow, setSubmittedNow] = useState(false);

    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/api/ratings/public/${token}`);
                const json = await res.json();
                if (!json.success) {
                    setError(json.error || 'Bağlantı geçersiz.');
                } else {
                    setData(json.data);
                }
            } catch (e: any) {
                setError(e?.message || 'Bağlantı hatası.');
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const setStars = (questionId: string, stars: number) => {
        setAnswers(prev => ({ ...prev, [questionId]: stars }));
    };

    const handleSubmit = async () => {
        if (!data) return;
        const answersArr = Object.entries(answers).map(([questionId, stars]) => ({ questionId, stars }));
        if (answersArr.length === 0) {
            setError('Lütfen en az bir soruya puan verin.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/ratings/public/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: answersArr, comment: comment.trim() || null })
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.error || 'Gönderilemedi.');
            } else {
                setSubmittedNow(true);
            }
        } catch (e: any) {
            setError(e?.message || 'Bağlantı hatası.');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Loading ──
    if (loading) {
        return (
            <div style={styles.page}>
                <style>{`@keyframes ratepage-spin { to { transform: rotate(360deg); } }`}</style>
                <div style={styles.card}>
                    <div style={{ ...styles.spinner, animation: 'ratepage-spin 1s linear infinite' }} />
                    <p style={styles.muted}>Yükleniyor…</p>
                </div>
            </div>
        );
    }

    // ─── Error ──
    if (error && !data) {
        return (
            <div style={styles.page}>
                <div style={styles.card}>
                    <div style={styles.bigEmoji}>⚠️</div>
                    <h2 style={styles.title}>Geçersiz Bağlantı</h2>
                    <p style={styles.muted}>{error}</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    // ─── Already submitted ──
    if (data.submitted || submittedNow) {
        const rating = submittedNow
            ? Math.round((Object.values(answers).reduce((a, b) => a + b, 0) / Object.values(answers).length) * 10) / 10
            : data.submittedRating?.overall;
        return (
            <div style={styles.page}>
                <div style={styles.card}>
                    <div style={styles.bigEmoji}>🌟</div>
                    <h2 style={styles.title}>Teşekkürler!</h2>
                    <p style={styles.muted}>
                        Değerlendirmeniz için teşekkür ederiz. Geri bildiriminiz hizmet kalitemizi artırmamıza yardımcı olur.
                    </p>
                    {rating ? (
                        <div style={styles.bigRating}>
                            <span style={{ fontSize: 48, fontWeight: 800, color: '#f59e0b' }}>{rating.toFixed(1)}</span>
                            <span style={{ fontSize: 24, color: '#f59e0b' }}> / 5.0</span>
                        </div>
                    ) : null}
                    <p style={styles.companyFooter}>— {data.companyName}</p>
                </div>
            </div>
        );
    }

    // ─── Form ──
    return (
        <div style={styles.page}>
            <div style={styles.card}>
                {data.companyLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.companyLogo} alt={data.companyName} style={styles.logo} />
                )}
                <h1 style={styles.heading}>Yolculuğunuzu Değerlendirin</h1>
                <p style={styles.subheading}>
                    Sayın <strong>{data.customerName}</strong>, şoförümüz <strong>{data.driverName}</strong> hakkındaki düşünceleriniz bizim için çok değerli.
                </p>
                <div style={styles.bookingTag}>PNR: {data.bookingNumber}</div>

                <div style={styles.questionsList}>
                    {data.questions.map((q, idx) => (
                        <div key={q.id} style={styles.questionBlock}>
                            <div style={styles.questionText}>
                                <span style={styles.questionNum}>{idx + 1}.</span> {q.text}
                            </div>
                            <div style={styles.starsRow}>
                                {[1, 2, 3, 4, 5].map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStars(q.id, s)}
                                        style={{
                                            ...styles.starBtn,
                                            color: (answers[q.id] || 0) >= s ? '#f59e0b' : '#e5e7eb',
                                            transform: (answers[q.id] || 0) >= s ? 'scale(1.05)' : 'scale(1)',
                                        }}
                                        aria-label={`${s} yıldız`}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={styles.commentBlock}>
                    <label style={styles.commentLabel}>Yorumunuz (opsiyonel)</label>
                    <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Deneyiminizi kısaca paylaşın…"
                        rows={4}
                        maxLength={500}
                        style={styles.textarea}
                    />
                </div>

                {error && <div style={styles.errorBox}>{error}</div>}

                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{
                        ...styles.submitBtn,
                        opacity: submitting ? 0.7 : 1,
                    }}
                >
                    {submitting ? 'Gönderiliyor…' : 'Değerlendirmeyi Gönder'}
                </button>

                <p style={styles.companyFooter}>— {data.companyName}</p>
            </div>
        </div>
    );
}

// ─── Styles ──
const styles: Record<string, React.CSSProperties> = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 50%, #6366f1 100%)',
        padding: '20px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
        background: '#ffffff',
        width: '100%',
        maxWidth: 540,
        borderRadius: 24,
        padding: '36px 28px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        textAlign: 'center',
    },
    logo: {
        maxWidth: 120,
        maxHeight: 60,
        objectFit: 'contain',
        marginBottom: 16,
    },
    heading: {
        fontSize: 26,
        fontWeight: 800,
        color: '#0f172a',
        margin: '0 0 12px 0',
    },
    subheading: {
        fontSize: 15,
        color: '#475569',
        lineHeight: 1.5,
        margin: '0 0 14px 0',
    },
    bookingTag: {
        display: 'inline-block',
        padding: '4px 12px',
        background: '#eef2ff',
        color: '#4338ca',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.4,
        marginBottom: 20,
    },
    questionsList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        textAlign: 'left',
        margin: '20px 0 24px 0',
    },
    questionBlock: {
        background: '#f8fafc',
        padding: '16px 18px',
        borderRadius: 14,
        border: '1px solid #e2e8f0',
    },
    questionText: {
        fontSize: 15,
        fontWeight: 600,
        color: '#0f172a',
        marginBottom: 12,
        lineHeight: 1.4,
    },
    questionNum: {
        color: '#6366f1',
        fontWeight: 800,
        marginRight: 4,
    },
    starsRow: {
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
    },
    starBtn: {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 38,
        lineHeight: 1,
        padding: 4,
        transition: 'transform 0.15s ease, color 0.15s ease',
    },
    commentBlock: {
        textAlign: 'left',
        marginBottom: 20,
    },
    commentLabel: {
        display: 'block',
        fontSize: 13,
        fontWeight: 700,
        color: '#475569',
        marginBottom: 8,
    },
    textarea: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        border: '1.5px solid #e2e8f0',
        fontSize: 14,
        fontFamily: 'inherit',
        resize: 'vertical',
        outline: 'none',
        boxSizing: 'border-box',
    },
    submitBtn: {
        width: '100%',
        height: 54,
        borderRadius: 14,
        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 10px 25px -5px rgba(99,102,241,0.5)',
    },
    errorBox: {
        background: '#fef2f2',
        color: '#b91c1c',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 13,
        marginBottom: 14,
        textAlign: 'left',
    },
    bigEmoji: { fontSize: 64, marginBottom: 12 },
    bigRating: {
        margin: '20px 0',
    },
    title: { fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0' },
    muted: { color: '#64748b', fontSize: 14, lineHeight: 1.5, margin: 0 },
    companyFooter: {
        marginTop: 28,
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 500,
    },
    spinner: {
        width: 40,
        height: 40,
        margin: '20px auto',
        border: '4px solid #e2e8f0',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
};
