import "server-only";
import { prisma, type Prisma } from "@hris/db";
import type { AttendancePolicy } from "@hris/shared";

const DEFAULTS = {
  attendance: { requirePasskey: false, requirePhoto: false, requireLocation: false } as AttendancePolicy,
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
