// Owned by the requests feature. Zod schemas and constants go here.
import { z } from "zod";
import { EXPENSE_CATEGORIES, LOAN_TYPES, otMinutes } from "../constants";

/** Overtime can be filed up to this many days after the fact. */
export const OT_MAX_AGE_DAYS = 30;

export const REQUEST_STATUS_LABELS = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" } as const;
export const LOAN_STATUS_LABELS = { PENDING: "Pending", ACTIVE: "Active", PAID: "Paid", REJECTED: "Rejected", CANCELLED: "Cancelled" } as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const text = (max: number, msg = "Required") => z.string().trim().min(1, msg).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
/** PHP amount: positive, max 2 decimals, fits Decimal(12,2). Kept as a string so Prisma stores it exactly. */
const peso = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, `${label} must be a number with up to 2 decimals`))
    .refine((v) => Number(v) > 0, `${label} must be more than 0`);

export const overtimeSchema = z
  .object({ date: isoDate, startTime: hhmm, endTime: hhmm, reason: text(500, "Say what the overtime was for") })
  .refine((d) => d.startTime !== d.endTime, { message: "End time must differ from start time", path: ["endTime"] })
  .refine((d) => otMinutes(d.startTime, d.endTime) <= 16 * 60, { message: "Overtime cannot exceed 16 hours", path: ["endTime"] });
export type OvertimeInput = z.infer<typeof overtimeSchema>;

export const coeSchema = z.object({
  purpose: text(200, "Tell HR what the certificate is for"),
  includeCompensation: z.boolean().default(false),
});
export type CoeInput = z.infer<typeof coeSchema>;

export const expenseSchema = z.object({
  date: isoDate,
  category: z.enum(EXPENSE_CATEGORIES, { message: "Pick a category" }),
  amount: peso("Amount"),
  description: text(500, "Describe the expense"),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const loanSchema = z
  .object({
    /** HR/Admin only: create an active loan directly for this employee. */
    employeeId: optText(40),
    type: z.enum(LOAN_TYPES, { message: "Pick a loan type" }),
    principal: peso("Principal"),
    amortization: peso("Amortization"),
    startDate: isoDate,
    reason: optText(500),
  })
  .refine((d) => Number(d.amortization) <= Number(d.principal), { message: "Amortization cannot exceed the principal", path: ["amortization"] });
export type LoanInput = z.infer<typeof loanSchema>;

export const requestDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optText(1000),
});
export type RequestDecisionInput = z.infer<typeof requestDecisionSchema>;

export const REQUEST_KINDS = ["overtime", "coe", "expenses", "loans"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
