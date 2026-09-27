import "server-only";
import { createHash } from "node:crypto";
import { DocumentCategory, prisma } from "@hris/db";
import type { SessionUser } from "@hris/shared";
import { AuthError } from "../auth/session";
import { canAccessEmployee, isStaff } from "../authz";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";
import { manilaToday } from "./onboarding";

export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const SELF_UPLOAD_CATEGORIES: DocumentCategory[] = ["ID", "CERTIFICATE"];
const CATEGORIES = Object.values(DocumentCategory);

const meta = {
  id: true,
  category: true,
  name: true,
  mimeType: true,
  size: true,
  visibleToEmployee: true,
  uploadedById: true,
  createdAt: true,
  expiresAt: true,
  requiresAck: true,
  acks: { select: { ackedAt: true }, take: 1 },
  uploadedBy: { select: { email: true, employee: { select: { firstName: true, lastName: true, preferredName: true } } } },
} as const;

const forbidden = () => new AuthError("Forbidden", 403);

/** Sniff the real type from the first bytes. Client-sent mime/extension is never trusted. */
export function sniff(b: Buffer): { mime: string; ext: string } | null {
  const hex = b.subarray(0, 8).toString("hex");
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (hex.startsWith("ffd8ff")) return { mime: "image/jpeg", ext: "jpg" };
  if (hex === "89504e470d0a1a0a") return { mime: "image/png", ext: "png" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (hex.startsWith("504b0304")) {
    // ponytail: OOXML = zip; entry names are plain ASCII in the local headers / central directory.
    if (b.includes("word/")) return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
    if (b.includes("xl/")) return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }
  return null;
}

/** Basename only, no control/path/quote chars, bounded length, extension matches the sniffed type. */
export function sanitizeName(raw: string, ext: string) {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"*:<>?|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = base.replace(/\.[^.]*$/, "").slice(0, 120) || "document";
  return `${stem}.${ext}`;
}

// ---------- access ----------

type Owner = { employeeId: string | null; candidateId: string | null; visibleToEmployee: boolean };

/** HR/Admin: all. Self and direct manager: employee docs marked visibleToEmployee. Candidate docs: staff only. */
async function canView(u: SessionUser, d: Owner) {
  if (isStaff(u)) return true;
  if (!d.employeeId || !d.visibleToEmployee) return false;
  return canAccessEmployee(u, d.employeeId);
}

/** Categories `u` may upload for an employee. Staff: all. Employee: own ID / CERTIFICATE. Managers: none for reports. */
export const uploadCategories = (u: SessionUser, employeeId: string | null): DocumentCategory[] =>
  isStaff(u) ? CATEGORIES : employeeId && u.employeeId === employeeId ? SELF_UPLOAD_CATEGORIES : [];

/** Staff, or the employee deleting a file they uploaded themselves. */
const canDelete = (u: SessionUser, d: Owner & { uploadedById: string | null }) =>
  isStaff(u) || (!!d.employeeId && d.employeeId === u.employeeId && d.uploadedById === u.id);

// ---------- queries ----------

export async function listForEmployee(u: SessionUser, employeeId: string) {
  if (!(await canAccessEmployee(u, employeeId))) throw forbidden();
  const rows = await prisma.document.findMany({
    // Case files live on the case page (HR only), not in the employee's document list.
    where: { employeeId, caseId: null, ...(isStaff(u) ? {} : { visibleToEmployee: true }) },
    select: meta,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ ...r, canDelete: canDelete(u, { ...r, employeeId, candidateId: null }) }));
}

export async function listForCandidate(u: SessionUser, candidateId: string) {
  if (!isStaff(u)) throw forbidden();
  const rows = await prisma.document.findMany({ where: { candidateId }, select: meta, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ ...r, canDelete: true }));
}

export type DocumentRow = Awaited<ReturnType<typeof listForEmployee>>[number];

