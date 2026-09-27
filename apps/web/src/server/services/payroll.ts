import "server-only";
import { prisma, type Prisma } from "@hris/db";
import {
  DEFAULT_PAYROLL_CONFIG,
  DEFAULT_SHIFT,
  DEFAULT_TIMEZONE,
  LOAN_TYPE_LABELS,
  buildJournal,
  computeOffCycle,
  computePayslip,
  computeThirteenthMonth,
  cutoffHalf,
  enrollmentCost,
  mergePayrollConfig,
  nextCutoff,
  prorateCompensation,
  zonedParts,
  DEFAULT_ACCOUNTS,
  type AccountMap,
  parseAdjustmentCsv,
  type AdjustmentFormInput,
  type AdjustmentInput,
  type CompensationInput,
  type CreatePayrollRunInput,
  type PayrollConfig,
  type PayslipLine,
  type PayslipResult,
  type SessionUser,
} from "@hris/shared";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { dtrTotalsForRange } from "./attendance";
import { fullName } from "./employees";
import { AppError, conflict, notFound } from "./errors";
import { getJson, getSetting, setJson, setSetting } from "./settings";
import { toCsv } from "./reports";

export const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const today = () => zonedParts(new Date(), DEFAULT_TIMEZONE).date;

// ---------- Config ----------

export async function getPayrollConfig(): Promise<PayrollConfig> {
  return mergePayrollConfig(await getJson<Partial<PayrollConfig>>("payroll", {}));
}

export async function savePayrollConfig(actor: SessionUser, cfg: PayrollConfig | null) {
  const before = await getPayrollConfig();
  const after = cfg ?? DEFAULT_PAYROLL_CONFIG;
  await setJson("payroll", after);
  await audit(actor.id, cfg ? "payroll.config.update" : "payroll.config.reset", "AppSetting", "payroll", { before, after });
}

export async function saveCompany(actor: SessionUser, company: Awaited<ReturnType<typeof getSetting<"company">>>) {
  const before = await getSetting("company");
  await setSetting("company", company);
  await audit(actor.id, "company.update", "AppSetting", "company", { before, after: company });
}

// ---------- Runs ----------

export async function listRuns() {
  const [runs, sums] = await Promise.all([
    prisma.payrollRun.findMany({ orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }], take: 100 }),
    prisma.payslip.groupBy({ by: ["runId"], _sum: { grossPay: true, netPay: true }, _count: { _all: true } }),
  ]);
  const byRun = new Map(sums.map((s) => [s.runId, s]));
  return runs.map((r) => {
    const s = byRun.get(r.id);
    return { ...r, gross: num(s?._sum.grossPay), net: num(s?._sum.netPay), headcount: s?._count._all ?? 0 };
  });
}

/** Defaults for the "New payroll run" dialog: the cutoff after the latest regular run, else the one containing today. */
export async function suggestNextRun() {
  const [cfg, last] = await Promise.all([getPayrollConfig(), prisma.payrollRun.findFirst({ where: { kind: "REGULAR" }, orderBy: { periodEnd: "desc" } })]);
  const freq = cfg.schedule.frequency;
  return { frequency: freq, ...(last ? nextCutoff(freq, isoOf(last.periodEnd), cfg.schedule) : nextCutoff(freq, today(), cfg.schedule, false)) };
}

export async function getRun(id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: {
          employee: {
            select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, payType: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true, bankName: true, bankAccountNo: true, department: { select: { name: true } } },
          },
        },
        orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
      },
      separations: { select: { id: true } },
    },
  });
  if (!run) throw notFound("Payroll run");
  return run;
}
export type RunDetail = Awaited<ReturnType<typeof getRun>>;

export async function createRun(actor: SessionUser, d: CreatePayrollRunInput) {
  if (d.kind === "REGULAR") {
    // ponytail: check-then-insert; two HR users racing the same cutoff is not worth a DB constraint.
    const overlap = await prisma.payrollRun.findFirst({ where: { kind: "REGULAR", periodStart: { lte: new Date(d.periodEnd) }, periodEnd: { gte: new Date(d.periodStart) } }, select: { name: true } });
    if (overlap) throw conflict(`This period overlaps "${overlap.name}". Delete or pick another cutoff.`);
  }
  const run = await prisma.payrollRun.create({
    data: { name: d.name, kind: d.kind, frequency: d.frequency, periodStart: new Date(d.periodStart), periodEnd: new Date(d.periodEnd), payDate: new Date(d.payDate), createdById: actor.id },
  });
  await audit(actor.id, "payroll.create", "PayrollRun", run.id, { after: run });
  return run;
}

const payableWhere = (start: Date, end: Date): Prisma.EmployeeWhereInput => ({
  deletedAt: null,
  basicPay: { not: null, gt: 0 },
  hireDate: { lte: end },
  OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
  employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] },
});

