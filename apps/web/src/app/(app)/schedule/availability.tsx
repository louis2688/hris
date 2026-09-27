"use client";

import * as React from "react";
import { toast } from "sonner";
import { WEEKDAY_SHORT } from "@hris/shared";
import { saveAvailabilityAction } from "@/server/actions/scheduling";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Day = { mode: "ANY" | "OFF" | "CUSTOM"; from: string; to: string };
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const field = "h-9 rounded-full border border-hairline bg-card px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus";

/** Weekly availability: any time (no row), unavailable (null times) or a from-to window. */
export function Availability({ initial }: { initial: Record<number, { fromTime: string | null; toTime: string | null }> }) {
  const start = React.useMemo(
    () =>
      Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((w) => {
          const a = initial[w];
          return [w, !a ? { mode: "ANY", from: "09:00", to: "18:00" } : a.fromTime ? { mode: "CUSTOM", from: a.fromTime, to: a.toTime ?? "18:00" } : { mode: "OFF", from: "09:00", to: "18:00" }];
        }),
      ) as Record<number, Day>,
    [initial],
  );
  const [days, setDays] = React.useState(start);
  const [pending, run] = React.useTransition();
  const dirty = JSON.stringify(days) !== JSON.stringify(start);
  const set = (w: number, patch: Partial<Day>) => setDays((d) => ({ ...d, [w]: { ...d[w]!, ...patch } }));

  const save = () =>
    run(async () => {
      const payload = ORDER.filter((w) => days[w]!.mode !== "ANY").map((w) => ({ weekday: w, fromTime: days[w]!.mode === "CUSTOM" ? days[w]!.from : null, toTime: days[w]!.mode === "CUSTOM" ? days[w]!.to : null }));
      const r = await saveAvailabilityAction(payload);
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader title="My availability" description="Your manager sees a marker when a scheduled shift falls outside it." />
      <ul className="divide-y divide-slate-100" aria-label="Weekly availability">
        {ORDER.map((w) => {
          const d = days[w]!;
          return (
            <li key={w} className="flex flex-wrap items-center gap-2 px-5 py-2">
              <span className="w-10 text-sm font-medium text-ink">{WEEKDAY_SHORT[w]}</span>
              <select aria-label={`${WEEKDAY_SHORT[w]} availability`} value={d.mode} onChange={(e) => set(w, { mode: e.target.value as Day["mode"] })} className={cn(field, "select-chevron appearance-none pr-8")} style={{ backgroundPosition: "right 10px center", backgroundSize: 14 }}>
                <option value="ANY">Any time</option>
                <option value="CUSTOM">Between</option>
                <option value="OFF">Unavailable</option>
              </select>
              {d.mode === "CUSTOM" ? (
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <input type="time" aria-label={`${WEEKDAY_SHORT[w]} from`} value={d.from} onChange={(e) => set(w, { from: e.target.value })} className={field} />
                  to
                  <input type="time" aria-label={`${WEEKDAY_SHORT[w]} to`} value={d.to} onChange={(e) => set(w, { to: e.target.value })} className={field} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>
          Save availability
        </Button>
      </div>
    </Card>
  );
}
