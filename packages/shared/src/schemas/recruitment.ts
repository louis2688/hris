import { z } from "zod";
import { CANDIDATE_STAGES, INTERVIEW_RESULTS, VACANCY_STATUSES } from "../constants";

const opt = (max = 200) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

export const vacancySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  jobTitleId: opt(),
  departmentId: opt(),
  locationId: opt(),
  hiringManagerId: opt(),
  positions: z.coerce.number().int().min(1).max(500).default(1),
  description: opt(5000),
  status: z.enum(VACANCY_STATUSES).default("OPEN"),
});
export type VacancyInput = z.infer<typeof vacancySchema>;

export const candidateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  phone: opt(40),
  vacancyId: opt(),
  source: opt(80),
  resumeUrl: z.url("Must be a link").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  notes: opt(2000),
});
export type CandidateInput = z.infer<typeof candidateSchema>;

export const stageChangeSchema = z.object({ stage: z.enum(CANDIDATE_STAGES), note: opt(500) });

export const interviewSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  scheduledAt: z.string().min(1, "Pick a date and time").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  interviewerId: opt(),
  location: opt(200),
  notes: opt(1000),
});
export type InterviewInput = z.infer<typeof interviewSchema>;

export const interviewResultSchema = z.object({ result: z.enum(INTERVIEW_RESULTS), notes: opt(1000) });

export const hireSchema = z.object({
  employeeCode: z.string().trim().min(1, "Employee ID is required").max(30),
  hireDate: z.string().min(1, "Hire date is required"),
  createAccount: z.boolean().default(true),
  role: z.enum(["EMPLOYEE", "MANAGER", "HR", "ADMIN"]).default("EMPLOYEE"),
});
