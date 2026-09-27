import { handler } from "@/server/api";
import { ackRows } from "@/server/services/announcements";

/** Quote when needed; neutralise leading =+-@ so spreadsheet apps don't run it as a formula. */
const cell = (raw: string) => {
  const v = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** GET /api/v1/announcements/:id/acks -> CSV of every active user and whether they acknowledged. */
export const GET = handler<{ id: string }>(
  async ({ params }) => {
    const { title, users } = await ackRows(params.id);
    const lines = [
      ["Employee ID", "Name", "Email", "Status", "Acknowledged at"],
      ...users.map((u) => {
        const at = u.acks[0]?.ackedAt;
        const e = u.employee;
        return [e?.employeeCode ?? "", e ? `${e.preferredName ?? e.firstName} ${e.lastName}` : "", u.email, at ? "Acknowledged" : "Pending", at ? at.toISOString() : ""];
      }),
    ];
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    return new Response(lines.map((l) => l.map(cell).join(",")).join("\n") + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="acks-${slug}.csv"` },
    });
  },
  { roles: ["ADMIN", "HR"] },
);
