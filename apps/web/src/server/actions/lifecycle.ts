"use server";

import { revalidatePath } from "next/cache";
import {
  closeCaseSchema,
  createCaseSchema,
  customFieldDefSchema,
  caseDecisionSchema,
  caseExplanationSchema,
  caseHearingSchema,
  issueNteSchema,
  recordChangeSchema,
} from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import * as events from "../services/employment-events";
import * as cases from "../services/cases";
import * as cf from "../services/custom-fields";
import { acknowledge } from "../services/documents";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");

// ---------- Employment events ----------

export async function recordChangeAction(employeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(recordChangeSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const res = await run(() => events.recordChange(actor, employeeId, p.data));
  if (!res.ok) return res;
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
  return { ok: true, data: undefined, message: res.data.applied ? "Change recorded" : "Change scheduled" };
}

export async function cancelScheduledAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const res = await run(() => events.cancelScheduled(actor, id), "Scheduled change cancelled");
  if (res.ok) revalidatePath(`/employees/${res.data}`);
  return res.ok ? { ok: true, data: undefined, message: res.message } : res;
}

// ---------- Custom fields ----------

export async function saveCustomFieldAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(customFieldDefSchema, bools(formToObject(fd), ["required", "isActive"]));
  if ("error" in p) return p.error;
  const res = await run(async () => void (await cf.saveFieldDef(actor, id, p.data)), "Field saved");
  revalidatePath("/settings/custom-fields");
  return res;
}

export async function deactivateCustomFieldAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const res = await run(() => cf.deactivateFieldDef(actor, id), "Field deactivated. Existing values are kept.");
  revalidatePath("/settings/custom-fields");
  return res;
}

// ---------- Cases ----------

const caseDone = (id: string, message: string) => (res: ActionResult<unknown>): ActionResult => {
  revalidatePath(`/cases/${id}`);
  revalidatePath("/cases");
  return res.ok ? { ok: true, data: undefined, message } : res;
};

export async function createCaseAction(_p: ActionResult<{ id: string }> | undefined, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await staff();
  const p = parse(createCaseSchema, bools(formToObject(fd), ["confidential"]));
  if ("error" in p) return p.error;
  const res = await run(async () => ({ id: (await cases.createCase(actor, p.data)).id }), "Case opened");
  revalidatePath("/cases");
  return res;
}

export async function issueNteAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(issueNteSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return caseDone(id, "Notice to Explain issued")(await run(() => cases.issueNte(actor, id, p.data)));
}

export async function scheduleHearingAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(caseHearingSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return caseDone(id, "Hearing scheduled")(await run(() => cases.scheduleHearing(actor, id, p.data)));
}

export async function decideCaseAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(caseDecisionSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return caseDone(id, "Decision recorded")(await run(() => cases.decide(actor, id, p.data)));
}

export async function closeCaseAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(closeCaseSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return caseDone(id, "Case closed")(await run(() => cases.closeCase(actor, id, p.data.note)));
}

export async function addCaseDocumentAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a file to upload" };
  return caseDone(id, "Uploaded")(await run(() => cases.addCaseDocument(actor, id, file)));
}

/** Employee answers their own NTE from /me. */
export async function submitExplanationAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const p = parse(caseExplanationSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const res = await run(() => cases.submitExplanation(actor, id, p.data.explanation), "Explanation submitted");
  revalidatePath("/me");
  return res;
}

// ---------- Documents ----------

export async function acknowledgeDocumentAction(id: string): Promise<ActionResult> {
  const actor = await requireSession();
  const res = await run(async () => void (await acknowledge(actor, id)), "Acknowledged");
  revalidatePath("/me");
  return res;
}
