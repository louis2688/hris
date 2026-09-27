import { test, expect } from "@playwright/test";
import { login, plusDays, USERS } from "./helpers";

const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

test("one-off bonus is paid on the next run; bank file and GL journal export", async ({ page }) => {
  test.setTimeout(600_000);
  page.on("dialog", (d) => d.accept());
  await login(page, USERS.hr);
  await page.goto("/payroll");
  await page.getByRole("button", { name: "New payroll run" }).click();
  const dialog = page.getByRole("dialog");
  const periodStart = await dialog.getByLabel("Period start").inputValue();
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/payroll\/[a-z0-9]+$/);
  const runUrl = page.url();

  const label = `E2E bonus ${Date.now()}`;
  await page.goto("/payroll/adjustments");
  await page.getByRole("button", { name: "Add adjustment" }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Employee").selectOption({ label: "Bianca Villanueva (EMP-0004)" });
  await add.getByLabel("Type").selectOption("BONUS");
  await add.getByLabel("Amount (PHP)").fill("1234.56");
  await add.getByLabel("Label on payslip").fill(label);
  await add.getByLabel("Effective date").fill(periodStart);
  await add.getByRole("button", { name: "Add adjustment" }).click();
  await expect(page.getByRole("cell", { name: new RegExp(label) })).toBeVisible();

  await page.goto(runUrl);
  await page.getByRole("button", { name: "Compute payslips" }).click();
  await page.getByRole("link", { name: "Bianca Villanueva" }).click({ timeout: 60_000 });
  await page.waitForURL(/\/payslips\/[a-z0-9]+$/);
  await expect(page.getByText(label)).toBeVisible();
  await expect(page.getByText("₱1,234.56")).toBeVisible();

  await page.goto(runUrl);
  await page.getByRole("button", { name: "Finalize" }).click();
  await expect(page.getByRole("button", { name: "Mark as paid" })).toBeVisible({ timeout: 60_000 });
  const bank = await page.request.get(`${runUrl}/export?type=bank`);
  expect(bank.status()).toBe(200);
  expect(bank.headers()["content-type"]).toContain("text/csv");
  const bankText = await bank.text();
  expect(bankText).toContain("Account no.");
  expect(bankText).toContain("Bianca Villanueva");
  const gl = await (await page.request.get(`${runUrl}/export?type=gl`)).text();
  const total = gl.split("\r\n").find((l) => l.includes("TOTAL"))!.split(",");
  expect(total.at(-1)).toBe(total.at(-2)); // debits = credits

  // The bonus is now marked paid by this run.
  await page.goto("/payroll/adjustments?status=applied");
  await expect(page.getByRole("row", { name: new RegExp(label) }).getByText(/^Paid/)).toBeVisible();
});

test("a raise effective today adds a salary history row", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, USERS.hr);
  await page.goto("/payroll/compensation");
  await page.getByLabel("Search employees").fill("Noel");
  await page.getByRole("button", { name: "Edit compensation for Noel Fernandez" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Effective from").fill(manilaToday());
  await d.getByLabel("Reason").fill("E2E raise");
  await d.getByLabel("Basic pay (PHP)").fill("45500");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
  await page.getByRole("link", { name: "Salary history for Noel Fernandez" }).click();
  const rows = page.getByTestId("salary-row");
  await expect(rows.first()).toContainText("Current");
  await expect(rows.first()).toContainText("₱45,500.00");
  await expect(rows.first()).toContainText("E2E raise");
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
});

test("separation: exit interview and final pay", async ({ page }) => {
  test.setTimeout(600_000);
  page.on("dialog", (d) => d.accept());
  await login(page, USERS.hr);

  // A throwaway employee (created by other specs) without an open separation.
  await page.goto("/separations");
  await page.getByRole("button", { name: "Start separation" }).click();
  const options = await page.getByRole("dialog").getByLabel("Employee").locator("option").allTextContents();
  const pick = options.find((o) => /\(E2E-\d+\)$/.test(o));
  test.skip(!pick, "no throwaway E2E employee available");
  const code = pick!.match(/\((E2E-\d+)\)$/)![1]!;
  await page.keyboard.press("Escape");

  await page.goto("/payroll/compensation");
  await page.getByLabel("Search employees").fill(code);
  await page.getByRole("button", { name: /^Edit compensation for/ }).first().click();
  const comp = page.getByRole("dialog");
  await comp.getByLabel("Basic pay (PHP)").fill("25000");
  await comp.getByRole("button", { name: "Save" }).click();
  await expect(comp).toBeHidden();

  await page.goto("/separations");
  await page.getByRole("button", { name: "Start separation" }).click();
  const start = page.getByRole("dialog");
  await start.getByLabel("Employee").selectOption({ label: pick! });
  await start.getByLabel("Last day").fill(plusDays(manilaToday(), 14));
  await start.getByRole("button", { name: "Start separation" }).click();
  await page.waitForURL(/\/separations\/[a-z0-9]+$/);
  await expect(page.getByText("Clearance", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Main reason for leaving").fill("Career growth abroad");
  await page.getByLabel("What did we do well?").fill("Supportive team");
  await page.getByRole("button", { name: "Save exit interview" }).click();
  await expect(page.getByText(/^Saved \d/)).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Leave days to encash").fill("2");
  await page.getByRole("button", { name: "Compute final pay" }).click();
  await expect(page.getByText("Net final pay")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("13th month pay (pro-rated)")).toBeVisible();
  await expect(page.getByText("Leave encashment").first()).toBeVisible();

  // Finalize through the normal run lifecycle, then close out the separation.
  const sepUrl = page.url();
  await page.getByRole("link", { name: "Open run to finalize" }).click();
  await page.getByRole("button", { name: "Finalize" }).click();
  await expect(page.getByRole("button", { name: "Mark as paid" })).toBeVisible({ timeout: 60_000 });
  await page.goto(sepUrl);
  await page.getByRole("button", { name: "Complete separation" }).click();
  await expect(page.getByText(/^Completed/).first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`/separations?status=closed`);
  await expect(page.getByText(code).first()).toBeVisible();
});
