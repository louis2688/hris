import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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

// Runtime init lives in src/instrumentation*.ts and is skipped without a DSN.
// Source-map upload only runs when SENTRY_AUTH_TOKEN (+ SENTRY_ORG / SENTRY_PROJECT) is set, so plain builds need nothing.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
});
