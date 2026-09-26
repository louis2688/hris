import { z } from "zod";
import { handler, json, query } from "@/server/api";
import { getBalances } from "@/server/services/leave";

/** GET /api/v1/me/balances?year=2026 */
export const GET = handler(async ({ req, user }) => {
  if (!user.employeeId) return json({ balances: [] });
  const { year } = query(req, z.object({ year: z.coerce.number().int().default(new Date().getUTCFullYear()) }));
  return json({ balances: await getBalances(user.employeeId, year) });
});
