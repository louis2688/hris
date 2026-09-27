"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { outsideAvailability, WEEKDAY_SHORT } from "@hris/shared";
import { applyDefaultsAction, copyLastWeekAction, saveRosterAction } from "@/server/actions/scheduling";
import { ConfirmButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One roster cell, slim on purpose: the page sends ids, not shift objects (85 people x 7 days adds up). */
export type RosterDay = { date: string; v: string; base: string | null; hol: string | null };
type Avail = Record<number, { fromTime: string | null; toTime: string | null }>;
type Row = { id: string; name: string; sub: string; editable: boolean; days: RosterDay[]; availability?: Avail };
type Shift = { id: string; name: string; startTime: string; endTime: string };
type Values = Record<string, string[]>;

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const initialValues = (rows: Row[]): Values => Object.fromEntries(rows.map((r) => [r.id, r.days.map((d) => d.v)]));

export function Roster({ week, today, days, shifts, rows }: { week: string; today: string; days: string[]; shifts: Shift[]; rows: Row[] }) {
  const router = useRouter();
  const initial = React.useMemo(() => initialValues(rows), [rows]);
  const [values, setValues] = React.useState(initial);
  React.useEffect(() => setValues(initial), [initial]); // server refresh after save / copy / defaults
  const [saving, start] = React.useTransition();
  const byId = React.useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const setCell = React.useCallback((id: string, i: number, v: string) => setValues((m) => ({ ...m, [id]: m[id]!.map((x, j) => (j === i ? v : x)) })), []);

  const changed = rows.flatMap((r) => r.days.flatMap((d, i) => (values[r.id]?.[i] !== initial[r.id]![i] ? [{ employeeId: r.id, date: d.date, value: values[r.id]![i]! }] : [])));

  function save() {
    start(async () => {
      const r = await saveRosterAction(changed);
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
                  {WEEKDAY_SHORT[dow(d)]} {Number(d.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <RosterRow key={r.id} row={r} values={values[r.id]!} initial={initial[r.id]!} shifts={shifts} byId={byId} disabled={!r.editable || saving} onChange={setCell} />
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
            <Button variant="ghost" size="sm" onClick={() => setValues(initial)} disabled={saving}>
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

/** Memoized: editing one cell re-renders one row, not the whole grid. */
const RosterRow = React.memo(function RosterRow({
  row: r,
  values,
  initial,
  shifts,
  byId,
  disabled,
  onChange,
}: {
  row: Row;
  values: string[];
  initial: string[];
  shifts: Shift[];
  byId: Map<string, Shift>;
  disabled: boolean;
  onChange: (id: string, i: number, v: string) => void;
}) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-normal">
        <p className="max-w-36 truncate text-sm font-medium text-ink">{r.name}</p>
        <p className="max-w-36 truncate text-xs text-slate-500">{r.sub}</p>
      </th>
      {r.days.map((d, i) => {
        const v = values[i]!;
        const base = d.base ? (byId.get(d.base) ?? null) : null;
        const cur = v === "REST" ? null : v ? (byId.get(v) ?? null) : base;
        const outside = outsideAvailability(cur, r.availability?.[dow(d.date)]);
        return (
          <td key={d.date} className="relative px-1 py-1.5">
            {outside ? <span className="pointer-events-none absolute right-0.5 top-0.5 z-[1] size-2 rounded-full bg-slate-500 ring-2 ring-card" title="Outside availability" aria-hidden /> : null}
            <Cell
              label={`${r.name} ${d.date}`}
              title={[cur ? `${cur.name} ${cur.startTime}-${cur.endTime}` : "Rest day", d.hol ? `Holiday: ${d.hol}` : "", outside ? "Outside availability" : ""].filter(Boolean).join(" · ")}
              value={v}
              baseName={base?.name ?? "Rest day"}
              curName={v === "REST" ? "Rest day" : (byId.get(v)?.name ?? "")}
              shifts={shifts}
              outside={outside}
              disabled={disabled}
              onChange={(nv) => onChange(r.id, i, nv)}
              className={cn(
                initial[i] !== v ? "border-brand-600 ring-1 ring-brand-600" : v ? "border-ink font-semibold text-ink" : "border-hairline text-slate-500",
                v === "REST" && "bg-bone",
                d.hol && "border-dashed",
              )}
            />
          </td>
        );
      })}
    </tr>
  );
});

/**
 * Native select that renders only its current option until hovered or focused, then the full list.
 * ponytail: keeps ~600 selects cheap (options were 3/4 of the DOM); virtualize rows if a roster passes ~1k people.
 */
function Cell({ label, title, value, baseName, curName, shifts, outside, disabled, onChange, className }: {
  label: string;
  title: string;
  value: string;
  baseName: string;
  curName: string;
  shifts: Shift[];
  outside: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
  className: string;
}) {
  const [open, setOpen] = React.useState(false);
  const arm = () => setOpen(true);
  return (
    <select
      aria-label={label}
      title={title}
      data-outside={outside || undefined}
      style={{ backgroundPosition: "right 6px center", backgroundSize: 12 }}
      disabled={disabled}
      value={value}
      onPointerEnter={arm}
      onFocus={arm}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "select-chevron h-9 w-full min-w-[104px] appearance-none truncate rounded-lg border bg-card pl-2 pr-5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:cursor-not-allowed disabled:bg-canvas",
        className,
      )}
    >
      <option value="">{baseName}</option>
      {open || value === "REST" ? <option value="REST">Rest day</option> : null}
      {open ? shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : value && value !== "REST" ? <option value={value}>{curName}</option> : null}
    </select>
  );
}
