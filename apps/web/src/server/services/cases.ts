import "server-only";
import { prisma, type CaseStatus, type Prisma } from "@hris/db";
import { NTE_MIN_DAYS, sanctionText, type SessionUser, type createCaseSchema, type caseDecisionSchema, type caseHearingSchema, type issueNteSchema } from "@hris/shared";
import type { z } from "zod";
import { AuthError } from "../auth/session";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";
import { manilaToday } from "./onboarding";
import { upload } from "./documents";

/**
 * Grievance / disciplinary cases, PH twin-notice due process:
 * OPEN -> NTE_ISSUED (>= 5 calendar days to explain) -> EXPLANATION_RECEIVED -> HEARING (optional) -> DECISION -> CLOSED.
 * HR/Admin only; the subject employee sees just their NTE, hearing date and decision via myCases().
 */

const staffOnly = (u: SessionUser) => {
  if (!isStaff(u)) throw new AuthError("Forbidden", 403);
};
const DAY = 86_400_000;
const empSelect = { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true, preferredName: true, gender: true, userId: true, jobTitle: { select: { name: true } }, department: { select: { name: true } } } as const;
const ME_LINK = "/me?tab=cases";

export const isOverdue = (c: { status: CaseStatus; nteDueAt: Date | null }) => c.status === "NTE_ISSUED" && !!c.nteDueAt && c.nteDueAt < new Date();

export async function listCases(u: SessionUser, f: { status?: string; q?: string }) {
  staffOnly(u);
  const overdue = f.status === "OVERDUE";
  const where: Prisma.GrievanceCaseWhereInput = {
    ...(overdue ? { status: "NTE_ISSUED", nteDueAt: { lt: new Date() } } : f.status === "ACTIVE" || !f.status ? { status: { not: "CLOSED" } } : f.status === "ALL" ? {} : { status: f.status as CaseStatus }),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { employee: { lastName: { contains: f.q, mode: "insensitive" } } }, { employee: { firstName: { contains: f.q, mode: "insensitive" } } }] } : {}),
  };
  return prisma.grievanceCase.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: { id: true, type: true, title: true, status: true, confidential: true, nteDueAt: true, createdAt: true, updatedAt: true, employee: { select: empSelect } },
  });
}

export async function caseCounts(u: SessionUser) {
  staffOnly(u);
  const [byStatus, overdue] = await Promise.all([
    prisma.grievanceCase.groupBy({ by: ["status"], _count: true }),
    prisma.grievanceCase.count({ where: { status: "NTE_ISSUED", nteDueAt: { lt: new Date() } } }),
  ]);
  return { byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])) as Partial<Record<CaseStatus, number>>, overdue };
}

/** Full case for HR. Reads of confidential cases are audited. */
export async function getCase(u: SessionUser, id: string) {
  staffOnly(u);
  const c = await prisma.grievanceCase.findUnique({
    where: { id },
    include: {
      employee: { select: empSelect },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { email: true, employee: { select: { firstName: true, lastName: true, preferredName: true } } } } } },
    },
  });
  if (!c) throw notFound("Case");
  if (c.confidential) await audit(u.id, "case.view", "GrievanceCase", id);
  return { ...c, nteText: nteTextOf(c.events) };
}
export type CaseDetail = Awaited<ReturnType<typeof getCase>>;

const nteTextOf = (events: { action: string; note: string | null }[]) => [...events].reverse().find((e) => e.action === "nte.issued")?.note ?? null;

