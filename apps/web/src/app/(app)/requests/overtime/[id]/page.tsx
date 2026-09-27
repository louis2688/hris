import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { canDecide, canView, getOvertime } from "@/server/services/requests";
import { Card } from "@/components/ui/card";
import { DL } from "@/components/profile";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { ActionsAside, DetailHeader, EmployeeStrip, hours } from "../../_ui/shared";

export const metadata: Metadata = { title: "Overtime request" };

export default async function OvertimeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const r = await getOvertime(id).catch(() => null);
  if (!r || !canView(user, "overtime", r)) notFound();
  const pending = r.status === "PENDING";

  return (
    <div className="mx-auto max-w-4xl">
      <DetailHeader kind="overtime" title={`Overtime · ${hours(r.minutes)}`} description={`Filed ${fmtDateTime(r.createdAt)}`} status={r.status} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <EmployeeStrip e={r.employee} />
          <div className="px-5 py-4">
            <DL
              items={[
                ["Date", fmtDate(r.date, "EEE, d MMM yyyy")],
                ["Time", `${r.startTime} to ${r.endTime}${r.endTime <= r.startTime ? " (next day)" : ""}`],
                ["Duration", hours(r.minutes)],
                ["Approver", r.status === "PENDING" ? (r.employee.manager ? fullName(r.employee.manager) : "HR") : r.approver ? fullName(r.approver) : "HR"],
                ["Reason", <span key="r" className="whitespace-pre-line">{r.reason}</span>],
                ...(r.decidedAt ? ([["Decided", fmtDateTime(r.decidedAt)], ...(r.decisionNote ? [["Decision note", r.decisionNote]] : [])] as [string, React.ReactNode][]) : []),
              ]}
            />
          </div>
        </Card>
        <ActionsAside kind="overtime" id={r.id} decide={pending && canDecide(user, "overtime", r)} cancel={pending && (r.employeeId === user.employeeId || isStaff(user))} decideHint="Approved overtime is paid in the next payroll run." />
      </div>
    </div>
  );
}
