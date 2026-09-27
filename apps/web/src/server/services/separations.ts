import "server-only";
import { prisma, type Prisma } from "@hris/db";
import {
  DEFAULT_SHIFT,
  EXIT_QUESTIONS,
  EMPTY_DTR,
  LOAN_TYPE_LABELS,
  computeFinalPay,
  cutoffHalf,
  finalPayDeadline,
  nextCutoff,
  separationStatusFor,
  slipTaxableIncome,
  type ExitInterview,
  type PayslipLine,
  type SessionUser,
} from "@hris/shared";
import type { z } from "zod";
import type { exitInterviewSchema, finalPaySchema, startSeparationSchema } from "@hris/shared";
import { audit } from "./audit";
import { dtrTotalsForRange } from "./attendance";
import { getBalances } from "./leave";
import { checklistsForEmployee, startDefaultChecklist } from "./onboarding";
import { AppError, conflict, notFound } from "./errors";
import { adjustmentWhere, benefitDeductions, getPayrollConfig, isoOf, num, payForPeriod, savePayslips, toAdj, today } from "./payroll";

const empSelect = { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, userId: true, employmentStatus: true, hireDate: true, department: { select: { name: true } }, jobTitle: { select: { name: true } } } as const;
const OPEN = ["CLEARANCE", "FINAL_PAY"] as const;
const plusDay = (iso: string, n = 1) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function listSeparations(status?: string) {
  const rows = await prisma.separation.findMany({
    where: status === "open" ? { status: { in: [...OPEN] } } : status === "closed" ? { status: { in: ["COMPLETED", "CANCELLED"] } } : {},
    include: { employee: { select: empSelect }, finalPayRun: { select: { id: true, status: true } } },
    orderBy: [{ lastDay: "desc" }],
    take: 200,
  });
  const t = today();
  return rows.map((s) => {
    const deadline = finalPayDeadline(isoOf(s.lastDay));
    const paid = s.finalPayRun?.status === "FINALIZED" || s.finalPayRun?.status === "PAID";
    return { ...s, deadline, overdue: !paid && s.status !== "CANCELLED" && t > deadline };
  });
}

/** Active employees without an open separation (start dialog picker). */
export const separationCandidates = () =>
  prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] }, separations: { none: { status: { in: [...OPEN] } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true },
  });

export async function startSeparation(actor: SessionUser, d: z.infer<typeof startSeparationSchema>) {
  const emp = await prisma.employee.findFirst({ where: { id: d.employeeId, deletedAt: null }, select: { id: true } });
  if (!emp) throw notFound("Employee");
  // ponytail: check-then-insert; two HR users separating the same person at once is not worth a constraint.
  if (await prisma.separation.count({ where: { employeeId: d.employeeId, status: { in: [...OPEN] } } })) throw conflict("This employee already has an open separation");
  const s = await prisma.separation.create({
    data: { employeeId: d.employeeId, reason: d.reason, noticeDate: d.noticeDate ? new Date(d.noticeDate) : null, lastDay: new Date(d.lastDay), notes: d.notes, createdById: actor.id },
  });
  await startDefaultChecklist(actor.id, d.employeeId, "OFFBOARDING", true);
  await audit(actor.id, "separation.start", "Separation", s.id, { after: s });
  return s;
}

