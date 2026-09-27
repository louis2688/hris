import "server-only";
import { prisma, type Prisma } from "@hris/db";
import {
  addDaysIso,
  COMPOFF_MAX_DAYS_BACK,
  CORRECTION_KIND_LABELS,
  CORRECTION_MAX_DAYS_BACK,
  correctionNeeds,
  correctionPunchTimes,
  dailyRate,
  DEFAULT_TIMEZONE,
  encashmentTaxSplit,
  parseAttendanceImport,
  round2,
  zonedParts,
  zonedToUtc,
  type BlockDateInput,
  type CompOffInput,
  type CorrectionInput,
  type DecisionInput,
  type EncashmentInput,
  type SessionUser,
} from "@hris/shared";
import { AuthError } from "../auth/session";
import { isStaff } from "../authz";
import { dtrEmployeeSelect, dtrRowsForRange, employeeClock } from "./attendance";
import { audit, notify } from "./audit";
import { fullName } from "./employees";
import { AppError, conflict, notFound } from "./errors";
import { getBalances } from "./leave";
import { getPayrollConfig } from "./payroll";

const manilaToday = () => zonedParts(new Date(), DEFAULT_TIMEZONE).date;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const needEmployee = (u: SessionUser) => {
  if (!u.employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE");
  return u.employeeId;
};

export const person = {
  select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true, avatarUrl: true, managerId: true, userId: true, department: { select: { name: true } } },
} as const;
type Owned = { employeeId: string; employee: { managerId: string | null } };

/** Manager of the employee, or HR/Admin. Never the employee themself. */
export const canApprove = (u: SessionUser, r: Owned) => r.employeeId !== u.employeeId && (isStaff(u) || (!!u.employeeId && r.employee.managerId === u.employeeId));
/** Pending rows `u` may decide: all for staff, direct reports for managers, never their own. */
const toDecideWhere = (u: SessionUser) => ({ status: "PENDING" as const, NOT: { employeeId: u.employeeId ?? "-" }, ...(isStaff(u) ? {} : { employee: { managerId: u.employeeId ?? "-" } }) });

async function staffUserIds() {
  return (await prisma.user.findMany({ where: { role: { in: ["HR", "ADMIN"] }, isActive: true }, select: { id: true } })).map((u) => u.id);
}
/** The manager's user, or every HR/Admin user when there is no manager. */
async function approverUsers(employeeId: string) {
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { manager: { select: { userId: true } } } });
  return e?.manager?.userId ? [e.manager.userId] : staffUserIds();
}
async function notifyAll(userIds: (string | null)[], title: string, body: string, link: string) {
  await Promise.all(userIds.map((u) => notify(u, title, body, link)));
}

// ---------- Attendance corrections ----------

export async function createCorrection(actor: SessionUser, d: CorrectionInput) {
  const employeeId = needEmployee(actor);
  const today = manilaToday();
  if (d.date >= today) throw new AppError("Corrections are for past days. Use the punch clock for today.");
  if (d.date < addDaysIso(today, -CORRECTION_MAX_DAYS_BACK)) throw new AppError(`Only the last ${CORRECTION_MAX_DAYS_BACK} days can be corrected`);
  if (await prisma.attendanceCorrection.count({ where: { employeeId, date: new Date(d.date), status: "PENDING" } })) throw conflict("You already have a pending correction for that day");
  const need = correctionNeeds(d.kind);
  const row = await prisma.attendanceCorrection.create({
    data: { employeeId, date: new Date(d.date), kind: d.kind, inTime: need.in ? d.inTime : null, outTime: need.out ? d.outTime : null, reason: d.reason },
    include: { employee: person },
  });
  await audit(actor.id, "correction.create", "AttendanceCorrection", row.id, { after: row });
  await notifyAll(await approverUsers(employeeId), `Attendance correction from ${fullName(row.employee)}`, `${CORRECTION_KIND_LABELS[d.kind]} on ${d.date}`, "/attendance/corrections");
  return row;
}

