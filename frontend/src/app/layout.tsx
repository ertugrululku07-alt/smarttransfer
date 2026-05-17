import { API_URL } from '@/lib/api-client';
import type { Metadata, ResolvingMetadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { BrandingProvider } from "./context/BrandingContext";
import { LanguageProvider } from "./context/LanguageContext";
import LiveChatWidget from "./components/LiveChatWidget";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

async function getTenantBranding() {
  let branding = {
    companyName: 'SmartTravel Platform',
    siteNameHighlight: 'Smart',
    siteName: 'Travel',
    slogan: "Türkiye'nin en güvenilir transfer platformu",
    email: 'info@smarttravel.com',
    phone: '+90-212-XXX-XXXX',
    logoUrl: 'https://smarttravel.com/logo.png',
  };

  try {
    
    const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();
    
    const res = await fetch(`${API_URL}/api/tenant/info`, {
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

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTenantBranding();
  const fullName = `${branding.siteNameHighlight || ''}${branding.siteName || ''}` || branding.companyName;

  return {
    metadataBase: new URL('https://smarttravel.com'),
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
      images: branding.logoUrl ? [{ url: branding.logoUrl, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${fullName} | VIP Transfer`,
      description: branding.slogan,
      images: branding.logoUrl ? [branding.logoUrl] : [],
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
              "url": "https://smarttravel.com",
              "logo": branding.logoUrl || "https://smarttravel.com/logo.png",
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
      <body className={`${inter.variable} antialiased`}>
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
