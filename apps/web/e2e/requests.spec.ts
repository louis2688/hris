import { test, expect as baseExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PASSWORD, USERS } from "./helpers";

const rand = (n: number) => Math.floor(Math.random() * n);
const pad = (n: number) => String(n).padStart(2, "0");
/** Random future date + 15-minute slot, so reruns never trip the overlap check. */
function otSlot() {
  const d = new Date(Date.now() + (30 + rand(1500)) * 86400_000).toISOString().slice(0, 10);
  const m = rand(90) * 15;
  return { date: d, start: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, end: `${pad(Math.floor((m + 15) / 60))}:${pad((m + 15) % 60)}` };
}
const png = () => Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5d0000000049454e44ae426082", "hex");

// Generous timeouts: several dev servers share this box and bcrypt logins can take seconds.
test.describe.configure({ timeout: 360_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

type State = Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;
const sessions = new Map<string, State>(); // one bcrypt login per user per worker
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function as(browser: Browser, email: string) {
  const saved = sessions.get(email);
  const ctx = await browser.newContext(saved ? { storageState: saved } : {});
  contexts.push(ctx);
  const page = await ctx.newPage();
  if (saved) return page;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  sessions.set(email, await ctx.storageState());
  return page;
}

async function openNew(page: Page, path: string, button: RegExp) {
  await page.goto(path);
  await page.getByRole("button", { name: button }).click();
  return page.getByRole("dialog");
}

async function decide(page: Page, url: string, decision: "Approve" | "Reject" = "Approve") {
  await page.goto(url);
  await page.getByRole("button", { name: decision, exact: true }).click();
  await expect(page.getByText(decision === "Approve" ? /^(Approved|Active)$/ : "Rejected").first()).toBeVisible({ timeout: 60_000 });
}

test("overtime: employee files, manager approves", async ({ browser }) => {
  const emp = await as(browser, USERS.employee);
  const s = otSlot();
  const dlg = await openNew(emp, "/requests/overtime", /New overtime/);
  await dlg.getByLabel("Date").fill(s.date);
  await dlg.getByLabel("Start").fill(s.start);
  await dlg.getByLabel("End").fill(s.end);
  await expect(dlg.getByText("Duration")).toContainText("15m");
  await dlg.getByLabel("Reason").fill("E2E overtime");
  await dlg.getByRole("button", { name: "Submit overtime" }).click();
  await expect(emp).toHaveURL(/\/requests\/overtime\/\w+/);
  const url = new URL(emp.url()).pathname;
  await expect(emp.getByText("Pending").first()).toBeVisible();
  // Own request: can withdraw, cannot decide.
  await expect(emp.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

  // Same slot again is an overlap.
  const again = await openNew(emp, "/requests/overtime", /New overtime/);
  await again.getByLabel("Date").fill(s.date);
  await again.getByLabel("Start").fill(s.start);
  await again.getByLabel("End").fill(s.end);
  await again.getByLabel("Reason").fill("E2E overtime dup");
  await again.getByRole("button", { name: "Submit overtime" }).click();
  await expect(again.getByRole("alert")).toContainText("Overlaps");

  const mgr = await as(browser, USERS.manager);
  await mgr.goto("/requests?tab=team");
  await expect(mgr.locator(`a[href="${url}"]`)).toBeVisible();
  await decide(mgr, url);
});

test("COE: employee requests, HR approves, certificate prints", async ({ browser }) => {
  const emp = await as(browser, USERS.employee);
  // Withdraw leftovers from failed runs; employees may only have 3 pending.
  const mine = (await (await emp.request.get("/api/v1/requests")).json()) as { coe: { id: string; status: string }[] };
  for (const c of mine.coe.filter((c) => c.status === "PENDING")) await emp.request.post(`/api/v1/requests/coe/${c.id}/cancel`);
  const dlg = await openNew(emp, "/requests/coe", /New certificate/);
  await dlg.getByLabel("Purpose").fill(`Visa application ${rand(1e6)}`);
  await dlg.getByLabel("Include my monthly compensation").check();
  await dlg.getByRole("button", { name: "Send to HR" }).click();
  await expect(emp).toHaveURL(/\/requests\/coe\/\w+/);
  const url = new URL(emp.url()).pathname;

  // Managers cannot decide certificates.
  const mgr = await as(browser, USERS.manager);
  await mgr.goto(url);
  await expect(mgr.getByRole("heading", { name: "Page not found" })).toBeVisible();

  const hr = await as(browser, USERS.hr);
  await decide(hr, url);
  await emp.goto(url);
  await emp.getByRole("link", { name: "View certificate" }).click();
  await expect(emp.getByRole("heading", { name: "CERTIFICATE OF EMPLOYMENT" })).toBeVisible();
  await expect(emp.getByText(/VILLANUEVA/)).toBeVisible();
  await expect(emp.getByRole("button", { name: /Print/ })).toBeVisible();
});

test("expense: employee claims with receipt, manager approves", async ({ browser }) => {
  const emp = await as(browser, USERS.employee);
  const dlg = await openNew(emp, "/requests/expenses", /New expense/);
  await dlg.getByLabel("Category").selectOption("Transportation");
  await dlg.getByLabel("Amount (PHP)").fill("0");
  await dlg.getByLabel("Description").fill("E2E taxi");
  await dlg.getByRole("button", { name: "Submit claim" }).click();
  await expect(dlg.getByText("Amount must be more than 0")).toBeVisible();
  await dlg.getByLabel("Amount (PHP)").fill("1,234.50");
  await dlg.getByLabel("Receipt").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png() });
  await dlg.getByRole("button", { name: "Submit claim" }).click();
  await expect(emp).toHaveURL(/\/requests\/expenses\/\w+/);
  await expect(emp.getByRole("heading", { name: /1,234\.50/ })).toBeVisible();
  await expect(emp.getByRole("link", { name: "receipt.png" })).toBeVisible();
  const url = new URL(emp.url()).pathname;

  const mgr = await as(browser, USERS.manager);
  await decide(mgr, url);
  // Manager can open the receipt of a report.
  const res = await mgr.request.get((await mgr.getByRole("link", { name: "receipt.png" }).getAttribute("href"))!);
  expect(res.headers()["content-type"]).toBe("image/png");
});

test("loan: employee applies, HR approves, balance shows", async ({ browser }) => {
  const emp = await as(browser, USERS.employee);
  const dlg = await openNew(emp, "/requests/loans", /New loan/);
  await dlg.getByLabel("Principal (PHP)").fill("5000");
  await dlg.getByLabel("Per payroll (PHP)").fill("6000");
  await dlg.getByRole("button", { name: "Submit application" }).click();
  await expect(dlg.getByText("Amortization cannot exceed the principal")).toBeVisible();
  await dlg.getByLabel("Per payroll (PHP)").fill("1000");
  await expect(dlg.getByText(/Paid off in about/)).toContainText("5");
  await dlg.getByRole("button", { name: "Submit application" }).click();
  await expect(emp).toHaveURL(/\/requests\/loans\/\w+/);
  const url = new URL(emp.url()).pathname;

  const hr = await as(browser, USERS.hr);
  await decide(hr, url);
  await expect(hr.getByText("Remaining balance")).toBeVisible();
  await expect(hr.getByText("₱5,000.00").first()).toBeVisible();
});

test("nobody decides their own request", async ({ browser }) => {
  const mgr = await as(browser, USERS.manager);
  const s = otSlot();
  const res = await mgr.request.post("/api/v1/requests/overtime", { data: { date: s.date, startTime: s.start, endTime: s.end, reason: "E2E own" } });
  expect(res.status()).toBe(201);
  const { request } = (await res.json()) as { request: { id: string } };
  await mgr.goto(`/requests/overtime/${request.id}`);
  await expect(mgr.getByRole("button", { name: "Cancel request" })).toBeVisible();
  await expect(mgr.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const self = await mgr.request.post(`/api/v1/requests/overtime/${request.id}/decision`, { data: { decision: "APPROVED" } });
  expect(self.status()).toBe(403);

  // Employees cannot hit the decision API at all.
  const emp = await as(browser, USERS.employee);
  expect((await emp.request.post(`/api/v1/requests/overtime/${request.id}/decision`, { data: { decision: "APPROVED" } })).status()).toBe(403);

  // Withdraw it so it does not pile up.
  mgr.once("dialog", (d) => d.accept());
  await mgr.getByRole("button", { name: "Cancel request" }).click();
  await expect(mgr.getByText("Cancelled").first()).toBeVisible();
});
