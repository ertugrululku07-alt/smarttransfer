import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { BrandingProvider } from "./context/BrandingContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// 🚀 ENTERPRISE SEO OPTIMIZATION
export const metadata: Metadata = {
  metadataBase: new URL('https://smarttravel.com'),
  // Basic Meta Tags
  title: {
    default: "SmartTravel Platform | VIP Transfer, Tur & Otel Rezervasyonu",
    template: "%s | SmartTravel Platform"
  },
  description: "Türkiye'nin en güvenilir transfer, tur ve otel rezervasyon platformu. 7/24 müşteri hizmetleri, anında onay, güvenli ödeme. VIP transfer, günübirlik turlar ve otel rezervasyonları için hemen rezervasyon yapın!",

  // Keywords for SEO
  keywords: [
    "transfer hizmeti",
    "havalimanı transferi",
    "VIP transfer",
    "otel transferi",
    "şehir içi transfer",
    "tur rezervasyonu",
    "günübirlik tur",
    "otel rezervasyonu",
    "online rezervasyon",
    "güvenli transfer",
    "7/24 transfer",
    "İstanbul transfer",
    "Ankara transfer",
    "İzmir transfer",
    "Antalya transfer",
    "turizm",
    "seyahat",
    "tatil",
    "SmartTravel"
  ],

  // Authors & Creator
  authors: [{ name: "SmartTravel Platform" }],
  creator: "SmartTravel Platform",
  publisher: "SmartTravel Platform",

  // Open Graph (Facebook, LinkedIn)
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: "https://smarttravel.com",
    siteName: "SmartTravel Platform",
    title: "SmartTravel | VIP Transfer, Tur & Otel Rezervasyonu",
    description: "Güvenilir transfer, tur ve otel rezervasyon platformu. Anında onay, güvenli ödeme, 7/24 destek.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "SmartTravel Platform",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    site: "@smarttravel",
    creator: "@smarttravel",
    title: "SmartTravel | VIP Transfer, Tur & Otel Rezervasyonu",
    description: "Güvenilir transfer, tur ve otel rezervasyon platformu. Anında onay, güvenli ödeme.",
    images: ["/twitter-image.jpg"],
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  // Verification (Google, Bing, etc.)
  verification: {
    google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
    // bing: "your-bing-verification-code",
  },

  // Icons & Manifest
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

  // Other
  category: "travel",
  alternates: {
    canonical: "https://smarttravel.com",
    languages: {
      "tr-TR": "https://smarttravel.com",
      "en-US": "https://smarttravel.com/en",
    },
  },
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        {/* Additional SEO Meta Tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="theme-color" content="#667eea" />

        {/* Geo Tags */}
        <meta name="geo.region" content="TR" />
        <meta name="geo.placename" content="Turkey" />

        {/* Apple */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "TravelAgency",
              "name": "SmartTravel Platform",
              "description": "Türkiye'nin güvenilir transfer, tur ve otel rezervasyon platformu",
              "url": "https://smarttravel.com",
              "logo": "https://smarttravel.com/logo.png",
              "image": "https://smarttravel.com/og-image.jpg",
              "telephone": "+90-212-XXX-XXXX",
              "email": "info@smarttravel.com",
              "address": {
                "@type": "PostalAddress",
                "addressCountry": "TR",
                "addressLocality": "Istanbul"
              },
              "sameAs": [
                "https://facebook.com/smarttravel",
                "https://twitter.com/smarttravel",
                "https://instagram.com/smarttravel",
                "https://linkedin.com/company/smarttravel"
              ],
              "priceRange": "₺₺",
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "reviewCount": "2847"
              }
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
                  {children}
                </BrandingProvider>
              </ThemeProvider>
            </CurrencyProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
