"use server";

import { revalidatePath } from "next/cache";
import { candidateSchema, criteriaSchema, feedbackSchema, hireSchema, interviewResultSchema, interviewSchema, stageChangeSchema, vacancySchema } from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import { applyAcceptedOffer } from "../services/offers";
import * as rec from "../services/recruitment";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");
const refresh = (candidateId?: string) => {
  revalidatePath("/recruitment");
  if (candidateId) revalidatePath(`/recruitment/candidates/${candidateId}`);
};

export async function saveVacancyAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(vacancySchema, bools(formToObject(fd), ["isPublic"]));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await rec.saveVacancy(u, p.data, id)), "Saved");
  refresh();
  return r;
}
export async function deleteVacancyAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => rec.deleteVacancy(u, id), "Deleted");
  refresh();
  return r;
}

export async function saveCandidateAction(id: string | undefined, _p: ActionResult<{ id: string }> | undefined, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const u = await staff();
  const p = parse(candidateSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => ({ id: (await rec.saveCandidate(u, p.data, id)).id }));
  refresh(id);
  return r.ok ? { ...r, message: "Candidate saved" } : r;
}

export async function setStageAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(stageChangeSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => rec.setStage(u, id, p.data.stage, p.data.note), "Stage updated");
  refresh(id);
  return r;
}

export async function addInterviewAction(candidateId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(interviewSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await rec.addInterview(u, candidateId, p.data)), "Interview scheduled");
  refresh(candidateId);
  return r;
}

export async function interviewResultAction(candidateId: string, interviewId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(interviewResultSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await rec.setInterviewResult(u, interviewId, p.data.result, p.data.notes)), "Result saved");
  refresh(candidateId);
  return r;
}

export async function deleteInterviewAction(candidateId: string, interviewId: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => rec.deleteInterview(u, interviewId), "Interview removed");
  refresh(candidateId);
  return r;
}

export async function hireAction(id: string, _p: ActionResult<{ employeeId: string; initialPassword: string | null }> | undefined, fd: FormData): Promise<ActionResult<{ employeeId: string; initialPassword: string | null }>> {
  const u = await staff();
  const p = parse(hireSchema, bools(formToObject(fd), ["createAccount"]));
  if ("error" in p) return p.error;
  const r = await run(async () => {
    const h = await rec.hireCandidate(u, id, p.data);
    await applyAcceptedOffer(u, id, h.employeeId);
    return h;
  });
  refresh(id);
  revalidatePath("/employees");
  return r.ok ? { ...r, message: "Hired" } : r;
}

/** Interviewers (any role) and HR/Admin. Scores arrive as "score:<criterion>" fields. */
export async function feedbackAction(interviewId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const o = formToObject(fd);
  const scores = Object.fromEntries(Object.entries(o).filter(([k, v]) => k.startsWith("score:") && v !== "").map(([k, v]) => [k.slice(6), v]));
  const p = parse(feedbackSchema, { ...o, scores });
  if ("error" in p) return p.error;
  const r = await run(async () => refresh(await rec.submitFeedback(u, interviewId, p.data)), "Scorecard saved");
  return r;
}

export async function criteriaAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(criteriaSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => rec.setCriteria(u, p.data.criteria), "Criteria saved");
  refresh();
  return r;
}
