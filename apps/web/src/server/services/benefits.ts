import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { enrollmentCost, type BenefitDependent, type SessionUser } from "@hris/shared";
import type { z } from "zod";
import type { benefitPlanSchema, enrollmentSchema } from "@hris/shared";
import { audit } from "./audit";
import { conflict, notFound } from "./errors";
import { num, today } from "./payroll";

const planMoney = (p: { employerShare: Prisma.Decimal; employeeShare: Prisma.Decimal; perDependentShare: Prisma.Decimal }) => ({
  employerShare: num(p.employerShare),
  employeeShare: num(p.employeeShare),
  perDependentShare: num(p.perDependentShare),
});
const deps = (j: Prisma.JsonValue) => (Array.isArray(j) ? (j as unknown as BenefitDependent[]) : []);
const activeOn = (d: Date): Prisma.EmployeeBenefitWhereInput => ({ effectiveFrom: { lte: d }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: d } }] });

/** Plans with active headcount and monthly cost (ER, EE) today. */
export async function listPlans() {
  const t = new Date(today());
  const plans = await prisma.benefitPlan.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { enrollments: { where: activeOn(t), select: { dependents: true } } } });
  return plans.map(({ enrollments, ...p }) => {
    const m = planMoney(p);
    const cost = enrollments.reduce((a, e) => {
      const c = enrollmentCost(m, deps(e.dependents).length);
      return { er: a.er + c.er, ee: a.ee + c.ee };
    }, { er: 0, ee: 0 });
    return { ...p, ...m, enrolled: enrollments.length, cost };
  });
}

export async function savePlan(actor: SessionUser, d: z.infer<typeof benefitPlanSchema>, id?: string) {
  const p = id ? await prisma.benefitPlan.update({ where: { id }, data: d }) : await prisma.benefitPlan.create({ data: d });
  await audit(actor.id, id ? "benefit-plan.update" : "benefit-plan.create", "BenefitPlan", p.id, { after: p });
}

export async function deletePlan(actor: SessionUser, id: string) {
  if (await prisma.employeeBenefit.count({ where: { planId: id } })) throw conflict("This plan has enrollments. Mark it inactive instead.");
  await prisma.benefitPlan.delete({ where: { id } });
  await audit(actor.id, "benefit-plan.delete", "BenefitPlan", id);
}

/** Roster of a plan: current and ended enrollments with monthly cost each. */
export async function planRoster(id: string) {
  const plan = await prisma.benefitPlan.findUnique({ where: { id } });
  if (!plan) throw notFound("Benefit plan");
  const m = planMoney(plan);
  const t = today();
  const rows = await prisma.employeeBenefit.findMany({
    where: { planId: id },
    include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, department: { select: { name: true } } } } },
    orderBy: [{ employee: { lastName: "asc" } }, { effectiveFrom: "desc" }],
  });
  const enrollments = rows.map((r) => {
    const d = deps(r.dependents);
    const from = r.effectiveFrom.toISOString().slice(0, 10);
    const to = r.effectiveTo?.toISOString().slice(0, 10) ?? null;
    return { ...r, dependents: d, from, to, active: from <= t && (!to || to >= t), cost: enrollmentCost(m, d.length) };
  });
  const active = enrollments.filter((e) => e.active);
  return {
    plan: { ...plan, ...m },
    enrollments,
    totals: { headcount: active.length, dependents: active.reduce((a, e) => a + e.dependents.length, 0), er: active.reduce((a, e) => a + e.cost.er, 0), ee: active.reduce((a, e) => a + e.cost.ee, 0) },
  };
}

export async function saveEnrollment(actor: SessionUser, d: z.infer<typeof enrollmentSchema>, id?: string) {
  const data = {
    employeeId: d.employeeId,
    planId: d.planId,
    effectiveFrom: new Date(d.effectiveFrom),
    effectiveTo: d.effectiveTo ? new Date(d.effectiveTo) : null,
    cardNo: d.cardNo,
    dependents: d.dependents as unknown as Prisma.InputJsonValue,
  };
  const overlap = await prisma.employeeBenefit.findFirst({
    where: { employeeId: d.employeeId, planId: d.planId, ...(id ? { id: { not: id } } : {}), ...(data.effectiveTo ? { effectiveFrom: { lte: data.effectiveTo } } : {}), OR: [{ effectiveTo: null }, { effectiveTo: { gte: data.effectiveFrom } }] },
  });
  if (overlap) throw conflict("This employee is already enrolled in the plan for those dates");
  const e = id ? await prisma.employeeBenefit.update({ where: { id }, data }) : await prisma.employeeBenefit.create({ data });
  await audit(actor.id, id ? "benefit.update" : "benefit.enroll", "EmployeeBenefit", e.id, { after: e });
}

export async function deleteEnrollment(actor: SessionUser, id: string) {
  const e = await prisma.employeeBenefit.delete({ where: { id } }).catch(() => null);
  if (!e) throw notFound("Enrollment");
  await audit(actor.id, "benefit.delete", "EmployeeBenefit", id, { before: e });
}

/** An employee's current enrollments (payslips page header). */
export async function myBenefits(employeeId: string) {
  const rows = await prisma.employeeBenefit.findMany({ where: { employeeId, ...activeOn(new Date(today())) }, include: { plan: true }, orderBy: { effectiveFrom: "asc" } });
  return rows.map((r) => ({ id: r.id, plan: r.plan.name, provider: r.plan.provider, kind: r.plan.kind, cardNo: r.cardNo, dependents: deps(r.dependents), monthlyEe: enrollmentCost(planMoney(r.plan), deps(r.dependents).length).ee }));
}
