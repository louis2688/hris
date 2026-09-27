import "server-only";
import { prisma, type Prisma } from "@hris/db";
import type { AttendancePolicy } from "@hris/shared";

const DEFAULTS = {
  attendance: { requirePasskey: false, requirePhoto: false, requireLocation: false, requireGeofence: false } as AttendancePolicy,
  /** Shown on payslips and certificates of employment. Edited in Settings > Payroll. */
  company: { name: "Your Company Inc.", address: "", tin: "", signatoryName: "", signatoryTitle: "HR Manager" },
};
type Key = keyof typeof DEFAULTS;

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return { ...DEFAULTS[key], ...((row?.value as object | null) ?? {}) };
}

export async function setSetting<K extends Key>(key: K, value: (typeof DEFAULTS)[K]) {
  const v = value as unknown as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

/** Per-user email opt-out, read by notify() in audit.ts. Missing row = opted in. */
export async function getEmailOptIn(userId: string): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: `email:${userId}` }, select: { value: true } });
  return row?.value !== false;
}

export async function setEmailOptIn(userId: string, on: boolean) {
  const key = `email:${userId}`;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: on }, update: { value: on } });
}

/** Untyped-key JSON setting for feature-owned config (e.g. "payroll"); the caller owns the shape and defaults. */
export async function getJson<T extends object>(key: string, defaults: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return { ...defaults, ...((row?.value as object | null) ?? {}) };
}

export async function setJson(key: string, value: object) {
  const v = value as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}
