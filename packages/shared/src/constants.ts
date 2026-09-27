export const ROLES = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  HR: "HR",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

/** Roles that can manage other people's data. */
export const STAFF_ROLES: Role[] = ["ADMIN", "HR"];

export const EMPLOYMENT_STATUSES = [
  "ACTIVE",
  "PROBATION",
  "ON_LEAVE",
  "SUSPENDED",
  "RESIGNED",
  "TERMINATED",
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: "Active",
  PROBATION: "Probation",
  ON_LEAVE: "On leave",
  SUSPENDED: "Suspended",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
};

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export const GENDERS = ["MALE", "FEMALE", "OTHER", "UNDISCLOSED"] as const;
export type Gender = (typeof GENDERS)[number];

export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER"] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const DAY_PARTS = ["FULL", "AM", "PM"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

export const DAY_PART_LABELS: Record<DayPart, string> = {
  FULL: "Full day",
  AM: "Morning (half)",
  PM: "Afternoon (half)",
};

export const LEAVE_EVENT_ACTIONS = [
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "COMMENTED",
] as const;
export type LeaveEventAction = (typeof LEAVE_EVENT_ACTIONS)[number];

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const QUALIFICATION_KINDS = ["SKILL", "LICENSE", "MEMBERSHIP"] as const;
export type QualificationKind = (typeof QUALIFICATION_KINDS)[number];
export const QUALIFICATION_LABELS: Record<QualificationKind, string> = { SKILL: "Skill", LICENSE: "License", MEMBERSHIP: "Membership" };

export const APPROVER_KINDS = ["MANAGER", "HR", "ADMIN"] as const;
export type ApproverKind = (typeof APPROVER_KINDS)[number];
export const APPROVER_LABELS: Record<ApproverKind, string> = { MANAGER: "Direct manager", HR: "HR", ADMIN: "Administrator" };

export const PUNCH_METHODS = ["NONE", "PASSKEY", "PHOTO", "FINGERPRINT", "FACE", "CARD", "PIN"] as const;
export type PunchMethod = (typeof PUNCH_METHODS)[number];
export const PUNCH_METHOD_LABELS: Record<PunchMethod, string> = {
  NONE: "Web",
  PASSKEY: "Fingerprint / Face ID (device)",
  PHOTO: "Selfie",
  FINGERPRINT: "Fingerprint scanner",
  FACE: "Face scanner",
  CARD: "Card",
  PIN: "PIN",
};
export const PUNCH_SOURCES = ["WEB", "MOBILE", "DEVICE", "MANUAL"] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];

export const TIMESHEET_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DEFAULT_TIMEZONE = "Asia/Manila";

