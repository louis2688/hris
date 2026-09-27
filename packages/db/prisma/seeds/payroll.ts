/**
 * Demo compensation (basic pay, allowances, gov ID placeholders) and one finalized payroll run for the
 * previous cutoff so /payslips has content. Idempotent: pay is only set where basicPay is null, the run
 * is keyed on (REGULAR, periodStart).
 */
import { computePayslip, DEFAULT_ACCOUNTS, DEFAULT_PAYROLL_CONFIG, nextCutoff, type DtrRangeTotals } from "@hris/shared";
import type { PrismaClient } from "../../generated/prisma/client.js";

// code -> [payType, basic (monthly or daily), monthly de minimis allowance]
const PAY: Record<string, ["MONTHLY" | "DAILY", number, number]> = {
  "EMP-0001": ["MONTHLY", 150000, 3000],
  "EMP-0002": ["MONTHLY", 85000, 2000],
  "EMP-0003": ["MONTHLY", 110000, 2000],
  "EMP-0004": ["MONTHLY", 72000, 2000],
  "EMP-0005": ["MONTHLY", 45000, 1500],
  "EMP-0006": ["MONTHLY", 38000, 1500],
  "EMP-0007": ["MONTHLY", 32000, 1000],
  "EMP-0008": ["MONTHLY", 28000, 1000],
  "EMP-0009": ["MONTHLY", 60000, 2000],
  "EMP-0010": ["DAILY", 720, 0],
  "EMP-0011": ["MONTHLY", 42000, 1500],
  "EMP-0012": ["DAILY", 695, 0],
};

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seedPayroll(prisma: PrismaClient) {
  const emps = await prisma.employee.findMany({ where: { employeeCode: { in: Object.keys(PAY) } }, select: { id: true, employeeCode: true, basicPay: true } });
  for (const e of emps) {
    if (e.basicPay != null) continue;
    const [payType, basicPay, allowance] = PAY[e.employeeCode]!;
    const n = Number(e.employeeCode.slice(-4));
    await prisma.employee.update({
      where: { id: e.id },
      data: { payType, basicPay, allowance, tin: `000-000-${pad(n, 3)}-000`, sssNo: `00-00000${pad(n, 2)}-0`, philhealthNo: `00-0000000${pad(n, 2)}-0`, pagibigNo: `0000-0000-${pad(n, 4)}` },
    });
  }

  // Previous semi-monthly cutoff relative to today (Asia/Manila).
  const today = iso(new Date(Date.now() + 8 * 3600_000));
  const current = nextCutoff("SEMI_MONTHLY", today, DEFAULT_PAYROLL_CONFIG.schedule, false);
  const prevDay = iso(new Date(Date.parse(current.periodStart) - 86400_000));
  const cut = nextCutoff("SEMI_MONTHLY", prevDay, DEFAULT_PAYROLL_CONFIG.schedule, false);
  if (await prisma.payrollRun.findFirst({ where: { kind: "REGULAR", periodStart: new Date(cut.periodStart) } })) return seedPayrollPlus(prisma);

  const payees = await prisma.employee.findMany({
    where: { employeeCode: { in: Object.keys(PAY) }, basicPay: { not: null }, hireDate: { lte: new Date(cut.periodEnd) } },
    select: { id: true, payType: true, basicPay: true, allowance: true },
  });
  let workDays = 0;
  for (let t = Date.parse(cut.periodStart); t <= Date.parse(cut.periodEnd); t += 86400_000) if (![0, 6].includes(new Date(t).getUTCDay())) workDays++;
  // ponytail: perfect attendance for the demo run; real runs read the DTR.
  const dtr: DtrRangeTotals = { workDays, present: workDays, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, lateMinutes: 0, undertimeMinutes: 0, workedMinutes: workDays * 480, nightMinutes: 0, holidays: [], restDaysWorked: [] };
  const admin = await prisma.user.findUnique({ where: { email: "admin@hris.local" }, select: { id: true } });

  await prisma.payrollRun.create({
    data: {
      name: cut.name,
      kind: "REGULAR",
      frequency: "SEMI_MONTHLY",
      periodStart: new Date(cut.periodStart),
      periodEnd: new Date(cut.periodEnd),
      payDate: new Date(cut.payDate),
      status: "FINALIZED",
      finalizedAt: new Date(),
      createdById: admin?.id,
      payslips: {
        create: payees.map((e) => {
          const r = computePayslip({
            payType: e.payType,
            basicPay: Number(e.basicPay),
            allowance: Number(e.allowance),
            frequency: "SEMI_MONTHLY",
            half: cut.half,
            dtr,
            workDays: [1, 2, 3, 4, 5],
            overtime: [],
            loans: [],
            expenses: [],
            config: DEFAULT_PAYROLL_CONFIG,
          });
          const { lines, ...totals } = r;
          return { employeeId: e.id, ...totals, lines: lines as object[] };
        }),
      },
    },
  });
  console.log(`seedPayroll: finalized run "${cut.name}" with ${payees.length} payslips`);
  await seedPayrollPlus(prisma);
}

