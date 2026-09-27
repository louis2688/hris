import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { EMPLOYMENT_STATUS_LABELS, type EmploymentStatus, type RecordChangeInput, type SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { AppError, notFound } from "./errors";
import { manilaToday, startDefaultChecklist } from "./onboarding";

/** Job fields an employment event can change. */
export type JobPatch = Partial<{ jobTitleId: string | null; departmentId: string | null; locationId: string | null; managerId: string | null; employmentStatus: EmploymentStatus }>;
type JobKey = keyof JobPatch;
const JOB_KEYS: JobKey[] = ["jobTitleId", "departmentId", "locationId", "managerId", "employmentStatus"];
/** Which event type a direct field edit maps to. */
const TYPE_OF: Record<JobKey, "PROMOTION" | "TRANSFER" | "STATUS_CHANGE"> = {
  jobTitleId: "PROMOTION",
  departmentId: "TRANSFER",
  locationId: "TRANSFER",
  managerId: "TRANSFER",
  employmentStatus: "STATUS_CHANGE",
};

type Snapshot = Record<string, string | null>;
const jobSelect = { id: true, jobTitleId: true, departmentId: true, locationId: true, managerId: true, employmentStatus: true, deletedAt: true } as const;
type JobRow = Prisma.EmployeeGetPayload<{ select: typeof jobSelect }>;

/** { jobTitleId, jobTitle: "name", ... } for the given keys. Names are stored so history survives renames. */
async function snapshot(p: JobPatch): Promise<Snapshot> {
  const [t, d, l, m] = await Promise.all([
    p.jobTitleId ? prisma.jobTitle.findUnique({ where: { id: p.jobTitleId }, select: { name: true } }) : null,
    p.departmentId ? prisma.department.findUnique({ where: { id: p.departmentId }, select: { name: true } }) : null,
    p.locationId ? prisma.location.findUnique({ where: { id: p.locationId }, select: { name: true } }) : null,
    p.managerId ? prisma.employee.findUnique({ where: { id: p.managerId }, select: { firstName: true, lastName: true, preferredName: true } }) : null,
  ]);
  const s: Snapshot = {};
  if ("jobTitleId" in p) Object.assign(s, { jobTitleId: p.jobTitleId ?? null, jobTitle: t?.name ?? null });
  if ("departmentId" in p) Object.assign(s, { departmentId: p.departmentId ?? null, department: d?.name ?? null });
  if ("locationId" in p) Object.assign(s, { locationId: p.locationId ?? null, location: l?.name ?? null });
  if ("managerId" in p) Object.assign(s, { managerId: p.managerId ?? null, manager: m ? `${m.preferredName ?? m.firstName} ${m.lastName}` : null });
  if (p.employmentStatus) s.employmentStatus = p.employmentStatus;
  return s;
}

const pickKeys = (e: JobRow, keys: JobKey[]): JobPatch => Object.fromEntries(keys.map((k) => [k, e[k]]));

/** Keys of `patch` that differ from the employee's current values. */
function changedKeys(e: JobRow, patch: JobPatch) {
  return JOB_KEYS.filter((k) => k in patch && (patch[k] ?? null) !== (e[k] ?? null));
}

/**
 * Write job fields through the same post-write path as a profile edit: audit row + offboarding checklist
 * when the status moves to resigned/terminated. Does NOT create events (callers do).
 */
export async function applyJobPatch(actorId: string | null, employeeId: string, patch: JobPatch) {
  const before = await prisma.employee.findUnique({ where: { id: employeeId }, select: jobSelect });
  if (!before) throw notFound("Employee");
  if (patch.managerId === employeeId) throw new AppError("An employee cannot report to themselves");
  const after = await prisma.employee.update({ where: { id: employeeId }, data: patch, select: jobSelect });
  await audit(actorId, "employee.update", "Employee", employeeId, { before, after });
  await offboardingHook(actorId, employeeId, before.employmentStatus, after.employmentStatus);
  return { before, after };
}

const leaving = (s: string) => s === "RESIGNED" || s === "TERMINATED";
/** Shared with updateEmployee. A checklist failure must never fail the save. */
export async function offboardingHook(actorId: string | null, employeeId: string, from: string, to: string) {
  if (leaving(to) && !leaving(from)) await startDefaultChecklist(actorId, employeeId, "OFFBOARDING", true).catch((e) => console.error("checklist start failed", e));
}

// ---------- Recording ----------

export async function recordHire(actorId: string | null, e: JobRow & { hireDate: Date }) {
  await prisma.employmentEvent.create({
    data: { employeeId: e.id, type: "HIRE", effectiveDate: e.hireDate, to: (await snapshot(pickKeys(e, JOB_KEYS))) as Prisma.InputJsonValue, appliedAt: new Date(), createdById: actorId },
  });
}

/** After a direct profile edit: one applied event per kind of change (promotion / transfer / status), effective today. */
export async function recordDirectEdit(actorId: string | null, before: JobRow, after: JobRow) {
  const keys = changedKeys(before, pickKeys(after, JOB_KEYS));
  const byType = new Map<string, JobKey[]>();
  for (const k of keys) byType.set(TYPE_OF[k], [...(byType.get(TYPE_OF[k]) ?? []), k]);
  const today = manilaToday();
  for (const [type, ks] of byType) {
    const [from, to] = await Promise.all([snapshot(pickKeys(before, ks)), snapshot(pickKeys(after, ks))]);
    await prisma.employmentEvent.create({
      data: { employeeId: after.id, type: type as "PROMOTION", effectiveDate: today, from, to, note: "Edited on the employee profile", appliedAt: new Date(), createdById: actorId },
    });
  }
}

/** "Record change" dialog. Effective today or earlier: applied now. Future: kept pending for the daily job. */
export async function recordChange(actor: SessionUser, employeeId: string, d: RecordChangeInput) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: jobSelect });
  if (!e) throw notFound("Employee");
  const patch: JobPatch =
    d.type === "PROMOTION"
      ? { jobTitleId: d.jobTitleId, ...(d.managerId ? { managerId: d.managerId } : {}) }
      : d.type === "TRANSFER"
        ? { ...(d.departmentId ? { departmentId: d.departmentId } : {}), ...(d.locationId ? { locationId: d.locationId } : {}), ...(d.managerId ? { managerId: d.managerId } : {}) }
        : { employmentStatus: d.employmentStatus };
  if (patch.managerId === employeeId) throw new AppError("An employee cannot report to themselves");
  const effectiveDate = new Date(d.effectiveDate);
  const due = effectiveDate <= manilaToday();
  // Future events are compared at apply time; only reject a no-op when applying now.
  if (due && !changedKeys(e, patch).length) throw new AppError("That is the same as the current record, so nothing changes");

  const ev = await prisma.employmentEvent.create({
    data: { employeeId, type: d.type, effectiveDate, to: await snapshot(patch), note: d.note, createdById: actor.id },
  });
  await audit(actor.id, "employment_event.create", "Employee", employeeId, { after: ev });
  if (due) await applyEvent(actor.id, ev.id);
  return { id: ev.id, applied: due };
}

