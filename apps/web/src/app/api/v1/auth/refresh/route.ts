import { refreshTokenSchema } from "@hris/shared";
import { apiError, body, handler, json } from "@/server/api";
import { rotateRefreshToken } from "@/server/auth/session";
import { ACCESS_TTL } from "@/server/auth/jwt";

/** POST /api/v1/auth/refresh { refreshToken } -> rotated pair. */
export const POST = handler(
  async ({ req }) => {
    const { refreshToken } = await body(req, refreshTokenSchema);
    const r = await rotateRefreshToken(refreshToken, req.headers.get("user-agent"));
    if (!r) return apiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    return json({ ...r, expiresIn: ACCESS_TTL, tokenType: "Bearer" });
  },
  { roles: null },
);
