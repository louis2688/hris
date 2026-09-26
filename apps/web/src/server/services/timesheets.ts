import "server-only";
import { prisma } from "@hris/db";
import { addDaysIso, type ProjectInput, type SessionUser, type TimesheetEntriesInput } from "@hris/shared";
import { AuthError } from "../auth/session";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { fullName } from "./employees";
import { AppError, conflict, notFound } from "./errors";

/** Monday (YYYY-MM-DD) of the week containing iso. */
export function weekOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDaysIso(iso, -dow);
}

const include = {
  employee: { select: { id: true, firstName: true, lastName: true, preferredName: true, managerId: true, employeeCode: true, user: { select: { id: true } }, manager: { select: { user: { select: { id: true } } } } } },
  decidedBy: { select: { firstName: true, lastName: true, preferredName: true } },
  entries: { include: { project: { select: { id: true, name: true } } }, orderBy: [{ projectId: "asc" as const }, { date: "asc" as const }] },
};

export async function getOrCreateTimesheet(employeeId: string, weekStart: string) {
  const ws = new Date(weekOf(weekStart));
  return prisma.timesheet.upsert({ where: { employeeId_weekStart: { employeeId, weekStart: ws } }, create: { employeeId, weekStart: ws }, update: {}, include });
}

export async function getTimesheet(id: string) {
  const t = await prisma.timesheet.findUnique({ where: { id }, include });
  if (!t) throw notFound("Timesheet");
  return t;
}
export type TimesheetDetail = Awaited<ReturnType<typeof getTimesheet>>;

export const canDecideTimesheet = (actor: SessionUser, t: { employeeId: string; employee: { managerId: string | null } }) =>
  t.employeeId !== actor.employeeId && (isStaff(actor) || (actor.role === "MANAGER" && t.employee.managerId === actor.employeeId));

export async function saveEntries(actor: SessionUser, id: string, d: TimesheetEntriesInput) {
  const t = await getTimesheet(id);
  if (t.employeeId !== actor.employeeId) throw new AuthError("Forbidden", 403);
  if (t.status === "SUBMITTED" || t.status === "APPROVED") throw new AppError(`Timesheet is ${t.status.toLowerCase()}`);
  const ws = t.weekStart.toISOString().slice(0, 10);
  const we = addDaysIso(ws, 6);
  const rows = d.entries.filter((e) => e.hours > 0);
  if (rows.some((e) => e.date < ws || e.date > we)) throw new AppError("Entry date outside this week");
  const perDay = new Map<string, number>();
  for (const e of rows) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.hours);
  if ([...perDay.values()].some((h) => h > 24)) throw new AppError("More than 24 hours logged on one day");

  await prisma.$transaction([
    prisma.timesheetEntry.deleteMany({ where: { timesheetId: id } }),
    prisma.timesheetEntry.createMany({ data: rows.map((e) => ({ timesheetId: id, projectId: e.projectId, activity: e.activity ?? null, date: new Date(e.date), hours: e.hours })) }),
    prisma.timesheet.update({ where: { id }, data: { status: "DRAFT" } }),
  ]);
}

export async function submitTimesheet(actor: SessionUser, id: string) {
  const t = await getTimesheet(id);
  if (t.employeeId !== actor.employeeId) throw new AuthError("Forbidden", 403);
  if (!t.entries.length) throw new AppError("Log some hours before submitting");
  if (t.status === "SUBMITTED" || t.status === "APPROVED") throw conflict(`Timesheet is already ${t.status.toLowerCase()}`);
  await prisma.timesheet.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), decisionNote: null, decidedAt: null, decidedById: null } });
  await audit(actor.id, "timesheet.submit", "Timesheet", id);
  await notify(t.employee.manager?.user?.id, `Timesheet from ${fullName(t.employee)}`, `Week of ${t.weekStart.toISOString().slice(0, 10)}`, `/timesheets/${id}`);
}

export async function decideTimesheet(actor: SessionUser, id: string, decision: "APPROVED" | "REJECTED", note?: string) {
  const t = await getTimesheet(id);
  if (!canDecideTimesheet(actor, t)) throw new AuthError("You cannot decide this timesheet", 403);
  if (t.status !== "SUBMITTED") throw new AppError("Only submitted timesheets can be decided");
  await prisma.timesheet.update({ where: { id }, data: { status: decision, decidedAt: new Date(), decidedById: actor.employeeId, decisionNote: note ?? null } });
  await audit(actor.id, `timesheet.${decision.toLowerCase()}`, "Timesheet", id, { after: { note } });
  await notify(t.employee.user?.id, `Timesheet ${decision.toLowerCase()}`, note, `/timesheets/${id}`);
}

export async function myTimesheets(employeeId: string) {
  return prisma.timesheet.findMany({ where: { employeeId }, orderBy: { weekStart: "desc" }, take: 20, include: { entries: { select: { hours: true } } } });
}

export async function pendingTimesheets(actor: SessionUser) {
  return prisma.timesheet.findMany({
    where: { status: "SUBMITTED", ...(isStaff(actor) ? {} : { employee: { managerId: actor.employeeId ?? "__none__" } }) },
    orderBy: { submittedAt: "asc" },
    include: { employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } }, entries: { select: { hours: true } } },
  });
}

// ---------- Projects ----------

export const listProjects = (activeOnly = false) =>
  prisma.project.findMany({ where: activeOnly ? { isActive: true } : undefined, orderBy: { name: "asc" }, include: { _count: { select: { entries: true } } } });

export async function saveProject(actor: SessionUser, d: ProjectInput, id?: string) {
  const data = { name: d.name, client: d.client ?? null, isActive: d.isActive };
  try {
    const row = id ? await prisma.project.update({ where: { id }, data }) : await prisma.project.create({ data });
    await audit(actor.id, id ? "project.update" : "project.create", "Project", row.id, { after: row });
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("A project with that name already exists");
    throw e;
  }
}
