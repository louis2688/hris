"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { attendancePolicySchema, deviceSchema, manualPunchSchema, projectSchema, timesheetEntriesSchema, workShiftSchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import { assertAccessEmployee, isStaff } from "../authz";
import * as att from "../services/attendance";
import * as dev from "../services/devices";
import * as pk from "../services/passkeys";
import * as ts from "../services/timesheets";
import { setSetting } from "../services/settings";
import { AppError } from "../services/errors";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");

// ---------- Punching ----------

export async function punchOptionsAction(): Promise<ActionResult<Awaited<ReturnType<typeof pk.authenticationOptions>>>> {
  const u = await requireSession();
  return run(() => pk.authenticationOptions(u));
}

const punchSchema = z.object({
  assertion: z.string().optional(),
  photo: z.string().max(400_000).optional(), // data:image/jpeg;base64,... (client downsizes to ~320px)
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export async function punchAction(input: z.input<typeof punchSchema>): Promise<ActionResult<{ direction: string; at: string }>> {
  const u = await requireSession();
  const p = punchSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid punch data" };
  const r = await run(async () => {
    let method: "NONE" | "PASSKEY" | "PHOTO" = "NONE";
    if (p.data.assertion) {
      await pk.verifyAuthentication(u, JSON.parse(p.data.assertion) as AuthenticationResponseJSON);
      method = "PASSKEY";
    }
    let photo: Buffer | undefined;
    if (p.data.photo) {
      const m = p.data.photo.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (!m) throw new AppError("Unsupported photo format");
      photo = Buffer.from(m[2]!, "base64");
      if (method === "NONE") method = "PHOTO";
    }
    const punch = await att.recordPunch(u, { method, photo, latitude: p.data.latitude, longitude: p.data.longitude });
    return { direction: punch.direction ?? "IN", at: punch.at.toISOString() };
  });
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return r.ok ? { ...r, message: r.data.direction === "IN" ? "Clocked in" : "Clocked out" } : r;
}

export async function manualPunchAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireRole("MANAGER", "HR", "ADMIN");
  const p = parse(manualPunchSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => {
    await assertAccessEmployee(u, p.data.employeeId);
    if (p.data.employeeId === u.employeeId && !isStaff(u)) throw new AppError("Ask HR to correct your own punches");
    await att.addManualPunch(u, p.data);
  }, "Punch added");
  revalidatePath("/attendance");
  return r;
}

export async function deletePunchAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(async () => void (await att.deletePunch(u, id)), "Punch removed");
  revalidatePath("/attendance");
  return r;
}

// ---------- Passkeys ----------

export async function passkeyRegisterOptionsAction(): Promise<ActionResult<Awaited<ReturnType<typeof pk.registrationOptions>>>> {
  const u = await requireSession();
  return run(() => pk.registrationOptions(u));
}

export async function passkeyRegisterAction(response: string, name: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(async () => void (await pk.verifyRegistration(u, JSON.parse(response) as RegistrationResponseJSON, name.slice(0, 60))), "Device registered");
  revalidatePath("/me/security");
  return r;
}

export async function passkeyDeleteAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => pk.deletePasskey(u, id), "Removed");
  revalidatePath("/me/security");
  return r;
}

// ---------- Settings ----------

export async function saveShiftAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(workShiftSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await att.saveShift(u, p.data, id)), "Saved");
  revalidatePath("/settings/attendance");
  return r;
}
export async function deleteShiftAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => att.deleteShift(u, id), "Deleted");
  revalidatePath("/settings/attendance");
  return r;
}

export async function savePolicyAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await staff();
  const p = parse(attendancePolicySchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => setSetting("attendance", p.data), "Policy saved");
  revalidatePath("/settings/attendance");
  return r;
}

export async function saveDeviceAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(deviceSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await dev.saveDevice(u, p.data, id)), "Saved");
  revalidatePath("/settings/attendance");
  return r;
}
export async function deleteDeviceAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => dev.deleteDevice(u, id), "Deleted");
  revalidatePath("/settings/attendance");
  return r;
}
export async function rotateDeviceKeyAction(id: string): Promise<ActionResult<string>> {
  const u = await staff();
  return run(() => dev.rotateDeviceKey(u, id));
}

export async function saveProjectAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(projectSchema, bools(formToObject(fd), ["isActive"]));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await ts.saveProject(u, p.data, id)), "Saved");
  revalidatePath("/settings/projects");
  return r;
}

// ---------- Timesheets ----------

export async function saveTimesheetAction(id: string, entries: unknown, submit: boolean): Promise<ActionResult> {
  const u = await requireSession();
  const p = timesheetEntriesSchema.safeParse({ entries });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid entries" };
  const r = await run(async () => {
    await ts.saveEntries(u, id, p.data);
    if (submit) await ts.submitTimesheet(u, id);
  }, submit ? "Timesheet submitted" : "Saved");
  revalidatePath("/timesheets");
  return r;
}

export async function decideTimesheetAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(500).optional() }), formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => ts.decideTimesheet(u, id, p.data.decision, p.data.note || undefined), p.data.decision === "APPROVED" ? "Timesheet approved" : "Timesheet rejected");
  revalidatePath(`/timesheets/${id}`);
  revalidatePath("/timesheets");
  return r;
}
