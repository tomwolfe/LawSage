import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NODE_ENV === 'development' 
          ? "http://127.0.0.1:8000/:path*" 
          : "/api/index.py",
      },
    ];
  },
};

export default nextConfig;