/** Separation with its clearance checklist computed live. */
export async function getSeparation(id: string) {
  const s = await prisma.separation.findUnique({ where: { id }, include: { employee: { select: { ...empSelect, payType: true, basicPay: true } }, finalPayRun: { include: { payslips: true } } } });
  if (!s) throw notFound("Separation");
  const eid = s.employeeId;
  const year = s.lastDay.getUTCFullYear();
  const [assets, loans, claims, leave, ot, loanReq, coe, corrections, balances, checklists, leaveTypes] = await Promise.all([
    prisma.asset.findMany({ where: { assignedToId: eid }, select: { id: true, tag: true, name: true, cost: true }, orderBy: { tag: "asc" } }),
    prisma.loan.findMany({ where: { employeeId: eid, status: "ACTIVE", balance: { gt: 0 } }, select: { id: true, type: true, balance: true } }),
    prisma.expenseClaim.findMany({ where: { employeeId: eid, OR: [{ status: "PENDING" }, { status: "APPROVED", reimbursedInRunId: null }] }, select: { id: true, category: true, amount: true, status: true } }),
    prisma.leaveRequest.count({ where: { employeeId: eid, status: "PENDING" } }),
    prisma.overtimeRequest.count({ where: { employeeId: eid, status: "PENDING" } }),
    prisma.loan.count({ where: { employeeId: eid, status: "PENDING" } }),
    prisma.coeRequest.count({ where: { employeeId: eid, status: "PENDING" } }),
    prisma.attendanceCorrection.count({ where: { employeeId: eid, status: "PENDING" } }),
    getBalances(eid, year),
    checklistsForEmployee(eid),
    prisma.leaveType.findMany({ where: { allowEncashment: true }, select: { id: true } }),
  ]);
  // Encashable leave: types HR flagged "allow encashment" (Settings > Leave types), e.g. SIL/VL. Sick leave is not
  // converted unless the company flags it. HR can override the days before computing final pay.
  const encashable = new Set(leaveTypes.map((t) => t.id));
  const leaveRows = balances.map((b) => ({ ...b, encashable: encashable.has(b.leaveTypeId) }));
  const suggestedEncash = Math.max(0, Math.round(leaveRows.filter((b) => b.encashable).reduce((a, b) => a + Math.max(0, b.available), 0) * 100) / 100);
  const offboarding = checklists.find((c) => c.kind === "OFFBOARDING") ?? null;
  const pending = { leave, overtime: ot, loans: loanReq, coe, corrections };
  const deadline = finalPayDeadline(isoOf(s.lastDay));
  const paid = s.finalPayRun?.status === "FINALIZED" || s.finalPayRun?.status === "PAID";
  return {
    ...s,
    exitInterview: s.exitInterview as ExitInterview | null,
    deadline,
    overdue: !paid && s.status !== "CANCELLED" && today() > deadline,
    finalPaid: paid,
    clearance: { assets, loans, claims, pending, pendingTotal: Object.values(pending).reduce((a, b) => a + b, 0), leave: leaveRows, suggestedEncash, offboarding },
  };
}
export type SeparationDetail = Awaited<ReturnType<typeof getSeparation>>;

export async function startOffboarding(actor: SessionUser, id: string) {
  const s = await prisma.separation.findUnique({ where: { id }, select: { employeeId: true } });
  if (!s) throw notFound("Separation");
  const c = await startDefaultChecklist(actor.id, s.employeeId, "OFFBOARDING", true);
  if (!c) throw new AppError("No default offboarding template. Create one in Settings > Checklists.");
}

export async function saveExitInterview(actor: SessionUser, id: string, d: z.infer<typeof exitInterviewSchema>) {
  const data: ExitInterview = {
    answers: (Object.keys(EXIT_QUESTIONS) as (keyof typeof EXIT_QUESTIONS)[]).map((key) => ({ key, q: EXIT_QUESTIONS[key], a: d[key] })),
    rehireEligible: d.rehireEligible,
    at: new Date().toISOString(),
  };
  const g = await prisma.separation.updateMany({ where: { id, status: { in: [...OPEN] } }, data: { exitInterview: data as unknown as Prisma.InputJsonValue } });
  if (g.count !== 1) throw conflict("Only open separations can be edited");
  await audit(actor.id, "separation.exit-interview", "Separation", id, { after: data });
}

/**
 * Create (or recompute) the FINAL_PAY draft run for one employee, from the day after the last regular cutoff to the
 * last day. Contributions and HMO for that stretch follow the cutoff half the last day falls in; when the stretch is
 * empty (last cutoff already paid through the last day) there is no basic, contributions or HMO.
 * ponytail: a stretch longer than one cutoff is paid as one period; run regular payroll for full cutoffs first.
 */
