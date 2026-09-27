import "server-only";
import { prisma, Prisma } from "@hris/db";
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  EmployeeSelfUpdateInput,
  EmergencyContactInput,
  SessionUser,
  UpdateEmployeeInput,
  UpdateUserAccountInput,
} from "@hris/shared";
import { AuthError, hashPassword } from "../auth/session";
import { audit } from "./audit";
import { AppError, conflict, notFound } from "./errors";
import { startDefaultChecklist } from "./onboarding";
import { offboardingHook, recordDirectEdit, recordHire } from "./employment-events";
import { toJson, type CustomValues } from "./custom-fields";

/** Checklist hooks run after the employee write commits; a failure here must not fail the save. */
const startChecklistSafe = (...a: Parameters<typeof startDefaultChecklist>) => startDefaultChecklist(...a).catch((e) => console.error("checklist start failed", e));
/** Event rows are history; a failure here must not fail the save either. */
const safe = (p: Promise<unknown>) => p.catch((e) => console.error("employment event failed", e));

export const employeeSummarySelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  workEmail: true,
  avatarUrl: true,
  employmentStatus: true,
  employmentType: true,
  hireDate: true,
  department: { select: { id: true, name: true } },
  jobTitle: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
  user: { select: { id: true, email: true, role: true, isActive: true } },
} satisfies Prisma.EmployeeSelect;

export type EmployeeSummary = Prisma.EmployeeGetPayload<{ select: typeof employeeSummarySelect }>;

export const fullName = (e: { firstName: string; lastName: string; preferredName?: string | null }) =>
  `${e.preferredName ?? e.firstName} ${e.lastName}`;

const toDate = (s?: string) => (s ? new Date(s) : null);

export async function listEmployees(q: EmployeeListQuery, restrictTo: string[] | null) {
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    ...(restrictTo ? { id: { in: restrictTo } } : {}),
    ...(q.departmentId ? { departmentId: q.departmentId } : {}),
    ...(q.status ? { employmentStatus: q.status } : {}),
    ...(q.managerId ? { managerId: q.managerId } : {}),
    ...(q.q
      ? {
          OR: [
            { firstName: { contains: q.q, mode: "insensitive" } },
            { lastName: { contains: q.q, mode: "insensitive" } },
            { preferredName: { contains: q.q, mode: "insensitive" } },
            { employeeCode: { contains: q.q, mode: "insensitive" } },
            { workEmail: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] =
    q.sort === "code"
      ? [{ employeeCode: q.dir }, { id: "asc" }]
      : q.sort === "hireDate"
        ? [{ hireDate: q.dir }, { id: "asc" }]
        : q.sort === "department"
          ? [{ department: { name: q.dir } }, { lastName: "asc" }, { id: "asc" }]
          : [{ lastName: q.dir }, { firstName: q.dir }, { id: "asc" }];

  const [items, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: employeeSummarySelect }),
    prisma.employee.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export async function getEmployee(id: string) {
  const e = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      department: true,
      jobTitle: true,
      location: true,
      manager: { select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true } },
      reports: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, preferredName: true, jobTitle: { select: { name: true } } } },
      emergencyContacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      user: { select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true } },
    },
  });
  if (!e) throw notFound("Employee");
  return e;
}

export type EmployeeDetail = Awaited<ReturnType<typeof getEmployee>>;

/** HR-internal: never leaves the server for non-staff. */
const HR_ONLY = ["notes", "customFields"] as const;
/** Pay, government IDs and bank details: the employee themselves and HR/Admin only. */
const OWNER_ONLY = ["basicPay", "allowance", "payType", "tin", "sssNo", "philhealthNo", "pagibigNo", "bankName", "bankAccountNo", "biometricId"] as const;

/** Strip fields the viewer may not read (JSON APIs return the whole row; the web pages pick fields themselves). */
export function employeeForViewer<T extends { id: string }>(u: SessionUser, e: T): Partial<T> {
  if (u.role === "ADMIN" || u.role === "HR") return e;
  const drop = new Set<string>([...HR_ONLY, ...(e.id === u.employeeId ? [] : OWNER_ONLY)]);
  return Object.fromEntries(Object.entries(e).filter(([k]) => !drop.has(k))) as Partial<T>;
}

/** Active employees for dropdowns (manager picker etc). */
export async function employeeOptions() {
  return prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true },
  });
}

