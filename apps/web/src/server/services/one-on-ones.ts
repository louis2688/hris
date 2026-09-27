import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { manilaISODate, parseActionItems, type ActionItem, type OneOnOneInput, type SessionUser } from "@hris/shared";
import { AuthError } from "../auth/session";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";

const person = { select: { id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true } } as const;
/** Managers get a nudge when a report has had no 1:1 for this many days. */
export const STALE_DAYS = 30;

const items = (v: Prisma.JsonValue): ActionItem[] => (Array.isArray(v) ? (v as ActionItem[]).filter((x) => x && typeof x.text === "string") : []);
const today = () => new Date(manilaISODate());

/**
 * 1:1s where `u` is the manager or the employee. Notes, agenda and action items are shared by both sides (no private notes).
 * ponytail: last 100; add paging when someone has more.
 */
export async function listOneOnOnes(u: SessionUser, reportId?: string) {
  if (!u.employeeId) return [];
  const rows = await prisma.oneOnOne.findMany({
    where: reportId ? { managerId: u.employeeId, employeeId: reportId } : { OR: [{ managerId: u.employeeId }, { employeeId: u.employeeId }] },
    include: { manager: person, employee: person },
    orderBy: { date: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ ...r, actionItems: items(r.actionItems) }));
}
export type OneOnOneRow = Awaited<ReturnType<typeof listOneOnOnes>>[number];

/** Direct reports with their last / next 1:1 date and a stale flag. */
export async function reportCadence(u: SessionUser) {
  if (!u.employeeId) return [];
  const t = today();
  const reports = await prisma.employee.findMany({
    where: { managerId: u.employeeId, deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] } },
    select: { ...person.select, oneOnOnes: { where: { managerId: u.employeeId }, select: { date: true }, orderBy: { date: "desc" }, take: 20 } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return reports.map(({ oneOnOnes, ...e }) => {
    const last = oneOnOnes.find((o) => o.date <= t)?.date ?? null;
    const next = oneOnOnes.filter((o) => o.date > t).at(-1)?.date ?? null;
    const stale = !next && (!last || (t.getTime() - last.getTime()) / 86_400_000 > STALE_DAYS);
    return { ...e, last, next, stale };
  });
}

async function load(id: string) {
  const r = await prisma.oneOnOne.findUnique({ where: { id }, include: { employee: { select: { userId: true } }, manager: { select: { userId: true } } } });
  if (!r) throw notFound("1:1");
  return r;
}
const isParty = (u: SessionUser, r: { managerId: string; employeeId: string }) => !!u.employeeId && (r.managerId === u.employeeId || r.employeeId === u.employeeId);

/** Manager only, for a current direct report. */
export async function saveOneOnOne(u: SessionUser, d: OneOnOneInput, id?: string) {
  if (!u.employeeId) throw new AuthError("No employee profile linked", 403);
  const existing = id ? await load(id) : null;
  if (existing && existing.managerId !== u.employeeId) throw new AuthError("Only the manager can edit this 1:1", 403);
  const employeeId = existing?.employeeId ?? d.employeeId;
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true, userId: true } });
  if (!emp || (!existing && emp.managerId !== u.employeeId)) throw new AuthError("You can only hold 1:1s with your direct reports", 403);
  const data = { date: new Date(d.date), agenda: d.agenda ?? null, notes: d.notes ?? null, actionItems: parseActionItems(d.actionItems, existing ? items(existing.actionItems) : []) };
  const row = existing ? await prisma.oneOnOne.update({ where: { id: existing.id }, data }) : await prisma.oneOnOne.create({ data: { ...data, managerId: u.employeeId, employeeId } });
  await audit(u.id, existing ? "one_on_one.update" : "one_on_one.create", "OneOnOne", row.id);
  if (!existing) await notify(emp.userId, `1:1 on ${d.date}`, d.agenda ? d.agenda.slice(0, 140) : "Add anything you want to talk about to the agenda.", "/performance?tab=one-on-ones");
  return row;
}

export async function deleteOneOnOne(u: SessionUser, id: string) {
  const r = await load(id);
  if (r.managerId !== u.employeeId) throw new AuthError("Only the manager can delete this 1:1", 403);
  await prisma.oneOnOne.delete({ where: { id } });
  await audit(u.id, "one_on_one.delete", "OneOnOne", id);
}

/** Either side may add to the agenda until the day of the meeting. */
export async function addAgendaItem(u: SessionUser, id: string, text: string) {
  const r = await load(id);
  if (!isParty(u, r)) throw new AuthError("Forbidden", 403);
  if (r.date < today()) throw new AppError("This 1:1 already happened");
  const agenda = [r.agenda?.trim(), `- ${text}`].filter(Boolean).join("\n").slice(0, 4000);
  await prisma.oneOnOne.update({ where: { id }, data: { agenda } });
  await audit(u.id, "one_on_one.agenda", "OneOnOne", id);
  const other = r.managerId === u.employeeId ? r.employee.userId : r.manager.userId;
  await notify(other, "1:1 agenda updated", text.slice(0, 140), "/performance?tab=one-on-ones");
}

export async function toggleActionItem(u: SessionUser, id: string, index: number, done: boolean) {
  const r = await load(id);
  if (!isParty(u, r)) throw new AuthError("Forbidden", 403);
  const list = items(r.actionItems);
  if (!list[index]) throw notFound("Action item");
  list[index] = { ...list[index]!, done };
  await prisma.oneOnOne.update({ where: { id }, data: { actionItems: list } });
}
