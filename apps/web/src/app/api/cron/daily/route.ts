import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDailyEmploymentEvents } from "@/server/services/employment-events";
import { runDailyDocumentExpiry } from "@/server/services/documents";
import { runDailyReferralBonuses } from "@/server/services/referrals";
import { runDailyCompensation } from "@/server/services/payroll";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const JOBS: [string, () => Promise<number>][] = [
  ["employmentEvents", runDailyEmploymentEvents],
  ["documentExpiry", runDailyDocumentExpiry],
  ["referralBonuses", runDailyReferralBonuses],
  ["compensation", runDailyCompensation],
];

/** Hash both sides so lengths match, then compare in constant time. */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(req.headers.get("authorization") ?? ""), h(`Bearer ${secret}`));
}

/** GET /api/cron/daily with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this). Jobs run in order; one failing does not stop the rest. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401 });
  const results: Record<string, number | { error: string }> = {};
  for (const [name, job] of JOBS) {
    try {
      results[name] = await job();
    } catch (e) {
      console.error(`cron ${name} failed`, e);
      results[name] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
