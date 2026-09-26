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
