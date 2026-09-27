"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEmployeeSchema,
  emergencyContactSchema,
  employeeSelfUpdateSchema,
  updateEmployeeSchema,
  updateUserAccountSchema,
  ROLES,
} from "@hris/shared";
import { z } from "zod";
import { requireRole, requireSession } from "../auth/session";
import { assertAccessEmployee, isStaff } from "../authz";
import * as svc from "../services/employees";
import { parseCustomFields } from "../services/custom-fields";
import { prisma } from "@hris/db";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

export async function createEmployeeAction(_p: ActionResult<{ id: string; initialPassword: string | null }> | undefined, fd: FormData): Promise<ActionResult<{ id: string; initialPassword: string | null }>> {
  const actor = await requireRole("ADMIN", "HR");
  const raw = bools(formToObject(fd), ["createAccount"]);
  const p = parse(createEmployeeSchema, raw);
  const cf = await parseCustomFields(raw, {});
  if ("error" in p || cf.fieldErrors) return mergeErrors(p, cf.fieldErrors);
  const res = await run(() => svc.createEmployee(actor, p.data, cf.values));
  if (!res.ok) return res;
  revalidatePath("/employees");
  return { ok: true, data: { id: res.data.employee.id, initialPassword: res.data.initialPassword }, message: "Employee created" };
}

export async function updateEmployeeAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "HR");
  const raw = formToObject(fd);
  const p = parse(updateEmployeeSchema, raw);
  const cur = await prisma.employee.findUnique({ where: { id }, select: { customFields: true } });
  const cf = await parseCustomFields(raw, cur?.customFields);
  if ("error" in p || cf.fieldErrors) return mergeErrors(p, cf.fieldErrors);
  const res = await run(async () => {
    await svc.updateEmployee(actor, id, p.data, cf.values);
  }, "Saved");
  revalidatePath(`/employees/${id}`);
  revalidatePath("/employees");
  return res;
}

/** Standard + custom field errors in one response so the form highlights both. */
function mergeErrors(p: { error: ActionResult<never> } | { data: unknown }, cfErrors?: Record<string, string[]>): ActionResult<never> {
  const base = "error" in p && !p.error.ok ? p.error.fieldErrors : undefined;
  return { ok: false, error: "Please fix the highlighted fields", fieldErrors: { ...base, ...cfErrors } };
}

export async function updateSelfAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const p = parse(employeeSelfUpdateSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const res = await run(async () => {
    await svc.updateSelf(actor, p.data);
  }, "Saved");
  revalidatePath("/me");
  return res;
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "HR");
  const res = await run(() => svc.softDeleteEmployee(actor, id));
  if (!res.ok) return res;
  revalidatePath("/employees");
  redirect("/employees");
}

export async function saveEmergencyContactAction(employeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  // Self or staff (managers cannot edit reports' contacts).
  if (actor.employeeId !== employeeId && !isStaff(actor)) return { ok: false, error: "Forbidden" };
  const p = parse(emergencyContactSchema, bools(formToObject(fd), ["isPrimary"]));
  if ("error" in p) return p.error;
  const res = await run(async () => {
    await svc.upsertEmergencyContact(actor, employeeId, p.data);
  }, "Contact saved");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/me");
  return res;
}

export async function deleteEmergencyContactAction(employeeId: string, contactId: string): Promise<ActionResult> {
  const actor = await requireSession();
  if (actor.employeeId !== employeeId && !isStaff(actor)) return { ok: false, error: "Forbidden" };
  const res = await run(() => svc.deleteEmergencyContact(actor, employeeId, contactId), "Contact removed");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/me");
  return res;
}

export async function updateUserAccountAction(employeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireRole("ADMIN");
  const p = parse(updateUserAccountSchema, bools(formToObject(fd), ["isActive"]));
  if ("error" in p) return p.error;
  const res = await run(async () => {
    await svc.updateUserAccount(actor, employeeId, p.data);
  }, "Account updated");
  revalidatePath(`/employees/${employeeId}`);
  return res;
}

const createAccountSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(ROLES),
  password: z.string().min(8).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});

export async function createUserAccountAction(employeeId: string, _p: ActionResult<{ initialPassword: string }> | undefined, fd: FormData): Promise<ActionResult<{ initialPassword: string }>> {
  const actor = await requireRole("ADMIN");
  const p = parse(createAccountSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const res = await run(() => svc.createUserAccount(actor, employeeId, p.data.email, p.data.role, p.data.password));
  if (!res.ok) return res;
  revalidatePath(`/employees/${employeeId}`);
  return { ok: true, data: { initialPassword: res.data.initialPassword }, message: "Account created" };
}

export async function assertCanView(employeeId: string) {
  const actor = await requireSession();
  await assertAccessEmployee(actor, employeeId);
  return actor;
}
