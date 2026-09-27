/**
 * Demo overtime, COE, expense claims and a cash advance. Idempotent: every row is keyed on (employee, reason/purpose/description).
 */
import type { PrismaClient } from "../../generated/prisma/client.js";

const day = (offset: number) => {
  const t = new Date(Date.now() + 8 * 3600_000); // Asia/Manila
  t.setUTCHours(0, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() + offset);
  return t;
};

export async function seedRequests(prisma: PrismaClient) {
  const byEmail = (email: string) => prisma.employee.findFirst({ where: { user: { email } }, select: { id: true, managerId: true } });
  const [emp, mgr, hr] = await Promise.all([byEmail("employee@hris.local"), byEmail("manager@hris.local"), prisma.user.findUnique({ where: { email: "hr@hris.local" }, select: { id: true } })]);
  if (!emp || !mgr) return console.log("seedRequests: demo users missing, skipped");
  const decided = { decidedAt: day(-1) };

  const ot = [
    { employeeId: emp.id, date: day(-6), startTime: "18:00", endTime: "21:00", minutes: 180, reason: "Sprint release deployment", status: "APPROVED" as const, approverId: emp.managerId, ...decided },
    { employeeId: emp.id, date: day(-2), startTime: "22:00", endTime: "01:30", minutes: 210, reason: "Production incident follow-up", status: "PENDING" as const, approverId: emp.managerId },
    { employeeId: mgr.id, date: day(-3), startTime: "17:30", endTime: "19:30", minutes: 120, reason: "Quarterly planning prep", status: "PENDING" as const, approverId: mgr.managerId },
  ];
  for (const o of ot) {
    if (!(await prisma.overtimeRequest.findFirst({ where: { employeeId: o.employeeId, reason: o.reason } }))) await prisma.overtimeRequest.create({ data: o });
  }

  if (!(await prisma.coeRequest.findFirst({ where: { employeeId: emp.id, purpose: "Visa application" } }))) {
    await prisma.coeRequest.create({ data: { employeeId: emp.id, purpose: "Visa application", includeCompensation: true, status: "APPROVED", decidedById: hr?.id, ...decided } });
  }

  const claims = [
    { employeeId: emp.id, date: day(-4), category: "Transportation", amount: "385.50", description: "Grab to client site in Makati", status: "APPROVED" as const, approverId: emp.managerId, ...decided },
    { employeeId: emp.id, date: day(-1), category: "Meals", amount: "1250.00", description: "Team dinner during release night", status: "PENDING" as const, approverId: emp.managerId },
  ];
  for (const c of claims) {
    if (!(await prisma.expenseClaim.findFirst({ where: { employeeId: c.employeeId, description: c.description } }))) await prisma.expenseClaim.create({ data: c });
  }

  if (!(await prisma.loan.findFirst({ where: { employeeId: emp.id, reason: "Emergency home repair" } }))) {
    await prisma.loan.create({
      data: { employeeId: emp.id, type: "CASH_ADVANCE", principal: "10000.00", amortization: "2500.00", balance: "10000.00", startDate: day(7), status: "ACTIVE", reason: "Emergency home repair", decidedById: hr?.id, ...decided },
    });
  }
  console.log("seedRequests: done");
}
