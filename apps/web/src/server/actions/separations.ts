"use server";

import { revalidatePath } from "next/cache";
import { exitInterviewSchema, finalPaySchema, startSeparationSchema } from "@hris/shared";
import { requireRole } from "../auth/session";
import * as sep from "../services/separations";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");
const refresh = (id?: string) => {
  revalidatePath("/separations");
  if (id) revalidatePath(`/separations/${id}`);
  revalidatePath("/payroll");
};

export async function startSeparationAction(_p: ActionResult<{ id: string }> | undefined, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await staff();
  const p = parse(startSeparationSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => ({ id: (await sep.startSeparation(actor, p.data)).id }), "Separation started");
  refresh();
  return r;
}

export async function saveExitInterviewAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(exitInterviewSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => sep.saveExitInterview(actor, id, p.data), "Exit interview saved");
  refresh(id);
  return r;
}

export async function computeFinalPayAction(id: string, _p: ActionResult<{ runId: string }> | undefined, fd: FormData): Promise<ActionResult<{ runId: string }>> {
  const actor = await staff();
  const p = parse(finalPaySchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => ({ runId: await sep.computeFinalPayRun(actor, id, p.data) }), "Final pay computed");
  refresh(id);
  return r;
}

export async function startOffboardingAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => sep.startOffboarding(actor, id), "Offboarding checklist started");
  refresh(id);
  return r;
}

export async function completeSeparationAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => sep.completeSeparation(actor, id), "Separation completed. The login has been deactivated.");
  refresh(id);
  return r;
}

export async function cancelSeparationAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => sep.cancelSeparation(actor, id), "Separation cancelled");
  refresh(id);
  return r;
}
