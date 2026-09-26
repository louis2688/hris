import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hris/shared", "@hris/db"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bcryptjs"],
  typedRoutes: false,
  poweredByHeader: false,
  // Document uploads: 5 MB file cap + multipart overhead (default is 1 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
