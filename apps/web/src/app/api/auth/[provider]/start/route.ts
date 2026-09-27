import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/server/mail";
import { STATE_COOKIE, STATE_COOKIE_PATH, STATE_TTL_SEC, discover, pkceChallenge, providerConfig, randomToken, safeNext, sealState } from "@/server/auth/oidc";

/** GET /api/auth/{google|microsoft}/start?next=/path -> 302 to the provider with state, nonce and PKCE. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const cfg = providerConfig((await params).provider);
  if (!cfg) return NextResponse.redirect(new URL("/login?error=sso_unavailable", req.url));
  let authz: string;
  try {
    authz = (await discover(cfg.issuer)).authorization_endpoint;
  } catch (e) {
    console.error("sso discovery failed", e);
    return NextResponse.redirect(new URL("/login?error=sso_unavailable", req.url));
  }
  const st = { provider: cfg.id, state: randomToken(), nonce: randomToken(), verifier: randomToken(), next: safeNext(req.nextUrl.searchParams.get("next")) };
  const url = new URL(authz);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: appUrl(`/api/auth/${cfg.id}/callback`),
    state: st.state,
    nonce: st.nonce,
    code_challenge: pkceChallenge(st.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, await sealState(st), {
    httpOnly: true,
    sameSite: "lax", // sent on the provider's top-level GET redirect back to /callback
    secure: process.env.NODE_ENV === "production",
    path: STATE_COOKIE_PATH,
    maxAge: STATE_TTL_SEC,
  });
  return res;
}