/**
 * Round 3 demo data: adjustments, a scheduled raise, an HMO plan with 6 members, the GL account map and one
 * separation in clearance (Diana Cruz, EMP-0010, not a demo login). Idempotent: each block checks for its marker.
 */
export async function seedPayrollPlus(prisma: PrismaClient) {
  const today = iso(new Date(Date.now() + 8 * 3600_000));
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const nextMonth = `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1, 2)}-01`;
  const emps = new Map((await prisma.employee.findMany({ where: { employeeCode: { in: Object.keys(PAY) } }, select: { id: true, employeeCode: true } })).map((e) => [e.employeeCode, e.id]));
  const id = (code: string) => emps.get(code)!;
  const admin = await prisma.user.findUnique({ where: { email: "admin@hris.local" }, select: { id: true } });

  await prisma.appSetting.upsert({ where: { key: "accounting" }, create: { key: "accounting", value: DEFAULT_ACCOUNTS }, update: {} });

  if (!(await prisma.payrollAdjustment.count({ where: { note: { startsWith: "seed:" } } }))) {
    await prisma.payrollAdjustment.createMany({
      data: [
        { employeeId: id("EMP-0005"), kind: "EARNING", code: "BONUS", label: "Project delivery bonus", amount: 5000, taxable: true, effectiveDate: new Date(today), note: "seed: pending one-off", createdById: admin?.id },
        { employeeId: id("EMP-0006"), kind: "EARNING", code: "OTHER_EARNING", label: "Transportation allowance", amount: 1000, taxable: true, effectiveDate: new Date(`${month}-01`), recurring: true, note: "seed: recurring", createdById: admin?.id },
      ],
    });
  }

  // Scheduled raise for Angela Torres (EMP-0008) from the 1st of next month; the daily job applies it.
  const angela = id("EMP-0008");
  if (angela && !(await prisma.employeeCompensation.count({ where: { employeeId: angela, reason: "Annual increase" } }))) {
    await prisma.employeeCompensation.create({ data: { employeeId: angela, effectiveFrom: new Date(nextMonth), payType: "MONTHLY", basicPay: 30500, allowance: 1000, reason: "Annual increase", createdById: admin?.id } });
    await prisma.employmentEvent.create({
      data: { employeeId: angela, type: "SALARY_CHANGE", effectiveDate: new Date(nextMonth), from: { payType: "MONTHLY", basicPay: 28000, allowance: 1000 }, to: { payType: "MONTHLY", basicPay: 30500, allowance: 1000 }, note: "Annual increase", createdById: admin?.id },
    });
  }

  let plan = await prisma.benefitPlan.findFirst({ where: { name: "Maxicare Prima" } });
  if (!plan) {
    plan = await prisma.benefitPlan.create({ data: { name: "Maxicare Prima", provider: "Maxicare Healthcare Corp.", kind: "HMO", employerShare: 1800, employeeShare: 300, perDependentShare: 850 } });
    const deps: Record<string, { name: string; relationship: string; birthDate: string | null }[]> = {
      "EMP-0003": [{ name: "Lea Dela Cruz", relationship: "Spouse", birthDate: "1990-05-14" }, { name: "Miko Dela Cruz", relationship: "Child", birthDate: "2018-11-02" }],
      "EMP-0005": [{ name: "Rosa Garcia", relationship: "Parent", birthDate: "1965-03-09" }],
    };
    await prisma.employeeBenefit.createMany({
      data: ["EMP-0001", "EMP-0002", "EMP-0003", "EMP-0004", "EMP-0005", "EMP-0006"].filter((c) => emps.has(c)).map((c, k) => ({ employeeId: id(c), planId: plan!.id, effectiveFrom: new Date(`${y}-01-01`), cardNo: `MX-${y}-${pad(k + 101, 5)}`, dependents: deps[c] ?? [] })),
    });
  }

  const diana = id("EMP-0010");
  if (diana && !(await prisma.separation.count({ where: { employeeId: diana } }))) {
    const plus = (n: number) => iso(new Date(Date.parse(today) + n * 86_400_000));
    await prisma.separation.create({ data: { employeeId: diana, reason: "RESIGNATION", noticeDate: new Date(plus(-10)), lastDay: new Date(plus(20)), notes: "Relocating to Cebu for family reasons.", createdById: admin?.id } });
    const t = await prisma.checklistTemplate.findFirst({ where: { kind: "OFFBOARDING", isDefault: true }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    if (t && !(await prisma.employeeChecklist.count({ where: { employeeId: diana, kind: "OFFBOARDING" } }))) {
      const last = Date.parse(plus(20));
      await prisma.employeeChecklist.create({
        data: { employeeId: diana, kind: "OFFBOARDING", templateId: t.id, tasks: { create: t.items.map((it, n) => ({ title: it.title, owner: it.owner, dueDate: new Date(last - it.dueOffsetDays * 86_400_000), sortOrder: n, doneAt: n < 2 ? new Date() : null })) } },
      });
    }
  }
  console.log("seedPayrollPlus: adjustments, scheduled raise, HMO plan, accounting map, separation");
}
