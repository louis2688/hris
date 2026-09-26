/**
 * Seed: org structure, leave types, PH holidays, and a demo workforce.
 * Idempotent: safe to re-run (upserts by natural keys).
 *
 *   pnpm db:seed
 *
 * Demo logins (password for all: Password123!):
 *   admin@hris.local    ADMIN
 *   hr@hris.local       HR
 *   manager@hris.local  MANAGER (Engineering)
 *   employee@hris.local EMPLOYEE (reports to manager)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";
const YEAR = new Date().getUTCFullYear();
const d = (s: string) => new Date(s);

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  // ---- Org ----
  const depts = Object.fromEntries(
    await Promise.all(
      [
        ["Executive", "EXEC"],
        ["Engineering", "ENG"],
        ["Human Resources", "HR"],
        ["Finance", "FIN"],
        ["Sales", "SALES"],
        ["Customer Support", "CS"],
      ].map(async ([name, code]) => [code, await prisma.department.upsert({ where: { name: name! }, update: {}, create: { name: name!, code } })] as const),
    ),
  );
  const titles = Object.fromEntries(
    await Promise.all(
      ["Chief Executive Officer", "HR Manager", "HR Generalist", "Engineering Manager", "Senior Software Engineer", "Software Engineer", "QA Engineer", "Accountant", "Sales Executive", "Support Specialist"].map(
        async (name) => [name, await prisma.jobTitle.upsert({ where: { name }, update: {}, create: { name } })] as const,
      ),
    ),
  );
  const manila = await prisma.location.upsert({ where: { name: "Manila HQ" }, update: {}, create: { name: "Manila HQ", city: "Pasig", country: "Philippines", timezone: "Asia/Manila", address: "Ortigas Center" } });
  const cebu = await prisma.location.upsert({ where: { name: "Cebu Office" }, update: {}, create: { name: "Cebu Office", city: "Cebu City", country: "Philippines", timezone: "Asia/Manila" } });

  // ---- Leave types ----
  const lt = async (name: string, code: string, color: string, defaultDays: number, extra: Partial<{ isPaid: boolean; requiresApproval: boolean; allowHalfDay: boolean; maxConsecutiveDays: number; sortOrder: number }> = {}) =>
    prisma.leaveType.upsert({ where: { code }, update: { name, color, defaultDays, ...extra }, create: { name, code, color, defaultDays, ...extra } });
  const VL = await lt("Vacation Leave", "VL", "#2563eb", 15, { sortOrder: 1 });
  const SL = await lt("Sick Leave", "SL", "#dc2626", 15, { sortOrder: 2 });
  const EL = await lt("Emergency Leave", "EL", "#f59e0b", 3, { sortOrder: 3, allowHalfDay: false });
  await lt("Maternity Leave", "ML", "#db2777", 0, { sortOrder: 4, allowHalfDay: false, maxConsecutiveDays: 105 });
  await lt("Paternity Leave", "PL", "#7c3aed", 0, { sortOrder: 5, allowHalfDay: false, maxConsecutiveDays: 7 });
  await lt("Unpaid Leave", "UL", "#64748b", 0, { sortOrder: 6, isPaid: false });
  await lt("Work From Home", "WFH", "#0d9488", 0, { sortOrder: 7, isPaid: false, requiresApproval: false });

  // ---- PH regular holidays (nationwide) ----
  const holidays: [string, string][] = [
    ["New Year's Day", `${YEAR}-01-01`],
    ["Araw ng Kagitingan", `${YEAR}-04-09`],
    ["Labor Day", `${YEAR}-05-01`],
    ["Independence Day", `${YEAR}-06-12`],
    ["National Heroes Day", `${YEAR}-08-31`],
    ["Bonifacio Day", `${YEAR}-11-30`],
    ["Christmas Day", `${YEAR}-12-25`],
    ["Rizal Day", `${YEAR}-12-30`],
  ];
  for (const [name, date] of holidays) {
    const existing = await prisma.holiday.findFirst({ where: { date: d(date), locationId: null } });
    if (!existing) await prisma.holiday.create({ data: { name, date: d(date) } });
  }

  // ---- People ----
  type P = { code: string; first: string; last: string; email: string; role?: "ADMIN" | "HR" | "MANAGER" | "EMPLOYEE"; dept: string; title: string; loc?: string; manager?: string; hire: string; gender?: "MALE" | "FEMALE"; mobile?: string };
  const people: P[] = [
    { code: "EMP-0001", first: "Alexandra", last: "Reyes", email: "admin@hris.local", role: "ADMIN", dept: "EXEC", title: "Chief Executive Officer", hire: "2018-01-15", gender: "FEMALE" },
    { code: "EMP-0002", first: "Maricel", last: "Santos", email: "hr@hris.local", role: "HR", dept: "HR", title: "HR Manager", manager: "EMP-0001", hire: "2019-03-04", gender: "FEMALE" },
    { code: "EMP-0003", first: "Jomar", last: "Dela Cruz", email: "manager@hris.local", role: "MANAGER", dept: "ENG", title: "Engineering Manager", manager: "EMP-0001", hire: "2019-07-22", gender: "MALE" },
    { code: "EMP-0004", first: "Bianca", last: "Villanueva", email: "employee@hris.local", role: "EMPLOYEE", dept: "ENG", title: "Senior Software Engineer", manager: "EMP-0003", hire: "2021-02-01", gender: "FEMALE", mobile: "+63 917 555 0104" },
    { code: "EMP-0005", first: "Paolo", last: "Garcia", email: "paolo.garcia@hris.local", dept: "ENG", title: "Software Engineer", manager: "EMP-0003", hire: "2022-06-13", gender: "MALE" },
    { code: "EMP-0006", first: "Kristine", last: "Lim", email: "kristine.lim@hris.local", dept: "ENG", title: "QA Engineer", manager: "EMP-0003", hire: "2023-01-09", gender: "FEMALE", loc: "cebu" },
    { code: "EMP-0007", first: "Rafael", last: "Mendoza", email: "rafael.mendoza@hris.local", dept: "ENG", title: "Software Engineer", manager: "EMP-0003", hire: `${YEAR}-08-03`, gender: "MALE" },
    { code: "EMP-0008", first: "Angela", last: "Torres", email: "angela.torres@hris.local", dept: "HR", title: "HR Generalist", manager: "EMP-0002", hire: "2022-10-17", gender: "FEMALE" },
    { code: "EMP-0009", first: "Miguel", last: "Bautista", email: "miguel.bautista@hris.local", role: "MANAGER", dept: "SALES", title: "Sales Executive", manager: "EMP-0001", hire: "2020-05-11", gender: "MALE" },
    { code: "EMP-0010", first: "Diana", last: "Cruz", email: "diana.cruz@hris.local", dept: "SALES", title: "Sales Executive", manager: "EMP-0009", hire: "2023-04-03", gender: "FEMALE" },
    { code: "EMP-0011", first: "Noel", last: "Fernandez", email: "noel.fernandez@hris.local", dept: "FIN", title: "Accountant", manager: "EMP-0001", hire: "2020-09-21", gender: "MALE" },
    { code: "EMP-0012", first: "Camille", last: "Ramos", email: "camille.ramos@hris.local", dept: "CS", title: "Support Specialist", manager: "EMP-0009", hire: `${YEAR}-09-01`, gender: "FEMALE", loc: "cebu" },
  ];

  const byCode = new Map<string, string>();
  for (const p of people) {
    const emp = await prisma.employee.upsert({
      where: { employeeCode: p.code },
      update: {},
      create: {
        employeeCode: p.code,
        firstName: p.first,
        lastName: p.last,
        gender: p.gender ?? "UNDISCLOSED",
        workEmail: p.email,
        mobile: p.mobile,
        department: { connect: { id: depts[p.dept]!.id } },
        jobTitle: { connect: { id: titles[p.title]!.id } },
        location: { connect: { id: (p.loc === "cebu" ? cebu : manila).id } },
        hireDate: d(p.hire),
        employmentStatus: new Date(p.hire) > new Date(Date.now() - 180 * 86400000) ? "PROBATION" : "ACTIVE",
        city: p.loc === "cebu" ? "Cebu City" : "Pasig",
        country: "Philippines",
        user: { create: { email: p.email, passwordHash: hash, role: p.role ?? "EMPLOYEE" } },
      },
    });
    byCode.set(p.code, emp.id);
  }
  for (const p of people) {
    if (p.manager) await prisma.employee.update({ where: { employeeCode: p.code }, data: { managerId: byCode.get(p.manager) } });
  }
  await prisma.department.update({ where: { id: depts.ENG!.id }, data: { headId: byCode.get("EMP-0003") } });
  await prisma.department.update({ where: { id: depts.HR!.id }, data: { headId: byCode.get("EMP-0002") } });
  await prisma.department.update({ where: { id: depts.EXEC!.id }, data: { headId: byCode.get("EMP-0001") } });

  // Emergency contact for the demo employee
  const bianca = byCode.get("EMP-0004")!;
  if (!(await prisma.emergencyContact.findFirst({ where: { employeeId: bianca } }))) {
    await prisma.emergencyContact.create({ data: { employeeId: bianca, name: "Roberto Villanueva", relationship: "Father", phone: "+63 917 555 0199", isPrimary: true } });
  }

  // ---- Entitlements for the year ----
  const types = await prisma.leaveType.findMany({ where: { defaultDays: { gt: 0 } } });
  await prisma.leaveEntitlement.createMany({
    data: [...byCode.values()].flatMap((employeeId) => types.map((t) => ({ employeeId, leaveTypeId: t.id, year: YEAR, entitledDays: t.defaultDays }))),
    skipDuplicates: true,
  });

  // ---- Sample leave requests (only if none exist) ----
  if ((await prisma.leaveRequest.count()) === 0) {
    const mk = (employeeCode: string, leaveTypeId: string, start: string, end: string, totalDays: number, status: "PENDING" | "APPROVED" | "REJECTED", reason?: string, approverCode?: string) =>
      prisma.leaveRequest.create({
        data: {
          employeeId: byCode.get(employeeCode)!,
          leaveTypeId,
          startDate: d(start),
          endDate: d(end),
          totalDays,
          reason,
          status,
          approverId: status === "PENDING" ? null : byCode.get(approverCode ?? "EMP-0003"),
          decidedAt: status === "PENDING" ? null : new Date(),
          events: { create: [{ action: "SUBMITTED", note: reason }, ...(status !== "PENDING" ? [{ action: status }] : [])] },
        },
      });
    const nextMon = (() => {
      const t = new Date();
      t.setUTCDate(t.getUTCDate() + ((8 - t.getUTCDay()) % 7 || 7));
      return t;
    })();
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    const plus = (x: Date, n: number) => iso(new Date(x.getTime() + n * 86400000));
    await mk("EMP-0004", VL.id, plus(nextMon, 7), plus(nextMon, 9), 3, "PENDING", "Family trip to Baguio");
    await mk("EMP-0005", SL.id, plus(nextMon, -7), plus(nextMon, -7), 1, "APPROVED", "Fever");
    await mk("EMP-0006", VL.id, plus(nextMon, 14), plus(nextMon, 18), 5, "PENDING", "Annual vacation");
    await mk("EMP-0010", EL.id, plus(nextMon, -14), plus(nextMon, -13), 2, "REJECTED", "Personal matter", "EMP-0009");
    await mk("EMP-0007", VL.id, plus(nextMon, 1), plus(nextMon, 1), 1, "APPROVED", "Errand");
  }

  console.log(`Seeded. ${people.length} employees. Password for all demo accounts: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
