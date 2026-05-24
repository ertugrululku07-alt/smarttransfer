import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Tree-shake icons + lodash + date-fns (huge wins for bundle size)
  modularizeImports: {
    '@ant-design/icons': {
      transform: '@ant-design/icons/lib/icons/{{member}}',
      preventFullImport: true,
    },
    'lodash': {
      transform: 'lodash/{{member}}',
      preventFullImport: true,
    },
    'date-fns': {
      transform: 'date-fns/{{member}}',
      preventFullImport: true,
    },
  },
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', 'lucide-react', 'date-fns'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24, // 1 day
  },
  // Cache policy: no-cache for authenticated/private routes, sensible caching for public pages
  async headers() {
    const noCacheHeaders = [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
    ];
    const publicPageHeaders = [
      // Allow CDN to cache for 5min, serve stale up to 1 day while revalidating
      { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=86400' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    return [
      // Private / authenticated areas → never cache
      { source: '/admin/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/account/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/agency/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/driver/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/partner/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/login', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/register', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/register-driver', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/payment/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      { source: '/booking/:path*', headers: [...noCacheHeaders, ...securityHeaders] },
      // Booking flow needs fresh data
      { source: '/transfer/book', headers: [...noCacheHeaders, ...securityHeaders] },
      // Track page (real-time data)
      { source: '/track', headers: [...noCacheHeaders, ...securityHeaders] },
      // All other routes — public pages with caching
      { source: '/:path*', headers: publicPageHeaders },
    ];
  },
};

export default nextConfig;
