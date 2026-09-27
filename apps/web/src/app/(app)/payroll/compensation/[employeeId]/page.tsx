import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { gate } from "@/server/auth/session";
import { compensationHistory } from "@/server/services/payroll";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { cn, fmtDate, fullName } from "@/lib/utils";
import { peso } from "../../_ui/format";

export const metadata: Metadata = { title: "Salary history" };

export default async function SalaryHistoryPage({ params }: { params: Promise<{ employeeId: string }> }) {
  await gate("ADMIN", "HR");
  const { employeeId } = await params;
  const { employee: e, rows } = await compensationHistory(employeeId).catch(() => notFound());

  return (
    <>
      <Link href="/payroll/compensation" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft className="size-4" /> Compensation
      </Link>
      <PageHeader
        title={fullName(e)}
        description={[e.employeeCode, e.jobTitle?.name, e.department?.name, `Hired ${fmtDate(e.hireDate)}`].filter(Boolean).join(" · ")}
      />
      <Card className="max-w-3xl">
        <CardHeader title="Salary history" description={`${rows.length} record${rows.length === 1 ? "" : "s"}. Payroll pro-rates a change that lands inside a cutoff by calendar days.`} />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No salary history yet. Set basic pay under Compensation.</p>
        ) : (
          <ol className="relative px-5 py-5">
            {rows.map((r, k) => (
              <li key={r.id} className="relative flex gap-4 pb-6 last:pb-0" data-testid="salary-row">
                {k < rows.length - 1 ? <span className="absolute left-[7px] top-5 bottom-0 w-px bg-hairline" aria-hidden /> : null}
                <span className={cn("relative mt-1.5 size-[15px] shrink-0 rounded-full ring-4 ring-card", r.state === "current" ? "bg-ink" : r.state === "scheduled" ? "bg-tone-blue-fg" : "bg-slate-300")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{fmtDate(r.effectiveFrom)}</p>
                    {r.state === "current" ? <Badge tone="green">Current</Badge> : r.state === "scheduled" ? <Badge tone="blue">Scheduled</Badge> : null}
                    {r.changePct != null && r.changePct !== 0 ? (
                      <span className={cn("text-xs font-semibold tabular-nums", r.changePct > 0 ? "text-tone-green-fg" : "text-tone-red-fg")}>
                        {r.changePct > 0 ? "+" : ""}
                        {r.changePct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-ink">
                    {peso(r.basicPay)}
                    <span className="ml-1 text-sm font-normal text-slate-500">{r.payType === "DAILY" ? "per day" : "per month"}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {r.allowance ? `Allowance ${peso(r.allowance)} / month` : "No allowance"}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                  {r.by ? <p className="text-xs text-slate-500">Recorded by {r.by}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
