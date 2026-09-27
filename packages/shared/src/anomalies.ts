/** Rule-based attendance anomaly flags. Pure; fed by services/anomalies.ts. */
import { fmtDistance, geofenceCheck, hhmmToMin, zonedParts, type DtrRow } from "./dtr";

export const ANOMALY_KINDS = ["BUDDY_PUNCH", "OUTSIDE_GEOFENCE", "ABSENT_STREAK", "REPEATED_LATE", "LONG_SHIFT", "MISSING_OUT"] as const;
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];
export const ANOMALY_LABELS: Record<AnomalyKind, string> = {
  BUDDY_PUNCH: "Possible buddy punching",
  OUTSIDE_GEOFENCE: "Punched outside geofence",
  ABSENT_STREAK: "Absent without leave",
  REPEATED_LATE: "Repeated lates",
  LONG_SHIFT: "Unusually long shift",
  MISSING_OUT: "Missing time-out",
};
export type Severity = "high" | "medium" | "low";
export interface Anomaly {
  kind: AnomalyKind;
  severity: Severity;
  employeeIds: string[];
  dates: string[];
  evidence: string;
}

export interface AnomalyPunch {
  employeeId: string;
  at: Date;
  /** Biometric terminal name, null for web/mobile */
  device: string | null;
  latitude: number | null;
  longitude: number | null;
  hasPhoto: boolean;
}

export const ANOMALY_RULES = { lateCount: 3, absentStreak: 2, longShiftMinutes: 14 * 60, buddySeconds: 60, buddyMeters: 30 };

const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function detectAnomalies(input: {
  rows: Map<string, DtrRow[]>;
  punches: AnomalyPunch[];
  /** employeeId -> their location's geofence */
  fences: Map<string, { name: string; lat: number; lng: number; radius: number }>;
  timeZone: string;
  today: string;
  rules?: Partial<typeof ANOMALY_RULES>;
}): Anomaly[] {
  const R = { ...ANOMALY_RULES, ...input.rules };
  const out: Anomaly[] = [];
  const flag = (kind: AnomalyKind, severity: Severity, employeeIds: string[], dates: string[], evidence: string) => out.push({ kind, severity, employeeIds, dates, evidence });

  for (const [emp, rows] of input.rows) {
    const late = rows.filter((r) => r.lateMinutes > 0);
    if (late.length >= R.lateCount) {
      const mins = late.reduce((s, r) => s + r.lateMinutes, 0);
      flag("REPEATED_LATE", late.length >= R.lateCount * 2 ? "high" : "medium", [emp], late.map((r) => r.date), `Late ${late.length} times, ${mins} min total`);
    }

    const noOut = rows.filter((r) => r.status === "INCOMPLETE" && r.date < input.today);
    if (noOut.length) flag("MISSING_OUT", noOut.length >= 3 ? "medium" : "low", [emp], noOut.map((r) => r.date), `Only a time-in on ${noOut.length} day${noOut.length === 1 ? "" : "s"} (${noOut.map((r) => `${r.date} in ${r.timeIn}`).join(", ")})`);

    const long = rows.filter((r) => r.timeIn && r.timeOut && (hhmmToMin(r.timeOut) - hhmmToMin(r.timeIn) + 1440) % 1440 > R.longShiftMinutes);
    if (long.length) flag("LONG_SHIFT", "medium", [emp], long.map((r) => r.date), long.map((r) => `${r.date} ${r.timeIn}-${r.timeOut}`).join(", "));

    // consecutive scheduled days absent; rest days and holidays don't break the streak
    let streak: string[] = [];
    const endStreak = () => {
      if (streak.length >= R.absentStreak) flag("ABSENT_STREAK", streak.length > R.absentStreak ? "high" : "medium", [emp], streak, `${streak.length} consecutive work days absent with no approved leave`);
      streak = [];
    };
    for (const r of rows) {
      if (r.status === "ABSENT") streak.push(r.date);
      else if (r.status !== "REST_DAY" && r.status !== "HOLIDAY") endStreak();
    }
    endStreak();
  }

  const local = (d: Date) => zonedParts(d, input.timeZone);
  const hhmm = (d: Date) => {
    const m = local(d).minutes;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  // Outside geofence, one flag per employee
  const outside = new Map<string, { dates: Set<string>; max: number; n: number }>();
  for (const p of input.punches) {
    const f = input.fences.get(p.employeeId);
    if (!f || p.latitude == null || p.longitude == null) continue;
    const g = geofenceCheck({ lat: p.latitude, lng: p.longitude }, f);
    if (g.inside) continue;
    const o = outside.get(p.employeeId) ?? outside.set(p.employeeId, { dates: new Set(), max: 0, n: 0 }).get(p.employeeId)!;
    o.dates.add(local(p.at).date);
    o.max = Math.max(o.max, g.distance);
    o.n++;
  }
  for (const [emp, o] of outside) flag("OUTSIDE_GEOFENCE", o.max > 5000 ? "high" : "medium", [emp], [...o.dates].sort(), `${o.n} punch${o.n === 1 ? "" : "es"} outside ${input.fences.get(emp)!.name}, up to ${fmtDistance(o.max)} away`);

  // Buddy punching: 2+ employees on the same terminal, or photo-less phone/web punches from the same spot, within seconds
  // ponytail: O(n * window) scan over time-sorted punches; fine for a 14-day team range.
  const ps = input.punches.filter((p) => p.device || (!p.hasPhoto && p.latitude != null && p.longitude != null)).sort((a, b) => a.at.getTime() - b.at.getTime());
  const used = new Set<number>();
  for (let i = 0; i < ps.length; i++) {
    if (used.has(i)) continue;
    const seed = ps[i]!;
    const cluster = [i];
    for (let j = i + 1; j < ps.length && ps[j]!.at.getTime() - seed.at.getTime() <= R.buddySeconds * 1000; j++) {
      const p = ps[j]!;
      if (used.has(j)) continue;
      const same = seed.device
        ? p.device === seed.device
        : !p.device && geofenceCheck({ lat: p.latitude!, lng: p.longitude! }, { lat: seed.latitude!, lng: seed.longitude!, radius: R.buddyMeters }).inside;
      if (same) cluster.push(j);
    }
    const emps = [...new Set(cluster.map((k) => ps[k]!.employeeId))];
    if (emps.length < 2) continue;
    cluster.forEach((k) => used.add(k));
    const last = ps[cluster.at(-1)!]!;
    const secs = Math.round((last.at.getTime() - seed.at.getTime()) / 1000);
    flag("BUDDY_PUNCH", "high", emps, [local(seed.at).date], `${cluster.length} punches by ${emps.length} people ${seed.device ? `on ${seed.device}` : "from the same spot without a selfie"} within ${secs}s (${hhmm(seed.at)})`);
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (b.dates.at(-1) ?? "").localeCompare(a.dates.at(-1) ?? ""));
}
