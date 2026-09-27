import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { canDecide, canView, getExpense } from "@/server/services/requests";
import { Card, CardHeader } from "@/components/ui/card";
import { DL } from "@/components/profile";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { ActionsAside, DetailHeader, EmployeeStrip, peso } from "../../_ui/shared";

export const metadata: Metadata = { title: "Expense claim" };

export default async function ExpenseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const r = await getExpense(id).catch(() => null);
  if (!r || !canView(user, "expenses", r)) notFound();
  const pending = r.status === "PENDING";

  return (
    <div className="mx-auto max-w-4xl">
      <DetailHeader kind="expenses" title={`${r.category} · ${peso(r.amount)}`} description={`Filed ${fmtDateTime(r.createdAt)}`} status={r.status} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <EmployeeStrip e={r.employee} />
          <div className="px-5 py-4">
            <DL
              items={[
                ["Date", fmtDate(r.date, "EEE, d MMM yyyy")],
                ["Amount", <span key="a" className="font-semibold tabular-nums">{peso(r.amount)}</span>],
                ["Category", r.category],
                ["Approver", pending ? (r.employee.manager ? fullName(r.employee.manager) : "HR") : r.approver ? fullName(r.approver) : "HR"],
                ["Description", <span key="d" className="whitespace-pre-line">{r.description}</span>],
                ["Reimbursement", r.reimbursedIn ? `Reimbursed in ${r.reimbursedIn.name} (paid ${fmtDate(r.reimbursedIn.payDate)})` : r.status === "APPROVED" ? "Queued for the next payroll run" : null],
                ...(r.decidedAt ? ([["Decided", fmtDateTime(r.decidedAt)], ...(r.decisionNote ? [["Decision note", r.decisionNote]] : [])] as [string, React.ReactNode][]) : []),
              ]}
            />
          </div>
        </Card>
        <ActionsAside kind="expenses" id={r.id} decide={pending && canDecide(user, "expenses", r)} cancel={pending && (r.employeeId === user.employeeId || isStaff(user))}>
          <Card>
            <CardHeader title="Receipt" />
            <div className="px-5 py-4 text-sm">
              {r.receipt ? (
                <a href={`/api/v1/documents/${r.receipt.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium text-ink hover:text-brand-700">
                  <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="truncate">{r.receipt.name}</span>
                </a>
              ) : (
                <p className="text-slate-500">No receipt attached.</p>
              )}
            </div>
          </Card>
        </ActionsAside>
      </div>
    </div>
  );
}
