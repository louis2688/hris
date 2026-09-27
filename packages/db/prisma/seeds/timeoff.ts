/**
 * Demo time-off policies: VL encashable, SL accrues 1.25/month, a Compensatory Leave type, a company-wide year-end block
 * (Dec 29-31), weekly availability for Paolo and Kristine, and for Bianca (employee@): one pending and one approved
 * attendance correction, a day with only a time in (to "Fix"), and worked Saturdays to claim comp-off for.
 * Idempotent: rows are keyed on name/reason; punches it made are tagged "[seed:timeoff]" and replaced every run.
 * Also clears what the e2e suite leaves behind (rows whose reason starts with "E2E") so reseeding restores fixable days.
 */
import type { PrismaClient } from "../../generated/prisma/client.js";

const TZ_OFFSET = "+08:00"; // Asia/Manila, no DST
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** `n` days back, moved further back to a Mon-Fri. */
const weekdayBack = (n: number) => {
  let d = addDays(manilaToday(), -n);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
};
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00${TZ_OFFSET}`);

export async function seedTimeoff(prisma: PrismaClient) {
  const byEmail = (email: string) => prisma.employee.findFirst({ where: { user: { email } }, select: { id: true, managerId: true } });
  const [bianca, paolo, kristine] = await Promise.all([byEmail("employee@hris.local"), byEmail("paolo.garcia@hris.local"), byEmail("kristine.lim@hris.local")]);
  if (!bianca) return console.log("seedTimeoff: demo users missing, skipped");
  const today = manilaToday();
  const year = Number(today.slice(0, 4));

  // ---- Leave type policies ----
  await prisma.leaveType.updateMany({ where: { code: "VL" }, data: { allowEncashment: true } });
  await prisma.leaveType.updateMany({ where: { code: "SL" }, data: { accrualPerMonth: 1.25 } });
  await prisma.leaveType.upsert({
    where: { code: "CO" },
    update: { isCompensatory: true },
    create: { name: "Compensatory Leave", code: "CO", color: "#0f766e", defaultDays: 0, isCompensatory: true, approvalChain: ["MANAGER"], sortOrder: 50 },
  });

  // ---- Year-end block ----
  const from = new Date(`${year}-12-29`);
  if (!(await prisma.leaveBlockDate.findFirst({ where: { name: "Year-end inventory", from } }))) {
    await prisma.leaveBlockDate.create({ data: { name: "Year-end inventory", from, to: new Date(`${year}-12-31`) } });
  }

  // ---- Availability ----
  const avail: { employeeId: string; weekday: number; fromTime: string | null; toTime: string | null; note?: string }[] = [];
  if (paolo) for (const w of [1, 2, 3, 4, 5]) avail.push({ employeeId: paolo.id, weekday: w, fromTime: "07:00", toTime: "19:00", note: "Evening classes" });
  if (kristine) avail.push({ employeeId: kristine.id, weekday: 6, fromTime: null, toTime: null, note: "Family day" }, { employeeId: kristine.id, weekday: 0, fromTime: null, toTime: null });
  const who = avail.map((a) => a.employeeId);
  await prisma.$transaction([prisma.availability.deleteMany({ where: { employeeId: { in: who } } }), prisma.availability.createMany({ data: avail })]);

  // ---- Clean up e2e leftovers ----
  await prisma.leaveBlockDate.deleteMany({ where: { name: { startsWith: "E2E" } } });
  const e2eCorr = await prisma.attendanceCorrection.findMany({ where: { employeeId: bianca.id, reason: { startsWith: "E2E" } }, select: { id: true } });
  for (const c of e2eCorr) await prisma.attendancePunch.deleteMany({ where: { note: { startsWith: `[correction:${c.id}]` } } });
  await prisma.attendanceCorrection.deleteMany({ where: { id: { in: e2eCorr.map((c) => c.id) } } });
  const e2eComp = await prisma.compOffRequest.findMany({ where: { employeeId: bianca.id, reason: { startsWith: "E2E" } } });
  for (const c of e2eComp.filter((x) => x.status === "APPROVED" && x.decidedAt)) {
    await prisma.leaveEntitlement.updateMany({ where: { employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, year: c.decidedAt!.getUTCFullYear() }, data: { adjustment: { decrement: c.days } } });
  }
  await prisma.compOffRequest.deleteMany({ where: { id: { in: e2eComp.map((c) => c.id) } } });

  // ---- Bianca's punches: a day with only a time in, and worked Saturdays (comp-off) ----
  await prisma.attendancePunch.deleteMany({ where: { employeeId: bianca.id, note: { startsWith: "[seed:timeoff]" } } });
  const punches: { employeeId: string; at: Date; direction: "IN" | "OUT"; source: "WEB"; note: string }[] = [
    { employeeId: bianca.id, at: at(weekdayBack(16), "08:52"), direction: "IN", source: "WEB", note: "[seed:timeoff] forgot to clock out" },
  ];
  for (let d = addDays(today, -15); d >= addDays(today, -60); d = addDays(d, -1)) {
    if (weekday(d) !== 6) continue;
    punches.push({ employeeId: bianca.id, at: at(d, "09:05"), direction: "IN", source: "WEB", note: "[seed:timeoff] Saturday release support" });
    punches.push({ employeeId: bianca.id, at: at(d, "15:10"), direction: "OUT", source: "WEB", note: "[seed:timeoff] Saturday release support" });
  }
  await prisma.attendancePunch.createMany({ data: punches, skipDuplicates: true });

  // ---- Corrections ----
  if (!(await prisma.attendanceCorrection.findFirst({ where: { employeeId: bianca.id, reason: "Client site visit in BGC" } }))) {
    await prisma.attendanceCorrection.create({ data: { employeeId: bianca.id, date: new Date(weekdayBack(19)), kind: "OFFICIAL_BUSINESS", inTime: "09:00", outTime: "17:30", reason: "Client site visit in BGC" } });
  }
  let wfh = await prisma.attendanceCorrection.findFirst({ where: { employeeId: bianca.id, reason: "Typhoon signal no. 2, worked from home" } });
  if (!wfh) {
    wfh = await prisma.attendanceCorrection.create({
      data: { employeeId: bianca.id, date: new Date(weekdayBack(23)), kind: "WORK_FROM_HOME", inTime: "09:00", outTime: "18:00", reason: "Typhoon signal no. 2, worked from home", status: "APPROVED", approverId: bianca.managerId, decidedAt: new Date() },
    });
  }
  const wfhDate = wfh.date.toISOString().slice(0, 10);
  const note = `[correction:${wfh.id}] Work from home: ${wfh.reason}`;
  await prisma.attendancePunch.createMany({
    data: [
      { employeeId: bianca.id, at: at(wfhDate, "09:00"), direction: "IN", source: "MANUAL", note },
      { employeeId: bianca.id, at: at(wfhDate, "18:00"), direction: "OUT", source: "MANUAL", note },
    ],
    skipDuplicates: true,
  });
  console.log(`seedTimeoff: policies, 1 block, ${avail.length} availability rows, ${punches.length} punches, 2 corrections`);
}