export const toAdj = (a: { id: string; kind: "EARNING" | "DEDUCTION"; code: string; label: string; amount: Prisma.Decimal; taxable: boolean }): AdjustmentInput => ({
  id: a.id,
  kind: a.kind,
  code: a.code,
  label: a.label,
  amount: num(a.amount),
  taxable: a.taxable,
});

/**
 * Adjustments a run picks up. One-offs: effective within the period and not yet paid (final pay: any unpaid one
 * effective up to the last day). Recurring: effective by period end and not ended before period start.
 */
export function adjustmentWhere(kind: "REGULAR" | "OFF_CYCLE" | "FINAL_PAY", start: Date, end: Date): Prisma.PayrollAdjustmentWhereInput {
  const oneOff: Prisma.PayrollAdjustmentWhereInput = { recurring: false, appliedInRunId: null, effectiveDate: kind === "FINAL_PAY" ? { lte: end } : { gte: start, lte: end } };
  if (kind === "OFF_CYCLE") return oneOff;
  return { OR: [oneOff, { recurring: true, effectiveDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }] };
}

/** Active benefit enrollments in the period as monthly employee-share deductions. */
export async function benefitDeductions(ids: string[], start: Date, end: Date) {
  const rows = await prisma.employeeBenefit.findMany({
    where: { employeeId: { in: ids }, effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }], plan: { isActive: true } },
    include: { plan: true },
    orderBy: { effectiveFrom: "asc" },
  });
  const out = new Map<string, { id: string; label: string; monthly: number }[]>();
  for (const r of rows) {
    const deps = Array.isArray(r.dependents) ? r.dependents.length : 0;
    const monthly = enrollmentCost({ employerShare: num(r.plan.employerShare), employeeShare: num(r.plan.employeeShare), perDependentShare: num(r.plan.perDependentShare) }, deps).ee;
    if (monthly <= 0) continue;
    const list = out.get(r.employeeId) ?? [];
    list.push({ id: r.id, label: `${r.plan.name}${deps ? ` (+${deps} dependent${deps > 1 ? "s" : ""})` : ""}`, monthly });
    out.set(r.employeeId, list);
  }
  return out;
}

/** Pay in effect for each employee over [from, to]: salary history pro-rated by calendar days, else the employee record. */
export async function payForPeriod(emps: { id: string; payType: "MONTHLY" | "DAILY"; basicPay: Prisma.Decimal | null; allowance: Prisma.Decimal }[], from: string, to: string) {
  const rows = await prisma.employeeCompensation.findMany({
    where: { employeeId: { in: emps.map((e) => e.id) }, effectiveFrom: { lte: new Date(to) } },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
  });
  return new Map(
    emps.map((e) => {
      const mine = rows.filter((r) => r.employeeId === e.id).map((r) => ({ from: isoOf(r.effectiveFrom), payType: r.payType, basicPay: num(r.basicPay), allowance: num(r.allowance) }));
      return [e.id, prorateCompensation(mine, from, to) ?? { payType: e.payType, basicPay: num(e.basicPay), allowance: num(e.allowance), changed: false }] as const;
    }),
  );
}

