import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso, DEFAULT_TIMEZONE, zonedParts } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { getOrCreateTimesheet, listProjects, myTimesheets, pendingTimesheets, weekOf } from "@/server/services/timesheets";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { TimesheetGrid } from "@/components/timesheet-grid";
import { fmtDate, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Timesheets" };

const TONE = { DRAFT: "slate", SUBMITTED: "amber", APPROVED: "green", REJECTED: "red" } as const;
const sum = (xs: { hours: unknown }[]) => xs.reduce((s, e) => s + Number(e.hours), 0);

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireSession();
  const { week } = await searchParams;
  const today = zonedParts(new Date(), DEFAULT_TIMEZONE).date;
  const ws = weekOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : today);
  const canApprove = user.role !== "EMPLOYEE";

  const [sheet, projects, history, pending] = await Promise.all([
    user.employeeId ? getOrCreateTimesheet(user.employeeId, ws) : null,
    listProjects(true),
    user.employeeId ? myTimesheets(user.employeeId) : [],
    canApprove ? pendingTimesheets(user) : [],
  ]);

  return (
    <>
      <PageHeader
        title="Timesheets"
        description={`Week of ${fmtDate(ws, "d MMM")} - ${fmtDate(addDaysIso(ws, 6), "d MMM yyyy")}`}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/timesheets?week=${addDaysIso(ws, -7)}`} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Previous week">
              <ChevronLeft />
            </Link>
            <Link href="/timesheets" className={buttonVariants({ variant: "secondary" })}>
              This week
            </Link>
            <Link href={`/timesheets?week=${addDaysIso(ws, 7)}`} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Next week">
              <ChevronRight />
            </Link>
          </div>
        }
      />
      <div className="space-y-6">
        {sheet ? (
          <Card>
            <CardHeader
              title="My week"
              description={sheet.status === "REJECTED" && sheet.decisionNote ? `Rejected: ${sheet.decisionNote}` : undefined}
              action={<Badge tone={TONE[sheet.status]}>{sheet.status.toLowerCase()}</Badge>}
            />
            {projects.length === 0 ? (
              <EmptyState title="No projects yet" description="HR needs to add projects (Settings > Projects) before hours can be logged." />
            ) : (
              <TimesheetGrid
                key={`${sheet.id}-${sheet.updatedAt.toISOString()}`}
                id={sheet.id}
                weekStart={ws}
                entries={sheet.entries.map((e) => ({ projectId: e.projectId, activity: e.activity, date: e.date.toISOString().slice(0, 10), hours: Number(e.hours) }))}
                projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                readOnly={sheet.status === "SUBMITTED" || sheet.status === "APPROVED"}
              />
            )}
          </Card>
        ) : null}

        {canApprove ? (
          <Card>
            <CardHeader title={`Waiting for approval (${pending.length})`} />
            {pending.length === 0 ? (
              <EmptyState title="Nothing to approve" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.map((t) => (
                  <li key={t.id}>
                    <Link href={`/timesheets/${t.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                      <span className="font-medium">{fullName(t.employee)}</span>
                      <span className="text-slate-500">Week of {fmtDate(t.weekStart)}</span>
                      <span className="tabular-nums">{sum(t.entries)} h</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {history.length ? (
          <Card>
            <CardHeader title="My history" />
            <ul className="divide-y divide-slate-100">
              {history.map((t) => (
                <li key={t.id}>
                  <Link href={`/timesheets?week=${t.weekStart.toISOString().slice(0, 10)}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                    <span>Week of {fmtDate(t.weekStart)}</span>
                    <span className="tabular-nums text-slate-500">{sum(t.entries)} h</span>
                    <Badge tone={TONE[t.status]}>{t.status.toLowerCase()}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
