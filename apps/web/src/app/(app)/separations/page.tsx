import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SEPARATION_REASON_LABELS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { listSeparations, separationCandidates } from "@/server/services/separations";
import { today } from "@/server/services/payroll";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { cn, fmtDate, fullName } from "@/lib/utils";
import { SeparationBadges } from "./badges";
import { StartSeparationDialog } from "./client";

export const metadata: Metadata = { title: "Separations" };

const TABS = [
  ["open", "Open"],
  ["closed", "Closed"],
  ["all", "All"],
] as const;

export default async function SeparationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await gate("ADMIN", "HR");
  const status = (await searchParams).status ?? "open";
  const [rows, candidates] = await Promise.all([listSeparations(status), separationCandidates()]);
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <>
      <PageHeader
        title="Separations"
        description={overdue ? `${overdue} final pay${overdue > 1 ? "s are" : " is"} past the 30-day DOLE deadline` : "Clearance, exit interviews and final pay"}
        actions={<StartSeparationDialog employees={candidates.map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }))} today={today()} />}
      />
      <nav className="mb-4 flex gap-1.5" aria-label="Filter separations">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/separations?status=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", status === k ? "bg-ink text-on-dark" : "bg-card text-ink ring-1 ring-inset ring-hairline hover:bg-canvas")}>
            {label}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={status === "open" ? "No open separations" : "No separations"} description="Start one when an employee resigns or is let go. Clearance, final pay and the exit interview live here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/separations/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{fullName(s.employee)}</p>
                    <p className="text-xs text-slate-500">
                      {s.employee.employeeCode}
                      {s.employee.jobTitle ? ` · ${s.employee.jobTitle.name}` : ""} · {SEPARATION_REASON_LABELS[s.reason]} · Last day {fmtDate(s.lastDay)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                      <SeparationBadges status={s.status} deadline={s.deadline} overdue={s.overdue} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                      <SeparationBadges status={s.status} deadline={s.deadline} overdue={s.overdue} />
                    </div>
                    <ChevronRight className="size-4 text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
