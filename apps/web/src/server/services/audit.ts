import "server-only";
import { prisma, type Prisma } from "@hris/db";

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
}
