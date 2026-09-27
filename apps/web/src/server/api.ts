import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import type { Role, SessionUser } from "@hris/shared";
import { AuthError, getSession } from "./auth/session";
import { AppError } from "./services/errors";

type Ctx<P> = { req: NextRequest; params: P; user: SessionUser };

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for cookie-authenticated writes (same check Next applies to server actions): a browser always sends
 * Origin on cross-origin POST/PATCH/DELETE, so a mismatching Origin with no bearer token is refused.
 * Bearer (mobile) calls and non-browser clients without Origin are unaffected.
 */
export function crossSiteCookieWrite(req: NextRequest) {
  if (SAFE_METHODS.has(req.method) || req.headers.get("authorization")?.startsWith("Bearer ")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Wrap a route handler: resolves the user (cookie or bearer), enforces roles,
 * converts thrown errors to JSON. Public routes pass `roles: null`.
 */
export function handler<P extends Record<string, string> = Record<string, string>>(
  fn: (ctx: Ctx<P>) => Promise<Response>,
  opts: { roles?: Role[] | null } = {},
) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    try {
      const params = await route.params;
      let user: SessionUser | null = null;
      if (opts.roles !== null) {
        if (crossSiteCookieWrite(req)) return apiError(403, "FORBIDDEN", "Cross-origin request blocked");
        user = await getSession();
        if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in required");
        if (opts.roles && !opts.roles.includes(user.role)) return apiError(403, "FORBIDDEN", "Insufficient role");
      }
      return await fn({ req, params, user: user as SessionUser });
    } catch (e) {
      if (e instanceof AuthError) return apiError(e.status, e.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", e.message);
      if (e instanceof AppError) return apiError(e.status, e.code, e.message);
      if (e instanceof Response) return e;
      console.error(e);
      return apiError(500, "INTERNAL", "Something went wrong");
    }
  };
}

export async function body<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw apiError(400, "INVALID_JSON", "Body must be JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw apiError(422, "VALIDATION", "Invalid request", r.error.flatten().fieldErrors);
  return r.data;
}

export function query<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const r = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!r.success) throw apiError(422, "VALIDATION", "Invalid query", r.error.flatten().fieldErrors);
  return r.data;
}
