import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { CHECKLIST_KIND_LABELS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listChecklists, listQuery, startOptions } from "@/server/services/onboarding";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { cn, fmtDate, fullName, toSearchParams } from "@/lib/utils";
import { StartChecklistDialog } from "./client";

export const metadata: Metadata = { title: "Onboarding" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireSession();
  const staff = isStaff(user);
  const raw = await searchParams;
  const q = listQuery(raw);
  const [rows, opts] = await Promise.all([listChecklists(user, q), staff ? startOptions() : null]);
  const self = user.role === "EMPLOYEE";

  const href = (patch: Record<string, string | undefined>) => `/onboarding${toSearchParams({ kind: q.kind, overdue: q.overdue ? "1" : undefined, status: q.status === "completed" ? "completed" : undefined, ...patch })}`;
  const pill = (active: boolean) =>
    cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", active ? "bg-ink text-on-dark" : "bg-card text-slate-700 ring-1 ring-inset ring-hairline hover:bg-canvas");

  return (
    <>
      <PageHeader
        title={self ? "My checklist" : "Onboarding & offboarding"}
        description={self ? "Tasks to finish as you join (or leave) the company." : `${rows.length} ${q.status} checklist${rows.length === 1 ? "" : "s"}`}
        actions={
          opts ? (
            <StartChecklistDialog
              employees={opts.employees.map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }))}
              templates={opts.templates}
            />
          ) : undefined
        }
      />

      {self ? null : (
        <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-thin lg:mx-0 lg:px-0" aria-label="Filters">
          <Link href={href({ kind: undefined })} className={pill(!q.kind)}>
            All
          </Link>
          <Link href={href({ kind: "ONBOARDING" })} className={pill(q.kind === "ONBOARDING")}>
            Onboarding
          </Link>
          <Link href={href({ kind: "OFFBOARDING" })} className={pill(q.kind === "OFFBOARDING")}>
            Offboarding
          </Link>
          <span className="mx-1 w-px shrink-0 bg-hairline" aria-hidden />
          <Link href={href({ overdue: q.overdue ? undefined : "1" })} className={pill(q.overdue)} aria-pressed={q.overdue}>
            <AlertTriangle className="size-3.5" /> Overdue
          </Link>
          <Link href={href({ status: q.status === "completed" ? undefined : "completed" })} className={pill(q.status === "completed")} aria-pressed={q.status === "completed"}>
            Completed
          </Link>
        </nav>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={self ? "Nothing to do" : "No checklists here"}
            description={self ? "You have no open onboarding or offboarding tasks." : "Checklists start automatically for new hires and leavers when a default template exists."}
          />
        </Card>
      ) : (
        <ul className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <li key={c.id}>
                <Link href={`/onboarding/${c.id}`} className="block h-full rounded-2xl bg-card p-5 ring-1 ring-hairline transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
                  <div className="flex items-start gap-3">
                    <Avatar first={c.employee.firstName} last={c.employee.lastName} src={c.employee.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{fullName(c.employee)}</p>
                      <p className="truncate text-xs text-slate-500">{[c.employee.jobTitle?.name, c.employee.department?.name].filter(Boolean).join(" · ") || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between text-sm">
                    <span className="font-medium tabular-nums text-ink">
                      {c.done}/{c.total} done
                    </span>
                    {c.overdue ? <span className="text-xs font-medium text-tone-red-fg">{c.overdue} overdue</span> : c.completedAt ? <span className="text-xs text-tone-green-fg">Completed</span> : null}
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                    <div className={cn("h-2 rounded-full", pct === 100 ? "bg-[#2b9a66]" : "bg-ink")} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <Badge tone={c.kind === "ONBOARDING" ? "blue" : "violet"}>{CHECKLIST_KIND_LABELS[c.kind]}</Badge>
                    {c.template?.name ?? "Custom"} · {c.kind === "ONBOARDING" ? `Starts ${fmtDate(c.employee.hireDate)}` : `Last day ${fmtDate(c.employee.terminationDate ?? c.startedAt)}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
