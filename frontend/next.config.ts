import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;