/** Generate (or replace) the payslips of a DRAFT run. */
export async function computeRun(actor: SessionUser, id: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound("Payroll run");
  if (run.status !== "DRAFT") throw conflict("Only draft runs can be computed");
  if (run.kind === "FINAL_PAY") throw new AppError("Compute final pay from the separation page");
  const cfg = await getPayrollConfig();
  const from = isoOf(run.periodStart);
  const to = isoOf(run.periodEnd);

  const emps = await prisma.employee.findMany({
    where: payableWhere(run.periodStart, run.periodEnd),
    select: { id: true, payType: true, basicPay: true, allowance: true, shift: { select: { workDays: true } } },
  });
  const ids = emps.map((e) => e.id);
  const results = new Map<string, PayslipResult>();

  if (run.kind === "THIRTEENTH_MONTH") {
    const year = run.periodEnd.getUTCFullYear();
    // PD 851 base: basic actually earned (after absences, pro-rated for raises) on each finalized regular payslip.
    const ytd = await prisma.payslip.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: ids }, run: { kind: "REGULAR", status: { in: ["FINALIZED", "PAID"] }, periodStart: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } },
      _sum: { basicPay: true },
    });
    const byEmp = new Map(ytd.map((y) => [y.employeeId, num(y._sum.basicPay)]));
    for (const e of emps) {
      const basicEarnedYtd = byEmp.get(e.id) ?? 0;
      if (basicEarnedYtd <= 0) continue;
      const monthlyBasic = e.payType === "DAILY" ? (num(e.basicPay) * cfg.daysPerYear) / 12 : num(e.basicPay);
      results.set(e.id, computeThirteenthMonth({ basicEarnedYtd, monthlyBasic, config: cfg }));
    }
  } else if (run.kind === "OFF_CYCLE") {
    const [adjs, pay] = await Promise.all([
      prisma.payrollAdjustment.findMany({ where: { employeeId: { in: ids }, ...adjustmentWhere("OFF_CYCLE", run.periodStart, run.periodEnd) }, orderBy: { effectiveDate: "asc" } }),
      payForPeriod(emps, to, to),
    ]);
    for (const e of emps) {
      const mine = adjs.filter((a) => a.employeeId === e.id);
      if (!mine.length) continue;
      const p = pay.get(e.id)!;
      results.set(e.id, computeOffCycle({ adjustments: mine.map(toAdj), payType: p.payType, basicPay: p.basicPay, config: cfg }));
    }
  } else {
    const [dtr, ots, loans, expenses, def, adjs, benefits, pay] = await Promise.all([
      dtrTotalsForRange(ids, from, to),
      prisma.overtimeRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", date: { gte: run.periodStart, lte: run.periodEnd } }, orderBy: { date: "asc" } }),
      prisma.loan.findMany({ where: { employeeId: { in: ids }, status: "ACTIVE", balance: { gt: 0 }, startDate: { lte: run.periodEnd } }, orderBy: { startDate: "asc" } }),
      prisma.expenseClaim.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", reimbursedInRunId: null, date: { lte: run.periodEnd } }, orderBy: { date: "asc" } }),
      prisma.workShift.findFirst({ where: { isDefault: true }, select: { workDays: true } }),
      prisma.payrollAdjustment.findMany({ where: { employeeId: { in: ids }, ...adjustmentWhere("REGULAR", run.periodStart, run.periodEnd) }, orderBy: { effectiveDate: "asc" } }),
      benefitDeductions(ids, run.periodStart, run.periodEnd),
      payForPeriod(emps, from, to),
    ]);
    const half = run.frequency === "SEMI_MONTHLY" ? cutoffHalf(from) : 2;
    for (const e of emps) {
      const t = dtr.get(e.id);
      if (!t) continue;
      const p = pay.get(e.id)!;
      results.set(
        e.id,
        computePayslip({
          payType: p.payType,
          basicPay: p.basicPay,
          allowance: p.allowance,
          frequency: run.frequency,
          half,
          dtr: t,
          workDays: e.shift?.workDays ?? def?.workDays ?? DEFAULT_SHIFT.workDays,
          overtime: ots.filter((o) => o.employeeId === e.id).map((o) => ({ date: isoOf(o.date), minutes: o.minutes, startTime: o.startTime, endTime: o.endTime })),
          loans: loans.filter((l) => l.employeeId === e.id).map((l) => ({ id: l.id, label: LOAN_TYPE_LABELS[l.type], amortization: num(l.amortization), balance: num(l.balance) })),
          expenses: expenses.filter((x) => x.employeeId === e.id).map((x) => ({ id: x.id, label: `Reimbursement: ${x.category}`, amount: num(x.amount) })),
          adjustments: adjs.filter((a) => a.employeeId === e.id).map(toAdj),
          benefits: benefits.get(e.id) ?? [],
          config: cfg,
        }),
      );
    }
  }

  await savePayslips(id, results);
  await audit(actor.id, "payroll.compute", "PayrollRun", id, { after: { payslips: results.size } });
  return results.size;
}

/** Replace a DRAFT run's payslips. Status guard: a concurrent finalize wins, this recompute aborts. */
export async function savePayslips(id: string, results: Map<string, PayslipResult>, runData: Prisma.PayrollRunUpdateManyMutationInput = {}) {
  await prisma.$transaction(async (tx) => {
    const g = await tx.payrollRun.updateMany({ where: { id, status: "DRAFT" }, data: { ...runData, updatedAt: new Date() } });
    if (g.count !== 1) throw conflict("Run is no longer a draft");
    await tx.payslip.deleteMany({ where: { runId: id } });
    await tx.payslip.createMany({
      data: [...results].map(([employeeId, r]) => ({
        runId: id,
        employeeId,
        basicPay: r.basicPay,
        grossPay: r.grossPay,
        sss: r.sss,
        philhealth: r.philhealth,
        pagibig: r.pagibig,
        withholdingTax: r.withholdingTax,
        totalDeductions: r.totalDeductions,
        netPay: r.netPay,
        lines: r.lines as unknown as Prisma.InputJsonValue,
      })),
    });
  }, { timeout: 30_000 });
}