/** The subject employee's view: only cases where an NTE was served, without HR's internal notes. */
export async function myCases(u: SessionUser) {
  if (!u.employeeId) return [];
  const rows = await prisma.grievanceCase.findMany({
    where: { employeeId: u.employeeId, nteIssuedAt: { not: null } },
    orderBy: { nteIssuedAt: "desc" },
    select: {
      id: true, type: true, title: true, status: true, nteIssuedAt: true, nteDueAt: true, explanation: true, hearingAt: true, decision: true, sanction: true, closedAt: true,
      events: { where: { action: "nte.issued" }, select: { action: true, note: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map(({ events, ...c }) => ({ ...c, nteText: nteTextOf(events), decided: c.status === "DECISION" || c.status === "CLOSED" }));
}
export const hasCases = async (u: SessionUser) => !!u.employeeId && (await prisma.grievanceCase.count({ where: { employeeId: u.employeeId, nteIssuedAt: { not: null } } })) > 0;

/** For the printable letters: HR, or the subject employee once the letter was served. */
export async function getLetter(u: SessionUser, id: string, kind: "nte" | "decision") {
  const c = await prisma.grievanceCase.findUnique({ where: { id }, include: { employee: { select: empSelect }, events: { where: { action: { in: ["nte.issued", "decision"] } }, select: { action: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } } } });
  const served = kind === "nte" ? !!c?.nteIssuedAt : c?.status === "DECISION" || c?.status === "CLOSED";
  if (!c || !served || !(isStaff(u) || c.employeeId === u.employeeId)) throw notFound("Letter");
  if (c.confidential && isStaff(u)) await audit(u.id, "case.view", "GrievanceCase", id, { after: { letter: kind } });
  const decidedAt = [...c.events].reverse().find((e) => e.action === "decision")?.createdAt ?? null;
  return { ...c, nteText: nteTextOf(c.events), decidedAt };
}

// ---------- Workflow ----------

async function step(u: SessionUser, id: string, allowed: CaseStatus[], data: Prisma.GrievanceCaseUpdateInput, action: string, note?: string | null) {
  staffOnly(u);
  const before = await prisma.grievanceCase.findUnique({ where: { id }, select: { id: true, status: true, employeeId: true, title: true, employee: { select: { userId: true } } } });
  if (!before) throw notFound("Case");
  if (!allowed.includes(before.status)) throw new AppError(`Not possible while the case is ${before.status.toLowerCase().replace(/_/g, " ")}`);
  // Guard on status so two HR users clicking at once cannot both advance it.
  const r = await prisma.grievanceCase.updateMany({ where: { id, status: before.status }, data: data as Prisma.GrievanceCaseUpdateManyMutationInput });
  if (!r.count) throw new AppError("The case changed in the meantime. Reload and try again.");
  await prisma.caseEvent.create({ data: { caseId: id, actorId: u.id, action, note: note ?? null } });
  await audit(u.id, `case.${action}`, "GrievanceCase", id, { before: { status: before.status }, after: data });
  return before;
}

export async function createCase(u: SessionUser, d: z.infer<typeof createCaseSchema>) {
  staffOnly(u);
  const e = await prisma.employee.findFirst({ where: { id: d.employeeId, deletedAt: null }, select: { id: true } });
  if (!e) throw notFound("Employee");
  const c = await prisma.grievanceCase.create({ data: { ...d, raisedById: u.id, events: { create: { actorId: u.id, action: "created" } } } });
  await audit(u.id, "case.create", "GrievanceCase", c.id, { after: { type: c.type, employeeId: c.employeeId, confidential: c.confidential } });
  return c;
}

/** First notice. The deadline must be at least 5 calendar days after today (Manila). Due at 23:59 Manila on that date. */
export async function issueNte(u: SessionUser, id: string, d: z.infer<typeof issueNteSchema>) {
  const min = new Date(manilaToday().getTime() + NTE_MIN_DAYS * DAY).toISOString().slice(0, 10);
  if (d.dueDate < min) throw new AppError(`Give the employee at least ${NTE_MIN_DAYS} calendar days (on or after ${min})`);
  const nteDueAt = new Date(`${d.dueDate}T23:59:59+08:00`);
  const c = await step(u, id, ["OPEN"], { status: "NTE_ISSUED", nteIssuedAt: new Date(), nteDueAt }, "nte.issued", d.nteText);
  await notify(c.employee.userId, "Notice to Explain", `Please read the notice and submit your written explanation by ${d.dueDate}.`, ME_LINK);
  return c;
}

/** The subject employee answers the NTE (late answers are accepted and flagged in the timeline). */
export async function submitExplanation(u: SessionUser, id: string, explanation: string) {
  const c = await prisma.grievanceCase.findUnique({ where: { id }, select: { id: true, employeeId: true, status: true, nteDueAt: true, raisedById: true, title: true } });
  if (!c || !u.employeeId || c.employeeId !== u.employeeId) throw notFound("Case");
  if (c.status !== "NTE_ISSUED") throw new AppError("This notice is no longer waiting for an explanation");
  const late = isOverdue(c);
  const r = await prisma.grievanceCase.updateMany({ where: { id, status: "NTE_ISSUED" }, data: { explanation, status: "EXPLANATION_RECEIVED" } });
  if (!r.count) throw new AppError("This notice is no longer waiting for an explanation");
  await prisma.caseEvent.create({ data: { caseId: id, actorId: u.id, action: "explanation.received", note: late ? "Submitted after the deadline" : null } });
  await audit(u.id, "case.explanation", "GrievanceCase", id, { after: { late } });
  const to = c.raisedById ? [c.raisedById] : (await prisma.user.findMany({ where: { role: "HR", isActive: true }, select: { id: true } })).map((x) => x.id);
  for (const uid of to) await notify(uid, "Explanation received", `The employee answered the NTE for "${c.title}".`, `/cases/${id}`);
}

export async function scheduleHearing(u: SessionUser, id: string, d: z.infer<typeof caseHearingSchema>) {
  const hearingAt = new Date(d.hearingAt.length === 16 ? `${d.hearingAt}:00+08:00` : d.hearingAt);
  const c = await step(u, id, ["EXPLANATION_RECEIVED", "HEARING"], { status: "HEARING", hearingAt }, "hearing.scheduled", d.note);
  const when = hearingAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
  await notify(c.employee.userId, "Administrative hearing scheduled", `Your hearing is on ${when}. You may bring a representative.`, ME_LINK);
}

/** Second notice: the Notice of Decision. */
export async function decide(u: SessionUser, id: string, d: z.infer<typeof caseDecisionSchema>) {
  const sanction = sanctionText(d.sanction, d.suspensionDays);
  // Deciding straight from an unanswered NTE is allowed once the deadline passed (the employee waived the chance).
  const c = await prisma.grievanceCase.findUnique({ where: { id }, select: { status: true, nteDueAt: true } });
  const allowed: CaseStatus[] = ["EXPLANATION_RECEIVED", "HEARING", ...(c && isOverdue(c) ? (["NTE_ISSUED"] as const) : [])];
  const before = await step(u, id, allowed, { status: "DECISION", decision: d.decision, sanction }, "decision", sanction);
  await notify(before.employee.userId, "Notice of Decision", `A decision was issued on "${before.title}".`, ME_LINK);
}

export async function closeCase(u: SessionUser, id: string, note?: string) {
  await step(u, id, ["OPEN", "DECISION"], { status: "CLOSED", closedAt: new Date() }, "closed", note);
}

export async function addCaseDocument(u: SessionUser, id: string, file: File) {
  staffOnly(u);
  const c = await prisma.grievanceCase.findUnique({ where: { id }, select: { employeeId: true } });
  if (!c) throw notFound("Case");
  const doc = await upload(u, { employeeId: c.employeeId, category: "OTHER", file, caseId: id });
  await prisma.caseEvent.create({ data: { caseId: id, actorId: u.id, action: "document.added", note: doc.name } });
  return doc;
}