export async function decideCorrection(actor: SessionUser, id: string, d: DecisionInput) {
  const r = await prisma.attendanceCorrection.findUnique({ where: { id }, include: { employee: person } });
  if (!r) throw notFound("Correction");
  if (!canApprove(actor, r)) throw new AuthError("Only their manager or HR can decide this", 403);
  if (r.status !== "PENDING") throw new AppError(`Correction is already ${r.status.toLowerCase()}`);
  const decided = { status: d.decision, approverId: actor.employeeId, decidedAt: new Date(), decisionNote: d.note ?? null };
  let added = 0;
  if (d.decision === "APPROVED") {
    const [{ shift: base, timeZone }, assigned] = await Promise.all([
      employeeClock(r.employeeId),
      prisma.shiftAssignment.findUnique({ where: { employeeId_date: { employeeId: r.employeeId, date: r.date } }, select: { shift: true } }),
    ]);
    const punches = correctionPunchTimes({ kind: r.kind, date: iso(r.date), inTime: r.inTime, outTime: r.outTime }, assigned?.shift ?? base).map((p) => ({ at: zonedToUtc(p.date, p.time, timeZone), direction: p.direction }));
    if (punches.some((p) => p.at.getTime() > Date.now())) throw new AppError("A corrected time is in the future");
    const note = `[correction:${id}] ${CORRECTION_KIND_LABELS[r.kind]}: ${r.reason}`;
    added = await prisma.$transaction(async (tx) => {
      const res = await tx.attendanceCorrection.updateMany({ where: { id, status: "PENDING" }, data: decided });
      if (!res.count) throw conflict("Someone else just decided this correction");
      // skip punches that already exist in the same minute
      const ms = punches.map((p) => p.at.getTime());
      const have = await tx.attendancePunch.findMany({ where: { employeeId: r.employeeId, at: { gte: new Date(Math.min(...ms) - 60_000), lte: new Date(Math.max(...ms) + 60_000) } }, select: { at: true } });
      const taken = new Set(have.map((p) => Math.floor(p.at.getTime() / 60_000)));
      const fresh = punches.filter((p) => !taken.has(Math.floor(p.at.getTime() / 60_000)));
      const c = await tx.attendancePunch.createMany({
        data: fresh.map((p) => ({ employeeId: r.employeeId, at: p.at, direction: p.direction, source: "MANUAL" as const, method: "NONE" as const, note, createdById: actor.id })),
        skipDuplicates: true,
      });
      return c.count;
    });
  } else {
    const res = await prisma.attendanceCorrection.updateMany({ where: { id, status: "PENDING" }, data: decided });
    if (!res.count) throw conflict("Someone else just decided this correction");
  }
  await audit(actor.id, `correction.${d.decision.toLowerCase()}`, "AttendanceCorrection", id, { after: { ...decided, punchesAdded: added } });
  await notify(r.employee.userId, `Attendance correction ${d.decision === "APPROVED" ? "approved" : "rejected"}`, `${CORRECTION_KIND_LABELS[r.kind]} on ${iso(r.date)}${d.note ? `: ${d.note}` : ""}`, `/attendance?month=${iso(r.date).slice(0, 7)}`);
  return { added };
}