/** Lock the run: post loan payments, mark claims reimbursed, notify employees. */
export async function finalizeRun(actor: SessionUser, id: string) {
  const slips = await prisma.$transaction(async (tx) => {
    const count = await tx.payslip.count({ where: { runId: id } });
    if (count === 0) throw new AppError("Compute the run before finalizing");
    const g = await tx.payrollRun.updateMany({ where: { id, status: "DRAFT" }, data: { status: "FINALIZED", finalizedAt: new Date() } });
    if (g.count !== 1) throw conflict("Only draft runs can be finalized");
    const run = await tx.payrollRun.findUniqueOrThrow({ where: { id } });
    const slips = await tx.payslip.findMany({ where: { runId: id }, select: { id: true, employeeId: true, lines: true, employee: { select: { userId: true } } } });

    const claimIds: string[] = [];
    for (const s of slips) {
      for (const l of s.lines as unknown as PayslipLine[]) {
        if (l.kind === "earning" && l.code === "REIMBURSE" && l.ref) claimIds.push(l.ref);
        if (l.kind !== "deduction" || l.code !== "LOAN" || !l.ref) continue;
        // Guarded decrement: a loan paid down by another run since compute makes this fail.
        const u = await tx.loan.updateMany({ where: { id: l.ref, status: "ACTIVE", balance: { gte: l.amount } }, data: { balance: { decrement: l.amount } } });
        if (u.count !== 1) throw conflict("A loan balance changed since this run was computed. Recompute the run, then finalize.");
        await tx.loanPayment.create({ data: { loanId: l.ref, payslipId: s.id, amount: l.amount, note: run.name } });
        await tx.loan.updateMany({ where: { id: l.ref, balance: { lte: 0 } }, data: { status: "PAID" } });
      }
    }
    // One-off adjustments are paid once; recurring ones stay open until their end date.
    const adjIds = [...new Set(slips.flatMap((s) => (s.lines as unknown as PayslipLine[]).flatMap((l) => (l.adjustmentId ? [l.adjustmentId] : []))))];
    if (adjIds.length) {
      const found = await tx.payrollAdjustment.findMany({ where: { id: { in: adjIds } }, select: { id: true, recurring: true } });
      if (found.length !== adjIds.length) throw conflict("An adjustment was deleted since this run was computed. Recompute the run, then finalize.");
      const oneOff = found.filter((a) => !a.recurring).map((a) => a.id);
      const u = await tx.payrollAdjustment.updateMany({ where: { id: { in: oneOff }, appliedInRunId: null }, data: { appliedInRunId: id } });
      if (u.count !== oneOff.length) throw conflict("An adjustment was paid by another run since this one was computed. Recompute the run, then finalize.");
    }
    if (claimIds.length) {
      const u = await tx.expenseClaim.updateMany({ where: { id: { in: claimIds }, status: "APPROVED", reimbursedInRunId: null }, data: { reimbursedInRunId: id } });
      if (u.count !== claimIds.length) throw conflict("An expense claim changed since this run was computed. Recompute the run, then finalize.");
    }
    return slips;
  }, { timeout: 30_000 });

  await audit(actor.id, "payroll.finalize", "PayrollRun", id, { after: { payslips: slips.length } });
  for (const s of slips) await notify(s.employee.userId, "Your payslip is ready", "A new payslip has been posted.", `/payslips/${s.id}`);
}

export async function markRunPaid(actor: SessionUser, id: string) {
  const g = await prisma.payrollRun.updateMany({ where: { id, status: "FINALIZED" }, data: { status: "PAID" } });
  if (g.count !== 1) throw conflict("Only finalized runs can be marked paid");
  await audit(actor.id, "payroll.paid", "PayrollRun", id);
}

export async function deleteRun(actor: SessionUser, id: string) {
  const g = await prisma.$transaction(async (tx) => {
    // A deleted final-pay draft sends its separation back to clearance.
    await tx.separation.updateMany({ where: { finalPayRunId: id, status: "FINAL_PAY" }, data: { status: "CLEARANCE" } });
    const g = await tx.payrollRun.deleteMany({ where: { id, status: "DRAFT" } });
    if (g.count !== 1) throw conflict("Only draft runs can be deleted");
    return g;
  });
  await audit(actor.id, "payroll.delete", "PayrollRun", id, { after: g });
}

// ---------- Compensation (salary history) ----------

