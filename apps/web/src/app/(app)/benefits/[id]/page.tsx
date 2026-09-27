import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { BENEFIT_KINDS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { planRoster } from "@/server/services/benefits";
import { employeeOptions } from "@/server/services/employees";
import { today } from "@/server/services/payroll";
import { deleteEnrollmentAction } from "@/server/actions/benefits";
import { ConfirmButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fullName } from "@/lib/utils";
import { peso } from "../../payroll/_ui/format";
import { EnrollDialog } from "./client";

export const metadata: Metadata = { title: "Plan roster" };

export default async function PlanRosterPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const [{ plan, enrollments, totals }, emps] = await Promise.all([planRoster(id).catch(() => notFound()), employeeOptions()]);
  const opts = emps.map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }));
  const t = today();

  return (
    <>
      <Link href="/benefits" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft className="size-4" /> Benefits
      </Link>
      <PageHeader
        title={plan.name}
        description={`${plan.provider} · ${BENEFIT_KINDS[plan.kind as keyof typeof BENEFIT_KINDS] ?? plan.kind} · ER ${peso(plan.employerShare)}, EE ${peso(plan.employeeShare)}${plan.perDependentShare ? `, +${peso(plan.perDependentShare)} per dependent` : ""} a month`}
        actions={<EnrollDialog planId={plan.id} employees={opts} today={t} />}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={totals.headcount} hint={`${totals.dependents} dependent${totals.dependents === 1 ? "" : "s"}`} />
        <Stat label="Employer / month" value={peso(totals.er)} />
        <Stat label="Employees / month" value={peso(totals.ee)} />
        <Stat label="Total / month" value={peso(totals.er + totals.ee)} />
      </div>
      <Card>
        {enrollments.length === 0 ? (
          <EmptyState title="Nobody enrolled yet" description="Enroll employees to start the payroll deduction of their share." />
        ) : (
          <Table className="min-w-[760px]">
            <THead>
              <tr>
                <TH>Member</TH>
                <TH>Coverage</TH>
                <TH>Dependents</TH>
                <TH className="text-right">ER / mo</TH>
                <TH className="text-right">EE / mo</TH>
                <TH className="w-24" />
              </tr>
            </THead>
            <TBody>
              {enrollments.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">
                    <span className="font-medium text-ink">{fullName(e.employee)}</span>
                    <span className="block text-xs text-slate-500">
                      {e.employee.employeeCode}
                      {e.cardNo ? ` · Card ${e.cardNo}` : ""}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {fmtDate(e.from)} - {e.to ? fmtDate(e.to) : "ongoing"}
                    <span className="block">{e.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">{e.from > t ? "Starts later" : "Ended"}</Badge>}</span>
                  </TD>
                  <TD className="text-xs">{e.dependents.length ? e.dependents.map((d) => `${d.name} (${d.relationship})`).join(", ") : <span className="text-slate-500">None</span>}</TD>
                  <TD className="text-right tabular-nums">{peso(e.cost.er)}</TD>
                  <TD className="text-right tabular-nums">{peso(e.cost.ee)}</TD>
                  <TD className="relative whitespace-nowrap text-right">
                    <EnrollDialog planId={plan.id} employees={opts} today={t} value={{ id: e.id, employeeId: e.employeeId, from: e.from, to: e.to, cardNo: e.cardNo, dependents: e.dependents }} />
                    <ConfirmButton action={deleteEnrollmentAction.bind(null, e.id)} confirm={`Remove ${fullName(e.employee)} from this plan? To keep history, set an end date instead.`} variant="ghost" size="icon-sm" className="text-tone-red-fg">
                      <Trash2 />
                      <span className="sr-only">Remove</span>
                    </ConfirmButton>
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
