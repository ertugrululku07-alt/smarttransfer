import { getSiteUrl, getTenantData, buildBreadcrumbJsonLd } from '@/lib/seo';

interface Props {
    items: Array<{ name: string; path: string }>;
}

/**
 * Server component that renders a BreadcrumbList JSON-LD given path items.
 * Always includes the home page as the first item.
 */
export default async function BreadcrumbJsonLd({ items }: Props) {
    const { seo } = await getTenantData();
    const fallback = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallback).replace(/\/$/, '');
    const breadcrumbItems = [
        { name: 'Ana Sayfa', url: `${siteUrl}/` },
        ...items.map(i => ({ name: i.name, url: `${siteUrl}${i.path.startsWith('/') ? i.path : '/' + i.path}` })),
    ];
    const ld = buildBreadcrumbJsonLd(breadcrumbItems);
    return (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    );
}
