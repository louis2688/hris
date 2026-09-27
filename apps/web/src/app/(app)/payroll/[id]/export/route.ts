import { handler } from "@/server/api";
import { runCsv } from "@/server/services/payroll";

/** GET /payroll/:id/export?type=register|remittance -> CSV download (HR/Admin). */
export const GET = handler<{ id: string }>(
  async ({ req, params }) => {
    const type = req.nextUrl.searchParams.get("type") === "remittance" ? "remittance" : "register";
    const { csv, filename } = await runCsv(params.id, type);
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
