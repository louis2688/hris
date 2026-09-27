/**
 * Demo compensation (basic pay, allowances, gov ID placeholders) and one finalized payroll run for the
 * previous cutoff so /payslips has content. Idempotent: pay is only set where basicPay is null, the run
 * is keyed on (REGULAR, periodStart).
 */
import { computePayslip, DEFAULT_PAYROLL_CONFIG, nextCutoff, type DtrRangeTotals } from "@hris/shared";
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
  if (await prisma.payrollRun.findFirst({ where: { kind: "REGULAR", periodStart: new Date(cut.periodStart) } })) return;

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
}
