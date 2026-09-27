"use server";

import { revalidatePath } from "next/cache";
import { adhocTaskSchema, announcementSchema, assetSchema, checklistItemSchema, checklistTemplateSchema, startChecklistSchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import * as ann from "../services/announcements";
import * as onb from "../services/onboarding";
import * as assets from "../services/assets";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");

// ---------- Announcements ----------

export async function saveAnnouncementAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(announcementSchema, bools(formToObject(fd), ["pinned", "requiresAck"]));
  if ("error" in p) return p.error;
  const publish = fd.get("intent") === "publish";
  const r = await run(async () => {
    const row = await ann.saveAnnouncement(actor, p.data, id);
    if (publish && !row.publishedAt) await ann.publishAnnouncement(actor, row.id);
  }, publish ? "Published" : "Saved");
  revalidatePath("/announcements");
  return r;
}

export async function publishAnnouncementAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(async () => void (await ann.publishAnnouncement(actor, id)), "Published and everyone was notified");
  revalidatePath("/announcements");
  return r;
}

export async function deleteAnnouncementAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => ann.deleteAnnouncement(actor, id), "Deleted");
  revalidatePath("/announcements");
  return r;
}

export async function pinAnnouncementAction(id: string, pinned: boolean): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => ann.setPinned(actor, id, pinned), pinned ? "Pinned" : "Unpinned");
  revalidatePath("/announcements");
  return r;
}

export async function ackAnnouncementAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => ann.acknowledge(u, id), "Acknowledged. Thank you.");
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  return r;
}

// ---------- Checklist templates ----------

const tplPath = () => revalidatePath("/settings/checklists");

export async function saveTemplateAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(checklistTemplateSchema, bools(formToObject(fd), ["isDefault"]));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await onb.saveTemplate(actor, p.data, id)), "Saved");
  tplPath();
  return r;
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => onb.deleteTemplate(actor, id), "Template deleted");
  tplPath();
  return r;
}

export async function saveTemplateItemAction(templateId: string, itemId: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(checklistItemSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => (itemId ? onb.updateTemplateItem(actor, itemId, p.data) : onb.addTemplateItem(actor, templateId, p.data)), itemId ? "Saved" : "Item added");
  tplPath();
  return r;
}

export async function deleteTemplateItemAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => onb.deleteTemplateItem(actor, id), "Item removed");
  tplPath();
  return r;
}

export async function moveTemplateItemAction(id: string, dir: -1 | 1): Promise<ActionResult> {
  await staff();
  const r = await run(() => onb.moveTemplateItem(id, dir));
  tplPath();
  return r;
}

// ---------- Employee checklists ----------

export async function startChecklistAction(_p: ActionResult<string> | undefined, fd: FormData): Promise<ActionResult<string>> {
  const actor = await staff();
  const p = parse(startChecklistSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => (await onb.startChecklist(actor.id, p.data.employeeId, p.data.templateId)).id, "Checklist started");
  revalidatePath("/onboarding");
  revalidatePath(`/employees/${p.data.employeeId}`);
  return r;
}

export async function toggleTaskAction(taskId: string, done: boolean): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(async () => revalidatePath(`/onboarding/${await onb.setTaskDone(u, taskId, done)}`));
  revalidatePath("/onboarding");
  return r;
}

export async function addTaskAction(checklistId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(adhocTaskSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => onb.addTask(u, checklistId, p.data), "Task added");
  revalidatePath(`/onboarding/${checklistId}`);
  return r;
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(async () => revalidatePath(`/onboarding/${await onb.deleteTask(u, taskId)}`), "Task removed");
  return r;
}

export async function completeChecklistAction(id: string, completed: boolean): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => onb.setChecklistCompleted(u, id, completed), completed ? "Checklist completed" : "Checklist reopened");
  revalidatePath(`/onboarding/${id}`);
  revalidatePath("/onboarding");
  return r;
}

export async function deleteChecklistAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => onb.deleteChecklist(u, id), "Checklist deleted");
  revalidatePath("/onboarding");
  return r;
}

// ---------- Assets ----------

export async function saveAssetAction(id: string | undefined, _p: ActionResult<string> | undefined, fd: FormData): Promise<ActionResult<string>> {
  const actor = await staff();
  const p = parse(assetSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => (await assets.saveAsset(actor, p.data, id)).id, "Asset saved");
  revalidatePath("/assets");
  if (id) revalidatePath(`/assets/${id}`);
  return r;
}

export async function assignAssetAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const employeeId = String(fd.get("employeeId") ?? "");
  if (!employeeId) return { ok: false, error: "Pick an employee", fieldErrors: { employeeId: ["Pick an employee"] } };
  const r = await run(() => assets.assignAsset(actor, id, employeeId), "Asset assigned");
  revalidatePath("/assets");
  revalidatePath(`/assets/${id}`);
  revalidatePath(`/employees/${employeeId}`);
  return r;
}

export async function setAssetStatusAction(id: string, status: "AVAILABLE" | "REPAIR" | "RETIRED"): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => assets.setAssetStatus(actor, id, status), status === "AVAILABLE" ? "Asset returned" : status === "REPAIR" ? "Sent to repair" : "Asset retired");
  revalidatePath("/assets");
  revalidatePath(`/assets/${id}`);
  revalidatePath("/onboarding", "layout");
  return r;
}

export async function deleteAssetAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => assets.deleteAsset(actor, id), "Asset deleted");
  revalidatePath("/assets");
  return r;
}