export async function cancelCorrection(actor: SessionUser, id: string) {
  const res = await prisma.attendanceCorrection.updateMany({ where: { id, employeeId: actor.employeeId ?? "-", status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  if (!res.count) throw new AppError("Only your own pending corrections can be withdrawn");
  await audit(actor.id, "correction.cancel", "AttendanceCorrection", id);
}

export async function listCorrections(actor: SessionUser) {
  const include = { employee: person, approver: { select: { firstName: true, lastName: true, preferredName: true } } } as const;
  const [mine, toDecide] = await Promise.all([
    actor.employeeId ? prisma.attendanceCorrection.findMany({ where: { employeeId: actor.employeeId }, include, orderBy: { createdAt: "desc" }, take: 50 }) : [],
    actor.role === "EMPLOYEE" ? [] : prisma.attendanceCorrection.findMany({ where: toDecideWhere(actor), include, orderBy: { date: "asc" }, take: 100 }),
  ]);
  return { mine, toDecide };
}
export type CorrectionRow = Awaited<ReturnType<typeof listCorrections>>["mine"][number];

/** Dates in [from, to] with a pending correction, for the DTR "Fix" links. */
export async function pendingCorrectionDates(employeeId: string, from: string, to: string) {
  const rows = await prisma.attendanceCorrection.findMany({ where: { employeeId, status: "PENDING", date: { gte: new Date(from), lte: new Date(to) } }, select: { date: true } });
  return new Set(rows.map((r) => iso(r.date)));
}

// ---------- Compensatory leave ----------

/** Rest days / holidays the employee worked in the claim window, not yet claimed (newest first). */
export async function compOffEligible(employeeId: string) {
  const today = manilaToday();
  const from = addDaysIso(today, -COMPOFF_MAX_DAYS_BACK);
  const to = addDaysIso(today, -1);
  const [emp, claimed] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: dtrEmployeeSelect }),
    prisma.compOffRequest.findMany({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, workDate: { gte: new Date(from) } }, select: { workDate: true } }),
  ]);
  if (!emp) return [];
  const taken = new Set(claimed.map((c) => iso(c.workDate)));
  const rows = (await dtrRowsForRange([emp], from, to)).get(employeeId) ?? [];
  return rows
    .filter((r) => (r.restDay || r.holiday) && r.workedMinutes > 0 && !taken.has(r.date))
    .map((r) => ({ date: r.date, workedMinutes: r.workedMinutes, holiday: r.holiday }))
    .reverse();
}

export async function createCompOff(actor: SessionUser, d: CompOffInput) {
  const employeeId = needEmployee(actor);
  const type = await prisma.leaveType.findUnique({ where: { id: d.leaveTypeId } });
  if (!type?.isActive || !type.isCompensatory) throw new AppError("Pick a compensatory leave type");
  const day = (await compOffEligible(employeeId)).find((x) => x.date === d.workDate);
  if (!day) throw new AppError(`No rest-day or holiday work on ${d.workDate} in your time record (last ${COMPOFF_MAX_DAYS_BACK} days, not yet claimed)`);
  if (d.days === 1 && day.workedMinutes < 240) throw new AppError("A whole day needs at least 4 hours worked. Claim half a day instead.");
  const row = await prisma.compOffRequest.create({ data: { employeeId, workDate: new Date(d.workDate), days: d.days, leaveTypeId: type.id, reason: d.reason }, include: { employee: person } });
  await audit(actor.id, "compoff.create", "CompOffRequest", row.id, { after: row });
  await notifyAll(await approverUsers(employeeId), `Comp-off request from ${fullName(row.employee)}`, `${d.days} day for work on ${d.workDate}`, "/leave");
  return row;
}

/** Approval credits the days to the leave type's entitlement for the current year (created if missing). */
export async function decideCompOff(actor: SessionUser, id: string, d: DecisionInput) {
  const r = await prisma.compOffRequest.findUnique({ where: { id }, include: { employee: person, leaveType: true } });
  if (!r) throw notFound("Comp-off request");
  if (!canApprove(actor, r)) throw new AuthError("Only their manager or HR can decide this", 403);
  if (r.status !== "PENDING") throw new AppError(`Request is already ${r.status.toLowerCase()}`);
  const year = Number(manilaToday().slice(0, 4));
  const decided = { status: d.decision, approverId: actor.employeeId, decidedAt: new Date() };
  await prisma.$transaction(async (tx) => {
    const res = await tx.compOffRequest.updateMany({ where: { id, status: "PENDING" }, data: decided });
    if (!res.count) throw conflict("Someone else just decided this request");
    if (d.decision !== "APPROVED") return;
    const key = { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year };
    await tx.leaveEntitlement.upsert({ where: { employeeId_leaveTypeId_year: key }, create: { ...key, entitledDays: 0, adjustment: r.days }, update: { adjustment: { increment: r.days } } });
  });
  await audit(actor.id, `compoff.${d.decision.toLowerCase()}`, "CompOffRequest", id, { after: { ...decided, days: num(r.days), year } });
  await notify(r.employee.userId, `Comp-off ${d.decision === "APPROVED" ? `approved: +${num(r.days)} ${r.leaveType.name}` : "rejected"}`, `For work on ${iso(r.workDate)}${d.note ? `: ${d.note}` : ""}`, "/me/leave");
}

