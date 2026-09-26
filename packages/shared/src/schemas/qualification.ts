import { z } from "zod";
import { QUALIFICATION_KINDS } from "../constants";

const opt = (max = 200) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const optDate = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), "Invalid date");

export const qualificationSchema = z.object({
  kind: z.enum(QUALIFICATION_KINDS),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: opt(500),
});
export type QualificationInput = z.infer<typeof qualificationSchema>;

export const nationalitySchema = z.object({ name: z.string().trim().min(1, "Name is required").max(80) });

export const employeeQualificationSchema = z
  .object({
    id: z.string().optional(),
    qualificationId: z.string().min(1, "Pick one"),
    level: opt(80),
    number: opt(80),
    issuedDate: optDate,
    expiryDate: optDate,
    amount: z.coerce.number().min(0).max(10_000_000).optional().or(z.literal("")).transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    notes: opt(500),
  })
  .refine((d) => !d.issuedDate || !d.expiryDate || d.expiryDate >= d.issuedDate, { message: "Expiry must be after issue date", path: ["expiryDate"] });
export type EmployeeQualificationInput = z.infer<typeof employeeQualificationSchema>;
