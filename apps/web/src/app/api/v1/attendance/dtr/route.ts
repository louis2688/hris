import { z } from "zod";
import { handler, json, query } from "@/server/api";
import { dtrForMonth } from "@/server/services/attendance";

/** GET /api/v1/attendance/dtr?month=YYYY-MM -> own DTR rows + totals (defaults to the current month). */
export const GET = handler(async ({ req, user }) => {
  const { month } = query(req, z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM").default(new Date().toISOString().slice(0, 7)) }));
  if (!user.employeeId) return json({ month, rows: [], totals: null });
  const d = await dtrForMonth(user.employeeId, month);
  return json({ month, rows: d.rows, totals: d.totals, shift: d.shift, timeZone: d.timeZone });
});
