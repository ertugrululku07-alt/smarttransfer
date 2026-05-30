import type { Metadata } from 'next';
import Link from 'next/link';
import BlogShell from '@/app/components/BlogShell';
import { getImageUrl } from '@/lib/api-client';
import {
    getBlogPosts,
    getBlogCategories,
    getBlogHeroImage,
    getTenantData,
    getSiteUrl,
    buildAbsoluteUrl,
    buildBreadcrumbJsonLd,
    buildPageMetadata,
} from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'blog',
        pathname: '/blog',
        fallbackTitle: 'Blog — Transfer & Seyahat Rehberi',
        fallbackDescription: 'Havalimanı transferi, şehir gezisi rehberleri, seyahat ipuçları ve transfer hizmetlerine dair bilmeniz gerekenler.',
        fallbackKeywords: [
            'transfer blog', 'seyahat rehberi', 'havalimanı transfer rehberi',
            'şehir rehberi', 'turizm blog', 'transfer ipuçları',
        ],
    });
}

export default async function BlogListPage({ searchParams }: { searchParams: Promise<{ kategori?: string; sayfa?: string }> }) {
    const { kategori, sayfa } = await searchParams;
    const posts = await getBlogPosts();
    const categories = await getBlogCategories();
    const { branding, seo } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallback = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const heroImage = await getBlogHeroImage();
    const heroUrl = getImageUrl(heroImage);

    const filtered = kategori ? posts.filter(p => p.category === kategori) : posts;
    const pageNum = Math.max(1, parseInt(sayfa || '1', 10));
    const pageSize = 9;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPagePosts = filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    const breadcrumb = buildBreadcrumbJsonLd([
        { name: 'Ana Sayfa', url: `${siteUrl}/` },
        { name: 'Blog', url: `${siteUrl}/blog` },
        ...(kategori ? [{ name: kategori, url: `${siteUrl}/blog?kategori=${encodeURIComponent(kategori)}` }] : []),
    ]);

    // CollectionPage / Blog JSON-LD
    const blogLd = {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: `${fullName} Blog`,
        url: `${siteUrl}/blog`,
        publisher: {
            '@type': 'Organization',
            name: fullName,
            logo: buildAbsoluteUrl(branding.logoUrl, siteUrl),
        },
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }} />

            <BlogShell>
            <main style={{ minHeight: '100vh', background: '#fff', fontFamily: 'var(--font-outfit, system-ui, sans-serif)' }}>
                {/* Hero */}
                <section style={{
                    position: 'relative',
                    background: heroUrl
                        ? `url(${heroUrl}) center/cover no-repeat`
                        : 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
                    color: '#fff',
                    padding: 'clamp(50px, 8vw, 90px) 24px clamp(50px, 6vw, 80px)',
                    textAlign: 'center',
                    overflow: 'hidden',
                }}>
                    {heroUrl && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(15,23,42,0.7), rgba(30,41,59,0.6))' }} />}
                    <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
                        <h1 style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, marginBottom: 16 }}>
                            {kategori ? `${kategori}` : 'Blog'}
                        </h1>
                        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                            Transfer, seyahat ve şehir rehberleri
                        </p>
                    </div>
                </section>

                {/* Categories */}
                {categories.length > 0 && (
                    <section style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '16px 0', position: 'sticky', top: 72, zIndex: 10 }}>
                        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'center' }}>
                            <Link href="/blog" style={{
                                padding: '6px 16px', borderRadius: 100,
                                background: !kategori ? '#0f172a' : 'transparent',
                                color: !kategori ? '#fff' : '#475569',
                                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                                whiteSpace: 'nowrap', flexShrink: 0,
                            }}>Tümü</Link>
                            {categories.map(c => (
                                <Link key={c} href={`/blog?kategori=${encodeURIComponent(c)}`} style={{
                                    padding: '6px 16px', borderRadius: 100,
                                    background: kategori === c ? '#0f172a' : 'transparent',
                                    color: kategori === c ? '#fff' : '#475569',
                                    fontSize: 14, fontWeight: 500, textDecoration: 'none',
                                    whiteSpace: 'nowrap', flexShrink: 0,
                                }}>{c}</Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* Posts grid */}
                <section style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 24px' }}>
                    {currentPagePosts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
                            <h2 style={{ color: '#475569', fontSize: 20, marginBottom: 8 }}>Henüz yazı yok</h2>
                            <p style={{ fontSize: 14 }}>Yakında ilk içerikleri paylaşacağız.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
                            {currentPagePosts.map((p, idx) => {
                                const cover = getImageUrl(p.coverImage);
                                return (
                                    <article key={p.slug} style={{
                                        background: '#fff', borderRadius: 16, overflow: 'hidden',
                                        border: '1px solid #e2e8f0', transition: 'transform 0.2s, box-shadow 0.2s',
                                        display: 'flex', flexDirection: 'column',
                                    }}>
                                        <Link href={`/blog/${p.slug}`} style={{ display: 'block', position: 'relative', aspectRatio: '16 / 9', background: '#f1f5f9', overflow: 'hidden' }}>
                                            {cover ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={cover}
                                                    alt={p.title}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                    loading={idx < 3 ? 'eager' : 'lazy'}
                                                />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 48 }}>📄</div>
                                            )}
                                        </Link>
                                        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            {p.category && (
                                                <Link href={`/blog?kategori=${encodeURIComponent(p.category)}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, textDecoration: 'none' }}>
                                                    {p.category}
                                                </Link>
                                            )}
                                            <h2 style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', marginBottom: 8, lineHeight: 1.35, fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
                                                <Link href={`/blog/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.title}</Link>
                                            </h2>
                                            {p.excerpt && (
                                                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 16, flex: 1 }}>{p.excerpt.slice(0, 140)}{p.excerpt.length > 140 ? '…' : ''}</p>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 'auto' }}>
                                                {p.author?.name && <span>{p.author.name}</span>}
                                                {p.publishedAt && !isNaN(new Date(p.publishedAt).getTime()) && <span>• {new Date(p.publishedAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                                                {p.readingTime && <span>• {p.readingTime} dk okuma</span>}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 48 }}>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                                <Link
                                    key={n}
                                    href={`/blog?${kategori ? `kategori=${encodeURIComponent(kategori)}&` : ''}sayfa=${n}`}
                                    style={{
                                        padding: '8px 14px', borderRadius: 8,
                                        background: n === pageNum ? '#0f172a' : '#fff',
                                        color: n === pageNum ? '#fff' : '#475569',
                                        border: '1px solid #e2e8f0',
                                        textDecoration: 'none', fontSize: 14, fontWeight: 500,
                                    }}
                                >{n}</Link>
                            ))}
                        </div>
                    )}
                </section>
            </main>
            </BlogShell>
        </>
    );
}
