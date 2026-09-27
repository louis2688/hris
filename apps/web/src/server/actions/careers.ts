"use server";

import { headers } from "next/headers";
import { applyToVacancy, type ApplyResult } from "../services/careers";

/** Public: no session. Validation, honeypot, rate limit and PDF sniffing live in the service. */
export async function applyAction(slug: string, _p: ApplyResult | undefined, fd: FormData): Promise<ApplyResult> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    return await applyToVacancy(slug, fd, ip);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
