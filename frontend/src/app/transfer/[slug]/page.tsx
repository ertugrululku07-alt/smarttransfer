import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
    getLandingPageBySlug,
    getLandingPages,
    getTenantData,
    getSiteUrl,
    buildAbsoluteUrl,
    buildFaqJsonLd,
    buildBreadcrumbJsonLd,
    buildRouteServiceJsonLd,
} from '@/lib/seo';

type Params = { slug: string };

// Static params for build-time pre-rendering
export async function generateStaticParams(): Promise<Params[]> {
    const pages = await getLandingPages();
    return pages.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
    const { slug } = await params;
    const page = await getLandingPageBySlug(slug);
    if (!page) return { title: 'Sayfa Bulunamadı', robots: { index: false, follow: false } };
    const { branding, seo } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallback = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const canonical = `${siteUrl}/transfer/${slug}`;
    const description = page.description || page.intro?.slice(0, 160) || `${page.title} — ${fullName}`;
    const ogImage = buildAbsoluteUrl(page.heroImage || seo.ogImage || branding.logoUrl, siteUrl);

    return {
        title: page.title,
        description,
        keywords: page.keywords && page.keywords.length > 0 ? page.keywords : seo.keywords,
        alternates: { canonical },
        openGraph: {
            type: 'website',
            url: canonical,
            siteName: fullName,
            title: page.title,
            description,
            images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: page.title }] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: page.title,
            description,
            images: ogImage ? [ogImage] : [],
        },
    };
}

export default async function LandingPage({ params }: { params: Promise<Params> }) {
    const { slug } = await params;
    const page = await getLandingPageBySlug(slug);
    if (!page) notFound();

    const { branding, seo } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallback = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const heroImg = page.heroImage ? (page.heroImage.startsWith('http') ? page.heroImage : `${siteUrl}${page.heroImage.startsWith('/') ? page.heroImage : '/' + page.heroImage}`) : null;

    // JSON-LD
    const breadcrumb = buildBreadcrumbJsonLd([
        { name: 'Ana Sayfa', url: `${siteUrl}/` },
        { name: 'Transfer', url: `${siteUrl}/transfer/book` },
        { name: page.title, url: `${siteUrl}/transfer/${slug}` },
    ]);
    const faqLd = buildFaqJsonLd(page.faq || []);
    const routeServices = (page.relatedRoutes || []).map(r => buildRouteServiceJsonLd({
        siteUrl,
        fromName: r.from,
        toName: r.to,
        price: r.price,
        currency: 'EUR',
        providerName: fullName,
        providerLogo: buildAbsoluteUrl(branding.logoUrl, siteUrl),
    }));

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
            {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
            {routeServices.map((rs, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(rs) }} />
            ))}

            <main style={{ minHeight: '100vh', background: '#fff', fontFamily: 'var(--font-outfit, system-ui, sans-serif)' }}>
                {/* Hero */}
                <section style={{
                    position: 'relative',
                    background: heroImg ? `url(${heroImg}) center/cover` : 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
                    color: '#fff',
                    overflow: 'hidden',
                }}>
                    {heroImg && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,23,42,0.72), rgba(15,23,42,0.55))' }} />}
                    <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: 'clamp(80px, 12vw, 140px) 24px clamp(60px, 9vw, 100px)', textAlign: 'center' }}>
                        <h1 style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, margin: '0 0 16px', lineHeight: 1.2 }}>
                            {page.h1 || page.title}
                        </h1>
                        {page.intro && (
                            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7, maxWidth: 720, margin: '0 auto 32px' }}>
                                {page.intro}
                            </p>
                        )}
                        {page.cta && (
                            <Link href={page.cta.link || '/transfer/book'} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '14px 36px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: '#fff', borderRadius: 12, fontWeight: 600,
                                textDecoration: 'none', boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
                                fontSize: 16,
                            }}>
                                {page.cta.text || 'Rezervasyon Yap'} →
                            </Link>
                        )}
                    </div>
                </section>

                {/* Sections */}
                {Array.isArray(page.sections) && page.sections.length > 0 && (
                    <section style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px' }}>
                        {page.sections.map((s, i) => (
                            <div key={i} style={{ marginBottom: 40 }}>
                                <h2 style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                                    {s.heading}
                                </h2>
                                <div style={{ fontSize: 16, lineHeight: 1.8, color: '#475569', whiteSpace: 'pre-wrap' }}>
                                    {s.body}
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {/* Related Routes */}
                {Array.isArray(page.relatedRoutes) && page.relatedRoutes.length > 0 && (
                    <section style={{ background: '#f8fafc', padding: '60px 24px' }}>
                        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                            <h2 style={{ textAlign: 'center', fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: '#0f172a', marginBottom: 32 }}>
                                Popüler Rotalar
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                                {page.relatedRoutes.map((r, i) => (
                                    <Link key={i} href={r.link || '/transfer/book'} style={{
                                        display: 'block', padding: 24, background: '#fff',
                                        borderRadius: 16, border: '1px solid #e2e8f0',
                                        textDecoration: 'none', color: '#0f172a',
                                        transition: 'transform 0.2s ease, border-color 0.2s ease',
                                    }}>
                                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Transfer</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{r.from} → {r.to}</div>
                                        {r.price && <div style={{ fontSize: 15, color: '#667eea', fontWeight: 600 }}>{r.price} EUR'dan başlayan</div>}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {/* FAQ */}
                {Array.isArray(page.faq) && page.faq.length > 0 && (
                    <section style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px' }}>
                        <h2 style={{ textAlign: 'center', fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: '#0f172a', marginBottom: 32 }}>
                            Sıkça Sorulan Sorular
                        </h2>
                        <div>
                            {page.faq.map((f, i) => (
                                <details key={i} style={{ marginBottom: 12, padding: '20px 24px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                    <summary style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>{f.question}</summary>
                                    <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.7, color: '#475569' }}>{f.answer}</div>
                                </details>
                            ))}
                        </div>
                    </section>
                )}

                {/* Footer CTA */}
                <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', padding: '60px 24px', textAlign: 'center' }}>
                    <h2 style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 700, marginBottom: 16 }}>
                        Hemen Rezervasyon Yapın
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 28, fontSize: 16 }}>
                        Online anında onay, esnek ödeme, 7/24 müşteri hizmetleri
                    </p>
                    <Link href="/transfer/book" style={{
                        display: 'inline-flex', padding: '14px 36px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff', borderRadius: 12, fontWeight: 600,
                        textDecoration: 'none', boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
                        fontSize: 16,
                    }}>
                        Transfer Rezervasyonu Yap →
                    </Link>
                </section>
            </main>
        </>
    );
}
