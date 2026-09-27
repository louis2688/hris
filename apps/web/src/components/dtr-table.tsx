import { fmtMinutes, WEEKDAY_SHORT, type DtrRow, type DtrStatus, type DtrTotals } from "@hris/shared";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE: Record<DtrStatus, "green" | "amber" | "red" | "blue" | "violet" | "slate"> = {
  PRESENT: "green",
  INCOMPLETE: "amber",
  ABSENT: "red",
  LEAVE: "blue",
  HOLIDAY: "violet",
  REST_DAY: "slate",
  UPCOMING: "slate",
};
const LABEL: Record<DtrStatus, string> = { PRESENT: "Present", INCOMPLETE: "No out", ABSENT: "Absent", LEAVE: "Leave", HOLIDAY: "Holiday", REST_DAY: "Rest day", UPCOMING: "-" };

export function DtrTotalsBar({ totals }: { totals: DtrTotals }) {
  const items: [string, string | number][] = [
    ["Days present", totals.present],
    ["Absences", totals.absent],
    ["Leave days", totals.leaveDays],
    ["Late (times)", totals.lateCount],
    ["Late", fmtMinutes(totals.lateMinutes)],
    ["Undertime", fmtMinutes(totals.undertimeMinutes)],
    ["Overtime", fmtMinutes(totals.overtimeMinutes)],
    ["Hours worked", (totals.workedMinutes / 60).toFixed(1)],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {items.map(([k, v]) => (
        <Card key={k} className="p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{v}</p>
        </Card>
      ))}
    </div>
  );
}

/** `fix`: own DTR only. INCOMPLETE/ABSENT days in [from, to] get a "Fix" link to a pre-filled correction; `pending` days show that one is waiting. */
export function DtrTable({
  rows,
  punchLinks,
  fix,
}: {
  rows: DtrRow[];
  punchLinks?: Map<string, { id: string; time: string; method: string; hasPhoto?: boolean }[]>;
  fix?: { from: string; to: string; pending: Set<string> };
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">In</th>
              <th className="px-3 py-2.5">Out</th>
              <th className="px-3 py-2.5 text-right">Worked</th>
              <th className="px-3 py-2.5 text-right">Late</th>
              <th className="px-3 py-2.5 text-right">Undertime</th>
              <th className="px-3 py-2.5 text-right">OT</th>
              <th className="px-3 py-2.5">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.date} data-date={r.date} className={cn(r.status === "REST_DAY" || r.status === "HOLIDAY" ? "bg-slate-50/60" : "", "break-inside-avoid")}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  <span className="font-medium">{r.date.slice(8)}</span> <span className="text-slate-500">{WEEKDAY_SHORT[r.weekday]}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">{r.status === "UPCOMING" ? <span className="text-slate-300">-</span> : <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>}</td>
                <td className="px-3 py-2 tabular-nums">{r.timeIn ?? "-"}</td>
                <td className="px-3 py-2 tabular-nums">{r.timeOut ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtMinutes(r.workedMinutes)}</td>
                <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", r.lateMinutes && "font-medium text-tone-amber-fg")}>{fmtMinutes(r.lateMinutes)}</td>
                <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", r.undertimeMinutes && "font-medium text-tone-amber-fg")}>{fmtMinutes(r.undertimeMinutes)}</td>
                <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", r.overtimeMinutes && "font-medium text-tone-green-fg")}>{fmtMinutes(r.overtimeMinutes)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {[r.holiday, r.leave ? `${r.leave.code}${r.leave.days < 1 ? " (half)" : ""}` : null].filter(Boolean).join(" · ")}
                  {punchLinks?.get(r.date)?.length ? (
                    <span className="ml-1 print:hidden">
                      {punchLinks.get(r.date)!.map((p) => (
                        <span key={p.id} className="mr-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600" title={p.method}>
                          {p.hasPhoto ? (
                            <a href={`/api/v1/attendance/punches/${p.id}/photo`} target="_blank" rel="noreferrer" className="underline">
                              {p.time}
                            </a>
                          ) : (
                            p.time
                          )}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {fix && (r.status === "INCOMPLETE" || r.status === "ABSENT") && r.date >= fix.from && r.date <= fix.to ? (
                    fix.pending.has(r.date) ? (
                      <span className="ml-1 text-tone-amber-fg print:hidden">Fix pending</span>
                    ) : (
                      <Link
                        href={`/attendance/corrections?new=1&date=${r.date}&kind=${r.status === "INCOMPLETE" ? "MISSED_OUT" : "MISSED_BOTH"}`}
                        className="ml-1 rounded-full px-2 py-0.5 font-semibold text-ink underline decoration-hairline underline-offset-2 hover:decoration-ink print:hidden"
                      >
                        Fix
                      </Link>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