export async function upload(
  u: SessionUser,
  input: { employeeId?: string | null; candidateId?: string | null; category: string; visibleToEmployee?: boolean; file: File; expiresAt?: string | null; requiresAck?: boolean; caseId?: string | null },
) {
  const employeeId = input.employeeId || null;
  const candidateId = input.candidateId || null;
  if (!employeeId === !candidateId) throw new AppError("Attach the document to exactly one employee or candidate");
  if (!CATEGORIES.includes(input.category as DocumentCategory)) throw new AppError("Pick a valid category");
  const category = input.category as DocumentCategory;
  if (candidateId ? !isStaff(u) : !uploadCategories(u, employeeId).includes(category)) throw forbidden();
  if ((input.requiresAck || input.caseId) && !isStaff(u)) throw forbidden();
  if (input.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) throw new AppError("Pick a valid expiry date");
  // Must-acknowledge docs have to be visible to the employee; case files never are.
  const visible = input.caseId ? false : input.requiresAck ? true : isStaff(u) ? input.visibleToEmployee !== false : true;

  const f = input.file;
  if (!f || typeof f.arrayBuffer !== "function" || f.size === 0) throw new AppError("Choose a file to upload");
  if (f.size > MAX_DOC_BYTES) throw new AppError("File is larger than 5 MB");
  const bytes = Buffer.from(await f.arrayBuffer());
  if (bytes.length > MAX_DOC_BYTES) throw new AppError("File is larger than 5 MB");
  const type = sniff(bytes);
  if (!type) throw new AppError("Only PDF, JPG, PNG, WEBP, DOCX and XLSX files are allowed", "UNSUPPORTED_TYPE", 415);

  if (employeeId && !(await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }))) throw notFound("Employee");
  if (candidateId && !(await prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } }))) throw notFound("Candidate");

  const row = await prisma.document.create({
    data: {
      employeeId,
      candidateId,
      category,
      name: sanitizeName(f.name, type.ext),
      mimeType: type.mime,
      size: bytes.length,
      data: bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedById: u.id,
      // Non-staff can only upload their own docs, which they must be able to see.
      visibleToEmployee: visible,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      requiresAck: !!input.requiresAck && !!employeeId,
      caseId: input.caseId || null,
    },
    select: { id: true, name: true, category: true, mimeType: true, size: true, sha256: true, visibleToEmployee: true, expiresAt: true, requiresAck: true, caseId: true },
  });
  await audit(u.id, "document.upload", candidateId ? "Candidate" : "Employee", candidateId ?? employeeId, { after: row });
  return row;
}

