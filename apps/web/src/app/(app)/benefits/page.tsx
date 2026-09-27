import type { Metadata } from "next";
import Link from "next/link";
import { BENEFIT_KINDS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { listPlans } from "@/server/services/benefits";
import { deletePlanAction, savePlanAction } from "@/server/actions/benefits";
import { EntityManager } from "@/components/entity-manager";
import { Badge, PageHeader, Stat } from "@/components/ui/card";
import { peso } from "../payroll/_ui/format";

export const metadata: Metadata = { title: "Benefits" };

export default async function BenefitsPage() {
  await gate("ADMIN", "HR");
  const plans = await listPlans();
  const active = plans.filter((p) => p.isActive);
  const er = active.reduce((a, p) => a + p.cost.er, 0);
  const ee = active.reduce((a, p) => a + p.cost.ee, 0);
  return (
    <>
      <PageHeader title="Benefits" description="HMO, life and dental plans. Employee shares are deducted by payroll, split per cutoff." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Enrolled" value={active.reduce((a, p) => a + p.enrolled, 0)} hint={`${active.length} active plan${active.length === 1 ? "" : "s"}`} />
        <Stat label="Employer cost / month" value={peso(er)} />
        <Stat label="Employee shares / month" value={peso(ee)} hint="Deducted on payslips as HMO_EE" />
      </div>
      <EntityManager
        title="Plans"
        singular="plan"
        columns={["Plan", "Type", "Monthly shares", "Enrolled", "Monthly cost", "Status"]}
        rows={plans.map((p) => ({
          id: p.id,
          deletable: p.enrolled === 0,
          cells: [
            <Link key="n" href={`/benefits/${p.id}`} className="whitespace-nowrap hover:text-brand-700">
              {p.name}
              <span className="block text-xs font-normal text-slate-500">{p.provider}</span>
            </Link>,
            BENEFIT_KINDS[p.kind as keyof typeof BENEFIT_KINDS] ?? p.kind,
            <span key="s" className="whitespace-nowrap text-xs tabular-nums">
              ER {peso(p.employerShare)} · EE {peso(p.employeeShare)}
              {p.perDependentShare ? <span className="block text-slate-500">+{peso(p.perDependentShare)} per dependent</span> : null}
            </span>,
            <Link key="r" href={`/benefits/${p.id}`} className="whitespace-nowrap font-medium text-ink underline-offset-4 hover:underline">
              {p.enrolled} · Roster
            </Link>,
            <span key="c" className="tabular-nums">{peso(p.cost.er + p.cost.ee)}</span>,
            <Badge key="a" tone={p.isActive ? "green" : "slate"}>{p.isActive ? "Active" : "Inactive"}</Badge>,
          ],
          values: p,
        }))}
        fields={[
          { name: "name", label: "Plan name", required: true, span: 2 },
          { name: "provider", label: "Provider", required: true, placeholder: "Maxicare, Intellicare..." },
          { name: "kind", label: "Type", type: "select", options: Object.entries(BENEFIT_KINDS).map(([id, name]) => ({ id, name })), placeholder: "Pick a type", required: true },
          { name: "employerShare", label: "Employer share / month (PHP)", type: "number", step: "0.01", min: 0 },
          { name: "employeeShare", label: "Employee share / month (PHP)", type: "number", step: "0.01", min: 0 },
          { name: "perDependentShare", label: "Per dependent / month (PHP)", type: "number", step: "0.01", min: 0, hint: "Charged to the employee" },
          { name: "isActive", label: "Active", type: "checkbox" },
        ]}
        saveAction={savePlanAction}
        deleteAction={deletePlanAction}
        deleteConfirm="Delete this plan?"
      />
    </>
  );
}
