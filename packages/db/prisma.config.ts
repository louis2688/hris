import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI (migrate/studio) uses this. Runtime uses DATABASE_URL via the pg adapter.
    // ponytail: `generate` never connects, so a missing DIRECT_URL must not fail CI builds.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/unset",
  },
});
