/**
 * Time-off pure logic: attendance correction punches, CSV / ATTLOG import parsing, encashment tax split,
 * availability checks. No DB. Re-exported from dtr.ts (index.ts is not ours to edit).
 */
import { parseAttlog } from "./adms";
import type { PunchMethod } from "./constants";

const hhmmMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// ---------- Attendance corrections ----------

export type CorrectionKindName = "MISSED_IN" | "MISSED_OUT" | "MISSED_BOTH" | "WORK_FROM_HOME" | "OFFICIAL_BUSINESS";
/** Which times a correction kind needs. */
export const correctionNeeds = (k: CorrectionKindName) => ({ in: k !== "MISSED_OUT", out: k !== "MISSED_IN" });

/**
 * Local (date, HH:mm) punches a correction creates. The out time moves to the next day when it is not after
 * the in time, or (no in time) when the shift crosses midnight and the out is before the shift start.
 */
export function correctionPunchTimes(
  c: { kind: CorrectionKindName; date: string; inTime?: string | null; outTime?: string | null },
  shift: { startTime: string; endTime: string },
): { date: string; time: string; direction: "IN" | "OUT" }[] {
  const need = correctionNeeds(c.kind);
  const out: { date: string; time: string; direction: "IN" | "OUT" }[] = [];
  if (need.in && c.inTime) out.push({ date: c.date, time: c.inTime, direction: "IN" });
  if (need.out && c.outTime) {
    const overnight = hhmmMin(shift.endTime) <= hhmmMin(shift.startTime);
    const next = need.in && c.inTime ? hhmmMin(c.outTime) <= hhmmMin(c.inTime) : overnight && hhmmMin(c.outTime) < hhmmMin(shift.startTime);
    out.push({ date: next ? nextDay(c.date) : c.date, time: c.outTime, direction: "OUT" });
  }
  return out;
}

// ---------- Bulk import ----------

export type ImportPunch = { date: string; time: string; sec: number; direction: "IN" | "OUT" | null };
export type ImportRow = { line: number; key: string; keyType: "employeeCode" | "biometricId"; date: string; punches: ImportPunch[]; method: PunchMethod; error?: string };

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const time = (s: string) => {
  const m = s.trim().match(TIME);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return null;
  return { time: `${m[1]!.padStart(2, "0")}:${m[2]}`, sec: Number(m[3] ?? 0) };
};
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const ATTLOG_LINE = /^\s*\S+\t\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/**
 * Parse an attendance upload. ZKTeco ATTLOG text (tab separated, detected on the first line) yields one punch per line;
 * CSV needs a header with employeeCode or biometricId, date (YYYY-MM-DD), time_in, time_out and yields up to two punches
 * per row (an out time not after the in time is the next day). Bad rows carry `error` and no punches.
 * ponytail: plain comma split, no quoted fields; spreadsheet exports of this shape never need them.
 */
export function parseAttendanceImport(text: string): { format: "CSV" | "ATTLOG"; rows: ImportRow[] } {
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim());
  if (first && ATTLOG_LINE.test(first)) {
    const rows: ImportRow[] = [];
    lines.forEach((l, i) => {
      if (!l.trim()) return;
      const p = parseAttlog(l)[0];
      if (!p) return void rows.push({ line: i + 1, key: l.split("\t")[0]?.trim() ?? "", keyType: "biometricId", date: "", punches: [], method: "FINGERPRINT", error: "Not an ATTLOG line" });
      const t = time(p.time);
      rows.push({ line: i + 1, key: p.biometricId, keyType: "biometricId", date: p.date, method: p.method, punches: t && validDate(p.date) ? [{ date: p.date, ...t, direction: p.direction }] : [], ...(t && validDate(p.date) ? {} : { error: "Bad date or time" }) });
    });
    return { format: "ATTLOG", rows };
  }

  const rows: ImportRow[] = [];
  const headerAt = lines.findIndex((l) => l.trim());
  if (headerAt < 0) return { format: "CSV", rows };
  const cols = lines[headerAt]!.split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase().replace(/[\s_-]/g, ""));
  const idx = (...names: string[]) => cols.findIndex((c) => names.includes(c));
  const codeAt = idx("employeecode", "code", "empcode");
  const bioAt = idx("biometricid", "pin", "biometric");
  const keyAt = codeAt >= 0 ? codeAt : bioAt;
  const keyType = codeAt >= 0 ? "employeeCode" : "biometricId";
  const dateAt = idx("date");
  const inAt = idx("timein", "in");
  const outAt = idx("timeout", "out");
  if (keyAt < 0 || dateAt < 0 || (inAt < 0 && outAt < 0)) {
    return { format: "CSV", rows: [{ line: headerAt + 1, key: "", keyType, date: "", punches: [], method: "NONE", error: "Header must have employeeCode (or biometricId), date, time_in, time_out" }] };
  }
  for (let i = headerAt + 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const cell = lines[i]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const key = cell[keyAt] ?? "";
    const date = cell[dateAt] ?? "";
    const tin = inAt >= 0 && cell[inAt] ? time(cell[inAt]!) : null;
    const tout = outAt >= 0 && cell[outAt] ? time(cell[outAt]!) : null;
    const row: ImportRow = { line: i + 1, key, keyType, date, punches: [], method: "NONE" };
    if (!key) row.error = "Missing employee";
    else if (!validDate(date)) row.error = "Date must be YYYY-MM-DD";
    else if ((inAt >= 0 && cell[inAt] && !tin) || (outAt >= 0 && cell[outAt] && !tout)) row.error = "Time must be HH:mm";
    else if (!tin && !tout) row.error = "No time in or out";
    else {
      if (tin) row.punches.push({ date, ...tin, direction: "IN" });
      if (tout) row.punches.push({ date: tin && hhmmMin(tout.time) <= hhmmMin(tin.time) ? nextDay(date) : date, ...tout, direction: "OUT" });
    }
    rows.push(row);
  }
  return { format: "CSV", rows };
}

// ---------- Leave encashment ----------

/**
 * PH rule (RR 11-2018, de minimis): monetized unused vacation leave of private employees is tax-exempt up to 10 days
 * per year; days beyond that, and any other leave type, are taxable compensation.
 */
export const ENCASH_EXEMPT_DAYS = 10;
export function encashmentTaxSplit(days: number, exemptUsedThisYear: number, vacation: boolean) {
  const exempt = vacation ? Math.max(0, Math.min(days, ENCASH_EXEMPT_DAYS - exemptUsedThisYear)) : 0;
  return { exempt, taxable: days - exempt };
}

/** Daily rate: monthly basic x 12 / days per year (261 for a 5-day week) for MONTHLY, basic as-is for DAILY. */
export const dailyRate = (payType: "MONTHLY" | "DAILY", basicPay: number, daysPerYear = 261) => (payType === "DAILY" ? basicPay : (basicPay * 12) / daysPerYear);
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Availability ----------

/**
 * Does a shift fall outside a weekday availability? `avail` null = unavailable all day, undefined = no preference.
 * Overnight shifts and windows (end not after start) run into the next day.
 */
export function outsideAvailability(shift: { startTime: string; endTime: string } | null, avail: { fromTime: string | null; toTime: string | null } | null | undefined) {
  if (!shift || avail === undefined) return false;
  if (!avail || !avail.fromTime || !avail.toTime) return true;
  const s = hhmmMin(shift.startTime);
  let e = hhmmMin(shift.endTime);
  if (e <= s) e += 1440;
  const f = hhmmMin(avail.fromTime);
  let t = hhmmMin(avail.toTime);
  if (t <= f) t += 1440;
  return s < f || e > t;
}
