import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");
/**
 * date-fns `format` subset (local time): EEEE EEE MMMM MMM yyyy dd d HH mm. Unknown letters throw, like date-fns.
 * ponytail: hand-rolled because lib/utils ships to every page (cn) and date-fns format + locale cost ~13 KB gz there; use date-fns again if patterns grow.
 */
function format(d: Date, pattern: string) {
  const t: Record<string, string> = { EEEE: DAY[d.getDay()]!, EEE: DAY[d.getDay()]!.slice(0, 3), MMMM: MON[d.getMonth()]!, MMM: MON[d.getMonth()]!.slice(0, 3), yyyy: String(d.getFullYear()), dd: pad(d.getDate()), d: String(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()) };
  return pattern.replace(/EEEE|EEE|MMMM|MMM|yyyy|dd|d|HH|mm|[A-Za-z]/g, (k) => {
    if (!(k in t)) throw new RangeError(`Unsupported date token "${k}" in "${pattern}"`);
    return t[k]!;
  });
}

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