function jobData(d: UpdateEmployeeInput) {
  return {
    employeeCode: d.employeeCode,
    departmentId: d.departmentId ?? null,
    jobTitleId: d.jobTitleId ?? null,
    locationId: d.locationId ?? null,
    managerId: d.managerId ?? null,
    shiftId: d.shiftId ?? null,
    biometricId: d.biometricId ?? null,
    employmentType: d.employmentType,
    employmentStatus: d.employmentStatus,
    hireDate: new Date(d.hireDate),
    terminationDate: toDate(d.terminationDate),
    notes: d.notes ?? null,
  };
}

function personalData(d: UpdateEmployeeInput) {
  return {
    firstName: d.firstName,
    middleName: d.middleName ?? null,
    lastName: d.lastName,
    preferredName: d.preferredName ?? null,
    gender: d.gender,
    dateOfBirth: toDate(d.dateOfBirth),
    maritalStatus: d.maritalStatus ?? null,
    nationality: d.nationality ?? null,
  };
}

function contactData(d: EmployeeSelfUpdateInput) {
  return {
    workEmail: d.workEmail ?? null,
    personalEmail: d.personalEmail ?? null,
    phone: d.phone ?? null,
    mobile: d.mobile ?? null,
    addressLine1: d.addressLine1 ?? null,
    addressLine2: d.addressLine2 ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    postalCode: d.postalCode ?? null,
    country: d.country ?? null,
  };
}

export async function createEmployee(actor: SessionUser, d: CreateEmployeeInput, customFields?: CustomValues) {
  if (await prisma.employee.findUnique({ where: { employeeCode: d.employeeCode } })) throw conflict("Employee ID already in use");
  if (d.managerId === "") d.managerId = undefined;

  const loginEmail = d.createAccount ? (d.loginEmail ?? d.workEmail) : undefined;
  // Roles are an admin power (updateUserAccount is ADMIN-only); HR must not mint admin logins via create / hire.
  if (d.createAccount && d.role === "ADMIN" && actor.role !== "ADMIN") throw new AuthError("Only an admin can create admin accounts", 403);
  if (d.createAccount) {
    if (!loginEmail) throw new AppError("A login email is required to create an account");
    if (await prisma.user.findUnique({ where: { email: loginEmail } })) throw conflict("Login email already in use");
  }
  const initialPassword = d.initialPassword ?? generatePassword();

  const employee = await prisma.$transaction(async (tx) => {
    const user =
      d.createAccount && loginEmail
        ? await tx.user.create({ data: { email: loginEmail, passwordHash: await hashPassword(initialPassword), role: d.role }, select: { id: true } })
        : null;
    return tx.employee.create({
      data: { ...personalData(d), ...contactData(d), ...jobData(d), userId: user?.id ?? null, ...(customFields ? { customFields: toJson(customFields) } : {}) },
      select: employeeSummarySelect,
    });
  });

  // Default entitlements for the current year from each active leave type.
  const year = new Date().getUTCFullYear();
  const types = await prisma.leaveType.findMany({ where: { isActive: true, defaultDays: { gt: 0 } } });
  if (types.length) {
    await prisma.leaveEntitlement.createMany({
      data: types.map((t) => ({ employeeId: employee.id, leaveTypeId: t.id, year, entitledDays: t.defaultDays })),
      skipDuplicates: true,
    });
  }

  await audit(actor.id, "employee.create", "Employee", employee.id, { after: employee });
  await safe(recordHire(actor.id, { ...jobIds(employee), id: employee.id, deletedAt: null, hireDate: employee.hireDate }));
  await startChecklistSafe(actor.id, employee.id, "ONBOARDING");
  return { employee, initialPassword: d.createAccount ? initialPassword : null };
}

const jobIds = (e: EmployeeSummary) => ({
  jobTitleId: e.jobTitle?.id ?? null,
  departmentId: e.department?.id ?? null,
  locationId: e.location?.id ?? null,
  managerId: e.manager?.id ?? null,
  employmentStatus: e.employmentStatus,
});

