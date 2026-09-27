import type { Metadata } from "next";
import Link from "next/link";
import { ListPlus, Settings2, Users } from "lucide-react";
import { gate } from "@/server/auth/session";
import { listRuns, suggestNextRun } from "@/server/services/payroll";
import { buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import { kindLabel, periodLabel, peso, RunStatusBadge } from "./_ui/format";
import { NewRunDialog } from "./_ui/new-run";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  await gate("ADMIN", "HR");
  const [runs, next] = await Promise.all([listRuns(), suggestNextRun()]);
  const drafts = runs.filter((r) => r.status === "DRAFT").length;

  return (
    <>
      <PageHeader
        title="Payroll"
        description={drafts ? `${drafts} draft run${drafts > 1 ? "s" : ""} waiting to be finalized` : "Semi-monthly runs, payslips and government remittances"}
        actions={
          <>
            <Link href="/payroll/compensation" className={buttonVariants({ variant: "secondary" })}>
              <Users /> Compensation
            </Link>
            <Link href="/payroll/adjustments" className={buttonVariants({ variant: "secondary" })}>
              <ListPlus /> Adjustments
            </Link>
            <Link href="/settings/payroll" className={buttonVariants({ variant: "ghost" })}>
              <Settings2 /> Rates
            </Link>
            <NewRunDialog defaults={next} />
          </>
        }
      />
      <Card>
        {runs.length === 0 ? (
          <EmptyState title="No payroll runs yet" description="Set basic pay under Compensation, then create a run for the current cutoff." />
        ) : (
          <>
          {/* phones: stacked list; the full table scrolls sideways from sm up */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/payroll/${r.id}`} className="flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {kindLabel(r.kind)} · Pay {fmtDate(r.payDate)} · {r.headcount} employees
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-ink">{r.headcount ? peso(r.net) : "-"}</p>
                    <RunStatusBadge status={r.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Table className="hidden sm:table">
            <THead>
              <tr>
                <TH>Run</TH>
                <TH>Period</TH>
                <TH>Pay date</TH>
                <TH>Status</TH>
                <TH className="text-right">Employees</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Net</TH>
              </tr>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/payroll/${r.id}`} className="font-medium text-ink hover:text-brand-700">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {kindLabel(r.kind)} · {r.frequency === "MONTHLY" ? "Monthly" : "Semi-monthly"}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">{periodLabel(r.periodStart, r.periodEnd)}</TD>
                  <TD className="whitespace-nowrap">{fmtDate(r.payDate)}</TD>
                  <TD>
                    <RunStatusBadge status={r.status} />
                  </TD>
                  <TD className="text-right tabular-nums">{r.headcount}</TD>
                  <TD className="text-right tabular-nums">{r.headcount ? peso(r.gross) : "-"}</TD>
                  <TD className="text-right font-medium tabular-nums text-ink">{r.headcount ? peso(r.net) : "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </>
        )}
      </Card>
    </>
  );
}
