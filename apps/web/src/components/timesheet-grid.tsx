"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addDaysIso, WEEKDAY_SHORT } from "@hris/shared";
import { saveTimesheetAction } from "@/server/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Entry = { projectId: string; activity: string | null; date: string; hours: number };
type Row = { key: string; projectId: string; activity: string; hours: string[] };

export function TimesheetGrid({ id, weekStart, entries, projects, readOnly }: { id: string; weekStart: string; entries: Entry[]; projects: { id: string; name: string }[]; readOnly: boolean }) {
  const router = useRouter();
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)), [weekStart]);
  const [rows, setRows] = React.useState<Row[]>(() => {
    const m = new Map<string, Row>();
    for (const e of entries) {
      const k = `${e.projectId}|${e.activity ?? ""}`;
      const r = m.get(k) ?? { key: k, projectId: e.projectId, activity: e.activity ?? "", hours: Array(7).fill("") };
      r.hours[days.indexOf(e.date)] = String(e.hours);
      m.set(k, r);
    }
    return m.size ? [...m.values()] : [{ key: "new-0", projectId: projects[0]?.id ?? "", activity: "", hours: Array(7).fill("") }];
  });
  const [pending, start] = React.useTransition();

  const colTotal = (i: number) => rows.reduce((s, r) => s + (Number(r.hours[i]) || 0), 0);
  const total = days.reduce((s, _, i) => s + colTotal(i), 0);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function save(submit: boolean) {
    const payload = rows.flatMap((r) => r.hours.map((h, i) => ({ projectId: r.projectId, activity: r.activity || undefined, date: days[i]!, hours: Number(h) || 0 })).filter((e) => e.hours > 0 && e.projectId));
    start(async () => {
      const res = await saveTimesheetAction(id, payload, submit);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">Project</th>
              <th className="px-3 py-2.5 text-left">Activity</th>
              {days.map((d, i) => (
                <th key={d} className={cn("w-16 px-1 py-2.5 text-center", i >= 5 && "text-slate-400")}>
                  {WEEKDAY_SHORT[(i + 1) % 7]}
                  <span className="block font-normal normal-case">{d.slice(8)}</span>
                </th>
              ))}
              <th className="w-16 px-2 py-2.5 text-right">Total</th>
              {!readOnly ? <th className="w-10" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-2 py-2">
                  {readOnly ? (
                    projects.find((p) => p.id === r.projectId)?.name ?? "-"
                  ) : (
                    <Select value={r.projectId} onChange={(e) => update(r.key, { projectId: e.target.value })} aria-label="Project" className="h-9 min-w-40">
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td className="px-2 py-2">
                  {readOnly ? r.activity || "-" : <Input value={r.activity} onChange={(e) => update(r.key, { activity: e.target.value })} placeholder="e.g. Development" aria-label="Activity" className="h-9 min-w-32" />}
                </td>
                {r.hours.map((h, i) => (
                  <td key={i} className="px-1 py-2">
                    {readOnly ? (
                      <span className="block text-center tabular-nums">{h || "-"}</span>
                    ) : (
                      <Input
                        value={h}
                        inputMode="decimal"
                        onChange={(e) => update(r.key, { hours: r.hours.map((x, j) => (j === i ? e.target.value.replace(/[^\d.]/g, "") : x)) })}
                        className="h-9 px-1 text-center tabular-nums"
                        aria-label={`Hours ${days[i]}`}
                      />
                    )}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-medium tabular-nums">{r.hours.reduce((s, h) => s + (Number(h) || 0), 0) || "-"}</td>
                {!readOnly ? (
                  <td className="px-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove row" className="text-slate-400 hover:text-red-600">
                      <Trash2 />
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50/60 font-medium">
            <tr>
              <td className="px-3 py-2.5" colSpan={2}>
                Total
              </td>
              {days.map((d, i) => (
                <td key={d} className="px-1 py-2.5 text-center tabular-nums">
                  {colTotal(i) || "-"}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right tabular-nums">{total}</td>
              {!readOnly ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4">
          <Button variant="ghost" onClick={() => setRows((rs) => [...rs, { key: `new-${Date.now()}`, projectId: projects[0]?.id ?? "", activity: "", hours: Array(7).fill("") }])} disabled={!projects.length}>
            <Plus /> Add row
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => save(false)} loading={pending}>
              Save draft
            </Button>
            <Button onClick={() => save(true)} loading={pending} disabled={total === 0}>
              Submit for approval
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
