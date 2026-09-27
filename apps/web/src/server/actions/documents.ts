"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth/session";
import * as docs from "../services/documents";
import { run, type ActionResult } from "./_helpers";

function revalidate(o: { employeeId?: string | null; candidateId?: string | null }) {
  if (o.employeeId) {
    revalidatePath(`/employees/${o.employeeId}`);
    revalidatePath("/me");
  }
  if (o.candidateId) revalidatePath(`/recruitment/candidates/${o.candidateId}`);
}

/** FormData: file, category, employeeId | candidateId, visibleToEmployee (optional). */
export async function uploadDocumentAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const file = fd.get("file");
  const input = {
    employeeId: String(fd.get("employeeId") ?? ""),
    candidateId: String(fd.get("candidateId") ?? ""),
    category: String(fd.get("category") ?? ""),
    // Absent = default (visible); the HR checkbox posts a hidden "false" plus "true" when ticked.
    visibleToEmployee: fd.has("visibleToEmployee") ? fd.getAll("visibleToEmployee").includes("true") : undefined,
    expiresAt: String(fd.get("expiresAt") ?? "") || null,
    requiresAck: fd.get("requiresAck") === "true",
  };
  if (!(file instanceof File)) return { ok: false, error: "Choose a file to upload" };
  const r = await run(async () => void (await docs.upload(actor, { ...input, file })), "Uploaded");
  revalidate(input);
  return r;
}

export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  const actor = await requireSession();
  const r = await run(() => docs.remove(actor, id), "Deleted");
  if (r.ok) revalidate(r.data);
  return r.ok ? { ok: true, data: undefined, message: r.message } : r;
}
