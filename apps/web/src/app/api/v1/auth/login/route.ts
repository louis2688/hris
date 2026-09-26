import { loginSchema } from "@hris/shared";
import { apiError, body, handler, json } from "@/server/api";
import { authenticate, issueRefreshToken } from "@/server/auth/session";
import { ACCESS_TTL, signToken } from "@/server/auth/jwt";
import { audit } from "@/server/services/audit";

/** POST /api/v1/auth/login { email, password } -> tokens for mobile clients. */
export const POST = handler(
  async ({ req }) => {
    const { email, password } = await body(req, loginSchema);
    const user = await authenticate(email, password);
    if (!user) return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    const [accessToken, refreshToken] = await Promise.all([signToken(user, "access"), issueRefreshToken(user.id, req.headers.get("user-agent"))]);
    await audit(user.id, "auth.login_api", "User", user.id);
    return json({ accessToken, refreshToken, expiresIn: ACCESS_TTL, tokenType: "Bearer", user });
  },
  { roles: null },
);
