"use server";

import { revalidatePath } from "next/cache";
import { departmentSchema, holidaySchema, jobTitleSchema, locationSchema } from "@hris/shared";
import { requireRole } from "../auth/session";
import * as org from "../services/org";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");

export async function saveDepartmentAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(departmentSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await org.saveDepartment(actor, p.data, id)), "Saved");
  revalidatePath("/settings/departments");
  return r;
}
export async function deleteDepartmentAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => org.deleteDepartment(actor, id), "Deleted");
  revalidatePath("/settings/departments");
  return r;
}

export async function saveJobTitleAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(jobTitleSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await org.saveJobTitle(actor, p.data, id)), "Saved");
  revalidatePath("/settings/job-titles");
  return r;
}
export async function deleteJobTitleAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => org.deleteJobTitle(actor, id), "Deleted");
  revalidatePath("/settings/job-titles");
  return r;
}

export async function saveLocationAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(locationSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await org.saveLocation(actor, p.data, id)), "Saved");
  revalidatePath("/settings/locations");
  return r;
}
export async function deleteLocationAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => org.deleteLocation(actor, id), "Deleted");
  revalidatePath("/settings/locations");
  return r;
}

export async function saveHolidayAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(holidaySchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await org.saveHoliday(actor, p.data, id)), "Saved");
  revalidatePath("/settings/holidays");
  return r;
}
export async function deleteHolidayAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => org.deleteHoliday(actor, id), "Deleted");
  revalidatePath("/settings/holidays");
  return r;
}
