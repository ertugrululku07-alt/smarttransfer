import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prevent nginx/CDN from caching HTML pages (stale-while-revalidate was serving old builds)
  async headers() {
    return [
      {
        // Apply to all pages EXCEPT static assets
        source: '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
