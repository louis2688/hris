import { handler } from "@/server/api";
import { bankCsv, glCsv, runCsv } from "@/server/services/payroll";

/** GET /payroll/:id/export?type=register|remittance|bank|gl -> CSV download (HR/Admin). Bank file: released runs only. */
export const GET = handler<{ id: string }>(
  async ({ req, params }) => {
    const t = req.nextUrl.searchParams.get("type");
    const { csv, filename } = t === "bank" ? await bankCsv(params.id) : t === "gl" ? await glCsv(params.id) : await runCsv(params.id, t === "remittance" ? "remittance" : "register");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  },
  { roles: ["HR", "ADMIN"] },
);
