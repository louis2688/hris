import "server-only";
import { prisma } from "@hris/db";
import { addDaysIso, DEFAULT_TIMEZONE, detectAnomalies, zonedParts, type AnomalyKind, type SessionUser, type Severity } from "@hris/shared";
import { isStaff, scopeWhere } from "../authz";
import { dtrEmployeeSelect, dtrRowsForRange } from "./attendance";

/**
 * Anomaly flags for employees `u` can see (managers: their reports, not themselves), default last 14 days.
 * ponytail: computed on read, no table; persist + notify when a daily digest is wanted.
 */
export async function findAnomalies(u: SessionUser, f: { from?: string; to?: string; kind?: AnomalyKind; severity?: Severity } = {}) {
  const today = zonedParts(new Date(), DEFAULT_TIMEZONE).date;
  const to = f.to ?? today;
  const from = f.from ?? addDaysIso(to, -13);
  const emps = await prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] }, ...(scopeWhere(u) ?? {}), ...(isStaff(u) ? {} : { NOT: { id: u.employeeId ?? "-" } }) },
    select: { ...dtrEmployeeSelect, firstName: true, lastName: true, preferredName: true, employeeCode: true, location: { select: { timezone: true, name: true, latitude: true, longitude: true, geofenceRadius: true } } },
  });
  const ids = emps.map((e) => e.id);
  const window = { gte: new Date(Date.parse(from) - 86400_000), lt: new Date(Date.parse(addDaysIso(to, 2))) };
  const [rows, punches, withPhoto] = await Promise.all([
    dtrRowsForRange(emps, from, to),
    prisma.attendancePunch.findMany({
      where: { employeeId: { in: ids }, at: window },
      select: { id: true, employeeId: true, at: true, latitude: true, longitude: true, device: { select: { name: true } } },
    }),
    prisma.attendancePunch.findMany({ where: { employeeId: { in: ids }, at: window, NOT: { photo: null } }, select: { id: true } }),
  ]);
  const photo = new Set(withPhoto.map((p) => p.id));
  const fences = new Map(
    emps.flatMap((e) => {
      const l = e.location;
      return l?.latitude != null && l.longitude != null && l.geofenceRadius ? [[e.id, { name: l.name, lat: l.latitude, lng: l.longitude, radius: l.geofenceRadius }] as const] : [];
    }),
  );
  const inRange = (d: Date) => {
    const x = zonedParts(d, DEFAULT_TIMEZONE).date;
    return x >= from && x <= to;
  };
  const all = detectAnomalies({
    rows,
    punches: punches.filter((p) => inRange(p.at)).map((p) => ({ employeeId: p.employeeId, at: p.at, device: p.device?.name ?? null, latitude: p.latitude, longitude: p.longitude, hasPhoto: photo.has(p.id) })),
    fences,
    timeZone: DEFAULT_TIMEZONE,
    today,
  });
  const people = new Map(emps.map((e) => [e.id, { id: e.id, name: `${e.preferredName ?? e.firstName} ${e.lastName}`, code: e.employeeCode }]));
  return {
    from,
    to,
    anomalies: all.filter((a) => (!f.kind || a.kind === f.kind) && (!f.severity || a.severity === f.severity)).map((a) => ({ ...a, people: a.employeeIds.map((id) => people.get(id)!) })),
  };
}
