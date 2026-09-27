import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@hris/db";
import type { Role, SessionUser } from "@hris/shared";
import { SESSION_COOKIE, SESSION_MAX_AGE, signToken, verifyToken } from "./jwt";

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export function toSessionUser(u: {
  id: string;
  email: string;
  role: Role;
  employee: { id: string; firstName: string; lastName: string; preferredName: string | null } | null;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    employeeId: u.employee?.id ?? null,
    name: u.employee ? `${u.employee.preferredName ?? u.employee.firstName} ${u.employee.lastName}` : u.email,
  };
}

/** Verify credentials. Returns session user or null. Constant-ish time on unknown email. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok || !user.isActive) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return toSessionUser(user);
}

export async function setSessionCookie(user: SessionUser) {
  const token = await signToken(user, "session");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Resolve the current user from the session cookie or an Authorization bearer
 * token (mobile). Cached per request.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const h = await headers();
  const bearer = h.get("authorization");
  let token: string | undefined;
  if (bearer?.startsWith("Bearer ")) token = bearer.slice(7);
  else token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  // Revalidate against DB so deactivation / role changes take effect immediately. The one DB hit per request.
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, role: true, isActive: true, sessionsValidAfter: true, employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
  if (!user || !user.isActive) return null;
  if (user.sessionsValidAfter && payload.iat * 1000 < user.sessionsValidAfter.getTime()) return null;
  return toSessionUser(user);
});

/**
 * Kill every session of a user: tokens issued before now stop working. mobile=true also revokes refresh tokens
 * (password change/reset); web logout keeps the phone signed in, its access token just refreshes.
 * ponytail: second resolution (JWT iat), so a token minted in the same second survives; per-session rows if that ever matters.
 */
export async function endAllSessions(userId: string, { mobile = true } = {}) {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { sessionsValidAfter: now } }),
    ...(mobile ? [prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })] : []),
  ]);
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AuthError("Not authenticated", 401);
  return s;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new AuthError("Forbidden", 403);
  return s;
}

/** Page guard: same as requireRole but redirects instead of throwing (error messages are stripped in prod). */
export async function gate(...roles: Role[]): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!roles.includes(s.role)) redirect("/forbidden");
  return s;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

// ---- Refresh tokens (mobile) ----

const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueRefreshToken(userId: string, userAgent?: string | null) {
  const raw = randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: userAgent ?? undefined },
  });
  return raw;
}

/**
 * Rotate: revoke the presented token, return a fresh pair.
 * Reuse of an already-rotated token means it leaked (or two clients share it): revoke every token of that user.
 */
export async function rotateRefreshToken(raw: string, userAgent?: string | null) {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: { include: { employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } } } } },
  });
  if (!row) return null;
  const revokeAll = () => prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (row.revokedAt) {
    await revokeAll();
    return null;
  }
  if (row.expiresAt < new Date() || !row.user.isActive) return null;
  // Conditional update so two concurrent refreshes with the same token cannot both win.
  const won = await prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (won.count !== 1) {
    await revokeAll();
    return null;
  }
  const user = toSessionUser(row.user);
  return { user, accessToken: await signToken(user, "access"), refreshToken: await issueRefreshToken(user.id, userAgent) };
}

export async function revokeRefreshToken(raw: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
}
