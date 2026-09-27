// OpenID Connect helpers for Google / Microsoft sign-in (auth code + PKCE + state + nonce).
// No Next.js or Prisma imports so `node --test src/server/auth/oidc.test.mjs` can exercise it.
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type Provider = "google" | "microsoft";
export const STATE_COOKIE = "hris_oidc";
export const STATE_COOKIE_PATH = "/api/auth";
export const STATE_TTL_SEC = 600;
const STATE_AUD = "hris:oidc-state";

/** Error codes surface as /login?error=<code>. */
export class SsoError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type ProviderConfig = { id: Provider; clientId: string; clientSecret: string; issuer: string; multiTenant: boolean };

/** Null when the provider's env vars are missing (login buttons hide, routes 302 to sso_unavailable). */
export function providerConfig(p: string): ProviderConfig | null {
  const env = process.env;
  if (p === "google" && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    // ponytail: GOOGLE_ISSUER only exists so e2e can point at a local mock provider.
    return { id: "google", clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, issuer: env.GOOGLE_ISSUER || "https://accounts.google.com", multiTenant: false };
  }
  if (p === "microsoft" && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    const tenant = env.MICROSOFT_TENANT_ID || "organizations";
    return {
      id: "microsoft",
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      multiTenant: ["common", "organizations", "consumers"].includes(tenant),
    };
  }
  return null;
}

export type OidcMeta = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
const metaCache = new Map<string, Promise<OidcMeta>>();
const jwksCache = new Map<string, JWTVerifyGetKey>();

/** Cached discovery document (failed lookups are not cached). */
export function discover(issuer: string): Promise<OidcMeta> {
  let m = metaCache.get(issuer);
  if (!m) {
    m = fetch(`${issuer}/.well-known/openid-configuration`, { headers: { accept: "application/json" } }).then(async (r) => {
      if (!r.ok) throw new Error(`OIDC discovery ${issuer} -> ${r.status}`);
      return (await r.json()) as OidcMeta;
    });
    metaCache.set(issuer, m);
    m.catch(() => metaCache.delete(issuer));
  }
  return m;
}

export function jwks(uri: string): JWTVerifyGetKey {
  let k = jwksCache.get(uri);
  if (!k) jwksCache.set(uri, (k = createRemoteJWKSet(new URL(uri))));
  return k;
}

export const randomToken = () => randomBytes(32).toString("base64url");
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/**
 * Only same-origin relative paths; anything else lands on the dashboard.
 * Backslashes and control chars are refused too: URL parsers turn "/\\x" into "//x" and drop tabs/newlines ("/\t/x" -> "//x").
 */
export const safeNext = (n?: string | null) => (n && /^\/(?![/\\])/.test(n) && !/[\u0000-\u001f\u007f\\]/.test(n) ? n : "/dashboard");

// ---- State cookie: HS256 JWT with its own audience so it can never pass as a session token ----

export type OidcState = { provider: Provider; state: string; nonce: string; verifier: string; next: string };

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET missing or too short (min 16 chars)");
  return new TextEncoder().encode(s);
}

export const sealState = (s: OidcState) =>
  new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setAudience(STATE_AUD).setIssuedAt().setExpirationTime(`${STATE_TTL_SEC}s`).sign(key());

export async function openState(token: string | undefined): Promise<OidcState | null> {
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, key(), { audience: STATE_AUD, algorithms: ["HS256"] });
    if (typeof p.state !== "string" || typeof p.nonce !== "string" || typeof p.verifier !== "string" || typeof p.provider !== "string") return null;
    return { provider: p.provider as Provider, state: p.state, nonce: p.nonce, verifier: p.verifier, next: safeNext(p.next as string) };
  } catch {
    return null;
  }
}

// ---- Code exchange + id_token validation ----

export async function exchangeCode(cfg: ProviderConfig, meta: OidcMeta, code: string, verifier: string, redirectUri: string): Promise<string> {
  const r = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: verifier }),
  });
  const j = (await r.json().catch(() => ({}))) as { id_token?: unknown; error?: string };
  if (!r.ok || typeof j.id_token !== "string") {
    console.error("sso token exchange failed", cfg.id, r.status, j.error);
    throw new SsoError("sso_failed");
  }
  return j.id_token;
}

export type SsoClaims = { sub: string; email: string; tid?: string };

/**
 * Verify signature (provider JWKS), iss, aud/azp, exp and nonce, then pick the email.
 * `metaIssuer` is the discovery doc's issuer; Microsoft multi-tenant uses the "{tenantid}" template.
 */
export async function verifyIdToken(idToken: string, keys: JWTVerifyGetKey, cfg: ProviderConfig, metaIssuer: string, nonce: string): Promise<SsoClaims> {
  const { payload: c } = await jwtVerify(idToken, keys, { audience: cfg.clientId, algorithms: ["RS256"], clockTolerance: 60, requiredClaims: ["exp", "iat", "sub"] });
  const tid = typeof c.tid === "string" ? c.tid : undefined;
  const expectedIss = tid ? metaIssuer.replace("{tenantid}", tid) : metaIssuer;
  const issOk = c.iss === expectedIss || (cfg.id === "google" && c.iss === expectedIss.replace(/^https:\/\//, ""));
  if (!issOk || expectedIss.includes("{tenantid}")) throw new SsoError("sso_failed");
  if (Array.isArray(c.aud) && c.aud.length > 1 && c.azp !== cfg.clientId) throw new SsoError("sso_failed");
  if (typeof c.nonce !== "string" || c.nonce !== nonce) throw new SsoError("sso_state");

  let email: unknown;
  if (cfg.id === "google") {
    if (c.email_verified !== true && c.email_verified !== "true") throw new SsoError("sso_unverified");
    email = c.email;
  } else {
    // ponytail: with a multi-tenant app any tenant can set an arbitrary `email` claim (nOAuth), so trust only the UPN,
    // whose domain the home tenant had to verify. Pin MICROSOFT_TENANT_ID to also accept `email`.
    email = cfg.multiTenant ? c.preferred_username : (c.email ?? c.preferred_username);
  }
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new SsoError("sso_unverified");
  return { sub: c.sub as string, email: email.toLowerCase(), tid };
}

/** Optional allow-list: SSO_ALLOWED_DOMAINS="acme.com,acme.ph". Unset = any domain. */
export function domainAllowed(email: string, list = process.env.SSO_ALLOWED_DOMAINS) {
  const domains = (list ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return !domains.length || domains.includes(email.slice(email.lastIndexOf("@") + 1).toLowerCase());
}
