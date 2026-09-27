import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { login, PASSWORD, USERS } from "./helpers";

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function tokens(request: APIRequestContext, email: string) {
  const r = await request.post("/api/v1/auth/login", { data: { email, password: PASSWORD } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as { accessToken: string; refreshToken: string };
}

async function employeeId(request: APIRequestContext, accessToken: string, q: string) {
  const r = await request.get(`/api/v1/employees?q=${q}`, { headers: bearer(accessToken) });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}

async function signedIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await login(page, email);
  return page;
}

const PAY_AND_IDS = ["basicPay", "allowance", "tin", "sssNo", "philhealthNo", "pagibigNo", "bankName", "bankAccountNo"];
const HR_ONLY = ["notes", "customFields"];

test("employee API: managers get no pay, government IDs, bank or HR notes; self gets no HR notes", async ({ request }) => {
  const hr = await tokens(request, USERS.hr);
  const bianca = await employeeId(request, hr.accessToken, "Villanueva");

  const asHr = (await (await request.get(`/api/v1/employees/${bianca}`, { headers: bearer(hr.accessToken) })).json()).employee;
  for (const k of [...PAY_AND_IDS, ...HR_ONLY]) expect(asHr).toHaveProperty(k);

  const mgr = await tokens(request, USERS.manager);
  const res = await request.get(`/api/v1/employees/${bianca}`, { headers: bearer(mgr.accessToken) });
  expect(res.status()).toBe(200);
  const asMgr = (await res.json()).employee;
  expect(asMgr.lastName).toBe("Villanueva");
  for (const k of [...PAY_AND_IDS, ...HR_ONLY]) expect(asMgr, k).not.toHaveProperty(k);

  const emp = await tokens(request, USERS.employee);
  const me = (await (await request.get("/api/v1/me", { headers: bearer(emp.accessToken) })).json()).employee;
  expect(me).toHaveProperty("tin"); // own record
  for (const k of HR_ONLY) expect(me, k).not.toHaveProperty(k);
});

test("leave list: ?employeeId= narrows the caller's scope and cannot widen it", async ({ request }) => {
  const hr = await tokens(request, USERS.hr);
  const emp = await tokens(request, USERS.employee);
  const me = (await (await request.get("/api/v1/me", { headers: bearer(emp.accessToken) })).json()).employee.id as string;
  const all = (await (await request.get("/api/v1/leave?pageSize=100", { headers: bearer(hr.accessToken) })).json()).items as { employeeId: string }[];
  const other = all.find((r) => r.employeeId !== me)?.employeeId;
  expect(other, "seed has someone else's leave").toBeTruthy();

  const peek = await request.get(`/api/v1/leave?employeeId=${other}`, { headers: bearer(emp.accessToken) });
  expect(peek.ok()).toBeTruthy();
  expect((await peek.json()).total).toBe(0);
  // Own filter still works.
  const own = (await (await request.get(`/api/v1/leave?employeeId=${me}`, { headers: bearer(emp.accessToken) })).json()).items as { employeeId: string }[];
  expect(own.every((r) => r.employeeId === me)).toBe(true);
});

test("My Info edit form only ships contact fields to the browser", async ({ page }) => {
  await login(page, USERS.employee);
  const html = await (await page.request.get("/me?tab=edit")).text();
  expect(html).toContain("addressLine1");
  for (const k of ["customFields", "bankAccountNo", "basicPay"]) expect(html, k).not.toContain(k);
});

test("cookie-authenticated API writes from another origin are refused", async ({ page, request, baseURL }) => {
  await login(page, USERS.employee);
  const evil = await page.request.post("/api/v1/notifications", { headers: { origin: "https://evil.example" } });
  expect(evil.status()).toBe(403);
  expect((await page.request.post("/api/v1/notifications", { headers: { origin: new URL(baseURL!).origin } })).status()).toBe(200);
  // Reads and bearer (mobile) clients are unaffected.
  expect((await page.request.get("/api/v1/notifications", { headers: { origin: "https://evil.example" } })).status()).toBe(200);
  const t = await tokens(request, USERS.employee);
  expect((await request.post("/api/v1/notifications", { headers: { ...bearer(t.accessToken), origin: "https://evil.example" } })).status()).toBe(200);
});

test("reusing a rotated refresh token revokes the whole token family", async ({ request }) => {
  const t = await tokens(request, USERS.employee);
  const r1 = await request.post("/api/v1/auth/refresh", { data: { refreshToken: t.refreshToken } });
  expect(r1.ok()).toBeTruthy();
  const next = (await r1.json()) as { refreshToken: string };
  expect((await request.post("/api/v1/auth/refresh", { data: { refreshToken: t.refreshToken } })).status()).toBe(401);
  // The legitimate holder's newer token died with it, so a thief and the owner both have to sign in again.
  expect((await request.post("/api/v1/auth/refresh", { data: { refreshToken: next.refreshToken } })).status()).toBe(401);
});

test("HR cannot create an administrator login", async ({ page, request }) => {
  await login(page, USERS.hr);
  await page.goto("/employees/new");
  const code = `SEC-${Date.now().toString().slice(-6)}`;
  await page.getByLabel("First name").fill("Mallory");
  await page.getByLabel("Last name").fill("Escalate");
  await page.getByLabel("Employee ID").fill(code);
  await page.getByLabel("Work email").fill(`${code.toLowerCase()}@hris.local`);
  await page.getByLabel("Role").selectOption("ADMIN");
  await page.getByLabel("Initial password").fill("Escalate12345");
  await page.getByRole("button", { name: "Create employee" }).click();
  await expect(page.getByRole("main").getByText("Only an admin can create admin accounts")).toBeVisible();
  const hr = await tokens(request, USERS.hr);
  expect((await (await request.get(`/api/v1/employees?q=${code}`, { headers: bearer(hr.accessToken) })).json()).total).toBe(0);
  expect((await request.post("/api/v1/auth/login", { data: { email: `${code.toLowerCase()}@hris.local`, password: "Escalate12345" } })).status()).toBe(401);
});

test("removing an employee is admin-only, even when HR calls the server action directly", async ({ browser, baseURL }) => {
  const admin = await signedIn(browser, USERS.admin);
  const code = `SEC-${Date.now().toString().slice(-6)}`;
  await admin.goto("/employees/new");
  await admin.getByLabel("First name").fill("Removal");
  await admin.getByLabel("Last name").fill("Target");
  await admin.getByLabel("Employee ID").fill(code);
  await admin.getByLabel("Work email").fill(`${code.toLowerCase()}@hris.local`);
  await admin.getByRole("button", { name: "Create employee" }).click();
  await admin.getByRole("button", { name: "Open profile" }).click();
  await expect(admin.getByRole("heading", { name: "Removal Target" })).toBeVisible({ timeout: 30_000 });
  const profile = admin.url();
  const id = new URL(profile).pathname.split("/").pop()!;

  // Capture the Remove server action call the admin's browser makes, without letting it through.
  let call: { url: string; headers: Record<string, string>; body: string } | null = null;
  await admin.route(`**/employees/${id}*`, async (route) => {
    const r = route.request();
    if (r.method() !== "POST" || !r.headers()["next-action"]) return route.continue();
    call = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
    await route.abort();
  });
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => call).not.toBeNull();
  const replay = (p: Page) =>
    p.request.post(call!.url, {
      headers: { "next-action": call!.headers["next-action"]!, "content-type": call!.headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component", origin: new URL(baseURL!).origin },
      data: call!.body,
    });
  const stillThere = async () => (await admin.request.get(`/api/v1/employees/${id}`)).status();

  const hr = await signedIn(browser, USERS.hr);
  await replay(hr);
  expect(await stillThere()).toBe(200);

  // Control: the same replayed call from the admin does remove them, so the HR refusal above is real.
  await replay(admin);
  await expect.poll(stillThere).toBe(404);
});

test("login ignores off-site `next` targets", async ({ page }) => {
  for (const [next, want] of [
    ["/leave", "/leave"],
    ["/%5Cevil.example", "/dashboard"],
    ["/%09/evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
  ]) {
    await page.goto(`/login?next=${next}`);
    await expect(page.locator('input[name="next"]')).toHaveValue(want!);
  }
});

test("admin settings pages refuse non-staff even on a forged client-side navigation", async ({ browser }) => {
  // Record the RSC request a real in-app navigation makes (settings layout already mounted -> only the page segment renders).
  const hr = await signedIn(browser, USERS.hr);
  await hr.goto("/settings/departments");
  const nav = hr.waitForRequest((r) => r.url().includes("/settings/entitlements") && r.headers()["rsc"] === "1");
  await hr.getByRole("link", { name: "Entitlements" }).first().click();
  const req = await nav;
  const headers = { rsc: "1", "next-router-state-tree": req.headers()["next-router-state-tree"]!, "next-url": req.headers()["next-url"] ?? "/settings/departments" };
  const MARKER = "Entitled + carried over";

  expect(await (await hr.request.get(req.url(), { headers })).text()).toContain(MARKER); // control: the replay renders for HR

  const emp = await signedIn(browser, USERS.employee);
  const body = await (await emp.request.get(req.url(), { headers })).text();
  expect(body).not.toContain(MARKER);
  expect(body).not.toContain("Paolo Garcia"); // another employee (the caller is Bianca Villanueva, whose own name is in the shell)
});

test("pages ship a nonce CSP and still hydrate", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(m.text())) violations.push(m.text());
  });
  const res = await page.goto("/login");
  const csp = res!.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(res!.headers()["permissions-policy"]).toContain("camera=(self)");
  await login(page, USERS.admin);
  for (const path of ["/dashboard", "/employees", "/attendance", "/announcements", "/careers"]) {
    await page.goto(path);
    await page.waitForFunction(() => !!(window as unknown as { next?: unknown }).next);
  }
  // Client-side navigation still works (RSC fetches + inline flight scripts carry the nonce).
  await page.goto("/settings/departments");
  await page.getByRole("link", { name: "Holidays" }).first().click();
  await expect(page).toHaveURL(/\/settings\/holidays/);
  expect(violations).toEqual([]);
});
