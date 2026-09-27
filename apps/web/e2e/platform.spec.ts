import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { login, PASSWORD, USERS } from "./helpers";

// SSO start/callback checks work against any server. The full Google round trip runs only when the dev server
// points Google at the local mock provider below:
//   server: GOOGLE_CLIENT_ID=e2e GOOGLE_CLIENT_SECRET=e2e GOOGLE_ISSUER=http://localhost:3199 APP_URL=<base url>
//   tests:  E2E_MOCK_OIDC_PORT=3199
const MOCK_PORT = Number(process.env.E2E_MOCK_OIDC_PORT) || 0;

let server: Server | undefined;
let email = USERS.employee;

test.beforeAll(async () => {
  if (!MOCK_PORT) return;
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const kid = randomBytes(8).toString("hex"); // fresh kid per run so the server's cached JWKS refetches
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  const base = `http://localhost:${MOCK_PORT}`;
  const codes = new Map<string, { nonce: string; challenge: string; clientId: string; redirect: string; email: string }>();
  server = createServer(async (req, res) => {
    const u = new URL(req.url!, base);
    const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (u.pathname === "/.well-known/openid-configuration")
      return send(200, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, jwks_uri: `${base}/jwks` });
    if (u.pathname === "/jwks") return send(200, { keys: [jwk] });
    if (u.pathname === "/authorize") {
      const p = u.searchParams;
      const code = randomBytes(16).toString("hex");
      codes.set(code, { nonce: p.get("nonce")!, challenge: p.get("code_challenge")!, clientId: p.get("client_id")!, redirect: p.get("redirect_uri")!, email });
      return res.writeHead(302, { location: `${p.get("redirect_uri")}?code=${code}&state=${encodeURIComponent(p.get("state")!)}` }).end();
    }
    if (u.pathname === "/token" && req.method === "POST") {
      let raw = "";
      for await (const c of req) raw += c;
      const f = new URLSearchParams(raw);
      const c = codes.get(f.get("code") ?? "");
      codes.delete(f.get("code") ?? "");
      const pkceOk = c && createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") === c.challenge;
      if (!c || !pkceOk || f.get("redirect_uri") !== c.redirect || f.get("client_id") !== c.clientId) return send(400, { error: "invalid_grant" });
      const idToken = await new SignJWT({ email: c.email, email_verified: true, nonce: c.nonce })
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuer(base)
        .setAudience(c.clientId)
        .setSubject(`mock-${c.email}`)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return send(200, { access_token: "x", token_type: "Bearer", id_token: idToken });
    }
    send(404, {});
  });
  await new Promise<void>((r) => server!.listen(MOCK_PORT, r));
});
test.afterAll(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

test("SSO start redirects with client_id, PKCE S256, state and nonce", async ({ request }) => {
  const res = await request.get("/api/auth/google/start?next=/me/security", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const loc = new URL(res.headers().location!);
  test.skip(loc.searchParams.get("error") === "sso_unavailable", "Google SSO not configured on this server");
  for (const k of ["client_id", "code_challenge", "state", "nonce", "redirect_uri"]) expect(loc.searchParams.get(k)).toBeTruthy();
  expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
  expect(loc.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/google\/callback$/);
  expect(res.headers()["set-cookie"]).toMatch(/hris_oidc=.+HttpOnly/i);
});

test("SSO callback refuses a forged state and shows a friendly error", async ({ page }) => {
  await page.goto("/api/auth/google/callback?code=abc&state=forged");
  await expect(page).toHaveURL(/\/login\?error=sso_state/);
  await expect(page.getByText("Your sign-in session expired")).toBeVisible();
});

test.describe("Google sign-in against a mock provider", () => {
  test.skip(!MOCK_PORT, "set E2E_MOCK_OIDC_PORT (and GOOGLE_ISSUER on the server) to run");

  test("links an existing account, signs in, then disconnects", async ({ page }) => {
    email = USERS.employee;
    await page.goto("/login?next=%2Fme%2Fsecurity");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/me\/security$/);
    const row = page.getByRole("listitem").filter({ hasText: "Google" });
    await expect(row).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("Disconnected")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Google" })).toHaveCount(0);
  });

  test("unknown email is not provisioned", async ({ page }) => {
    email = "nobody-e2e@hris.local";
    await page.goto("/login");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/login\?error=sso_no_account/);
    await expect(page.getByText("There's no active HRIS account for that email")).toBeVisible();
  });
});

test("devices API registers and removes an Expo push token for the bearer user", async ({ request }) => {
  expect((await request.post("/api/v1/devices", { data: { token: "ExponentPushToken[x]", platform: "ios" } })).status()).toBe(401);
  const { accessToken } = await (await request.post("/api/v1/auth/login", { data: { email: USERS.employee, password: PASSWORD } })).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const token = `ExponentPushToken[e2e${Date.now()}]`;
  expect((await request.post("/api/v1/devices", { headers, data: { token: "not-a-token", platform: "ios" } })).status()).toBe(422);
  expect((await request.post("/api/v1/devices", { headers, data: { token, platform: "android" } })).status()).toBe(200);
  expect((await request.post("/api/v1/devices", { headers, data: { token, platform: "android" } })).status()).toBe(200); // idempotent
  expect((await request.delete("/api/v1/devices", { headers, data: { token } })).status()).toBe(200);
});

test("push opt-out toggle persists on the security page", async ({ page }) => {
  await login(page, USERS.manager);
  await page.goto("/me/security");
  const push = page.getByLabel("Send push notifications to my phone (HRIS mobile app)");
  await expect(push).toBeChecked();
  await push.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved")).toBeVisible();
  await page.reload();
  await expect(push).not.toBeChecked();
  await push.check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved")).toBeVisible();
});

test("admin sees integration status without secrets", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/settings/integrations");
  for (const t of ["Google sign-in", "Microsoft sign-in", "Email", "Mobile push", "AI assistant"]) await expect(page.getByRole("heading", { name: t, exact: true })).toBeVisible();
  await expect(page.getByText("GOOGLE_CLIENT_SECRET")).toBeVisible();
  await page.getByRole("button", { name: "Send test push to me" }).click();
  await expect(page.getByText("No phone registered for your account").first()).toBeVisible();
});

test("employee cannot open integrations", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/settings/integrations");
  await expect(page.getByText("You do not have access")).toBeVisible();
});
