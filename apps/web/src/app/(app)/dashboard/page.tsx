import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarClock, Clock, UserPlus, Users } from "lucide-react";
import { EMPLOYMENT_STATUS_LABELS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { dashboardStats } from "@/server/services/dashboard";
import { getBalances, pendingApprovalsFor } from "@/server/services/leave";
import { LeaveRequestList } from "@/components/leave-widgets";
import { markNotificationsReadAction } from "@/server/actions/leave";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { LeaveTypeDot } from "@/components/status-badge";
import { fmtDate, fmtDateTime, fmtDays, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireSession();
  const staff = isStaff(user);
  const manager = user.role === "MANAGER" || staff;
  const [s, balances, pending] = await Promise.all([
    dashboardStats(user),
    user.employeeId ? getBalances(user.employeeId, new Date().getUTCFullYear()) : Promise.resolve([]),
    user.role === "EMPLOYEE" ? Promise.resolve([]) : pendingApprovalsFor(user),
  ]);
  const active = s.byStatus.find((b) => b.employmentStatus === "ACTIVE")?._count._all ?? 0;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={fmtDate(new Date(), "EEEE, d MMMM yyyy")}
        actions={
          <Link href="/me/leave?new=1" className={buttonVariants()}>
            Request leave
          </Link>
        }
      />

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {manager ? (
          <>
            <Stat label={staff ? "Headcount" : "Team size"} value={s.headcount} hint={`${active} active`} icon={<Users />} />
            <Stat label="Pending approvals" value={s.pending} hint={s.pending ? "Needs your attention" : "All clear"} icon={<Clock />} />
            <Stat label="On leave today" value={s.onLeaveToday.length} icon={<CalendarClock />} />
            <Stat label="Recent hires" value={s.recentHires.length} hint="Last 90 days" icon={<UserPlus />} />
          </>
        ) : (
          balances.slice(0, 4).map((b) => (
            <Stat key={b.leaveTypeId} label={b.leaveTypeName} value={b.available} hint={`${b.used} used · ${b.pending} pending`} icon={<span className="block size-5 rounded-full" style={{ backgroundColor: b.color }} />} />
          ))
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {manager && pending.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Pending approvals ({pending.length})</h2>
                <Link href="/leave?status=PENDING" className="text-sm font-medium text-brand-600 hover:underline">
                  Review all
                </Link>
              </div>
              <LeaveRequestList items={pending.slice(0, 5)} emptyText="Nothing waiting." />
            </div>
          ) : null}

          <Card>
            <CardHeader title="Who is out" description="Approved leave today and coming up" />
            {s.onLeaveToday.length === 0 && s.upcoming.length === 0 ? (
              <EmptyState title="Nobody is on leave" description="Approved leave for today and the next 30 days shows here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...s.onLeaveToday, ...s.upcoming].map((r) => (
                  <li key={r.id}>
                    <Link href={`/leave/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <Avatar first={r.employee.firstName} last={r.employee.lastName} src={r.employee.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName(r.employee)}</p>
                        <p className="truncate text-xs text-slate-500">
                          <LeaveTypeDot color={r.leaveType.color} name={r.leaveType.name} /> · {fmtDate(r.startDate)}
                          {r.startDate.getTime() !== r.endDate.getTime() ? ` to ${fmtDate(r.endDate)}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-slate-500">{s.onLeaveToday.includes(r) ? "Today" : fmtDays(r.totalDays.toString())}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {staff && s.byDepartment.length ? (
            <Card>
              <CardHeader title="Headcount by department" />
              <CardBody className="space-y-3">
                {s.byDepartment.map((d) => {
                  const pct = s.headcount ? Math.round((d._count.employees / s.headcount) * 100) : 0;
                  return (
                    <div key={d.id}>
                      <div className="mb-1 flex justify-between text-sm">
                        <Link href={`/employees?departmentId=${d.id}`} className="font-medium text-slate-700 hover:text-brand-700">
                          {d.name}
                        </Link>
                        <span className="text-slate-500">{d._count.employees}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {user.employeeId && manager ? (
            <Card>
              <CardHeader title="My balances" action={<Link href="/me/leave" className="text-sm font-medium text-brand-700 hover:underline">Details</Link>} />
              <ul className="divide-y divide-slate-100">
                {balances.map((b) => (
                  <li key={b.leaveTypeId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <LeaveTypeDot color={b.color} name={b.leaveTypeName} />
                    <span className="font-medium">{b.available}</span>
                  </li>
                ))}
                {balances.length === 0 ? <li className="px-5 py-4 text-sm text-slate-500">No leave types configured.</li> : null}
              </ul>
            </Card>
          ) : null}

          <Card id="notifications">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Bell className="size-4 text-slate-400" /> Notifications
                </span>
              }
              action={
                s.notifications.length ? (
                  <form action={markNotificationsReadAction}>
                    <Button variant="ghost" size="sm" type="submit">
                      Mark all read
                    </Button>
                  </form>
                ) : null
              }
            />
            {s.notifications.length === 0 ? (
              <EmptyState title="You are all caught up" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.notifications.map((n) => (
                  <li key={n.id}>
                    <Link href={n.link ?? "#"} className="block px-5 py-3 hover:bg-slate-50">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body ? <p className="mt-0.5 text-xs text-slate-500">{n.body}</p> : null}
                      <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {manager && s.recentHires.length ? (
            <Card>
              <CardHeader title="Recent hires" />
              <ul className="divide-y divide-slate-100">
                {s.recentHires.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar first={e.firstName} last={e.lastName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/employees/${e.id}`} className="block truncate text-sm font-medium hover:text-brand-700">
                        {fullName(e)}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{e.jobTitle?.name ?? "-"}</p>
                    </div>
                    <span className="text-xs text-slate-500">{fmtDate(e.hireDate)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {manager && s.byStatus.length > 1 ? (
            <Card>
              <CardHeader title="Employment status" />
              <ul className="divide-y divide-slate-100">
                {s.byStatus.map((b) => (
                  <li key={b.employmentStatus} className="flex justify-between px-5 py-2.5 text-sm">
                    <span className="text-slate-600">{EMPLOYMENT_STATUS_LABELS[b.employmentStatus]}</span>
                    <span className="font-medium">{b._count._all}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
