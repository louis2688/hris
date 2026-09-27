import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { addDaysIso, DEFAULT_TIMEZONE, zonedParts, type RosterSaveInput, type SessionUser, type SwapRequestInput } from "@hris/shared";
import { isStaff, scopeWhere } from "../authz";
import { AuthError } from "../auth/session";
import { audit, notify } from "./audit";
import { AppError, conflict, notFound } from "./errors";

const shiftSel = { id: true, name: true, startTime: true, endTime: true, workDays: true } as const;
type ShiftLite = { id: string; name: string; startTime: string; endTime: string };
export type ScheduleDay = {
  date: string;
  /** null = rest day */
  shift: ShiftLite | null;
  /** true when a ShiftAssignment overrides the default */
  override: boolean;
  /** what the day would be without an override */
  base: ShiftLite | null;
  holiday: { name: string; type: string } | null;
};

const active: Prisma.EmployeeWhereInput = { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] } };
export const manilaToday = () => zonedParts(new Date(), DEFAULT_TIMEZONE).date;
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** Monday of the week containing `iso`. */
export const mondayOf = (iso: string) => addDaysIso(iso, -((weekdayOf(iso) + 6) % 7));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const lite = (s: ShiftLite | null) => (s ? { id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime } : null);

function datesOf(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

/** Effective schedule per employee per day: assignment, else own/default shift on its work days. 4 queries. */
export async function effectiveSchedule(employeeIds: string[], from: string, to: string): Promise<Map<string, ScheduleDay[]>> {
  const range = { gte: new Date(from), lte: new Date(to) };
  const [emps, def, assigns, holidays] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, locationId: true, shift: { select: shiftSel } } }),
    prisma.workShift.findFirst({ where: { isDefault: true }, select: shiftSel }),
    prisma.shiftAssignment.findMany({ where: { employeeId: { in: employeeIds }, date: range }, select: { employeeId: true, date: true, shift: { select: shiftSel } } }),
    prisma.holiday.findMany({ where: { date: range }, select: { date: true, name: true, type: true, locationId: true } }),
  ]);
  const byKey = new Map(assigns.map((a) => [`${a.employeeId}|${iso(a.date)}`, a.shift]));
  const days = datesOf(from, to);
  return new Map(
    emps.map((e) => {
      const base = e.shift ?? def;
      const hol = new Map(holidays.filter((h) => h.locationId === null || h.locationId === e.locationId).map((h) => [iso(h.date), { name: h.name, type: h.type }]));
      return [
        e.id,
        days.map((date): ScheduleDay => {
          const key = `${e.id}|${date}`;
          const override = byKey.has(key);
          const dflt = base && base.workDays.includes(weekdayOf(date)) ? base : null;
          return { date, shift: lite(override ? byKey.get(key)! : dflt), override, base: lite(dflt), holiday: hol.get(date) ?? null };
        }),
      ] as const;
    }),
  );
}

export async function mySchedule(employeeId: string, from = manilaToday(), to = addDaysIso(from, 13)) {
  return (await effectiveSchedule([employeeId], from, to)).get(employeeId) ?? [];
}

// ---------- Roster ----------

/** Employees `u` may edit on the roster: staff = everyone, managers = direct reports (not themselves). */
const editableWhere = (u: SessionUser) => (isStaff(u) ? {} : { managerId: u.employeeId ?? "-" });

export async function roster(u: SessionUser, weekStart: string) {
  const to = addDaysIso(weekStart, 6);
  const [emps, shifts] = await Promise.all([
    prisma.employee.findMany({
      where: { ...active, ...(scopeWhere(u) ?? {}) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true, managerId: true, department: { select: { name: true } } },
    }),
    prisma.workShift.findMany({ orderBy: { startTime: "asc" }, select: { id: true, name: true, startTime: true, endTime: true } }),
  ]);
  const sched = await effectiveSchedule(emps.map((e) => e.id), weekStart, to);
  return {
    days: datesOf(weekStart, to),
    shifts,
    rows: emps.map((e) => ({ ...e, editable: isStaff(u) || e.managerId === u.employeeId, days: sched.get(e.id) ?? [] })),
  };
}

async function assertEditable(u: SessionUser, employeeIds: string[]) {
  const ids = [...new Set(employeeIds)];
  const ok = await prisma.employee.count({ where: { id: { in: ids }, deletedAt: null, ...editableWhere(u) } });
  if (ok !== ids.length) throw new AuthError("You can only schedule your own team", 403);
  return ids;
}

async function notifySchedule(employeeIds: string[], body: string) {
  const users = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { userId: true } });
  await Promise.all(users.map((e) => notify(e.userId, "Your schedule changed", body, "/schedule")));
}

