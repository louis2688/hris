"use server";

import { revalidatePath } from "next/cache";
import {
  bulkEntitlementSchema,
  cancelLeaveRequestSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  leaveEntitlementSchema,
  leaveTypeSchema,
} from "@hris/shared";
import { z } from "zod";
import { requireRole, requireSession } from "../auth/session";
import * as leave from "../services/leave";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

function revalidateLeave(id?: string) {
  revalidatePath("/leave");
  revalidatePath("/me/leave");
  revalidatePath("/team");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/leave/${id}`);
}

export async function createLeaveRequestAction(_p: ActionResult<{ id: string; status: string }> | undefined, fd: FormData): Promise<ActionResult<{ id: string; status: string }>> {
  const actor = await requireSession();
  const p = parse(createLeaveRequestSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => leave.createLeaveRequest(actor, p.data));
  if (!r.ok) return r;
  revalidateLeave(r.data.id);
  return { ok: true, data: { id: r.data.id, status: r.data.status }, message: r.data.status === "APPROVED" ? "Leave approved automatically" : "Request submitted" };
}

export async function decideLeaveRequestAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const p = parse(decideLeaveRequestSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await leave.decideLeaveRequest(actor, id, p.data)), p.data.decision === "APPROVED" ? "Request approved" : "Request rejected");
  revalidateLeave(id);
  return r;
}

export async function cancelLeaveRequestAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const p = parse(cancelLeaveRequestSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await leave.cancelLeaveRequest(actor, id, p.data.note)), "Request cancelled");
  revalidateLeave(id);
  return r;
}

export async function addLeaveCommentAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const p = parse(z.object({ note: z.string().trim().min(1, "Write something").max(1000) }), formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await leave.addLeaveComment(actor, id, p.data.note)), "Comment added");
  revalidatePath(`/leave/${id}`);
  return r;
}

export async function saveLeaveTypeAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "HR");
  const p = parse(leaveTypeSchema, bools(formToObject(fd), ["isPaid", "requiresApproval", "allowHalfDay", "isActive"]));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await leave.saveLeaveType(actor, p.data, id)), "Saved");
  revalidatePath("/settings/leave-types");
  return r;
}

export async function upsertEntitlementAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "HR");
  const p = parse(leaveEntitlementSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await leave.upsertEntitlement(actor, p.data)), "Entitlement saved");
  revalidatePath("/settings/entitlements");
  revalidatePath(`/employees/${p.data.employeeId}`);
  return r;
}

export async function bulkEntitlementAction(_p: ActionResult<{ count: number }> | undefined, fd: FormData): Promise<ActionResult<{ count: number }>> {
  const actor = await requireRole("ADMIN", "HR");
  const p = parse(bulkEntitlementSchema, bools(formToObject(fd), ["onlyMissing"]));
  if ("error" in p) return p.error;
  const r = await run(() => leave.bulkAssignEntitlements(actor, p.data.leaveTypeId, p.data.year, p.data.entitledDays, p.data.onlyMissing));
  if (!r.ok) return r;
  revalidatePath("/settings/entitlements");
  return { ok: true, data: { count: r.data }, message: `${r.data} entitlement(s) written` };
}

export async function markNotificationsReadAction() {
  const actor = await requireSession();
  const { prisma } = await import("@hris/db");
  await prisma.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/dashboard");
}
