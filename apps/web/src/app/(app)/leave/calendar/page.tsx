import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eachDay, toISODate } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { visibleEmployeeIds } from "@/server/authz";
import { leaveInWindow } from "@/server/services/leave";
import { holidayDatesFor } from "@/server/services/org";
import { Card, PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const { m } = await searchParams;
  const now = new Date();
  const [y, mo] = (m && /^\d{4}-\d{2}$/.test(m) ? m : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`).split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const last = new Date(Date.UTC(y, mo, 0));
  const days = eachDay(toISODate(first), toISODate(last));
  const scope = await visibleEmployeeIds(user);
  const [requests, holidays] = await Promise.all([leaveInWindow(first, last, scope), holidayDatesFor(null, first, last)]);
  const hol = new Set(holidays);

  // Group by employee
  const byEmp = new Map<string, { emp: (typeof requests)[number]["employee"]; days: Map<string, (typeof requests)[number]> }>();
  for (const r of requests) {
    const g = byEmp.get(r.employeeId) ?? { emp: r.employee, days: new Map() };
    for (const d of eachDay(toISODate(r.startDate), toISODate(r.endDate))) if (days.includes(d)) g.days.set(d, r);
    byEmp.set(r.employeeId, g);
  }
  const rows = [...byEmp.values()].sort((a, b) => a.emp.lastName.localeCompare(b.emp.lastName));
  const prev = new Date(Date.UTC(y, mo - 2, 1));
  const next = new Date(Date.UTC(y, mo, 1));
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const todayISO = toISODate(new Date());

  return (
    <>
      <PageHeader
        title="Leave calendar"
        description={first.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" })}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/leave/calendar?m=${ym(prev)}`} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Previous month">
              <ChevronLeft />
            </Link>
            <Link href="/leave/calendar" className={buttonVariants({ variant: "secondary" })}>
              Today
            </Link>
            <Link href={`/leave/calendar?m=${ym(next)}`} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Next month">
              <ChevronRight />
            </Link>
          </div>
        }
      />
      <Card className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 min-w-[160px] bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">Employee</th>
              {days.map((d) => {
                const dt = new Date(d);
                const wk = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                return (
                  <th key={d} className={cn("min-w-[28px] px-0 py-1.5 text-center font-normal", wk || hol.has(d) ? "text-slate-300" : "text-slate-600", d === todayISO && "text-brand-700 font-semibold")} title={hol.has(d) ? "Public holiday" : undefined}>
                    <span className="block text-[10px] uppercase">{"SMTWTFS"[dt.getUTCDay()]}</span>
                    {dt.getUTCDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={days.length + 1} className="px-4 py-10 text-center text-sm text-slate-500">
                  No leave this month.
                </td>
              </tr>
            ) : (
              rows.map(({ emp, days: ed }) => (
                <tr key={emp.id}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                    <Link href={`/employees/${emp.id}`} className="flex items-center gap-2 hover:text-brand-700">
                      <Avatar first={emp.firstName} last={emp.lastName} src={emp.avatarUrl} size="sm" />
                      <span className="truncate text-sm">{fullName(emp)}</span>
                    </Link>
                  </td>
                  {days.map((d) => {
                    const r = ed.get(d);
                    const dt = new Date(d);
                    const off = dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || hol.has(d);
                    return (
                      <td key={d} className={cn("h-9 p-0.5", off && "bg-slate-50/70")}>
                        {r ? (
                          <Link
                            href={`/leave/${r.id}`}
                            title={`${r.leaveType.name} (${r.status.toLowerCase()})`}
                            className={cn("block h-full w-full rounded", r.status === "PENDING" && "opacity-50 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.6)_3px,rgba(255,255,255,.6)_6px)]")}
                            style={{ backgroundColor: r.leaveType.color }}
                          >
                            <span className="sr-only">{r.leaveType.name}</span>
                          </Link>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">Solid = approved, striped = pending. Grey columns are weekends and public holidays.</p>
    </>
  );
}
