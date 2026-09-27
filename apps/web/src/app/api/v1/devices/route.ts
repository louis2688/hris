import { prisma } from "@hris/db";
import { registerDeviceSchema, unregisterDeviceSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";

/** POST /api/v1/devices { token, platform } -> registers this phone's Expo push token for the caller. */
export const POST = handler(async ({ req, user }) => {
  const { token, platform } = await body(req, registerDeviceSchema);
  // A token belongs to one install; if someone else signed in on this phone before, it moves to the new user.
  await prisma.deviceToken.upsert({
    where: { token },
    create: { token, platform, userId: user.id },
    update: { platform, userId: user.id, lastSeenAt: new Date() },
  });
  return json({ ok: true });
});

/** DELETE /api/v1/devices { token } -> stop pushing to this phone (called on sign-out). */
export const DELETE = handler(async ({ req, user }) => {
  const { token } = await body(req, unregisterDeviceSchema);
  await prisma.deviceToken.deleteMany({ where: { token, userId: user.id } });
  return json({ ok: true });
});
