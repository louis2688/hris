import { loginSchema } from "@hris/shared";
import { apiError, body, handler, json } from "@/server/api";
import { authenticate, issueRefreshToken } from "@/server/auth/session";
import { ACCESS_TTL, signToken } from "@/server/auth/jwt";
import { audit } from "@/server/services/audit";
import { clientIp, loginLimit, loginRefund, tooManyMessage } from "@/server/rate-limit";

/** POST /api/v1/auth/login { email, password } -> tokens for mobile clients. */
export const POST = handler(
  async ({ req }) => {
    const { email, password } = await body(req, loginSchema);
    const ip = clientIp(req.headers);
    const lim = await loginLimit(email, ip);
    if (!lim.ok) {
      const r = apiError(429, "RATE_LIMITED", tooManyMessage(lim.retryAfterSec));
      r.headers.set("Retry-After", String(lim.retryAfterSec));
      return r;
    }
    const user = await authenticate(email, password);
    if (!user) return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    await loginRefund(email, ip);
    const [accessToken, refreshToken] = await Promise.all([signToken(user, "access"), issueRefreshToken(user.id, req.headers.get("user-agent"))]);
    await audit(user.id, "auth.login_api", "User", user.id);
    return json({ accessToken, refreshToken, expiresIn: ACCESS_TTL, tokenType: "Bearer", user });
  },
  { roles: null },
);
