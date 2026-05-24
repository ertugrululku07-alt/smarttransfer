import type { Metadata } from 'next';
import { headers } from 'next/headers';

/**
 * SEO Helper — Server-side utilities for per-page metadata generation
 * Reads tenant settings and produces fully-formed Next.js Metadata objects.
 */

export interface PageSeo {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImage?: string;
    canonical?: string;
    noindex?: boolean;
}

export interface TenantSeoSettings {
    siteUrl?: string;
    defaultTitle?: string;
    titleTemplate?: string;
    defaultDescription?: string;
    keywords?: string[];
    ogImage?: string;
    locale?: string;
    twitterHandle?: string;
    googleSiteVerification?: string;
    bingSiteVerification?: string;
    yandexVerification?: string;
    facebookAppId?: string;
    indexingEnabled?: boolean;
    gtmId?: string;
    gaId?: string;
    extraUrls?: any[];
    pages?: Record<string, PageSeo>;
    languages?: string[];
}

export interface TenantBranding {
    companyName?: string;
    siteNameHighlight?: string;
    siteName?: string;
    slogan?: string;
    email?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
}

export interface TenantData {
    branding: TenantBranding;
    seo: TenantSeoSettings;
    socialMedia?: Record<string, string>;
    customTheme?: { primaryColor?: string };
    homepageFaq?: Array<{ question: string; answer: string }>;
    homepageStats?: any;
    homepageTestimonials?: Array<{ name?: string; rating?: number; comment?: string }>;
    homepageRoutes?: any[];
    branding_logoUrl?: string;
}

function resolveServerApiUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'development') return 'http://localhost:4000';
    return '';
}

export async function getSiteUrl(): Promise<string> {
    const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
    if (envUrl) return envUrl;
    try {
        const h = await headers();
        const host = h.get('x-forwarded-host') || h.get('host');
        const proto = h.get('x-forwarded-proto') || (host && !host.includes('localhost') ? 'https' : 'http');
        if (host) return `${proto}://${host}`.replace(/\/$/, '');
    } catch { /* noop */ }
    return 'http://localhost:3000';
}

let _tenantCache: { data: TenantData; ts: number } | null = null;
const TENANT_CACHE_TTL = 60 * 1000; // 60s

export async function getTenantData(): Promise<TenantData> {
    const fallback: TenantData = {
        branding: {
            companyName: 'SmartTravel Platform',
            siteNameHighlight: 'Smart',
            siteName: 'Travel',
            slogan: "Türkiye'nin en güvenilir transfer platformu",
            email: 'info@smarttravel.com',
            phone: '+90-212-XXX-XXXX',
            logoUrl: '',
        },
        seo: {},
    };

    if (_tenantCache && Date.now() - _tenantCache.ts < TENANT_CACHE_TTL) {
        return _tenantCache.data;
    }

    try {
        const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();
        const apiUrl = resolveServerApiUrl();
        if (!apiUrl) return fallback;
        const res = await fetch(`${apiUrl}/api/tenant/info`, {
            headers: { 'X-Tenant-Slug': TENANT_SLUG },
            next: { revalidate: 60 },
        });
        if (!res.ok) return fallback;
        const data = await res.json();
        const settings = data?.data?.tenant?.settings || {};
        const result: TenantData = {
            branding: { ...fallback.branding, ...(settings.branding || {}) },
            seo: settings.seo || {},
            socialMedia: settings.socialMedia || {},
            customTheme: settings.customTheme || {},
            homepageFaq: Array.isArray(settings.homepageFaq) ? settings.homepageFaq : [],
            homepageStats: settings.homepageStats || null,
            homepageTestimonials: Array.isArray(settings.homepageTestimonials) ? settings.homepageTestimonials : [],
            homepageRoutes: Array.isArray(settings.homepageRoutes) ? settings.homepageRoutes : [],
        };
        _tenantCache = { data: result, ts: Date.now() };
        return result;
    } catch {
        return fallback;
    }
}

export function buildAbsoluteUrl(url: string | undefined, baseUrl: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    return `${baseUrl}/${url}`;
}

