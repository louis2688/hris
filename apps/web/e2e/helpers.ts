import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";
export const USERS = {
  admin: "admin@hris.local",
  hr: "hr@hris.local",
  manager: "manager@hris.local",
  employee: "employee@hris.local",
};

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Next Monday + offset weeks, as YYYY-MM-DD (avoids weekends/holiday collisions in tests). */
export function nextMonday(weeksAhead = 0) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + ((8 - t.getUTCDay()) % 7 || 7) + weeksAhead * 7);
  return t.toISOString().slice(0, 10);
}
export function plusDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Same format the UI uses for dates: "5 Oct 2026". */
export function uiDate(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
