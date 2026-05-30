import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlogShell from '@/app/components/BlogShell';
import {
    getBlogPosts,
    getBlogPostBySlug,
    getTenantData,
    getSiteUrl,
    buildAbsoluteUrl,
    buildBreadcrumbJsonLd,
    buildArticleJsonLd,
    estimateReadingTime,
} from '@/lib/seo';

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
    const posts = await getBlogPosts();
    return posts.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
    const { slug } = await params;
    const post = await getBlogPostBySlug(slug);
    if (!post) return { title: 'Yazı Bulunamadı', robots: { index: false } };
    const { branding, seo } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallback = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const canonical = `${siteUrl}/blog/${slug}`;
    const ogImage = buildAbsoluteUrl(post.coverImage || seo.ogImage || branding.logoUrl, siteUrl);
    const description = post.excerpt || (post.content ? post.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 160) : `${post.title} — ${fullName} Blog`);

    return {
        title: post.title,
        description,
        keywords: (post.keywords && post.keywords.length > 0) ? post.keywords : (post.tags || []),
        alternates: { canonical },
        openGraph: {
            type: 'article',
            url: canonical,
            siteName: fullName,
            title: post.title,
            description,
            images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: post.title }] : [],
            publishedTime: post.publishedAt,
            modifiedTime: post.updatedAt || post.publishedAt,
            authors: post.author?.name ? [post.author.name] : undefined,
            tags: post.tags,
        },
        twitter: {
            card: 'summary_large_image',
            title: post.title,
            description,
            images: ogImage ? [ogImage] : [],
        },
    };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
    const { slug } = await params;
    const post = await getBlogPostBySlug(slug);
    if (!post) notFound();

    const { branding, seo } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallback = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const logoAbs = buildAbsoluteUrl(branding.logoUrl, siteUrl);
    const cover = buildAbsoluteUrl(post.coverImage, siteUrl);

    const readingTime = post.readingTime || estimateReadingTime(post.content || '');

    const articleLd = buildArticleJsonLd({ siteUrl, post, providerName: fullName, providerLogo: logoAbs });
    const breadcrumb = buildBreadcrumbJsonLd([
        { name: 'Ana Sayfa', url: `${siteUrl}/` },
        { name: 'Blog', url: `${siteUrl}/blog` },
        ...(post.category ? [{ name: post.category, url: `${siteUrl}/blog?kategori=${encodeURIComponent(post.category)}` }] : []),
        { name: post.title, url: `${siteUrl}/blog/${post.slug}` },
    ]);

    // Related posts (same category, excluding current)
    const allPosts = await getBlogPosts();
    const related = allPosts
        .filter(p => p.slug !== post.slug && (post.category ? p.category === post.category : true))
        .slice(0, 3);

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

            <BlogShell>
            <main style={{ minHeight: '100vh', background: '#fff', fontFamily: 'var(--font-outfit, system-ui, sans-serif)' }}>
                {/* Hero */}
                <section style={{
                    position: 'relative',
                    background: cover ? `url(${cover}) center/cover no-repeat` : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#fff',
                    overflow: 'hidden',
                    minHeight: 380,
                }}>
                    {cover && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,23,42,0.55), rgba(15,23,42,0.75))' }} />}
                    <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: 'clamp(80px, 12vw, 140px) 24px clamp(40px, 6vw, 70px)' }}>
                        <div style={{ marginBottom: 16, fontSize: 13 }}>
                            <Link href="/blog" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>← Tüm Yazılar</Link>
                        </div>
                        {post.category && (
                            <div style={{ display: 'inline-block', padding: '4px 14px', background: 'rgba(102,126,234,0.2)', border: '1px solid rgba(102,126,234,0.4)', color: '#a5b4fc', borderRadius: 100, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 16 }}>
                                {post.category}
                            </div>
                        )}
                        <h1 style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.8rem, 4.5vw, 3rem)', fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>
                            {post.title}
                        </h1>
                        {post.excerpt && (
                            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: 20 }}>{post.excerpt}</p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 14, color: 'rgba(255,255,255,0.7)', flexWrap: 'wrap' }}>
                            {post.author?.name && <span><strong style={{ color: '#fff' }}>{post.author.name}</strong></span>}
                            {post.publishedAt && !isNaN(new Date(post.publishedAt).getTime()) && <span>• {new Date(post.publishedAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                            <span>• {readingTime} dk okuma</span>
                        </div>
                    </div>
                </section>

                {/* Content */}
                <article style={{ maxWidth: 760, margin: '0 auto', padding: '50px 24px' }}>
                    <style>{`
                        .blog-content { font-size: 17px; line-height: 1.8; color: #1e293b; }
                        .blog-content h2 { font-family: var(--font-playfair, Georgia, serif); font-size: 1.7rem; font-weight: 700; margin: 40px 0 16px; color: #0f172a; }
                        .blog-content h3 { font-size: 1.3rem; font-weight: 700; margin: 32px 0 12px; color: #0f172a; }
                        .blog-content p { margin: 0 0 18px; }
                        .blog-content a { color: #667eea; text-decoration: underline; }
                        .blog-content a:hover { color: #4f46e5; }
                        .blog-content img { max-width: 100%; height: auto; border-radius: 12px; margin: 24px 0; }
                        .blog-content blockquote { border-left: 4px solid #667eea; padding: 8px 20px; margin: 24px 0; background: #f8fafc; color: #475569; font-style: italic; border-radius: 0 8px 8px 0; }
                        .blog-content ul, .blog-content ol { padding-left: 28px; margin: 0 0 18px; }
                        .blog-content li { margin-bottom: 8px; }
                        .blog-content code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
                        .blog-content pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 18px 0; }
                        .blog-content table { width: 100%; border-collapse: collapse; margin: 18px 0; }
                        .blog-content th, .blog-content td { padding: 10px; border: 1px solid #e2e8f0; text-align: left; }
                        .blog-content th { background: #f8fafc; font-weight: 700; }
                    `}</style>
                    <div className="blog-content" dangerouslySetInnerHTML={{ __html: post.content || '' }} />

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Etiketler</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {post.tags.map(t => (
                                    <span key={t} style={{ padding: '6px 12px', background: '#f1f5f9', borderRadius: 100, fontSize: 13, color: '#475569' }}>#{t}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Author bio (if name + image) */}
                    {post.author?.name && (
                        <div style={{ marginTop: 40, padding: 24, background: '#f8fafc', borderRadius: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                            {post.author.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={buildAbsoluteUrl(post.author.image, siteUrl) || post.author.image} alt={post.author.name} width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            )}
                            <div>
                                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Yazar</div>
                                <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{post.author.name}</div>
                            </div>
                        </div>
                    )}
                </article>

                {/* Related posts */}
                {related.length > 0 && (
                    <section style={{ background: '#f8fafc', padding: '60px 24px', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                            <h2 style={{ textAlign: 'center', fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 700, color: '#0f172a', marginBottom: 32 }}>İlgili Yazılar</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                                {related.map(r => (
                                    <Link key={r.slug} href={`/blog/${r.slug}`} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', textDecoration: 'none', color: '#0f172a', display: 'block' }}>
                                        {r.coverImage && (
                                            <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden' }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={buildAbsoluteUrl(r.coverImage, siteUrl) || r.coverImage} alt={r.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                            </div>
                                        )}
                                        <div style={{ padding: 18 }}>
                                            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, marginBottom: 6 }}>{r.title}</div>
                                            {r.excerpt && <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{r.excerpt.slice(0, 90)}…</div>}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </section>
                )}
            </main>
            </BlogShell>
        </>
    );
}
