/**
 * Demo scheduling + attendance: Manila HQ geofence (policy stays off), shift overrides for the Engineering team
 * this week and next (Paolo on nights Tue-Thu, Kristine's rest day moved Wed -> Sat), two weeks of normal punches
 * for that team, plus punches that trip anomaly rules (Kristine's repeated lates, Paolo + Rafael buddy punching
 * on the lobby terminal, a Rafael phone punch far outside the geofence).
 * Idempotent: punches it made are tagged "[seed:sched]" and replaced on every run; assignments are upserts.
 */
import type { PrismaClient } from "../../generated/prisma/client.js";

const TZ_OFFSET = "+08:00"; // Asia/Manila, no DST
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const at = (date: string, hhmm: string, sec = 0) => new Date(`${date}T${hhmm}:${String(sec).padStart(2, "0")}${TZ_OFFSET}`);
/** Deterministic jitter 0..n-1 so re-runs produce the same times. */
const jitter = (s: string, n: number) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % n;
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export async function seedScheduling(prisma: PrismaClient) {
  const manila = await prisma.location.update({ where: { name: "Manila HQ" }, data: { latitude: 14.5547, longitude: 121.0244, geofenceRadius: 300 } }).catch(() => null);
  const [regular, night] = await Promise.all([prisma.workShift.findUnique({ where: { name: "Regular 9-6" } }), prisma.workShift.findUnique({ where: { name: "Night 10pm-7am" } })]);
  const team = await prisma.employee.findMany({ where: { employeeCode: { in: ["EMP-0004", "EMP-0005", "EMP-0006", "EMP-0007"] } }, select: { id: true, employeeCode: true } });
  const id = Object.fromEntries(team.map((e) => [e.employeeCode, e.id]));
  if (!manila || !regular || !night || team.length < 4) return console.log("seedScheduling: base seed missing, skipped");
  const [bianca, paolo, kristine, rafael] = ["EMP-0004", "EMP-0005", "EMP-0006", "EMP-0007"].map((c) => id[c]!);

  // ---- Shift overrides: this week and next ----
  const today = manilaToday();
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const overrides: { employeeId: string; date: string; shiftId: string | null }[] = [];
  for (const w of [0, 7]) {
    for (const d of [1, 2, 3]) overrides.push({ employeeId: paolo!, date: addDays(monday, w + d), shiftId: night.id }); // Tue-Thu nights
    overrides.push({ employeeId: kristine!, date: addDays(monday, w + 2), shiftId: null }); // Wed off
    overrides.push({ employeeId: kristine!, date: addDays(monday, w + 5), shiftId: regular.id }); // works Sat
  }
  for (const o of overrides) {
    const key = { employeeId: o.employeeId, date: new Date(o.date) };
    await prisma.shiftAssignment.upsert({ where: { employeeId_date: key }, create: { ...key, shiftId: o.shiftId, note: "Seed roster" }, update: { shiftId: o.shiftId } });
  }
  const override = new Map(overrides.map((o) => [`${o.employeeId}|${o.date}`, o.shiftId]));

  // ---- Punches: last 14 days (not today) ----
  const device = await prisma.biometricDevice.upsert({ where: { serial: "SEED-LOBBY-01" }, update: {}, create: { name: "Manila HQ Lobby", serial: "SEED-LOBBY-01", locationId: manila.id } });
  await prisma.attendancePunch.deleteMany({ where: { note: { startsWith: "[seed:sched]" } } });

  type P = { employeeId: string; at: Date; direction: "IN" | "OUT"; source: "WEB" | "MOBILE" | "DEVICE"; method: "NONE" | "FINGERPRINT"; deviceId?: string; latitude?: number; longitude?: number; note: string };
  const punches: P[] = [];
  const web = (employeeId: string, a: Date, direction: "IN" | "OUT"): P => ({ employeeId, at: a, direction, source: "WEB", method: "NONE", note: "[seed:sched] demo punch" });
  const lastWeek = addDays(monday, -7);
  const lateDays = new Map([[addDays(lastWeek, 0), "09:25"], [addDays(lastWeek, 1), "09:40"], [addDays(lastWeek, 2), "09:18"]]);
  const buddyDay = addDays(lastWeek, 3);
  const farDay = addDays(lastWeek, 4);

  for (let date = addDays(today, -14); date < today; date = addDays(date, 1)) {
    for (const emp of [bianca!, paolo!, kristine!, rafael!]) {
      const key = `${emp}|${date}`;
      const shiftId = override.has(key) ? override.get(key) : [1, 2, 3, 4, 5].includes(weekday(date)) ? regular.id : null;
      if (!shiftId) continue;
      const j = jitter(key, 14);
      if (shiftId === night.id) {
        punches.push(web(emp, at(date, hm(21 * 60 + 45 + j)), "IN"), web(emp, at(addDays(date, 1), hm(7 * 60 + j)), "OUT"));
        continue;
      }
      let timeIn = hm(8 * 60 + 44 + j);
      if (emp === kristine && lateDays.has(date)) timeIn = lateDays.get(date)!;
      if (date === buddyDay && (emp === paolo || emp === rafael)) {
        // two people, one terminal, 25 seconds apart
        punches.push({ employeeId: emp, at: emp === paolo ? at(date, "08:57", 40) : at(date, "08:58", 5), direction: "IN", source: "DEVICE", method: "FINGERPRINT", deviceId: device.id, note: "[seed:sched] terminal punch" });
      } else if (date === farDay && emp === rafael) {
        punches.push({ ...web(emp, at(date, timeIn), "IN"), source: "MOBILE", latitude: 14.6091, longitude: 121.0223, note: "[seed:sched] phone punch" }); // ~6 km away
      } else punches.push(web(emp, at(date, timeIn), "IN"));
      punches.push(web(emp, at(date, hm(18 * 60 + 2 + j)), "OUT"));
    }
  }
  const r = await prisma.attendancePunch.createMany({ data: punches, skipDuplicates: true });
  console.log(`seedScheduling: ${overrides.length} shift overrides, ${r.count} punches`);
}
