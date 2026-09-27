import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { availabilityFor, listShiftChanges, listSwaps, manilaToday, mondayOf, mySchedule, roster, teammates } from "@/server/services/scheduling";
import { listShifts } from "@/server/services/attendance";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn, fmtDate, fullName } from "@/lib/utils";
import { Roster } from "./roster";
import { Swaps } from "./swaps";
import { ShiftChanges } from "./changes";
import { Availability } from "./availability";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await gate("EMPLOYEE", "MANAGER", "HR", "ADMIN");
  const sp = await searchParams;
  const today = manilaToday();
  const week = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today);
  const canRoster = user.role !== "EMPLOYEE";
  const [mine, swaps, mates, grid, changes, shifts, avail] = await Promise.all([
    user.employeeId ? mySchedule(user.employeeId, today) : [],
    listSwaps(user),
    teammates(user),
    canRoster ? roster(user, week) : null,
    listShiftChanges(user),
    listShifts(),
    user.employeeId ? availabilityFor([user.employeeId]) : null,
  ]);
  const weekLabel = `${fmtDate(week, "d MMM")} - ${fmtDate(addDaysIso(week, 6), "d MMM yyyy")}`;
  const nav = (w: string) => `/schedule?week=${w}`;

  return (
    <>
      <PageHeader title="Schedule" description={canRoster ? "Your shifts, swap requests, and your team's weekly roster." : "Your shifts for the next two weeks and swaps with teammates."} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="My schedule" description="Next 14 days" />
          {mine.length === 0 ? (
            <EmptyState title="No employee profile linked" description="Ask HR to link your login to an employee record." />
          ) : (
            <ol className="divide-y divide-slate-100" aria-label="My schedule">
              {mine.map((d) => (
                <li key={d.date} data-date={d.date} className={cn("flex items-center gap-3 px-5 py-2.5", d.date === today && "bg-canvas")}>
                  <div className="w-24 shrink-0">
                    <p className="text-sm font-medium text-ink">{fmtDate(d.date, "EEE d MMM")}</p>
                    {d.date === today ? <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Today</p> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {d.shift ? (
                      <>
                        <p className="truncate text-sm text-ink">{d.shift.name}</p>
                        <p className="font-mono text-xs text-slate-500 tabular-nums">
                          {d.shift.startTime}-{d.shift.endTime}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">Rest day</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {d.holiday ? <Badge tone="violet">{d.holiday.name}</Badge> : null}
                    {d.override ? <Badge tone="blue">Changed</Badge> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        {user.employeeId ? <Availability initial={avail?.get(user.employeeId) ?? {}} /> : null}
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Swaps
            meId={user.employeeId}
            today={today}
            teammates={mates.map((m) => ({ id: m.id, name: fullName(m) }))}
            mine={swaps.mine}
            toApprove={swaps.toApprove}
          />
          <ShiftChanges canRequest={!!user.employeeId} today={today} shifts={shifts.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime }))} mine={changes.mine} toApprove={changes.toApprove} />
        </div>
      </div>

      {grid ? (
        <Card className="mt-6">
          <CardHeader
            title="Team roster"
            description={`${weekLabel} · bold cells differ from the usual shift · a dot marks a shift outside the person's availability`}
            action={
              <div className="flex items-center gap-1">
                <Link href={nav(addDaysIso(week, -7))} className={buttonVariants({ variant: "secondary", size: "icon-sm" })} aria-label="Previous week">
                  <ChevronLeft />
                </Link>
                <Link href={nav(mondayOf(today))} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  This week
                </Link>
                <Link href={nav(addDaysIso(week, 7))} className={buttonVariants({ variant: "secondary", size: "icon-sm" })} aria-label="Next week">
                  <ChevronRight />
                </Link>
              </div>
            }
          />
          <Roster
            key={week}
            week={week}
            today={today}
            days={grid.days}
            shifts={grid.shifts}
            rows={grid.rows.map((r) => ({ id: r.id, name: fullName(r), code: r.employeeCode, dept: r.department?.name ?? null, editable: r.editable, days: r.days, availability: r.availability }))}
          />
        </Card>
      ) : null}
    </>
  );
}
