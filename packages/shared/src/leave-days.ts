import type { DayPart } from "./constants";

/** Parse YYYY-MM-DD as a UTC date (no timezone drift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export interface WorkingDaysOptions {
  /** 0 = Sunday ... 6 = Saturday. Default weekend: Sat + Sun. */
  weekendDays?: number[];
  /** ISO dates (YYYY-MM-DD) that are public holidays. */
  holidays?: Iterable<string>;
}

/**
 * Count working days in [start, end] inclusive, honoring half-day parts on the
 * first and last day. Weekends and holidays are excluded, and a half-day on a
 * non-working day counts as zero.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  startDayPart: DayPart = "FULL",
  endDayPart: DayPart = "FULL",
  opts: WorkingDaysOptions = {},
): number {
  const weekend = new Set(opts.weekendDays ?? [0, 6]);
  const holidays = new Set(opts.holidays ?? []);
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (end < start) return 0;

  const isWorking = (d: Date) => !weekend.has(d.getUTCDay()) && !holidays.has(toISODate(d));

  // Single day
  if (start.getTime() === end.getTime()) {
    if (!isWorking(start)) return 0;
    const part = startDayPart !== "FULL" ? startDayPart : endDayPart;
    return part === "FULL" ? 1 : 0.5;
  }

  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isWorking(d)) continue;
    let v = 1;
    if (d.getTime() === start.getTime() && startDayPart === "PM") v = 0.5;
    if (d.getTime() === end.getTime() && endDayPart === "AM") v = 0.5;
    total += v;
  }
  return total;
}

/** Inclusive list of ISO dates between two ISO dates. */
export function eachDay(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = parseISODate(endDate);
  for (let d = parseISODate(startDate); d <= end; d = addDays(d, 1)) out.push(toISODate(d));
  return out;
}

/**
 * Whole months of accrual in `year` as of `asOf` (YYYY-MM-DD). Accrual starts at max(Jan 1, hireDate).
 * A month is complete once its monthiversary is reached: a Mar 15 start completes months on Apr 15, May 15, ...
 * When the start day doesn't exist in a month (Jan 31 -> Feb), that month's last day counts.
 * Counting stops at the end of the year (a Jan 1 start earns 12). 0 when asOf is before the start.
 */
export function completedAccrualMonths(year: number, hireDate: string, asOf: string): number {
  const jan1 = `${year}-01-01`;
  const next = `${year + 1}-01-01`;
  const start = hireDate > jan1 ? hireDate : jan1;
  const end = asOf < next ? asOf : next;
  if (end <= start) return 0;
  const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = end.split("-").map(Number) as [number, number, number];
  let m = (ey - sy) * 12 + (em - sm);
  if (ed < sd && ed < new Date(Date.UTC(ey, em, 0)).getUTCDate()) m--;
  return Math.max(0, Math.min(12, m));
}

/** Days earned so far for an accruing leave type: min(entitled, accrualPerMonth x completed months). */
export function accruedDays(entitled: number, accrualPerMonth: number, year: number, hireDate: string, asOf: string): number {
  return Math.min(entitled, Math.round(accrualPerMonth * completedAccrualMonths(year, hireDate, asOf) * 100) / 100);
}
