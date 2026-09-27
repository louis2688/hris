// Fixed-window rate limits in the RateLimit table, shared across serverless instances.
// No static Prisma import so `node --test src/server/rate-limit.test.mjs` can exercise the pure helpers.

export type Limit = { ok: boolean; remaining: number; retryAfterSec: number };

/** One atomic upsert per call. Fails open (logs, allows) if the DB errors. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<Limit> {
  try {
    const { prisma } = await import("@hris/db");
    // resetAt is TIMESTAMP (no tz) holding UTC, so compare against UTC wall time, not the session timezone.
    const [row] = await prisma.$queryRaw<[{ count: number; resetAt: Date }]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, timezone('utc', now()) + make_interval(secs => ${windowSec}::int))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" <= timezone('utc', now()) THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= timezone('utc', now()) THEN timezone('utc', now()) + make_interval(secs => ${windowSec}::int) ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"`;
    // ponytail: opportunistic cleanup on ~1% of calls instead of a cron.
    if (Math.random() < 0.01) await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < timezone('utc', now()) - interval '1 day'`.catch(() => {});
    return {
      ok: row.count <= limit,
      remaining: Math.max(0, limit - row.count),
      retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)),
    };
  } catch (e) {
    console.error("rateLimit failed open", key, (e as Error)?.message);
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** Client IP: first x-forwarded-for hop (Vercel sets it and strips spoofed values), then x-real-ip. */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export const loginKeys = (email: string, ip: string) => ({ ip: `login:ip:${ip}`, email: `login:email:${email.trim().toLowerCase()}` });

export const tooManyMessage = (retryAfterSec: number) => {
  const m = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts, try again in ${m} minute${m === 1 ? "" : "s"}`;
};

/**
 * Login throttle: 20 failed attempts / 15 min per IP and 10 / 15 min per email. Same answer whether or not the email exists.
 * Every attempt counts atomically up front (parallel bursts can't slip through); loginRefund gives it back on success.
 */
export async function loginLimit(email: string, ip: string): Promise<Limit> {
  const k = loginKeys(email, ip);
  const [a, b] = await Promise.all([rateLimit(k.ip, 20, 900), rateLimit(k.email, 10, 900)]);
  return a.ok && b.ok ? a : { ok: false, remaining: 0, retryAfterSec: Math.max(a.ok ? 0 : a.retryAfterSec, b.ok ? 0 : b.retryAfterSec) };
}

/** Successful login: return the attempt so only failures count (keeps shared office IPs and e2e runs unthrottled). */
export async function loginRefund(email: string, ip: string) {
  const k = loginKeys(email, ip);
  try {
    const { prisma } = await import("@hris/db");
    await prisma.$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" IN (${k.ip}, ${k.email})`;
  } catch (e) {
    console.error("loginRefund failed", (e as Error)?.message);
  }
}
