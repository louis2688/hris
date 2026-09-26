import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DAY_PART_LABELS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { canAccessEmployee, isStaff } from "@/server/authz";
import { canDecide, getBalances, getLeaveRequest } from "@/server/services/leave";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { LeaveStatusBadge, LeaveTypeDot } from "@/components/status-badge";
import { DL } from "@/components/profile";
import { fmtDate, fmtDateTime, fmtDays, fullName } from "@/lib/utils";
import { CancelForm, CommentForm, DecisionForm } from "./forms";

export const metadata: Metadata = { title: "Leave request" };

export default async function LeaveRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const r = await getLeaveRequest(id).catch(() => null);
  if (!r || !(await canAccessEmployee(user, r.employeeId))) notFound();

  const own = r.employeeId === user.employeeId;
  const decide = r.status === "PENDING" && canDecide(user, r);
  const cancellable = (r.status === "PENDING" || r.status === "APPROVED") && (isStaff(user) || (own && (r.status === "PENDING" || r.startDate > new Date())));
  const balance = decide ? (await getBalances(r.employeeId, r.startDate.getUTCFullYear())).find((b) => b.leaveTypeId === r.leaveTypeId) : null;
  const halfDay = r.startDayPart !== "FULL" || r.endDayPart !== "FULL";

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm">
        <Link href={own ? "/me/leave" : "/leave"} className="text-slate-500 hover:text-brand-700">
          {own ? "My Leave" : "Leave requests"}
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">Request</span>
      </p>
      <PageHeader
        title={`${r.leaveType.name} request`}
        description={`Submitted ${fmtDateTime(r.createdAt)}`}
        actions={<LeaveStatusBadge status={r.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardBody className="flex items-center gap-3 border-b border-slate-100">
              <Avatar first={r.employee.firstName} last={r.employee.lastName} src={r.employee.avatarUrl} size="lg" />
              <div className="min-w-0">
                <Link href={`/employees/${r.employee.id}`} className="block truncate font-medium hover:text-brand-700">
                  {fullName(r.employee)}
                </Link>
                <p className="truncate text-sm text-slate-500">
                  {r.employee.employeeCode}
                  {r.employee.department ? ` · ${r.employee.department.name}` : ""}
                </p>
              </div>
            </CardBody>
            <CardBody>
              <DL
                cols={2}
                items={[
                  ["Type", <LeaveTypeDot key="t" color={r.leaveType.color} name={r.leaveType.name} />],
                  ["Duration", fmtDays(r.totalDays.toString())],
                  ["From", `${fmtDate(r.startDate, "EEE, d MMM yyyy")}${halfDay && r.startDayPart !== "FULL" ? ` (${DAY_PART_LABELS[r.startDayPart]})` : ""}`],
                  ["To", `${fmtDate(r.endDate, "EEE, d MMM yyyy")}${halfDay && r.endDayPart !== "FULL" ? ` (${DAY_PART_LABELS[r.endDayPart]})` : ""}`],
                  ["Reason", r.reason],
                  ["Manager", r.employee.manager ? fullName(r.employee.manager) : "Unassigned"],
                  ...(r.decidedAt ? ([["Decided", `${fmtDateTime(r.decidedAt)}${r.approver ? ` by ${fullName(r.approver)}` : ""}`], ["Decision note", r.decisionNote]] as [string, React.ReactNode][]) : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <ol className="divide-y divide-slate-100">
              {r.events.map((ev) => (
                <li key={ev.id} className="flex gap-3 px-5 py-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium">{ev.actor?.employee ? fullName(ev.actor.employee) : ev.actor?.email ?? "System"}</span>{" "}
                      <span className="text-slate-600">{ev.action.toLowerCase()}</span>
                    </p>
                    {ev.note ? <p className="mt-0.5 whitespace-pre-line text-slate-700">{ev.note}</p> : null}
                    <p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(ev.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <CardBody className="border-t border-slate-100">
              <CommentForm id={r.id} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {decide ? (
            <Card>
              <CardHeader title="Decision" description={balance ? `${balance.available} day(s) available after this request` : undefined} />
              <CardBody>
                <DecisionForm id={r.id} />
              </CardBody>
            </Card>
          ) : null}
          {cancellable ? (
            <Card>
              <CardHeader title="Cancel request" description={r.status === "APPROVED" ? "Days will be returned to the balance." : undefined} />
              <CardBody>
                <CancelForm id={r.id} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
