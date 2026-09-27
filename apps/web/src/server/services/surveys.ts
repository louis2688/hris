import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@hris/db";
import {
  aggregateQuestion,
  K_ANON_MIN,
  kAnonymous,
  manilaISODate,
  validateSurveyAnswers,
  type SessionUser,
  type SurveyAnswers,
  type SurveyInput,
  type SurveyQuestion,
} from "@hris/shared";
import { AuthError } from "../auth/session";
import { audit, notify } from "./audit";
import { AppError, conflict, notFound } from "./errors";

/** Key inside anonymous answers holding the respondent's department id (for k-anonymous breakdowns only). */
const DEPT = "_dept";
type Audience = { departmentIds?: string[] } | null;

const questionsOf = (s: { questions: Prisma.JsonValue }) => (Array.isArray(s.questions) ? (s.questions as SurveyQuestion[]) : []);
const deptIds = (s: { audience: Prisma.JsonValue }) => ((s.audience as Audience)?.departmentIds ?? []).filter(Boolean);
const audienceWhere = (s: { audience: Prisma.JsonValue }): Prisma.EmployeeWhereInput => {
  const ids = deptIds(s);
  return { deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] }, ...(ids.length ? { departmentId: { in: ids } } : {}) };
};
const todayDate = () => new Date(manilaISODate());
/** OPEN and today is inside [opensAt, closesAt] (dates, Manila). */
const isLive = (s: { status: string; opensAt: Date | null; closesAt: Date | null }, t = todayDate()) =>
  s.status === "OPEN" && (!s.opensAt || s.opensAt <= t) && (!s.closesAt || s.closesAt >= t);

// ---------- HR ----------

export async function listSurveys() {
  const rows = await prisma.survey.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { participations: true } } } });
  return rows.map((s) => ({ ...s, live: isLive(s), questionCount: questionsOf(s).length }));
}

export async function getSurvey(id: string) {
  const s = await prisma.survey.findUnique({ where: { id } });
  if (!s) throw notFound("Survey");
  return { ...s, live: isLive(s), questionList: questionsOf(s), departmentIds: deptIds(s) };
}

export async function saveSurvey(u: SessionUser, d: SurveyInput, id?: string) {
  if (id) {
    const s = await prisma.survey.findUnique({ where: { id }, select: { status: true } });
    if (!s) throw notFound("Survey");
    if (s.status !== "DRAFT") throw new AppError("Only draft surveys can be edited");
  }
  const data = {
    title: d.title,
    description: d.description ?? null,
    anonymous: d.anonymous,
    audience: d.departmentIds.length ? { departmentIds: d.departmentIds } : Prisma.DbNull,
    questions: d.questions,
    opensAt: d.opensAt ? new Date(d.opensAt) : null,
    closesAt: d.closesAt ? new Date(d.closesAt) : null,
  };
  const row = id ? await prisma.survey.update({ where: { id }, data }) : await prisma.survey.create({ data: { ...data, createdById: u.id } });
  await audit(u.id, id ? "survey.update" : "survey.create", "Survey", row.id, { after: { title: row.title, anonymous: row.anonymous } });
  return row;
}

export async function deleteSurvey(u: SessionUser, id: string) {
  const { count } = await prisma.survey.deleteMany({ where: { id, status: "DRAFT" } });
  if (!count) throw new AppError("Only draft surveys can be deleted");
  await audit(u.id, "survey.delete", "Survey", id);
}

export async function publishSurvey(u: SessionUser, id: string) {
  const s = await prisma.survey.findUnique({ where: { id } });
  if (!s) throw notFound("Survey");
  const { count } = await prisma.survey.updateMany({ where: { id, status: "DRAFT" }, data: { status: "OPEN" } });
  if (!count) throw conflict("Only draft surveys can be published");
  const people = await prisma.employee.findMany({ where: { ...audienceWhere(s), userId: { not: null } }, select: { userId: true } });
  await audit(u.id, "survey.publish", "Survey", id, { after: { audience: people.length } });
  const when = s.opensAt && s.opensAt > todayDate() ? `Opens ${s.opensAt.toISOString().slice(0, 10)}. ` : "";
  const body = `${when}${s.anonymous ? "Your answers are anonymous." : "Your name is recorded with your answers."}`;
  for (let i = 0; i < people.length; i += 5) await Promise.all(people.slice(i, i + 5).map((p) => notify(p.userId, `Survey: ${s.title}`, body, `/surveys/${id}`)));
  return { audience: people.length };
}

