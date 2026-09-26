import "server-only";
import { prisma } from "@hris/db";
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

/** Employee ids `u` may see in lists: null = everyone (staff). */
export async function visibleEmployeeIds(u: SessionUser): Promise<string[] | null> {
  if (isStaff(u)) return null;
  if (!u.employeeId) return [];
  const reports = await prisma.employee.findMany({ where: { managerId: u.employeeId, deletedAt: null }, select: { id: true } });
  return [u.employeeId, ...reports.map((r) => r.id)];
}