export async function listCompensation() {
  const t = new Date(today());
  const rows = await prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] } },
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, payType: true, basicPay: true, allowance: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true, bankName: true, bankAccountNo: true,
      department: { select: { name: true } },
      compensations: { where: { effectiveFrom: { gt: t } }, orderBy: { effectiveFrom: "asc" }, take: 1, select: { effectiveFrom: true, basicPay: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map(({ compensations, ...r }) => ({ ...r, upcoming: compensations[0] ? { date: isoOf(compensations[0].effectiveFrom), basicPay: num(compensations[0].basicPay) } : null }));
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Mirror the latest salary row effective on `date` onto the employee record. */
async function applyEffectiveComp(db: Db, employeeId: string, date: string) {
  const row = await db.employeeCompensation.findFirst({ where: { employeeId, effectiveFrom: { lte: new Date(date) } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  if (row) await db.employee.update({ where: { id: employeeId }, data: { payType: row.payType, basicPay: row.basicPay, allowance: row.allowance } });
}

/**
 * Government numbers and bank details update in place. A pay change becomes a dated salary history row (same-day
 * edits correct that row) plus a SALARY_CHANGE employment event; the employee record follows only once effective.
 */
export async function updateCompensation(actor: SessionUser, employeeId: string, d: CompensationInput) {
  const eff = d.effectiveFrom ?? today();
  const sel = { payType: true, basicPay: true, allowance: true, hireDate: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true, bankName: true, bankAccountNo: true } as const;
  const before = await prisma.employee.findUnique({ where: { id: employeeId }, select: sel });
  if (!before) throw notFound("Employee");
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: { tin: d.tin, sssNo: d.sssNo, philhealthNo: d.philhealthNo, pagibigNo: d.pagibigNo, bankName: d.bankName, bankAccountNo: d.bankAccountNo } });
    if (d.basicPay == null) {
      // Blank basic pay = excluded from payroll; not a salary change.
      await tx.employee.update({ where: { id: employeeId }, data: { basicPay: null, payType: d.payType, allowance: d.allowance } });
      return;
    }
    // Employees created outside payroll (hiring, imports) get their current pay as the first history row.
    if (before.basicPay != null && (await tx.employeeCompensation.count({ where: { employeeId } })) === 0)
      await tx.employeeCompensation.create({ data: { employeeId, effectiveFrom: before.hireDate, payType: before.payType, basicPay: before.basicPay, allowance: before.allowance, reason: "Initial record" } });
    const cur = await tx.employeeCompensation.findFirst({ where: { employeeId, effectiveFrom: { lte: new Date(eff) } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
    const same = cur && cur.payType === d.payType && num(cur.basicPay) === d.basicPay && num(cur.allowance) === d.allowance;
    if (!same) {
      const to = { payType: d.payType, basicPay: d.basicPay, allowance: d.allowance };
      const data = { ...to, reason: d.reason };
      if (cur && isoOf(cur.effectiveFrom) === eff) await tx.employeeCompensation.update({ where: { id: cur.id }, data: { ...data, reason: d.reason ?? cur.reason } });
      else await tx.employeeCompensation.create({ data: { employeeId, effectiveFrom: new Date(eff), ...data, createdById: actor.id } });
      const from = cur ? { payType: cur.payType, basicPay: num(cur.basicPay), allowance: num(cur.allowance) } : { payType: before.payType, basicPay: num(before.basicPay), allowance: num(before.allowance) };
      const applied = eff <= today() ? new Date() : null;
      const ev = await tx.employmentEvent.findFirst({ where: { employeeId, type: "SALARY_CHANGE", effectiveDate: new Date(eff) } });
      if (ev) await tx.employmentEvent.update({ where: { id: ev.id }, data: { to, note: d.reason ?? ev.note, appliedAt: applied } });
      else await tx.employmentEvent.create({ data: { employeeId, type: "SALARY_CHANGE", effectiveDate: new Date(eff), from, to, note: d.reason, appliedAt: applied, createdById: actor.id } });
    }
    await applyEffectiveComp(tx, employeeId, today());
  });
  const after = await prisma.employee.findUnique({ where: { id: employeeId }, select: sel });
  await audit(actor.id, "compensation.update", "Employee", employeeId, { before, after: { ...after, effectiveFrom: eff } });
}

/**
 * Daily job (called from /api/cron/daily): mirrors the latest salary row effective today onto the employee record
 * when they differ (a scheduled raise reaching its date), then stamps due SALARY_CHANGE events as applied.
 * Idempotent: a second run finds nothing to change. Employees excluded from payroll (blank basic pay) are skipped.
 * Returns the number of employees updated.
 */
export async function runDailyCompensation(): Promise<number> {
  const t = new Date(today());
  const rows = await prisma.employeeCompensation.findMany({
    where: { effectiveFrom: { lte: t }, employee: { deletedAt: null, basicPay: { not: null } } },
    orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }],
    distinct: ["employeeId"],
    select: { employeeId: true, payType: true, basicPay: true, allowance: true, employee: { select: { payType: true, basicPay: true, allowance: true } } },
  });
  let n = 0;
  for (const r of rows) {
    const e = r.employee;
    if (e.payType === r.payType && num(e.basicPay) === num(r.basicPay) && num(e.allowance) === num(r.allowance)) continue;
    await prisma.employee.update({ where: { id: r.employeeId }, data: { payType: r.payType, basicPay: r.basicPay, allowance: r.allowance } });
    n++;
  }
  await prisma.employmentEvent.updateMany({ where: { type: "SALARY_CHANGE", appliedAt: null, effectiveDate: { lte: t } }, data: { appliedAt: new Date() } });
  return n;
}

export async function compensationHistory(employeeId: string) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, payType: true, basicPay: true, allowance: true, hireDate: true, department: { select: { name: true } }, jobTitle: { select: { name: true } } },
  });
  if (!emp) throw notFound("Employee");
  const rows = await prisma.employeeCompensation.findMany({ where: { employeeId }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  const creators = await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => (r.createdById ? [r.createdById] : [])) } }, select: { id: true, email: true } });
  const t = today();
  const currentId = rows.find((r) => isoOf(r.effectiveFrom) <= t)?.id;
  return {
    employee: emp,
    rows: rows.map((r, k) => {
      const prev = rows[k + 1];
      const pct = prev && prev.payType === r.payType && num(prev.basicPay) > 0 ? ((num(r.basicPay) - num(prev.basicPay)) / num(prev.basicPay)) * 100 : null;
      return {
        id: r.id,
        effectiveFrom: isoOf(r.effectiveFrom),
        payType: r.payType,
        basicPay: num(r.basicPay),
        allowance: num(r.allowance),
        reason: r.reason,
        by: creators.find((c) => c.id === r.createdById)?.email ?? null,
        changePct: pct == null ? null : Math.round(pct * 10) / 10,
        state: r.id === currentId ? ("current" as const) : isoOf(r.effectiveFrom) > t ? ("scheduled" as const) : ("past" as const),
      };
    }),
  };
}