// ---------- Leave encashment ----------

const isVacation = (t: { code: string; name: string }) => t.code === "VL" || /vacation/i.test(t.name);

async function encashable(employeeId: string, leaveTypeId: string, year: number, exclude?: string) {
  const [bal, pending] = await Promise.all([
    getBalances(employeeId, year),
    prisma.leaveEncashment.aggregate({ where: { employeeId, leaveTypeId, year, status: "PENDING", ...(exclude ? { NOT: { id: exclude } } : {}) }, _sum: { days: true } }),
  ]);
  const b = bal.find((x) => x.leaveTypeId === leaveTypeId);
  return Math.max(0, (b?.available ?? 0) - num(pending._sum.days));
}

async function rateFor(employeeId: string) {
  const [e, cfg] = await Promise.all([prisma.employee.findUnique({ where: { id: employeeId }, select: { basicPay: true, payType: true } }), getPayrollConfig()]);
  if (!e?.basicPay) throw new AppError("No basic pay on file for this employee. Set their compensation first.");
  return dailyRate(e.payType, num(e.basicPay), cfg.daysPerYear);
}

export async function createEncashment(actor: SessionUser, d: EncashmentInput) {
  const employeeId = needEmployee(actor);
  const type = await prisma.leaveType.findUnique({ where: { id: d.leaveTypeId } });
  if (!type?.isActive || !type.allowEncashment) throw new AppError("That leave type can't be converted to cash");
  const year = Number(manilaToday().slice(0, 4));
  const max = await encashable(employeeId, type.id, year);
  if (d.days > max) throw new AppError(`You can encash at most ${max} day(s) of ${type.name}`);
  const amount = round2(d.days * (await rateFor(employeeId)));
  const row = await prisma.leaveEncashment.create({ data: { employeeId, leaveTypeId: type.id, year, days: d.days, amount }, include: { employee: person } });
  await audit(actor.id, "encashment.create", "LeaveEncashment", row.id, { after: row });
  await notifyAll(await staffUserIds(), `Leave encashment from ${fullName(row.employee)}`, `${d.days} day(s) ${type.code}, about PHP ${amount.toFixed(2)}`, "/leave");
  return row;
}

/**
 * HR approval: re-checks the balance, prices the days at today's daily rate, adds LEAVE_ENCASH payroll earnings
 * (tax-exempt and taxable portions as separate rows, see encashmentTaxSplit) and deducts the days from the entitlement.
 */