export async function saveRoster(u: SessionUser, d: RosterSaveInput) {
  const ids = await assertEditable(u, d.cells.map((c) => c.employeeId));
  const shiftIds = [...new Set(d.cells.map((c) => c.value).filter((v) => v && v !== "REST"))];
  if ((await prisma.workShift.count({ where: { id: { in: shiftIds } } })) !== shiftIds.length) throw new AppError("Unknown shift");
  await prisma.$transaction(
    d.cells.map((c) => {
      const key = { employeeId: c.employeeId, date: new Date(c.date) };
      if (!c.value) return prisma.shiftAssignment.deleteMany({ where: key });
      const shiftId = c.value === "REST" ? null : c.value;
      return prisma.shiftAssignment.upsert({ where: { employeeId_date: key }, create: { ...key, shiftId }, update: { shiftId } });
    }),
  );
  await audit(u.id, "schedule.save", "ShiftAssignment", null, { after: d.cells });
  const dates = d.cells.map((c) => c.date).sort();
  await notifySchedule(ids, dates[0] === dates.at(-1) ? `Updated for ${dates[0]}` : `Updated for ${dates[0]} to ${dates.at(-1)}`);
  return d.cells.length;
}

/** Replace this week's overrides with last week's, shifted 7 days. */
export async function copyLastWeek(u: SessionUser, weekStart: string) {
  const to = addDaysIso(weekStart, 6);
  const ids = (await prisma.employee.findMany({ where: { ...active, ...editableWhere(u) }, select: { id: true } })).map((e) => e.id);
  const prev = await prisma.shiftAssignment.findMany({
    where: { employeeId: { in: ids }, date: { gte: new Date(addDaysIso(weekStart, -7)), lte: new Date(addDaysIso(weekStart, -1)) } },
    select: { employeeId: true, date: true, shiftId: true },
  });
  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { employeeId: { in: ids }, date: { gte: new Date(weekStart), lte: new Date(to) } } }),
    prisma.shiftAssignment.createMany({ data: prev.map((a) => ({ employeeId: a.employeeId, shiftId: a.shiftId, date: new Date(addDaysIso(iso(a.date), 7)) })) }),
  ]);
  await audit(u.id, "schedule.copy_week", "ShiftAssignment", null, { after: { weekStart, copied: prev.length } });
  return prev.length;
}

/** Clear this week's overrides so everyone falls back to their default shift. */
export async function applyDefaults(u: SessionUser, weekStart: string) {
  const ids = (await prisma.employee.findMany({ where: { ...active, ...editableWhere(u) }, select: { id: true } })).map((e) => e.id);
  const r = await prisma.shiftAssignment.deleteMany({ where: { employeeId: { in: ids }, date: { gte: new Date(weekStart), lte: new Date(addDaysIso(weekStart, 6)) } } });
  await audit(u.id, "schedule.apply_defaults", "ShiftAssignment", null, { after: { weekStart, cleared: r.count } });
  return r.count;
}

// ---------- Swaps ----------

const person = { select: { id: true, firstName: true, lastName: true, preferredName: true, managerId: true, userId: true } } as const;
const nameOf = (e: { firstName: string; lastName: string; preferredName: string | null }) => `${e.preferredName ?? e.firstName} ${e.lastName}`;
const label = (d: ScheduleDay | undefined) => (d?.shift ? `${d.shift.name} ${d.shift.startTime}-${d.shift.endTime}` : "Rest day");

export async function teammates(u: SessionUser) {
  if (!u.employeeId) return [];
  const me = await prisma.employee.findUnique({ where: { id: u.employeeId }, select: { managerId: true } });
  if (!me?.managerId) return [];
  return prisma.employee.findMany({
    where: { ...active, managerId: me.managerId, NOT: { id: u.employeeId } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, preferredName: true },
  });
}

export async function requestSwap(u: SessionUser, d: SwapRequestInput) {
  if (!u.employeeId) throw new AppError("No employee record linked to this account");
  if (d.date < manilaToday()) throw new AppError("Pick today or a future date");
  const [me, target] = await Promise.all([
    prisma.employee.findUnique({ where: { id: u.employeeId }, ...person }),
    prisma.employee.findFirst({ where: { id: d.targetId, ...active }, ...person }),
  ]);
  if (!me || !target || target.id === me.id || !me.managerId || target.managerId !== me.managerId) throw new AppError("You can only swap with a teammate who has the same manager");
  const s = await effectiveSchedule([me.id, target.id], d.date, d.date);
  if (label(s.get(me.id)?.[0]) === label(s.get(target.id)?.[0])) throw new AppError("You both have the same schedule that day");
  const dup = await prisma.shiftSwapRequest.count({ where: { requesterId: me.id, date: new Date(d.date), status: "PENDING" } });
  if (dup) throw conflict("You already have a pending swap for that date");
  const row = await prisma.shiftSwapRequest.create({ data: { requesterId: me.id, targetId: target.id, date: new Date(d.date), reason: d.reason } });
  await audit(u.id, "swap.request", "ShiftSwapRequest", row.id, { after: row });
  await notify(target.userId, `${nameOf(me)} wants to swap shifts`, `On ${d.date}: you would take ${label(s.get(me.id)?.[0])}.`, "/schedule");
  return row;
}

async function loadSwap(id: string) {
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id }, include: { requester: person, target: person } });
  if (!r) throw notFound("Swap request");
  if (r.status !== "PENDING") throw new AppError("This swap request is already closed");
  return r;
}

