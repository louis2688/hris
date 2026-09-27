import "server-only";
import { prisma } from "@hris/db";
import { RETURN_ASSETS_TASK, type AdhocTaskInput, type ChecklistItemInput, type ChecklistTemplateInput, type SessionUser } from "@hris/shared";
import { isStaff, scopeWhere } from "../authz";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";

type Kind = "ONBOARDING" | "OFFBOARDING";
const DAY = 86_400_000;

/** Today in Manila as a UTC-midnight Date (same shape as @db.Date columns). */
export const manilaToday = () => new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));

// ---------- Templates ----------

export function listTemplates() {
  return prisma.checklistTemplate.findMany({
    orderBy: [{ kind: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, _count: { select: { checklists: true } } },
  });
}

export async function saveTemplate(actor: SessionUser, d: ChecklistTemplateInput, id?: string) {
  const row = await prisma.$transaction(async (tx) => {
    if (d.isDefault) await tx.checklistTemplate.updateMany({ where: { kind: d.kind, isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
    if (id) return tx.checklistTemplate.update({ where: { id }, data: d });
    return tx.checklistTemplate.create({
      data: { ...d, items: d.kind === "OFFBOARDING" ? { create: { title: RETURN_ASSETS_TASK, owner: "EMPLOYEE", dueOffsetDays: 1 } } : undefined },
    });
  });
  await audit(actor.id, id ? "checklist_template.update" : "checklist_template.create", "ChecklistTemplate", row.id, { after: d });
  return row;
}

export async function deleteTemplate(actor: SessionUser, id: string) {
  await prisma.checklistTemplate.delete({ where: { id } });
  await audit(actor.id, "checklist_template.delete", "ChecklistTemplate", id);
}

export async function addTemplateItem(actor: SessionUser, templateId: string, d: ChecklistItemInput) {
  const last = await prisma.checklistTemplateItem.findFirst({ where: { templateId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await prisma.checklistTemplateItem.create({ data: { ...d, templateId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  await audit(actor.id, "checklist_template.item_add", "ChecklistTemplate", templateId, { after: d });
}

export async function updateTemplateItem(actor: SessionUser, id: string, d: ChecklistItemInput) {
  const row = await prisma.checklistTemplateItem.update({ where: { id }, data: d });
  await audit(actor.id, "checklist_template.item_update", "ChecklistTemplate", row.templateId, { after: d });
}

export async function deleteTemplateItem(actor: SessionUser, id: string) {
  const row = await prisma.checklistTemplateItem.delete({ where: { id } });
  await audit(actor.id, "checklist_template.item_delete", "ChecklistTemplate", row.templateId, { before: { title: row.title } });
}

/** Swap with the neighbour above/below. Renumbers the template first so equal sortOrders can't stick. */
export async function moveTemplateItem(id: string, dir: -1 | 1) {
  const item = await prisma.checklistTemplateItem.findUnique({ where: { id }, select: { templateId: true } });
  if (!item) throw notFound("Item");
  const items = await prisma.checklistTemplateItem.findMany({ where: { templateId: item.templateId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  const ids = items.map((i) => i.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await prisma.$transaction(ids.map((x, n) => prisma.checklistTemplateItem.update({ where: { id: x }, data: { sortOrder: n } })));
}

// ---------- Starting a checklist ----------

/** Copy a template into EmployeeTask rows and notify each task owner group. */
export async function startChecklist(actorId: string | null, employeeId: string, templateId: string) {
  const [t, e] = await Promise.all([
    prisma.checklistTemplate.findUnique({ where: { id: templateId }, include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } }),
    prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { firstName: true, lastName: true, preferredName: true, hireDate: true, terminationDate: true, userId: true, manager: { select: { userId: true } } },
    }),
  ]);
  if (!t) throw notFound("Checklist template");
  if (!e) throw notFound("Employee");
  const base = t.kind === "ONBOARDING" ? e.hireDate : (e.terminationDate ?? manilaToday());
  const sign = t.kind === "ONBOARDING" ? 1 : -1;
  const c = await prisma.employeeChecklist.create({
    data: {
      employeeId,
      kind: t.kind,
      templateId: t.id,
      tasks: { create: t.items.map((it, n) => ({ title: it.title, owner: it.owner, dueDate: new Date(base.getTime() + sign * it.dueOffsetDays * DAY), sortOrder: n })) },
    },
  });
  await audit(actorId, "checklist.start", "EmployeeChecklist", c.id, { after: { employeeId, template: t.name } });

  const owners = new Set(t.items.map((i) => i.owner));
  const name = `${e.preferredName ?? e.firstName} ${e.lastName}`;
  const title = `${t.kind === "ONBOARDING" ? "Onboarding" : "Offboarding"} started: ${name}`;
  const link = `/onboarding/${c.id}`;
  const hr = owners.has("HR") || owners.has("IT") ? await prisma.user.findMany({ where: { role: "HR", isActive: true }, select: { id: true } }) : [];
  await Promise.all([
    ...hr.map((u) => notify(u.id, title, "You have HR/IT tasks on this checklist.", link)),
    owners.has("MANAGER") ? notify(e.manager?.userId, title, "You have manager tasks on this checklist.", link) : null,
    owners.has("EMPLOYEE") ? notify(e.userId, t.kind === "ONBOARDING" ? "Welcome aboard! Your onboarding tasks are ready" : "Your offboarding tasks are ready", undefined, link) : null,
  ]);
  return c;
}

/** Start the default template of `kind`, if one exists. `once` skips employees who already have that kind. */
export async function startDefaultChecklist(actorId: string | null, employeeId: string, kind: Kind, once = false) {
  const t = await prisma.checklistTemplate.findFirst({ where: { kind, isDefault: true }, select: { id: true } });
  if (!t) return null;
  if (once && (await prisma.employeeChecklist.count({ where: { employeeId, kind } }))) return null;
  return startChecklist(actorId, employeeId, t.id);
}

// ---------- Viewing / working a checklist ----------

type Access = "staff" | "manager" | "self";

/** HR/ADMIN everything; a manager their reports' lists; an employee their own list (EMPLOYEE-owned tasks only). */
function accessTo(u: SessionUser, c: { employeeId: string; employee: { managerId: string | null } }): Access | null {
  if (isStaff(u)) return "staff";
  if (u.employeeId && c.employee.managerId === u.employeeId) return "manager";
  if (u.employeeId && c.employeeId === u.employeeId) return "self";
  return null;
}

export const listQuery = (raw: Record<string, string | undefined>) => ({
  kind: raw.kind === "ONBOARDING" || raw.kind === "OFFBOARDING" ? (raw.kind as Kind) : undefined,
  overdue: raw.overdue === "1",
  status: raw.status === "completed" ? ("completed" as const) : ("active" as const),
});

export async function listChecklists(u: SessionUser, q: ReturnType<typeof listQuery>) {
  const today = manilaToday();
  const scope = scopeWhere(u);
  const mine = (t: { owner: string }, employeeId: string) => isStaff(u) || employeeId !== u.employeeId || t.owner === "EMPLOYEE";
  const rows = await prisma.employeeChecklist.findMany({
    where: {
      completedAt: q.status === "completed" ? { not: null } : null,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.overdue ? { tasks: { some: { doneAt: null, dueDate: { lt: today } } } } : {}),
      employee: { deletedAt: null, ...(scope ?? {}) },
    },
    orderBy: { startedAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      startedAt: true,
      completedAt: true,
      template: { select: { name: true } },
      employee: { select: { id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true, hireDate: true, terminationDate: true, jobTitle: { select: { name: true } }, department: { select: { name: true } } } },
      tasks: { select: { doneAt: true, dueDate: true, owner: true } },
    },
  });
  return rows.map(({ tasks: all, ...c }) => {
    const tasks = all.filter((t) => mine(t, c.employee.id));
    return {
    ...c,
    total: tasks.length,
    done: tasks.filter((t) => t.doneAt).length,
    overdue: tasks.filter((t) => !t.doneAt && t.dueDate && t.dueDate < today).length,
    };
  });
}

export async function getChecklist(u: SessionUser, id: string) {
  const c = await prisma.employeeChecklist.findUnique({
    where: { id },
    include: {
      template: { select: { name: true } },
      employee: {
        select: {
          id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true, hireDate: true, terminationDate: true, managerId: true, employmentStatus: true,
          jobTitle: { select: { name: true } }, department: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true, preferredName: true } },
        },
      },
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { doneBy: { select: { email: true, employee: { select: { firstName: true, lastName: true, preferredName: true } } } } },
      },
    },
  });
  const access = c ? accessTo(u, c) : null;
  if (!c || !access) throw notFound("Checklist");
  return { ...c, access, tasks: access === "self" ? c.tasks.filter((t) => t.owner === "EMPLOYEE") : c.tasks };
}

async function loadForWrite(u: SessionUser, checklistId: string) {
  const c = await prisma.employeeChecklist.findUnique({ where: { id: checklistId }, select: { id: true, employeeId: true, completedAt: true, employee: { select: { managerId: true } } } });
  const access = c ? accessTo(u, c) : null;
  if (!c || !access) throw notFound("Checklist");
  return { c, access };
}

export async function setTaskDone(u: SessionUser, taskId: string, done: boolean) {
  const t = await prisma.employeeTask.findUnique({ where: { id: taskId }, select: { checklistId: true, owner: true, title: true } });
  if (!t) throw notFound("Task");
  const { access } = await loadForWrite(u, t.checklistId);
  if (access === "self" && t.owner !== "EMPLOYEE") throw new AppError("Only HR or your manager can update this task", "FORBIDDEN", 403);
  await prisma.employeeTask.update({ where: { id: taskId }, data: done ? { doneAt: new Date(), doneById: u.id } : { doneAt: null, doneById: null } });
  await audit(u.id, done ? "checklist.task_done" : "checklist.task_undone", "EmployeeChecklist", t.checklistId, { after: { task: t.title } });
  return t.checklistId;
}

export async function addTask(u: SessionUser, checklistId: string, d: AdhocTaskInput) {
  const { access } = await loadForWrite(u, checklistId);
  if (access === "self") throw new AppError("Only HR or the manager can add tasks", "FORBIDDEN", 403);
  const last = await prisma.employeeTask.findFirst({ where: { checklistId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await prisma.employeeTask.create({ data: { checklistId, title: d.title, owner: d.owner, dueDate: d.dueDate ? new Date(d.dueDate) : null, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  await audit(u.id, "checklist.task_add", "EmployeeChecklist", checklistId, { after: d });
}

export async function deleteTask(u: SessionUser, taskId: string) {
  const t = await prisma.employeeTask.findUnique({ where: { id: taskId }, select: { checklistId: true, title: true } });
  if (!t) throw notFound("Task");
  const { access } = await loadForWrite(u, t.checklistId);
  if (access !== "staff") throw new AppError("Only HR can remove tasks", "FORBIDDEN", 403);
  await prisma.employeeTask.delete({ where: { id: taskId } });
  await audit(u.id, "checklist.task_delete", "EmployeeChecklist", t.checklistId, { before: { task: t.title } });
  return t.checklistId;
}

export async function setChecklistCompleted(u: SessionUser, checklistId: string, completed: boolean) {
  const { access } = await loadForWrite(u, checklistId);
  if (access !== "staff") throw new AppError("Only HR can complete a checklist", "FORBIDDEN", 403);
  await prisma.employeeChecklist.update({ where: { id: checklistId }, data: { completedAt: completed ? new Date() : null } });
  await audit(u.id, completed ? "checklist.complete" : "checklist.reopen", "EmployeeChecklist", checklistId);
}

export async function deleteChecklist(u: SessionUser, checklistId: string) {
  const { access } = await loadForWrite(u, checklistId);
  if (access !== "staff") throw new AppError("Only HR can delete a checklist", "FORBIDDEN", 403);
  await prisma.employeeChecklist.delete({ where: { id: checklistId } });
  await audit(u.id, "checklist.delete", "EmployeeChecklist", checklistId);
}

/** Employee profile tab. */
export async function checklistsForEmployee(employeeId: string) {
  const rows = await prisma.employeeChecklist.findMany({
    where: { employeeId },
    orderBy: { startedAt: "desc" },
    select: { id: true, kind: true, startedAt: true, completedAt: true, template: { select: { name: true } }, tasks: { select: { doneAt: true } } },
  });
  return rows.map(({ tasks, ...c }) => ({ ...c, total: tasks.length, done: tasks.filter((t) => t.doneAt).length }));
}

/** Pickers for the "Start checklist" dialog. Includes leavers so offboarding can start after the status change. */
export async function startOptions() {
  const [employees, templates] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true },
    }),
    prisma.checklistTemplate.findMany({ orderBy: [{ kind: "asc" }, { isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
  ]);
  return { employees, templates };
}
