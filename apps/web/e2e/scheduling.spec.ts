import { test, expect as baseExpect, type Browser, type Page } from "@playwright/test";
import { nextMonday, PASSWORD, plusDays, USERS } from "./helpers";

// several logins per test on a shared dev server
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ mode: "serial", timeout: 600_000 });

const PAOLO = "paolo.garcia@hris.local";

/** Like helpers.login but patient: the shared dev box can take >5s to redirect after sign-in. */
async function as(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  return page;
}

/** Manager sets roster cells for next week (value = option label; "" = usual shift) and saves if anything changed. */
async function setRoster(page: Page, cells: [name: string, date: string, label: string | null][]) {
  await page.goto(`/schedule?week=${nextMonday()}`);
  let dirty = false;
  for (const [name, date, label] of cells) {
    const sel = page.getByLabel(`${name} ${date}`);
    const before = await sel.inputValue();
    if (label === null) await sel.selectOption("");
    else await sel.selectOption({ label });
    dirty ||= before !== (await sel.inputValue());
  }
  if (dirty) {
    const save = page.getByRole("button", { name: "Save schedule" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Schedule saved")).toBeVisible({ timeout: 30_000 });
  }
}

test("manager sets a teammate to rest day; employee sees it in My schedule", async ({ browser }) => {
  const day = plusDays(nextMonday(), 1);
  const m = await as(browser, USERS.manager);
  await setRoster(m, [["Bianca Villanueva", day, "Rest day"]]);

  const e = await as(browser, USERS.employee);
  await e.goto("/schedule");
  const row = e.locator(`li[data-date="${day}"]`);
  await expect(row).toContainText("Rest day");
  await expect(row).toContainText("Changed");
  // employees don't get the roster
  await expect(e.getByText("Team roster", { exact: true })).toHaveCount(0);

  await setRoster(m, [["Bianca Villanueva", day, null]]);
  await e.reload();
  await expect(row).toContainText("Regular 9-6");
});

test("shift swap: request, teammate accepts, manager approves, shifts swap", async ({ browser }) => {
  const day = plusDays(nextMonday(), 2);
  const m = await as(browser, USERS.manager);
  // make the two days differ: Paolo on nights, Bianca on her usual day shift
  await setRoster(m, [
    ["Paolo Garcia", day, "Night 10pm-7am"],
    ["Bianca Villanueva", day, null],
  ]);

  const e = await as(browser, USERS.employee);
  await e.goto("/schedule");
  // leftovers from an aborted run
  const cancel = e.getByRole("button", { name: "Cancel" });
  while (await cancel.count()) {
    await cancel.first().click();
    await expect(e.getByText("Swap cancelled").last()).toBeVisible();
    await e.reload();
  }
  await e.getByRole("button", { name: "Request swap" }).click();
  const dlg = e.getByRole("dialog");
  await dlg.getByLabel("Date").fill(day);
  await dlg.getByLabel("Swap with").selectOption({ label: "Paolo Garcia" });
  await dlg.getByLabel("Reason").fill("Family event");
  await dlg.getByRole("button", { name: "Send request" }).click();
  await expect(e.getByText("Awaiting teammate").first()).toBeVisible();

  const p = await as(browser, PAOLO);
  await p.goto("/schedule");
  const incoming = p.getByRole("listitem").filter({ hasText: "Bianca Villanueva asks to swap" }).filter({ hasText: "Awaiting teammate" }).first();
  await incoming.getByRole("button", { name: "Accept" }).click();
  await expect(p.getByText("Swap accepted")).toBeVisible();

  await m.goto("/schedule");
  const pending = m.getByRole("region", { name: "Swaps to approve" }).getByRole("listitem").filter({ hasText: "Bianca Villanueva" }).first();
  await pending.getByRole("button", { name: "Approve" }).click();
  await expect(m.getByText("Swap approved")).toBeVisible();

  await e.reload();
  await expect(e.locator(`li[data-date="${day}"]`)).toContainText("Night 10pm-7am");
  await expect(e.getByText("Approved").first()).toBeVisible();

  await setRoster(m, [
    ["Paolo Garcia", day, null],
    ["Bianca Villanueva", day, null],
  ]);
});

test("anomalies page lists seeded flags and is linked from team attendance", async ({ browser }) => {
  const m = await as(browser, USERS.manager);
  await m.goto("/attendance/team");
  await m.getByRole("link", { name: /Anomalies/ }).click();
  await expect(m.getByRole("heading", { name: "Attendance anomalies" })).toBeVisible();
  await expect(m.getByRole("list", { name: "Anomalies" }).getByText(/Possible buddy punching|Repeated lates|Punched outside geofence|Absent without leave|Missing time-out|Unusually long shift/).first()).toBeVisible();
  // employees are kept out
  const e = await as(browser, USERS.employee);
  await e.goto("/attendance/anomalies");
  await expect(e).toHaveURL(/forbidden/);
});

test("geofence rejects a far-away mobile punch when the policy is on", async ({ browser }) => {
  const h = await as(browser, USERS.hr);
  const setGeofence = async (on: boolean) => {
    await h.goto("/settings/attendance");
    const box = h.getByLabel("Only allow punches inside the employee's location geofence");
    if (on) await box.check();
    else await box.uncheck();
    await h.getByRole("button", { name: "Save policy" }).click();
    await expect(h.getByText("Policy saved")).toBeVisible();
  };
  const e = await as(browser, USERS.employee);
  await setGeofence(true);
  try {
    const noLoc = await e.request.post("/api/v1/attendance/today", { data: {} });
    expect(noLoc.status()).toBe(400);
    const far = await e.request.post("/api/v1/attendance/today", { data: { latitude: 14.6547, longitude: 121.0244, accuracy: 20 } });
    expect(far.status()).toBe(403);
    const body = await far.json();
    expect(body.error.code).toBe("OUTSIDE_GEOFENCE");
    expect(body.error.message).toMatch(/You are 11\.\d km from Manila HQ/);
  } finally {
    await setGeofence(false);
  }
});

test("mobile schedule endpoint returns the caller's days", async ({ browser }) => {
  const e = await as(browser, USERS.employee);
  const from = nextMonday();
  const r = await e.request.get(`/api/v1/attendance/schedule?from=${from}&to=${plusDays(from, 6)}`);
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.days).toHaveLength(7);
  expect(body.days[0]).toMatchObject({ date: from });
});
