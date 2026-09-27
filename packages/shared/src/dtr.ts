/**
 * DTR (daily time record) maths. Pure, timezone-aware, no DB.
 *
 * Attendance day rule: a punch belongs to the local date of (punch - (shiftStart - 4h)).
 * Day shift 09:00 -> punches before 05:00 count for the previous day.
 * Night shift 22:00-06:00 -> a 05:30 punch counts for the night it started.
 */

export interface ShiftRule {
  startTime: string; // "09:00"
  endTime: string; // "18:00"
  breakMinutes: number;
  graceMinutes: number;
  workDays: number[]; // 0 = Sun .. 6 = Sat
}

export const DEFAULT_SHIFT: ShiftRule = { startTime: "09:00", endTime: "18:00", breakMinutes: 60, graceMinutes: 0, workDays: [1, 2, 3, 4, 5] };

export type DtrStatus = "PRESENT" | "INCOMPLETE" | "ABSENT" | "LEAVE" | "HOLIDAY" | "REST_DAY" | "UPCOMING";

export interface DtrRow {
  date: string; // YYYY-MM-DD (attendance day)
  weekday: number;
  status: DtrStatus;
  timeIn: string | null; // HH:mm local
  timeOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  punches: number;
  leave: { code: string; days: number } | null;
  holiday: string | null;
}

export interface DtrTotals {
  present: number;
  absent: number;
  leaveDays: number;
  lateCount: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  workedMinutes: number;
}

export const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const minToHhmm = (m: number) => {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};
export const fmtMinutes = (m: number) => (m <= 0 ? "-" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);

/** Local calendar parts of an instant in an IANA timezone. */
export function zonedParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Convert a local wall time (YYYY-MM-DD, HH:mm) in a timezone to a UTC Date. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, 0, hhmmToMin(time)));
  // Offset of the zone at that instant, then correct once (good enough outside DST gaps; PH has no DST).
  const p = zonedParts(guess, timeZone);
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), 0, p.minutes);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Attendance day + minutes from that day's local midnight (can exceed 1440 for night shifts). */
export function attendanceSlot(at: Date, shift: ShiftRule, timeZone: string) {
  const offset = hhmmToMin(shift.startTime) - 240;
  const shifted = zonedParts(new Date(at.getTime() - offset * 60_000), timeZone);
  return { day: shifted.date, minutes: shifted.minutes + offset };
}

export function computeDtr(input: {
  days: string[];
  punches: Date[];
  shift: ShiftRule;
  timeZone: string;
  holidays: Map<string, string>;
  leaves: Map<string, { code: string; days: number }>;
  today: string;
}): { rows: DtrRow[]; totals: DtrTotals } {
  const { shift, timeZone } = input;
  const start = hhmmToMin(shift.startTime);
  let end = hhmmToMin(shift.endTime);
  if (end <= start) end += 1440;

  const byDay = new Map<string, number[]>();
  for (const p of input.punches) {
    const s = attendanceSlot(p, shift, timeZone);
    (byDay.get(s.day) ?? byDay.set(s.day, []).get(s.day)!).push(s.minutes);
  }

  const totals: DtrTotals = { present: 0, absent: 0, leaveDays: 0, lateCount: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, workedMinutes: 0 };
  const rows = input.days.map((date): DtrRow => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const mins = (byDay.get(date) ?? []).sort((a, b) => a - b);
    const holiday = input.holidays.get(date) ?? null;
    const leave = input.leaves.get(date) ?? null;
    const workDay = shift.workDays.includes(weekday) && !holiday;
    const row: DtrRow = { date, weekday, status: "ABSENT", timeIn: null, timeOut: null, workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, punches: mins.length, leave, holiday };

    if (mins.length) {
      const first = mins[0]!;
      const last = mins[mins.length - 1]!;
      row.timeIn = minToHhmm(first);
      if (mins.length > 1) {
        row.timeOut = minToHhmm(last);
        const span = last - first;
        // ponytail: flat break deduction for spans over 5h; per-punch break tracking if payroll needs it.
        row.workedMinutes = Math.max(0, span - (span > 300 ? shift.breakMinutes : 0));
        row.status = "PRESENT";
        if (workDay) {
          const halfDay = leave && leave.days < 1;
          // ponytail: half-day leave waives late and undertime entirely; split AM/PM if HR asks.
          if (!halfDay) {
            row.lateMinutes = Math.max(0, first - (start + shift.graceMinutes));
            row.undertimeMinutes = Math.max(0, end - last);
          }
          row.overtimeMinutes = Math.max(0, last - end);
        } else {
          row.overtimeMinutes = row.workedMinutes; // rest day / holiday work is all OT
        }
      } else {
        row.status = "INCOMPLETE";
        if (workDay && !(leave && leave.days < 1)) row.lateMinutes = Math.max(0, first - (start + shift.graceMinutes));
      }
    } else if (holiday) row.status = "HOLIDAY";
    else if (leave && leave.days >= 1) row.status = "LEAVE";
    else if (!shift.workDays.includes(weekday)) row.status = "REST_DAY";
    else if (date >= input.today) row.status = "UPCOMING";
    else if (leave) row.status = "LEAVE";

    if (row.status === "PRESENT" || row.status === "INCOMPLETE") totals.present++;
    if (row.status === "ABSENT") totals.absent++;
    if (leave) totals.leaveDays += leave.days;
    if (row.lateMinutes > 0) totals.lateCount++;
    totals.lateMinutes += row.lateMinutes;
    totals.undertimeMinutes += row.undertimeMinutes;
    totals.overtimeMinutes += row.overtimeMinutes;
    totals.workedMinutes += row.workedMinutes;
    return row;
  });
  return { rows, totals };
}

/** All dates of a YYYY-MM month. */
export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const out: string[] = [];
  for (let d = first; d.slice(0, 7) === month; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export { addDaysIso };

/** Per-employee attendance totals over an arbitrary date range (payroll cutoffs). Contract between attendance and payroll. */
export interface DtrRangeTotals {
  /** Scheduled work days in range (excludes rest days and holidays) */
  workDays: number;
  present: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  lateMinutes: number;
  undertimeMinutes: number;
  workedMinutes: number;
  /** Minutes worked between 22:00 and 06:00 local */
  nightMinutes: number;
  /** Holidays in range with whether/how long the employee worked them */
  holidays: { date: string; type: "REGULAR" | "SPECIAL_NON_WORKING" | "SPECIAL_WORKING"; workedMinutes: number }[];
  restDaysWorked: { date: string; workedMinutes: number }[];
}
