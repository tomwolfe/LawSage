import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Removed external rewrites - all API routes are now handled internally by Next.js Edge Functions
};

export default nextConfig;
