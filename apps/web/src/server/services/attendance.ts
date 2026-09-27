import "server-only";
import { cache } from "react";
import { prisma, type Prisma } from "@hris/db";
import {
  addDaysIso,
  computeDtr,
  dayResolver,
  DEFAULT_SHIFT,
  DEFAULT_TIMEZONE,
  fmtDistance,
  geofenceCheck,
  monthDays,
  rangeTotals,
  zonedParts,
  zonedToUtc,
  type DtrRangeTotals,
  type LeaveDay,
  type ManualPunchInput,
  type PunchMethod,
  type SessionUser,
  type ShiftRule,
  type WorkShiftInput,
} from "@hris/shared";
import { audit } from "./audit";
import { AppError, conflict, notFound } from "./errors";
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

/** Punches for the attendance day that `now` falls in (honors today's shift assignment). */
export async function todaysPunches(employeeId: string, now = new Date()) {
  const { shift: base, timeZone } = await employeeClock(employeeId);
  const local = zonedParts(now, timeZone).date;
  const [rows, recent] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { employeeId, date: { gte: new Date(addDaysIso(local, -2)), lte: new Date(addDaysIso(local, 1)) } }, select: { date: true, shift: true } }),
    prisma.attendancePunch.findMany({ where: { employeeId, at: { gte: new Date(now.getTime() - 40 * 3600_000), lte: new Date(now.getTime() + 60_000) } }, orderBy: { at: "asc" } }),
  ]);
  const assignments = assignmentMap(rows);
  const { resolve, scheduled } = dayResolver({ shift: base, timeZone, assignments });
  const day = resolve(now).day;
  const punches = recent.filter((p) => resolve(p.at).day === day);
  const s = scheduled(day);
  // assignment rules carry their shift name at runtime (toClock); base fills it otherwise
  const shift = s ? { ...base, ...s } : base;
  return { day, punches, shift, restDay: !s, timeZone, clockedIn: punches.length > 0 && (punches.at(-1)!.direction ?? (punches.length % 2 ? "IN" : "OUT")) === "IN" };
}

export async function recordPunch(
  actor: SessionUser,
  p: { method: PunchMethod; photo?: Buffer; latitude?: number; longitude?: number; accuracy?: number; note?: string; source?: "WEB" | "MOBILE" },
) {
  if (!actor.employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE");
  const employeeId = actor.employeeId;
  const [policy, fence] = await Promise.all([
    getSetting("attendance"),
    prisma.location.findFirst({ where: { employees: { some: { id: employeeId } } }, select: { name: true, latitude: true, longitude: true, geofenceRadius: true } }),
  ]);
  if (policy.requirePasskey && p.method !== "PASSKEY") throw new AppError("Verify with fingerprint or Face ID to punch", "PASSKEY_REQUIRED", 403);
  if (policy.requirePhoto && !p.photo) throw new AppError("A selfie is required to punch", "PHOTO_REQUIRED");
  const geofenced = policy.requireGeofence && fence?.latitude != null && fence.longitude != null && fence.geofenceRadius;
  if ((policy.requireLocation || geofenced) && (p.latitude == null || p.longitude == null)) throw new AppError("Location permission is required to punch", "LOCATION_REQUIRED");
  if (geofenced) {
    const g = geofenceCheck({ lat: p.latitude!, lng: p.longitude!, accuracy: p.accuracy }, { lat: fence.latitude!, lng: fence.longitude!, radius: fence.geofenceRadius! });
    if (!g.inside) throw new AppError(`You are ${fmtDistance(g.distance)} from ${fence.name}. Move within ${fence.geofenceRadius} m to punch.`, "OUTSIDE_GEOFENCE", 403);
  }

  const now = new Date();
  const today = await todaysPunches(employeeId, now);
  const last = today.punches.at(-1);
  if (last && now.getTime() - last.at.getTime() < 60_000) throw conflict("You just punched. Wait a minute before punching again.");
  const direction = today.clockedIn ? "OUT" : "IN";

  const punch = await prisma.attendancePunch.create({
    data: {
      employeeId,
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

type AssignmentRow = { date: Date; shift: ShiftRow | null };
function assignmentMap(rows: AssignmentRow[]) {
  return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.shift ? toClock(r.shift, null).shift : null] as const));
}

type LeaveRow = { startDate: Date; endDate: Date; startDayPart: string; endDayPart: string; leaveType: { code: string; isPaid: boolean } };
function leaveMapOf(leaves: LeaveRow[]) {
  const leaveMap = new Map<string, LeaveDay>();
  for (const l of leaves) {
    const s = l.startDate.toISOString().slice(0, 10);
    const e = l.endDate.toISOString().slice(0, 10);
    for (let d = s; d <= e; d = addDaysIso(d, 1)) {
      const half = (d === s && l.startDayPart === "PM") || (d === e && l.endDayPart === "AM") || (s === e && l.startDayPart !== "FULL");
      leaveMap.set(d, { code: l.leaveType.code, days: half ? 0.5 : 1, paid: l.leaveType.isPaid });
    }
  }
  return leaveMap;
}

export const dtrEmployeeSelect = { id: true, locationId: true, shift: true, location: { select: { timezone: true } } } as const;
type DtrEmployee = Prisma.EmployeeGetPayload<{ select: typeof dtrEmployeeSelect }>;

const group = <T extends { employeeId: string }>(rows: T[]) => {
  const m = new Map<string, T[]>();
  for (const r of rows) (m.get(r.employeeId) ?? m.set(r.employeeId, []).get(r.employeeId)!).push(r);
  return m;
};

/**
 * Everything computeDtr needs for many employees over [first, last], fetched set-based (5 queries whatever the headcount).
 * Punches span [first - 1d, last + 3d); computeDtr drops those resolving outside `days`.
 */
async function dtrInputs(emps: DtrEmployee[], first: string, last: string, withPunches = true) {
  const employeeIds = emps.map((e) => e.id);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDaysIso(d, 1)) days.push(d);
  const [def, punches, holidays, leaves, assignments] = await Promise.all([
    defaultShift(),
    withPunches
      ? prisma.attendancePunch.findMany({
          where: { employeeId: { in: employeeIds }, at: { gte: new Date(Date.parse(first) - 86400_000), lt: new Date(Date.parse(addDaysIso(last, 3))) } },
          select: { employeeId: true, at: true },
          orderBy: { at: "asc" },
        })
      : [],
    prisma.holiday.findMany({ where: { date: { gte: new Date(first), lte: new Date(last) } }, select: { date: true, name: true, type: true, locationId: true } }),
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, status: "APPROVED", startDate: { lte: new Date(last) }, endDate: { gte: new Date(first) } },
      select: { employeeId: true, startDate: true, endDate: true, startDayPart: true, endDayPart: true, leaveType: { select: { code: true, isPaid: true } } },
    }),
    // one day either side: the resolver looks at the previous day's shift
    prisma.shiftAssignment.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: new Date(addDaysIso(first, -1)), lte: new Date(addDaysIso(last, 1)) } }, select: { employeeId: true, date: true, shift: true } }),
  ]);
  const punchesBy = group(punches);
  const leavesBy = group(leaves);
  const assignBy = group(assignments);
  return (e: DtrEmployee) => {
    const { shift, timeZone } = toClock(e.shift ?? def, e.location?.timezone);
    const mine = holidays.filter((h) => h.locationId === null || h.locationId === e.locationId);
    return {
      holidayList: mine.map((h) => ({ date: h.date.toISOString().slice(0, 10), type: h.type })),
      input: {
        days,
        punches: (punchesBy.get(e.id) ?? []).map((p) => p.at),
        shift,
        timeZone,
        holidays: new Map(mine.filter((h) => h.type !== "SPECIAL_WORKING").map((h) => [h.date.toISOString().slice(0, 10), h.name])),
        leaves: leaveMapOf(leavesBy.get(e.id) ?? []),
        assignments: assignmentMap(assignBy.get(e.id) ?? []),
        today: zonedParts(new Date(), timeZone).date,
      },
    };
  };
}

