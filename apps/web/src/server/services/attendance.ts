import "server-only";
import { cache } from "react";
import { prisma, type Prisma } from "@hris/db";
import {
  addDaysIso,
  attendanceSlot,
  computeDtr,
  DEFAULT_SHIFT,
  DEFAULT_TIMEZONE,
  monthDays,
  zonedParts,
  zonedToUtc,
  type ManualPunchInput,
  type PunchMethod,
  type SessionUser,
  type ShiftRule,
  type WorkShiftInput,
} from "@hris/shared";
import { audit } from "./audit";
import { AppError, conflict, notFound } from "./errors";
import { employeeHolidayWhere } from "./org";
import { getSetting } from "./settings";

type ShiftRow = { name: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; workDays: number[] };
const toClock = (shift: ShiftRow | null, timezone: string | null | undefined) => ({
  shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, graceMinutes: shift.graceMinutes, workDays: shift.workDays } : { name: "Standard", ...DEFAULT_SHIFT },
  timeZone: timezone || DEFAULT_TIMEZONE,
});

const defaultShift = cache(() => prisma.workShift.findFirst({ where: { isDefault: true } }));

/** Cached per request: the attendance page asks for it twice (DTR + today). */
export const employeeClock = cache(async (employeeId: string): Promise<{ shift: ShiftRule & { name: string }; timeZone: string }> => {
  // ponytail: default shift fetched in parallel even when unused; one extra tiny query beats a second round trip.
  const [e, def] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { shift: true, location: { select: { timezone: true } } } }),
    defaultShift(),
  ]);
  if (!e) throw notFound("Employee");
  return toClock(e.shift ?? def, e.location?.timezone);
});

/** Punches for the attendance day that `now` falls in. */
export async function todaysPunches(employeeId: string, now = new Date()) {
  const { shift, timeZone } = await employeeClock(employeeId);
  const day = attendanceSlot(now, shift, timeZone).day;
  const from = new Date(zonedToUtc(day, shift.startTime, timeZone).getTime() - 4 * 3600_000);
  const to = new Date(from.getTime() + 24 * 3600_000);
  const punches = await prisma.attendancePunch.findMany({ where: { employeeId, at: { gte: from, lt: to } }, orderBy: { at: "asc" } });
  return { day, punches, shift, timeZone, clockedIn: punches.length > 0 && (punches.at(-1)!.direction ?? (punches.length % 2 ? "IN" : "OUT")) === "IN" };
}

