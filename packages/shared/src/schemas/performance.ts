import { z } from "zod";

export const REVIEW_CYCLE_STATUSES = ["DRAFT", "ACTIVE", "CLOSED"] as const;
export type ReviewCycleStatus = (typeof REVIEW_CYCLE_STATUSES)[number];
export const REVIEW_STATUSES = ["SELF_REVIEW", "MANAGER_REVIEW", "COMPLETED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { SELF_REVIEW: "Self review", MANAGER_REVIEW: "Manager review", COMPLETED: "Completed" };
/** Final ratings are normalized onto this scale regardless of each KPI's own range. */
export const FINAL_RATING_SCALE = 5;

const opt = (max = 200) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const blankNum = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" ? undefined : v), s);
const dateStr = z.string().min(1, "Required").refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "Use YYYY-MM-DD");

export const kpiSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    description: opt(1000),
    jobTitleId: opt(),
    minRating: blankNum(z.coerce.number().int().min(0).max(10).default(1)),
    maxRating: blankNum(z.coerce.number().int().min(1).max(10).default(5)),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.maxRating > d.minRating, { message: "Max must be greater than min", path: ["maxRating"] });
export type KpiInput = z.infer<typeof kpiSchema>;

export const reviewCycleSchema = z
  .object({ name: z.string().trim().min(1, "Name is required").max(80), periodStart: dateStr, periodEnd: dateStr, dueDate: dateStr })
  .refine((d) => d.periodEnd >= d.periodStart, { message: "End must be on or after start", path: ["periodEnd"] })
  .refine((d) => d.dueDate >= d.periodStart, { message: "Due date must be after the period starts", path: ["dueDate"] });
export type ReviewCycleInput = z.infer<typeof reviewCycleSchema>;

const rating = z.union([z.literal("").transform(() => undefined), z.coerce.number().int()]).optional();

/** Same shape for both sides: per-item rating + comment, an overall comment, and save-vs-submit. */
export const reviewFormSchema = z.object({
  intent: z.enum(["save", "submit"]).default("submit"),
  comment: opt(5000),
  items: z.array(z.object({ id: z.string().min(1), rating, comment: opt(2000) })).default([]),
});
export type ReviewFormInput = z.infer<typeof reviewFormSchema>;
export const selfReviewSchema = reviewFormSchema;
export const managerReviewSchema = reviewFormSchema;

/** Average of manager ratings, each mapped onto 1..FINAL_RATING_SCALE, rounded to 2 decimals. Null if nothing rated. */
export function computeFinalRating(items: { rating: number | null | undefined; minRating: number; maxRating: number }[]): number | null {
  const rated = items.filter((i): i is { rating: number; minRating: number; maxRating: number } => i.rating != null);
  if (!rated.length) return null;
  const avg = rated.reduce((s, i) => s + 1 + ((i.rating - i.minRating) / (i.maxRating - i.minRating)) * (FINAL_RATING_SCALE - 1), 0) / rated.length;
  return Math.round(avg * 100) / 100;
}
