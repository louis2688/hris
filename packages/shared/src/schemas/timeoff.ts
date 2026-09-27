import { z } from "zod";
import { CORRECTION_KINDS } from "../constants";
import { correctionNeeds } from "../timeoff";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");
const optTime = hhmm.optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const opt = (max = 300) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const reason = z.string().trim().min(3, "Give a short reason").max(500);

/** Corrections can be filed for yesterday back to this many days. */
export const CORRECTION_MAX_DAYS_BACK = 30;
/** Comp-off can be claimed for rest days / holidays worked within this many days. */
export const COMPOFF_MAX_DAYS_BACK = 60;
export const SHIFT_CHANGE_MAX_DAYS = 31;

export const correctionSchema = z
  .object({ date: isoDate, kind: z.enum(CORRECTION_KINDS), inTime: optTime, outTime: optTime, reason })
  .superRefine((d, ctx) => {
    const need = correctionNeeds(d.kind);
    if (need.in && !d.inTime) ctx.addIssue({ code: "custom", path: ["inTime"], message: "Time in is required" });
    if (need.out && !d.outTime) ctx.addIssue({ code: "custom", path: ["outTime"], message: "Time out is required" });
  });
export type CorrectionInput = z.infer<typeof correctionSchema>;

export const decisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: opt(500) });
export type DecisionInput = z.infer<typeof decisionSchema>;

export const compOffSchema = z.object({
  workDate: isoDate,
  days: z.coerce.number().refine((v) => v === 0.5 || v === 1, "Half or whole day"),
  leaveTypeId: z.string().min(1, "Pick a leave type"),
  reason,
});
export type CompOffInput = z.infer<typeof compOffSchema>;

export const encashmentSchema = z.object({
  leaveTypeId: z.string().min(1, "Pick a leave type"),
  days: z.coerce.number().min(0.5, "At least half a day").max(365).multipleOf(0.5, "Use half-day steps"),
});
export type EncashmentInput = z.infer<typeof encashmentSchema>;

export const blockDateSchema = z
  .object({ name: z.string().trim().min(1, "Name is required").max(100), from: isoDate, to: isoDate, departmentId: opt(40) })
  .refine((d) => d.to >= d.from, { message: "End must be on or after start", path: ["to"] });
export type BlockDateInput = z.infer<typeof blockDateSchema>;

export const shiftChangeSchema = z
  .object({ from: isoDate, to: isoDate, shiftId: z.string().min(1, "Pick a shift or rest day"), reason })
  .refine((d) => d.to >= d.from, { message: "End must be on or after start", path: ["to"] })
  .refine((d) => d.to < d.from || Date.parse(d.to) - Date.parse(d.from) < SHIFT_CHANGE_MAX_DAYS * 86400_000, { message: `At most ${SHIFT_CHANGE_MAX_DAYS} days`, path: ["to"] });
export type ShiftChangeInput = z.infer<typeof shiftChangeSchema>;

/** Weekly availability: one entry per weekday that has a preference; missing weekday = any time. */
export const availabilitySchema = z.object({
  days: z
    .array(
      z
        .object({ weekday: z.number().int().min(0).max(6), fromTime: hhmm.nullable(), toTime: hhmm.nullable() })
        .refine((d) => (d.fromTime === null) === (d.toTime === null), "Set both times or neither"),
    )
    .max(7),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const importSchema = z.object({ text: z.string().trim().min(1, "Paste or upload a file first").max(1_000_000, "File is too large (1 MB max)") });
