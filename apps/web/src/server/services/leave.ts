import "server-only";
import { prisma, Prisma } from "@hris/db";
import {
  countLeaveDays,
  parseISODate,
  type CreateLeaveRequestInput,
  type DecideLeaveRequestInput,
  type LeaveBalance,
  type LeaveEntitlementInput,
  type LeaveListQuery,
  type LeaveTypeInput,
  type SessionUser,
} from "@hris/shared";
import type { ApproverKind } from "@hris/db";
import { AuthError } from "../auth/session";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { fullName } from "./employees";
import { AppError, conflict, notFound } from "./errors";
import { holidayDatesFor } from "./org";

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

// ---------- Leave types ----------

export const listLeaveTypes = (activeOnly = false) =>
  prisma.leaveType.findMany({ where: activeOnly ? { isActive: true } : undefined, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

export async function saveLeaveType(actor: SessionUser, d: LeaveTypeInput, id?: string) {
  const data = {
    name: d.name,
    code: d.code,
    color: d.color,
    isPaid: d.isPaid,
    requiresApproval: d.requiresApproval,
    allowHalfDay: d.allowHalfDay,
    defaultDays: d.defaultDays,
    maxConsecutiveDays: d.maxConsecutiveDays ?? null,
    isActive: d.isActive,
    approvalChain: d.approvalChain,
  };
  try {
    const row = id ? await prisma.leaveType.update({ where: { id }, data }) : await prisma.leaveType.create({ data });
    await audit(actor.id, id ? "leavetype.update" : "leavetype.create", "LeaveType", row.id, { after: row });
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("A leave type with that name or code already exists");
    throw e;
  }
}

// ---------- Entitlements & balances ----------

export async function upsertEntitlement(actor: SessionUser, d: LeaveEntitlementInput) {
  const row = await prisma.leaveEntitlement.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId: d.employeeId, leaveTypeId: d.leaveTypeId, year: d.year } },
    create: { ...d, note: d.note ?? null },
    update: { entitledDays: d.entitledDays, carriedOver: d.carriedOver, adjustment: d.adjustment, note: d.note ?? null },
  });
  await audit(actor.id, "entitlement.upsert", "LeaveEntitlement", row.id, { after: row });
  return row;
}

/** Give every active employee an entitlement for a leave type/year. */
export async function bulkAssignEntitlements(actor: SessionUser, leaveTypeId: string, year: number, entitledDays: number, onlyMissing: boolean) {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] } },
    select: { id: true },
  });
  let count = 0;
  if (onlyMissing) {
    const res = await prisma.leaveEntitlement.createMany({
      data: employees.map((e) => ({ employeeId: e.id, leaveTypeId, year, entitledDays })),
      skipDuplicates: true,
    });
    count = res.count;
  } else {
    await prisma.$transaction(
      employees.map((e) =>
        prisma.leaveEntitlement.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId, year } },
          create: { employeeId: e.id, leaveTypeId, year, entitledDays },
          update: { entitledDays },
        }),
      ),
    );
    count = employees.length;
  }
  await audit(actor.id, "entitlement.bulk", "LeaveEntitlement", null, { after: { leaveTypeId, year, entitledDays, onlyMissing, count } });
  return count;
}

export async function getBalances(employeeId: string, year: number): Promise<LeaveBalance[]> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const [types, entitlements, usage] = await Promise.all([
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.leaveEntitlement.findMany({ where: { employeeId, year } }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId", "status"],
      where: { employeeId, status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: yearStart, lte: yearEnd } },
      _sum: { totalDays: true },
    }),
  ]);
  return types.map((t) => {
    const ent = entitlements.find((e) => e.leaveTypeId === t.id);
    const used = num(usage.find((u) => u.leaveTypeId === t.id && u.status === "APPROVED")?._sum.totalDays);
    const pending = num(usage.find((u) => u.leaveTypeId === t.id && u.status === "PENDING")?._sum.totalDays);
    const entitled = num(ent?.entitledDays);
    const carriedOver = num(ent?.carriedOver);
    const adjustment = num(ent?.adjustment);
    return {
      leaveTypeId: t.id,
      leaveTypeName: t.name,
      leaveTypeCode: t.code,
      color: t.color,
      year,
      entitled,
      carriedOver,
      adjustment,
      used,
      pending,
      available: entitled + carriedOver + adjustment - used - pending,
    };
  });
}

// ---------- Requests ----------

export const leaveRequestInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
      managerId: true,
      department: { select: { id: true, name: true } },
      user: { select: { id: true } },
      manager: { select: { id: true, firstName: true, lastName: true, preferredName: true, user: { select: { id: true } } } },
    },
  },
  leaveType: { select: { id: true, name: true, code: true, color: true, requiresApproval: true } },
  approver: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
} satisfies Prisma.LeaveRequestInclude;

export type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveRequestInclude }>;

