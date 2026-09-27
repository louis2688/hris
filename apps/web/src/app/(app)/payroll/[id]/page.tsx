import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import type { PayslipLine } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { getRun } from "@/server/services/payroll";
import { computeRunAction, deleteRunAction, finalizeRunAction, markRunPaidAction } from "@/server/actions/payroll";
import { ConfirmButton } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fullName } from "@/lib/utils";
import { kindLabel, periodLabel, peso, RunStatusBadge } from "../_ui/format";

export const metadata: Metadata = { title: "Payroll run" };

const cents = (n: number) => Math.round(n * 100);

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const run = await getRun(id).catch(() => notFound());
  const slips = run.payslips.map((s) => {
    const lines = s.lines as unknown as PayslipLine[];
    const sum = (pred: (l: PayslipLine) => boolean) => lines.filter(pred).reduce((a, l) => a + cents(l.amount), 0) / 100;
    return {
      ...s,
      extra: sum((l) => l.kind === "earning" && !["BASIC", "ABSENT", "TARDY", "ALLOWANCE", "REIMBURSE"].includes(l.code)),
      due: sum((l) => l.code === "AMOUNT_DUE"),
      er: { sss: sum((l) => l.code === "SSS_ER" || l.code === "SSS_EC"), ph: sum((l) => l.code === "PHILHEALTH_ER"), hdmf: sum((l) => l.code === "PAGIBIG_ER") },
    };
  });
  const total = (f: (s: (typeof slips)[number]) => unknown) => slips.reduce((a, s) => a + cents(Number(f(s))), 0) / 100;
  const draft = run.status === "DRAFT";
  const has = slips.length > 0;
  const finalPay = run.kind === "FINAL_PAY";
  const separationId = run.separations[0]?.id;

  return (
    <>
      <Link href="/payroll" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink print:hidden">
        <ArrowLeft className="size-4" /> Payroll runs
      </Link>
      <PageHeader
        title={run.name}
        description={`${kindLabel(run.kind)} · ${periodLabel(run.periodStart, run.periodEnd)} · Pay date ${fmtDate(run.payDate)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <RunStatusBadge status={run.status} />
            {draft ? (
              <>
                <ConfirmButton action={deleteRunAction.bind(null, run.id)} confirm="Delete this draft run and its payslips?" variant="ghost" className="text-red-700">
                  Delete draft
                </ConfirmButton>
                {finalPay ? (
                  separationId ? (
                    <Link href={`/separations/${separationId}`} className={buttonVariants({ variant: "secondary" })}>
                      Edit on separation
                    </Link>
                  ) : null
                ) : (
                  <ConfirmButton action={computeRunAction.bind(null, run.id)} confirm={has ? "Recompute replaces every payslip in this run. Continue?" : "Compute payslips for all active employees with basic pay?"} variant={has ? "secondary" : "brand"}>
                    {has ? "Recompute" : "Compute payslips"}
                  </ConfirmButton>
                )}
                {has ? (
                  <ConfirmButton action={finalizeRunAction.bind(null, run.id)} confirm="Finalize? Payslips are locked, loan payments are posted and employees are notified." variant="brand">
                    Finalize
                  </ConfirmButton>
                ) : null}
              </>
            ) : null}
            {run.status === "FINALIZED" ? (
              <ConfirmButton action={markRunPaidAction.bind(null, run.id)} confirm="Mark this run as paid out?" variant="brand">
                Mark as paid
              </ConfirmButton>
            ) : null}
          </div>
        }
      />

      {has ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Employees" value={slips.length} />
            <Stat label="Gross pay" value={peso(total((s) => s.grossPay))} />
            <Stat label="Deductions" value={peso(total((s) => s.totalDeductions))} />
            <Stat label="Net pay" value={peso(total((s) => s.netPay))} />
          </div>

          <Card>
            <CardHeader
              title="Government remittances"
              description="Employee shares are withheld on payslips; employer shares are the company's cost."
              action={
                <a href={`/payroll/${run.id}/export?type=remittance`} className={buttonVariants({ variant: "secondary", size: "sm", className: "print:hidden" })}>
                  <Download /> Remittance CSV
                </a>
              }
            />
            <div className="grid grid-cols-2 divide-slate-100 sm:grid-cols-4 sm:divide-x">
              {[
                { label: "SSS (incl. MPF, EC)", ee: total((s) => s.sss), er: total((s) => s.er.sss) },
                { label: "PhilHealth", ee: total((s) => s.philhealth), er: total((s) => s.er.ph) },
                { label: "Pag-IBIG", ee: total((s) => s.pagibig), er: total((s) => s.er.hdmf) },
                { label: "Withholding tax", ee: total((s) => s.withholdingTax), er: 0 },
              ].map((g) => (
                <div key={g.label} className="px-5 py-4">
                  <p className="text-sm font-medium text-ink-muted">{g.label}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-ink sm:text-xl">{peso(g.ee + g.er)}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-500">{g.er ? `EE ${peso(g.ee)} · ER ${peso(g.er)}` : "Remit via BIR 1601-C"}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Payslips"
              action={
                <div className="flex flex-wrap gap-2 print:hidden">
                  <a href={`/payroll/${run.id}/export?type=register`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    <Download /> Register
                  </a>
                  {draft ? null : (
                    <a href={`/payroll/${run.id}/export?type=bank`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      <Download /> Bank file CSV
                    </a>
                  )}
                  <a href={`/payroll/${run.id}/export?type=gl`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    <Download /> GL journal CSV
                  </a>
                  <PrintButton label="Print" />
                </div>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH className="text-right">Basic</TH>
                  <TH className="text-right">OT, premiums &amp; other</TH>
                  <TH className="text-right">Gross</TH>
                  <TH className="text-right">Deductions</TH>
                  <TH className="text-right">Net pay</TH>
                </tr>
              </THead>
              <TBody>
                {slips.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={`/payslips/${s.id}`} className="font-medium text-ink hover:text-brand-700">
                        {fullName(s.employee)}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {s.employee.employeeCode} · {s.employee.payType === "DAILY" ? "Daily" : "Monthly"}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{peso(s.basicPay)}</TD>
                    <TD className="text-right tabular-nums">{s.extra ? peso(s.extra) : "-"}</TD>
                    <TD className="text-right tabular-nums">{peso(s.grossPay)}</TD>
                    <TD className="text-right tabular-nums">{peso(s.totalDeductions)}</TD>
                    <TD className="text-right font-semibold tabular-nums text-ink">
                      {peso(s.netPay)}
                      {s.due ? <span className="block text-xs font-medium text-tone-red-fg">Due from employee {peso(s.due)}</span> : null}
                    </TD>
                  </TR>
                ))}
                <tr className="bg-bone font-semibold text-ink">
                  <TD className="text-ink">Total</TD>
                  <TD className="text-right tabular-nums text-ink">{peso(total((s) => s.basicPay))}</TD>
                  <TD className="text-right tabular-nums text-ink">{peso(total((s) => s.extra))}</TD>
                  <TD className="text-right tabular-nums text-ink">{peso(total((s) => s.grossPay))}</TD>
                  <TD className="text-right tabular-nums text-ink">{peso(total((s) => s.totalDeductions))}</TD>
                  <TD className="text-right tabular-nums text-ink">{peso(total((s) => s.netPay))}</TD>
                </tr>
              </TBody>
            </Table>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            title={draft ? "No payslips yet" : "This run has no payslips"}
            description={
              !draft ? undefined
              : finalPay ? "Compute final pay from the separation page."
              : run.kind === "OFF_CYCLE" ? "Compute to pay one-off adjustments (bonuses, incentives) effective in this period. No basic pay, attendance or contributions."
              : "Compute to pull attendance, approved overtime, loans, expense claims, adjustments and HMO shares for every active employee with basic pay."
            }
          />
        </Card>
      )}
    </>
  );
}