export async function decideEncashment(actor: SessionUser, id: string, d: DecisionInput) {
  if (!isStaff(actor)) throw new AuthError("Only HR can decide encashments", 403);
  const r = await prisma.leaveEncashment.findUnique({ where: { id }, include: { employee: person, leaveType: true } });
  if (!r) throw notFound("Encashment");
  if (r.employeeId === actor.employeeId) throw new AuthError("You can't approve your own encashment", 403);
  if (r.status !== "PENDING") throw new AppError(`Encashment is already ${r.status.toLowerCase()}`);
  const days = num(r.days);
  const decided = { status: d.decision, decidedById: actor.employeeId, decidedAt: new Date() };
  if (d.decision === "REJECTED") {
    const res = await prisma.leaveEncashment.updateMany({ where: { id, status: "PENDING" }, data: decided });
    if (!res.count) throw conflict("Someone else just decided this encashment");
  } else {
    if (days > (await encashable(r.employeeId, r.leaveTypeId, r.year, id))) throw new AppError("Not enough unused days left to encash");
    const rate = await rateFor(r.employeeId);
    const vacation = isVacation(r.leaveType);
    const prior = vacation
      ? await prisma.leaveEncashment.aggregate({ where: { employeeId: r.employeeId, year: r.year, status: "APPROVED", leaveType: { OR: [{ code: "VL" }, { name: { contains: "vacation", mode: "insensitive" } }] } }, _sum: { days: true } })
      : null;
    const split = encashmentTaxSplit(days, num(prior?._sum.days), vacation);
    const amount = round2(days * rate);
    const exemptAmount = round2(split.exempt * rate);
    const parts = [
      { days: split.exempt, amount: exemptAmount, taxable: false },
      { days: split.taxable, amount: round2(amount - exemptAmount), taxable: true },
    ].filter((p) => p.days > 0);
    const today = manilaToday();
    await prisma.$transaction(async (tx) => {
      const res = await tx.leaveEncashment.updateMany({ where: { id, status: "PENDING" }, data: { ...decided, amount } });
      if (!res.count) throw conflict("Someone else just decided this encashment");
      const adj = [];
      for (const p of parts) {
        adj.push(
          await tx.payrollAdjustment.create({
            data: {
              employeeId: r.employeeId,
              kind: "EARNING",
              code: "LEAVE_ENCASH",
              label: `Leave encashment (${p.days} day${p.days === 1 ? "" : "s"} ${r.leaveType.code}${parts.length > 1 ? (p.taxable ? ", taxable" : ", tax-exempt") : ""})`,
              amount: p.amount,
              taxable: p.taxable,
              effectiveDate: new Date(today),
              note: `LeaveEncashment ${id}`,
              createdById: actor.id,
            },
          }),
        );
      }
      await tx.leaveEncashment.update({ where: { id }, data: { adjustmentId: adj[0]!.id } });
      const key = { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: r.year };
      await tx.leaveEntitlement.upsert({ where: { employeeId_leaveTypeId_year: key }, create: { ...key, entitledDays: 0, adjustment: -days }, update: { adjustment: { decrement: days } } });
    });
  }
  await audit(actor.id, `encashment.${d.decision.toLowerCase()}`, "LeaveEncashment", id, { after: decided });
  await notify(
    r.employee.userId,
    d.decision === "APPROVED" ? "Leave encashment approved - added to payroll" : "Leave encashment rejected",
    `${days} day(s) ${r.leaveType.name}${d.note ? `: ${d.note}` : ""}`,
    "/me/leave",
  );
}

export async function cancelOwn(actor: SessionUser, kind: "compoff" | "encashment", id: string) {
  const where = { id, employeeId: actor.employeeId ?? "-", status: "PENDING" as const };
  const data = { status: "CANCELLED" as const, decidedAt: new Date() };
  const res = kind === "compoff" ? await prisma.compOffRequest.updateMany({ where, data }) : await prisma.leaveEncashment.updateMany({ where, data });
  if (!res.count) throw new AppError("Only your own pending requests can be withdrawn");
  await audit(actor.id, `${kind}.cancel`, kind === "compoff" ? "CompOffRequest" : "LeaveEncashment", id);
}

const creditInclude = { employee: person, leaveType: { select: { id: true, name: true, code: true, color: true } } } as const;