export async function listLeaveRequests(q: LeaveListQuery, restrictTo: string[] | null) {
  const where: Prisma.LeaveRequestWhereInput = {
    ...(restrictTo ? { employeeId: { in: restrictTo } } : {}),
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {}),
    ...(q.departmentId ? { employee: { departmentId: q.departmentId } } : {}),
    ...(q.from ? { endDate: { gte: new Date(q.from) } } : {}),
    ...(q.to ? { startDate: { lte: new Date(q.to) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: leaveRequestInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.leaveRequest.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export async function getLeaveRequest(id: string) {
  const r = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      ...leaveRequestInclude,
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true, preferredName: true } } } } } },
    },
  });
  if (!r) throw notFound("Leave request");
  return r;
}

export type LeaveRequestDetail = Awaited<ReturnType<typeof getLeaveRequest>>;

type Decidable = { employeeId: string; status?: string; approvalChain: ApproverKind[]; currentLevel: number; employee: { managerId: string | null } };

/** Approver kind for the request's current level. Legacy rows with no chain behave as [MANAGER]. */
export const currentApprover = (r: Pick<Decidable, "approvalChain" | "currentLevel">): ApproverKind => r.approvalChain[r.currentLevel] ?? "MANAGER";

/**
 * Who may act on the current level. Never the requester.
 * MANAGER level: the direct manager (HR/Admin step in when there is no manager).
 * HR level: HR or Admin. ADMIN level: Admin. Admin may always override.
 */
export function canDecide(actor: SessionUser, r: Decidable) {
  if (r.employeeId === actor.employeeId) return false;
  if (actor.role === "ADMIN") return true;
  const kind = currentApprover(r);
  if (kind === "MANAGER") return r.employee.managerId ? r.employee.managerId === actor.employeeId || actor.role === "HR" : actor.role === "HR";
  if (kind === "HR") return actor.role === "HR";
  return false;
}

/** Users to notify for a given approval level. */
async function approverUserIds(kind: ApproverKind, managerUserId: string | null | undefined): Promise<string[]> {
  if (kind === "MANAGER" && managerUserId) return [managerUserId];
  const roles: ("HR" | "ADMIN")[] = kind === "ADMIN" ? ["ADMIN"] : ["HR", "ADMIN"];
  const users = await prisma.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function createLeaveRequest(actor: SessionUser, d: CreateLeaveRequestInput) {
  const employeeId = d.employeeId && isStaff(actor) ? d.employeeId : actor.employeeId;
  if (!employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE");

  const [type, employee] = await Promise.all([
    prisma.leaveType.findUnique({ where: { id: d.leaveTypeId } }),
    prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, preferredName: true, manager: { select: { user: { select: { id: true } } } } } }),
  ]);
  if (!type || !type.isActive) throw notFound("Leave type");
  if (!employee) throw notFound("Employee");
  if (!type.allowHalfDay && (d.startDayPart !== "FULL" || d.endDayPart !== "FULL")) throw new AppError("This leave type does not allow half days");

  const start = parseISODate(d.startDate);
  const end = parseISODate(d.endDate);
  const holidays = await holidayDatesFor(employeeId, start, end);
  const totalDays = countLeaveDays(d.startDate, d.endDate, d.startDayPart, d.endDayPart, { holidays });
  if (totalDays <= 0) throw new AppError("The selected dates contain no working days");
  if (type.maxConsecutiveDays && totalDays > type.maxConsecutiveDays) throw new AppError(`Maximum ${type.maxConsecutiveDays} consecutive day(s) for ${type.name}`);

  const overlap = await prisma.leaveRequest.findFirst({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true, startDate: true, endDate: true },
  });
  if (overlap) throw conflict("This overlaps an existing pending or approved request");

  const balance = (await getBalances(employeeId, start.getUTCFullYear())).find((b) => b.leaveTypeId === type.id);
  if (type.isPaid && balance && balance.available < totalDays) {
    throw new AppError(`Insufficient balance: ${balance.available} day(s) available, ${totalDays} requested`, "INSUFFICIENT_BALANCE");
  }

  const chain: ApproverKind[] = type.requiresApproval ? (type.approvalChain.length ? type.approvalChain : ["MANAGER"]) : [];
  const autoApprove = chain.length === 0;
  const request = await prisma.leaveRequest.create({
    data: {
      employeeId,
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
      startDayPart: d.startDayPart,
      endDayPart: d.endDayPart,
      totalDays,
      reason: d.reason ?? null,
      status: autoApprove ? "APPROVED" : "PENDING",
      decidedAt: autoApprove ? new Date() : null,
      approvalChain: chain,
      currentLevel: 0,
      events: {
        create: [
          { actorUserId: actor.id, action: "SUBMITTED", note: d.reason ?? null },
          ...(autoApprove ? [{ actorUserId: null, action: "APPROVED" as const, note: "Auto-approved (no approval required)" }] : []),
        ],
      },
    },
    include: leaveRequestInclude,
  });

  await audit(actor.id, "leave.create", "LeaveRequest", request.id, { after: request });
  if (!autoApprove) {
    for (const uid of await approverUserIds(chain[0]!, employee.manager?.user?.id)) {
      await notify(uid, `Leave request from ${fullName(employee)}`, `${type.name}: ${d.startDate} to ${d.endDate} (${totalDays} day${totalDays === 1 ? "" : "s"})`, `/leave/${request.id}`);
    }
  }
  return request;
}

