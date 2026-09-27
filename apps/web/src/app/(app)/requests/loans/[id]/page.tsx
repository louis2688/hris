import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOAN_TYPE_LABELS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { canDecide, canView, getLoan } from "@/server/services/requests";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DL } from "@/components/profile";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { ActionsAside, DetailHeader, EmployeeStrip, peso } from "../../_ui/shared";

export const metadata: Metadata = { title: "Loan" };

export default async function LoanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const r = await getLoan(id).catch(() => null);
  if (!r || !canView(user, "loans", r)) notFound();
  const pending = r.status === "PENDING";
  const live = r.status === "ACTIVE" || r.status === "PAID";
  const principal = Number(r.principal);
  const paid = live ? principal - Number(r.balance) : 0;
  const pct = principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <DetailHeader kind="loans" title={`${LOAN_TYPE_LABELS[r.type]} · ${peso(r.principal)}`} description={`Filed ${fmtDateTime(r.createdAt)}`} status={r.status} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <EmployeeStrip e={r.employee} />
            {live ? (
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Remaining balance</p>
                    <p className="mt-1 font-display text-3xl font-bold tabular-nums tracking-[-0.02em] text-ink">{peso(r.balance)}</p>
                  </div>
                  <p className="text-sm text-slate-500">{pct}% paid</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bone" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Repaid">
                  <div className="h-full rounded-full bg-[#2b9a66]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ) : null}
            <div className="px-5 py-4">
              <DL
                items={[
                  ["Type", LOAN_TYPE_LABELS[r.type]],
                  ["Principal", peso(r.principal)],
                  ["Per payroll", peso(r.amortization)],
                  ["Deductions start", fmtDate(r.startDate, "EEE, d MMM yyyy")],
                  ["Reason", r.reason],
                  ...(r.decidedAt ? ([["Decided", fmtDateTime(r.decidedAt)]] as [string, React.ReactNode][]) : []),
                ]}
              />
            </div>
          </Card>
          {live ? (
            <Card>
              <CardHeader title="Payments" description="Deducted automatically when payroll is finalized." />
              {r.payments.length === 0 ? (
                <EmptyState title="No payments yet" description="The first deduction happens in the payroll run on or after the start date." />
              ) : (
                <Table className="min-w-[420px]">
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Payroll run</TH>
                      <TH className="text-right">Amount</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {r.payments.map((p) => (
                      <TR key={p.id}>
                        <TD>{fmtDate(p.paidAt)}</TD>
                        <TD>{p.payslip?.run.name ?? p.note ?? "Manual payment"}</TD>
                        <TD className="text-right tabular-nums">{peso(p.amount)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          ) : null}
        </div>
        <ActionsAside kind="loans" id={r.id} decide={pending && canDecide(user, "loans", r)} cancel={pending && (r.employeeId === user.employeeId || isStaff(user))} decideHint="Approving activates the loan at the full principal." />
      </div>
    </div>
  );
}
