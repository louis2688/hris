import { z } from "zod";
import { DAY_PARTS, LEAVE_STATUSES, PAGE_SIZE_MAX } from "../constants";
import { stripEmpty } from "./employee";

const dateStr = z
  .string()
  .min(1, "Required")
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "Use YYYY-MM-DD");

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(12)
    .regex(/^[A-Z0-9_]+$/, "Uppercase letters, numbers and underscore only"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex color like #2563eb").default("#2563eb"),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  allowHalfDay: z.boolean().default(true),
  defaultDays: z.coerce.number().min(0).max(365).default(0),
  maxConsecutiveDays: z.coerce.number().int().min(0).max(365).optional().or(z.literal("")).transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
  isActive: z.boolean().default(true),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;

export const leaveEntitlementSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  leaveTypeId: z.string().min(1, "Leave type is required"),
  year: z.coerce.number().int().min(2000).max(2100),
  entitledDays: z.coerce.number().min(0).max(365),
  carriedOver: z.coerce.number().min(0).max(365).default(0),
  adjustment: z.coerce.number().min(-365).max(365).default(0),
  note: z.string().trim().max(300).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});
export type LeaveEntitlementInput = z.infer<typeof leaveEntitlementSchema>;

export const bulkEntitlementSchema = z.object({
  leaveTypeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  entitledDays: z.coerce.number().min(0).max(365),
  onlyMissing: z.boolean().default(true),
});

export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: z.string().min(1, "Pick a leave type"),
    startDate: dateStr,
    endDate: dateStr,
    startDayPart: z.enum(DAY_PARTS).default("FULL"),
    endDayPart: z.enum(DAY_PARTS).default("FULL"),
    reason: z.string().trim().max(1000).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
    /** HR/Admin only: file on behalf of another employee. */
    employeeId: z.string().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date must be on or after start date", path: ["endDate"] })
  .refine((d) => !(d.startDate === d.endDate && d.startDayPart !== "FULL" && d.endDayPart !== "FULL" && d.startDayPart !== d.endDayPart), {
    message: "For a single day pick one half only",
    path: ["endDayPart"],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const decideLeaveRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;

export const cancelLeaveRequestSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});

export const leaveListQuerySchema = z.preprocess(stripEmpty, z.object({
  status: z.enum(LEAVE_STATUSES).optional(),
  employeeId: z.string().optional(),
  leaveTypeId: z.string().optional(),
  departmentId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
}));
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
