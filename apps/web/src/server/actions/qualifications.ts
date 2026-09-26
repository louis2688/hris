"use server";

import { revalidatePath } from "next/cache";
import { employeeQualificationSchema, nationalitySchema, qualificationSchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import { isStaff } from "../authz";
import * as q from "../services/qualifications";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");

export async function saveQualificationAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(qualificationSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await q.saveQualification(actor, p.data, id)), "Saved");
  revalidatePath("/settings/qualifications");
  return r;
}

export async function deleteQualificationAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => q.deleteQualification(actor, id), "Deleted");
  revalidatePath("/settings/qualifications");
  return r;
}

export async function saveNationalityAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(nationalitySchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await q.saveNationality(actor, p.data.name, id)), "Saved");
  revalidatePath("/settings/qualifications");
  return r;
}

export async function deleteNationalityAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => q.deleteNationality(actor, id), "Deleted");
  revalidatePath("/settings/qualifications");
  return r;
}

/** Employees manage their own; HR/Admin manage anyone's. */
async function canEdit(employeeId: string) {
  const actor = await requireSession();
  return actor.employeeId === employeeId || isStaff(actor) ? actor : null;
}

export async function saveEmployeeQualificationAction(employeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await canEdit(employeeId);
  if (!actor) return { ok: false, error: "Forbidden" };
  const p = parse(employeeQualificationSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await q.saveEmployeeQualification(actor, employeeId, p.data)), "Saved");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/me");
  return r;
}

export async function deleteEmployeeQualificationAction(employeeId: string, id: string): Promise<ActionResult> {
  const actor = await canEdit(employeeId);
  if (!actor) return { ok: false, error: "Forbidden" };
  const r = await run(() => q.deleteEmployeeQualification(actor, employeeId, id), "Removed");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/me");
  return r;
}
