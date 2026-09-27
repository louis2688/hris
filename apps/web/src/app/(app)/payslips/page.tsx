import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HeartPulse } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { listMyPayslips } from "@/server/services/payroll";
import { myBenefits } from "@/server/services/benefits";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";
import { kindLabel, periodLabel, peso } from "../payroll/_ui/format";

export const metadata: Metadata = { title: "Payslips" };

export default async function PayslipsPage() {
  const user = await requireSession();
  const [slips, benefits] = user.employeeId ? await Promise.all([listMyPayslips(user.employeeId), myBenefits(user.employeeId)]) : [[], []];
  const latest = slips[0];

  return (
    <>
      <PageHeader title="Payslips" description="Your released payslips. Open one to print or save as PDF." />
      {latest ? (
        <Card className="mb-6 bg-ink p-5 text-on-dark ring-0 sm:p-6">
          <p className="text-sm text-on-dark/70">Latest net pay · {fmtDate(latest.run.payDate)}</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-[-0.02em] tabular-nums">{peso(latest.netPay)}</p>
          <Link href={`/payslips/${latest.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-on-dark underline-offset-4 hover:underline">
            View payslip <ChevronRight className="size-4" />
          </Link>
        </Card>
      ) : null}
      {benefits.length ? (
        <Card className="mb-6">
          <CardHeader title="Your benefits" description="Your share is deducted from each payslip, split per cutoff." />
          <ul className="divide-y divide-slate-100">
            {benefits.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div className="flex min-w-0 gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bone text-ink">
                    <HeartPulse className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{b.plan}</p>
                    <p className="text-xs text-slate-500">
                      {b.provider}
                      {b.cardNo ? ` · Card ${b.cardNo}` : ""}
                      {b.dependents.length ? ` · Dependents: ${b.dependents.map((d) => d.name).join(", ")}` : ""}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-right text-sm tabular-nums text-ink">
                  {peso(b.monthlyEe)}
                  <span className="block text-xs text-slate-500">your share / month</span>
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="All payslips" />
        {slips.length === 0 ? (
          <EmptyState title="No payslips yet" description={user.employeeId ? "Payslips show up here once HR finalizes a payroll run." : "Your login is not linked to an employee record."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {slips.map((s) => (
              <li key={s.id}>
                <Link href={`/payslips/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{s.run.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.run.kind === "REGULAR" ? periodLabel(s.run.periodStart, s.run.periodEnd) : kindLabel(s.run.kind)} · Paid {fmtDate(s.run.payDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <div>
                      <p className="font-semibold tabular-nums text-ink">{peso(s.netPay)}</p>
                      <p className="text-xs tabular-nums text-slate-500">Gross {peso(s.grossPay)}</p>
                    </div>
                    <ChevronRight className="size-4 text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
