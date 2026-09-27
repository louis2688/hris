import { z } from "zod";
import { GOAL_STATUSES, TRAINING_STATUSES, QUESTION_TYPES } from "../constants";

// ---------- helpers ----------

const opt = (max = 200) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const blankNum = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dateStr = z.string().min(1, "Required").refine((v) => isoDate.test(v) && !Number.isNaN(Date.parse(v)), "Use YYYY-MM-DD");
const optDate = z.union([z.literal("").transform(() => undefined), dateStr]).optional();
const arr = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(s));

/** Today (or `d`) in Asia/Manila (UTC+8, no DST) as YYYY-MM-DD. */
export const manilaISODate = (d = new Date()) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

// ---------- goals ----------

export const goalSchema = z.object({
  employeeId: opt(),
  title: z.string().trim().min(1, "Title is required").max(160),
  description: opt(2000),
  kra: opt(120),
  weight: blankNum(z.coerce.number().int().min(0).max(100).default(0)),
  dueDate: optDate,
  cycleId: opt(),
  parentId: opt(),
});
export type GoalInput = z.infer<typeof goalSchema>;

export const goalProgressSchema = z.object({
  progress: z.coerce.number().int().min(0, "0-100").max(100, "0-100"),
  status: z.enum(GOAL_STATUSES),
});
export type GoalProgressInput = z.infer<typeof goalProgressSchema>;

/** Sum of weights, ignoring dropped goals. Weights per employee per cycle should total 100 (warn only). */
export const goalWeightTotal = (goals: { weight: number; status: string }[]) => goals.filter((g) => g.status !== "DROPPED").reduce((s, g) => s + g.weight, 0);

// ---------- 1:1s ----------

export type ActionItem = { text: string; done: boolean };

export const oneOnOneSchema = z.object({
  employeeId: z.string().min(1, "Pick a direct report"),
  date: dateStr,
  agenda: opt(4000),
  notes: opt(8000),
  /** One action item per line */
  actionItems: opt(4000),
});
export type OneOnOneInput = z.infer<typeof oneOnOneSchema>;

export const agendaItemSchema = z.object({ text: z.string().trim().min(1, "Write an agenda item").max(500) });

/** Lines -> action items, keeping the done flag of items whose text did not change. */
export function parseActionItems(text: string | undefined, previous: ActionItem[] = []): ActionItem[] {
  const done = new Map(previous.map((p) => [p.text, p.done]));
  return (text ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((t) => ({ text: t.slice(0, 300), done: done.get(t) ?? false }));
}

// ---------- training ----------

export const ATTENDEE_STATUSES = ["INVITED", "ATTENDED", "ABSENT"] as const;
export type AttendeeStatus = (typeof ATTENDEE_STATUSES)[number];

export const trainingProgramSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: opt(2000),
  provider: opt(120),
  isActive: z.boolean().default(true),
});
export type TrainingProgramInput = z.infer<typeof trainingProgramSchema>;

const localDateTime = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Pick a date and time");
export const trainingEventSchema = z
  .object({
    programId: z.string().min(1, "Pick a program"),
    title: z.string().trim().min(1, "Title is required").max(160),
    /** Asia/Manila local, from <input type="datetime-local"> */
    startsAt: localDateTime,
    endsAt: localDateTime,
    location: opt(160),
    trainer: opt(120),
    cost: blankNum(z.coerce.number().min(0).max(100_000_000).optional()),
    capacity: blankNum(z.coerce.number().int().min(1).max(10_000).optional()),
    status: z.enum(TRAINING_STATUSES).default("SCHEDULED"),
  })
  .refine((d) => d.endsAt > d.startsAt, { message: "End must be after start", path: ["endsAt"] });
export type TrainingEventInput = z.infer<typeof trainingEventSchema>;

export const trainingInviteSchema = z.object({ employeeIds: arr(z.string().min(1)).pipe(z.array(z.string()).min(1, "Pick at least one employee").max(500)) });

export const trainingAttendanceSchema = z.object({
  status: z.enum(ATTENDEE_STATUSES),
  result: opt(120),
  score: blankNum(z.coerce.number().int().min(0).max(100).optional()),
});
export type TrainingAttendanceInput = z.infer<typeof trainingAttendanceSchema>;

