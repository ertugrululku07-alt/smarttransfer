import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

function resolveServerApiUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'development') return 'http://localhost:4000';
    return '';
}

async function getSiteUrl(): Promise<string> {
    const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
    if (envUrl) return envUrl;
    try {
        const h = await headers();
        const host = h.get('x-forwarded-host') || h.get('host');
        const proto = h.get('x-forwarded-proto') || (host && !host.includes('localhost') ? 'https' : 'http');
        if (host) return `${proto}://${host}`.replace(/\/$/, '');
    } catch {}
    return 'http://localhost:3000';
}

async function getTenantData() {
    try {
        const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();
        const apiUrl = resolveServerApiUrl();
        if (!apiUrl) return null;
        const res = await fetch(`${apiUrl}/api/tenant/info`, {
            headers: { 'X-Tenant-Slug': TENANT_SLUG },
            next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.data?.tenant || null;
    } catch {
        return null;
    }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const tenant = await getTenantData();
    const seo = tenant?.settings?.seo || {};
    const fallback = await getSiteUrl();
    const baseUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const now = new Date();

    // Supported languages (tr is the default with no URL prefix; others use /{lang}/).
    const supportedLanguages: string[] = Array.isArray(tenant?.supportedLanguages)
        ? tenant.supportedLanguages
        : ['tr'];

    // Build hreflang alternates for a given path so Google indexes every language version.
    const buildAlternates = (path: string) => {
        const cleanPath = path === '/' ? '' : path;
        const languages: Record<string, string> = {};
        for (const lang of supportedLanguages) {
            languages[lang] = lang === 'tr'
                ? `${baseUrl}${cleanPath || '/'}`
                : `${baseUrl}/${lang}${cleanPath}`;
        }
        // x-default points to the primary (Turkish) version
        languages['x-default'] = `${baseUrl}${cleanPath || '/'}`;
        return { languages };
    };

    // Attach hreflang alternates to a sitemap entry (keeps the default url as the TR version).
    const withAlternates = (entry: MetadataRoute.Sitemap[number]): MetadataRoute.Sitemap[number] => {
        const path = entry.url.replace(baseUrl, '') || '/';
        return { ...entry, alternates: buildAlternates(path) };
    };

    // Core public routes
    const coreRoutes: MetadataRoute.Sitemap = [
        {
            url: `${baseUrl}/`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/track`,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/transfer/book`,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 0.9,
        },
    ];

    // Custom pages (admin-defined dynamic pages under /sayfa/[slug])
    const customPages: MetadataRoute.Sitemap = [];
    try {
        const apiUrl = resolveServerApiUrl();
        if (apiUrl) {
            const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();
            const res = await fetch(`${apiUrl}/api/tenant/menu-pages`, {
                headers: { 'X-Tenant-Slug': TENANT_SLUG },
                next: { revalidate: 300 },
            });
            if (res.ok) {
                const data = await res.json();
                const pages: any[] = data?.data || data?.pages || [];
                for (const p of pages) {
                    if (!p?.slug) continue;
                    customPages.push({
                        url: `${baseUrl}/sayfa/${p.slug}`,
                        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
                        changeFrequency: 'monthly',
                        priority: 0.6,
                    });
                }
            }
        }
    } catch {
        // ignore
    }

    // Blog index + posts
    const blogEntries: MetadataRoute.Sitemap = [];
    const blogPosts = Array.isArray((seo as any).blog?.posts) ? (seo as any).blog.posts : [];
    const publishedPosts = blogPosts.filter((p: any) => p?.slug && p?.status !== 'draft');
    if (publishedPosts.length > 0) {
        blogEntries.push({
            url: `${baseUrl}/blog`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.8,
        });
        for (const p of publishedPosts) {
            blogEntries.push({
                url: `${baseUrl}/blog/${p.slug}`,
                lastModified: p.updatedAt ? new Date(p.updatedAt) : (p.publishedAt ? new Date(p.publishedAt) : now),
                changeFrequency: 'weekly',
                priority: 0.7,
            });
        }
    }

    // Landing pages (admin-managed transfer location pages)
    const landingPages: MetadataRoute.Sitemap = [];
    if (Array.isArray((seo as any).landingPages)) {
        for (const lp of (seo as any).landingPages) {
            if (!lp?.slug) continue;
            landingPages.push({
                url: `${baseUrl}/transfer/${lp.slug}`,
                lastModified: lp.updatedAt ? new Date(lp.updatedAt) : now,
                changeFrequency: 'weekly',
                priority: 0.85,
            });
        }
    }

    // SEO-defined extra URLs (other custom URLs)
    const extraUrls: MetadataRoute.Sitemap = [];
    if (Array.isArray(seo.extraUrls)) {
        for (const u of seo.extraUrls) {
            if (typeof u === 'string' && u.trim()) {
                extraUrls.push({
                    url: u.startsWith('http') ? u : `${baseUrl}${u.startsWith('/') ? u : '/' + u}`,
                    lastModified: now,
                    changeFrequency: 'monthly',
                    priority: 0.7,
                });
            } else if (u && typeof u === 'object' && u.url) {
                extraUrls.push({
                    url: u.url.startsWith('http') ? u.url : `${baseUrl}${u.url.startsWith('/') ? u.url : '/' + u.url}`,
                    lastModified: u.lastModified ? new Date(u.lastModified) : now,
                    changeFrequency: u.changeFrequency || 'monthly',
                    priority: typeof u.priority === 'number' ? u.priority : 0.7,
                });
            }
        }
    }

    return [...coreRoutes, ...blogEntries, ...landingPages, ...customPages, ...extraUrls].map(withAlternates);
}
