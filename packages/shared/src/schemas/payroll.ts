// Owned by the payroll feature. Zod schemas and constants go here.
import { z } from "zod";

export * from "../payroll";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const money = z.coerce.number({ error: "Enter an amount" }).min(0, "Cannot be negative").max(99_999_999);

export const PAYROLL_STATUSES = ["DRAFT", "FINALIZED", "PAID"] as const;
export const PAYROLL_STATUS_LABELS = { DRAFT: "Draft", FINALIZED: "Finalized", PAID: "Paid" } as const;
export const PAYROLL_KIND_LABELS = { REGULAR: "Regular", THIRTEENTH_MONTH: "13th month", OFF_CYCLE: "Off-cycle", FINAL_PAY: "Final pay" } as const;
export const PAY_TYPE_LABELS = { MONTHLY: "Monthly", DAILY: "Daily" } as const;

export const createPayrollRunSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    kind: z.enum(["REGULAR", "THIRTEENTH_MONTH"]).default("REGULAR"),
    frequency: z.enum(["SEMI_MONTHLY", "MONTHLY"]).default("SEMI_MONTHLY"),
    periodStart: isoDate,
    periodEnd: isoDate,
    payDate: isoDate,
  })
  .refine((d) => d.periodEnd >= d.periodStart, { path: ["periodEnd"], message: "End must be on or after start" })
  .refine((d) => d.kind === "THIRTEENTH_MONTH" || d.frequency === "MONTHLY" || (d.periodStart.slice(0, 7) === d.periodEnd.slice(0, 7) && ["01", "16"].includes(d.periodStart.slice(8))), {
    path: ["periodStart"],
    message: "Semi-monthly cutoffs run 1st-15th or 16th-end of one month",
  });
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

const govId = (label: string) =>
  z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9-]*$/, `${label}: digits and dashes only`)
    .optional()
    .transform((v) => (v ? v : null));

export const compensationSchema = z.object({
  payType: z.enum(["MONTHLY", "DAILY"]),
  basicPay: z.union([z.literal(""), money]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  allowance: z.union([z.literal(""), money]).optional().transform((v) => (v === "" || v === undefined ? 0 : v)),
  tin: govId("TIN"),
  sssNo: govId("SSS"),
  philhealthNo: govId("PhilHealth"),
  pagibigNo: govId("Pag-IBIG"),
});
export type CompensationInput = z.infer<typeof compensationSchema>;

export const companySettingsSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(160),
  address: z.string().trim().max(300).default(""),
  tin: z.string().trim().max(30).default(""),
  signatoryName: z.string().trim().max(120).default(""),
  signatoryTitle: z.string().trim().max(120).default(""),
});

const rate = z.coerce.number().min(0).max(1);
const pesos = z.coerce.number().min(0).max(10_000_000);
const mult = z.coerce.number().min(0).max(10);
const bracket = z.object({ over: pesos, base: pesos, rate });
const brackets = z.array(bracket).min(1).max(12);

/** Full rates config as edited in Settings > Payroll. Tax tables arrive as JSON text. */
export const payrollConfigSchema = z.object({
  sss: z.object({ eeRate: rate, erRate: rate, mscMin: pesos, mscMax: pesos, mscStep: pesos.min(1), regularMscMax: pesos, ecLow: pesos, ecHigh: pesos, ecThreshold: pesos }),
  philhealth: z.object({ rate, floor: pesos, ceiling: pesos, eeShare: rate }),
  pagibig: z.object({ eeRateLow: rate, lowThreshold: pesos, eeRate: rate, erRate: rate, maxFundSalary: pesos }),
  tax: z.object({ semiMonthly: brackets, monthly: brackets }),
  premiums: z.object({
    overtime: mult,
    restDay: mult,
    restDayOt: mult,
    specialHoliday: mult,
    specialHolidayOt: mult,
    specialHolidayRestDay: mult,
    specialHolidayRestDayOt: mult,
    regularHoliday: mult,
    regularHolidayOt: mult,
    regularHolidayRestDay: mult,
    regularHolidayRestDayOt: mult,
    nightDiff: rate,
  }),
  daysPerYear: z.coerce.number().int().min(200).max(366),
  hoursPerDay: z.coerce.number().min(1).max(12),
  contributionTiming: z.enum(["SPLIT", "SECOND_HALF"]),
  thirteenthMonthExempt: pesos,
  schedule: z.object({
    frequency: z.enum(["SEMI_MONTHLY", "MONTHLY"]),
    firstPayDay: z.coerce.number().int().min(0).max(31),
    secondPayDay: z.coerce.number().int().min(0).max(31),
  }),
});

/** Rate fields the settings form shows as percentages (5 = 5%); premiums are all percentages (125 = 125%). */
export const PAYROLL_PERCENT_FIELDS = new Set(["sss.eeRate", "sss.erRate", "philhealth.rate", "philhealth.eeShare", "pagibig.eeRateLow", "pagibig.eeRate", "pagibig.erRate"]);
export const isPayrollPercentField = (k: string) => k.startsWith("premiums.") || PAYROLL_PERCENT_FIELDS.has(k);

/** Flat form fields ("sss.eeRate" in %, "tax.monthly" as JSON text) -> nested object for payrollConfigSchema. */
export function unflattenPayrollForm(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, Record<string, unknown> | unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const [group, key] = k.split(".");
    if (!group) continue;
    if (!key) {
      out[group] = v;
      continue;
    }
    let val: unknown = v;
    if (isPayrollPercentField(k) && v !== "" && !Number.isNaN(Number(v))) val = Math.round(Number(v) * 1e4) / 1e6;
    if (group === "tax") {
      try {
        val = JSON.parse(String(v));
      } catch {
        val = "invalid";
      }
    }
    ((out[group] ??= {}) as Record<string, unknown>)[key] = val;
  }
  return out;
}
