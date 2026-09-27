import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, type Prisma } from "@hris/db";
import { namesMatch, type OfferInput, type OfferTerm, type SessionUser } from "@hris/shared";
import { appUrl, renderEmail, sendMail } from "../mail";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";
import { getSetting } from "./settings";

const newToken = () => randomBytes(32).toString("base64url");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Offers expire at the end of their expiry day, Manila time. */
const expiredAt = (expiresAt: Date | null, now = new Date()) => !!expiresAt && now.getTime() >= expiresAt.getTime() + 16 * 3600_000;

const include = { candidate: { select: { id: true, firstName: true, lastName: true, email: true, stage: true, hiredEmployeeId: true } }, jobTitle: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } } as const;

/** SENT offers past expiry read as EXPIRED everywhere without a cron. */
function withStatus<T extends { status: string; expiresAt: Date | null }>(o: T): T {
  return o.status === "SENT" && expiredAt(o.expiresAt) ? { ...o, status: "EXPIRED" } : o;
}
export const termsOf = (o: { terms: Prisma.JsonValue }) => (Array.isArray(o.terms) ? (o.terms as OfferTerm[]) : []);

export async function listOffers(candidateId: string) {
  const rows = await prisma.jobOffer.findMany({ where: { candidateId }, orderBy: { createdAt: "desc" }, include });
  return rows.map(withStatus);
}

export async function getOffer(id: string) {
  const o = await prisma.jobOffer.findUnique({ where: { id }, include });
  if (!o) throw notFound("Offer");
  return withStatus(o);
}
export type OfferDetail = Awaited<ReturnType<typeof getOffer>>;

const offerData = (d: OfferInput) => ({
  jobTitleId: d.jobTitleId ?? null,
  departmentId: d.departmentId ?? null,
  employmentType: d.employmentType,
  payType: d.payType,
  basicPay: d.basicPay,
  allowance: d.allowance,
  startDate: day(d.startDate),
  expiresAt: d.expiresAt ? day(d.expiresAt) : null,
  terms: d.terms as Prisma.InputJsonValue,
});

export async function saveOffer(actor: SessionUser, candidateId: string, d: OfferInput, id?: string) {
  if (id) {
    const o = await prisma.jobOffer.findUnique({ where: { id }, select: { status: true, candidateId: true } });
    if (!o || o.candidateId !== candidateId) throw notFound("Offer");
    if (o.status !== "DRAFT") throw new AppError("Only draft offers can be edited");
    const row = await prisma.jobOffer.update({ where: { id }, data: offerData(d) });
    await audit(actor.id, "candidate.offer_updated", "Candidate", candidateId, { after: { offerId: id, basicPay: d.basicPay } });
    return row;
  }
  const c = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { stage: true } });
  if (!c) throw notFound("Candidate");
  if (!["SHORTLISTED", "INTERVIEW", "OFFERED"].includes(c.stage)) throw new AppError("Offers can be made to shortlisted or interviewed candidates");
  if (await prisma.jobOffer.findFirst({ where: { candidateId, status: { in: ["DRAFT", "SENT", "ACCEPTED"] } }, select: { id: true } }))
    throw new AppError("This candidate already has an open offer. Withdraw it first.");
  const row = await prisma.jobOffer.create({ data: { ...offerData(d), candidateId, token: newToken(), createdById: actor.id } });
  await audit(actor.id, "candidate.offer_created", "Candidate", candidateId, { after: { offerId: row.id, basicPay: d.basicPay } });
  return row;
}

/** DRAFT -> SENT with a fresh token; emails the candidate when SMTP is set. The link is always returned for HR to copy. */
export async function sendOffer(actor: SessionUser, id: string) {
  const o = await getOffer(id);
  if (o.status !== "DRAFT") throw new AppError("Only draft offers can be sent");
  if (expiredAt(o.expiresAt)) throw new AppError("The expiry date has passed. Edit the offer first.");
  const token = newToken();
  await prisma.$transaction([
    prisma.jobOffer.update({ where: { id }, data: { status: "SENT", token, sentAt: new Date() } }),
    prisma.candidate.update({ where: { id: o.candidateId }, data: { stage: "OFFERED" } }),
  ]);
  const link = appUrl(`/offer/${token}`);
  const company = await getSetting("company");
  const role = o.jobTitle?.name ?? "the role";
  const { html, text } = renderEmail(
    `Your job offer from ${company.name}`,
    `Hi ${o.candidate.firstName},\n\nWe're happy to offer you the position of ${role}. Review the full offer and accept or decline online.${o.expiresAt ? `\n\nPlease respond by ${o.expiresAt.toISOString().slice(0, 10)}.` : ""}`,
    `/offer/${token}`,
  );
  const emailed = await sendMail({ to: o.candidate.email, subject: `Job offer: ${role} at ${company.name}`, html: html.replace("Open in HRIS", "View your offer"), text });
  await audit(actor.id, "candidate.offer_sent", "Candidate", o.candidateId, { after: { offerId: id, emailed } });
  return { link, emailed };
}