// ---------- Adjustments ----------

export type AdjustmentFilter = { employeeId?: string; status?: "pending" | "applied"; recurring?: "yes" | "no" };

export function listAdjustments(f: AdjustmentFilter) {
  return prisma.payrollAdjustment.findMany({
    where: {
      ...(f.employeeId ? { employeeId: f.employeeId } : {}),
      ...(f.status === "pending" ? { appliedInRunId: null } : f.status === "applied" ? { appliedInRunId: { not: null } } : {}),
      ...(f.recurring ? { recurring: f.recurring === "yes" } : {}),
    },
    include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true } }, appliedIn: { select: { id: true, name: true } } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
}

export async function createAdjustment(actor: SessionUser, d: AdjustmentFormInput) {
  const emp = await prisma.employee.findFirst({ where: { id: d.employeeId, deletedAt: null }, select: { id: true } });
  if (!emp) throw notFound("Employee");
  const a = await prisma.payrollAdjustment.create({
    data: { employeeId: d.employeeId, kind: d.kind, code: d.code, label: d.label, amount: d.amount, taxable: d.taxable, effectiveDate: new Date(d.effectiveDate), recurring: d.recurring, endDate: d.endDate ? new Date(d.endDate) : null, note: d.note, createdById: actor.id },
  });
  await audit(actor.id, "adjustment.create", "PayrollAdjustment", a.id, { after: a });
  return a;
}

/** All-or-nothing CSV import. Returns the number of rows created. */
export async function importAdjustments(actor: SessionUser, text: string) {
  const { rows, errors } = parseAdjustmentCsv(text);
  if (errors.length) throw new AppError(errors.slice(0, 5).join(". ") + (errors.length > 5 ? `. And ${errors.length - 5} more.` : ""));
  if (!rows.length) throw new AppError("No rows to import");
  const emps = await prisma.employee.findMany({ where: { employeeCode: { in: rows.map((r) => r.employeeCode) }, deletedAt: null }, select: { id: true, employeeCode: true } });
  const byCode = new Map(emps.map((e) => [e.employeeCode.toUpperCase(), e.id]));
  const unknown = [...new Set(rows.filter((r) => !byCode.has(r.employeeCode.toUpperCase())).map((r) => r.employeeCode))];
  if (unknown.length) throw new AppError(`Unknown employee code${unknown.length > 1 ? "s" : ""}: ${unknown.slice(0, 10).join(", ")}`);
  const r = await prisma.payrollAdjustment.createMany({
    data: rows.map((x) => ({ employeeId: byCode.get(x.employeeCode.toUpperCase())!, kind: x.kind, code: x.code, label: x.label, amount: x.amount, taxable: x.taxable, effectiveDate: new Date(x.effectiveDate), createdById: actor.id, note: "CSV import" })),
  });
  await audit(actor.id, "adjustment.import", "PayrollAdjustment", null, { after: { count: r.count } });
  return r.count;
}

export async function deleteAdjustment(actor: SessionUser, id: string) {
  const a = await prisma.payrollAdjustment.findUnique({ where: { id } });
  const g = await prisma.payrollAdjustment.deleteMany({ where: { id, appliedInRunId: null } });
  if (g.count !== 1) throw conflict("Paid adjustments cannot be deleted");
  await audit(actor.id, "adjustment.delete", "PayrollAdjustment", id, { before: a });
}

// ---------- Accounting ----------

export async function getAccounting(): Promise<AccountMap> {
  const s = await getJson<Partial<AccountMap>>("accounting", {});
  return { ...DEFAULT_ACCOUNTS, ...s, costCenters: { ...s.costCenters } };
}

