import "server-only";
import { prisma, type Prisma } from "@hris/db";
import {
  DEFAULT_PAYROLL_CONFIG,
  DEFAULT_SHIFT,
  DEFAULT_TIMEZONE,
  LOAN_TYPE_LABELS,
  computePayslip,
  computeThirteenthMonth,
  cutoffHalf,
  mergePayrollConfig,
  nextCutoff,
  zonedParts,
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

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const today = () => zonedParts(new Date(), DEFAULT_TIMEZONE).date;

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
        include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, payType: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true } } },
        orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
      },
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

/** Generate (or replace) the payslips of a DRAFT run. */
export async function computeRun(actor: SessionUser, id: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound("Payroll run");
  if (run.status !== "DRAFT") throw conflict("Only draft runs can be computed");
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
  } else {
    const [dtr, ots, loans, expenses, def] = await Promise.all([
      dtrTotalsForRange(ids, from, to),
      prisma.overtimeRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", date: { gte: run.periodStart, lte: run.periodEnd } }, orderBy: { date: "asc" } }),
      prisma.loan.findMany({ where: { employeeId: { in: ids }, status: "ACTIVE", balance: { gt: 0 }, startDate: { lte: run.periodEnd } }, orderBy: { startDate: "asc" } }),
      prisma.expenseClaim.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", reimbursedInRunId: null, date: { lte: run.periodEnd } }, orderBy: { date: "asc" } }),
      prisma.workShift.findFirst({ where: { isDefault: true }, select: { workDays: true } }),
    ]);
    const half = run.frequency === "SEMI_MONTHLY" ? cutoffHalf(from) : 2;
    for (const e of emps) {
      const t = dtr.get(e.id);
      if (!t) continue;
      results.set(
        e.id,
        computePayslip({
          payType: e.payType,
          basicPay: num(e.basicPay),
          allowance: num(e.allowance),
          frequency: run.frequency,
          half,
          dtr: t,
          workDays: e.shift?.workDays ?? def?.workDays ?? DEFAULT_SHIFT.workDays,
          overtime: ots.filter((o) => o.employeeId === e.id).map((o) => ({ date: isoOf(o.date), minutes: o.minutes, startTime: o.startTime, endTime: o.endTime })),
          loans: loans.filter((l) => l.employeeId === e.id).map((l) => ({ id: l.id, label: LOAN_TYPE_LABELS[l.type], amortization: num(l.amortization), balance: num(l.balance) })),
          expenses: expenses.filter((x) => x.employeeId === e.id).map((x) => ({ id: x.id, label: `Reimbursement: ${x.category}`, amount: num(x.amount) })),
          config: cfg,
        }),
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // Status guard: a concurrent finalize wins, this recompute aborts.
    const g = await tx.payrollRun.updateMany({ where: { id, status: "DRAFT" }, data: { updatedAt: new Date() } });
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
  await audit(actor.id, "payroll.compute", "PayrollRun", id, { after: { payslips: results.size } });
  return results.size;
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
  const g = await prisma.payrollRun.deleteMany({ where: { id, status: "DRAFT" } });
  if (g.count !== 1) throw conflict("Only draft runs can be deleted");
  await audit(actor.id, "payroll.delete", "PayrollRun", id);
}

// ---------- Compensation ----------

export const listCompensation = () =>
  prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] } },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, payType: true, basicPay: true, allowance: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true, department: { select: { name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

export async function updateCompensation(actor: SessionUser, employeeId: string, d: CompensationInput) {
  const sel = { payType: true, basicPay: true, allowance: true, tin: true, sssNo: true, philhealthNo: true, pagibigNo: true } as const;
  const before = await prisma.employee.findUnique({ where: { id: employeeId }, select: sel });
  if (!before) throw notFound("Employee");
  const after = await prisma.employee.update({ where: { id: employeeId }, data: d, select: sel });
  await audit(actor.id, "compensation.update", "Employee", employeeId, { before, after });
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
      gross: num(s.grossPay),
      sss: num(s.sss),
      philhealth: num(s.philhealth),
      pagibig: num(s.pagibig),
      tax: num(s.withholdingTax),
      loans: code("LOAN"),
      deductions: num(s.totalDeductions),
      net: num(s.netPay),
    };
  });
  const columns =
    type === "remittance"
      ? [["code", "Employee code"], ["name", "Name"], ["sssNo", "SSS no."], ["sssEe", "SSS EE"], ["sssEr", "SSS ER"], ["sssEc", "SSS EC"], ["phNo", "PhilHealth no."], ["phEe", "PhilHealth EE"], ["phEr", "PhilHealth ER"], ["hdmfNo", "Pag-IBIG no."], ["hdmfEe", "Pag-IBIG EE"], ["hdmfEr", "Pag-IBIG ER"], ["tin", "TIN"], ["tax", "Withholding tax"]]
      : [["code", "Employee code"], ["name", "Name"], ["basic", "Basic (earned)"], ["ot", "Overtime"], ["premiums", "Holiday / rest day / ND"], ["nontaxable", "Allowance / reimbursements"], ["gross", "Gross"], ["sss", "SSS"], ["philhealth", "PhilHealth"], ["pagibig", "Pag-IBIG"], ["tax", "Withholding tax"], ["loans", "Loans"], ["deductions", "Total deductions"], ["net", "Net pay"]];
  const totals: Record<string, string | number> = { code: "TOTAL", name: `${rows.length} employees` };
  for (const [k] of columns) {
    if (k === "code" || k === "name") continue;
    const vals = rows.map((r) => (r as Record<string, string | number>)[k!]);
    totals[k!] = typeof vals[0] === "number" ? Math.round(vals.reduce<number>((a, v) => a + Number(v) * 100, 0)) / 100 : "";
  }
  const csv = toCsv({ columns: columns.map(([key, label]) => ({ key: key!, label: label! })), rows, totals });
  return { csv, filename: `${type}-${isoOf(run.periodStart)}-to-${isoOf(run.periodEnd)}.csv` };
}
