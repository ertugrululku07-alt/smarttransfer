import type { Metadata } from "next";
import { headers } from "next/headers";
import { Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { BrandingProvider } from "./context/BrandingContext";
import { LanguageProvider } from "./context/LanguageContext";
import AntThemeWrapper from "./context/AntThemeWrapper";
import LiveChatWidget from "./components/LiveChatWidget";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

const SUPPORTED_LOCALES = ['tr', 'en', 'de', 'ru'];
const DEFAULT_LOCALE = 'tr';

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

function resolveServerApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'development') return 'http://localhost:4000';
  throw new Error('NEXT_PUBLIC_API_URL must be set for SSR');
}

async function getDefaultSiteUrl(): Promise<string> {
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

interface TenantData {
  branding: {
    companyName?: string;
    siteNameHighlight?: string;
    siteName?: string;
    slogan?: string;
    email?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
    faviconUrl?: string;
    logoVariants?: { original?: string; header?: string; favicon?: string; voucher?: string; email?: string } | null;
  };
  seo: {
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
  };
  socialMedia?: Record<string, string>;
  customTheme?: { primaryColor?: string };
}

async function getTenantData(): Promise<TenantData> {
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

  try {
    const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();
    const res = await fetch(`${resolveServerApiUrl()}/api/tenant/info`, {
      headers: { 'X-Tenant-Slug': TENANT_SLUG },
      next: { revalidate: 60 }
    });

    if (res.ok) {
      const data = await res.json();
      const settings = data?.data?.tenant?.settings || {};
      return {
        branding: { ...fallback.branding, ...(settings.branding || {}) },
        seo: settings.seo || {},
        socialMedia: settings.socialMedia || {},
        customTheme: settings.customTheme || {},
      };
    }
  } catch (error) {
    console.error('Failed to fetch tenant data for metadata:', error);
  }

  return fallback;
}

function buildAbsoluteImageUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  return `${baseUrl}/${url}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { branding, seo } = await getTenantData();
  const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
  const fallbackUrl = await getDefaultSiteUrl();
  const siteUrl = (seo.siteUrl || fallbackUrl).replace(/\/$/, '');

  const title = seo.defaultTitle || `${fullName} | ${branding.slogan || 'Premium Transfer Hizmeti'}`;
  const description = seo.defaultDescription || branding.slogan || `${fullName} ile havalimanı, otel ve şehirler arası VIP transfer hizmeti. 7/24 rezervasyon ve canlı takip.`;
  const titleTemplate = seo.titleTemplate || `%s | ${fullName}`;

  const keywords = (seo.keywords && seo.keywords.length > 0)
    ? seo.keywords
    : [
        'transfer hizmeti', 'havalimanı transferi', 'VIP transfer',
        'otel transferi', 'şehir içi transfer', 'özel transfer',
        'havalimanı taksi', 'rezervasyon', fullName,
      ];

  const ogImage = buildAbsoluteImageUrl(seo.ogImage || branding.logoUrl, siteUrl);

  const verification: Metadata['verification'] = {};
  if (seo.googleSiteVerification) verification.google = seo.googleSiteVerification;
  if (seo.yandexVerification) verification.yandex = seo.yandexVerification;
  if (seo.bingSiteVerification) (verification.other as any) = { 'msvalidate.01': seo.bingSiteVerification };

  const indexingEnabled = seo.indexingEnabled !== false;

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: titleTemplate },
    description,
    keywords,
    authors: [{ name: fullName }],
    creator: fullName,
    publisher: fullName,
    applicationName: fullName,
    alternates: {
      canonical: '/',
      languages: {
        'tr': '/',
        'en': '/en',
        'de': '/de',
        'ru': '/ru',
        'x-default': '/',
      },
    },
    openGraph: {
      type: 'website',
      locale: seo.locale || 'tr_TR',
      siteName: fullName,
      title,
      description,
      url: siteUrl,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: fullName }] : [],
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
    verification: Object.keys(verification).length > 0 ? verification : undefined,
    icons: (() => {
      const apiUrl = resolveServerApiUrl();
      const resolveIcon = (path?: string) => {
        if (!path) return undefined;
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        return `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
      };
      const faviconSrc = resolveIcon(branding.faviconUrl) || resolveIcon(branding.logoVariants?.favicon);
      return {
        icon: faviconSrc ? [{ url: faviconSrc, type: 'image/png' }] : [],
        apple: branding.logoUrl ? [{ url: resolveIcon(branding.logoUrl) || branding.logoUrl }] : undefined,
      };
    })(),
    other: {
      ...(seo.facebookAppId ? { 'fb:app_id': seo.facebookAppId } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { branding, seo, socialMedia, customTheme } = await getTenantData();
  const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName || 'SmartTravel';
  const fallbackUrl = await getDefaultSiteUrl();
  const siteUrl = (seo.siteUrl || fallbackUrl).replace(/\/$/, '');
  const themeColor = customTheme?.primaryColor || 'var(--brand-primary)';

  // Organization JSON-LD (rich data)
  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: fullName,
    description: seo.defaultDescription || branding.slogan,
    url: siteUrl,
    logo: buildAbsoluteImageUrl(branding.logoUrl, siteUrl),
    image: buildAbsoluteImageUrl(seo.ogImage || branding.logoUrl, siteUrl),
    telephone: branding.phone || undefined,
    email: branding.email || undefined,
    address: branding.address ? {
      '@type': 'PostalAddress',
      addressCountry: 'TR',
      streetAddress: branding.address,
    } : { '@type': 'PostalAddress', addressCountry: 'TR' },
    priceRange: '₺₺',
    sameAs: socialMedia ? Object.values(socialMedia).filter(v => v && typeof v === 'string') : [],
  };

  // WebSite JSON-LD with Sitelinks Searchbox
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: fullName,
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/track?bookingNumber={bookingNumber}` },
      'query-input': 'required name=bookingNumber',
    },
  };

  // Detect locale from middleware header
  const headersList = await headers();
  const currentLocale = headersList.get('x-locale') || DEFAULT_LOCALE;
  const currentPath = headersList.get('x-invoke-path') || '/';

  return (
    <html lang={currentLocale} suppressHydrationWarning>
      <head>
        {/* hreflang alternate links for SEO — each language gets its own URL */}
        {SUPPORTED_LOCALES.map(loc => (
          <link
            key={loc}
            rel="alternate"
            hrefLang={loc}
            href={`${siteUrl}${loc === DEFAULT_LOCALE ? currentPath : `/${loc}${currentPath === '/' ? '' : currentPath}`}`}
          />
        ))}
        <link rel="alternate" hrefLang="x-default" href={`${siteUrl}${currentPath}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="theme-color" content={themeColor} />
        <meta name="color-scheme" content="light" />
        <meta name="geo.region" content="TR" />
        <meta name="geo.placename" content="Turkey" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=yes" />

        {/* Resource hints - critical for performance */}
        {process.env.NEXT_PUBLIC_API_URL && (() => {
          try {
            const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
            return (
              <>
                <link rel="preconnect" href={apiOrigin} crossOrigin="anonymous" />
                <link rel="dns-prefetch" href={apiOrigin} />
              </>
            );
          } catch { return null; }
        })()}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {(seo.gtmId || seo.gaId) && <link rel="dns-prefetch" href="https://www.googletagmanager.com" />}
        {(seo.gtmId || seo.gaId) && <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />}

        {/* Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />

        {/* Google Tag Manager */}
        {seo.gtmId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${seo.gtmId}');`
            }}
          />
        )}

        {/* Google Analytics 4 */}
        {seo.gaId && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${seo.gaId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${seo.gaId}');`
              }}
            />
          </>
        )}
      </head>
      <body className={`${outfit.variable} ${playfair.variable} antialiased`}>
        {/* GTM noscript fallback */}
        {seo.gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${seo.gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        <AuthProvider>
          <SocketProvider>
            <CurrencyProvider>
              <ThemeProvider>
                <AntThemeWrapper>
                  <BrandingProvider>
                    <LanguageProvider>
                      {children}
                      <LiveChatWidget />
                      <ServiceWorkerRegister />
                    </LanguageProvider>
                  </BrandingProvider>
                </AntThemeWrapper>
              </ThemeProvider>
            </CurrencyProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