export async function saveAccounting(actor: SessionUser, map: AccountMap) {
  const before = await getAccounting();
  await setJson("accounting", map);
  await audit(actor.id, "accounting.update", "AppSetting", "accounting", { before, after: map });
}

// ---------- Payslips ----------

const slipInclude = {
  run: { select: { id: true, name: true, kind: true, status: true, periodStart: true, periodEnd: true, payDate: true } },
  employee: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, payType: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true, department: { select: { name: true } }, jobTitle: { select: { name: true } } },
  },
} satisfies Prisma.PayslipInclude;

/** An employee's released payslips (finalized or paid runs only). */
export const listMyPayslips = (employeeId: string) =>
  prisma.payslip.findMany({
    where: { employeeId, run: { status: { in: ["FINALIZED", "PAID"] } } },
    include: { run: slipInclude.run },
    orderBy: { run: { payDate: "desc" } },
  });

/** Staff see any payslip; employees only their own released ones. Anything else is a 404. */
export async function getPayslipFor(user: SessionUser, id: string) {
  const slip = await prisma.payslip.findUnique({ where: { id }, include: slipInclude });
  const released = slip && slip.run.status !== "DRAFT";
  if (!slip || !(isStaff(user) || (released && slip.employeeId === user.employeeId))) throw notFound("Payslip");
  const year = slip.run.payDate.getUTCFullYear();
  const ytd = await prisma.payslip.aggregate({
    where: { employeeId: slip.employeeId, run: { status: { in: ["FINALIZED", "PAID"] }, payDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: slip.run.payDate } } },
    _sum: { grossPay: true, withholdingTax: true, netPay: true },
  });
  return { ...slip, lines: slip.lines as unknown as PayslipLine[], ytd: { gross: num(ytd._sum.grossPay), tax: num(ytd._sum.withholdingTax), net: num(ytd._sum.netPay) } };
}
export type PayslipDetail = Awaited<ReturnType<typeof getPayslipFor>>;

/** JSON-safe payslip for the mobile API. */
export function payslipJson(s: PayslipDetail | Awaited<ReturnType<typeof listMyPayslips>>[number]) {
  return {
    id: s.id,
    run: { id: s.run.id, name: s.run.name, kind: s.run.kind, status: s.run.status, periodStart: isoOf(s.run.periodStart), periodEnd: isoOf(s.run.periodEnd), payDate: isoOf(s.run.payDate) },
    basicPay: num(s.basicPay),
    grossPay: num(s.grossPay),
    sss: num(s.sss),
    philhealth: num(s.philhealth),
    pagibig: num(s.pagibig),
    withholdingTax: num(s.withholdingTax),
    totalDeductions: num(s.totalDeductions),
    netPay: num(s.netPay),
    ...("ytd" in s ? { lines: s.lines.filter((l) => l.kind !== "employer"), ytd: s.ytd } : {}),
  };
}

// ---------- Exports ----------

const sumLines = (lines: PayslipLine[], pred: (l: PayslipLine) => boolean) => Math.round(lines.filter(pred).reduce((a, l) => a + l.amount * 100, 0)) / 100;

const KNOWN_EARNINGS = new Set(["BASIC", "ABSENT", "TARDY", "HOLIDAY", "RESTDAY", "NIGHTDIFF", "13TH", "13TH_TAXABLE", "ALLOWANCE", "REIMBURSE"]);

const csvOf = (columns: [string, string][], rows: Record<string, string | number>[], totals?: Record<string, string | number>) =>
  toCsv({ columns: columns.map(([key, label]) => ({ key, label })), rows, totals });

/** Bank disbursement file: one row per payslip with net pay. Released runs only. */
export async function bankCsv(id: string) {
  const run = await getRun(id);
  if (run.status === "DRAFT") throw conflict("Finalize the run before exporting the bank file");
  const ref = `PAY-${isoOf(run.payDate).replace(/-/g, "")}`;
  const rows = run.payslips
    .filter((s) => num(s.netPay) > 0)
    .map((s) => ({ name: fullName(s.employee), code: s.employee.employeeCode, bank: s.employee.bankName ?? "", account: s.employee.bankAccountNo ?? "", net: num(s.netPay), ref: `${ref}-${s.employee.employeeCode}` }));
  const total = Math.round(rows.reduce((a, r) => a + r.net * 100, 0)) / 100;
  const csv = csvOf([["name", "Employee name"], ["code", "Employee code"], ["bank", "Bank"], ["account", "Account no."], ["net", "Net pay"], ["ref", "Reference"]], rows, { name: `${rows.length} payees`, code: "", bank: "", account: "", net: total, ref: "" });
  return { csv, filename: `bank-${isoOf(run.payDate)}-${run.kind.toLowerCase()}.csv`, missing: rows.filter((r) => !r.account).length };
}

