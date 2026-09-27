import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma, type Prisma } from "@hris/db";
import type { AttendancePolicy } from "@hris/shared";

const DEFAULTS = {
  attendance: { requirePasskey: false, requirePhoto: false, requireLocation: false, requireGeofence: false } as AttendancePolicy,
  /** Shown on payslips and certificates of employment. Edited in Settings > Payroll. */
  company: { name: "Your Company Inc.", address: "", tin: "", signatoryName: "", signatoryTitle: "HR Manager" },
};
type Key = keyof typeof DEFAULTS;

// ponytail: settings are read on public pages (careers, offer links) and payslips but only written through set*() below,
// so reads are cached across requests and each write expires its key. A direct DB edit shows up within 5 minutes.
const read = (key: string) =>
  unstable_cache(async () => (await prisma.appSetting.findUnique({ where: { key }, select: { value: true } }))?.value ?? null, ["setting", key], {
    tags: [`setting:${key}`],
    revalidate: 300,
  })();

async function write(key: string, v: Prisma.InputJsonValue) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
  revalidateTag(`setting:${key}`, { expire: 0 });
}

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  return { ...DEFAULTS[key], ...(((await read(key)) as object | null) ?? {}) };
}

export async function setSetting<K extends Key>(key: K, value: (typeof DEFAULTS)[K]) {
  await write(key, value as unknown as Prisma.InputJsonValue);
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
  return { ...defaults, ...(((await read(key)) as object | null) ?? {}) };
}

export async function setJson(key: string, value: object) {
  await write(key, value as Prisma.InputJsonValue);
}
