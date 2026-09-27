"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { outsideAvailability, WEEKDAY_SHORT } from "@hris/shared";
import type { ScheduleDay } from "@/server/services/scheduling";
import { applyDefaultsAction, copyLastWeekAction, saveRosterAction } from "@/server/actions/scheduling";
import { ConfirmButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; code: string; dept: string | null; editable: boolean; days: ScheduleDay[]; availability?: Record<number, { fromTime: string | null; toTime: string | null }> };
type Shift = { id: string; name: string; startTime: string; endTime: string };

const valueOf = (d: ScheduleDay) => (d.override ? (d.shift?.id ?? "REST") : "");

export function Roster({ week, today, days, shifts, rows }: { week: string; today: string; days: string[]; shifts: Shift[]; rows: Row[] }) {
  const router = useRouter();
  const initial = React.useMemo(() => new Map<string, string>(rows.flatMap((r) => r.days.map((d) => [`${r.id}|${d.date}`, valueOf(d)] as const))), [rows]);
  const [cells, setCells] = React.useState(initial);
  React.useEffect(() => setCells(initial), [initial]); // server refresh after save / copy / defaults
  const [saving, start] = React.useTransition();
  const changed = [...cells].filter(([k, v]) => initial.get(k) !== v);

  function save() {
    start(async () => {
      const r = await saveRosterAction(changed.map(([k, value]) => ({ employeeId: k.split("|")[0]!, date: k.split("|")[1]!, value })));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      router.refresh();
    });
  }

  if (rows.length === 0) return <EmptyState title="Nobody on your team yet" description="Employees reporting to you appear here." />;

  return (
    <>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-bone text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 bg-bone px-4 py-2.5">Employee</th>
              {days.map((d) => (
                <th key={d} className={cn("px-1.5 py-2.5 text-center", d === today && "text-brand-600")}>
                  {WEEKDAY_SHORT[new Date(`${d}T00:00:00Z`).getUTCDay()]} {Number(d.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-normal">
                  <p className="max-w-36 truncate text-sm font-medium text-ink">{r.name}</p>
                  <p className="max-w-36 truncate text-xs text-slate-500">{r.dept ?? r.code}</p>
                </th>
                {r.days.map((d) => {
                  const key = `${r.id}|${d.date}`;
                  const v = cells.get(key) ?? "";
                  const dirty = initial.get(key) !== v;
                  const cur = v === "REST" ? null : v ? (shifts.find((x) => x.id === v) ?? null) : d.base;
                  const outside = outsideAvailability(cur, r.availability?.[new Date(`${d.date}T00:00:00Z`).getUTCDay()]);
                  return (
                    <td key={d.date} className="relative px-1 py-1.5">
                      {outside ? (
                        <span className="pointer-events-none absolute right-0.5 top-0.5 z-[1] size-2 rounded-full bg-slate-500 ring-2 ring-card" title="Outside availability" aria-hidden />
                      ) : null}
                      <select
                        aria-label={`${r.name} ${d.date}`}
                        title={[cur ? `${cur.name} ${cur.startTime}-${cur.endTime}` : "Rest day", d.holiday ? `Holiday: ${d.holiday.name}` : "", outside ? "Outside availability" : ""].filter(Boolean).join(" · ")}
                        data-outside={outside || undefined}
                        style={{ backgroundPosition: "right 6px center", backgroundSize: 12 }}
                        disabled={!r.editable || saving}
                        value={v}
                        onChange={(e) => setCells((m) => new Map(m).set(key, e.target.value))}
                        className={cn(
                          "select-chevron h-9 w-full min-w-[104px] appearance-none truncate rounded-lg border bg-card pl-2 pr-5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:cursor-not-allowed disabled:bg-canvas",
                          dirty ? "border-brand-600 ring-1 ring-brand-600" : v ? "border-ink font-semibold text-ink" : "border-hairline text-slate-500",
                          v === "REST" && "bg-bone",
                          d.holiday && "border-dashed",
                        )}
                      >
                        <option value="">{d.base ? d.base.name : "Rest day"}</option>
                        <option value="REST">Rest day</option>
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <div className="flex flex-wrap gap-2">
          <ConfirmButton action={() => copyLastWeekAction(week)} confirm="Replace this week's changes with last week's roster?" variant="secondary" size="sm">
            Copy last week
          </ConfirmButton>
          <ConfirmButton action={() => applyDefaultsAction(week)} confirm="Clear all changes this week so everyone works their default shift?" variant="ghost" size="sm">
            Apply default shifts
          </ConfirmButton>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500" aria-live="polite">
            {changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "Grey = usual shift"}
          </span>
          {changed.length ? (
            <Button variant="ghost" size="sm" onClick={() => setCells(initial)} disabled={saving}>
              Reset
            </Button>
          ) : null}
          <Button variant="brand" onClick={save} loading={saving} disabled={!changed.length}>
            Save schedule
          </Button>
        </div>
      </div>
    </>
  );
}
