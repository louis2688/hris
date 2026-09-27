// Owned by the payroll feature. Zod schemas and constants go here.
import { z } from "zod";
import { isPayrollPercentField, ADJUSTMENT_PRESETS, type AdjustmentPreset, ADJUSTMENT_CSV_COLUMNS, SEPARATION_REASONS, EXIT_QUESTIONS } from "../constants";

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
    kind: z.enum(["REGULAR", "THIRTEENTH_MONTH", "OFF_CYCLE"]).default("REGULAR"),
    frequency: z.enum(["SEMI_MONTHLY", "MONTHLY"]).default("SEMI_MONTHLY"),
    periodStart: isoDate,
    periodEnd: isoDate,
    payDate: isoDate,
  })
  .refine((d) => d.periodEnd >= d.periodStart, { path: ["periodEnd"], message: "End must be on or after start" })
  .refine((d) => d.kind !== "REGULAR" || d.frequency === "MONTHLY" || (d.periodStart.slice(0, 7) === d.periodEnd.slice(0, 7) && ["01", "16"].includes(d.periodStart.slice(8))), {
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
  /** Blank = today. Future dates are applied by the daily job. */
  effectiveFrom: z.union([z.literal(""), isoDate]).optional().transform((v) => (v ? v : null)),
  reason: optText(200),
  bankName: optText(80),
  bankAccountNo: z
    .string()
    .trim()
    .max(34)
    .regex(/^[0-9 -]*$/, "Digits, spaces and dashes only")
    .optional()
    .transform((v) => (v ? v : null)),
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
  offCycleTax: z.object({ method: z.enum(["TABLE", "FLAT"]), flatRate: rate }),
});

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

const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());
const optDate = z.union([z.literal(""), isoDate]).optional().transform((v) => (v ? v : null));
const pesosAmount = z.coerce
  .number({ error: "Enter an amount" })
  .positive("Must be more than zero")
  .max(99_999_999)
  .transform((v) => Math.round(v * 100) / 100);

// ---------- Adjustments ----------

/** Codes other features write (leave encashment, referral bonus) plus the presets. */
export const ADJUSTMENT_CODE_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ADJUSTMENT_PRESETS).map(([k, v]) => [k, v.label])),
  LEAVE_ENCASH: "Leave encashment",
  REFERRAL: "Referral bonus",
};

export const adjustmentSchema = z
  .object({
    employeeId: z.string().trim().min(1, "Pick an employee"),
    kind: z.enum(["EARNING", "DEDUCTION"]),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]{2,30}$/, "Letters, digits and _ only"),
    label: z.string().trim().min(1, "Label is required").max(120),
    amount: pesosAmount,
    taxable: checkbox,
    effectiveDate: isoDate,
    recurring: checkbox,
    endDate: optDate,
    note: optText(500),
  })
  .refine((d) => !d.endDate || d.endDate >= d.effectiveDate, { path: ["endDate"], message: "End must be on or after the effective date" })
  .transform((d) => ({ ...d, endDate: d.recurring ? d.endDate : null }));
export type AdjustmentFormInput = z.infer<typeof adjustmentSchema>;

const yes = (v: string) => ["y", "yes", "true", "1"].includes(v.trim().toLowerCase());

