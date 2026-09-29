import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test("landing header: Sign in when signed out, Go to dashboard when signed in", async ({ page }) => {
  const header = page.locator("header");
  await page.goto("/");
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();

  await login(page, USERS.employee);
  await page.goto("/");
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await header.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
