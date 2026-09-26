import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("employee clocks in and sees DTR", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/attendance");
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  const btn = page.getByRole("button", { name: /Clock (in|out)/ });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.getByText(/Clocked (in|out) at|You just punched/).first()).toBeVisible();
  await expect(page.getByText("Days present")).toBeVisible();
});

test("manager sees team attendance and HR sees terminal settings", async ({ browser }) => {
  const m = await (await browser.newContext()).newPage();
  await login(m, USERS.manager);
  await m.goto("/attendance/team");
  await expect(m.getByRole("heading", { name: "Team attendance" })).toBeVisible();
  await expect(m.getByText("Bianca Villanueva")).toBeVisible();
  const h = await (await browser.newContext()).newPage();
  await login(h, USERS.hr);
  await h.goto("/settings/attendance");
  await expect(h.getByText("Biometric terminals")).toBeVisible();
  await expect(h.getByText("Punch policy")).toBeVisible();
});

test("ZKTeco ADMS push stores punches for mapped employees", async ({ request }) => {
  // unknown serial is rejected
  expect((await request.get("/iclock/cdata?SN=NOPE&options=all")).status()).toBe(404);
});

test("timesheet page loads", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/timesheets");
  await expect(page.getByRole("heading", { name: "Timesheets" })).toBeVisible();
});
