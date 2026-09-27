import { prisma } from "@hris/db";
import { json } from "@/server/api";

const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";

/** GET /api/v1/health: public uptime probe. 200 when `SELECT 1` answers within 3s, else 503. */
export async function GET() {
  const t = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const up = await Promise.race([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    new Promise<false>((r) => (timer = setTimeout(r, 3000, false))),
  ]);
  clearTimeout(timer);
  return json({ ok: up, db: up ? "up" : "down", latencyMs: Date.now() - t, version }, { status: up ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
