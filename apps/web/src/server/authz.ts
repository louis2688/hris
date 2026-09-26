import "server-only";
import { prisma, type Prisma } from "@hris/db";
import type { SessionUser } from "@hris/shared";
import { AuthError } from "./auth/session";

export const isStaff = (u: SessionUser) => u.role === "ADMIN" || u.role === "HR";

/** Can `u` view/act on employee `employeeId`? Self, staff, or direct manager. */
export async function canAccessEmployee(u: SessionUser, employeeId: string): Promise<boolean> {
  if (isStaff(u)) return true;
  if (u.employeeId === employeeId) return true;
  if (!u.employeeId) return false;
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  return e?.managerId === u.employeeId;
}

export async function assertAccessEmployee(u: SessionUser, employeeId: string) {
  if (!(await canAccessEmployee(u, employeeId))) throw new AuthError("Forbidden", 403);
}

/**
 * Employees `u` may see in lists, as a filter for the same query (no pre-query): null = everyone (staff).
 * Same rows as visibleEmployeeIds. Use as `where: { ...scopeWhere(u) }` or `employee: scopeWhere(u)`; don't spread next to another top-level OR.
 */
export function scopeWhere(u: SessionUser): Prisma.EmployeeWhereInput | null {
  if (isStaff(u)) return null;
  if (!u.employeeId) return { id: { in: [] } };
  return { OR: [{ id: u.employeeId }, { managerId: u.employeeId, deletedAt: null }] };
}

/** Employee ids `u` may see in lists: null = everyone (staff). Prefer scopeWhere; this costs a round trip. */
export async function visibleEmployeeIds(u: SessionUser): Promise<string[] | null> {
  if (isStaff(u)) return null;
  if (!u.employeeId) return [];
  const reports = await prisma.employee.findMany({ where: { managerId: u.employeeId, deletedAt: null }, select: { id: true } });
  return [u.employeeId, ...reports.map((r) => r.id)];
}
