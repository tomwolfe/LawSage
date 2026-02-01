import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  rewrites: async () => {
    // Environment-aware backendUrl that defaults to internal Vercel rewrites in production
    const isDev = process.env.NODE_ENV === 'development';
    const isProd = !isDev;

    // In production, use internal routing to Vercel Functions
    // In development, use local backend server
    if (isProd) {
      return [
        {
          source: "/api/:path*",
          destination: "/api/:path*", // Internal routing to Vercel Functions
        },
      ];
    } else {
      // Development environment - use local backend
      const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
      return [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/:path*`,
        },
      ];
    }
  },
};

export default nextConfig;
