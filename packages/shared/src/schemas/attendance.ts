import { z } from "zod";
import { PUNCH_METHODS } from "../constants";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const opt = (max = 200) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const bool = z.union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")]).optional().transform((v) => v === true || v === "on" || v === "true");

export const workShiftSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.coerce.number().int().min(0).max(240),
  graceMinutes: z.coerce.number().int().min(0).max(120),
  workDays: z
    .string()
    .trim()
    .regex(/^[0-6](\s*,\s*[0-6])*$/, "Comma separated 0-6 (0 = Sunday)")
    .transform((s) => [...new Set(s.split(",").map((x) => Number(x.trim())))].sort()),
  isDefault: bool,
});
export type WorkShiftInput = z.infer<typeof workShiftSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  client: opt(100),
  isActive: bool,
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const manualPunchSchema = z.object({
  employeeId: z.string().min(1, "Pick an employee"),
  date: isoDate,
  time: hhmm,
  direction: z.enum(["IN", "OUT"]).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  note: z.string().trim().min(3, "Say why this punch is being added").max(300),
});
export type ManualPunchInput = z.infer<typeof manualPunchSchema>;

export const deviceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  serial: z.string().trim().min(3, "Serial is required").max(60),
  locationId: opt(),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const attendancePolicySchema = z.object({
  requirePasskey: bool,
  requirePhoto: bool,
  requireLocation: bool,
});
export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;

/** Generic device push (non-ZKTeco terminals or middleware). */
export const devicePunchesSchema = z.object({
  punches: z
    .array(
      z.object({
        biometricId: z.string().trim().min(1).max(40),
        at: z.iso.datetime({ offset: true }),
        method: z.enum(PUNCH_METHODS).default("FINGERPRINT"),
        direction: z.enum(["IN", "OUT"]).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export const timesheetEntriesSchema = z.object({
  entries: z
    .array(
      z.object({
        projectId: z.string().min(1),
        activity: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)),
        date: isoDate,
        hours: z.coerce.number().min(0).max(24),
      }),
    )
    .max(200),
});
export type TimesheetEntriesInput = z.infer<typeof timesheetEntriesSchema>;