export async function decideLeaveRequest(actor: SessionUser, id: string, d: DecideLeaveRequestInput) {
  const r = await getLeaveRequest(id);
  if (!canDecide(actor, r)) throw new AuthError("You cannot decide this request", 403);
  if (r.status !== "PENDING") throw new AppError(`Request is already ${r.status.toLowerCase()}`);

  const chain = r.approvalChain.length ? r.approvalChain : (["MANAGER"] as ApproverKind[]);
  const level = r.currentLevel;
  const advance = d.decision === "APPROVED" && level + 1 < chain.length;
  // Optimistic lock on currentLevel so two approvers at the same level cannot both advance it.
  const res = await prisma.leaveRequest.updateMany({
    where: { id, status: "PENDING", currentLevel: level },
    data: advance
      ? { currentLevel: level + 1 }
      : { status: d.decision, approverId: actor.employeeId, decidedAt: new Date(), decisionNote: d.note ?? null },
  });
  if (res.count === 0) throw conflict("Someone else just acted on this request. Refresh and try again.");
  await prisma.leaveRequestEvent.create({ data: { requestId: id, actorUserId: actor.id, action: d.decision, level: level + 1, note: d.note ?? null } });
  const updated = await getLeaveRequest(id);
  await audit(actor.id, `leave.${d.decision.toLowerCase()}`, "LeaveRequest", id, { before: { status: r.status, level }, after: { status: updated.status, level: updated.currentLevel, note: d.note } });

  if (advance) {
    const next = chain[level + 1]!;
    for (const uid of await approverUserIds(next, r.employee.manager?.user?.id)) {
      if (uid !== actor.id) await notify(uid, `Leave request from ${fullName(r.employee)} needs ${next === "MANAGER" ? "manager" : next} approval`, `Level ${level + 2} of ${chain.length}`, `/leave/${id}`);
    }
    await notify(r.employee.user?.id, `Leave request approved at level ${level + 1} of ${chain.length}`, "Waiting for the next approver", `/leave/${id}`);
    return updated;
  }
  await notify(
    r.employee.user?.id,
    `Leave request ${d.decision.toLowerCase()}`,
    `${r.leaveType.name} ${r.startDate.toISOString().slice(0, 10)} to ${r.endDate.toISOString().slice(0, 10)}${d.note ? `: ${d.note}` : ""}`,
    `/leave/${id}`,
  );
  return updated;
}

export async function cancelLeaveRequest(actor: SessionUser, id: string, note?: string) {
  const r = await getLeaveRequest(id);
  const own = r.employeeId === actor.employeeId;
  if (!own && !isStaff(actor)) throw new AuthError("Forbidden", 403);
  if (r.status === "CANCELLED" || r.status === "REJECTED") throw new AppError(`Request is already ${r.status.toLowerCase()}`);
  // Employees may cancel pending requests, or approved ones that have not started.
  if (own && !isStaff(actor) && r.status === "APPROVED" && r.startDate <= new Date()) {
    throw new AppError("Approved leave that has already started can only be cancelled by HR");
  }
  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), events: { create: { actorUserId: actor.id, action: "CANCELLED", note: note ?? null } } },
    include: leaveRequestInclude,
  });
  await audit(actor.id, "leave.cancel", "LeaveRequest", id, { before: { status: r.status } });
  if (!own) await notify(r.employee.user?.id, "Leave request cancelled by HR", note, `/leave/${id}`);
  else if (r.status === "APPROVED" || r.status === "PENDING") await notify(r.employee.manager?.user?.id, `${fullName(r.employee)} cancelled a leave request`, undefined, `/leave/${id}`);
  return updated;
}

export async function addLeaveComment(actor: SessionUser, id: string, note: string) {
  const r = await getLeaveRequest(id);
  if (r.employeeId !== actor.employeeId && !canDecide(actor, r)) throw new AuthError("Forbidden", 403);
  return prisma.leaveRequestEvent.create({ data: { requestId: id, actorUserId: actor.id, action: "COMMENTED", note } });
}

/** Approved + pending leave overlapping a date window, for the team calendar. */
export async function leaveInWindow(from: Date, to: Date, restrictTo: string[] | null) {
  return prisma.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: to },
      endDate: { gte: from },
      ...(restrictTo ? { employeeId: { in: restrictTo } } : {}),
    },
    include: leaveRequestInclude,
    orderBy: { startDate: "asc" },
  });
}

/** Requests whose *current* level the actor can decide. */
export async function pendingApprovalsFor(actor: SessionUser) {
  if (!isStaff(actor) && !actor.employeeId) return [];
  // ponytail: filter levels in JS; push into SQL if pending volume ever gets large.
  const rows = await prisma.leaveRequest.findMany({
    where: { status: "PENDING", ...(isStaff(actor) ? {} : { employee: { managerId: actor.employeeId } }) },
    include: leaveRequestInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.filter((r) => canDecide(actor, r));
}
