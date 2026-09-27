"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  agendaItemSchema,
  goalProgressSchema,
  goalSchema,
  oneOnOneSchema,
  surveySchema,
  trainingAttendanceSchema,
  trainingEventSchema,
  trainingFeedbackSchema,
  trainingInviteSchema,
  trainingProgramSchema,
} from "@hris/shared";
import { requireRole, requireSession } from "../auth/session";
import * as goals from "../services/goals";
import * as oneOnOnes from "../services/one-on-ones";
import * as surveys from "../services/surveys";
import * as training from "../services/training";
import { AppError } from "../services/errors";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");
const refreshPerf = () => revalidatePath("/performance");

// ---------- goals ----------

export async function saveGoalAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(goalSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await goals.saveGoal(u, p.data, id)), id ? "Goal updated" : "Goal added");
  refreshPerf();
  return r;
}

export async function goalProgressAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(goalProgressSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => goals.updateGoalProgress(u, id, p.data), "Progress saved");
  refreshPerf();
  return r;
}

export async function deleteGoalAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => goals.deleteGoal(u, id), "Goal deleted");
  refreshPerf();
  return r;
}

// ---------- 1:1s ----------

export async function saveOneOnOneAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(oneOnOneSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await oneOnOnes.saveOneOnOne(u, p.data, id)), id ? "1:1 updated" : "1:1 saved");
  refreshPerf();
  return r;
}

export async function deleteOneOnOneAction(id: string): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => oneOnOnes.deleteOneOnOne(u, id), "1:1 deleted");
  refreshPerf();
  return r;
}

export async function addAgendaAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(agendaItemSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => oneOnOnes.addAgendaItem(u, id, p.data.text), "Added to the agenda");
  refreshPerf();
  return r;
}

export async function toggleActionItemAction(id: string, index: number, done: boolean): Promise<ActionResult> {
  const u = await requireSession();
  const r = await run(() => oneOnOnes.toggleActionItem(u, id, index, done));
  refreshPerf();
  return r;
}

// ---------- training ----------

const refreshTraining = (eventId?: string) => {
  revalidatePath("/training");
  if (eventId) revalidatePath(`/training/${eventId}`);
};

export async function saveProgramAction(id: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(trainingProgramSchema, bools(formToObject(fd), ["isActive"]));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await training.saveProgram(u, p.data, id)), "Saved");
  refreshTraining();
  return r;
}

export async function deleteProgramAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => training.deleteProgram(u, id), "Deleted");
  refreshTraining();
  return r;
}

export async function saveEventAction(id: string | undefined, _p: ActionResult<string> | undefined, fd: FormData): Promise<ActionResult<string>> {
  const u = await staff();
  const p = parse(trainingEventSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => (await training.saveEvent(u, p.data, id)).id, "Event saved");
  refreshTraining(id);
  return r;
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => training.deleteEvent(u, id), "Event deleted");
  refreshTraining();
  if (r.ok) redirect("/training");
  return r;
}

export async function inviteAction(eventId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(trainingInviteSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => void (await training.inviteEmployees(u, eventId, p.data.employeeIds)), "Invitations sent");
  refreshTraining(eventId);
  return r;
}

export async function removeAttendeeAction(attendeeId: string): Promise<ActionResult> {
  const u = await staff();
  return run(async () => refreshTraining(await training.removeAttendee(u, attendeeId)), "Removed");
}

export async function attendanceAction(attendeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const p = parse(trainingAttendanceSchema, formToObject(fd));
  if ("error" in p) return p.error;
  return run(async () => refreshTraining(await training.markAttendance(u, attendeeId, p.data)), "Saved");
}

export async function certificateAction(attendeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await staff();
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a file to upload" };
  return run(async () => refreshTraining(await training.uploadCertificate(u, attendeeId, file)), "Certificate uploaded");
}

export async function trainingFeedbackAction(attendeeId: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const p = parse(trainingFeedbackSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => training.submitTrainingFeedback(u, attendeeId, p.data), "Thanks for the feedback");
  refreshTraining();
  return r;
}

// ---------- surveys ----------

const refreshSurveys = (id?: string) => {
  revalidatePath("/surveys");
  if (id) revalidatePath(`/surveys/${id}`);
};

export async function saveSurveyAction(id: string | undefined, _p: ActionResult<string> | undefined, fd: FormData): Promise<ActionResult<string>> {
  const u = await staff();
  const p = parse(surveySchema, bools(formToObject(fd), ["anonymous"]));
  if ("error" in p) return p.error;
  const r = await run(async () => (await surveys.saveSurvey(u, p.data, id)).id, "Survey saved");
  refreshSurveys(id);
  return r;
}

export async function publishSurveyAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(async () => void (await surveys.publishSurvey(u, id)), "Survey published");
  refreshSurveys(id);
  return r;
}

export async function closeSurveyAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => surveys.closeSurvey(u, id), "Survey closed");
  refreshSurveys(id);
  return r;
}

export async function deleteSurveyAction(id: string): Promise<ActionResult> {
  const u = await staff();
  const r = await run(() => surveys.deleteSurvey(u, id), "Survey deleted");
  refreshSurveys();
  if (r.ok) redirect("/surveys");
  return r;
}

/** Form fields `q:<questionId>` -> answers. */
export async function submitSurveyAction(id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const o = formToObject(fd);
  const raw = Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith("q:")).map(([k, v]) => [k.slice(2), v]));
  try {
    await surveys.submitSurvey(u, id, raw);
  } catch (e) {
    const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
    if (e instanceof AppError && fe) return { ok: false, error: e.message, fieldErrors: Object.fromEntries(Object.entries(fe).map(([k, v]) => [`q:${k}`, [v]])) };
    return run(() => Promise.reject(e));
  }
  refreshSurveys(id);
  return { ok: true, data: undefined, message: "Thanks! Your response was recorded." };
}
