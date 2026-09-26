import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { createEmployeeSchema, type CandidateInput, type CandidateStage, type InterviewInput, type SessionUser, type VacancyInput } from "@hris/shared";
import { audit, notify } from "./audit";
import { createEmployee } from "./employees";
import { AppError, conflict, notFound } from "./errors";

const person = { select: { id: true, firstName: true, lastName: true, preferredName: true } } as const;

export async function listVacancies() {
  const [vacancies, counts] = await Promise.all([
    prisma.vacancy.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { jobTitle: { select: { name: true } }, department: { select: { name: true } }, location: { select: { name: true } }, hiringManager: person },
    }),
    prisma.candidate.groupBy({ by: ["vacancyId", "stage"], _count: { _all: true } }),
  ]);
  return vacancies.map((v) => {
    const byStage = Object.fromEntries(counts.filter((c) => c.vacancyId === v.id).map((c) => [c.stage, c._count._all])) as Partial<Record<CandidateStage, number>>;
    return { ...v, byStage, total: Object.values(byStage).reduce((a, b) => a + (b ?? 0), 0) };
  });
}

export async function getVacancy(id: string) {
  const v = await prisma.vacancy.findUnique({
    where: { id },
    include: {
      jobTitle: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      hiringManager: person,
      candidates: { orderBy: { appliedAt: "desc" }, include: { interviews: { orderBy: { scheduledAt: "desc" }, take: 1 } } },
    },
  });
  if (!v) throw notFound("Vacancy");
  return v;
}

export async function saveVacancy(actor: SessionUser, d: VacancyInput, id?: string) {
  const data = { title: d.title, jobTitleId: d.jobTitleId ?? null, departmentId: d.departmentId ?? null, locationId: d.locationId ?? null, hiringManagerId: d.hiringManagerId ?? null, positions: d.positions, description: d.description ?? null, status: d.status };
  const row = id ? await prisma.vacancy.update({ where: { id }, data }) : await prisma.vacancy.create({ data });
  await audit(actor.id, id ? "vacancy.update" : "vacancy.create", "Vacancy", row.id, { after: row });
  return row;
}

export async function deleteVacancy(actor: SessionUser, id: string) {
  await prisma.vacancy.delete({ where: { id } });
  await audit(actor.id, "vacancy.delete", "Vacancy", id);
}

