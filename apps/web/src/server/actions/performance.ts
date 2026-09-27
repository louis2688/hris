"use server";

import { revalidatePath } from "next/cache";
import { kpiSchema, peerFeedbackSchema, peerRequestSchema, reviewCycleSchema, reviewFormSchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import * as perf from "../services/performance";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");
const refreshCycles = () => {
  revalidatePath("/settings/review-cycles");
  revalidatePath("/performance");
};

export async function saveKpiAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(kpiSchema, bools(formToObject(fd), ["isActive"]));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await perf.saveKpi(u, p.data, id)), "Saved");
  revalidatePath("/settings/kpis");
  return r;
}
export async function deleteKpiAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => perf.deleteKpi(u, id), "Deleted");
  revalidatePath("/settings/kpis");
  return r;
}

export async function saveCycleAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(reviewCycleSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await perf.saveCycle(u, p.data, id)), "Saved");
  refreshCycles();
  return r;
}
export async function deleteCycleAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => perf.deleteCycle(u, id), "Deleted");
  refreshCycles();
  return r;
}
export async function activateCycleAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(async () => void (await perf.activateCycle(u, id)), "Cycle activated. Reviews created.");
  refreshCycles();
  return r;
}
export async function closeCycleAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => perf.closeCycle(u, id), "Cycle closed");
  refreshCycles();
  return r;
}

/** Form fields `rating:<itemId>` / `note:<itemId>` -> items[]. */
function reviewInput(fd: FormData) {
  const o = formToObject(fd);
  const ids = [...new Set(Object.keys(o).filter((k) => k.startsWith("rating:") || k.startsWith("note:")).map((k) => k.slice(k.indexOf(":") + 1)))];
  return { intent: o.intent, comment: o.comment, items: ids.map((id) => ({ id, rating: o[`rating:${id}`] ?? "", comment: o[`note:${id}`] })) };
}

async function saveReview(side: "self" | "manager", id: string, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(reviewFormSchema, reviewInput(fd));
  if ("error" in p) return p.error;
  const submit = p.data.intent === "submit";
  const r = await run(() => (side === "self" ? perf.saveSelfReview(u, id, p.data) : perf.saveManagerReview(u, id, p.data)), submit ? (side === "self" ? "Self review submitted" : "Review completed") : "Draft saved");
  revalidatePath("/performance");
  revalidatePath(`/performance/${id}`);
  return r;
}
export async function saveSelfReviewAction(id: string, _p: ActionResult | undefined, fd: FormData) {
  return saveReview("self", id, fd);
}
export async function saveManagerReviewAction(id: string, _p: ActionResult | undefined, fd: FormData) {
  return saveReview("manager", id, fd);
}

export async function requestPeersAction(reviewId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(peerRequestSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await perf.requestPeerFeedback(u, reviewId, p.data.reviewerIds)), "Feedback requested");
  revalidatePath(`/performance/${reviewId}`);
  return r;
}

export async function peerFeedbackAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(peerFeedbackSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => perf.submitPeerFeedback(u, id, p.data), "Feedback sent. Thank you!");
  revalidatePath("/performance");
  return r;
}
