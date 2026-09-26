import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@hris/db";
import { DEFAULT_TIMEZONE, zonedToUtc, type AdmsPunch, type DeviceInput, type PunchMethod, type SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { conflict } from "./errors";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const listDevices = () =>
  prisma.biometricDevice.findMany({ orderBy: { name: "asc" }, include: { location: { select: { name: true, timezone: true } }, _count: { select: { punches: true } } } });

export async function saveDevice(actor: SessionUser, d: DeviceInput, id?: string) {
  const data = { name: d.name, serial: d.serial, locationId: d.locationId ?? null };
  try {
    const row = id ? await prisma.biometricDevice.update({ where: { id }, data }) : await prisma.biometricDevice.create({ data });
    await audit(actor.id, id ? "device.update" : "device.create", "BiometricDevice", row.id, { after: row });
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("A device with that serial is already registered");
    throw e;
  }
}

export async function deleteDevice(actor: SessionUser, id: string) {
  await prisma.biometricDevice.delete({ where: { id } });
  await audit(actor.id, "device.delete", "BiometricDevice", id);
}

/** New API key for the JSON push endpoint. Returned once, stored hashed. */
export async function rotateDeviceKey(actor: SessionUser, id: string) {
  const key = `dev_${randomBytes(24).toString("base64url")}`;
  await prisma.biometricDevice.update({ where: { id }, data: { apiKeyHash: sha(key) } });
  await audit(actor.id, "device.rotate_key", "BiometricDevice", id);
  return key;
}

export const deviceByKey = (key: string) => prisma.biometricDevice.findFirst({ where: { apiKeyHash: sha(key), isActive: true }, include: { location: true } });
export const deviceBySerial = (serial: string) => prisma.biometricDevice.findFirst({ where: { serial, isActive: true }, include: { location: true } });

/** Store punches keyed by device enroll number. Idempotent on (employee, instant). */
export async function ingestPunches(deviceId: string, rows: { biometricId: string; at: Date; method: PunchMethod; direction?: "IN" | "OUT" | null }[]) {
  const ids = [...new Set(rows.map((r) => r.biometricId))];
  const emps = await prisma.employee.findMany({ where: { biometricId: { in: ids } }, select: { id: true, biometricId: true } });
  const map = new Map(emps.map((e) => [e.biometricId!, e.id]));
  const data = rows
    .filter((r) => map.has(r.biometricId))
    .map((r) => ({ employeeId: map.get(r.biometricId)!, at: r.at, direction: r.direction ?? null, source: "DEVICE" as const, method: r.method, deviceId }));
  const res = data.length ? await prisma.attendancePunch.createMany({ data, skipDuplicates: true }) : { count: 0 };
  await prisma.biometricDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
  return { received: rows.length, stored: res.count, unknownIds: ids.filter((i) => !map.has(i)) };
}

export function admsToRows(punches: AdmsPunch[], timeZone: string | null | undefined) {
  const tz = timeZone || DEFAULT_TIMEZONE;
  return punches.map((p) => {
    const at = zonedToUtc(p.date, p.time.slice(0, 5), tz);
    at.setUTCSeconds(Number(p.time.slice(6, 8)));
    return { biometricId: p.biometricId, at, method: p.method, direction: p.direction };
  });
}
