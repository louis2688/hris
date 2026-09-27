import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { cfName, customFieldsSchema, slugKey, type CustomFieldDefInput, type CustomFieldValue, type SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { notFound } from "./errors";

export function listFieldDefs(activeOnly = false) {
  return prisma.customFieldDef.findMany({
    where: { entity: "Employee", ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}
export type FieldDef = Awaited<ReturnType<typeof listFieldDefs>>[number];

/** Key is slugged from the label on create and never changes, so stored values keep matching. */
export async function saveFieldDef(actor: SessionUser, id: string | undefined, d: CustomFieldDefInput) {
  const data = { label: d.label, type: d.type, options: d.type === "SELECT" ? d.options : [], required: d.required, isActive: d.isActive, sortOrder: d.sortOrder };
  if (id) {
    const before = await prisma.customFieldDef.findUnique({ where: { id } });
    if (!before) throw notFound("Custom field");
    const after = await prisma.customFieldDef.update({ where: { id }, data });
    await audit(actor.id, "custom_field.update", "CustomFieldDef", id, { before, after });
    return after;
  }
  const base = slugKey(d.label);
  const taken = new Set((await prisma.customFieldDef.findMany({ where: { key: { startsWith: base } }, select: { key: true } })).map((r) => r.key));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  const row = await prisma.customFieldDef.create({ data: { ...data, key } });
  await audit(actor.id, "custom_field.create", "CustomFieldDef", row.id, { after: row });
  return row;
}

/** "Delete" = deactivate. Stored values stay on employees and come back if re-activated. */
export async function deactivateFieldDef(actor: SessionUser, id: string) {
  const row = await prisma.customFieldDef.update({ where: { id }, data: { isActive: false } });
  await audit(actor.id, "custom_field.deactivate", "CustomFieldDef", id, { after: row });
}

export type CustomValues = Record<string, CustomFieldValue>;

/**
 * Validate `cf_<key>` inputs against the active defs. Returns the next customFields JSON: known keys only,
 * merged over `current` so values of inactive fields survive. `cf__present` marks that the form rendered
 * the fields at all (an edit of another section leaves them untouched).
 */
export async function parseCustomFields(raw: Record<string, unknown>, current: unknown) {
  const cur = (current && typeof current === "object" ? current : {}) as CustomValues;
  if (!raw.cf__present) return { values: cur };
  const defs = await listFieldDefs(true);
  const r = customFieldsSchema(defs).safeParse(raw);
  if (!r.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of r.error.issues) (fieldErrors[String(i.path[0])] ??= []).push(i.message);
    return { fieldErrors };
  }
  const next: CustomValues = { ...cur };
  for (const d of defs) {
    const v = (r.data as Record<string, CustomFieldValue | undefined>)[cfName(d.key)];
    if (v === undefined) delete next[d.key];
    else next[d.key] = v;
  }
  return { values: next };
}

export const toJson = (v: CustomValues) => v as Prisma.InputJsonObject;

/** Display string for a stored value. */
export function fmtCustom(def: { type: string }, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (def.type === "BOOLEAN") return v ? "Yes" : "No";
  if (def.type === "DATE" && typeof v === "string") return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return String(v);
}
