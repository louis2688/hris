import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Roster cell value: "" = default shift (clears the override), "REST" = rest day, otherwise a WorkShift id. */
export const rosterSaveSchema = z.object({
  cells: z
    .array(z.object({ employeeId: z.string().min(1), date: isoDate, value: z.string().max(40) }))
    .min(1, "Nothing to save")
    .max(2000),
});
export type RosterSaveInput = z.infer<typeof rosterSaveSchema>;

export const swapRequestSchema = z.object({
  date: isoDate,
  targetId: z.string().min(1, "Pick a teammate"),
  reason: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)),
});
export type SwapRequestInput = z.infer<typeof swapRequestSchema>;

export const scheduleRangeSchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((v) => !v.from || !v.to || (v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 92 * 86400_000), "Range must be ascending and at most 93 days");
