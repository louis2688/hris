import { apiError, handler } from "@/server/api";
import { isReportSlug, REPORTS, toCsv } from "@/server/services/reports";

/** GET /api/v1/reports/:slug?<same params as the page> -> CSV download. */
export const GET = handler<{ slug: string }>(
  async ({ req, params, user }) => {
    if (!isReportSlug(params.slug)) return apiError(404, "NOT_FOUND", "Unknown report");
    const report = await REPORTS[params.slug](user, req.nextUrl.searchParams);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(toCsv(report), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${params.slug}-${date}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  },
  { roles: ["MANAGER", "HR", "ADMIN"] },
);
