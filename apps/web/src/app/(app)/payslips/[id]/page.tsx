import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { PayslipLine } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { getPayslipFor } from "@/server/services/payroll";
import { getSetting } from "@/server/services/settings";
import { PrintButton } from "@/components/print-button";
import { Card } from "@/components/ui/card";
import { fmtDate, fullName } from "@/lib/utils";
import { periodLabel, peso, RunStatusBadge } from "../../payroll/_ui/format";

export const metadata: Metadata = { title: "Payslip" };

function Lines({ title, lines, total, totalLabel }: { title: string; lines: PayslipLine[]; total: number; totalLabel: string }) {
  return (
    <section className="flex flex-col">
      <h2 className="border-b border-hairline pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{title}</h2>
      <dl className="flex-1 divide-y divide-slate-100 text-sm">
        {lines.length === 0 ? <p className="py-2.5 text-slate-500">None</p> : null}
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-slate-700">
              {l.label}
              {l.qty ? <span className="ml-1.5 text-xs text-slate-500">({l.qty})</span> : null}
            </dt>
            <dd className={l.amount < 0 ? "tabular-nums text-red-700" : "tabular-nums text-ink"}>{peso(l.amount)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between border-t border-ink pt-2.5 text-sm font-semibold text-ink">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{peso(total)}</span>
      </div>
    </section>
  );
}

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const [slip, company] = await Promise.all([getPayslipFor(user, id).catch(() => notFound()), getSetting("company")]);
  const e = slip.employee;
  const staff = isStaff(user);
  const ids = [
    ["TIN", e.tin],
    ["SSS", e.sssNo],
    ["PhilHealth", e.philhealthNo],
    ["Pag-IBIG", e.pagibigNo],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={staff ? `/payroll/${slip.run.id}` : "/payslips"} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
          <ArrowLeft className="size-4" /> {staff ? slip.run.name : "Payslips"}
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>

      <Card className="p-5 sm:p-8 print:rounded-none print:p-0 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-5">
          <div>
            <p className="font-display text-xl font-bold leading-tight text-ink">{company.name}</p>
            {company.address ? <p className="mt-1 max-w-xs text-xs text-slate-500">{company.address}</p> : null}
            {company.tin ? <p className="text-xs text-slate-500">TIN {company.tin}</p> : null}
          </div>
          <div className="text-left sm:text-right">
            <p className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">Payslip</p>
            <p className="text-sm text-slate-600">{slip.run.kind === "REGULAR" ? periodLabel(slip.run.periodStart, slip.run.periodEnd) : slip.run.name}</p>
            <p className="text-xs text-slate-500">Pay date {fmtDate(slip.run.payDate)}</p>
            {staff && slip.run.status === "DRAFT" ? (
              <div className="mt-1.5 print:hidden">
                <RunStatusBadge status="DRAFT" />
              </div>
            ) : null}
          </div>
        </header>

        <div className="grid gap-4 border-b border-hairline py-5 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold text-ink">{fullName(e)}</p>
            <p className="text-slate-600">
              {e.employeeCode}
              {e.jobTitle ? ` · ${e.jobTitle.name}` : ""}
            </p>
            {e.department ? <p className="text-slate-500">{e.department.name}</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {ids.map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-mono text-ink">{v ?? "-"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-6 py-5 sm:grid-cols-2 sm:gap-8">
          <Lines title="Earnings" lines={slip.lines.filter((l) => l.kind === "earning")} total={Number(slip.grossPay)} totalLabel="Gross pay" />
          <Lines title="Deductions" lines={slip.lines.filter((l) => l.kind === "deduction")} total={Number(slip.totalDeductions)} totalLabel="Total deductions" />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-bone px-5 py-4 print:bg-transparent print:px-0">
          <p className="text-sm font-medium text-slate-700">Net pay</p>
          <p className="font-display text-3xl font-bold tracking-[-0.02em] tabular-nums text-ink">{peso(slip.netPay)}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-500">
          <p>
            YTD gross <span className="block font-medium tabular-nums text-ink">{peso(slip.ytd.gross)}</span>
          </p>
          <p>
            YTD tax <span className="block font-medium tabular-nums text-ink">{peso(slip.ytd.tax)}</span>
          </p>
          <p>
            YTD net <span className="block font-medium tabular-nums text-ink">{peso(slip.ytd.net)}</span>
          </p>
        </div>

        {company.signatoryName ? (
          <p className="mt-8 text-xs text-slate-500">
            <span className="block font-medium text-ink">{company.signatoryName}</span>
            {company.signatoryTitle}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
