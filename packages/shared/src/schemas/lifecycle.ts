// Lifecycle: employment events, grievance/disciplinary cases, custom fields, document ack/expiry.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((v) => (v ? v : undefined));
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// ---------- Employment events ----------

export const EMPLOYMENT_EVENT_TYPES = ["HIRE", "PROMOTION", "TRANSFER", "SALARY_CHANGE", "STATUS_CHANGE", "SEPARATION"] as const;
export type EmploymentEventType = (typeof EMPLOYMENT_EVENT_TYPES)[number];
export const EMPLOYMENT_EVENT_LABELS: Record<EmploymentEventType, string> = {
  HIRE: "Hired",
  PROMOTION: "Promotion",
  TRANSFER: "Transfer",
  SALARY_CHANGE: "Salary change",
  STATUS_CHANGE: "Status change",
  SEPARATION: "Separation",
};
/** Types HR records from the "Record change" dialog. SALARY_CHANGE / SEPARATION come from payroll. */
export const RECORDABLE_EVENT_TYPES = ["PROMOTION", "TRANSFER", "STATUS_CHANGE"] as const;
/** Status changes via "Record change"; separations go through the separation flow. */
export const EVENT_STATUS_OPTIONS = ["PROBATION", "ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;

export const recordChangeSchema = z
  .object({
    type: z.enum(RECORDABLE_EVENT_TYPES),
    effectiveDate: isoDate,
    jobTitleId: optId,
    departmentId: optId,
    locationId: optId,
    managerId: optId,
    employmentStatus: z
      .enum(EVENT_STATUS_OPTIONS)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    note: optText(1000),
  })
  .superRefine((d, ctx) => {
    if (d.type === "PROMOTION" && !d.jobTitleId) ctx.addIssue({ code: "custom", path: ["jobTitleId"], message: "Pick the new job title" });
    if (d.type === "TRANSFER" && !d.departmentId && !d.locationId && !d.managerId)
      ctx.addIssue({ code: "custom", path: ["departmentId"], message: "Pick a new department, location or manager" });
    if (d.type === "STATUS_CHANGE" && !d.employmentStatus) ctx.addIssue({ code: "custom", path: ["employmentStatus"], message: "Pick the new status" });
  });
export type RecordChangeInput = z.infer<typeof recordChangeSchema>;

// ---------- Cases (PH twin-notice due process) ----------

export const CASE_TYPES = ["GRIEVANCE", "INCIDENT", "DISCIPLINARY"] as const;
export const CASE_TYPE_LABELS: Record<(typeof CASE_TYPES)[number], string> = { GRIEVANCE: "Grievance", INCIDENT: "Incident", DISCIPLINARY: "Disciplinary" };
export const CASE_STATUSES = ["OPEN", "NTE_ISSUED", "EXPLANATION_RECEIVED", "HEARING", "DECISION", "CLOSED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: "Open",
  NTE_ISSUED: "NTE issued",
  EXPLANATION_RECEIVED: "Explanation received",
  HEARING: "Hearing",
  DECISION: "Decision",
  CLOSED: "Closed",
};
export const SANCTIONS = ["NONE", "VERBAL_WARNING", "WRITTEN_WARNING", "SUSPENSION", "TERMINATION"] as const;
export const SANCTION_LABELS: Record<(typeof SANCTIONS)[number], string> = {
  NONE: "None",
  VERBAL_WARNING: "Verbal warning",
  WRITTEN_WARNING: "Written warning",
  SUSPENSION: "Suspension",
  TERMINATION: "Termination",
};
/** Labor Code / DOLE: the employee gets at least 5 calendar days to explain. */
export const NTE_MIN_DAYS = 5;

export const createCaseSchema = z.object({
  employeeId: z.string().trim().min(1, "Pick the employee"),
  type: z.enum(CASE_TYPES),
  title: z.string().trim().min(3, "Add a short title").max(160),
  description: z.string().trim().min(10, "Describe what happened").max(10000),
  confidential: z.boolean().default(true),
});
export const issueNteSchema = z.object({
  /** Specific acts or omissions charged, the rule violated and possible sanction. */
  nteText: z.string().trim().min(20, "Spell out the specific acts, the rule involved and the possible sanction").max(10000),
  dueDate: isoDate,
});
export const caseExplanationSchema = z.object({ explanation: z.string().trim().min(10, "Write your explanation").max(20000) });
export const caseHearingSchema = z.object({
  hearingAt: z.string().min(1, "Pick a date and time").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  note: optText(2000),
});
export const caseDecisionSchema = z
  .object({
    decision: z.string().trim().min(20, "Write the findings and decision").max(20000),
    sanction: z.enum(SANCTIONS),
    suspensionDays: z.coerce.number().int().min(1).max(30).optional().catch(undefined),
  })
  .refine((d) => d.sanction !== "SUSPENSION" || !!d.suspensionDays, { path: ["suspensionDays"], message: "How many days?" });
export const closeCaseSchema = z.object({ note: optText(2000) });

export function sanctionText(s: (typeof SANCTIONS)[number], days?: number) {
  return s === "SUSPENSION" ? `Suspension (${days} day${days === 1 ? "" : "s"})` : SANCTION_LABELS[s];
}

// ---------- Custom fields ----------

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = { TEXT: "Text", NUMBER: "Number", DATE: "Date", SELECT: "Dropdown", BOOLEAN: "Yes / No" };

export const customFieldDefSchema = z
  .object({
    label: z.string().trim().min(1, "Label is required").max(80),
    type: z.enum(CUSTOM_FIELD_TYPES),
    /** One option per line (SELECT only). */
    options: z
      .string()
      .max(4000)
      .optional()
      .transform((v) => [...new Set((v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].slice(0, 100)),
    required: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).catch(0),
  })
  .refine((d) => d.type !== "SELECT" || d.options.length > 0, { path: ["options"], message: "Add at least one option" });
export type CustomFieldDefInput = z.infer<typeof customFieldDefSchema>;

export const slugKey = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "field";

export type CustomFieldDefLike = { key: string; label: string; type: CustomFieldType; options: string[]; required: boolean };
export type CustomFieldValue = string | number | boolean;

/** Zod schema for one field's raw form value ("" = empty). Output undefined means "no value". */
export function customFieldValueSchema(def: CustomFieldDefLike): z.ZodType<CustomFieldValue | undefined> {
  const empty = (v: unknown) => v === undefined || v === null || v === "";
  const need = (s: z.ZodType<CustomFieldValue | undefined>) =>
    z.unknown().superRefine((v, ctx) => {
      if (def.required && empty(v)) ctx.addIssue({ code: "custom", message: `${def.label} is required` });
    }).pipe(s);
  switch (def.type) {
    case "BOOLEAN":
      // Checkbox: absent/"" = false. Required means it must be ticked.
      return z.unknown().transform((v, ctx) => {
        const on = v === true || v === "on" || v === "true";
        if (def.required && !on) ctx.addIssue({ code: "custom", message: `${def.label} is required` });
        return on;
      });
    case "NUMBER":
      return need(z.union([z.literal("").transform(() => undefined), z.undefined(), z.coerce.number({ error: "Enter a number" }).refine(Number.isFinite, "Enter a number")]));
    case "DATE":
      return need(z.union([z.literal("").transform(() => undefined), z.undefined(), isoDate]));
    case "SELECT":
      return need(z.union([z.literal("").transform(() => undefined), z.undefined(), z.string().refine((v) => def.options.includes(v), "Pick one of the options")]));
    default:
      return need(z.union([z.undefined(), z.string().trim().max(2000).transform((v) => (v ? v : undefined))]));
  }
}

/** Form field name for a custom field. */
export const cfName = (key: string) => `cf_${key}`;

/** Build the object schema for all given defs, reading `cf_<key>` inputs. */
export function customFieldsSchema(defs: CustomFieldDefLike[]) {
  return z.object(Object.fromEntries(defs.map((d) => [cfName(d.key), customFieldValueSchema(d)])));
}
