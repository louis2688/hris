import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export * from "../generated/prisma/client";
export { Prisma } from "../generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: 10 });
  return new PrismaClient({
    adapter,
    // Selfie / document bytes stay out of every query; fetch explicitly with omit: { data: false } / select.
    // ponytail: documents live in Postgres bytea (5 MB cap). Move bytes to Supabase Storage (keep this row as metadata + object key) if volume grows.
    omit: { attendancePunch: { photo: true }, document: { data: true } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

type Client = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma?: Client };

function client(): Client {
  return (globalForPrisma.prisma ??= createClient());
}

// ponytail: lazy so `next build` can import route modules without a DATABASE_URL.
export const prisma = new Proxy({} as Client, {
  get: (_t, prop) => {
    const c = client();
    const v = Reflect.get(c, prop, c);
    return typeof v === "function" ? v.bind(c) : v;
  },
});
