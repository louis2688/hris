import { prisma } from "@hris/db";
import { handler, json } from "@/server/api";

/** GET /api/v1/notifications -> latest 50. POST marks all read. */
export const GET = handler(async ({ user }) =>
  json({ items: await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }) }),
);

export const POST = handler(async ({ user }) => {
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return json({ ok: true });
});
