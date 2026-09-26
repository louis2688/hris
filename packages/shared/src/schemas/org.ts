import { z } from "zod";

const optionalStr = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

export const departmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  code: optionalStr(20),
  headId: optionalStr(),
  parentId: optionalStr(),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const jobTitleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: optionalStr(500),
});
export type JobTitleInput = z.infer<typeof jobTitleSchema>;

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  address: optionalStr(300),
  city: optionalStr(100),
  country: optionalStr(100),
  timezone: optionalStr(60),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const holidaySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  date: z.string().min(1, "Date is required").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  locationId: optionalStr(),
});
export type HolidayInput = z.infer<typeof holidaySchema>;
