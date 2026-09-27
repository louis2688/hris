"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { offerAcceptSchema, offerDeclineSchema, offerSchema, termsFromForm } from "@hris/shared";
import { requireRole } from "../auth/session";
import { rateLimited } from "../services/careers";
import * as offers from "../services/offers";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");
const refresh = (candidateId: string) => revalidatePath(`/recruitment/candidates/${candidateId}`);

export async function saveOfferAction(candidateId: string, id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const o = formToObject(fd);
  const p = parse(offerSchema, { ...o, terms: termsFromForm(o) });
  if ("error" in p) return p.error;
  const r = await run(async () => void (await offers.saveOffer(u, candidateId, p.data, id)), id ? "Offer updated" : "Offer drafted");
  refresh(candidateId);
  return r;
}

export async function sendOfferAction(candidateId: string, id: string): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const u = await staff();
  const r = await run(() => offers.sendOffer(u, id));
  refresh(candidateId);
  revalidatePath("/recruitment");
  return r.ok ? { ...r, message: r.data.emailed ? "Offer sent to the candidate" : "Offer ready. Email is off, so share the link." } : r;
}

export async function withdrawOfferAction(candidateId: string, id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => offers.withdrawOffer(u, id), "Offer withdrawn");
  refresh(candidateId);
  return r;
}

// ---------- public, token-authenticated ----------

async function limited(token: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return rateLimited(`offer:${ip}`, 10, 10 * 60_000) || rateLimited(`offer-token:${token}`, 10, 10 * 60_000);
}
const slowDown: ActionResult = { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };

export async function acceptOfferAction(token: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  if (await limited(token)) return slowDown;
  const p = parse(offerAcceptSchema, bools(formToObject(fd), ["agree"]));
  if ("error" in p) return p.error;
  const r = await run(() => offers.respondToOffer(token, { accept: true, name: p.data.name }));
  revalidatePath(`/offer/${token}`);
  return r;
}

export async function declineOfferAction(token: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  if (await limited(token)) return slowDown;
  const p = parse(offerDeclineSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => offers.respondToOffer(token, { accept: false, reason: p.data.reason }));
  revalidatePath(`/offer/${token}`);
  return r;
}
