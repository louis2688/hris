import { z } from "zod";
import {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  ROLES,
  PAGE_SIZE_MAX,
} from "../constants";

const optionalStr = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .enum(values)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

const optionalDate = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), "Invalid date");

export const emergencyContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  relationship: z.string().trim().min(1, "Relationship is required").max(60),
  phone: z.string().trim().min(3, "Phone is required").max(40),
  isPrimary: z.boolean().default(false),
});
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

/** Personal details section. Employee may edit a subset (see employeeSelfUpdateSchema). */
export const employeePersonalSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  middleName: optionalStr(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  preferredName: optionalStr(80),
  gender: z.enum(GENDERS).default("UNDISCLOSED"),
  dateOfBirth: optionalDate,
  maritalStatus: optionalEnum(MARITAL_STATUSES),
  nationality: optionalStr(80),
});

export const employeeContactSchema = z.object({
  workEmail: z.email("Enter a valid email").trim().toLowerCase().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  personalEmail: z.email("Enter a valid email").trim().toLowerCase().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  phone: optionalStr(40),
  mobile: optionalStr(40),
  addressLine1: optionalStr(200),
  addressLine2: optionalStr(200),
  city: optionalStr(100),
  state: optionalStr(100),
  postalCode: optionalStr(20),
  country: optionalStr(100),
});

export const employeeJobSchema = z.object({
  employeeCode: z.string().trim().min(1, "Employee ID is required").max(30),
  departmentId: optionalStr(),
  jobTitleId: optionalStr(),
  locationId: optionalStr(),
  managerId: optionalStr(),
  shiftId: optionalStr(),
  biometricId: optionalStr(40),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).default("ACTIVE"),
  hireDate: z.string().min(1, "Hire date is required").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  terminationDate: optionalDate,
  notes: optionalStr(2000),
});

export const employeeAccountSchema = z.object({
  createAccount: z.boolean().default(true),
  role: z.enum(ROLES).default("EMPLOYEE"),
  loginEmail: z.email("Enter a valid email").trim().toLowerCase().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  initialPassword: z.string().min(8, "Use at least 8 characters").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});

export const createEmployeeSchema = employeePersonalSchema
  .extend(employeeContactSchema.shape)
  .extend(employeeJobSchema.shape)
  .extend(employeeAccountSchema.shape);
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = employeePersonalSchema
  .extend(employeeContactSchema.shape)
  .extend(employeeJobSchema.shape);
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** What an employee can change about themselves. */
export const employeeSelfUpdateSchema = employeeContactSchema.extend({
  preferredName: optionalStr(80),
  maritalStatus: optionalEnum(MARITAL_STATUSES),
});
export type EmployeeSelfUpdateInput = z.infer<typeof employeeSelfUpdateSchema>;

export const updateUserAccountSchema = z.object({
  role: z.enum(ROLES),
  isActive: z.boolean(),
  resetPassword: z.string().min(8, "Use at least 8 characters").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});
export type UpdateUserAccountInput = z.infer<typeof updateUserAccountSchema>;

/** Drop empty-string query params so optional enums validate ("status=" from a GET form). */
export const stripEmpty = (v: unknown) =>
  v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== "" && x !== null)) : v;

export const employeeListQuerySchema = z.preprocess(stripEmpty, z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().optional(),
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
  managerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
  sort: z.enum(["name", "code", "hireDate", "department"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
}));
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
