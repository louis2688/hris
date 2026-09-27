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
  // Geofence: all three or none. "" -> undefined.
  latitude: z.union([z.literal(""), z.coerce.number().min(-90, "Latitude is -90 to 90").max(90, "Latitude is -90 to 90")]).optional().transform((v) => (v === "" ? undefined : v)),
  longitude: z.union([z.literal(""), z.coerce.number().min(-180, "Longitude is -180 to 180").max(180, "Longitude is -180 to 180")]).optional().transform((v) => (v === "" ? undefined : v)),
  geofenceRadius: z.union([z.literal(""), z.coerce.number().int("Whole meters").min(25, "At least 25 m").max(50_000)]).optional().transform((v) => (v === "" ? undefined : v)),
}).superRefine((v, ctx) => {
  const set = [v.latitude, v.longitude, v.geofenceRadius].filter((x) => x !== undefined).length;
  if (set > 0 && set < 3) for (const k of ["latitude", "longitude", "geofenceRadius"] as const) if (v[k] === undefined) ctx.addIssue({ code: "custom", path: [k], message: "Needed for the geofence (or clear all three)" });
});
export type LocationInput = z.infer<typeof locationSchema>;

export const HOLIDAY_TYPE_LABELS = { REGULAR: "Regular holiday", SPECIAL_NON_WORKING: "Special non-working", SPECIAL_WORKING: "Special working" } as const;

export const holidaySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  // Blank = REGULAR (the settings select's empty option).
  type: z.enum(["REGULAR", "SPECIAL_NON_WORKING", "SPECIAL_WORKING"]).or(z.literal("")).optional().transform((v) => v || "REGULAR"),
  date: z.string().min(1, "Date is required").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  locationId: optionalStr(),
});
export type HolidayInput = z.infer<typeof holidaySchema>;
