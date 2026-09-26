import { z } from "zod";
import { body, handler, json } from "@/server/api";
import { revokeRefreshToken } from "@/server/auth/session";

/** POST /api/v1/auth/logout { refreshToken } -> revokes it. Access tokens expire on their own (15 min). */
export const POST = handler(async ({ req }) => {
  const { refreshToken } = await body(req, z.object({ refreshToken: z.string().min(1) }));
  await revokeRefreshToken(refreshToken);
  return json({ ok: true });
});
