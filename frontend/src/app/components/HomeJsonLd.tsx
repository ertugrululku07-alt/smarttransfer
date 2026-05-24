import { getTenantData, getSiteUrl, buildAbsoluteUrl, buildFaqJsonLd, buildServiceJsonLd, buildAggregateRatingJsonLd } from '@/lib/seo';

/**
 * Server component that renders SEO JSON-LD for the homepage.
 * Includes: FAQPage, TaxiService, AggregateRating (if testimonials exist).
 */
export default async function HomeJsonLd() {
    const { branding, seo, homepageFaq, homepageTestimonials } = await getTenantData();
    const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
    const fallbackUrl = await getSiteUrl();
    const siteUrl = (seo.siteUrl || fallbackUrl).replace(/\/$/, '');

    const faqLd = buildFaqJsonLd(homepageFaq || []);
    const aggregateRating = buildAggregateRatingJsonLd(homepageTestimonials || []);
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

    return (
        <>
            {faqLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
            )}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
        </>
    );
}
