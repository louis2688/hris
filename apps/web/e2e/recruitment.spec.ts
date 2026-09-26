import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("HR adds a candidate, interviews, offers and hires", async ({ page }) => {
  const n = Date.now().toString().slice(-6);
  await login(page, USERS.hr);
  await page.goto("/recruitment");
  await expect(page.getByRole("heading", { name: "Recruitment" })).toBeVisible();

  await page.getByRole("button", { name: "Add candidate" }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill(`Cand${n}`);
  await page.getByLabel("Email").fill(`cand${n}@example.com`);
  await page.getByRole("dialog").getByRole("button", { name: "Add candidate" }).click();
  await page.waitForURL(/\/recruitment\/candidates\//);

  await page.getByRole("button", { name: "Schedule" }).click();
  await page.getByLabel("Date and time").fill("2030-01-15T10:00");
  await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Initial interview")).toBeVisible();

  await page.getByRole("button", { name: "Move stage" }).click();
  await page.getByLabel("New stage").selectOption("OFFERED");
  await page.getByRole("dialog").getByRole("button", { name: "Move" }).click();

  await page.getByRole("button", { name: "Hire" }).click();
  await page.getByLabel("Employee ID").fill(`EMP-T${n}`);
  await page.getByRole("dialog").getByRole("button", { name: "Hire" }).click();
  await expect(page.getByText("Temporary password (shown once)")).toBeVisible();
  await page.getByRole("button", { name: "Open employee" }).click();
  await page.waitForURL(/\/employees\//);
  await expect(page.getByText(`Test Cand${n}`).first()).toBeVisible();
});

test("employees cannot open recruitment", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/recruitment");
  await expect(page).toHaveURL(/forbidden/);
});
