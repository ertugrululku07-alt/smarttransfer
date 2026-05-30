'use client';

import { useEffect } from 'react';
import { useBranding } from '@/app/context/BrandingContext';
import { getImageUrl } from '@/lib/api-client';

/**
 * Client-side component that dynamically updates the browser tab favicon
 * whenever branding data changes (e.g. after admin uploads a new favicon).
 *
 * This complements the server-side generateMetadata() in layout.tsx which
 * only runs at build/request time with ISR caching.
 */
export default function DynamicFavicon() {
    const { branding, loading } = useBranding();

    useEffect(() => {
        if (loading) return;

        const faviconSource = branding.faviconUrl || branding.logoUrl;
        if (!faviconSource) return;

        const resolvedUrl = getImageUrl(faviconSource);
        if (!resolvedUrl) return;

        // Helper to upsert a <link> tag in <head>
        const upsertLink = (rel: string, sizes?: string) => {
            // Build a selector that matches by rel and optionally sizes
            let selector = `link[rel="${rel}"]`;
            if (sizes) selector += `[sizes="${sizes}"]`;

            let link = document.querySelector(selector) as HTMLLinkElement | null;

            if (!link) {
                link = document.createElement('link');
                link.rel = rel;
                if (sizes) link.setAttribute('sizes', sizes);
                document.head.appendChild(link);
            }

            // Only update if the href actually changed
            if (link.href !== resolvedUrl) {
                link.href = resolvedUrl;
                // Determine mime type from extension
                const ext = resolvedUrl.split('?')[0].split('.').pop()?.toLowerCase();
                const typeMap: Record<string, string> = {
                    svg: 'image/svg+xml',
                    ico: 'image/x-icon',
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                    webp: 'image/webp',
                    png: 'image/png',
                };
                link.type = typeMap[ext || ''] || 'image/png';
            }
        };

        // Update the standard favicon link tags
        upsertLink('icon');
        upsertLink('icon', '16x16');
        upsertLink('icon', '32x32');
        upsertLink('icon', '48x48');
        upsertLink('shortcut icon');
        upsertLink('apple-touch-icon', '180x180');
    }, [branding.faviconUrl, branding.logoUrl, loading]);

    // This component renders nothing — it only manages <head> side-effects
    return null;
}
