import { addDaysIso, scheduleRangeSchema } from "@hris/shared";
import { handler, json, query } from "@/server/api";
import { manilaToday, mySchedule } from "@/server/services/scheduling";

/** GET /api/v1/attendance/schedule?from=&to= -> caller's effective shifts per day (defaults: today + 13 days). */
export const GET = handler(async ({ req, user }) => {
  const q = query(req, scheduleRangeSchema);
  const from = q.from ?? manilaToday();
  const to = q.to ?? addDaysIso(from, 13);
  if (to < from || Date.parse(to) - Date.parse(from) > 92 * 86400_000) return json({ error: { code: "VALIDATION", message: "Range must be ascending and at most 93 days" } }, 422);
  return json({ from, to, days: user.employeeId ? await mySchedule(user.employeeId, from, to) : [] });
});