export async function recordPunch(
  actor: SessionUser,
  p: { method: PunchMethod; photo?: Buffer; latitude?: number; longitude?: number; note?: string; source?: "WEB" | "MOBILE" },
) {
  if (!actor.employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE");
  const policy = await getSetting("attendance");
  if (policy.requirePasskey && p.method !== "PASSKEY") throw new AppError("Verify with fingerprint or Face ID to punch", "PASSKEY_REQUIRED", 403);
  if (policy.requirePhoto && !p.photo) throw new AppError("A selfie is required to punch", "PHOTO_REQUIRED");
  if (policy.requireLocation && (p.latitude == null || p.longitude == null)) throw new AppError("Location permission is required to punch", "LOCATION_REQUIRED");

  const now = new Date();
  const today = await todaysPunches(actor.employeeId, now);
  const last = today.punches.at(-1);
  if (last && now.getTime() - last.at.getTime() < 60_000) throw conflict("You just punched. Wait a minute before punching again.");
  const direction = today.clockedIn ? "OUT" : "IN";

  const punch = await prisma.attendancePunch.create({
    data: {
      employeeId: actor.employeeId,
      at: now,
      direction,
      source: p.source ?? "WEB",
      method: p.method,
      photo: p.photo ? new Uint8Array(p.photo) : undefined,
      latitude: p.latitude,
      longitude: p.longitude,
      note: p.note,
      createdById: actor.id,
    },
  });
  await audit(actor.id, `attendance.punch_${direction.toLowerCase()}`, "AttendancePunch", punch.id, { after: { at: punch.at, method: punch.method } });
  return punch;
}

export async function addManualPunch(actor: SessionUser, d: ManualPunchInput) {
  const { timeZone } = await employeeClock(d.employeeId);
  const at = zonedToUtc(d.date, d.time, timeZone);
  try {
    const punch = await prisma.attendancePunch.create({
      data: { employeeId: d.employeeId, at, direction: d.direction ?? null, source: "MANUAL", method: "NONE", note: d.note, createdById: actor.id },
    });
    await audit(actor.id, "attendance.manual_punch", "AttendancePunch", punch.id, { after: punch });
    return punch;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("A punch already exists at that exact time");
    throw e;
  }
}

export async function deletePunch(actor: SessionUser, id: string) {
  const p = await prisma.attendancePunch.findUnique({ where: { id } });
  if (!p) throw notFound("Punch");
  await prisma.attendancePunch.delete({ where: { id } });
  await audit(actor.id, "attendance.delete_punch", "AttendancePunch", id, { before: p });
  return p;
}

export async function punchPhoto(id: string) {
  return prisma.attendancePunch.findUnique({ where: { id }, select: { employeeId: true, photo: true } });
}

function monthWindow(month: string, shift: ShiftRule, timeZone: string) {
  const days = monthDays(month);
  const first = days[0]!;
  const last = days.at(-1)!;
  const from = new Date(zonedToUtc(first, shift.startTime, timeZone).getTime() - 4 * 3600_000);
  const to = new Date(zonedToUtc(addDaysIso(last, 1), shift.startTime, timeZone).getTime() - 4 * 3600_000);
  return { days, first, last, from, to };
}

type LeaveRow = { startDate: Date; endDate: Date; startDayPart: string; endDayPart: string; leaveType: { code: string } };
function leaveMapOf(leaves: LeaveRow[]) {
  const leaveMap = new Map<string, { code: string; days: number }>();
  for (const l of leaves) {
    const s = l.startDate.toISOString().slice(0, 10);
    const e = l.endDate.toISOString().slice(0, 10);
    for (let d = s; d <= e; d = addDaysIso(d, 1)) {
      const half = (d === s && l.startDayPart === "PM") || (d === e && l.endDayPart === "AM") || (s === e && l.startDayPart !== "FULL");
      leaveMap.set(d, { code: l.leaveType.code, days: half ? 0.5 : 1 });
    }
  }
  return leaveMap;
}

const approvedLeaveWhere = (first: string, last: string) => ({ status: "APPROVED" as const, startDate: { lte: new Date(last) }, endDate: { gte: new Date(first) } });

/** Full DTR for one employee and month (YYYY-MM). */
export async function dtrForMonth(employeeId: string, month: string) {
  const { shift, timeZone } = await employeeClock(employeeId);
  const { days, first, last, from, to } = monthWindow(month, shift, timeZone);

  const [punches, holidays, leaves, photoIds] = await Promise.all([
    prisma.attendancePunch.findMany({ where: { employeeId, at: { gte: from, lt: to } }, orderBy: { at: "asc" } }),
    prisma.holiday.findMany({ where: { date: { gte: new Date(first), lte: new Date(last) }, ...employeeHolidayWhere(employeeId) } }),
    prisma.leaveRequest.findMany({ where: { employeeId, ...approvedLeaveWhere(first, last) }, include: { leaveType: { select: { code: true } } } }),
    prisma.attendancePunch.findMany({ where: { employeeId, at: { gte: from, lt: to }, NOT: { photo: null } }, select: { id: true } }),
  ]);

  const today = zonedParts(new Date(), timeZone).date;
  const dtr = computeDtr({
    days,
    punches: punches.map((p) => p.at),
    shift,
    timeZone,
    holidays: new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name])),
    leaves: leaveMapOf(leaves),
    today,
  });
  const withPhoto = new Set(photoIds.map((p) => p.id));
  const punchesByDay = new Map<string, typeof punches>();
  for (const p of punches) {
    const d = attendanceSlot(p.at, shift, timeZone).day;
    (punchesByDay.get(d) ?? punchesByDay.set(d, []).get(d)!).push(p);
  }
  return { ...dtr, shift, timeZone, punchesByDay, withPhoto };
}

