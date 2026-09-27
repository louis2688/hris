import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { CASE_STATUSES, CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { caseCounts, listCases } from "@/server/services/cases";
import { employeeOptions } from "@/server/services/employees";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { cn, fmtDate, fullName } from "@/lib/utils";
import { CaseBadges } from "./badges";
import { NewCaseDialog } from "./client";

export const metadata: Metadata = { title: "Cases" };

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await gate("ADMIN", "HR");
  const { status = "ACTIVE", q } = await searchParams;
  const [rows, counts, emps] = await Promise.all([listCases(user, { status, q }), caseCounts(user), employeeOptions()]);
  const active = Object.entries(counts.byStatus).reduce((a, [k, n]) => (k === "CLOSED" ? a : a + (n ?? 0)), 0);
  const tabs: [string, string, number | undefined][] = [
    ["ACTIVE", "Active", active],
    ["OVERDUE", "Explanation overdue", counts.overdue],
    ...CASE_STATUSES.map((s) => [s, CASE_STATUS_LABELS[s], counts.byStatus[s]] as [string, string, number | undefined]),
    ["ALL", "All", undefined],
  ];

  return (
    <>
      <PageHeader
        title="Cases"
        description="Grievances, incidents and disciplinary cases with twin-notice due process"
        actions={<NewCaseDialog employees={emps.map((e) => ({ id: e.id, name: `${e.preferredName ?? e.firstName} ${e.lastName} (${e.employeeCode})` }))} />}
      />
      <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filter cases">
        {tabs.map(([k, label, n]) => (
          <Link
            key={k}
            href={`/cases?status=${k}`}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold", status === k ? "bg-ink text-on-dark" : "bg-card text-ink ring-1 ring-inset ring-hairline hover:bg-canvas")}
          >
            {label}
            {n ? <span className="ml-1.5 tabular-nums opacity-70">{n}</span> : null}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No cases here" description="Open a case to track an incident, grievance or disciplinary matter from the Notice to Explain to the decision." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/cases/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                      {c.confidential ? <Lock className="size-3.5 shrink-0 text-slate-400" aria-label="Confidential" /> : null}
                      <span className="truncate">{c.title}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {fullName(c.employee)} · {c.employee.employeeCode} · {CASE_TYPE_LABELS[c.type]} · Opened {fmtDate(c.createdAt)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                      <CaseBadges status={c.status} nteDueAt={c.nteDueAt} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                      <CaseBadges status={c.status} nteDueAt={c.nteDueAt} />
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
