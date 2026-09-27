"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { OrgPerson } from "@/server/services/org-chart";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import css from "./tree.module.css";

const DEFAULT_DEPTH = 2; // levels 0..1 open, so three levels show; keeps the DOM small for big orgs

export function OrgTree({ people, departments, linkable }: { people: OrgPerson[]; departments: { id: string; name: string }[]; linkable: boolean }) {
  const [dept, setDept] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [hit, setHit] = React.useState(0);
  const [focusId, setFocusId] = React.useState<string | null>(null);

  // In a department view, a person whose manager is outside it becomes a root.
  const { roots, loners, kids, parent } = React.useMemo(() => {
    const list = dept ? people.filter((p) => p.deptId === dept) : people;
    const ids = new Set(list.map((p) => p.id));
    const kids = new Map<string, OrgPerson[]>();
    const parent = new Map<string, string>();
    const roots: OrgPerson[] = [];
    for (const p of list) {
      if (p.managerId && ids.has(p.managerId) && p.managerId !== p.id) {
        (kids.get(p.managerId) ?? kids.set(p.managerId, []).get(p.managerId)!).push(p);
        parent.set(p.id, p.managerId);
      } else roots.push(p);
    }
    // A reporting loop (A -> B -> A) has no root; surface one member so nobody silently disappears.
    const seen = new Set<string>();
    const mark = (ps: OrgPerson[]) => ps.forEach((p) => seen.has(p.id) || (seen.add(p.id), mark(kids.get(p.id) ?? [])));
    mark(roots);
    for (const p of list) {
      if (seen.has(p.id)) continue;
      const sib = kids.get(parent.get(p.id)!);
      sib?.splice(sib.indexOf(p), 1);
      parent.delete(p.id);
      roots.push(p);
      mark([p]);
    }
    // Biggest tree first; people with no manager and no reports go to a compact list instead of widening the chart.
    const size = (id: string): number => (kids.get(id) ?? []).reduce((n, k) => n + 1 + size(k.id), 0);
    const sized = roots.map((r) => [r, size(r.id)] as const).sort((a, b) => b[1] - a[1]);
    const hasTree = sized.some(([, n]) => n > 0);
    return {
      roots: sized.filter(([, n]) => n > 0 || !hasTree).map(([r]) => r),
      loners: hasTree ? sized.filter(([, n]) => n === 0).map(([r]) => r) : [],
      kids,
      parent,
    };
  }, [people, dept]);

  const initialOpen = React.useCallback(() => {
    const open = new Set<string>();
    const walk = (ps: OrgPerson[], d: number) => {
      if (d >= DEFAULT_DEPTH) return;
      for (const p of ps) if (kids.has(p.id)) open.add(p.id), walk(kids.get(p.id)!, d + 1);
    };
    walk(roots, 0);
    return open;
  }, [roots, kids]);
  const [open, setOpen] = React.useState(initialOpen);
  React.useEffect(() => setOpen(initialOpen()), [initialOpen]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return people.filter((p) => (!dept || p.deptId === dept) && `${p.first} ${p.last}`.toLowerCase().includes(q));
  }, [people, query, dept]);

  const reveal = React.useCallback(
    (id: string) => {
      setOpen((o) => {
        const next = new Set(o);
        for (let a = parent.get(id), n = 0; a && n < 1000; a = parent.get(a), n++) next.add(a);
        return next;
      });
      setFocusId(id);
    },
    [parent],
  );

  React.useEffect(() => {
    if (!focusId) return;
    const t = requestAnimationFrame(() => document.getElementById(`org-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
    return () => cancelAnimationFrame(t);
  }, [focusId, open]);

  // Center the top person horizontally on first paint (the chart is wider than a phone).
  const scroller = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scroller.current;
    const top = roots[0] && document.getElementById(`org-${roots[0].id}`);
    if (!el || !top) return;
    const a = el.getBoundingClientRect();
    const b = top.getBoundingClientRect();
    el.scrollLeft += b.left + b.width / 2 - (a.left + a.width / 2);
  }, [roots]);

  const go = (i: number) => {
    if (!matches.length) return;
    const n = (i + matches.length) % matches.length;
    setHit(n);
    reveal(matches[n]!.id);
  };

  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const render = (ps: OrgPerson[]): React.ReactNode => (
    <ul>
      {ps.map((p) => {
        const children = kids.get(p.id);
        const isOpen = open.has(p.id);
        return (
          <li key={p.id}>
            <Node p={p} reports={children?.length ?? 0} open={isOpen} onToggle={() => toggle(p.id)} highlight={focusId === p.id} linkable={linkable} />
            {children && isOpen ? render(children) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <form
          className="relative"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(hit + (focusId === matches[hit]?.id ? 1 : 0));
          }}
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHit(0);
              setFocusId(null);
            }}
            placeholder="Find a person, then press Enter"
            className="pl-10 pr-24"
            aria-label="Find a person"
          />
          {query.trim().length >= 2 ? (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500" aria-live="polite">
              {matches.length ? `${hit + 1} of ${matches.length}` : "No match"}
            </span>
          ) : null}
        </form>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOpen(new Set(kids.keys()))} className="flex-1 sm:flex-none">
            Expand all
          </Button>
          <Button variant="ghost" onClick={() => setOpen(new Set())} className="flex-1 sm:flex-none">
            Collapse
          </Button>
        </div>
      </div>

      <div ref={scroller} className="overflow-x-auto rounded-2xl bg-white px-4 py-6 ring-1 ring-hairline scrollbar-thin sm:px-6">
        {roots.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Nobody in this department yet.</p>
        ) : (
          <div className={cn(css.tree, "mx-auto w-max min-w-full")}>{render(roots)}</div>
        )}
      </div>

      {loners.length ? (
        <details className="mt-6" open={loners.length <= 12 || loners.some((p) => p.id === focusId)}>
          <summary className="mb-3 cursor-pointer text-sm font-semibold text-slate-700">No manager set ({loners.length})</summary>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {loners.map((p) => (
              <li key={p.id} id={`org-${p.id}`} className={cn("flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-hairline", focusId === p.id && "ring-2 ring-brand-600")}>
                <Avatar first={p.first} last={p.last} src={p.avatarUrl} size="sm" />
                <span className="min-w-0">
                  {linkable ? (
                    <Link href={`/employees/${p.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand-700">
                      {p.first} {p.last}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-medium text-ink">
                      {p.first} {p.last}
                    </span>
                  )}
                  <span className="block truncate text-xs text-slate-500">{[p.title, p.dept].filter(Boolean).join(" · ") || "-"}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Node({ p, reports, open, onToggle, highlight, linkable }: { p: OrgPerson; reports: number; open: boolean; onToggle: () => void; highlight: boolean; linkable: boolean }) {
  const name = `${p.first} ${p.last}`;
  return (
    <div
      id={`org-${p.id}`}
      className={cn(
        "relative w-[196px] rounded-xl bg-white px-3 pb-3 pt-3 text-center ring-1 ring-hairline transition-shadow",
        highlight && "ring-2 ring-brand-600 shadow-float",
      )}
    >
      <Avatar first={p.first} last={p.last} src={p.avatarUrl} className="mx-auto" />
      {linkable ? (
        <Link href={`/employees/${p.id}`} className="mt-2 block truncate text-sm font-semibold text-ink hover:text-brand-700">
          {name}
        </Link>
      ) : (
        <p className="mt-2 truncate text-sm font-semibold text-ink">{name}</p>
      )}
      <p className="truncate text-xs text-slate-600">{p.title ?? "-"}</p>
      <p className="truncate text-[11px] text-slate-500">{p.dept ?? ""}</p>
      {reports ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${reports} direct report${reports === 1 ? "" : "s"} of ${name}`}
          className="absolute -bottom-3 left-1/2 z-10 inline-flex h-6 -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-2.5 text-[11px] font-semibold text-on-dark hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
        >
          {reports}
          {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      ) : null}
    </div>
  );
}
