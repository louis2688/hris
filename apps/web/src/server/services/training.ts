import "server-only";
import { prisma } from "@hris/db";
import { zonedToUtc, type SessionUser, type TrainingAttendanceInput, type TrainingEventInput, type TrainingProgramInput } from "@hris/shared";
import { AuthError } from "../auth/session";
import { canAccessEmployee } from "../authz";
import { audit, notify } from "./audit";
import { upload } from "./documents";
import { AppError, notFound } from "./errors";

const TZ = "Asia/Manila";
const person = { select: { id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true } } as const;
const toUtc = (local: string) => zonedToUtc(local.slice(0, 10), local.slice(11, 16), TZ);
/** Date -> "YYYY-MM-DDTHH:mm" in Manila, for datetime-local inputs. */
export const toLocalInput = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16);

// ---------- programs ----------

export const listPrograms = () => prisma.trainingProgram.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { events: true } } } });

export async function saveProgram(u: SessionUser, d: TrainingProgramInput, id?: string) {
  const data = { name: d.name, description: d.description ?? null, provider: d.provider ?? null, isActive: d.isActive };
  const row = id ? await prisma.trainingProgram.update({ where: { id }, data }) : await prisma.trainingProgram.create({ data });
  await audit(u.id, id ? "training_program.update" : "training_program.create", "TrainingProgram", row.id, { after: row });
  return row;
}

export async function deleteProgram(u: SessionUser, id: string) {
  const { count } = await prisma.trainingProgram.deleteMany({ where: { id, events: { none: {} } } });
  if (!count) throw new AppError("Programs with events cannot be deleted. Mark it inactive instead.");
  await audit(u.id, "training_program.delete", "TrainingProgram", id);
}

// ---------- events ----------

export const listEvents = () =>
  prisma.trainingEvent.findMany({
    orderBy: { startsAt: "desc" },
    take: 200,
    include: { program: { select: { name: true } }, _count: { select: { attendees: true } } },
  });

export async function getEvent(id: string) {
  const e = await prisma.trainingEvent.findUnique({
    where: { id },
    include: {
      program: true,
      attendees: {
        include: { employee: { select: { ...person.select, department: { select: { name: true } } } }, certificate: { select: { id: true, name: true } } },
        orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
      },
    },
  });
  if (!e) throw notFound("Training event");
  const rated = e.attendees.filter((a) => a.feedbackRating != null);
  const billable = e.attendees.filter((a) => a.status !== "ABSENT").length;
  return {
    ...e,
    avgFeedback: rated.length ? Math.round((rated.reduce((s, a) => s + a.feedbackRating!, 0) / rated.length) * 10) / 10 : null,
    feedbackCount: rated.length,
    // Cost is per participant; absentees are not billed.
    totalCost: e.cost != null ? Number(e.cost) * billable : null,
  };
}
export type EventDetail = Awaited<ReturnType<typeof getEvent>>;

export async function saveEvent(u: SessionUser, d: TrainingEventInput, id?: string) {
  const data = {
    programId: d.programId,
    title: d.title,
    startsAt: toUtc(d.startsAt),
    endsAt: toUtc(d.endsAt),
    location: d.location ?? null,
    trainer: d.trainer ?? null,
    cost: d.cost ?? null,
    capacity: d.capacity ?? null,
    status: d.status,
  };
  if (id && d.capacity != null) {
    const n = await prisma.trainingAttendee.count({ where: { eventId: id } });
    if (n > d.capacity) throw new AppError(`${n} people are already invited; capacity cannot be lower`);
  }
  const row = id ? await prisma.trainingEvent.update({ where: { id }, data }) : await prisma.trainingEvent.create({ data });
  await audit(u.id, id ? "training_event.update" : "training_event.create", "TrainingEvent", row.id, { after: row });
  return row;
}

export async function deleteEvent(u: SessionUser, id: string) {
  await prisma.trainingEvent.delete({ where: { id } });
  await audit(u.id, "training_event.delete", "TrainingEvent", id);
}

