// Owned by the hiring feature: job offers, scorecards, careers page, referrals.
import { z } from "zod";
import { EMPLOYMENT_TYPES } from "../constants";

const opt = (max = 200) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const OFFER_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "WITHDRAWN", "EXPIRED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const OFFER_STATUS_TONE: Record<OfferStatus, "slate" | "blue" | "green" | "red" | "amber"> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "green",
  DECLINED: "red",
  WITHDRAWN: "slate",
  EXPIRED: "amber",
};

export const DEFAULT_OFFER_TERMS = [
  { label: "Probationary period", value: "6 months" },
  { label: "Work schedule", value: "Monday to Friday, 9:00 AM - 6:00 PM" },
  { label: "HMO", value: "Covered from day one, plus 1 free dependent upon regularization" },
  { label: "13th month pay", value: "As mandated by PD 851" },
  { label: "Leave credits", value: "15 vacation and 15 sick leave days per year" },
];

const term = z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(300) });
export type OfferTerm = z.infer<typeof term>;

export const offerSchema = z
  .object({
    jobTitleId: opt(),
    departmentId: opt(),
    employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
    payType: z.enum(["MONTHLY", "DAILY"]).default("MONTHLY"),
    basicPay: z.coerce.number().positive("Enter the basic pay").max(10_000_000),
    allowance: z.coerce.number().min(0).max(10_000_000).default(0),
    startDate: isoDate,
    expiresAt: isoDate.optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
    terms: z.array(term).max(20).default([]),
  })
  .refine((d) => !d.expiresAt || d.expiresAt <= d.startDate, { path: ["expiresAt"], message: "Must be on or before the start date" });
export type OfferInput = z.infer<typeof offerSchema>;

/** FormData "termLabel"/"termValue" pairs (single or repeated) -> terms[], blank rows dropped. */
export function termsFromForm(o: Record<string, unknown>): OfferTerm[] {
  const arr = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);
  const labels = arr(o.termLabel);
  const values = arr(o.termValue);
  return labels.map((label, i) => ({ label: label.trim(), value: (values[i] ?? "").trim() })).filter((t) => t.label && t.value);
}

export const offerAcceptSchema = z.object({
  name: z.string().trim().min(1, "Type your full name").max(160),
  agree: z.literal(true, { error: "Tick the box to accept the terms" }),
});
export const offerDeclineSchema = z.object({ reason: opt(1000) });

/** Typed signature must equal the candidate's name, ignoring case and extra spaces. */
export const namesMatch = (typed: string, expected: string) => {
  const n = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  return n(typed) !== "" && n(typed) === n(expected);
};

// ---------- scorecards ----------

export const RECOMMENDATIONS = ["STRONG_YES", "YES", "NO", "STRONG_NO"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = { STRONG_YES: "Strong yes", YES: "Yes", NO: "No", STRONG_NO: "Strong no" };
export const RECOMMENDATION_TONE: Record<Recommendation, "green" | "blue" | "amber" | "red"> = { STRONG_YES: "green", YES: "blue", NO: "amber", STRONG_NO: "red" };
export const DEFAULT_CRITERIA = ["Communication", "Technical skills", "Problem solving", "Culture add", "Role fit"];

const score = z.coerce.number().int().min(1, "Score 1 to 5").max(5, "Score 1 to 5");
export const feedbackSchema = z.object({
  scores: z.record(z.string().min(1).max(60), score),
  rating: score,
  recommendation: z.enum(RECOMMENDATIONS, { error: "Pick a recommendation" }),
  comments: opt(3000),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const criteriaSchema = z.object({
  criteria: z
    .string()
    .transform((s) => [...new Set(s.split("\n").map((l) => l.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(60, "Keep each criterion under 60 characters")).min(1, "Add at least one criterion").max(10, "Up to 10 criteria")),
});

type Fb = { scores: unknown; rating: number; recommendation: Recommendation };
/** Average per criterion (only criteria someone scored), average overall rating and recommendation counts. */
export function summarizeFeedback(rows: Fb[], criteria: string[]) {
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const keys = [...new Set([...criteria, ...rows.flatMap((r) => Object.keys((r.scores ?? {}) as object))])];
  const perCriterion = keys
    .map((k) => ({ criterion: k, avg: avg(rows.map((r) => Number((r.scores as Record<string, unknown>)?.[k])).filter((n) => n >= 1 && n <= 5)) }))
    .filter((c) => c.avg !== null) as { criterion: string; avg: number }[];
  const counts = Object.fromEntries(RECOMMENDATIONS.map((r) => [r, rows.filter((x) => x.recommendation === r).length])) as Record<Recommendation, number>;
  return { count: rows.length, rating: avg(rows.map((r) => r.rating)), perCriterion, counts };
}

// ---------- careers ----------

export const careersApplySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  phone: z.string().trim().min(7, "Enter a mobile number").max(40),
  referralCode: opt(30),
  consent: z.literal(true, { error: "Please give your consent so we can process your application" }),
});

export function slugify(s: string) {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "job"
  );
}

// ---------- referrals ----------

export const REFERRAL_MIN_DAYS = 90;

/** Pure eligibility rule for the daily referral-bonus job. `today` is a UTC-midnight date (Manila calendar day). */
export function referralBonusDue(
  c: {
    referrerId: string | null;
    referralBonusAdjustmentId: string | null;
    bonus: number | null;
    hire: { hireDate: Date; employmentStatus: string; terminationDate: Date | null; deletedAt: Date | null } | null;
  },
  today: Date,
) {
  if (!c.referrerId || c.referralBonusAdjustmentId || !c.hire || !c.bonus || c.bonus <= 0) return false;
  const h = c.hire;
  if (h.deletedAt || !["ACTIVE", "PROBATION", "ON_LEAVE"].includes(h.employmentStatus)) return false;
  if (h.terminationDate && h.terminationDate <= today) return false;
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - REFERRAL_MIN_DAYS);
  return h.hireDate <= cutoff;
}
