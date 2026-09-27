import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ADJUSTMENT_CODE_LABELS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { employeeOptions } from "@/server/services/employees";
import { listAdjustments, today, type AdjustmentFilter } from "@/server/services/payroll";
import { deleteAdjustmentAction } from "@/server/actions/payroll";
import { ConfirmButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fullName } from "@/lib/utils";
import { peso } from "../_ui/format";
import { AddAdjustmentDialog, ImportDialog } from "./client";

export const metadata: Metadata = { title: "Payroll adjustments" };

const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await gate("ADMIN", "HR");
  const sp = await searchParams;
  const f: AdjustmentFilter = { employeeId: sp.employee || undefined, status: pick(sp.status, ["pending", "applied"] as const), recurring: pick(sp.recurring, ["yes", "no"] as const) };
  const [rows, emps] = await Promise.all([listAdjustments(f), employeeOptions()]);
  const opts = emps.map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }));

  return (
    <>
      <Link href="/payroll" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft className="size-4" /> Payroll runs
      </Link>
      <PageHeader
        title="Adjustments"
        description="Bonuses, incentives, arrears and deductions picked up by payroll runs"
        actions={
          <>
            <ImportDialog />
            <AddAdjustmentDialog employees={opts} today={today()} />
          </>
        }
      />
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4" method="get">
          <label className="min-w-0 flex-1 basis-56 text-xs font-medium text-slate-600">
            Employee
            <Select name="employee" defaultValue={f.employeeId ?? ""} className="mt-1">
              <option value="">Everyone</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="basis-36 text-xs font-medium text-slate-600">
            Status
            <Select name="status" defaultValue={f.status ?? ""} className="mt-1">
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="applied">Paid</option>
            </Select>
          </label>
          <label className="basis-36 text-xs font-medium text-slate-600">
            Schedule
            <Select name="recurring" defaultValue={f.recurring ?? ""} className="mt-1">
              <option value="">Any</option>
              <option value="no">One-off</option>
              <option value="yes">Recurring</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No adjustments" description="Add a bonus or deduction, or import a CSV. Leave encashments and referral bonuses land here too." />
        ) : (
          <Table className="min-w-[860px]">
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Adjustment</TH>
                <TH>Effective</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
                <TH className="w-12" />
              </tr>
            </THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap">
                    <span className="font-medium text-ink">{fullName(a.employee)}</span>
                    <span className="block text-xs text-slate-500">{a.employee.employeeCode}</span>
                  </TD>
                  <TD>
                    <span className="text-ink">{a.label}</span>
                    <span className="block text-xs text-slate-500">
                      {ADJUSTMENT_CODE_LABELS[a.code] ?? a.code} · {a.kind === "EARNING" ? (a.taxable ? "Taxable" : "Non-taxable") : a.taxable ? "Before tax" : "After tax"}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {fmtDate(a.effectiveDate)}
                    {a.recurring ? <span className="block text-xs text-slate-500">Recurring{a.endDate ? ` to ${fmtDate(a.endDate)}` : ""}</span> : null}
                  </TD>
                  <TD>
                    {a.appliedIn ? (
                      <Link href={`/payroll/${a.appliedIn.id}`} className="hover:underline">
                        <Badge tone="green">Paid · {a.appliedIn.name}</Badge>
                      </Link>
                    ) : a.recurring ? (
                      <Badge tone="blue">Recurring</Badge>
                    ) : (
                      <Badge tone="amber">Pending</Badge>
                    )}
                  </TD>
                  <TD className={a.kind === "DEDUCTION" ? "whitespace-nowrap text-right tabular-nums text-tone-red-fg" : "whitespace-nowrap text-right font-medium tabular-nums text-ink"}>
                    {a.kind === "DEDUCTION" ? "-" : ""}
                    {peso(a.amount)}
                  </TD>
                  <TD className="relative text-right">
                    {a.appliedIn ? null : (
                      <ConfirmButton action={deleteAdjustmentAction.bind(null, a.id)} confirm={`Delete "${a.label}" for ${fullName(a.employee)}?`} variant="ghost" size="icon-sm" className="text-tone-red-fg">
                        <Trash2 />
                        <span className="sr-only">Delete</span>
                      </ConfirmButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