/**
 * DTR totals for many employees in one month: 4 queries total instead of ~6 per employee.
 * `emps` must be selected with dtrEmployeeSelect.
 * Same math as dtrForMonth; punches/holidays/leaves are fetched set-based and split per employee in memory.
 */
export const dtrEmployeeSelect = { id: true, locationId: true, shift: true, location: { select: { timezone: true } } } as const;
type DtrEmployee = Prisma.EmployeeGetPayload<{ select: typeof dtrEmployeeSelect }>;

export async function dtrTotalsForMonth(emps: DtrEmployee[], month: string) {
  const employeeIds = emps.map((e) => e.id);
  const days = monthDays(month);
  const first = days[0]!;
  const last = days.at(-1)!;
  // Every employee's window sits inside [first - 1d, last + 3d] whatever the shift start or UTC offset; trimmed per employee below.
  const [def, punches, holidays, leaves] = await Promise.all([
    defaultShift(),
    prisma.attendancePunch.findMany({
      where: { employeeId: { in: employeeIds }, at: { gte: new Date(Date.parse(first) - 86400_000), lt: new Date(Date.parse(addDaysIso(last, 3))) } },
      select: { employeeId: true, at: true },
      orderBy: { at: "asc" },
    }),
    prisma.holiday.findMany({ where: { date: { gte: new Date(first), lte: new Date(last) } }, select: { date: true, name: true, locationId: true } }),
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, ...approvedLeaveWhere(first, last) },
      select: { employeeId: true, startDate: true, endDate: true, startDayPart: true, endDayPart: true, leaveType: { select: { code: true } } },
    }),
  ]);

  const group = <T extends { employeeId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.employeeId) ?? m.set(r.employeeId, []).get(r.employeeId)!).push(r);
    return m;
  };
  const punchesBy = group(punches);
  const leavesBy = group(leaves);
  const out = new Map<string, ReturnType<typeof computeDtr>["totals"]>();
  for (const e of emps) {
    const { shift, timeZone } = toClock(e.shift ?? def, e.location?.timezone);
    const { from, to } = monthWindow(month, shift, timeZone);
    const dtr = computeDtr({
      days,
      punches: (punchesBy.get(e.id) ?? []).map((p) => p.at).filter((at) => at >= from && at < to),
      shift,
      timeZone,
      holidays: new Map(holidays.filter((h) => h.locationId === null || h.locationId === e.locationId).map((h) => [h.date.toISOString().slice(0, 10), h.name])),
      leaves: leaveMapOf(leavesBy.get(e.id) ?? []),
      today: zonedParts(new Date(), timeZone).date,
    });
    out.set(e.id, dtr.totals);
  }
  return out;
}

/** Who is in right now, for a set of employees (null = everyone). */
export async function teamToday(employeeIds: string[] | null) {
  const since = new Date(Date.now() - 20 * 3600_000);
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] }, ...(employeeIds ? { id: { in: employeeIds } } : {}) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
      employeeCode: true,
      department: { select: { name: true } },
      punches: { where: { at: { gte: since } }, orderBy: { at: "asc" }, select: { id: true, at: true, direction: true, method: true, source: true } },
    },
  });
  return employees;
}

// ---------- Shifts ----------

export const listShifts = () => prisma.workShift.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });

export async function saveShift(actor: SessionUser, d: WorkShiftInput, id?: string) {
  const data = { ...d };
  try {
    const row = await prisma.$transaction(async (tx) => {
      if (d.isDefault) await tx.workShift.updateMany({ where: { isDefault: true, ...(id ? { NOT: { id } } : {}) }, data: { isDefault: false } });
      return id ? tx.workShift.update({ where: { id }, data }) : tx.workShift.create({ data });
    });
    await audit(actor.id, id ? "shift.update" : "shift.create", "WorkShift", row.id, { after: row });
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("A shift with that name already exists");
    throw e;
  }
}

export async function deleteShift(actor: SessionUser, id: string) {
  await prisma.workShift.delete({ where: { id } });
  await audit(actor.id, "shift.delete", "WorkShift", id);
}
