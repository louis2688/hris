import "server-only";
import { prisma } from "@hris/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = { title: string; body?: string; data?: { link?: string } };
type Ticket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

/**
 * Send to every registered device of a user via the Expo push service, 100 per request.
 * Tokens Expo reports as DeviceNotRegistered are deleted. Never throws; returns tickets accepted.
 * ponytail: only ticket errors are handled; delivery receipts (a second call ~15 min later) are not polled.
 */
export async function sendPush(userId: string, msg: PushMessage): Promise<number> {
  try {
    const tokens = (await prisma.deviceToken.findMany({ where: { userId, user: { isActive: true } }, select: { token: true } })).map((t) => t.token);
    let ok = 0;
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: "default" }))),
      });
      const json = (await res.json().catch(() => null)) as { data?: Ticket[]; errors?: unknown } | null;
      if (!res.ok || !Array.isArray(json?.data)) {
        console.error("expo push failed", res.status, json?.errors);
        continue;
      }
      const dead = batch.filter((_, j) => json.data![j]?.details?.error === "DeviceNotRegistered");
      if (dead.length) await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      ok += json.data.filter((t) => t.status === "ok").length;
    }
    return ok;
  } catch (e) {
    console.error("sendPush failed", e);
    return 0;
  }
}

/** Per-user push opt-out: AppSetting { key: "push:<userId>", value: false }. Missing row = on. */
export async function getPushOptIn(userId: string): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: `push:${userId}` }, select: { value: true } });
  return row?.value !== false;
}

export async function setPushOptIn(userId: string, on: boolean) {
  const key = `push:${userId}`;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: on }, update: { value: on } });
}