/** Full DTR for one employee and month (YYYY-MM). */
export async function dtrForMonth(employeeId: string, month: string) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: dtrEmployeeSelect });
  if (!emp) throw notFound("Employee");
  const days = monthDays(month);
  const first = days[0]!;
  const last = days.at(-1)!;
  const window = { gte: new Date(Date.parse(first) - 86400_000), lt: new Date(Date.parse(addDaysIso(last, 3))) };
  const [ctx, punches, photoIds] = await Promise.all([
    dtrInputs([emp], first, last, false),
    prisma.attendancePunch.findMany({ where: { employeeId, at: window }, orderBy: { at: "asc" } }),
    prisma.attendancePunch.findMany({ where: { employeeId, at: window, NOT: { photo: null } }, select: { id: true } }),
  ]);
  const { input } = ctx(emp);
  const dtr = computeDtr({ ...input, punches: punches.map((p) => p.at) });
  const { resolve } = dayResolver(input);
  const punchesByDay = new Map<string, typeof punches>();
  for (const p of punches) {
    const d = resolve(p.at).day;
    (punchesByDay.get(d) ?? punchesByDay.set(d, []).get(d)!).push(p);
  }
  return { ...dtr, shift: input.shift, timeZone: input.timeZone, punchesByDay, withPhoto: new Set(photoIds.map((p) => p.id)) };
}

/**
 * DTR totals for many employees in one month. `emps` must be selected with dtrEmployeeSelect.
 * Same math as dtrForMonth; data is fetched set-based and split per employee in memory.
 */
export async function dtrTotalsForMonth(emps: DtrEmployee[], month: string) {
  const days = monthDays(month);
  const ctx = await dtrInputs(emps, days[0]!, days.at(-1)!);
  return new Map(emps.map((e) => [e.id, computeDtr(ctx(e).input).totals] as const));
}

/** DTR rows per employee for [from, to] (anomaly rules). `emps` must be selected with dtrEmployeeSelect. */
export async function dtrRowsForRange(emps: DtrEmployee[], from: string, to: string) {
  const ctx = await dtrInputs(emps, from, to);
  return new Map(emps.map((e) => [e.id, computeDtr(ctx(e).input).rows] as const));
}

/**
 * Attendance totals per employee for [from, to] (YYYY-MM-DD, inclusive), honoring per-day shift
 * assignments, holidays (with type) and approved leave. Used by payroll. See rangeTotals for counting rules.
 * Signature is a contract with payroll; do not change it.
 */
export async function dtrTotalsForRange(employeeIds: string[], from: string, to: string): Promise<Map<string, DtrRangeTotals>> {
  if (!employeeIds.length || from > to) return new Map();
  const emps = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: dtrEmployeeSelect });
  const ctx = await dtrInputs(emps, from, to);
  return new Map(
    emps.map((e) => {
      const { input, holidayList } = ctx(e);
      return [e.id, rangeTotals(computeDtr(input).rows, holidayList)] as const;
    }),
  );
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
