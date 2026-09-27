"use server";

import { revalidatePath } from "next/cache";
import { blockDateSchema, compOffSchema, correctionSchema, decisionSchema, encashmentSchema, importSchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import * as t from "../services/timeoff";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const touch = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));
const decision = (fd: FormData) => parse(decisionSchema, formToObject(fd));
const verb = (d: string) => (d === "APPROVED" ? "approved" : "rejected");

// ---------- Corrections ----------

export async function createCorrectionAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(correctionSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await t.createCorrection(u, p.data)), "Correction sent for approval");
  touch("/attendance/corrections", "/attendance");
  return r;
}

export async function decideCorrectionAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = decision(fd);
  if ("error" in p) return p.error;
  const r = await run(async () => void (await t.decideCorrection(u, id, p.data)), `Correction ${verb(p.data.decision)}`);
  touch("/attendance/corrections", "/attendance");
  return r;
}

export async function cancelCorrectionAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => t.cancelCorrection(u, id), "Correction withdrawn");
  touch("/attendance/corrections", "/attendance");
  return r;
}

// ---------- Comp-off & encashment ----------

export async function createCompOffAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(compOffSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await t.createCompOff(u, p.data)), "Comp-off request sent");
  touch("/me/leave", "/leave");
  return r;
}

export async function decideCompOffAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = decision(fd);
  if ("error" in p) return p.error;
  const r = await run(() => t.decideCompOff(u, id, p.data), `Comp-off ${verb(p.data.decision)}`);
  touch("/me/leave", "/leave");
  return r;
}

export async function createEncashmentAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(encashmentSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await t.createEncashment(u, p.data)), "Encashment request sent to HR");
  touch("/me/leave", "/leave");
  return r;
}

export async function decideEncashmentAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireRole("HR", "ADMIN");
  const p = decision(fd);
  if ("error" in p) return p.error;
  const r = await run(() => t.decideEncashment(u, id, p.data), p.data.decision === "APPROVED" ? "Approved - added to payroll" : "Encashment rejected");
  touch("/me/leave", "/leave", "/payroll");
  return r;
}

export async function cancelCreditAction(kind: "compoff" | "encashment", id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => t.cancelOwn(u, kind, id), "Request withdrawn");
  touch("/me/leave");
  return r;
}

// ---------- Block dates ----------

export async function saveBlockDateAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireRole("HR", "ADMIN");
  const p = parse(blockDateSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await t.saveBlockDate(u, p.data, id)), "Saved");
  touch("/settings/leave-policies", "/leave/calendar");
  return r;
}

export async function deleteBlockDateAction(id: string): Promise<ActionResult> {
  const u = await requireRole("HR", "ADMIN");
  const r = await run(() => t.deleteBlockDate(u, id), "Deleted");
  touch("/settings/leave-policies", "/leave/calendar");
  return r;
}

// ---------- Import ----------

type Preview = Awaited<ReturnType<typeof t.resolveImport>>;

export async function previewImportAction(text: string): Promise<ActionResult<Omit<Preview, "punches"> & { valid: number }>> {
  await requireRole("HR", "ADMIN");
  const p = importSchema.safeParse({ text });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid file" };
  return run(async () => {
    const { punches, ...rest } = await t.resolveImport(p.data.text);
    return { ...rest, valid: punches.length };
  });
}

export async function commitImportAction(text: string): Promise<ActionResult<{ inserted: number; skipped: number; errors: number }>> {
  const u = await requireRole("HR", "ADMIN");
  const p = importSchema.safeParse({ text });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid file" };
  const r = await run(() => t.commitImport(u, p.data.text));
  touch("/attendance", "/attendance/team");
  return r.ok ? { ...r, message: `${r.data.inserted} punch${r.data.inserted === 1 ? "" : "es"} imported` } : r;
}
