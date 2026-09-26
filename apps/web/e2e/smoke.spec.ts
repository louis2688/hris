import { test, expect } from "@playwright/test";
import { login, nextMonday, plusDays, uiDate, USERS } from "./helpers";

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/login\?next=%2Femployees/);
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.employee);
  await page.getByLabel("Password").fill("nope-nope-nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("employee cannot open admin pages", async ({ page }) => {
  await login(page, USERS.employee);
  await expect(page.getByRole("link", { name: "Employees" })).toHaveCount(0);
  await page.goto("/employees");
  await expect(page.getByText("You do not have access")).toBeVisible();
});

test("admin sees dashboard stats and employee directory", async ({ page }) => {
  await login(page, USERS.admin);
  await expect(page.getByText("Headcount", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Employees" }).first().click();
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
  await page.getByLabel("Search").fill("Villanueva");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("link", { name: /Bianca Villanueva/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /Bianca Villanueva/ }).first().click();
  await expect(page.getByRole("heading", { name: "Bianca Villanueva" })).toBeVisible();
  await expect(page.getByText("Senior Software Engineer").first()).toBeVisible();
});

test("HR can create an employee with an account", async ({ page }) => {
  await login(page, USERS.hr);
  await page.goto("/employees/new");
  const code = `E2E-${Date.now().toString().slice(-6)}`;
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill("Person");
  await page.getByLabel("Employee ID").fill(code);
  await page.getByLabel("Work email").fill(`${code.toLowerCase()}@hris.local`);
  await page.getByLabel("Department").selectOption({ label: "Engineering" });
  await page.getByRole("button", { name: "Create employee" }).click();
  await expect(page.getByRole("heading", { name: "Employee created" })).toBeVisible();
  await expect(page.getByText("Temporary password")).toBeVisible();
  await page.getByRole("button", { name: "Open profile" }).click();
  await expect(page.getByRole("heading", { name: "Test Person" })).toBeVisible();
  await expect(page.getByText(code).first()).toBeVisible();
});

test("leave flow: employee requests, manager approves, balance updates", async ({ browser, request }) => {
  // Clean slate: cancel the employee's future requests via the API so re-runs never overlap.
  const tok = (await (await request.post("/api/v1/auth/login", { data: { email: USERS.employee, password: "Password123!" } })).json()).accessToken;
  const auth = { Authorization: `Bearer ${tok}` };
  const mine = (await (await request.get("/api/v1/me/leave?pageSize=100", { headers: auth })).json()).items as { id: string; status: string; startDate: string }[];
  for (const r of mine) {
    if ((r.status === "PENDING" || r.status === "APPROVED") && r.startDate > new Date().toISOString()) await request.post(`/api/v1/leave/${r.id}/cancel`, { headers: auth, data: {} });
  }
  const start = nextMonday(2);
  const end = plusDays(start, 2); // Mon..Wed = 3 days

  // Employee requests
  const emp = await browser.newContext();
  const ep = await emp.newPage();
  await login(ep, USERS.employee);
  await ep.goto("/me/leave");
  await ep.getByRole("button", { name: "Request leave" }).click();
  await ep.getByLabel("Leave type").selectOption((await ep.getByLabel("Leave type").locator("option", { hasText: "Vacation Leave" }).getAttribute("value"))!);
  await ep.locator("#startDate").fill(start);
  await ep.locator("#endDate").fill(end);
  await expect(ep.getByText(/3.*working days requested/)).toBeVisible();
  await ep.locator("#reason").fill("E2E test trip");
  await ep.getByRole("button", { name: "Submit request" }).click();
  await expect(ep.getByText("Request submitted")).toBeVisible();
  await expect(ep.getByRole("link", { name: /Vacation Leave.*3 days/ }).first()).toBeVisible();

  // Overlap is rejected
  await ep.getByRole("button", { name: "Request leave" }).click();
  await ep.locator("#startDate").fill(start);
  await ep.locator("#endDate").fill(start);
  await ep.getByRole("button", { name: "Submit request" }).click();
  await expect(ep.getByText(/overlaps an existing/).first()).toBeVisible();
  await ep.keyboard.press("Escape");

  // Manager approves
  const mgr = await browser.newContext();
  const mp = await mgr.newPage();
  await login(mp, USERS.manager);
  await mp.goto("/team");
  await mp.getByRole("link", { name: new RegExp(`Bianca Villanueva.*${uiDate(start)}`) }).first().click();
  await expect(mp.getByText("E2E test trip").first()).toBeVisible();
  await mp.getByPlaceholder("Optional note for the employee").fill("Enjoy!");
  await mp.getByRole("button", { name: "Approve" }).click();
  // Vacation leave is two-level (manager then HR): still pending after the manager.
  await expect(mp.getByText("Waiting").first()).toBeVisible();
  await expect(mp.getByText("Enjoy!").first()).toBeVisible();

  const hr = await browser.newContext();
  const hp = await hr.newPage();
  await login(hp, USERS.hr);
  await hp.goto(mp.url());
  await hp.getByRole("button", { name: "Approve" }).click();
  await expect(hp.getByText("Approved", { exact: true }).first()).toBeVisible();
  await hr.close();

  // Employee sees approval + notification, balance moved from pending to used
  await ep.goto("/dashboard");
  await expect(ep.getByText("Leave request approved").first()).toBeVisible();
  await ep.goto("/me/leave");
  // Vacation Leave card now shows the 3 approved days as used
  await expect(ep.getByText(/3 used/).first()).toBeVisible();
  await emp.close();
  await mgr.close();
});

test("employee cannot approve own request via API", async ({ request }) => {
  const login = await request.post("/api/v1/auth/login", { data: { email: USERS.employee, password: "Password123!" } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();
  const mine = await request.get("/api/v1/me/leave", { headers: { Authorization: `Bearer ${accessToken}` } });
  const { items } = await mine.json();
  expect(items.length).toBeGreaterThan(0);
  const res = await request.post(`/api/v1/leave/${items[0].id}/decision`, { headers: { Authorization: `Bearer ${accessToken}` }, data: { decision: "APPROVED" } });
  expect(res.status()).toBe(403);
});

test("mobile API: login, refresh, me, balances", async ({ request }) => {
  const r = await request.post("/api/v1/auth/login", { data: { email: USERS.manager, password: "Password123!" } });
  const tokens = await r.json();
  expect(tokens.user.role).toBe("MANAGER");
  const me = await request.get("/api/v1/me", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  expect((await me.json()).employee.employeeCode).toBe("EMP-0003");
  const bal = await request.get("/api/v1/me/balances", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  expect((await bal.json()).balances.length).toBeGreaterThan(0);
  const pending = await request.get("/api/v1/team/pending", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  expect(pending.ok()).toBeTruthy();
  const refreshed = await request.post("/api/v1/auth/refresh", { data: { refreshToken: tokens.refreshToken } });
  expect(refreshed.ok()).toBeTruthy();
  // old refresh token is now revoked
  const reuse = await request.post("/api/v1/auth/refresh", { data: { refreshToken: tokens.refreshToken } });
  expect(reuse.status()).toBe(401);
  const noAuth = await request.get("/api/v1/me");
  expect(noAuth.status()).toBe(401);
});

test("settings: HR adds a department and a leave type", async ({ page }) => {
  await login(page, USERS.hr);
  await page.goto("/settings/departments");
  await page.getByRole("button", { name: "Add department" }).click();
  const name = `QA Team ${Date.now().toString().slice(-5)}`;
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(name)).toBeVisible();
  await page.goto("/settings/leave-types");
  await expect(page.getByText("Vacation Leave")).toBeVisible();
  await page.goto("/leave/calendar");
  await expect(page.getByRole("heading", { name: "Leave calendar" })).toBeVisible();
});
