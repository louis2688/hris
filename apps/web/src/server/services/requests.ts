import "server-only";
import { prisma, type Prisma } from "@hris/db";
import {
  OT_MAX_AGE_DAYS,
  otRange,
  type CoeInput,
  type ExpenseInput,
  type LoanInput,
  type OvertimeInput,
  type RequestDecisionInput,
  type RequestKind,
  type SessionUser,
} from "@hris/shared";
import { AuthError } from "../auth/session";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { uploadReceipt } from "./documents";
import { fullName } from "./employees";
import { AppError, conflict, notFound } from "./errors";

// Overtime, certificates of employment, expense claims and loans. Pattern follows services/leave.ts.

const who = {
  select: {
    id: true,
    employeeCode: true,
    firstName: true,
    lastName: true,
    preferredName: true,
    avatarUrl: true,
    managerId: true,
    department: { select: { name: true } },
    user: { select: { id: true } },
    manager: { select: { firstName: true, lastName: true, preferredName: true, user: { select: { id: true } } } },
  },
} as const;
const approverName = { select: { firstName: true, lastName: true, preferredName: true } } as const;

export const KIND_LABEL: Record<RequestKind, string> = { overtime: "Overtime request", coe: "Certificate of employment request", expenses: "Expense claim", loans: "Loan application" };

/** Today in Asia/Manila (UTC+8, no DST) as YYYY-MM-DD. */
export const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400_000).toISOString().slice(0, 10);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function requireEmployee(actor: SessionUser) {
  if (!actor.employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE");
  return actor.employeeId;
}

type Owned = { employeeId: string; employee: { managerId: string | null } };

/**
 * Who may approve/reject. Never the requester. Overtime and expenses: the direct manager, HR or Admin.
 * Certificates and loans: HR or Admin.
 */
export function canDecide(actor: SessionUser, kind: RequestKind, r: Owned) {
  if (r.employeeId === actor.employeeId) return false;
  if (isStaff(actor)) return true;
  if (kind === "coe" || kind === "loans") return false;
  return !!actor.employeeId && r.employee.managerId === actor.employeeId;
}

/** Self or HR/Admin; managers also see their reports' overtime and expenses. */
export function canView(actor: SessionUser, kind: RequestKind, r: Owned) {
  return r.employeeId === actor.employeeId || isStaff(actor) || canDecide(actor, kind, r);
}

async function staffUserIds(exceptUserId?: string | null) {
  const users = await prisma.user.findMany({ where: { role: { in: ["HR", "ADMIN"] }, isActive: true }, select: { id: true } });
  return users.map((u) => u.id).filter((id) => id !== exceptUserId);
}

/** Manager if there is one, else HR/Admin. */
async function notifyApprovers(kind: RequestKind, e: { user: { id: string } | null; manager: { user: { id: string } | null } | null } & Parameters<typeof fullName>[0], body: string, link: string) {
  const title = `${KIND_LABEL[kind]} from ${fullName(e)}`;
  const managerUser = kind === "overtime" || kind === "expenses" ? e.manager?.user?.id : null;
  for (const uid of managerUser ? [managerUser] : await staffUserIds(e.user?.id)) await notify(uid, title, body, link);
}

function assertDecidable(actor: SessionUser, kind: RequestKind, r: Owned & { status: string }) {
  if (!canDecide(actor, kind, r)) throw new AuthError("You cannot decide this request", 403);
  if (r.status !== "PENDING") throw new AppError(`Request is already ${r.status.toLowerCase()}`);
}

function assertCancellable(actor: SessionUser, r: { employeeId: string; status: string }) {
  if (r.employeeId !== actor.employeeId && !isStaff(actor)) throw new AuthError("Forbidden", 403);
  if (r.status !== "PENDING") throw new AppError("Only pending requests can be cancelled");
}

const gone = () => conflict("Someone else just acted on this request. Refresh and try again.");

// ---------- Overtime ----------

export async function getOvertime(id: string) {
  const r = await prisma.overtimeRequest.findUnique({ where: { id }, include: { employee: who, approver: approverName } });
  if (!r) throw notFound("Overtime request");
  return r;
}

export async function createOvertime(actor: SessionUser, d: OvertimeInput) {
  const employeeId = requireEmployee(actor);
  if (d.date < addDays(manilaToday(), -OT_MAX_AGE_DAYS)) throw new AppError(`Overtime older than ${OT_MAX_AGE_DAYS} days can no longer be filed`);
  const [s, e] = otRange(d.startTime, d.endTime);
  const date = new Date(d.date);
  const [employee, sameDay] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, ...who }),
    prisma.overtimeRequest.findMany({ where: { employeeId, date, status: { in: ["PENDING", "APPROVED"] } }, select: { startTime: true, endTime: true } }),
  ]);
  const clash = sameDay.find((o) => {
    const [os, oe] = otRange(o.startTime, o.endTime);
    return s < oe && os < e;
  });
  if (clash) throw conflict(`Overlaps your overtime ${clash.startTime} to ${clash.endTime} on that date`);

  const row = await prisma.overtimeRequest.create({
    data: { employeeId, date, startTime: d.startTime, endTime: d.endTime, minutes: e - s, reason: d.reason, approverId: employee.managerId },
  });
  await audit(actor.id, "overtime.create", "OvertimeRequest", row.id, { after: row });
  await notifyApprovers("overtime", employee, `${d.date}, ${d.startTime} to ${d.endTime}: ${d.reason}`, `/requests/overtime/${row.id}`);
  return row;
}