export async function closeSurvey(u: SessionUser, id: string) {
  const { count } = await prisma.survey.updateMany({ where: { id, status: "OPEN" }, data: { status: "CLOSED" } });
  if (!count) throw new AppError("Only open surveys can be closed");
  await audit(u.id, "survey.close", "Survey", id);
}

// ---------- employees ----------

async function me(u: SessionUser) {
  if (!u.employeeId) throw new AuthError("No employee profile linked", 403);
  const e = await prisma.employee.findUnique({ where: { id: u.employeeId }, select: { id: true, departmentId: true } });
  if (!e) throw new AuthError("No employee profile linked", 403);
  return e;
}
const inAudience = (s: { audience: Prisma.JsonValue }, deptId: string | null) => {
  const ids = deptIds(s);
  return !ids.length || (!!deptId && ids.includes(deptId));
};

/** Live surveys for this employee's audience, with whether they already answered. */
export async function surveysForMe(u: SessionUser) {
  if (!u.employeeId) return [];
  const e = await me(u);
  const [open, done] = await Promise.all([
    prisma.survey.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } }),
    prisma.surveyParticipation.findMany({ where: { employeeId: e.id }, select: { surveyId: true } }),
  ]);
  const answered = new Set(done.map((d) => d.surveyId));
  return open
    .filter((s) => isLive(s) && inAudience(s, e.departmentId))
    .map((s) => ({ id: s.id, title: s.title, description: s.description, anonymous: s.anonymous, closesAt: s.closesAt, questions: questionsOf(s), answered: answered.has(s.id) }));
}

export async function surveyToTake(u: SessionUser, id: string) {
  const e = await me(u);
  const s = await prisma.survey.findUnique({ where: { id } });
  if (!s || !inAudience(s, e.departmentId) || s.status === "DRAFT") throw notFound("Survey");
  const answered = !!(await prisma.surveyParticipation.findUnique({ where: { surveyId_employeeId: { surveyId: id, employeeId: e.id } } }));
  return { id: s.id, title: s.title, description: s.description, anonymous: s.anonymous, closesAt: s.closesAt, live: isLive(s), questions: questionsOf(s), answered };
}

/**
 * One response per employee. Participation (who) and response (what) are separate rows written in one transaction.
 * Anonymous: no employeeId on the response, a random (non time-ordered) id, date-only timestamps on both rows, and no actor in the audit log.
 * ponytail: physical row order in Postgres could still correlate the two tables for someone with raw DB access; batch writes if that matters.
 */
export async function submitSurvey(u: SessionUser, id: string, raw: Record<string, unknown>) {
  const e = await me(u);
  const s = await prisma.survey.findUnique({ where: { id } });
  if (!s || !inAudience(s, e.departmentId)) throw notFound("Survey");
  if (!isLive(s)) throw new AppError("This survey is not open");
  if (await prisma.surveyParticipation.findUnique({ where: { surveyId_employeeId: { surveyId: id, employeeId: e.id } } })) throw conflict("You already answered this survey");
  const v = validateSurveyAnswers(questionsOf(s), raw);
  if ("errors" in v) throw Object.assign(new AppError("Please answer the required questions"), { fieldErrors: v.errors });
  const at = s.anonymous ? todayDate() : new Date();
  const answers: SurveyAnswers = s.anonymous && e.departmentId ? { ...v.answers, [DEPT]: e.departmentId } : v.answers;
  try {
    await prisma.$transaction([
      prisma.surveyParticipation.create({ data: { surveyId: id, employeeId: e.id, submittedAt: at } }),
      prisma.surveyResponse.create({ data: { id: randomUUID(), surveyId: id, employeeId: s.anonymous ? null : e.id, answers, submittedAt: at } }),
    ]);
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw conflict("You already answered this survey");
    throw err;
  }
  await audit(s.anonymous ? null : u.id, "survey.respond", "Survey", id);
}

