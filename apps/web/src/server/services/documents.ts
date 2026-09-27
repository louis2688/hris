import "server-only";
import { createHash } from "node:crypto";
import { DocumentCategory, prisma } from "@hris/db";
import type { SessionUser } from "@hris/shared";
import { AuthError } from "../auth/session";
import { canAccessEmployee, isStaff } from "../authz";
import { audit } from "./audit";
import { AppError, notFound } from "./errors";

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
    where: { employeeId, ...(isStaff(u) ? {} : { visibleToEmployee: true }) },
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
  input: { employeeId?: string | null; candidateId?: string | null; category: string; visibleToEmployee?: boolean; file: File },
) {
  const employeeId = input.employeeId || null;
  const candidateId = input.candidateId || null;
  if (!employeeId === !candidateId) throw new AppError("Attach the document to exactly one employee or candidate");
  if (!CATEGORIES.includes(input.category as DocumentCategory)) throw new AppError("Pick a valid category");
  const category = input.category as DocumentCategory;
  if (candidateId ? !isStaff(u) : !uploadCategories(u, employeeId).includes(category)) throw forbidden();

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
      visibleToEmployee: isStaff(u) ? input.visibleToEmployee !== false : true,
    },
    select: { id: true, name: true, category: true, mimeType: true, size: true, sha256: true, visibleToEmployee: true },
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
