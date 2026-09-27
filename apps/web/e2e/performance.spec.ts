import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

/** Pick the highest rating on every KPI in the open form. */
async function rateAllMax(page: Page) {
  const sets = page.locator("fieldset");
  const n = await sets.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await sets.nth(i).locator("label").last().click();
}

test("HR opens a cycle, employee self-reviews, manager completes", async ({ browser }) => {
  // Own cycle per run so the flow never depends on seeded review state.
  const cycle = `E2E cycle ${Date.now().toString().slice(-6)}`;

  const hr = await (await browser.newContext()).newPage();
  hr.on("dialog", (d) => d.accept());
  await login(hr, USERS.hr);
  await hr.goto("/settings/review-cycles");
  await hr.getByRole("button", { name: "Add review cycle" }).click();
  const dlg = hr.getByRole("dialog");
  await dlg.getByLabel("Name").fill(cycle);
  await dlg.getByLabel("Period start").fill("2026-01-01");
  await dlg.getByLabel("Period end").fill("2026-06-30");
  await dlg.getByLabel("Due date").fill("2030-01-31");
  await dlg.getByRole("button", { name: "Save" }).click();
  const row = hr.getByRole("row").filter({ hasText: cycle });
  await row.getByRole("button", { name: "Activate" }).click();
  await expect(row.getByText("active", { exact: true })).toBeVisible();

  const emp = await (await browser.newContext()).newPage();
  await login(emp, USERS.employee);
  await emp.goto("/performance");
  await emp.getByRole("link").filter({ hasText: cycle }).click();
  await emp.waitForURL(/\/performance\/[^/]+$/);
  await rateAllMax(emp);
  await emp.getByLabel("Overall self assessment").fill("Shipped Ugnayo on time.");
  await emp.getByRole("button", { name: "Submit self review" }).click();
  await expect(emp.getByText(/^Submitted /)).toBeVisible();

  const mgr = await (await browser.newContext()).newPage();
  await login(mgr, USERS.manager);
  await mgr.goto("/performance");
  await mgr.getByRole("link").filter({ hasText: cycle }).filter({ hasText: "Bianca" }).click();
  await mgr.waitForURL(/\/performance\/[^/]+$/);
  await rateAllMax(mgr);
  await mgr.getByLabel("Overall feedback").fill("Great half.");
  await mgr.getByRole("button", { name: "Complete review" }).click();
  await expect(mgr.getByText("5.00")).toBeVisible();

  // Employee now sees the final rating; HR closes the cycle to leave no active leftovers.
  await emp.reload();
  await expect(emp.getByText("5.00")).toBeVisible();
  await hr.reload();
  await row.getByRole("button", { name: "Close" }).click();
  await expect(row.getByText("closed", { exact: true })).toBeVisible();
});

test("employees cannot open review cycle settings", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/settings/review-cycles");
  await expect(page).toHaveURL(/forbidden/);
});