/** Apply one pending event: claim it (idempotent), snapshot "from", write the fields. */
async function applyEvent(actorId: string | null, id: string) {
  const claimed = await prisma.employmentEvent.updateMany({ where: { id, appliedAt: null }, data: { appliedAt: new Date() } });
  if (!claimed.count) return false;
  try {
    const ev = await prisma.employmentEvent.findUniqueOrThrow({ where: { id } });
    const to = (ev.to ?? {}) as Snapshot;
    const patch = Object.fromEntries(JOB_KEYS.filter((k) => k in to).map((k) => [k, to[k]])) as JobPatch;
    const cur = await prisma.employee.findUniqueOrThrow({ where: { id: ev.employeeId }, select: jobSelect });
    const from = await snapshot(pickKeys(cur, Object.keys(patch) as JobKey[]));
    await applyJobPatch(actorId, ev.employeeId, patch);
    await prisma.employmentEvent.update({ where: { id }, data: { from } });
    return true;
  } catch (e) {
    await prisma.employmentEvent.update({ where: { id }, data: { appliedAt: null } });
    throw e;
  }
}

export async function cancelScheduled(actor: SessionUser, id: string) {
  const ev = await prisma.employmentEvent.findUnique({ where: { id } });
  if (!ev || ev.appliedAt) throw new AppError("Only scheduled changes can be cancelled");
  await prisma.employmentEvent.delete({ where: { id, appliedAt: null } });
  await audit(actor.id, "employment_event.cancel", "Employee", ev.employeeId, { before: ev });
  return ev.employeeId;
}

/** Daily job: apply every pending event effective today or earlier. Safe to run twice. Returns how many were applied. */
export async function runDailyEmploymentEvents(): Promise<number> {
  const due = await prisma.employmentEvent.findMany({
    // SALARY_CHANGE / SEPARATION rows are written and applied by payroll / separations, never here.
    where: { appliedAt: null, type: { notIn: ["SALARY_CHANGE", "SEPARATION"] }, effectiveDate: { lte: manilaToday() }, employee: { deletedAt: null } },
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  let n = 0;
  for (const { id } of due) {
    try {
      if (await applyEvent(null, id)) n++;
    } catch (e) {
      console.error("employment event apply failed", id, e);
    }
  }
  return n;
}

// ---------- Reading ----------

export async function listEvents(employeeId: string) {
  return prisma.employmentEvent.findMany({
    where: { employeeId },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
}

const FIELD_LABELS: Record<string, string> = {
  jobTitle: "Job title",
  department: "Department",
  location: "Location",
  manager: "Reports to",
  employmentStatus: "Status",
  basicPay: "Basic pay",
  allowance: "Allowance",
  payType: "Pay type",
  reason: "Reason",
  lastDay: "Last day",
};
const humanize = (k: string) => FIELD_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const show = (k: string, v: unknown) =>
  v === null || v === undefined || v === "" ? "None" : k === "employmentStatus" ? (EMPLOYMENT_STATUS_LABELS[v as EmploymentStatus] ?? String(v)) : typeof v === "object" ? JSON.stringify(v) : String(v);

/**
 * Render any event's from/to JSON as [{ label, from, to }]. Generic so payroll-written events
 * (salary, separation) display too. `*Id` keys are hidden when a name key sits next to them.
 */
export function describeChange(from: unknown, to: unknown) {
  const f = (from ?? {}) as Record<string, unknown>;
  const t = (to ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(t), ...Object.keys(f)])].filter((k) => !(k.endsWith("Id") && k.slice(0, -2) in { ...t, ...f }));
  return keys.map((k) => ({ label: humanize(k), from: k in f ? show(k, f[k]) : null, to: k in t ? show(k, t[k]) : null }));
}
