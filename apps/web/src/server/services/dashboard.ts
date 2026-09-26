import "server-only";
import { prisma } from "@hris/db";
import type { SessionUser } from "@hris/shared";
import { isStaff, scopeWhere } from "../authz";
import { leaveRequestInclude } from "./leave";

export async function dashboardStats(actor: SessionUser) {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const in30 = new Date(utcToday.getTime() + 30 * 86400000);
  const scope = scopeWhere(actor);
  const empWhere = { deletedAt: null as null, ...scope };
  const reqScope = scope ? { employee: scope } : {};
  // Team stats only render for MANAGER/HR/ADMIN; employees just get "who is out" + notifications.
  const manager = actor.role !== "EMPLOYEE";

  const [byStatus, byDepartment, leave, pending, recentHires, notifications] = await Promise.all([
    manager ? prisma.employee.groupBy({ by: ["employmentStatus"], where: empWhere, _count: { _all: true } }) : Promise.resolve([]),
    isStaff(actor)
      ? prisma.department.findMany({ select: { id: true, name: true, _count: { select: { employees: { where: { deletedAt: null } } } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    // ponytail: today + next 30 days in one query, upcoming capped in JS; split again if approved leave per month runs into the thousands.
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: in30 }, endDate: { gte: utcToday }, ...reqScope },
      include: leaveRequestInclude,
      orderBy: { startDate: "asc" },
    }),
    manager ? prisma.leaveRequest.count({ where: { status: "PENDING", ...reqScope } }) : Promise.resolve(0),
    manager
      ? prisma.employee.findMany({
          where: { ...empWhere, hireDate: { gte: new Date(utcToday.getTime() - 90 * 86400000) } },
          select: { id: true, firstName: true, lastName: true, preferredName: true, hireDate: true, jobTitle: { select: { name: true } } },
          orderBy: { hireDate: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
    prisma.notification.findMany({ where: { userId: actor.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const headcount = byStatus.reduce((n, b) => n + b._count._all, 0);
  const onLeaveToday = leave.filter((r) => r.startDate <= utcToday);
  const upcoming = leave.filter((r) => r.startDate > utcToday).slice(0, 8);

  return { headcount, byStatus, byDepartment, onLeaveToday, pending, upcoming, recentHires, notifications };
}
