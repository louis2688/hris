"use server";

import { revalidatePath } from "next/cache";
import { benefitPlanSchema, enrollmentSchema } from "@hris/shared";
import { requireRole } from "../auth/session";
import * as benefits from "../services/benefits";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");
const refresh = () => revalidatePath("/benefits", "layout");

export async function savePlanAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(benefitPlanSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => benefits.savePlan(actor, p.data, id), "Plan saved");
  refresh();
  return r;
}

export async function deletePlanAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => benefits.deletePlan(actor, id), "Plan deleted");
  refresh();
  return r;
}

export async function saveEnrollmentAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(enrollmentSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => benefits.saveEnrollment(actor, p.data, id), id ? "Enrollment updated" : "Employee enrolled");
  refresh();
  return r;
}

export async function deleteEnrollmentAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => benefits.deleteEnrollment(actor, id), "Enrollment removed");
  refresh();
  return r;
}
