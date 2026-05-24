import { getTenantData, getSiteUrl, buildAbsoluteUrl, buildFaqJsonLd, buildServiceJsonLd, buildAggregateRatingJsonLd, buildReviewJsonLdArray, buildRouteServiceJsonLd } from '@/lib/seo';

/**
 * Server component that renders SEO JSON-LD for the homepage.
 * Includes: FAQPage, TaxiService (with embedded reviews + rating),
 * individual route Services, and reviews.
 */
export default async function HomeJsonLd() {
    const { branding, seo, homepageFaq, homepageTestimonials, homepageRoutes } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallbackUrl = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallbackUrl).replace(/\/$/, '');

    const faqLd = buildFaqJsonLd(homepageFaq || []);
    const aggregateRating = buildAggregateRatingJsonLd(homepageTestimonials || []);
    const reviews = buildReviewJsonLdArray(homepageTestimonials || []);
    const logoAbsolute = buildAbsoluteUrl(branding.logoUrl, siteUrl);

    const serviceLd: any = buildServiceJsonLd({
        siteUrl,
        name: `${fullName} — Premium Transfer Hizmeti`,
        description: seo.defaultDescription || branding.slogan || 'Havalimanı, otel ve şehirler arası VIP transfer hizmeti',
        provider: { name: fullName, logo: logoAbsolute },
        areaServed: 'TR',
        image: buildAbsoluteUrl(seo.ogImage || branding.logoUrl, siteUrl),
        priceRange: '₺₺',
    });
    if (aggregateRating) serviceLd.aggregateRating = aggregateRating;
    if (reviews.length > 0) serviceLd.review = reviews;

    // Per-route TaxiService JSON-LD (for popular routes shown on homepage)
    const routeServices = (homepageRoutes || []).slice(0, 8).map((route: any) => buildRouteServiceJsonLd({
        siteUrl,
        fromName: route.from || 'Havalimanı',
        toName: route.to || 'Şehir Merkezi',
        price: route.price,
        currency: 'EUR',
        image: buildAbsoluteUrl(route.img, siteUrl),
        providerName: fullName,
        providerLogo: logoAbsolute,
    }));

    return (
        <>
            {faqLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
            )}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
            {routeServices.map((rs: any, idx: number) => (
                <script key={idx} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(rs) }} />
            ))}
        </>
    );
}
