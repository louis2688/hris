import "server-only";
import { after } from "next/server";
import { prisma, type Prisma } from "@hris/db";
import { renderEmail, sendMail } from "../mail";
import { getPushOptIn, sendPush } from "../push";

export async function audit(
  actorUserId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  data: { before?: unknown; after?: unknown } = {},
) {
  // ponytail: fire-and-forget; failures must never break the main write
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        entity,
        entityId,
        before: data.before === undefined ? undefined : (JSON.parse(JSON.stringify(data.before)) as Prisma.InputJsonValue),
        after: data.after === undefined ? undefined : (JSON.parse(JSON.stringify(data.after)) as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}

export async function notify(userId: string | null | undefined, title: string, body?: string, link?: string) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, title, body, link } });
  } catch (e) {
    console.error("notify failed", e);
  }
  // after() keeps the serverless fn alive past the response; it throws outside a request scope (scripts), so await there.
  const deliver = () => Promise.all([emailUser(userId, title, body, link), pushUser(userId, title, body, link)]);
  try {
    after(deliver);
  } catch {
    await deliver();
  }
}

/** Push to the user's phones unless they opted out on /me/security. sendPush never throws. */
async function pushUser(userId: string, title: string, body?: string, link?: string) {
  try {
    if (await getPushOptIn(userId)) await sendPush(userId, { title, body, data: link ? { link } : undefined });
  } catch (e) {
    console.error("notify push failed", e);
  }
}

/** Email a notification. Opt out per user: AppSetting { key: "email:<userId>", value: false }. */
async function emailUser(userId: string, title: string, body?: string, link?: string) {
  if (!process.env.SMTP_URL) return;
  try {
    const [user, optOut] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, isActive: true } }),
      prisma.appSetting.findUnique({ where: { key: `email:${userId}` } }),
    ]);
    if (!user?.isActive || optOut?.value === false) return;
    await sendMail({ to: user.email, subject: title, ...renderEmail(title, body, link) });
  } catch (e) {
    console.error("notify email failed", e);
  }
}