export const CANDIDATE_STAGES = ["APPLIED", "SHORTLISTED", "INTERVIEW", "OFFERED", "HIRED", "REJECTED", "WITHDRAWN"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const CANDIDATE_STAGE_LABELS: Record<CandidateStage, string> = {
  APPLIED: "Applied",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFERED: "Offered",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
export const VACANCY_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export const INTERVIEW_RESULTS = ["PENDING", "PASSED", "FAILED"] as const;

// ---- Client-safe enums, labels and helpers (kept out of the zod schema files so client bundles skip zod) ----

// people
export const CHECKLIST_KINDS = ["ONBOARDING", "OFFBOARDING"] as const;
export const CHECKLIST_KIND_LABELS = { ONBOARDING: "Onboarding", OFFBOARDING: "Offboarding" } as const;
export const TASK_OWNERS = ["HR", "MANAGER", "EMPLOYEE", "IT"] as const;
export const TASK_OWNER_LABELS = { HR: "HR", MANAGER: "Manager", EMPLOYEE: "Employee", IT: "IT" } as const;
export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "REPAIR", "RETIRED"] as const;
export const ASSET_STATUS_LABELS = { AVAILABLE: "Available", ASSIGNED: "Assigned", REPAIR: "In repair", RETIRED: "Retired" } as const;
export const ASSET_CATEGORIES = ["Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Peripheral", "Furniture", "Other"] as const;

// payroll
/** Rate fields the settings form shows as percentages (5 = 5%); premiums are all percentages (125 = 125%). */
export const PAYROLL_PERCENT_FIELDS = new Set(["sss.eeRate", "sss.erRate", "philhealth.rate", "philhealth.eeShare", "pagibig.eeRateLow", "pagibig.eeRate", "pagibig.erRate", "offCycleTax.flatRate"]);
export const isPayrollPercentField = (k: string) => k.startsWith("premiums.") || PAYROLL_PERCENT_FIELDS.has(k);
/** "1234 5678 9012" -> "**** 9012" for lists. */
export const maskAccount = (no: string | null | undefined) => (no ? `**** ${no.replace(/[^0-9]/g, "").slice(-4)}` : null);
/** Presets in the "Add adjustment" dialog. taxable: an earning is taxed; a deduction is taken before tax. */
export const ADJUSTMENT_PRESETS = {
  BONUS: { label: "Bonus", kind: "EARNING", taxable: true },
  INCENTIVE: { label: "Incentive", kind: "EARNING", taxable: true },
  RETENTION_BONUS: { label: "Retention bonus", kind: "EARNING", taxable: true },
  ARREARS: { label: "Salary arrears", kind: "EARNING", taxable: true },
  COMMISSION: { label: "Commission", kind: "EARNING", taxable: true },
  OTHER_EARNING: { label: "Other earning", kind: "EARNING", taxable: true },
  SALARY_DEDUCTION: { label: "Salary deduction", kind: "DEDUCTION", taxable: true },
  OTHER_DEDUCTION: { label: "Other deduction", kind: "DEDUCTION", taxable: false },
} as const satisfies Record<string, { label: string; kind: "EARNING" | "DEDUCTION"; taxable: boolean }>;
export type AdjustmentPreset = keyof typeof ADJUSTMENT_PRESETS;
export const ADJUSTMENT_CSV_COLUMNS = ["employeeCode", "kind", "code", "label", "amount", "taxable", "effectiveDate"] as const;
export const SEPARATION_REASONS = ["RESIGNATION", "TERMINATION", "END_OF_CONTRACT", "RETIREMENT", "OTHER"] as const;
export const SEPARATION_REASON_LABELS = { RESIGNATION: "Resignation", TERMINATION: "Termination", END_OF_CONTRACT: "End of contract", RETIREMENT: "Retirement", OTHER: "Other" } as const;
export const EXIT_QUESTIONS = {
  reason: "Main reason for leaving",
  didWell: "What did we do well?",
  improve: "What should we improve?",
  recommend: "Would you recommend us as a place to work?",
} as const;

// lifecycle
/** Status changes via "Record change"; separations go through the separation flow. */
export const EVENT_STATUS_OPTIONS = ["PROBATION", "ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;
export const CASE_TYPES = ["GRIEVANCE", "INCIDENT", "DISCIPLINARY"] as const;
export const CASE_TYPE_LABELS: Record<(typeof CASE_TYPES)[number], string> = { GRIEVANCE: "Grievance", INCIDENT: "Incident", DISCIPLINARY: "Disciplinary" };
export const SANCTIONS = ["NONE", "VERBAL_WARNING", "WRITTEN_WARNING", "SUSPENSION", "TERMINATION"] as const;
export const SANCTION_LABELS: Record<(typeof SANCTIONS)[number], string> = {
  NONE: "None",
  VERBAL_WARNING: "Verbal warning",
  WRITTEN_WARNING: "Written warning",
  SUSPENSION: "Suspension",
  TERMINATION: "Termination",
};
/** Form field name for a custom field. */
export const cfName = (key: string) => `cf_${key}`;

// ai
export const AI_MAX_INPUT = 2000;
/** Badge tone for an AI match score. */
export const aiScoreTone = (s: number) => (s >= 75 ? "green" : s >= 50 ? "amber" : "red") as "green" | "amber" | "red";

// growth
export const GOAL_STATUSES = ["NOT_STARTED", "ON_TRACK", "AT_RISK", "DONE", "DROPPED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = { NOT_STARTED: "Not started", ON_TRACK: "On track", AT_RISK: "At risk", DONE: "Done", DROPPED: "Dropped" };
export const TRAINING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];
export const QUESTION_TYPES = ["rating", "nps", "choice", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { rating: "Rating 1-5", nps: "eNPS 0-10", choice: "Single choice", text: "Free text" };

// hiring
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
export const RECOMMENDATIONS = ["STRONG_YES", "YES", "NO", "STRONG_NO"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = { STRONG_YES: "Strong yes", YES: "Yes", NO: "No", STRONG_NO: "Strong no" };
export const RECOMMENDATION_TONE: Record<Recommendation, "green" | "blue" | "amber" | "red"> = { STRONG_YES: "green", YES: "blue", NO: "amber", STRONG_NO: "red" };

// requests
export const EXPENSE_CATEGORIES = ["Transportation", "Meals", "Supplies", "Communication", "Training", "Other"] as const;
export const LOAN_TYPE_LABELS = { CASH_ADVANCE: "Cash advance", COMPANY_LOAN: "Company loan", SSS_LOAN: "SSS salary loan", PAGIBIG_LOAN: "Pag-IBIG salary loan" } as const;
export const LOAN_TYPES = ["CASH_ADVANCE", "COMPANY_LOAN", "SSS_LOAN", "PAGIBIG_LOAN"] as const;
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
/** [start, end) in minutes from 00:00 of the OT date; end > 1440 when it crosses midnight. */
export function otRange(start: string, end: string): [number, number] {
  const s = hm(start);
  let e = hm(end);
  if (e <= s) e += 1440;
  return [s, e];
}
export const otMinutes = (start: string, end: string) => {
  const [s, e] = otRange(start, end);
  return e - s;
};

// timeoff
export const CORRECTION_KINDS = ["MISSED_IN", "MISSED_OUT", "MISSED_BOTH", "WORK_FROM_HOME", "OFFICIAL_BUSINESS"] as const;
export const CORRECTION_KIND_LABELS: Record<(typeof CORRECTION_KINDS)[number], string> = {
  MISSED_IN: "Missed time in",
  MISSED_OUT: "Missed time out",
  MISSED_BOTH: "Missed in and out",
  WORK_FROM_HOME: "Work from home",
  OFFICIAL_BUSINESS: "Official business",
};
