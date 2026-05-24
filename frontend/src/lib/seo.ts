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
    contactPage?: {
        heroTitle?: string; heroSubtitle?: string; phone?: string; email?: string;
        address?: string; workingHours?: string[];
        branches?: Array<{ name?: string; badge?: string; address?: string; phone?: string; hours?: string; mapEmbedUrl?: string }>;
    };
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
            contactPage: settings.contactPage || {},
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

/**
 * Build individual Review JSON-LD entries
 */
export function buildReviewJsonLdArray(testimonials: Array<{ name?: string; rating?: number; comment?: string }>) {
    if (!testimonials || testimonials.length === 0) return [];
    return testimonials
        .filter(t => t.comment && t.rating && t.rating > 0)
        .slice(0, 10) // Cap at 10 reviews
        .map(t => ({
            '@type': 'Review',
            reviewBody: t.comment,
            reviewRating: {
                '@type': 'Rating',
                ratingValue: t.rating,
                bestRating: 5,
                worstRating: 1,
            },
            author: { '@type': 'Person', name: t.name || 'Anonim Müşteri' },
        }));
}

/**
 * Build LocalBusiness JSON-LD per branch
 */
export function buildLocalBusinessJsonLd(opts: {
    name: string;
    branch?: string;
    description?: string;
    url?: string;
    image?: string;
    telephone?: string;
    email?: string;
    address?: { street?: string; city?: string; country?: string };
    openingHours?: string;
    priceRange?: string;
}) {
    const ld: any = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        '@id': opts.url ? `${opts.url}#${(opts.branch || 'main').toLowerCase().replace(/\s+/g, '-')}` : undefined,
        name: opts.branch ? `${opts.name} — ${opts.branch}` : opts.name,
        description: opts.description,
        url: opts.url,
        image: opts.image,
        telephone: opts.telephone,
        email: opts.email,
        priceRange: opts.priceRange || '₺₺',
    };
    if (opts.address) {
        ld.address = {
            '@type': 'PostalAddress',
            streetAddress: opts.address.street,
            addressLocality: opts.address.city,
            addressCountry: opts.address.country || 'TR',
        };
    }
    if (opts.openingHours) {
        ld.openingHours = opts.openingHours;
    }
    return ld;
}

/**
 * Build Service JSON-LD per route (e.g. Istanbul Airport → Sultanahmet)
 */
export function buildRouteServiceJsonLd(opts: {
    siteUrl: string;
    fromName: string;
    toName: string;
    price?: number | string;
    currency?: string;
    image?: string;
    providerName: string;
    providerLogo?: string;
}) {
    const ld: any = {
        '@context': 'https://schema.org',
        '@type': 'TaxiService',
        name: `${opts.fromName} → ${opts.toName} Transfer`,
        description: `${opts.fromName} ile ${opts.toName} arası özel transfer hizmeti`,
        provider: {
            '@type': 'Organization',
            name: opts.providerName,
            logo: opts.providerLogo,
        },
        areaServed: 'TR',
        serviceType: 'Transfer',
        image: opts.image,
    };
    if (opts.price) {
        ld.offers = {
            '@type': 'Offer',
            price: opts.price,
            priceCurrency: opts.currency || 'EUR',
            availability: 'https://schema.org/InStock',
        };
    }
    return ld;
}

/**
 * Landing Page definition (admin-managed)
 */
export interface LandingPage {
    slug: string;
    title: string;
    h1?: string;
    intro?: string;
    heroImage?: string;
    keywords?: string[];
    description?: string;
    sections?: Array<{ heading: string; body: string }>;
    faq?: Array<{ question: string; answer: string }>;
    cta?: { text: string; link: string };
    relatedRoutes?: Array<{ from: string; to: string; price?: string; link?: string }>;
    location?: { name: string; lat?: number; lng?: number };
}

export async function getLandingPages(): Promise<LandingPage[]> {
    const { seo } = await getTenantData();
    const pages = (seo as any).landingPages;
    return Array.isArray(pages) ? pages : [];
}

export async function getLandingPageBySlug(slug: string): Promise<LandingPage | null> {
    const pages = await getLandingPages();
    return pages.find(p => p.slug === slug) || null;
}
