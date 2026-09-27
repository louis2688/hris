import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ponytail: lets parallel dev servers use separate build dirs (NEXT_DIST_DIR=.next-foo)
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
