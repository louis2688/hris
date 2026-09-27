import "server-only";
import { prisma } from "@hris/db";
import type { GoalInput, GoalProgressInput, SessionUser } from "@hris/shared";
import { AuthError } from "../auth/session";
import { canAccessEmployee, scopeWhere } from "../authz";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";

const person = { select: { id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true } } as const;
const goalInclude = {
  employee: person,
  cycle: { select: { id: true, name: true, status: true } },
  parent: { select: { id: true, title: true, employee: person } },
} as const;

/** Goals `u` may see: own + direct reports (everyone for staff). ponytail: capped at 300 rows; paginate when orgs outgrow it. */
export async function listGoals(u: SessionUser, employeeId?: string) {
  if (employeeId && !(await canAccessEmployee(u, employeeId))) throw new AuthError("Forbidden", 403);
  const scope = scopeWhere(u);
  return prisma.goal.findMany({
    where: { ...(employeeId ? { employeeId } : {}), employee: { deletedAt: null, ...(scope ?? {}) } },
    include: goalInclude,
    orderBy: [{ cycle: { periodStart: "desc" } }, { createdAt: "asc" }],
    take: 300,
  });
}
export type GoalRow = Awaited<ReturnType<typeof listGoals>>[number];

/** Goals of the employee's manager: candidates for cascading. */
export async function parentGoalOptions(employeeIds: string[]) {
  const emps = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, managerId: true } });
  const mgrIds = [...new Set(emps.map((e) => e.managerId).filter((x): x is string => !!x))];
  if (!mgrIds.length) return [];
  const goals = await prisma.goal.findMany({ where: { employeeId: { in: mgrIds }, status: { not: "DROPPED" } }, select: { id: true, title: true, employeeId: true }, orderBy: { createdAt: "desc" } });
  // One option list per employee: their manager's goals.
  return emps.map((e) => ({ employeeId: e.id, goals: goals.filter((g) => g.employeeId === e.managerId).map((g) => ({ id: g.id, title: g.title })) }));
}

export const goalsForReview = (employeeId: string, cycleId: string) =>
  prisma.goal.findMany({ where: { employeeId, cycleId }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, kra: true, weight: true, progress: true, status: true, dueDate: true } });

async function assertCanEdit(u: SessionUser, employeeId: string) {
  if (!(await canAccessEmployee(u, employeeId))) throw new AuthError("You can only manage your own or your direct reports' goals", 403);
}

export async function saveGoal(u: SessionUser, d: GoalInput, id?: string) {
  const existing = id ? await prisma.goal.findUnique({ where: { id } }) : null;
  if (id && !existing) throw notFound("Goal");
  const employeeId = existing?.employeeId ?? d.employeeId ?? u.employeeId;
  if (!employeeId) throw new AppError("Pick an employee");
  await assertCanEdit(u, employeeId);
  const owner = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true, userId: true } });
  if (!owner) throw notFound("Employee");
  if (d.parentId) {
    const parent = await prisma.goal.findUnique({ where: { id: d.parentId }, select: { employeeId: true } });
    if (!parent || parent.employeeId !== owner.managerId) throw new AppError("A goal can only cascade from the employee's manager's goal");
  }
  if (d.cycleId) {
    const c = await prisma.reviewCycle.findUnique({ where: { id: d.cycleId }, select: { status: true } });
    if (!c) throw notFound("Review cycle");
    if (c.status === "CLOSED" && d.cycleId !== existing?.cycleId) throw new AppError("That review cycle is closed");
  }
  const data = { title: d.title, description: d.description ?? null, kra: d.kra ?? null, weight: d.weight, dueDate: d.dueDate ? new Date(d.dueDate) : null, cycleId: d.cycleId ?? null, parentId: d.parentId ?? null };
  const row = existing ? await prisma.goal.update({ where: { id: existing.id }, data }) : await prisma.goal.create({ data: { ...data, employeeId } });
  await audit(u.id, existing ? "goal.update" : "goal.create", "Goal", row.id, { after: row });
  if (!existing && employeeId !== u.employeeId) await notify(owner.userId, "New goal assigned", d.title, "/performance?tab=goals");
  return row;
}

export async function updateGoalProgress(u: SessionUser, id: string, d: GoalProgressInput) {
  const g = await prisma.goal.findUnique({ where: { id }, select: { employeeId: true, progress: true, status: true } });
  if (!g) throw notFound("Goal");
  await assertCanEdit(u, g.employeeId);
  // Hitting 100% marks it done unless the user picked something else explicitly.
  const status = d.progress === 100 && (d.status === "ON_TRACK" || d.status === "NOT_STARTED") ? "DONE" : d.status;
  await prisma.goal.update({ where: { id }, data: { progress: d.progress, status } });
  await audit(u.id, "goal.progress", "Goal", id, { before: g, after: { progress: d.progress, status } });
}

/** Cycles a goal can be attached to (not closed), newest first. */
export const openCycles = () => prisma.reviewCycle.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { periodStart: "desc" }, select: { id: true, name: true } });

/** People `u` can set goals for: self first, then direct reports (everyone for staff). */
export async function goalOwners(u: SessionUser) {
  const scope = scopeWhere(u);
  const rows = await prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] }, ...(scope ?? {}) },
    select: { id: true, firstName: true, lastName: true, preferredName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return [...rows.filter((r) => r.id === u.employeeId), ...rows.filter((r) => r.id !== u.employeeId)];
}

export async function deleteGoal(u: SessionUser, id: string) {
  const g = await prisma.goal.findUnique({ where: { id }, select: { employeeId: true, title: true } });
  if (!g) throw notFound("Goal");
  await assertCanEdit(u, g.employeeId);
  // Children keep existing; parentId is SetNull.
  await prisma.goal.delete({ where: { id } });
  await audit(u.id, "goal.delete", "Goal", id, { before: g });
}