export const trainingFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, "Pick 1-5").max(5, "Pick 1-5"),
  comment: opt(2000),
});

// ---------- surveys ----------

export const SURVEY_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
/** Department breakdowns only show groups with at least this many responses (k-anonymity). */
export const K_ANON_MIN = 5;

export const surveyQuestionSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1, "Question text is required").max(300),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .refine((q) => q.type !== "choice" || (q.options?.length ?? 0) >= 2, { message: "Choice questions need at least 2 options", path: ["options"] });
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

const jsonArr = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}, z.array(surveyQuestionSchema).min(1, "Add at least one question").max(50));

export const surveySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: opt(2000),
    anonymous: z.boolean().default(true),
    departmentIds: arr(z.string().min(1)),
    questions: jsonArr,
    opensAt: optDate,
    closesAt: optDate,
  })
  .refine((d) => !d.opensAt || !d.closesAt || d.closesAt >= d.opensAt, { message: "Close date must be on or after the open date", path: ["closesAt"] })
  .refine((d) => new Set(d.questions.map((q) => q.id)).size === d.questions.length, { message: "Question ids must be unique", path: ["questions"] });
export type SurveyInput = z.infer<typeof surveySchema>;

export type SurveyAnswers = Record<string, number | string>;

/** Validates raw answers (form strings or JSON) against the questions. Unknown keys are dropped. */
export function validateSurveyAnswers(questions: SurveyQuestion[], raw: Record<string, unknown>): { answers: SurveyAnswers } | { errors: Record<string, string> } {
  const answers: SurveyAnswers = {};
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = raw[q.id];
    const s = v == null ? "" : String(v).trim();
    if (!s) {
      if (q.required) errors[q.id] = "Required";
      continue;
    }
    if (q.type === "rating" || q.type === "nps") {
      const n = Number(s);
      const [min, max] = q.type === "rating" ? [1, 5] : [0, 10];
      if (!Number.isInteger(n) || n < min || n > max) errors[q.id] = `Pick ${min}-${max}`;
      else answers[q.id] = n;
    } else if (q.type === "choice") {
      if (!q.options?.includes(s)) errors[q.id] = "Pick one of the options";
      else answers[q.id] = s;
    } else answers[q.id] = s.slice(0, 4000);
  }
  return Object.keys(errors).length ? { errors } : { answers };
}

// ---------- aggregation (pure) ----------

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export const meanOf = (nums: number[]) => (nums.length ? round(nums.reduce((s, n) => s + n, 0) / nums.length) : null);

/** Counts per value from min..max inclusive. */
export const countByValue = (nums: number[], min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => nums.filter((n) => n === min + i).length);

/** eNPS = % promoters (9-10) - % detractors (0-6), rounded to an integer. Null if no scores. */
export function enps(scores: number[]) {
  if (!scores.length) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

/** Keep only groups with at least k members, so small groups can't be re-identified. */
export const kAnonymous = <T>(groups: Record<string, T[]>, k = K_ANON_MIN) => Object.fromEntries(Object.entries(groups).filter(([, rows]) => rows.length >= k)) as Record<string, T[]>;

export type QuestionResult =
  | { type: "rating"; count: number; average: number | null; distribution: number[] }
  | { type: "nps"; count: number; average: number | null; enps: number | null; distribution: number[] }
  | { type: "choice"; count: number; counts: { option: string; count: number }[] }
  | { type: "text"; count: number; answers: string[] };

export function aggregateQuestion(q: SurveyQuestion, answers: SurveyAnswers[]): QuestionResult {
  const vals = answers.map((a) => a[q.id]).filter((v) => v !== undefined && v !== "");
  if (q.type === "rating" || q.type === "nps") {
    const nums = vals.map(Number).filter(Number.isFinite);
    return q.type === "rating"
      ? { type: "rating", count: nums.length, average: meanOf(nums), distribution: countByValue(nums, 1, 5) }
      : { type: "nps", count: nums.length, average: meanOf(nums), enps: enps(nums), distribution: countByValue(nums, 0, 10) };
  }
  if (q.type === "choice") return { type: "choice", count: vals.length, counts: (q.options ?? []).map((o) => ({ option: o, count: vals.filter((v) => v === o).length })) };
  return { type: "text", count: vals.length, answers: vals.map(String) };
}
