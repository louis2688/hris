"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickPerson = { id: string; name: string; deptId?: string | null; dept?: string | null };

/** Searchable checkbox list; posts one `name` value per checked person. Optional department quick-add chips. */
export function EmployeePicker({ name, people, max, departments }: { name: string; people: PickPerson[]; max?: number; departments?: { id: string; name: string }[] }) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const shown = people.filter((p) => `${p.name} ${p.dept ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const depts = departments?.filter((d) => people.some((p) => p.deptId === d.id));
  const full = max != null && picked.size >= max;
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const addDept = (deptId: string) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const p of people) if (p.deptId === deptId && (max == null || n.size < max)) n.add(p.id);
      return n;
    });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="pl-10" />
      </div>
      {depts?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {depts.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => addDept(d.id)}
              className="inline-flex items-center gap-1 rounded-full bg-bone px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-hairline hover:bg-canvas"
            >
              <Plus className="size-3" aria-hidden /> {d.name}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-inset ring-hairline scrollbar-thin">
        {shown.length === 0 ? <li className="px-4 py-3 text-sm text-slate-500">No matches</li> : null}
        {shown.map((p) => {
          const on = picked.has(p.id);
          return (
            <li key={p.id}>
              <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas", !on && full && "cursor-not-allowed opacity-50")}>
                <input type="checkbox" name={name} value={p.id} checked={on} disabled={!on && full} onChange={(e) => toggle(p.id, e.target.checked)} className="size-[18px] accent-ink" />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>
                {p.dept ? <span className="shrink-0 text-xs text-slate-500">{p.dept}</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500" aria-live="polite">
        {picked.size} selected{max != null ? ` (max ${max})` : ""}
      </p>
    </div>
  );
}
