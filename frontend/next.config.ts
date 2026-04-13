import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;