/** Bytes + response headers. 404 (not 403) when the caller may not see it, so ids do not leak. */
export async function download(u: SessionUser, id: string) {
  const d = await prisma.document.findUnique({ where: { id }, omit: { data: false } });
  if (!d || !(await canView(u, d))) throw notFound("Document");
  const inline = d.mimeType.startsWith("image/") || d.mimeType === "application/pdf";
  const ascii = d.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    body: new Uint8Array(d.data),
    headers: {
      "Content-Type": d.mimeType,
      "Content-Length": String(d.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  };
}

export async function remove(u: SessionUser, id: string) {
  const d = await prisma.document.findUnique({ where: { id }, select: { id: true, name: true, category: true, employeeId: true, candidateId: true, visibleToEmployee: true, uploadedById: true } });
  if (!d || !(await canView(u, d))) throw notFound("Document");
  if (!canDelete(u, d)) throw forbidden();
  await prisma.document.delete({ where: { id } });
  await audit(u.id, "document.delete", d.candidateId ? "Candidate" : "Employee", d.candidateId ?? d.employeeId, { before: d });
  return { employeeId: d.employeeId, candidateId: d.candidateId };
}

/** Expense receipt: the employee's own file, category OTHER, visible to them (and their manager). PDF or image only. */
export async function uploadReceipt(u: SessionUser, employeeId: string, f: File) {
  if (u.employeeId !== employeeId && !isStaff(u)) throw forbidden();
  if (!f || typeof f.arrayBuffer !== "function" || f.size === 0) throw new AppError("Choose a receipt to upload");
  if (f.size > MAX_DOC_BYTES) throw new AppError("Receipt is larger than 5 MB");
  const bytes = Buffer.from(await f.arrayBuffer());
  const type = sniff(bytes);
  if (!type || !(type.mime === "application/pdf" || type.mime.startsWith("image/"))) throw new AppError("Receipt must be a PDF, JPG, PNG or WEBP", "UNSUPPORTED_TYPE", 415);
  const row = await prisma.document.create({
    data: {
      employeeId,
      category: "OTHER",
      name: sanitizeName(f.name || "receipt", type.ext),
      mimeType: type.mime,
      size: bytes.length,
      data: bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedById: u.id,
      visibleToEmployee: true,
    },
    select: { id: true, name: true },
  });
  await audit(u.id, "document.upload", "Employee", employeeId, { after: { ...row, category: "OTHER", receipt: true } });
  return row;
}

// ---------- Acknowledgment ----------

/** The employee confirms they read a must-acknowledge document. Idempotent. */
export async function acknowledge(u: SessionUser, id: string) {
  const d = await prisma.document.findUnique({ where: { id }, select: { id: true, name: true, employeeId: true, requiresAck: true, visibleToEmployee: true } });
  if (!d || !d.employeeId || d.employeeId !== u.employeeId || !d.visibleToEmployee) throw notFound("Document");
  if (!d.requiresAck) throw new AppError("This document does not need an acknowledgment");
  const existing = await prisma.documentAck.findUnique({ where: { documentId_userId: { documentId: id, userId: u.id } } });
  if (existing) return existing;
  const row = await prisma.documentAck.upsert({ where: { documentId_userId: { documentId: id, userId: u.id } }, create: { documentId: id, userId: u.id }, update: {} });
  await audit(u.id, "document.ack", "Employee", d.employeeId, { after: { documentId: id, name: d.name } });
  return row;
}

// ---------- Case files ----------

export function listForCase(caseId: string) {
  return prisma.document.findMany({ where: { caseId }, select: meta, orderBy: { createdAt: "desc" } });
}

// ---------- Expiry ----------

const DAY = 86_400_000;
export const EXPIRY_NOTICE_DAYS = [30, 7, 0];

/**
 * Daily job: notify HR and the employee 30 and 7 days before a document expires and on the day.
 * Deduped per user+link+title per day, so a second run the same day sends nothing. Returns notifications sent.
 * ponytail: exact-day thresholds; a skipped cron day skips that reminder. Widen to ranges + a sent-log if that matters.
 */
export async function runDailyDocumentExpiry(): Promise<number> {
  const today = manilaToday();
  const docs = await prisma.document.findMany({
    where: { employeeId: { not: null }, caseId: null, expiresAt: { in: EXPIRY_NOTICE_DAYS.map((n) => new Date(today.getTime() + n * DAY)) }, employee: { deletedAt: null } },
    select: { id: true, name: true, expiresAt: true, visibleToEmployee: true, employeeId: true, employee: { select: { firstName: true, lastName: true, preferredName: true, userId: true } } },
  });
  if (!docs.length) return 0;
  let hr = await prisma.user.findMany({ where: { role: "HR", isActive: true }, select: { id: true } });
  if (!hr.length) hr = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  // Start of today in Manila, as an instant.
  const since = new Date(today.getTime() - 8 * 3_600_000);
  let sent = 0;
  const send = async (userId: string, title: string, body: string, link: string) => {
    if (await prisma.notification.findFirst({ where: { userId, title, link, createdAt: { gte: since } }, select: { id: true } })) return;
    await notify(userId, title, body, link);
    sent++;
  };
  for (const d of docs) {
    const days = Math.round((d.expiresAt!.getTime() - today.getTime()) / DAY);
    const when = days === 0 ? "expires today" : `expires in ${days} days`;
    const who = `${d.employee!.preferredName ?? d.employee!.firstName} ${d.employee!.lastName}`;
    for (const u of hr) await send(u.id, `${who}: ${d.name} ${when}`, "Renew or replace the document before it lapses.", `/employees/${d.employeeId}?tab=documents`);
    if (d.visibleToEmployee && d.employee!.userId) await send(d.employee!.userId, `Your document ${d.name} ${when}`, "Please submit a renewed copy to HR.", "/me?tab=documents");
  }
  return sent;
}