/** Summary GL journal for the run using the account map in Settings > Accounting. */
export async function glCsv(id: string) {
  const [run, map] = await Promise.all([getRun(id), getAccounting()]);
  const lines = buildJournal(run.payslips.map((s) => ({ lines: s.lines as unknown as PayslipLine[], department: s.employee.department?.name ?? null })), map);
  const t = (k: "debit" | "credit") => Math.round(lines.reduce((a, l) => a + l[k] * 100, 0)) / 100;
  const csv = csvOf(
    [["date", "Date"], ["account", "Account"], ["costCenter", "Cost center"], ["memo", "Description"], ["debit", "Debit"], ["credit", "Credit"]],
    lines.map((l) => ({ date: isoOf(run.payDate), ...l, memo: `${run.name}: ${l.memo}` })),
    { date: "", account: "TOTAL", costCenter: "", memo: "", debit: t("debit"), credit: t("credit") },
  );
  return { csv, filename: `gl-journal-${isoOf(run.payDate)}-${run.kind.toLowerCase()}.csv` };
}

export async function runCsv(id: string, type: "register" | "remittance") {
  const run = await getRun(id);
  const rows = run.payslips.map((s) => {
    const lines = s.lines as unknown as PayslipLine[];
    const code = (c: string) => sumLines(lines, (l) => l.code === c);
    const base = { code: s.employee.employeeCode, name: fullName(s.employee) };
    if (type === "remittance")
      return {
        ...base,
        sssNo: s.employee.sssNo ?? "",
        sssEe: num(s.sss),
        sssEr: code("SSS_ER"),
        sssEc: code("SSS_EC"),
        phNo: s.employee.philhealthNo ?? "",
        phEe: num(s.philhealth),
        phEr: code("PHILHEALTH_ER"),
        hdmfNo: s.employee.pagibigNo ?? "",
        hdmfEe: num(s.pagibig),
        hdmfEr: code("PAGIBIG_ER"),
        tin: s.employee.tin ?? "",
        tax: num(s.withholdingTax),
      };
    return {
      ...base,
      basic: num(s.basicPay),
      ot: sumLines(lines, (l) => l.code.startsWith("OT_")),
      premiums: sumLines(lines, (l) => ["HOLIDAY", "RESTDAY", "NIGHTDIFF", "13TH", "13TH_TAXABLE"].includes(l.code)),
      nontaxable: sumLines(lines, (l) => l.code === "ALLOWANCE" || l.code === "REIMBURSE"),
      other: sumLines(lines, (l) => l.kind === "earning" && !KNOWN_EARNINGS.has(l.code) && !l.code.startsWith("OT_")),
      gross: num(s.grossPay),
      sss: num(s.sss),
      philhealth: num(s.philhealth),
      pagibig: num(s.pagibig),
      tax: num(s.withholdingTax),
      loans: code("LOAN"),
      otherDed: sumLines(lines, (l) => l.kind === "deduction" && !["SSS", "PHILHEALTH", "PAGIBIG", "TAX", "LOAN"].includes(l.code)),
      deductions: num(s.totalDeductions),
      net: num(s.netPay),
    };
  });
  const columns =
    type === "remittance"
      ? [["code", "Employee code"], ["name", "Name"], ["sssNo", "SSS no."], ["sssEe", "SSS EE"], ["sssEr", "SSS ER"], ["sssEc", "SSS EC"], ["phNo", "PhilHealth no."], ["phEe", "PhilHealth EE"], ["phEr", "PhilHealth ER"], ["hdmfNo", "Pag-IBIG no."], ["hdmfEe", "Pag-IBIG EE"], ["hdmfEr", "Pag-IBIG ER"], ["tin", "TIN"], ["tax", "Withholding tax"]]
      : [["code", "Employee code"], ["name", "Name"], ["basic", "Basic (earned)"], ["ot", "Overtime"], ["premiums", "Holiday / rest day / ND"], ["nontaxable", "Allowance / reimbursements"], ["other", "Other earnings"], ["gross", "Gross"], ["sss", "SSS"], ["philhealth", "PhilHealth"], ["pagibig", "Pag-IBIG"], ["tax", "Withholding tax"], ["loans", "Loans"], ["otherDed", "Other deductions"], ["deductions", "Total deductions"], ["net", "Net pay"]];
  const totals: Record<string, string | number> = { code: "TOTAL", name: `${rows.length} employees` };
  for (const [k] of columns) {
    if (k === "code" || k === "name") continue;
    const vals = rows.map((r) => (r as Record<string, string | number>)[k!]);
    totals[k!] = typeof vals[0] === "number" ? Math.round(vals.reduce<number>((a, v) => a + Number(v) * 100, 0)) / 100 : "";
  }
  const csv = toCsv({ columns: columns.map(([key, label]) => ({ key: key!, label: label! })), rows, totals });
  return { csv, filename: `${type}-${isoOf(run.periodStart)}-to-${isoOf(run.periodEnd)}.csv` };
}
