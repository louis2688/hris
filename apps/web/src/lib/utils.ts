import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Dates from Prisma @db.Date are UTC midnight; format them in UTC to avoid off-by-one. */
export function fmtDate(d: Date | string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  const utc = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return format(utc, pattern);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return format(typeof d === "string" ? new Date(d) : d, "d MMM yyyy, HH:mm");
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const todayISO = () => isoDate(new Date());

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export const fullName = (e: { firstName: string; lastName: string; preferredName?: string | null }) =>
  `${e.preferredName ?? e.firstName} ${e.lastName}`;

export function fmtDays(n: number | string) {
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} day${v === 1 ? "" : "s"}`;
}

export function toSearchParams(obj: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
