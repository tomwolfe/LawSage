import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false, // Disabled due to build error: "Cannot access 'k' before initialization"
  experimental: {
    serverActions: {},
  },
  // Removed external rewrites - all API routes are now handled internally by Next.js Edge Functions
  // Edge runtime is configured at the individual route level using export const runtime = 'edge'
};

export default nextConfig;
