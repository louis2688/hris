import "server-only";
import { prisma } from "@hris/db";
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
import { getSetting } from "./settings";

export async function employeeClock(employeeId: string): Promise<{ shift: ShiftRule & { name: string }; timeZone: string }> {
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { shift: true, location: { select: { timezone: true } } } });
  if (!e) throw notFound("Employee");
  const shift = e.shift ?? (await prisma.workShift.findFirst({ where: { isDefault: true } }));
  return {
    shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, graceMinutes: shift.graceMinutes, workDays: shift.workDays } : { name: "Standard", ...DEFAULT_SHIFT },
    timeZone: e.location?.timezone || DEFAULT_TIMEZONE,
  };
}

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

/** Full DTR for one employee and month (YYYY-MM). */
export async function dtrForMonth(employeeId: string, month: string) {
  const { shift, timeZone } = await employeeClock(employeeId);
  const days = monthDays(month);
  const first = days[0]!;
  const last = days.at(-1)!;
  const from = new Date(zonedToUtc(first, shift.startTime, timeZone).getTime() - 4 * 3600_000);
  const to = new Date(zonedToUtc(addDaysIso(last, 1), shift.startTime, timeZone).getTime() - 4 * 3600_000);

  const [punches, holidays, leaves] = await Promise.all([
    prisma.attendancePunch.findMany({ where: { employeeId, at: { gte: from, lt: to } }, orderBy: { at: "asc" } }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { locationId: true } }).then((e) =>
      prisma.holiday.findMany({ where: { date: { gte: new Date(first), lte: new Date(last) }, OR: [{ locationId: null }, ...(e?.locationId ? [{ locationId: e.locationId }] : [])] } }),
    ),
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", startDate: { lte: new Date(last) }, endDate: { gte: new Date(first) } },
      include: { leaveType: { select: { code: true } } },
    }),
  ]);

  const leaveMap = new Map<string, { code: string; days: number }>();
  for (const l of leaves) {
    const s = l.startDate.toISOString().slice(0, 10);
    const e = l.endDate.toISOString().slice(0, 10);
    for (let d = s; d <= e; d = addDaysIso(d, 1)) {
      const half = (d === s && l.startDayPart === "PM") || (d === e && l.endDayPart === "AM") || (s === e && l.startDayPart !== "FULL");
      leaveMap.set(d, { code: l.leaveType.code, days: half ? 0.5 : 1 });
    }
  }
  const today = zonedParts(new Date(), timeZone).date;
  const dtr = computeDtr({
    days,
    punches: punches.map((p) => p.at),
    shift,
    timeZone,
    holidays: new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name])),
    leaves: leaveMap,
    today,
  });
  const withPhoto = new Set(
    (await prisma.attendancePunch.findMany({ where: { employeeId, at: { gte: from, lt: to }, NOT: { photo: null } }, select: { id: true } })).map((p) => p.id),
  );
  const punchesByDay = new Map<string, typeof punches>();
  for (const p of punches) {
    const d = attendanceSlot(p.at, shift, timeZone).day;
    (punchesByDay.get(d) ?? punchesByDay.set(d, []).get(d)!).push(p);
  }
  return { ...dtr, shift, timeZone, punchesByDay, withPhoto };
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
