import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantData, getSiteUrl } from '@/lib/seo';

export const metadata: Metadata = {
    title: 'Sayfa Bulunamadı (404)',
    description: 'Aradığınız sayfa bulunamadı. Ana sayfaya dönerek transfer rezervasyonunuzu tamamlayabilirsiniz.',
    robots: { index: false, follow: true },
};

export default async function NotFound() {
    const { branding } = await getTenantData();
    const siteUrl = await getSiteUrl();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
            color: '#fff',
            fontFamily: 'var(--font-outfit, system-ui, -apple-system, sans-serif)',
            padding: '40px 20px',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Decorative orbs */}
            <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, var(--brand-primary-40) 0%, transparent 70%)', filter: 'blur(60px)' }} />
            <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(118,75,162,0.4) 0%, transparent 70%)', filter: 'blur(80px)' }} />

            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 600 }}>
                <div style={{
                    fontSize: 'clamp(6rem, 18vw, 11rem)',
                    fontWeight: 800,
                    lineHeight: 1,
                    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontFamily: 'var(--font-playfair, Georgia, serif)',
                    marginBottom: 16,
                }}>
                    404
                </div>
                <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 700, marginBottom: 16, fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
                    Aradığınız Sayfa Bulunamadı
                </h1>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)', marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
                    Bu sayfa kaldırılmış, taşınmış ya da hiç var olmamış olabilir.
                    {fullName} ana sayfasına dönerek rezervasyonunuzu tamamlayabilirsiniz.
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link
                        href="/"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '14px 32px',
                            background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 100%)',
                            color: '#fff',
                            borderRadius: 12,
                            fontWeight: 600,
                            textDecoration: 'none',
                            boxShadow: '0 8px 24px var(--brand-primary-40)',
                            transition: 'transform 0.2s ease',
                        }}
                    >
                        🏠 Ana Sayfaya Dön
                    </Link>
                    <Link
                        href="/track"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '14px 32px',
                            background: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            borderRadius: 12,
                            fontWeight: 600,
                            textDecoration: 'none',
                            border: '1px solid rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            transition: 'background 0.2s ease',
                        }}
                    >
                        🔍 Rezervasyon Sorgula
                    </Link>
                    <Link
                        href="/contact"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '14px 32px',
                            background: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            borderRadius: 12,
                            fontWeight: 600,
                            textDecoration: 'none',
                            border: '1px solid rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            transition: 'background 0.2s ease',
                        }}
                    >
                        ✉️ İletişime Geç
                    </Link>
                </div>

                <div style={{ marginTop: 48, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                    <a href={siteUrl} style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{siteUrl.replace(/^https?:\/\//, '')}</a>
                </div>
            </div>
        </div>
    );
}