// ---------- Certificate of employment ----------

export async function getCoe(id: string) {
  const r = await prisma.coeRequest.findUnique({ where: { id }, include: { employee: who } });
  if (!r) throw notFound("Certificate request");
  return r;
}

export async function createCoe(actor: SessionUser, d: CoeInput) {
  const employeeId = requireEmployee(actor);
  const [employee, open] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, ...who }),
    prisma.coeRequest.count({ where: { employeeId, status: "PENDING" } }),
  ]);
  if (open >= 3) throw new AppError("You already have 3 pending certificate requests");
  const row = await prisma.coeRequest.create({ data: { employeeId, purpose: d.purpose, includeCompensation: d.includeCompensation } });
  await audit(actor.id, "coe.create", "CoeRequest", row.id, { after: row });
  await notifyApprovers("coe", employee, `Purpose: ${d.purpose}${d.includeCompensation ? " (with compensation)" : ""}`, `/requests/coe/${row.id}`);
  return row;
}

/** Everything the printed certificate needs. */
export async function getCertificate(id: string) {
  const r = await prisma.coeRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          gender: true,
          hireDate: true,
          terminationDate: true,
          employmentType: true,
          employmentStatus: true,
          payType: true,
          basicPay: true,
          allowance: true,
          jobTitle: { select: { name: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!r) throw notFound("Certificate");
  return r;
}

// ---------- Expense claims ----------

export async function getExpense(id: string) {
  const r = await prisma.expenseClaim.findUnique({
    where: { id },
    include: { employee: who, approver: approverName, receipt: { select: { id: true, name: true, mimeType: true } }, reimbursedIn: { select: { id: true, name: true, payDate: true } } },
  });
  if (!r) throw notFound("Expense claim");
  return r;
}

export async function createExpense(actor: SessionUser, d: ExpenseInput, receipt?: File | null) {
  const employeeId = requireEmployee(actor);
  if (d.date > manilaToday()) throw new AppError("Expense date cannot be in the future");
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, ...who });
  // ponytail: receipt is stored before the claim; an orphaned OTHER document is the worst case if the insert fails.
  const doc = receipt && receipt.size > 0 ? await uploadReceipt(actor, employeeId, receipt) : null;
  const row = await prisma.expenseClaim.create({
    data: { employeeId, date: new Date(d.date), category: d.category, amount: d.amount, description: d.description, approverId: employee.managerId, receiptId: doc?.id ?? null },
  });
  await audit(actor.id, "expense.create", "ExpenseClaim", row.id, { after: row });
  await notifyApprovers("expenses", employee, `${d.category} PHP ${d.amount} on ${d.date}: ${d.description}`, `/requests/expenses/${row.id}`);
  return row;
}

// ---------- Loans ----------

export async function getLoan(id: string) {
  const r = await prisma.loan.findUnique({
    where: { id },
    include: { employee: who, payments: { orderBy: { paidAt: "desc" }, include: { payslip: { select: { run: { select: { id: true, name: true } } } } } } },
  });
  if (!r) throw notFound("Loan");
  return r;
}

