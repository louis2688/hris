import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@hris/shared";

// Edge-safe (used by proxy.ts too). No Prisma imports here.

const ACCESS_TTL_SEC = 60 * 15; // mobile access tokens
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // web cookie

export const SESSION_COOKIE = "hris_session";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET missing or too short (min 16 chars)");
  return new TextEncoder().encode(s);
}

export type TokenKind = "session" | "access";

export async function signToken(user: SessionUser, kind: TokenKind): Promise<string> {
  const ttl = kind === "session" ? SESSION_TTL_SEC : ACCESS_TTL_SEC;
  return new SignJWT({ ...user, kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<(SessionUser & { kind: TokenKind }) | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      id: payload.sub,
      email: String(payload.email),
      role: payload.role as SessionUser["role"],
      employeeId: (payload.employeeId as string | null) ?? null,
      name: String(payload.name ?? ""),
      kind: (payload.kind as TokenKind) ?? "session",
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SEC;
export const ACCESS_TTL = ACCESS_TTL_SEC;
