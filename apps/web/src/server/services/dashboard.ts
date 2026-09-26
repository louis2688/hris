import "server-only";
import { prisma } from "@hris/db";
import type { SessionUser } from "@hris/shared";
import { isStaff, visibleEmployeeIds } from "../authz";
import { leaveRequestInclude } from "./leave";

export async function dashboardStats(actor: SessionUser) {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const in30 = new Date(utcToday.getTime() + 30 * 86400000);
  const scope = await visibleEmployeeIds(actor);
  const empWhere = { deletedAt: null as null, ...(scope ? { id: { in: scope } } : {}) };
  const reqScope = scope ? { employeeId: { in: scope } } : {};

  const [headcount, byStatus, byDepartment, onLeaveToday, pending, upcoming, recentHires, notifications] = await Promise.all([
    prisma.employee.count({ where: empWhere }),
    prisma.employee.groupBy({ by: ["employmentStatus"], where: empWhere, _count: { _all: true } }),
    isStaff(actor)
      ? prisma.department.findMany({ select: { id: true, name: true, _count: { select: { employees: { where: { deletedAt: null } } } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: utcToday }, endDate: { gte: utcToday }, ...reqScope },
      include: leaveRequestInclude,
      orderBy: { startDate: "asc" },
    }),
    prisma.leaveRequest.count({ where: { status: "PENDING", ...reqScope } }),
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { gt: utcToday, lte: in30 }, ...reqScope },
      include: leaveRequestInclude,
      orderBy: { startDate: "asc" },
      take: 8,
    }),
    prisma.employee.findMany({
      where: { ...empWhere, hireDate: { gte: new Date(utcToday.getTime() - 90 * 86400000) } },
      select: { id: true, firstName: true, lastName: true, preferredName: true, hireDate: true, jobTitle: { select: { name: true } } },
      orderBy: { hireDate: "desc" },
      take: 6,
    }),
    prisma.notification.findMany({ where: { userId: actor.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return { headcount, byStatus, byDepartment, onLeaveToday, pending, upcoming, recentHires, notifications };
}