/** Employee applies (PENDING), or HR/Admin books an ACTIVE loan for someone else (e.g. SSS/Pag-IBIG salary loan). */
export async function createLoan(actor: SessionUser, d: LoanInput) {
  const direct = !!d.employeeId && isStaff(actor) && d.employeeId !== actor.employeeId;
  const employeeId = direct ? d.employeeId! : requireEmployee(actor);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, ...who });
  if (!employee) throw notFound("Employee");
  const row = await prisma.loan.create({
    data: {
      employeeId,
      type: d.type,
      principal: d.principal,
      amortization: d.amortization,
      balance: direct ? d.principal : 0,
      startDate: new Date(d.startDate),
      reason: d.reason ?? null,
      status: direct ? "ACTIVE" : "PENDING",
      ...(direct ? { decidedById: actor.id, decidedAt: new Date() } : {}),
    },
  });
  await audit(actor.id, direct ? "loan.create_active" : "loan.create", "Loan", row.id, { after: row });
  if (direct) await notify(employee.user?.id, "A loan was added to your account", `PHP ${d.principal}, PHP ${d.amortization} per payroll from ${d.startDate}`, `/requests/loans/${row.id}`);
  else await notifyApprovers("loans", employee, `PHP ${d.principal}, PHP ${d.amortization} per payroll${d.reason ? `: ${d.reason}` : ""}`, `/requests/loans/${row.id}`);
  return row;
}

// ---------- Decide / cancel (all kinds) ----------

export async function decideRequest(actor: SessionUser, kind: RequestKind, id: string, d: RequestDecisionInput) {
  const now = new Date();
  const ok = d.decision === "APPROVED";
  let owner: { employeeId: string; user: string | undefined; summary: string };
  switch (kind) {
    case "overtime": {
      const r = await getOvertime(id);
      assertDecidable(actor, kind, r);
      const res = await prisma.overtimeRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: d.decision, approverId: actor.employeeId ?? r.approverId, decidedAt: now, decisionNote: d.note ?? null },
      });
      if (!res.count) throw gone();
      owner = { employeeId: r.employeeId, user: r.employee.user?.id, summary: `${iso(r.date)}, ${r.startTime} to ${r.endTime}` };
      break;
    }
    case "expenses": {
      const r = await getExpense(id);
      assertDecidable(actor, kind, r);
      const res = await prisma.expenseClaim.updateMany({
        where: { id, status: "PENDING" },
        data: { status: d.decision, approverId: actor.employeeId ?? r.approverId, decidedAt: now, decisionNote: d.note ?? null },
      });
      if (!res.count) throw gone();
      owner = { employeeId: r.employeeId, user: r.employee.user?.id, summary: `${r.category} PHP ${r.amount.toFixed(2)}` };
      break;
    }
    case "coe": {
      const r = await getCoe(id);
      assertDecidable(actor, kind, r);
      const res = await prisma.coeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: d.decision, decidedById: actor.id, decidedAt: now, note: d.note ?? null } });
      if (!res.count) throw gone();
      owner = { employeeId: r.employeeId, user: r.employee.user?.id, summary: ok ? "Your certificate is ready to print" : `Purpose: ${r.purpose}` };
      break;
    }
    case "loans": {
      const r = await getLoan(id);
      assertDecidable(actor, kind, r);
      const res = await prisma.loan.updateMany({
        where: { id, status: "PENDING" },
        data: ok ? { status: "ACTIVE", balance: r.principal, decidedById: actor.id, decidedAt: now } : { status: "REJECTED", decidedById: actor.id, decidedAt: now },
      });
      if (!res.count) throw gone();
      owner = { employeeId: r.employeeId, user: r.employee.user?.id, summary: `PHP ${r.principal.toFixed(2)}${ok ? `, PHP ${r.amortization.toFixed(2)} deducted per payroll from ${iso(r.startDate)}` : ""}` };
      break;
    }
  }
  const after = { status: kind === "loans" && ok ? "ACTIVE" : d.decision, note: d.note };
  await audit(actor.id, `${kind}.${d.decision.toLowerCase()}`, ENTITY[kind], id, { before: { status: "PENDING" }, after });
  const link = kind === "coe" && ok ? `/requests/coe/${id}/certificate` : `/requests/${kind}/${id}`;
  await notify(owner.user, `${KIND_LABEL[kind]} ${ok ? "approved" : "rejected"}`, `${owner.summary}${d.note ? `. Note: ${d.note}` : ""}`, link);
}