export async function computeFinalPayRun(actor: SessionUser, id: string, opts: z.infer<typeof finalPaySchema>) {
  const s = await prisma.separation.findUnique({ where: { id }, include: { finalPayRun: true, employee: { select: { id: true, payType: true, basicPay: true, allowance: true, shift: { select: { workDays: true } } } } } });
  if (!s) throw notFound("Separation");
  if (!OPEN.includes(s.status as (typeof OPEN)[number])) throw conflict("This separation is closed");
  if (s.finalPayRun && s.finalPayRun.status !== "DRAFT") throw conflict("Final pay is already finalized");
  const e = s.employee;
  if (e.basicPay == null) throw new AppError("Set this employee's basic pay under Payroll > Compensation first");
  const cfg = await getPayrollConfig();
  const lastDay = isoOf(s.lastDay);
  const year = s.lastDay.getUTCFullYear();

  const lastRegular = await prisma.payrollRun.findFirst({ where: { kind: "REGULAR", status: { in: ["FINALIZED", "PAID"] }, payslips: { some: { employeeId: e.id } } }, orderBy: { periodEnd: "desc" }, select: { periodEnd: true } });
  const start = lastRegular ? plusDay(isoOf(lastRegular.periodEnd)) : isoOf((await prisma.employee.findUniqueOrThrow({ where: { id: e.id }, select: { hireDate: true } })).hireDate);
  const empty = start > lastDay;
  const from = empty ? lastDay : start;
  const startD = new Date(from);
  const endD = s.lastDay;

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const [dtr, ots, loans, expenses, def, adjs, benefits, pay, ytdSlips, assets] = await Promise.all([
    empty ? Promise.resolve(new Map()) : dtrTotalsForRange([e.id], from, lastDay),
    empty ? Promise.resolve([]) : prisma.overtimeRequest.findMany({ where: { employeeId: e.id, status: "APPROVED", date: { gte: startD, lte: endD } }, orderBy: { date: "asc" } }),
    prisma.loan.findMany({ where: { employeeId: e.id, status: "ACTIVE", balance: { gt: 0 } }, orderBy: { startDate: "asc" } }),
    prisma.expenseClaim.findMany({ where: { employeeId: e.id, status: "APPROVED", reimbursedInRunId: null }, orderBy: { date: "asc" } }),
    prisma.workShift.findFirst({ where: { isDefault: true }, select: { workDays: true } }),
    prisma.payrollAdjustment.findMany({ where: { employeeId: e.id, ...adjustmentWhere("FINAL_PAY", startD, endD) }, orderBy: { effectiveDate: "asc" } }),
    empty ? Promise.resolve(new Map()) : benefitDeductions([e.id], startD, endD),
    payForPeriod([e], from, lastDay),
    prisma.payslip.findMany({ where: { employeeId: e.id, run: { status: { in: ["FINALIZED", "PAID"] }, payDate: { gte: yearStart, lte: new Date(Date.UTC(year, 11, 31)) } } }, select: { basicPay: true, withholdingTax: true, grossPay: true, lines: true, run: { select: { kind: true } } } }),
    opts.deductAssets ? prisma.asset.findMany({ where: { assignedToId: e.id }, select: { id: true, tag: true, name: true, cost: true } }) : Promise.resolve([]),
  ]);
  const p = pay.get(e.id)!;
  const ytd = { basicEarned: 0, thirteenthPaid: 0, taxable: 0, withheld: 0 };
  for (const sl of ytdSlips) {
    const lines = sl.lines as unknown as PayslipLine[];
    if (sl.run.kind === "REGULAR") ytd.basicEarned += num(sl.basicPay);
    ytd.thirteenthPaid += lines.filter((l) => l.code === "13TH" || l.code === "13TH_TAXABLE").reduce((a, l) => a + l.amount, 0);
    ytd.taxable += slipTaxableIncome(lines);
    ytd.withheld += num(sl.withholdingTax);
  }

  const r = computeFinalPay({
    payType: p.payType,
    basicPay: p.basicPay,
    allowance: empty ? 0 : p.allowance,
    frequency: cfg.schedule.frequency,
    half: cfg.schedule.frequency === "SEMI_MONTHLY" ? cutoffHalf(lastDay) : 2,
    dtr: dtr.get(e.id) ?? EMPTY_DTR,
    workDays: e.shift?.workDays ?? def?.workDays ?? DEFAULT_SHIFT.workDays,
    overtime: ots.map((o) => ({ date: isoOf(o.date), minutes: o.minutes, startTime: o.startTime, endTime: o.endTime })),
    loans: loans.map((l) => ({ id: l.id, label: LOAN_TYPE_LABELS[l.type], amortization: num(l.amortization), balance: num(l.balance) })),
    expenses: expenses.map((x) => ({ id: x.id, label: `Reimbursement: ${x.category}`, amount: num(x.amount) })),
    adjustments: adjs.map(toAdj),
    benefits: benefits.get(e.id) ?? [],
    noContributions: empty,
    config: cfg,
    ytd,
    encashDays: opts.encashDays,
    assets: assets.map((a) => ({ id: a.id, label: `${a.name} (${a.tag})`, amount: num(a.cost) })),
  });

  const cut = nextCutoff(cfg.schedule.frequency, lastDay, cfg.schedule, false);
  const runFields = { periodStart: startD, periodEnd: endD, payDate: new Date(cut.payDate < lastDay ? lastDay : cut.payDate) };
  let runId = s.finalPayRunId;
  if (!runId) {
    const name = await prisma.employee.findUniqueOrThrow({ where: { id: e.id }, select: { firstName: true, lastName: true } });
    const run = await prisma.payrollRun.create({ data: { name: `Final pay: ${name.firstName} ${name.lastName}`, kind: "FINAL_PAY", frequency: cfg.schedule.frequency, ...runFields, createdById: actor.id } });
    runId = run.id;
  }
  await savePayslips(runId, new Map([[e.id, r]]), runFields);
  await prisma.separation.update({ where: { id }, data: { status: "FINAL_PAY", finalPayRunId: runId, leaveEncashDays: opts.encashDays } });
  await audit(actor.id, "separation.final-pay", "Separation", id, { after: { runId, netPay: r.netPay, amountDue: r.amountDue ?? 0, ...opts } });
  return runId;
}

