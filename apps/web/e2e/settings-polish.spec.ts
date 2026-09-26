import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("employee toggles email notifications and it persists", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/me/security");
  const box = page.getByLabel("Email me when something needs my attention");
  const was = await box.isChecked();

  await box.setChecked(!was);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText(was ? "Email notifications off" : "Email notifications on")).toBeVisible();
  await page.reload();
  await expect(box).toBeChecked({ checked: !was });

  // restore so reruns start from the same state
  await box.setChecked(was);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText(was ? "Email notifications on" : "Email notifications off")).toBeVisible();
});

test("admin sees email config and filters the audit log", async ({ page }) => {
  await login(page, USERS.admin);

  await page.goto("/settings/email");
  await expect(page.getByText("Not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send test email" })).toBeVisible();

  await page.goto("/settings/audit");
  const entries = page.getByRole("list", { name: "Audit entries" }).locator("summary");
  await expect(entries.first()).toBeVisible();

  // logging in writes auth.login on entity User, so there is always at least one
  await page.getByLabel("Entity").selectOption("User");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/entity=User/);
  await expect(entries.first()).toBeVisible();
  for (const s of (await entries.all()).slice(0, 5)) await expect(s).toContainText("User");

  await entries.first().click();
  const open = page.getByRole("list", { name: "Audit entries" }).locator("details").first();
  await expect(open.getByText(/^(Before|No payload recorded\.)$/).first()).toBeVisible();
});

test("HR cannot open email settings", async ({ page }) => {
  await login(page, USERS.hr);
  await page.goto("/settings/audit");
  await expect(page.getByRole("link", { name: "Email", exact: true })).toHaveCount(0);
  await page.goto("/settings/email");
  await expect(page).toHaveURL(/\/forbidden/);
});
