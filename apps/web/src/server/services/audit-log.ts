import "server-only";
import { z } from "zod";
import { prisma, type Prisma } from "@hris/db";

export const auditQuerySchema = z.object({
  actor: z.string().trim().max(200).optional(),
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

const PAGE_SIZE = 25;
const SENSITIVE = /hash|password|secret|token|apikey/i;

/** HR can read this page, so mask credential-ish keys at any depth in case a caller audited a raw row. */
const redact = (v: Prisma.JsonValue | null) =>
  v == null ? v : (JSON.parse(JSON.stringify(v), (k, val) => (k && SENSITIVE.test(k) ? "[redacted]" : val)) as Prisma.JsonValue);

/** Read-only AuditLog browser. Newest first; (createdAt, id) keeps paging stable and uses the createdAt index. */
export async function listAuditLogs(q: AuditQuery) {
  // Dates are local calendar days (same clock fmtDateTime renders with); `to` is inclusive.
  const createdAt: Prisma.DateTimeFilter = {};
  if (q.from) createdAt.gte = new Date(`${q.from}T00:00:00`);
  if (q.to) createdAt.lt = new Date(new Date(`${q.to}T00:00:00`).getTime() + 86_400_000);
  const where: Prisma.AuditLogWhereInput = {
    ...(q.actor ? { actor: { email: { contains: q.actor, mode: "insensitive" } } } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.from || q.to ? { createdAt } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        ip: true,
        createdAt: true,
        actor: { select: { email: true, employee: { select: { firstName: true, lastName: true, preferredName: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);
  const redacted = items.map((r) => ({ ...r, before: redact(r.before), after: redact(r.after) }));
  return { items: redacted, total, page: q.page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Distinct entity names for the filter dropdown (GROUP BY rides the [entity, entityId] index). */
export async function auditEntities() {
  const rows = await prisma.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } });
  return rows.map((r) => r.entity);
}

/** Top-level keys whose JSON differs between before and after. */
export function changedKeys(before: unknown, after: unknown): string[] {
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const b = obj(before);
  const a = obj(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k])).sort();
}
