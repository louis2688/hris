import { test, expect as baseExpect } from "@playwright/test";
import { login, USERS } from "./helpers";

// Server actions + dev-mode compiles can take a few seconds; be patient on assertions.
const expect = baseExpect.configure({ timeout: 20_000 });

test("policy: HR publishes, employee acknowledges, HR sees the count", async ({ browser }) => {
  const title = `E2E policy ${Date.now()}`;
  const hr = await (await browser.newContext()).newPage();
  hr.on("dialog", (d) => d.accept());
  await login(hr, USERS.hr);
  await hr.goto("/announcements");
  await hr.getByRole("button", { name: "New announcement" }).click();
  await hr.getByLabel("Title").fill(title);
  await hr.getByLabel("Message").fill("Please read the **new** rules:\n- rule one\n- rule two");
  await hr.getByLabel("Policy - employees must acknowledge").check();
  await hr.getByRole("button", { name: "Publish now" }).click();
  const hrCard = hr.locator("article", { has: hr.getByRole("heading", { name: title }) });
  await expect(hrCard.getByText(/^0\/\d+$/)).toBeVisible();
  await expect(hrCard.locator("strong", { hasText: "new" })).toBeVisible();

  const emp = await (await browser.newContext()).newPage();
  await login(emp, USERS.employee);
  await emp.goto("/announcements");
  const empCard = emp.locator("article", { has: emp.getByRole("heading", { name: title }) });
  await empCard.getByRole("button", { name: "Acknowledge" }).click();
  await expect(empCard.getByText(/You acknowledged this/)).toBeVisible();

  await hr.reload();
  await expect(hrCard.getByText(/^1\/\d+$/)).toBeVisible();
  await hrCard.getByRole("button", { name: "Delete" }).click();
  await expect(hr.getByRole("heading", { name: title })).toHaveCount(0);
});

test("new employee gets the default onboarding checklist", async ({ page }) => {
  await login(page, USERS.hr);
  await page.goto("/employees/new");
  const code = `E2E-${Date.now().toString().slice(-6)}`;
  await page.getByLabel("First name").fill("Onboard");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Employee ID").fill(code);
  await page.getByLabel("Work email").fill(`${code.toLowerCase()}@hris.local`);
  await page.getByRole("button", { name: "Create employee" }).click();
  await expect(page.getByRole("heading", { name: "Employee created" })).toBeVisible();
  await page.getByRole("button", { name: "Open profile" }).click();
  await expect(page.getByRole("heading", { name: "Onboard Tester" })).toBeVisible();
  await page.goto(`${page.url().split("?")[0]}?tab=onboarding`);
  const row = page.getByRole("link", { name: /Onboarding.*0\/\d+ done/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText("Sign employment contract and NDA")).toBeVisible();
  await page.getByLabel("Mark done: Sign employment contract and NDA").check();
  await expect(page.getByText(/^1\/\d+ tasks$/)).toBeVisible();
});

test("org chart shows the CEO and a report, search finds a person", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/org-chart");
  await expect(page.getByText("Alexandra Reyes")).toBeVisible();
  await expect(page.getByText("Jomar Dela Cruz")).toBeVisible();
  await page.getByLabel("Find a person").fill("Villanueva");
  await page.getByLabel("Find a person").press("Enter");
  await expect(page.getByText("Bianca Villanueva").first()).toBeInViewport();
});

test("HR creates an asset, assigns it, and it shows on the employee's Assets tab", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, USERS.hr);
  await page.goto("/assets");
  const tag = `E2E-${Date.now().toString().slice(-6)}`;
  await page.getByRole("button", { name: "Add asset" }).click();
  await page.getByLabel("Asset tag").fill(tag);
  await page.getByLabel("Name").fill("E2E ThinkPad X1");
  await page.getByLabel("Serial number").fill("SN-E2E-1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "E2E ThinkPad X1" })).toBeVisible();
  await page.getByLabel("Assign to").selectOption({ label: "Bianca Villanueva (EMP-0004)" });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Asset assigned")).toBeVisible();
  await expect(page.getByText("Assigned to Bianca Villanueva")).toBeVisible();
  await page.getByRole("link", { name: "Bianca Villanueva" }).first().click();
  await expect(page.getByRole("heading", { name: "Assigned assets" })).toBeVisible();
  await expect(page.getByText(tag)).toBeVisible();

  // cleanup
  await page.getByRole("link", { name: /E2E ThinkPad X1/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/assets$/);
});
