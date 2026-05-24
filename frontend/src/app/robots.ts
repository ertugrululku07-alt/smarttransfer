import type { MetadataRoute } from 'next';

function resolveServerApiUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'development') return 'http://localhost:4000';
    return '';
}

function getSiteUrl(): string {
    const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
    if (envUrl) return envUrl;
    return 'http://localhost:3000';
}

async function getSeoSettings() {
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
        return data?.data?.tenant?.settings?.seo || null;
    } catch {
        return null;
    }
}

export default async function robots(): Promise<MetadataRoute.Robots> {
    const siteUrl = getSiteUrl();
    const seo = await getSeoSettings();
    const customSiteUrl = (seo?.siteUrl || siteUrl).replace(/\/$/, '');

    // SEO indexing toggle from admin
    const indexEnabled = seo?.indexingEnabled !== false; // default true

    if (!indexEnabled) {
        return {
            rules: [{ userAgent: '*', disallow: '/' }],
            sitemap: `${customSiteUrl}/sitemap.xml`,
            host: customSiteUrl,
        };
    }

    const disallowedPaths = [
        '/admin/',
        '/admin',
        '/api/',
        '/account/',
        '/agency/',
        '/driver/',
        '/partner/',
        '/login',
        '/register',
        '/register-driver',
        '/payment/',
        '/booking/',
        '/_next/',
        '/static/',
    ];

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: disallowedPaths,
            },
            {
                userAgent: 'Googlebot',
                allow: '/',
                disallow: disallowedPaths,
            },
            {
                userAgent: 'Bingbot',
                allow: '/',
                disallow: disallowedPaths,
            },
            {
                userAgent: 'Yandex',
                allow: '/',
                disallow: disallowedPaths,
            },
        ],
        sitemap: `${customSiteUrl}/sitemap.xml`,
        host: customSiteUrl,
    };
}
