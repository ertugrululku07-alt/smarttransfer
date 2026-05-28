import type { Metadata, ResolvingMetadata } from "next";
import { Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { BrandingProvider } from "./context/BrandingContext";
import { LanguageProvider } from "./context/LanguageContext";
import LiveChatWidget from "./components/LiveChatWidget";

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

function getSiteBaseUrl(): string {
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (envUrl) return envUrl;
  // Derive from API URL: https://api.jet2home.com → https://jet2home.com
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      const host = u.hostname.replace(/^api\./, '');
      return `${u.protocol}//${host}`;
    } catch {}
  }
  return 'https://jet2home.com';
}

async function getTenantBranding() {
  let branding = {
    companyName: 'SmartTravel Platform',
    siteNameHighlight: 'Smart',
    siteName: 'Travel',
    slogan: "Türkiye'nin en güvenilir transfer platformu",
    email: 'info@smarttravel.com',
    phone: '+90-212-XXX-XXXX',
    logoUrl: '',
  };

  try {
    
    const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();
    
    const res = await fetch(`${resolveServerApiUrl()}/api/tenant/info`, {
      headers: { 'X-Tenant-Slug': TENANT_SLUG },
      next: { revalidate: 60 } // Cache for 60 seconds
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.data?.tenant?.settings?.branding) {
        branding = { ...branding, ...data.data.tenant.settings.branding };
      }
    }
  } catch (error) {
    console.error('Failed to fetch branding for metadata:', error);
  }

  return branding;
}

function normalizeAssetUrl(url: string | undefined): string {
  if (!url) return '';
  // If it's a relative path, resolve it with the site base
  if (url.startsWith('/')) return `${getSiteBaseUrl()}${url}`;
  // If it's an absolute URL but pointing to wrong domain (e.g. old smarttravel.com)
  // and it has /uploads/ in it, rewrite to current site base
  if (url.includes('/uploads/')) {
    try {
      const u = new URL(url);
      const currentBase = getSiteBaseUrl();
      const currentHost = new URL(currentBase).hostname;
      if (u.hostname !== currentHost) {
        return `${currentBase}${u.pathname}`;
      }
    } catch {}
  }
  return url;
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTenantBranding();
  const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName;
  const logoImage = normalizeAssetUrl(branding.logoUrl);

  return {
    metadataBase: new URL(getSiteBaseUrl()),
    title: {
      default: `${fullName} | ${branding.slogan}`,
      template: `%s | ${fullName}`
    },
    description: branding.slogan,
    keywords: [
      "transfer hizmeti", "havalimanı transferi", "VIP transfer", 
      "otel transferi", "şehir içi transfer", fullName
    ],
    authors: [{ name: fullName }],
    creator: fullName,
    publisher: fullName,
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: fullName,
      title: `${fullName} | VIP Transfer`,
      description: branding.slogan,
      images: logoImage ? [{ url: logoImage, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${fullName} | VIP Transfer`,
      description: branding.slogan,
      images: logoImage ? [logoImage] : [],
    },
    robots: {
      index: true,
      follow: true,
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/icon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    manifest: "/site.webmanifest",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await getTenantBranding();
  const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName;

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="theme-color" content="#667eea" />
        <meta name="geo.region" content="TR" />
        <meta name="geo.placename" content="Turkey" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "TravelAgency",
              "name": fullName,
              "description": branding.slogan,
              "url": getSiteBaseUrl(),
              "logo": branding.logoUrl || `${getSiteBaseUrl()}/logo.png`,
              "telephone": branding.phone || "+90-212-XXX-XXXX",
              "email": branding.email || "info@smarttravel.com",
              "address": {
                "@type": "PostalAddress",
                "addressCountry": "TR",
                "addressLocality": "Istanbul"
              },
              "priceRange": "₺₺",
            })
          }}
        />
      </head>
      <body className={`${outfit.variable} ${playfair.variable} antialiased`}>
        <AuthProvider>
          <SocketProvider>
            <CurrencyProvider>
              <ThemeProvider>
                <BrandingProvider>
                  <LanguageProvider>
                    {children}
                    <LiveChatWidget />
                  </LanguageProvider>
                </BrandingProvider>
              </ThemeProvider>
            </CurrencyProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