export async function withdrawOffer(actor: SessionUser, id: string) {
  const o = await getOffer(id);
  if (!["DRAFT", "SENT", "ACCEPTED", "EXPIRED"].includes(o.status) || o.candidate.stage === "HIRED") throw new AppError("This offer can no longer be withdrawn");
  await prisma.jobOffer.update({ where: { id }, data: { status: "WITHDRAWN" } });
  await audit(actor.id, "candidate.offer_withdrawn", "Candidate", o.candidateId, { after: { offerId: id } });
}

/** HR-facing link for a sent offer (null otherwise, so draft tokens never leave the server). */
export const offerLink = (o: { status: string; token: string }) => (o.status === "SENT" ? appUrl(`/offer/${o.token}`) : null);

// ---------- public (token) ----------

/** Only what the offer letter shows. Never the candidate id, email or other offers. */
export async function getPublicOffer(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const o = await prisma.jobOffer.findUnique({
    where: { token },
    select: {
      status: true, expiresAt: true, sentAt: true, respondedAt: true, signatureName: true, employmentType: true, payType: true, basicPay: true, allowance: true, startDate: true, terms: true,
      candidate: { select: { firstName: true, lastName: true } },
      jobTitle: { select: { name: true } },
      department: { select: { name: true } },
    },
  });
  if (!o || o.status === "DRAFT") return null;
  return { ...withStatus(o), basicPay: Number(o.basicPay), allowance: Number(o.allowance), terms: termsOf(o) };
}
export type PublicOffer = NonNullable<Awaited<ReturnType<typeof getPublicOffer>>>;

export async function respondToOffer(token: string, r: { accept: true; name: string } | { accept: false; reason?: string }) {
  const o = await prisma.jobOffer.findUnique({ where: { token }, include });
  if (!o || withStatus(o).status !== "SENT") throw new AppError("This offer is no longer open for a response");
  const expected = `${o.candidate.firstName} ${o.candidate.lastName}`;
  if (r.accept && !namesMatch(r.name, expected)) throw new AppError("The name must match the name on this offer exactly");
  // Conditional update so a double submit can't flip an answer.
  const done = await prisma.jobOffer.updateMany({
    where: { id: o.id, status: "SENT" },
    data: r.accept ? { status: "ACCEPTED", respondedAt: new Date(), signatureName: r.name.trim().replace(/\s+/g, " ") } : { status: "DECLINED", respondedAt: new Date(), declineReason: r.reason ?? null },
  });
  if (done.count !== 1) throw new AppError("This offer is no longer open for a response");
  await audit(null, r.accept ? "candidate.offer_accepted" : "candidate.offer_declined", "Candidate", o.candidateId, { after: { offerId: o.id, ...(r.accept ? {} : { reason: r.reason }) } });
  const staff = await prisma.user.findMany({ where: { role: { in: ["HR", "ADMIN"] }, isActive: true }, select: { id: true } });
  const title = `${expected} ${r.accept ? "accepted" : "declined"} the offer`;
  const body = r.accept ? `${o.jobTitle?.name ?? "Offer"} starting ${o.startDate.toISOString().slice(0, 10)}. Open the candidate to hire.` : (r.reason ?? undefined);
  await Promise.all(staff.map((u) => notify(u.id, title, body, `/recruitment/candidates/${o.candidateId}`)));
}

// ---------- hire ----------

export const acceptedOffer = (candidateId: string) => prisma.jobOffer.findFirst({ where: { candidateId, status: "ACCEPTED" }, orderBy: { respondedAt: "desc" }, include });

/** After hireCandidate(): copy the accepted offer's pay and placement onto the employee and open their salary history. */
export async function applyAcceptedOffer(actor: SessionUser, candidateId: string, employeeId: string) {
  const o = await acceptedOffer(candidateId);
  if (!o) return;
  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employeeId },
      data: { basicPay: o.basicPay, payType: o.payType, allowance: o.allowance, employmentType: o.employmentType, ...(o.jobTitleId ? { jobTitleId: o.jobTitleId } : {}), ...(o.departmentId ? { departmentId: o.departmentId } : {}) },
    }),
    prisma.employeeCompensation.create({ data: { employeeId, effectiveFrom: o.startDate, payType: o.payType, basicPay: o.basicPay, allowance: o.allowance, reason: "Offer accepted", createdById: actor.id } }),
  ]);
  await audit(actor.id, "employee.compensation_from_offer", "Employee", employeeId, { after: { offerId: o.id, basicPay: o.basicPay.toString(), payType: o.payType } });
}