export async function respondSwap(u: SessionUser, id: string, accept: boolean) {
  const r = await loadSwap(id);
  if (r.targetId !== u.employeeId) throw new AuthError("Only the teammate asked can respond", 403);
  if (r.targetAcceptedAt) throw new AppError("You already accepted this swap");
  const row = await prisma.shiftSwapRequest.update({ where: { id }, data: accept ? { targetAcceptedAt: new Date() } : { status: "REJECTED", decidedAt: new Date(), decidedById: u.employeeId } });
  await audit(u.id, accept ? "swap.accept" : "swap.decline", "ShiftSwapRequest", id, { after: row });
  const date = iso(r.date);
  await notify(r.requester.userId, accept ? `${nameOf(r.target)} accepted your swap` : `${nameOf(r.target)} declined your swap`, accept ? `Waiting for manager approval (${date}).` : date, "/schedule");
  if (accept && r.requester.managerId) {
    const mgr = await prisma.employee.findUnique({ where: { id: r.requester.managerId }, select: { userId: true } });
    await notify(mgr?.userId, "Shift swap needs approval", `${nameOf(r.requester)} and ${nameOf(r.target)} on ${date}`, "/schedule");
  }
  return row;
}

export async function decideSwap(u: SessionUser, id: string, approve: boolean) {
  const r = await loadSwap(id);
  if (!isStaff(u) && (!u.employeeId || r.requester.managerId !== u.employeeId)) throw new AuthError("Only their manager or HR can decide", 403);
  if (r.requesterId === u.employeeId) throw new AuthError("You can't approve your own swap", 403);
  if (!r.targetAcceptedAt) throw new AppError("Waiting for the teammate to accept first");
  const date = iso(r.date);
  const decided = { status: approve ? ("APPROVED" as const) : ("REJECTED" as const), decidedAt: new Date(), decidedById: u.employeeId };
  if (approve) {
    // materialize both effective shifts (defaults included) and swap them
    const s = await effectiveSchedule([r.requesterId, r.targetId], date, date);
    const a = s.get(r.requesterId)?.[0]?.shift?.id ?? null;
    const b = s.get(r.targetId)?.[0]?.shift?.id ?? null;
    const put = (employeeId: string, shiftId: string | null) =>
      prisma.shiftAssignment.upsert({ where: { employeeId_date: { employeeId, date: r.date } }, create: { employeeId, date: r.date, shiftId, note: "Shift swap" }, update: { shiftId, note: "Shift swap" } });
    await prisma.$transaction([put(r.requesterId, b), put(r.targetId, a), prisma.shiftSwapRequest.update({ where: { id }, data: decided })]);
  } else {
    await prisma.shiftSwapRequest.update({ where: { id }, data: decided });
  }
  await audit(u.id, approve ? "swap.approve" : "swap.reject", "ShiftSwapRequest", id, { after: decided });
  const title = approve ? "Shift swap approved" : "Shift swap rejected";
  const body = `${nameOf(r.requester)} and ${nameOf(r.target)} on ${date}`;
  await Promise.all([notify(r.requester.userId, title, body, "/schedule"), notify(r.target.userId, title, body, "/schedule")]);
}

export async function cancelSwap(u: SessionUser, id: string) {
  const r = await loadSwap(id);
  if (r.requesterId !== u.employeeId) throw new AuthError("Only the requester can cancel", 403);
  await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } });
  await audit(u.id, "swap.cancel", "ShiftSwapRequest", id);
}

/** Swaps involving `u` plus accepted ones waiting on `u` as manager/HR, with both people's shifts that day. */
export async function listSwaps(u: SessionUser) {
  const include = { requester: person, target: person } as const;
  const [mine, toApprove] = await Promise.all([
    u.employeeId
      ? prisma.shiftSwapRequest.findMany({ where: { OR: [{ requesterId: u.employeeId }, { targetId: u.employeeId }] }, include, orderBy: { createdAt: "desc" }, take: 20 })
      : [],
    u.role === "EMPLOYEE"
      ? []
      : prisma.shiftSwapRequest.findMany({
          where: { status: "PENDING", targetAcceptedAt: { not: null }, NOT: { requesterId: u.employeeId ?? "-" }, ...(isStaff(u) ? {} : { requester: { managerId: u.employeeId ?? "-" } }) },
          include,
          orderBy: { date: "asc" },
          take: 50,
        }),
  ]);
  const all = [...mine, ...toApprove];
  const dates = all.map((r) => iso(r.date)).sort();
  const sched = dates.length ? await effectiveSchedule([...new Set(all.flatMap((r) => [r.requesterId, r.targetId]))], dates[0]!, dates.at(-1)!) : new Map<string, ScheduleDay[]>();
  const shape = (r: (typeof all)[number]) => {
    const date = iso(r.date);
    const on = (id: string) => label(sched.get(id)?.find((d) => d.date === date));
    return { id: r.id, date, reason: r.reason, status: r.status, accepted: !!r.targetAcceptedAt, requesterId: r.requesterId, targetId: r.targetId, requester: nameOf(r.requester), target: nameOf(r.target), requesterShift: on(r.requesterId), targetShift: on(r.targetId) };
  };
  return { mine: mine.map(shape), toApprove: toApprove.map(shape) };
}
