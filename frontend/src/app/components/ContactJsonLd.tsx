import { getTenantData, getSiteUrl, buildAbsoluteUrl, buildLocalBusinessJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';

/**
 * Server component for contact page JSON-LD:
 * - BreadcrumbList
 * - One LocalBusiness per branch (or single if no branches)
 */
export default async function ContactJsonLd() {
    try {
        return await renderContactJsonLd();
    } catch (e) {
        console.error('ContactJsonLd failed:', e);
        return null;
    }
}

async function renderContactJsonLd() {
    const { branding, seo, contactPage, socialMedia } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallbackUrl = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallbackUrl).replace(/\/$/, '');
    const logo = buildAbsoluteUrl(branding.logoUrl, siteUrl);

    const breadcrumb = buildBreadcrumbJsonLd([
        { name: 'Ana Sayfa', url: `${siteUrl}/` },
        { name: 'İletişim', url: `${siteUrl}/contact` },
    ]);

    const branches = contactPage?.branches || [];
    const businesses: any[] = [];

    if (branches.length > 0) {
        for (const b of branches) {
            businesses.push(buildLocalBusinessJsonLd({
                name: fullName,
                branch: b.name,
                description: branding.slogan,
                url: `${siteUrl}/contact`,
                image: logo,
                telephone: b.phone || branding.phone,
                email: branding.email,
                address: { street: b.address, country: 'TR' },
                openingHours: b.hours,
            }));
        }
    } else {
        // Single main business
        businesses.push(buildLocalBusinessJsonLd({
            name: fullName,
            description: branding.slogan,
            url: `${siteUrl}/contact`,
            image: logo,
            telephone: contactPage?.phone || branding.phone,
            email: contactPage?.email || branding.email,
            address: { street: contactPage?.address || branding.address, country: 'TR' },
        }));
    }

    // Add sameAs social profiles to first business
    if (businesses[0] && socialMedia) {
        const sameAs = Object.values(socialMedia).filter(v => v && typeof v === 'string') as string[];
        if (sameAs.length > 0) businesses[0].sameAs = sameAs;
    }

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
            {businesses.map((b, idx) => (
                <script key={idx} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(b) }} />
            ))}
        </>
    );
}
