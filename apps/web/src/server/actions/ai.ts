"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "../auth/session";
import { screenCandidate } from "../services/screening";
import { run, type ActionResult } from "./_helpers";

export async function screenCandidateAction(id: string): Promise<ActionResult<{ score: number }>> {
  const u = await requireRole("ADMIN", "HR");
  const r = await run(async () => ({ score: (await screenCandidate(u, id)).score }), "AI screening saved");
  revalidatePath(`/recruitment/candidates/${id}`);
  return r;
}