export async function updateEmployee(actor: SessionUser, id: string, d: UpdateEmployeeInput, customFields?: CustomValues) {
  const before = await getEmployee(id);
  if (d.managerId === id) throw new AppError("An employee cannot report to themselves");
  if (d.employeeCode !== before.employeeCode) {
    if (await prisma.employee.findUnique({ where: { employeeCode: d.employeeCode } })) throw conflict("Employee ID already in use");
  }
  if (d.biometricId && d.biometricId !== before.biometricId && (await prisma.employee.findUnique({ where: { biometricId: d.biometricId } }))) {
    throw conflict("That biometric ID is already assigned to another employee");
  }
  const after = await prisma.employee.update({
    where: { id },
    data: { ...personalData(d), ...contactData(d), ...jobData(d), ...(customFields ? { customFields: toJson(customFields) } : {}) },
    select: employeeSummarySelect,
  });
  await audit(actor.id, "employee.update", "Employee", id, { before, after });
  const b = { id, deletedAt: null, jobTitleId: before.jobTitleId, departmentId: before.departmentId, locationId: before.locationId, managerId: before.managerId, employmentStatus: before.employmentStatus };
  await safe(recordDirectEdit(actor.id, b, { ...jobIds(after), id, deletedAt: null }));
  await offboardingHook(actor.id, id, before.employmentStatus, after.employmentStatus);
  return after;
}

export async function updateSelf(actor: SessionUser, d: EmployeeSelfUpdateInput) {
  if (!actor.employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE", 400);
  const after = await prisma.employee.update({
    where: { id: actor.employeeId },
    data: { ...contactData(d), preferredName: d.preferredName ?? null, maritalStatus: d.maritalStatus ?? null },
  });
  await audit(actor.id, "employee.self_update", "Employee", actor.employeeId, { after: d });
  return after;
}

export async function softDeleteEmployee(actor: SessionUser, id: string) {
  const e = await getEmployee(id);
  await prisma.$transaction([
    prisma.employee.update({ where: { id }, data: { deletedAt: new Date(), employmentStatus: "TERMINATED" } }),
    ...(e.user ? [prisma.user.update({ where: { id: e.user.id }, data: { isActive: false } })] : []),
    prisma.employee.updateMany({ where: { managerId: id }, data: { managerId: null } }),
  ]);
  await audit(actor.id, "employee.delete", "Employee", id, { before: e });
}

export async function upsertEmergencyContact(actor: SessionUser, employeeId: string, d: EmergencyContactInput) {
  const data = { name: d.name, relationship: d.relationship, phone: d.phone, isPrimary: d.isPrimary };
  if (d.isPrimary) await prisma.emergencyContact.updateMany({ where: { employeeId }, data: { isPrimary: false } });
  const row = d.id
    ? await prisma.emergencyContact.update({ where: { id: d.id, employeeId }, data })
    : await prisma.emergencyContact.create({ data: { ...data, employeeId } });
  await audit(actor.id, "employee.emergency_contact", "Employee", employeeId, { after: row });
  return row;
}

export async function deleteEmergencyContact(actor: SessionUser, employeeId: string, contactId: string) {
  await prisma.emergencyContact.delete({ where: { id: contactId, employeeId } });
  await audit(actor.id, "employee.emergency_contact_delete", "Employee", employeeId, { before: { contactId } });
}

export async function updateUserAccount(actor: SessionUser, employeeId: string, d: UpdateUserAccountInput) {
  const e = await getEmployee(employeeId);
  if (!e.user) throw notFound("User account");
  if (e.user.id === actor.id && (d.role !== actor.role || !d.isActive)) {
    throw new AppError("You cannot change your own role or deactivate yourself");
  }
  const after = await prisma.user.update({
    where: { id: e.user.id },
    data: { role: d.role, isActive: d.isActive, ...(d.resetPassword ? { passwordHash: await hashPassword(d.resetPassword) } : {}) },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (d.resetPassword) await prisma.refreshToken.updateMany({ where: { userId: e.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(actor.id, "user.update", "User", e.user.id, { before: e.user, after });
  return after;
}

export async function createUserAccount(actor: SessionUser, employeeId: string, email: string, role: UpdateUserAccountInput["role"], password?: string) {
  const e = await getEmployee(employeeId);
  if (e.user) throw conflict("Employee already has an account");
  if (await prisma.user.findUnique({ where: { email } })) throw conflict("Login email already in use");
  const pw = password ?? generatePassword();
  const user = await prisma.user.create({
    data: { email, role, passwordHash: await hashPassword(pw), employee: { connect: { id: employeeId } } },
    select: { id: true, email: true, role: true },
  });
  await audit(actor.id, "user.create", "User", user.id, { after: user });
  return { user, initialPassword: pw };
}

export function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}
