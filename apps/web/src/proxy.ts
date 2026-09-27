import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/server/auth/jwt";

const PUBLIC = ["/login", "/api/auth", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/health", "/iclock", "/careers", "/offer"];

/**
 * Per-request nonce CSP (Next adds the nonce to its own inline scripts; the root layout adds it to the theme script).
 * Styles stay 'unsafe-inline': React style={} attributes and toasts can't carry a nonce. img-src allows https: for avatar URLs.
 */
function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function secure(res: NextResponse, policy: string) {
  res.headers.set("Content-Security-Policy", policy);
  res.headers.set("Permissions-Policy", "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()");
  if (process.env.NODE_ENV === "production") res.headers.set("Strict-Transport-Security", "max-age=31536000");
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  const pass = () => secure(NextResponse.next({ request: { headers } }), policy);

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return pass();

  // API routes authenticate themselves (bearer or cookie) and return JSON 401s.
  if (pathname.startsWith("/api/")) return pass();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return secure(NextResponse.redirect(url), policy);
  }
  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