interface BuildMetadataOptions {
    pageKey: string;
    pathname: string;
    fallbackTitle?: string;
    fallbackDescription?: string;
    fallbackKeywords?: string[];
}

export async function buildPageMetadata(opts: BuildMetadataOptions): Promise<Metadata> {
    const { branding, seo } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallbackUrl = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallbackUrl).replace(/\/$/, '');

    // Per-page overrides
    const pageSeo: PageSeo = (seo.pages && seo.pages[opts.pageKey]) || {};

    const title = pageSeo.title || opts.fallbackTitle || seo.defaultTitle || `${fullName} | ${branding.slogan || 'Premium Transfer'}`;
    const description = pageSeo.description || opts.fallbackDescription || seo.defaultDescription || branding.slogan || `${fullName} ile premium transfer hizmeti.`;

    const keywords = (pageSeo.keywords && pageSeo.keywords.length > 0)
        ? pageSeo.keywords
        : (opts.fallbackKeywords && opts.fallbackKeywords.length > 0)
            ? opts.fallbackKeywords
            : seo.keywords || [];

    const ogImage = buildAbsoluteUrl(pageSeo.ogImage || seo.ogImage || branding.logoUrl, siteUrl);
    const canonical = pageSeo.canonical || `${siteUrl}${opts.pathname}`;
    const indexingEnabled = (seo.indexingEnabled !== false) && !pageSeo.noindex;

    // Hreflang languages
    const languages: Record<string, string> = {};
    if (Array.isArray(seo.languages)) {
        for (const lang of seo.languages) {
            if (typeof lang === 'string' && lang.trim()) {
                languages[lang] = `${siteUrl}${opts.pathname}?lang=${lang.split(/[-_]/)[0]}`;
            }
        }
    }

    return {
        title,
        description,
        keywords,
        alternates: {
            canonical,
            languages: Object.keys(languages).length > 0 ? languages : undefined,
        },
        openGraph: {
            type: 'website',
            locale: seo.locale || 'tr_TR',
            url: canonical,
            siteName: fullName,
            title,
            description,
            images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: title }] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: ogImage ? [ogImage] : [],
            site: seo.twitterHandle || undefined,
            creator: seo.twitterHandle || undefined,
        },
        robots: indexingEnabled ? {
            index: true, follow: true,
            googleBot: {
                index: true, follow: true,
                'max-image-preview': 'large',
                'max-snippet': -1,
                'max-video-preview': -1,
            },
        } : { index: false, follow: false },
    };
}

/**
 * Build BreadcrumbList JSON-LD for inner pages
 */
export function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: item.name,
            item: item.url,
        })),
    };
}

/**
 * Build FAQPage JSON-LD from homepage FAQ items
 */
export function buildFaqJsonLd(faqs: Array<{ question: string; answer: string }>) {
    if (!faqs || faqs.length === 0) return null;
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(f => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
    };
}

/**
 * Build Service JSON-LD for transfer service
 */
export function buildServiceJsonLd(opts: {
    siteUrl: string;
    name: string;
    description: string;
    provider: { name: string; logo?: string };
    areaServed?: string;
    image?: string;
    priceRange?: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'TaxiService',
        name: opts.name,
        description: opts.description,
        url: opts.siteUrl,
        image: opts.image,
        provider: {
            '@type': 'Organization',
            name: opts.provider.name,
            logo: opts.provider.logo,
        },
        areaServed: opts.areaServed || 'TR',
        serviceType: ['Havalimanı Transferi', 'Otel Transferi', 'Şehirler Arası Transfer', 'VIP Transfer'],
        priceRange: opts.priceRange || '₺₺',
    };
}

/**
 * Build AggregateRating JSON-LD from testimonials
 */
export function buildAggregateRatingJsonLd(testimonials: Array<{ rating?: number }>) {
    if (!testimonials || testimonials.length === 0) return null;
    const ratings = testimonials.filter(t => typeof t.rating === 'number' && t.rating! > 0).map(t => t.rating!);
    if (ratings.length === 0) return null;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    return {
        '@type': 'AggregateRating',
        ratingValue: avg.toFixed(1),
        reviewCount: ratings.length,
        bestRating: 5,
        worstRating: 1,
    };
}