export async function inviteEmployees(u: SessionUser, eventId: string, employeeIds: string[]) {
  const e = await prisma.trainingEvent.findUnique({ where: { id: eventId }, include: { attendees: { select: { employeeId: true } } } });
  if (!e) throw notFound("Training event");
  if (e.status !== "SCHEDULED") throw new AppError("Only scheduled events take invites");
  const fresh = [...new Set(employeeIds)].filter((id) => !e.attendees.some((a) => a.employeeId === id));
  if (!fresh.length) throw new AppError("Everyone picked is already invited");
  if (e.capacity != null && e.attendees.length + fresh.length > e.capacity) throw new AppError(`Only ${Math.max(0, e.capacity - e.attendees.length)} seat(s) left`);
  const emps = await prisma.employee.findMany({ where: { id: { in: fresh }, deletedAt: null }, select: { id: true, userId: true } });
  await prisma.trainingAttendee.createMany({ data: emps.map((x) => ({ eventId, employeeId: x.id })), skipDuplicates: true });
  await audit(u.id, "training_event.invite", "TrainingEvent", eventId, { after: { employeeIds: emps.map((x) => x.id) } });
  const when = e.startsAt.toLocaleString("en-PH", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
  for (let i = 0; i < emps.length; i += 5) await Promise.all(emps.slice(i, i + 5).map((x) => notify(x.userId, `Training: ${e.title}`, `${when}${e.location ? ` at ${e.location}` : ""}`, "/training")));
  return { invited: emps.length };
}

export async function removeAttendee(u: SessionUser, attendeeId: string) {
  const a = await prisma.trainingAttendee.delete({ where: { id: attendeeId } });
  await audit(u.id, "training_event.uninvite", "TrainingEvent", a.eventId, { before: { employeeId: a.employeeId } });
  return a.eventId;
}

export async function markAttendance(u: SessionUser, attendeeId: string, d: TrainingAttendanceInput) {
  const a = await prisma.trainingAttendee.update({ where: { id: attendeeId }, data: { status: d.status, result: d.result ?? null, score: d.score ?? null } });
  await audit(u.id, "training_event.attendance", "TrainingAttendee", attendeeId, { after: d });
  return a.eventId;
}

/** Stores the file on the employee's documents (CERTIFICATE, visible to them) and links it. */
export async function uploadCertificate(u: SessionUser, attendeeId: string, file: File) {
  const a = await prisma.trainingAttendee.findUnique({ where: { id: attendeeId }, select: { employeeId: true, eventId: true, status: true } });
  if (!a) throw notFound("Attendee");
  if (a.status !== "ATTENDED") throw new AppError("Mark the employee as attended first");
  const doc = await upload(u, { employeeId: a.employeeId, category: "CERTIFICATE", visibleToEmployee: true, file });
  await prisma.trainingAttendee.update({ where: { id: attendeeId }, data: { certificateId: doc.id } });
  return a.eventId;
}

/** The attendee's own feedback, once, after attending. */
export async function submitTrainingFeedback(u: SessionUser, attendeeId: string, d: { rating: number; comment?: string }) {
  const { count } = await prisma.trainingAttendee.updateMany({
    where: { id: attendeeId, employeeId: u.employeeId ?? "-", status: "ATTENDED", feedbackRating: null },
    data: { feedbackRating: d.rating, feedback: d.comment ?? null },
  });
  if (!count) throw new AppError("Feedback is open once, after you attend");
  await audit(u.id, "training.feedback", "TrainingAttendee", attendeeId);
}

/** Training history for one employee: self, their manager, or HR/Admin. */
export async function trainingsFor(u: SessionUser, employeeId: string) {
  if (!(await canAccessEmployee(u, employeeId))) throw new AuthError("Forbidden", 403);
  return prisma.trainingAttendee.findMany({
    where: { employeeId },
    include: { event: { include: { program: { select: { name: true, provider: true } } } }, certificate: { select: { id: true, name: true } } },
    orderBy: { event: { startsAt: "desc" } },
  });
}
export type MyTraining = Awaited<ReturnType<typeof trainingsFor>>[number];

/** Picker data: active employees with department. */
export const pickableEmployees = () =>
  prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] } },
    select: { id: true, firstName: true, lastName: true, preferredName: true, departmentId: true, department: { select: { name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
