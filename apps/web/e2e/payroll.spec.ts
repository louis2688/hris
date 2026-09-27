import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("HR runs payroll end to end; the employee sees the payslip", async ({ browser }) => {
  test.setTimeout(600_000);
  const hr = await (await browser.newContext()).newPage();
  hr.on("dialog", (d) => d.accept());
  await login(hr, USERS.hr);
  await hr.goto("/payroll");
  await expect(hr.getByRole("heading", { name: "Payroll" })).toBeVisible();

  // Defaults to the next cutoff after the latest run.
  await hr.getByRole("button", { name: "New payroll run" }).click();
  const dialog = hr.getByRole("dialog");
  const name = await dialog.getByLabel("Name").inputValue();
  expect(name).toMatch(/\d{4}$/);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await hr.waitForURL(/\/payroll\/[a-z0-9]+$/);
  const runUrl = hr.url();
  await expect(hr.getByText("Draft", { exact: true })).toBeVisible();

  await hr.getByRole("button", { name: "Compute payslips" }).click();
  await expect(hr.getByRole("link", { name: "Bianca Villanueva" })).toBeVisible({ timeout: 60_000 });
  await expect(hr.getByText("Government remittances")).toBeVisible();

  const csv = await hr.request.get(`${runUrl}/export?type=remittance`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("SSS EE");

  await hr.getByRole("button", { name: "Finalize" }).click();
  await expect(hr.getByRole("button", { name: "Mark as paid" })).toBeVisible({ timeout: 60_000 });

  // Employee: payslip listed, opens, and the mobile API returns it.
  const emp = await (await browser.newContext()).newPage();
  await login(emp, USERS.employee);
  await emp.goto("/payslips");
  await emp.getByRole("link", { name: new RegExp(name) }).click();
  await emp.waitForURL(/\/payslips\/[a-z0-9]+$/);
  await expect(emp.getByText("Net pay")).toBeVisible();
  await expect(emp.getByText("Withholding tax")).toBeVisible();
  const api = await emp.request.get("/api/v1/payslips");
  expect((await api.json()).items.some((s: { run: { name: string } }) => s.run.name === name)).toBe(true);
});

test("employees cannot open payroll", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/payroll");
  await expect(page).toHaveURL(/forbidden/);
  const r = await page.request.get("/api/v1/payslips/not-a-real-id");
  expect(r.status()).toBe(404);
});