// ---------- results ----------

const shuffle = <T>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

async function loadResponses(id: string) {
  const s = await getSurvey(id);
  const [responses, participations, audience, depts] = await Promise.all([
    prisma.surveyResponse.findMany({ where: { surveyId: id }, select: { answers: true, submittedAt: true, employeeId: true } }),
    prisma.surveyParticipation.count({ where: { surveyId: id } }),
    prisma.employee.count({ where: audienceWhere(s) }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  const emps = s.anonymous
    ? []
    : await prisma.employee.findMany({ where: { id: { in: responses.map((r) => r.employeeId!).filter(Boolean) } }, select: { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, departmentId: true } });
  const empById = new Map(emps.map((x) => [x.id, x]));
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const rows = responses.map((r) => {
    const a = (r.answers ?? {}) as SurveyAnswers;
    const emp = r.employeeId ? empById.get(r.employeeId) : undefined;
    const dept = s.anonymous ? (a[DEPT] as string | undefined) : emp?.departmentId;
    return { answers: a, emp, dept: (dept && deptName.get(dept)) || "No department", submittedAt: r.submittedAt };
  });
  return { s, rows: s.anonymous ? shuffle(rows) : rows, participations, audience };
}

/** Aggregates for HR. Department breakdown: all departments when named, only groups of K_ANON_MIN+ when anonymous. */
export async function surveyResults(id: string) {
  const { s, rows, participations, audience } = await loadResponses(id);
  const questions = s.questionList;
  const byDept = rows.reduce<Record<string, SurveyAnswers[]>>((g, r) => ((g[r.dept] ??= []).push(r.answers), g), {});
  const shown = s.anonymous ? kAnonymous(byDept, K_ANON_MIN) : byDept;
  const numeric = questions.filter((q) => q.type === "nps" || q.type === "rating");
  return {
    survey: s,
    participations,
    audience,
    responseRate: audience ? Math.round((participations / audience) * 100) : 0,
    questions: questions.map((q) => ({ q, result: aggregateQuestion(q, rows.map((r) => r.answers)) })),
    departments: Object.entries(shown)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, answers]) => ({ name, count: answers.length, metrics: numeric.map((q) => ({ q, result: aggregateQuestion(q, answers) })) })),
    hiddenDepartments: Object.keys(byDept).length - Object.keys(shown).length,
  };
}

const csvCell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  // Also defuses spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV of all answers. Anonymous: no names, no dates, department only for groups of K_ANON_MIN+, shuffled rows. */
export async function surveyCsv(id: string) {
  const { s, rows } = await loadResponses(id);
  const qs = s.questionList;
  const big = new Set(Object.entries(rows.reduce<Record<string, number>>((g, r) => ((g[r.dept] = (g[r.dept] ?? 0) + 1), g), {})).filter(([, n]) => n >= K_ANON_MIN).map(([d]) => d));
  const head = [...(s.anonymous ? ["Department"] : ["Employee code", "Employee", "Department", "Submitted"]), ...qs.map((q) => q.text)];
  const body = rows.map((r) => [
    ...(s.anonymous
      ? [big.has(r.dept) ? r.dept : "Other"]
      : [r.emp?.employeeCode ?? "", r.emp ? `${r.emp.preferredName ?? r.emp.firstName} ${r.emp.lastName}` : "", r.dept, r.submittedAt.toISOString()]),
    ...qs.map((q) => r.answers[q.id] ?? ""),
  ]);
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "survey";
  return { filename: `${slug}-responses.csv`, csv: [head, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n" };
}