/** Close out: employee status, termination date, login off, SEPARATION event. Final pay must be finalized. */
export async function completeSeparation(actor: SessionUser, id: string) {
  const s = await prisma.separation.findUnique({ where: { id }, include: { finalPayRun: { select: { status: true } }, employee: { select: { employmentStatus: true, terminationDate: true, userId: true } } } });
  if (!s) throw notFound("Separation");
  if (!s.finalPayRun || s.finalPayRun.status === "DRAFT") throw conflict("Finalize the final pay run first");
  const status = separationStatusFor(s.reason);
  await prisma.$transaction(async (tx) => {
    const g = await tx.separation.updateMany({ where: { id, status: "FINAL_PAY" }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (g.count !== 1) throw conflict("This separation is not awaiting completion");
    await tx.employee.update({ where: { id: s.employeeId }, data: { employmentStatus: status, terminationDate: s.lastDay } });
    if (s.employee.userId) {
      await tx.user.update({ where: { id: s.employee.userId }, data: { isActive: false } });
      await tx.refreshToken.deleteMany({ where: { userId: s.employee.userId } });
    }
    await tx.employmentEvent.create({
      data: {
        employeeId: s.employeeId,
        type: "SEPARATION",
        effectiveDate: s.lastDay,
        from: { employmentStatus: s.employee.employmentStatus, terminationDate: s.employee.terminationDate ? isoOf(s.employee.terminationDate) : null },
        to: { employmentStatus: status, terminationDate: isoOf(s.lastDay), reason: s.reason },
        note: s.notes,
        appliedAt: new Date(),
        createdById: actor.id,
      },
    });
  });
  await audit(actor.id, "separation.complete", "Separation", id, { after: { employmentStatus: status } });
}

export async function cancelSeparation(actor: SessionUser, id: string) {
  const s = await prisma.separation.findUnique({ where: { id }, include: { finalPayRun: { select: { id: true, status: true } } } });
  if (!s) throw notFound("Separation");
  if (s.finalPayRun && s.finalPayRun.status !== "DRAFT") throw conflict("Final pay is already finalized; complete the separation instead");
  await prisma.$transaction(async (tx) => {
    const g = await tx.separation.updateMany({ where: { id, status: { in: [...OPEN] } }, data: { status: "CANCELLED", finalPayRunId: null } });
    if (g.count !== 1) throw conflict("This separation is already closed");
    if (s.finalPayRun) await tx.payrollRun.deleteMany({ where: { id: s.finalPayRun.id, status: "DRAFT" } });
  });
  await audit(actor.id, "separation.cancel", "Separation", id);
}

