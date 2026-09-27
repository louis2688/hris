import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "@hris/db";
import { careersApplySchema } from "@hris/shared";
import { audit } from "./audit";
import { MAX_DOC_BYTES, sanitizeName, sniff } from "./documents";
import type { ActionResult } from "../actions/_helpers";
import { AppError } from "./errors";
import { manilaToday } from "./onboarding";
import { rateLimit } from "../rate-limit";

export const VACANCIES_TAG = "vacancies";

/** Open, public, not past closesAt (Manila calendar day). */
const listed = () => ({ status: "OPEN" as const, isPublic: true, slug: { not: null }, OR: [{ closesAt: null }, { closesAt: { gte: manilaToday() } }] });

const pub = { id: true, title: true, slug: true, description: true, closesAt: true, positions: true, department: { select: { name: true } }, location: { select: { name: true, city: true } }, jobTitle: { select: { name: true } } } as const;

export const getPublicVacancy = (slug: string) => prisma.vacancy.findFirst({ where: { ...listed(), slug }, select: pub });

// Anonymous, bot-reachable pages read through a 60 s cache; vacancy writes in recruitment.ts expire it right away.
// The cache stores JSON, so closesAt comes back as a string and is revived here.
const revive = <T extends { closesAt: Date | string | null }>(v: T) => ({ ...v, closesAt: v.closesAt ? new Date(v.closesAt) : null });
const opts = { revalidate: 60, tags: [VACANCIES_TAG] };
const cachedList = unstable_cache(() => prisma.vacancy.findMany({ where: listed(), orderBy: { createdAt: "desc" }, select: pub }), ["careers:list"], opts);
const cachedOne = unstable_cache(getPublicVacancy, ["careers:job"], opts);
export const listPublicVacancies = cache(async () => (await cachedList()).map(revive));
export const getListedVacancy = cache(async (slug: string) => {
  const v = await cachedOne(slug);
  return v ? revive(v) : null;
});

export type ApplyResult = ActionResult;
const done: ApplyResult = { ok: true, data: undefined };

/** Public application. Returns the same success for duplicates and honeypot hits so neither leaks. */
export async function applyToVacancy(slug: string, fd: FormData, ip: string): Promise<ApplyResult> {
  if (!(await rateLimit(`apply:${ip}`, 5, 600)).ok) return { ok: false, error: "Too many applications from your network. Please try again in a few minutes." };
  if (String(fd.get("website") ?? "")) return done; // honeypot: bots fill every field

  const p = careersApplySchema.safeParse({
    firstName: fd.get("firstName"),
    lastName: fd.get("lastName"),
    email: fd.get("email"),
    phone: fd.get("phone"),
    referralCode: fd.get("referralCode") ?? "",
    consent: fd.get("consent") === "on",
  });
  const fieldErrors: Record<string, string[]> = {};
  if (!p.success) for (const i of p.error.issues) (fieldErrors[String(i.path[0] ?? "_")] ??= []).push(i.message);

  const file = fd.get("resume");
  let bytes: Buffer | null = null;
  if (!(file instanceof File) || file.size === 0) fieldErrors.resume = ["Attach your resume (PDF)"];
  else if (file.size > MAX_DOC_BYTES) fieldErrors.resume = ["Resume must be 5 MB or smaller"];
  else {
    bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_DOC_BYTES) fieldErrors.resume = ["Resume must be 5 MB or smaller"];
    else if (sniff(bytes)?.ext !== "pdf") fieldErrors.resume = ["Resume must be a PDF file"];
  }
  if (!p.success || Object.keys(fieldErrors).length) return { ok: false, error: "Please fix the highlighted fields", fieldErrors };
  const d = p.data;

  const vacancy = await getPublicVacancy(slug);
  if (!vacancy) return { ok: false, error: "This job is no longer accepting applications." };
  if (await prisma.candidate.findFirst({ where: { email: d.email, vacancyId: vacancy.id }, select: { id: true } })) return done;

  // ponytail: unknown referral codes are ignored rather than rejected, so the form can't be used to probe employee IDs.
  const referrer = d.referralCode
    ? await prisma.employee.findFirst({ where: { employeeCode: { equals: d.referralCode, mode: "insensitive" }, deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] } }, select: { id: true } })
    : null;

  const c = await prisma.candidate.create({
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      vacancyId: vacancy.id,
      source: referrer ? "Referral" : "Careers page",
      referrerId: referrer?.id ?? null,
      consentAt: new Date(),
      notes: d.referralCode && !referrer ? `Referral code entered: ${d.referralCode} (no matching employee)` : null,
      documents: {
        create: {
          category: "RESUME",
          name: sanitizeName((file as File).name, "pdf"),
          mimeType: "application/pdf",
          size: bytes!.length,
          data: new Uint8Array(bytes!),
          sha256: createHash("sha256").update(bytes!).digest("hex"),
          visibleToEmployee: false,
        },
      },
    },
  });
  await audit(null, "candidate.applied", "Candidate", c.id, { after: { vacancyId: vacancy.id, source: c.source } });
  return done;
}

/** Unique slug for a vacancy: the given one or one derived from the title, suffixed -2, -3... on collision. */
export async function uniqueSlug(base: string, exceptId?: string) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base.slice(0, 76)}-${i}`;
    const hit = await prisma.vacancy.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (!hit) return slug;
    if (i > 50) throw new AppError("Could not find a free URL slug; pick one manually");
  }
}
