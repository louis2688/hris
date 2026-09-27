// Run: node --test src/server/auth/oidc.test.mjs   (Node 22.18+ strips the .ts types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { SsoError, domainAllowed, openState, pkceChallenge, safeNext, sealState, verifyIdToken } from "./oidc.ts";

process.env.AUTH_SECRET = "test-secret-at-least-16-chars";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
const other = await generateKeyPair("RS256");

const google = { id: "google", clientId: "cid", clientSecret: "x", issuer: "https://accounts.google.com", multiTenant: false };
const msMulti = { id: "microsoft", clientId: "cid", clientSecret: "x", issuer: "https://login.microsoftonline.com/organizations/v2.0", multiTenant: true };
const MS_META_ISS = "https://login.microsoftonline.com/{tenantid}/v2.0";

const sign = (claims, key = privateKey, exp = "5m") =>
  new SignJWT({ nonce: "n1", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuedAt().setExpirationTime(exp).setSubject("sub-1").setAudience("cid").sign(key);
const code = (p) => p.then(() => "ok", (e) => (e instanceof SsoError ? e.code : e.code ?? e.name));

test("state cookie round-trips and rejects tampering", async () => {
  const st = { provider: "google", state: "s", nonce: "n", verifier: "v", next: "/me/leave" };
  const tok = await sealState(st);
  assert.deepEqual(await openState(tok), st);
  assert.equal(await openState(tok.slice(0, -2) + "xx"), null);
  assert.equal(await openState(undefined), null);
  // a state token signed with another secret is refused
  process.env.AUTH_SECRET = "a-different-secret-value!!";
  assert.equal(await openState(tok), null);
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
});

test("safeNext blocks open redirects", () => {
  assert.equal(safeNext("/leave/1"), "/leave/1");
  assert.equal(safeNext("/me?tab=documents"), "/me?tab=documents");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, "/\t/evil.com", "/\n/evil.com", "/\r//evil.com", "/a\\b"]) assert.equal(safeNext(bad), "/dashboard");
  for (const bad of ["/\t/evil.com", "/\\evil.com"]) assert.equal(new URL(bad, "https://hris.example").host, "evil.com"); // why they are refused
});

test("pkce challenge is unpadded base64url(sha256)", () => {
  assert.equal(pkceChallenge("abc"), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
});

test("google id_token: valid, bad sig, wrong aud, expired, wrong nonce, unverified email", async () => {
  const ok = await sign({ iss: "https://accounts.google.com", email: "A@Acme.com", email_verified: true });
  assert.deepEqual(await verifyIdToken(ok, keys, google, google.issuer, "n1"), { sub: "sub-1", email: "a@acme.com", tid: undefined });
  const bare = await sign({ iss: "accounts.google.com", email: "a@acme.com", email_verified: true });
  assert.equal(await code(verifyIdToken(bare, keys, google, google.issuer, "n1")), "ok");

  assert.equal(await code(verifyIdToken(await sign({ iss: google.issuer, email: "a@acme.com", email_verified: true }, other.privateKey), keys, google, google.issuer, "n1")), "ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
  assert.equal(await code(verifyIdToken(ok, keys, { ...google, clientId: "other" }, google.issuer, "n1")), "ERR_JWT_CLAIM_VALIDATION_FAILED");
  assert.equal(await code(verifyIdToken(await sign({ iss: google.issuer, email: "a@acme.com", email_verified: true }, privateKey, "-5m"), keys, google, google.issuer, "n1")), "ERR_JWT_EXPIRED");
  assert.equal(await code(verifyIdToken(ok, keys, google, google.issuer, "n2")), "sso_state");
  assert.equal(await code(verifyIdToken(await sign({ iss: "https://evil.example", email: "a@acme.com", email_verified: true }), keys, google, google.issuer, "n1")), "sso_failed");
  assert.equal(await code(verifyIdToken(await sign({ iss: google.issuer, email: "a@acme.com", email_verified: false }), keys, google, google.issuer, "n1")), "sso_unverified");
});

test("microsoft multi-tenant: issuer from tid template, trusts only preferred_username", async () => {
  const tid = "11111111-2222-3333-4444-555555555555";
  const iss = `https://login.microsoftonline.com/${tid}/v2.0`;
  const t = await sign({ iss, tid, email: "ceo@victim.com", preferred_username: "me@acme.com" });
  assert.deepEqual(await verifyIdToken(t, keys, msMulti, MS_META_ISS, "n1"), { sub: "sub-1", email: "me@acme.com", tid });
  // pinned tenant accepts the email claim
  assert.equal((await verifyIdToken(t, keys, { ...msMulti, multiTenant: false }, iss, "n1")).email, "ceo@victim.com");
  // iss must match the token's own tid; missing tid can't satisfy the template
  assert.equal(await code(verifyIdToken(await sign({ iss, tid: "99999999-2222-3333-4444-555555555555", preferred_username: "me@acme.com" }), keys, msMulti, MS_META_ISS, "n1")), "sso_failed");
  assert.equal(await code(verifyIdToken(await sign({ iss: MS_META_ISS, preferred_username: "me@acme.com" }), keys, msMulti, MS_META_ISS, "n1")), "sso_failed");
});

test("domain allow-list", () => {
  assert.equal(domainAllowed("a@acme.com", ""), true);
  assert.equal(domainAllowed("a@acme.com", "acme.com, acme.ph"), true);
  assert.equal(domainAllowed("a@evil.com", "acme.com"), false);
  assert.equal(domainAllowed("a@x.acme.com", "acme.com"), false);
});
