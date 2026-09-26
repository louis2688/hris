import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@hris/db";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { pendingApprovalsFor } from "@/server/services/leave";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { LeaveRequestList } from "@/components/leave-widgets";
import { EmploymentStatusBadge } from "@/components/status-badge";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "My Team" };

export default async function TeamPage() {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const [reports, pending] = await Promise.all([
    user.employeeId
      ? prisma.employee.findMany({
          where: { managerId: user.employeeId, deletedAt: null },
          orderBy: [{ lastName: "asc" }],
          include: {
            jobTitle: { select: { name: true } },
            leaveRequests: { where: { status: "APPROVED", startDate: { lte: utcToday }, endDate: { gte: utcToday } }, select: { id: true, leaveType: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    pendingApprovalsFor(user),
  ]);

  return (
    <>
      <PageHeader title="My Team" description={isStaff(user) ? "Your direct reports and every pending request in the company" : "Your direct reports and their pending requests"} actions={<Link href="/leave/calendar" className={buttonVariants({ variant: "secondary" })}>Team calendar</Link>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LeaveRequestList items={pending} title={`Pending approvals (${pending.length})`} emptyText="Nothing waiting for your approval." />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Direct reports" description={`${reports.length} people`} />
          {reports.length === 0 ? (
            <EmptyState title="No direct reports" description="Employees whose manager is set to you will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/employees/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <Avatar first={r.firstName} last={r.lastName} src={r.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(r)}</p>
                      <p className="truncate text-xs text-slate-500">{r.jobTitle?.name ?? "-"}</p>
                    </div>
                    {r.leaveRequests[0] ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">On leave</span> : <EmploymentStatusBadge status={r.employmentStatus} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
