// Owned by the people feature (announcements, checklists, org chart, assets). Zod schemas and constants go here.
import { z } from "zod";

export const CHECKLIST_KINDS = ["ONBOARDING", "OFFBOARDING"] as const;
export const CHECKLIST_KIND_LABELS = { ONBOARDING: "Onboarding", OFFBOARDING: "Offboarding" } as const;
export const TASK_OWNERS = ["HR", "MANAGER", "EMPLOYEE", "IT"] as const;
export const TASK_OWNER_LABELS = { HR: "HR", MANAGER: "Manager", EMPLOYEE: "Employee", IT: "IT" } as const;
export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "REPAIR", "RETIRED"] as const;
export const ASSET_STATUS_LABELS = { AVAILABLE: "Available", ASSIGNED: "Assigned", REPAIR: "In repair", RETIRED: "Retired" } as const;
export const ASSET_CATEGORIES = ["Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Peripheral", "Furniture", "Other"] as const;
/** Title of the offboarding item every new OFFBOARDING template starts with. */
export const RETURN_ASSETS_TASK = "Return company assets";

const text = (max: number, msg = "Required") => z.string().trim().min(1, msg).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

export const announcementSchema = z.object({
  title: text(160, "Title is required"),
  body: text(20000, "Write something"),
  pinned: z.boolean().default(false),
  requiresAck: z.boolean().default(false),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const checklistTemplateSchema = z.object({
  name: text(120, "Name is required"),
  kind: z.enum(CHECKLIST_KINDS),
  isDefault: z.boolean().default(false),
});
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

export const checklistItemSchema = z.object({
  title: text(200, "Title is required"),
  owner: z.enum(TASK_OWNERS),
  dueOffsetDays: z.coerce.number().int("Whole days only").min(0).max(365).default(0),
});
export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;

export const startChecklistSchema = z.object({
  employeeId: text(40, "Pick an employee"),
  templateId: text(40, "Pick a template"),
});

export const adhocTaskSchema = z.object({
  title: text(200, "Title is required"),
  owner: z.enum(TASK_OWNERS),
  dueDate: optDate,
});
export type AdhocTaskInput = z.infer<typeof adhocTaskSchema>;

export const assetSchema = z.object({
  tag: text(40, "Asset tag is required").transform((v) => v.toUpperCase()),
  name: text(120, "Name is required"),
  category: text(60, "Category is required"),
  serialNumber: optText(120),
  purchaseDate: optDate,
  cost: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Cost must be a number with up to 2 decimals"))
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: optText(1000),
});
export type AssetInput = z.infer<typeof assetSchema>;

export const assetListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(ASSET_STATUSES).optional().catch(undefined),
  category: z.string().trim().max(60).optional().catch(undefined),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

// ---- Tiny markdown subset: paragraphs, **bold**, - / 1. lists, [links](https://..). No HTML ever. ----

export type MdInline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "a"; v: string; href: string };
export type MdBlock = { type: "p"; lines: MdInline[][] } | { type: "ul" | "ol"; items: MdInline[][] };

const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i;

export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of s.matchAll(/\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", v: m[1] });
    else if (SAFE_HREF.test(m[3]!)) out.push({ t: "a", v: m[2]!, href: m[3]! });
    else out.push({ t: "text", v: m[2]! }); // javascript: and friends render as plain text
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export function parseMarkdownLite(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const chunk of src.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    let cur: MdBlock | null = null;
    for (const line of chunk.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const li = line.match(/^(?:([-*])|\d+[.)])\s+(.*)$/);
      const type = !li ? "p" : li[1] ? "ul" : "ol";
      const inl = parseInline(li ? li[2]! : line);
      if (!cur || cur.type !== type) blocks.push((cur = type === "p" ? { type, lines: [] } : { type, items: [] }));
      if (cur.type === "p") cur.lines.push(inl);
      else cur.items.push(inl);
    }
  }
  return blocks;
}
