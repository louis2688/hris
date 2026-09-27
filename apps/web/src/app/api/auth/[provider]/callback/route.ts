import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@hris/db";
import { appUrl } from "@/server/mail";
import { audit } from "@/server/services/audit";
import { setSessionCookie, toSessionUser } from "@/server/auth/session";
import {
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  SsoError,
  discover,
  domainAllowed,
  exchangeCode,
  jwks,
  openState,
  providerConfig,
  verifyIdToken,
  type Provider,
  type SsoClaims,
} from "@/server/auth/oidc";

const withEmployee = { employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } } } as const;

/**
 * Linking policy, no auto-provisioning: known (provider, sub) -> that user; else an ACTIVE user with the
 * same email (and an allowed domain) gets the identity linked; else sso_no_account.
 */
async function resolveUser(provider: Provider, c: SsoClaims) {
  const linked = await prisma.userIdentity.findUnique({ where: { provider_subject: { provider, subject: c.sub } }, include: { user: { include: withEmployee } } });
  if (linked) {
    if (!linked.user.isActive) throw new SsoError("sso_no_account");
    return linked.user;
  }
  if (!domainAllowed(c.email)) throw new SsoError("sso_domain");
  const user = await prisma.user.findUnique({ where: { email: c.email }, include: withEmployee });
  if (!user?.isActive) throw new SsoError("sso_no_account");
  const idn = await prisma.userIdentity.create({ data: { provider, subject: c.sub, userId: user.id } });
  await audit(user.id, "auth.sso_link", "UserIdentity", idn.id, { after: { provider, tid: c.tid } });
  return user;
}

/** GET /api/auth/{google|microsoft}/callback?code&state -> web session, 302 to the saved `next`. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = req.nextUrl.searchParams;
  let dest: string;
  try {
    const st = await openState(req.cookies.get(STATE_COOKIE)?.value);
    if (!st || st.provider !== provider || q.get("state") !== st.state) throw new SsoError("sso_state");
    if (q.get("error")) throw new SsoError(q.get("error") === "access_denied" ? "sso_cancelled" : "sso_failed");
    const code = q.get("code");
    const cfg = providerConfig(provider);
    if (!cfg) throw new SsoError("sso_unavailable");
    if (!code) throw new SsoError("sso_failed");
    const meta = await discover(cfg.issuer);
    const idToken = await exchangeCode(cfg, meta, code, st.verifier, appUrl(`/api/auth/${cfg.id}/callback`));
    const claims = await verifyIdToken(idToken, jwks(meta.jwks_uri), cfg, meta.issuer, st.nonce);
    const user = await resolveUser(cfg.id, claims);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await setSessionCookie(toSessionUser(user));
    await audit(user.id, "auth.sso_login", "User", user.id, { after: { provider, tid: claims.tid } });
    dest = st.next;
  } catch (e) {
    if (!(e instanceof SsoError)) console.error("sso callback failed", e);
    dest = `/login?error=${e instanceof SsoError ? e.code : "sso_failed"}`;
  }
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set(STATE_COOKIE, "", { path: STATE_COOKIE_PATH, maxAge: 0 }); // one-shot
  return res;
}
