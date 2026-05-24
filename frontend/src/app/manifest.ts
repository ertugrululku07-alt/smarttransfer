import type { MetadataRoute } from 'next';

function resolveServerApiUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'development') return 'http://localhost:4000';
    return '';
}

async function getTenantBranding() {
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
        return data?.data?.tenant?.settings || null;
    } catch {
        return null;
    }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const settings = await getTenantBranding();
    const branding = settings?.branding || {};
    const seo = settings?.seo || {};

    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const shortName = branding.siteName || branding.companyName || 'SmartTravel';
    const description = seo.defaultDescription || branding.slogan || 'Premium Transfer Hizmeti';
    const themeColor = settings?.customTheme?.primaryColor || '#667eea';
    const logoUrl = branding.logoUrl || '/favicon.ico';

    const icons: MetadataRoute.Manifest['icons'] = [
        { src: '/favicon.ico', sizes: '64x64 32x32 24x24 16x16', type: 'image/x-icon' },
    ];

    if (logoUrl && logoUrl !== '/favicon.ico') {
        // Use logo as primary maskable icon
        icons.push(
            { src: logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: logoUrl, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        );
    }

    return {
        name: fullName,
        short_name: shortName,
        description,
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: themeColor,
        orientation: 'portrait',
        lang: seo.locale || 'tr-TR',
        icons,
    };
}