/** Minimal RFC 4180 reader: quoted fields, "" escapes, CRLF. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let k = 0; k < src.length; k++) {
    const ch = src[k]!;
    if (q) {
      if (ch === '"' && src[k + 1] === '"') {
        cell += '"';
        k++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[k + 1] === "\n") k++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export type AdjustmentCsvRow = { employeeCode: string; kind: "EARNING" | "DEDUCTION"; code: string; label: string; amount: number; taxable: boolean; effectiveDate: string };

/** Bulk import: every row must be valid or nothing is imported. Blank kind/label/taxable default from the code preset. */
export function parseAdjustmentCsv(text: string): { rows: AdjustmentCsvRow[]; errors: string[] } {
  const [header, ...body] = parseCsvText(text);
  if (!header) return { rows: [], errors: ["The file is empty"] };
  const idx = ADJUSTMENT_CSV_COLUMNS.map((c) => header.findIndex((h) => h.trim().toLowerCase() === c.toLowerCase()));
  const missing = ADJUSTMENT_CSV_COLUMNS.filter((c, k) => idx[k] === -1 && ["employeeCode", "code", "amount", "effectiveDate"].includes(c));
  if (missing.length) return { rows: [], errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`] };
  if (body.length > 1000) return { rows: [], errors: ["At most 1,000 rows per import"] };
  const rows: AdjustmentCsvRow[] = [];
  const errors: string[] = [];
  body.forEach((cells, n) => {
    const get = (c: (typeof ADJUSTMENT_CSV_COLUMNS)[number]) => (cells[idx[ADJUSTMENT_CSV_COLUMNS.indexOf(c)]!] ?? "").trim();
    const code = get("code").toUpperCase();
    const preset = ADJUSTMENT_PRESETS[code as AdjustmentPreset] as { label: string; kind: "EARNING" | "DEDUCTION"; taxable: boolean } | undefined;
    const r = adjustmentSchema.safeParse({
      employeeId: get("employeeCode"),
      kind: (get("kind") || preset?.kind || "").toUpperCase(),
      code,
      label: get("label") || preset?.label || ADJUSTMENT_CODE_LABELS[code] || "",
      amount: get("amount").replace(/,/g, ""),
      taxable: get("taxable") ? yes(get("taxable")) : (preset?.taxable ?? true),
      effectiveDate: get("effectiveDate"),
      recurring: false,
    });
    if (r.success) rows.push({ employeeCode: r.data.employeeId, kind: r.data.kind, code: r.data.code, label: r.data.label, amount: r.data.amount, taxable: r.data.taxable, effectiveDate: r.data.effectiveDate });
    else errors.push(`Row ${n + 2}: ${r.error.issues.map((i) => `${i.path.join(".") === "employeeId" ? "employeeCode" : i.path.join(".")} ${i.message.toLowerCase()}`).join("; ")}`);
  });
  return { rows, errors };
}

// ---------- Separations ----------

export const SEPARATION_STATUS_LABELS = { CLEARANCE: "Clearance", FINAL_PAY: "Final pay", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;
/** Employee status once the separation completes. */
export const separationStatusFor = (reason: (typeof SEPARATION_REASONS)[number]) => (reason === "TERMINATION" || reason === "END_OF_CONTRACT" ? "TERMINATED" : "RESIGNED");
/** DOLE Labor Advisory 06-2020: final pay within 30 days of separation. */
export const finalPayDeadline = (lastDay: string) => new Date(Date.parse(`${lastDay}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);

export const startSeparationSchema = z
  .object({
    employeeId: z.string().trim().min(1, "Pick an employee"),
    reason: z.enum(SEPARATION_REASONS),
    noticeDate: optDate,
    lastDay: isoDate,
    notes: optText(2000),
  })
  .refine((d) => !d.noticeDate || d.noticeDate <= d.lastDay, { path: ["lastDay"], message: "Last day must be on or after the notice date" });

export const exitInterviewSchema = z.object({
  reason: z.string().trim().min(1, "Required").max(2000),
  didWell: z.string().trim().max(2000).default(""),
  improve: z.string().trim().max(2000).default(""),
  recommend: z.enum(["Yes", "Maybe", "No"]),
  rehireEligible: checkbox,
});
export type ExitInterview = { answers: { key: keyof typeof EXIT_QUESTIONS; q: string; a: string }[]; rehireEligible: boolean; at: string };

export const finalPaySchema = z.object({
  encashDays: z.coerce.number().min(0, "Cannot be negative").max(365),
  deductAssets: checkbox,
});

// ---------- Benefits ----------

export const BENEFIT_KINDS = { HMO: "HMO", LIFE: "Life insurance", DENTAL: "Dental", OTHER: "Other" } as const;
const share = z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]).optional().transform((v) => (v === "" || v === undefined ? 0 : Math.round(v * 100) / 100));
export const benefitPlanSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  provider: z.string().trim().min(1, "Provider is required").max(120),
  kind: z.enum(["HMO", "LIFE", "DENTAL", "OTHER"]),
  employerShare: share,
  employeeShare: share,
  perDependentShare: share,
  isActive: checkbox,
});

export type BenefitDependent = { name: string; relationship: string; birthDate: string | null };
/** One dependent per line: "Name | Relationship | YYYY-MM-DD" (birth date optional). */
export function parseDependents(text: string): { dependents: BenefitDependent[]; error?: string } {
  const dependents: BenefitDependent[] = [];
  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const [name = "", relationship = "", birthDate = ""] = raw.split("|").map((s) => s.trim());
    if (!name || !relationship) return { dependents, error: `Line ${n + 1}: use "Name | Relationship | YYYY-MM-DD"` };
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { dependents, error: `Line ${n + 1}: birth date must be YYYY-MM-DD` };
    dependents.push({ name: name.slice(0, 120), relationship: relationship.slice(0, 40), birthDate: birthDate || null });
  }
  return dependents.length > 20 ? { dependents, error: "At most 20 dependents" } : { dependents };
}

export const enrollmentSchema = z
  .object({
    employeeId: z.string().trim().min(1, "Pick an employee"),
    planId: z.string().trim().min(1, "Pick a plan"),
    effectiveFrom: isoDate,
    effectiveTo: optDate,
    cardNo: optText(60),
    dependents: z.string().max(5000).default(""),
  })
  .refine((d) => !d.effectiveTo || d.effectiveTo >= d.effectiveFrom, { path: ["effectiveTo"], message: "End must be on or after the start" })
  .transform((d, ctx) => {
    const p = parseDependents(d.dependents);
    if (p.error) ctx.addIssue({ code: "custom", path: ["dependents"], message: p.error });
    return { ...d, dependents: p.dependents };
  });

/** Monthly cost of one enrollment: employer share, employee share + per-dependent share for each dependent. */
export const enrollmentCost = (plan: { employerShare: number; employeeShare: number; perDependentShare: number }, dependents: number) => ({
  er: plan.employerShare,
  ee: Math.round((plan.employeeShare + plan.perDependentShare * dependents) * 100) / 100,
});

// ---------- Accounting ----------

const account = z.string().trim().min(1, "Required").max(80);
export const accountMapSchema = z.object({
  salariesExpense: account,
  employerContribExpense: account,
  reimbursements: account,
  sssPayable: account,
  philhealthPayable: account,
  pagibigPayable: account,
  taxPayable: account,
  loansReceivable: account,
  employeeAdvances: account,
  otherDeductions: account,
  netPayPayable: account,
  costCenters: z.record(z.string(), z.string().trim().max(40)).transform((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v))),
});
