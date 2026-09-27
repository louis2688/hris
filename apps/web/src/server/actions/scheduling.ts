"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { availabilitySchema, rosterSaveSchema, shiftChangeSchema, swapRequestSchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import * as sch from "../services/scheduling";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const manager = () => requireRole("MANAGER", "HR", "ADMIN");
const week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const done = <T>(r: ActionResult<T>) => {
  revalidatePath("/schedule");
  return r;
};

export async function saveRosterAction(cells: unknown): Promise<ActionResult<number>> {
  const u = await manager();
  const p = rosterSaveSchema.safeParse({ cells });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid roster" };
  return done(await run(() => sch.saveRoster(u, p.data), "Schedule saved"));
}

export async function copyLastWeekAction(weekStart: string): Promise<ActionResult<number>> {
  const u = await manager();
  const w = week.parse(weekStart);
  const r = await run(() => sch.copyLastWeek(u, sch.mondayOf(w)));
  return done(r.ok ? { ...r, message: r.data ? `Copied ${r.data} assignment${r.data === 1 ? "" : "s"} from last week` : "Last week had no overrides; this week now uses default shifts" } : r);
}

export async function applyDefaultsAction(weekStart: string): Promise<ActionResult<number>> {
  const u = await manager();
  const w = week.parse(weekStart);
  return done(await run(() => sch.applyDefaults(u, sch.mondayOf(w)), "Default shifts applied"));
}

export async function requestSwapAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(swapRequestSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return done(await run(async () => void (await sch.requestSwap(u, p.data)), "Swap request sent"));
}

export async function respondSwapAction(id: string, accept: boolean): Promise<ActionResult> {
  const u = await requireSession();
  return done(await run(async () => void (await sch.respondSwap(u, id, accept)), accept ? "Swap accepted. Waiting for approval." : "Swap declined"));
}

export async function decideSwapAction(id: string, approve: boolean): Promise<ActionResult> {
  const u = await manager();
  return done(await run(() => sch.decideSwap(u, id, approve), approve ? "Swap approved" : "Swap rejected"));
}

export async function cancelSwapAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  return done(await run(() => sch.cancelSwap(u, id), "Swap cancelled"));
}

export async function requestShiftChangeAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(shiftChangeSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return done(await run(async () => void (await sch.requestShiftChange(u, p.data)), "Shift change requested"));
}

export async function decideShiftChangeAction(id: string, approve: boolean): Promise<ActionResult> {
  const u = await manager();
  return done(await run(() => sch.decideShiftChange(u, id, approve), approve ? "Shift change approved" : "Shift change rejected"));
}

export async function cancelShiftChangeAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  return done(await run(() => sch.cancelShiftChange(u, id), "Request cancelled"));
}

export async function saveAvailabilityAction(days: unknown): Promise<ActionResult> {
  const u = await requireSession();
  const p = availabilitySchema.safeParse({ days });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid availability" };
  return done(await run(() => sch.saveAvailability(u, p.data), "Availability saved"));
}
