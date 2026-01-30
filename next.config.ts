import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  rewrites: async () => {
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: "/api/:path*",
            destination: "http://127.0.0.1:8000/:path*",
          },
        ]
      : [];
  },
};

export default nextConfig;