const ENTITY: Record<RequestKind, string> = { overtime: "OvertimeRequest", coe: "CoeRequest", expenses: "ExpenseClaim", loans: "Loan" };

export async function cancelRequest(actor: SessionUser, kind: RequestKind, id: string) {
  const where = { id, status: "PENDING" as const };
  const r = await { overtime: getOvertime, coe: getCoe, expenses: getExpense, loans: getLoan }[kind](id);
  assertCancellable(actor, r);
  const res =
    kind === "overtime"
      ? await prisma.overtimeRequest.updateMany({ where, data: { status: "CANCELLED" } })
      : kind === "coe"
        ? await prisma.coeRequest.updateMany({ where, data: { status: "CANCELLED" } })
        : kind === "expenses"
          ? await prisma.expenseClaim.updateMany({ where, data: { status: "CANCELLED" } })
          : await prisma.loan.updateMany({ where, data: { status: "CANCELLED" } });
  if (!res.count) throw gone();
  await audit(actor.id, `${kind}.cancel`, ENTITY[kind], id, { before: { status: r.status }, after: { status: "CANCELLED" } });
  if (r.employeeId !== actor.employeeId) await notify(r.employee.user?.id, `${KIND_LABEL[kind]} cancelled by HR`, undefined, `/requests/${kind}/${id}`);
}

// ---------- Lists ----------

const TAKE = 100; // ponytail: newest 100 per list; add pagination when a team outgrows it.
const newest = { orderBy: { createdAt: "desc" as const }, take: TAKE };

export async function listMine(employeeId: string) {
  const where = { employeeId };
  const [overtime, coe, expenses, loans] = await Promise.all([
    prisma.overtimeRequest.findMany({ where, ...newest }),
    prisma.coeRequest.findMany({ where, ...newest }),
    prisma.expenseClaim.findMany({ where, ...newest, include: { reimbursedIn: { select: { name: true } } } }),
    prisma.loan.findMany({ where, ...newest }),
  ]);
  return { overtime, coe, expenses, loans };
}

/** Requests of people the actor oversees (not their own). Staff: everyone. Managers: direct reports' overtime and expenses. */
function teamWhere(actor: SessionUser, kind: RequestKind): { employeeId?: { not: string }; employee?: Prisma.EmployeeWhereInput } | null {
  const notMine = actor.employeeId ? { employeeId: { not: actor.employeeId } } : {};
  if (isStaff(actor)) return notMine;
  if (!actor.employeeId || kind === "coe" || kind === "loans") return null;
  return { ...notMine, employee: { managerId: actor.employeeId } };
}

export const hasTeam = (actor: SessionUser, kind: RequestKind) => teamWhere(actor, kind) !== null && actor.role !== "EMPLOYEE";

const pendingFirst = { orderBy: [{ status: "asc" as const }, { createdAt: "desc" as const }], take: TAKE };
const none = { id: { in: [] as string[] } };

type TeamWhere = { employeeId?: { not: string }; employee?: Prisma.EmployeeWhereInput; id?: { in: string[] }; status?: "PENDING" };
const teamQueries = {
  overtime: (where: TeamWhere) => prisma.overtimeRequest.findMany({ where, include: { employee: who }, ...pendingFirst }),
  coe: (where: TeamWhere) => prisma.coeRequest.findMany({ where, include: { employee: who }, ...pendingFirst }),
  expenses: (where: TeamWhere) => prisma.expenseClaim.findMany({ where, include: { employee: who, reimbursedIn: { select: { name: true } } }, ...pendingFirst }),
  loans: (where: TeamWhere) => prisma.loan.findMany({ where, include: { employee: who }, ...pendingFirst }),
};

export function listTeam<K extends RequestKind>(actor: SessionUser, kind: K, status?: "PENDING") {
  const where = { ...(teamWhere(actor, kind) ?? none), ...(status ? { status } : {}) };
  return teamQueries[kind](where) as ReturnType<(typeof teamQueries)[K]>;
}

/** Everything pending that the actor can decide, per kind. */
export async function pendingFor(actor: SessionUser) {
  const [overtime, coe, expenses, loans] = await Promise.all([
    listTeam(actor, "overtime", "PENDING"),
    listTeam(actor, "coe", "PENDING"),
    listTeam(actor, "expenses", "PENDING"),
    listTeam(actor, "loans", "PENDING"),
  ]);
  return { overtime, coe, expenses, loans };
}
