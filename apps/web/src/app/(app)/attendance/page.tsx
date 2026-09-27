import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso, CORRECTION_MAX_DAYS_BACK, minToHhmm, PUNCH_METHOD_LABELS, zonedParts } from "@hris/shared";
import { prisma } from "@hris/db";
import { requireSession } from "@/server/auth/session";
import { canAccessEmployee, isStaff } from "@/server/authz";
import { dtrForMonth, todaysPunches } from "@/server/services/attendance";
import { getSetting } from "@/server/services/settings";
import { pendingCorrectionDates } from "@/server/services/timeoff";
import { AppError } from "@/server/services/errors";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PunchCard } from "@/components/punch-card";
import { DtrTable, DtrTotalsBar } from "@/components/dtr-table";
import { PrintButton } from "@/components/print-button";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

const shiftMonth = (m: string, n: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; employeeId?: string }> }) {
  const user = await requireSession();
  const sp = await searchParams;
  const employeeId = sp.employeeId ?? user.employeeId;
  if (!employeeId) {
    return (
      <Card>
        <EmptyState title="No employee profile linked" description="Ask HR to link your login to an employee record." />
      </Card>
    );
  }
  if (!(await canAccessEmployee(user, employeeId))) notFound();
  const own = employeeId === user.employeeId;

  const todayIso = zonedParts(new Date(), "Asia/Manila").date;
  const tzNow = todayIso.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : tzNow;
  const fixFrom = addDaysIso(todayIso, -CORRECTION_MAX_DAYS_BACK);
  const fixTo = addDaysIso(todayIso, -1);
  const [emp, dtr, today, policy, passkeys, pendingFix] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true, preferredName: true, employeeCode: true, department: { select: { name: true } } } }),
    // Runs alongside the emp lookup; a missing employee 404s below instead of hitting the error boundary.
    dtrForMonth(employeeId, month).catch((e) => (e instanceof AppError && e.status === 404 ? null : Promise.reject(e))),
    own ? todaysPunches(employeeId) : null,
    getSetting("attendance"),
    own ? prisma.passkey.count({ where: { userId: user.id } }) : 0,
    own ? pendingCorrectionDates(employeeId, fixFrom, fixTo) : null,
  ]);
  if (!emp || !dtr) notFound();
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const q = (m: string) => `/attendance?month=${m}${sp.employeeId ? `&employeeId=${sp.employeeId}` : ""}`;
  const punchLinks = new Map(
    [...dtr.punchesByDay].map(([d, ps]) => [
      d,
      ps.map((p) => ({ id: p.id, time: minToHhmm(zonedParts(p.at, dtr.timeZone).minutes), method: PUNCH_METHOD_LABELS[p.method], hasPhoto: dtr.withPhoto.has(p.id) })),
    ]),
  );

  return (
    <>
      <PageHeader
        title={own ? "Attendance" : `DTR - ${fullName(emp)}`}
        description={`${emp.employeeCode}${emp.department ? ` · ${emp.department.name}` : ""} · Shift ${dtr.shift.name} ${dtr.shift.startTime}-${dtr.shift.endTime}`}
        actions={
          <div className="flex flex-wrap items-center gap-1 print:hidden">
            <Link href={q(shiftMonth(month, -1))} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Previous month">
              <ChevronLeft />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold">{monthLabel}</span>
            <Link href={q(shiftMonth(month, 1))} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Next month">
              <ChevronRight />
            </Link>
            <PrintButton />
            <Link href="/attendance/corrections" className={buttonVariants({ variant: "secondary" })}>
              Corrections
            </Link>
            {isStaff(user) ? (
              <Link href="/attendance/import" className={buttonVariants({ variant: "secondary" })}>
                Import
              </Link>
            ) : null}
          </div>
        }
      />
      <p className="mb-4 hidden text-sm print:block">
        Daily Time Record · {fullName(emp)} ({emp.employeeCode}) · {monthLabel}
      </p>

      {own && today ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-5 print:hidden">
          <div className="lg:col-span-2">
            <PunchCard
              clockedIn={today.clockedIn}
              since={today.punches.at(-1)?.at.toISOString() ?? null}
              shiftLabel={`${today.shift.startTime}-${today.shift.endTime}`}
              timeZone={today.timeZone}
              policy={policy}
              hasPasskey={passkeys > 0}
            />
          </div>
          <Card className="lg:col-span-3">
            <CardHeader title="Today" description={today.day} />
            {today.punches.length === 0 ? (
              <EmptyState title="No punches yet today" />
            ) : (
              <ol className="divide-y divide-slate-100">
                {today.punches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium">{p.direction === "OUT" ? "Clock out" : "Clock in"}</span>
                    <span className="text-slate-500">{PUNCH_METHOD_LABELS[p.method]}</span>
                    <span className="font-mono tabular-nums">{minToHhmm(zonedParts(p.at, today.timeZone).minutes)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      ) : null}

      <div className="space-y-4">
        <DtrTotalsBar totals={dtr.totals} />
        <DtrTable rows={dtr.rows} punchLinks={punchLinks} fix={pendingFix ? { from: fixFrom, to: fixTo, pending: pendingFix } : undefined} />
      </div>
    </>
  );
}