export async function listCandidates(q: { vacancyId?: string; stage?: CandidateStage; q?: string }) {
  const where: Prisma.CandidateWhereInput = {
    ...(q.vacancyId ? { vacancyId: q.vacancyId } : {}),
    ...(q.stage ? { stage: q.stage } : {}),
    ...(q.q ? { OR: [{ firstName: { contains: q.q, mode: "insensitive" } }, { lastName: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [items, stages] = await Promise.all([
    prisma.candidate.findMany({ where, orderBy: { appliedAt: "desc" }, take: 200, include: { vacancy: { select: { id: true, title: true } } } }),
    prisma.candidate.groupBy({ by: ["stage"], where: q.vacancyId ? { vacancyId: q.vacancyId } : undefined, _count: { _all: true } }),
  ]);
  return { items, stages: Object.fromEntries(stages.map((s) => [s.stage, s._count._all])) as Partial<Record<CandidateStage, number>> };
}

export async function getCandidate(id: string) {
  const c = await prisma.candidate.findUnique({
    where: { id },
    include: {
      vacancy: { select: { id: true, title: true, jobTitleId: true, departmentId: true, locationId: true, hiringManagerId: true } },
      interviews: { orderBy: { scheduledAt: "asc" }, include: { interviewer: person } },
      hiredEmployee: { select: { id: true, employeeCode: true } },
    },
  });
  if (!c) throw notFound("Candidate");
  const history = await prisma.auditLog.findMany({ where: { entity: "Candidate", entityId: id }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { email: true } } } });
  return { ...c, history };
}
export type CandidateDetail = Awaited<ReturnType<typeof getCandidate>>;

export async function saveCandidate(actor: SessionUser, d: CandidateInput, id?: string) {
  const data = { firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone ?? null, vacancyId: d.vacancyId ?? null, source: d.source ?? null, resumeUrl: d.resumeUrl ?? null, notes: d.notes ?? null };
  if (!id && d.vacancyId && (await prisma.candidate.findFirst({ where: { email: d.email, vacancyId: d.vacancyId } }))) throw conflict("This candidate already applied to that vacancy");
  const row = id ? await prisma.candidate.update({ where: { id }, data }) : await prisma.candidate.create({ data });
  await audit(actor.id, id ? "candidate.update" : "candidate.create", "Candidate", row.id, { after: { stage: row.stage, vacancyId: row.vacancyId } });
  return row;
}

const NEXT: Record<CandidateStage, CandidateStage[]> = {
  APPLIED: ["SHORTLISTED", "INTERVIEW", "REJECTED", "WITHDRAWN"],
  SHORTLISTED: ["INTERVIEW", "OFFERED", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["SHORTLISTED", "OFFERED", "REJECTED", "WITHDRAWN"],
  OFFERED: ["INTERVIEW", "REJECTED", "WITHDRAWN"], // HIRED only through hireCandidate
  HIRED: [],
  REJECTED: ["APPLIED", "SHORTLISTED"],
  WITHDRAWN: ["APPLIED"],
};
export const allowedStages = (s: CandidateStage) => NEXT[s];

export async function setStage(actor: SessionUser, id: string, stage: CandidateStage, note?: string) {
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) throw notFound("Candidate");
  if (!NEXT[c.stage].includes(stage)) throw new AppError(`Cannot move from ${c.stage.toLowerCase()} to ${stage.toLowerCase()}`);
  await prisma.candidate.update({ where: { id }, data: { stage } });
  await audit(actor.id, `candidate.stage.${stage.toLowerCase()}`, "Candidate", id, { before: { stage: c.stage }, after: { stage, note } });
}

export async function addInterview(actor: SessionUser, candidateId: string, d: InterviewInput) {
  const c = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!c) throw notFound("Candidate");
  if (c.stage === "HIRED" || c.stage === "REJECTED" || c.stage === "WITHDRAWN") throw new AppError(`Candidate is ${c.stage.toLowerCase()}`);
  const row = await prisma.$transaction(async (tx) => {
    const i = await tx.interview.create({ data: { candidateId, title: d.title, scheduledAt: new Date(d.scheduledAt), interviewerId: d.interviewerId ?? null, location: d.location ?? null, notes: d.notes ?? null } });
    if (c.stage === "APPLIED" || c.stage === "SHORTLISTED") await tx.candidate.update({ where: { id: candidateId }, data: { stage: "INTERVIEW" } });
    return i;
  });
  await audit(actor.id, "candidate.interview_scheduled", "Candidate", candidateId, { after: { title: d.title, at: d.scheduledAt } });
  if (d.interviewerId) {
    const u = await prisma.employee.findUnique({ where: { id: d.interviewerId }, select: { user: { select: { id: true } } } });
    await notify(u?.user?.id, `Interview: ${c.firstName} ${c.lastName}`, `${d.title} on ${new Date(d.scheduledAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`, `/recruitment/candidates/${candidateId}`);
  }
  return row;
}

export async function setInterviewResult(actor: SessionUser, interviewId: string, result: "PENDING" | "PASSED" | "FAILED", notes?: string) {
  const i = await prisma.interview.update({ where: { id: interviewId }, data: { result, ...(notes ? { notes } : {}) } });
  await audit(actor.id, `candidate.interview_${result.toLowerCase()}`, "Candidate", i.candidateId, { after: { interview: i.title, result } });
  return i;
}

export async function deleteInterview(actor: SessionUser, interviewId: string) {
  const i = await prisma.interview.delete({ where: { id: interviewId } });
  await audit(actor.id, "candidate.interview_deleted", "Candidate", i.candidateId, { before: { title: i.title } });
}

/** Offered candidate -> employee record (+ optional login). */
export async function hireCandidate(actor: SessionUser, id: string, d: { employeeCode: string; hireDate: string; createAccount: boolean; role: "EMPLOYEE" | "MANAGER" | "HR" | "ADMIN" }) {
  const c = await getCandidate(id);
  if (c.stage !== "OFFERED") throw new AppError("Only candidates with an offer can be hired");
  const { employee, initialPassword } = await createEmployee(actor, createEmployeeSchema.parse({
    firstName: c.firstName,
    lastName: c.lastName,
    gender: "UNDISCLOSED",
    workEmail: c.email,
    mobile: c.phone ?? undefined,
    employeeCode: d.employeeCode,
    hireDate: d.hireDate,
    departmentId: c.vacancy?.departmentId ?? undefined,
    jobTitleId: c.vacancy?.jobTitleId ?? undefined,
    locationId: c.vacancy?.locationId ?? undefined,
    managerId: c.vacancy?.hiringManagerId ?? undefined,
    employmentType: "FULL_TIME",
    employmentStatus: "PROBATION",
    createAccount: d.createAccount,
    role: d.role,
    loginEmail: c.email,
  }));
  await prisma.candidate.update({ where: { id }, data: { stage: "HIRED", hiredEmployeeId: employee.id } });
  await audit(actor.id, "candidate.hired", "Candidate", id, { after: { employeeId: employee.id } });
  if (c.vacancy) {
    const hired = await prisma.candidate.count({ where: { vacancyId: c.vacancy.id, stage: "HIRED" } });
    const v = await prisma.vacancy.findUnique({ where: { id: c.vacancy.id }, select: { positions: true } });
    if (v && hired >= v.positions) await prisma.vacancy.update({ where: { id: c.vacancy.id }, data: { status: "CLOSED" } });
  }
  return { employeeId: employee.id, initialPassword };
}

export const upcomingInterviews = (employeeId?: string | null) =>
  prisma.interview.findMany({
    where: { scheduledAt: { gte: new Date(Date.now() - 3600_000) }, result: "PENDING", ...(employeeId ? { interviewerId: employeeId } : {}) },
    orderBy: { scheduledAt: "asc" },
    take: 10,
    include: { candidate: { select: { id: true, firstName: true, lastName: true, vacancy: { select: { title: true } } } } },
  });