export async function myCredits(employeeId: string) {
  const [compOffs, encashments] = await Promise.all([
    prisma.compOffRequest.findMany({ where: { employeeId }, include: creditInclude, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.leaveEncashment.findMany({ where: { employeeId }, include: creditInclude, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { compOffs, encashments };
}

export async function creditsToDecide(actor: SessionUser) {
  if (actor.role === "EMPLOYEE") return { compOffs: [], encashments: [] };
  const [compOffs, encashments] = await Promise.all([
    prisma.compOffRequest.findMany({ where: toDecideWhere(actor), include: creditInclude, orderBy: { createdAt: "asc" } }),
    isStaff(actor) ? prisma.leaveEncashment.findMany({ where: toDecideWhere(actor), include: creditInclude, orderBy: { createdAt: "asc" } }) : [],
  ]);
  return { compOffs, encashments };
}

// ---------- Block dates ----------

export const listBlockDates = () => prisma.leaveBlockDate.findMany({ include: { department: { select: { name: true } } }, orderBy: { from: "desc" } });

export async function saveBlockDate(actor: SessionUser, d: BlockDateInput, id?: string) {
  const data = { name: d.name, from: new Date(d.from), to: new Date(d.to), departmentId: d.departmentId ?? null };
  const row = id ? await prisma.leaveBlockDate.update({ where: { id }, data }) : await prisma.leaveBlockDate.create({ data });
  await audit(actor.id, id ? "blockdate.update" : "blockdate.create", "LeaveBlockDate", row.id, { after: row });
  return row;
}

export async function deleteBlockDate(actor: SessionUser, id: string) {
  const row = await prisma.leaveBlockDate.delete({ where: { id } });
  await audit(actor.id, "blockdate.delete", "LeaveBlockDate", id, { before: row });
}

// ---------- Bulk attendance import ----------

export const IMPORT_MAX_ROWS = 5000;

/** Parse + resolve employees + convert to UTC. Rows keep their errors; `punches` holds only the valid ones. */
export async function resolveImport(text: string) {
  const { format, rows } = parseAttendanceImport(text);
  if (rows.length > IMPORT_MAX_ROWS) throw new AppError(`Too many rows (${rows.length}). Split the file into ${IMPORT_MAX_ROWS}-row parts.`);
  const codes = [...new Set(rows.filter((r) => r.keyType === "employeeCode").map((r) => r.key))];
  const bios = [...new Set(rows.filter((r) => r.keyType === "biometricId").map((r) => r.key))];
  const emps = await prisma.employee.findMany({
    where: { deletedAt: null, OR: [{ employeeCode: { in: codes } }, { biometricId: { in: bios } }] },
    select: { id: true, employeeCode: true, biometricId: true, firstName: true, lastName: true, preferredName: true, location: { select: { timezone: true } } },
  });
  const byKey = new Map(emps.flatMap((e) => [[`employeeCode:${e.employeeCode}`, e] as const, ...(e.biometricId ? [[`biometricId:${e.biometricId}`, e] as const] : [])]));
  const now = Date.now();
  const punches: Prisma.AttendancePunchCreateManyInput[] = [];
  const out = rows.map((r) => {
    const e = byKey.get(`${r.keyType}:${r.key}`);
    let error = r.error ?? (e ? undefined : "Unknown employee");
    const ats = e && !error ? r.punches.map((p) => ({ ...p, at: new Date(zonedToUtc(p.date, p.time, e.location?.timezone || DEFAULT_TIMEZONE).getTime() + p.sec * 1000) })) : [];
    if (ats.some((p) => p.at.getTime() > now)) error = "Time is in the future";
    if (e && !error) for (const p of ats) punches.push({ employeeId: e.id, at: p.at, direction: p.direction, source: "MANUAL", method: r.method, note: `[import ${format}] line ${r.line}` });
    return {
      line: r.line,
      key: r.key,
      name: e ? fullName(e) : null,
      date: r.date,
      punches: error ? "" : r.punches.map((p) => `${p.time}${p.direction ? ` ${p.direction.toLowerCase()}` : ""}${p.date !== r.date ? " (+1d)" : ""}`).join(", "),
      error: error ?? null,
    };
  });
  return { format, rows: out, punches };
}

export async function commitImport(actor: SessionUser, text: string) {
  const r = await resolveImport(text);
  if (!r.punches.length) throw new AppError("Nothing valid to import");
  const res = await prisma.attendancePunch.createMany({ data: r.punches.map((p) => ({ ...p, createdById: actor.id })), skipDuplicates: true });
  const summary = { inserted: res.count, skipped: r.punches.length - res.count, errors: r.rows.filter((x) => x.error).length };
  await audit(actor.id, "attendance.import", "AttendancePunch", null, { after: { format: r.format, ...summary } });
  return summary;
}
