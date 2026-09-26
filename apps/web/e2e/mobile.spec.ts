import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("mobile: nav drawer, bottom tabs, no horizontal overflow", async ({ page }) => {
  await login(page, USERS.employee);
  // bottom tabs visible, sidebar hidden
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "My Leave" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  for (const path of ["/dashboard", "/me", "/me/leave"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${path} overflows horizontally`).toBeFalsy();
    await page.screenshot({ path: `test-results/mobile${path.replace(/\//g, "_")}.png`, fullPage: true });
  }
  // request leave dialog renders as bottom sheet
  await page.goto("/me/leave");
  await page.getByRole("button", { name: "Request leave" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile_request_leave.png" });
});
