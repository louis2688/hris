import { test, expect, type Page } from "@playwright/test";
import { login, plusDays, USERS } from "./helpers";

const pdf = () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1");
const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

async function employeeId(page: Page, q: string) {
  const r = await page.request.get(`/api/v1/employees?q=${q}`);
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}

test("cron route rejects calls without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  expect((await request.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("HR records a promotion and schedules a transfer; custom field shows on the profile", async ({ page }) => {
  const n = Date.now().toString().slice(-6);
  await login(page, USERS.hr);

  // A fresh employee so other specs' data stays untouched. Creating one writes a HIRE event.
  await page.goto("/employees/new");
  const code = `LC-${n}`;
  await page.getByLabel("First name").fill("Life");
  await page.getByLabel("Last name").fill(`Cycle${n}`);
  await page.getByLabel("Employee ID").fill(code);
  await page.getByLabel("Work email").fill(`${code.toLowerCase()}@hris.local`);
  await page.getByLabel("Job title").selectOption({ label: "Software Engineer" });
  await page.getByRole("button", { name: "Create employee" }).click();
  await expect(page.getByRole("heading", { name: "Employee created" })).toBeVisible();
  await page.getByRole("button", { name: "Open profile" }).click();
  await expect(page.getByRole("heading", { name: `Life Cycle${n}` })).toBeVisible();
  const base = page.url().split("?")[0]!;

  // Promotion effective today applies immediately.
  await page.goto(`${base}?tab=history`);
  await expect(page.getByText("Hired")).toBeVisible();
  await page.getByRole("button", { name: "Record change" }).click();
  let dlg = page.getByRole("dialog");
  await dlg.getByLabel("Type").selectOption("PROMOTION");
  await dlg.getByLabel("New job title").selectOption({ label: "Senior Software Engineer" });
  await dlg.getByLabel("Note").fill("Promoted in e2e");
  await dlg.getByRole("button", { name: "Record change" }).click();
  await expect(dlg).toBeHidden();
  const promo = page.locator("li", { hasText: "Promoted in e2e" });
  await expect(promo.getByText("Promotion")).toBeVisible();
  await expect(promo.getByText("Senior Software Engineer")).toBeVisible();
  await expect(promo.getByText("Scheduled")).toHaveCount(0);
  await page.goto(`${base}?tab=overview`);
  await expect(page.getByText("Senior Software Engineer").first()).toBeVisible();

  // A future transfer is scheduled, not applied.
  await page.goto(`${base}?tab=history`);
  await page.getByRole("button", { name: "Record change" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Type").selectOption("TRANSFER");
  await dlg.getByLabel("Effective date").fill(plusDays(manilaToday(), 30));
  await dlg.getByLabel("New location").selectOption({ label: "Cebu Office" });
  await dlg.getByLabel("Note").fill("Moving to Cebu in e2e");
  await dlg.getByRole("button", { name: "Record change" }).click();
  await expect(dlg).toBeHidden();
  const transfer = page.locator("li", { hasText: "Moving to Cebu in e2e" });
  await expect(transfer.getByText("Scheduled")).toBeVisible();
  await expect(transfer.getByText("Cebu Office")).toBeVisible();

  // Custom field: create it, set it on the employee, see it on the Overview.
  const label = `Locker ${n}`;
  await page.goto("/settings/custom-fields");
  await page.getByRole("button", { name: "Add field" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Label").fill(label);
  await dlg.getByLabel("Type").selectOption("TEXT");
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg).toBeHidden();
  const row = page.getByRole("row", { name: new RegExp(label) });
  await expect(row).toBeVisible();

  await page.goto(`${base}?tab=personal`);
  await page.getByLabel(label).fill(`B-${n}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto(`${base}?tab=overview`);
  await expect(page.getByRole("heading", { name: "Custom fields" })).toBeVisible();
  await expect(page.getByText(`B-${n}`)).toBeVisible();

  // Clean up: deactivate the field so forms don't keep growing.
  await page.goto("/settings/custom-fields");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("row", { name: new RegExp(label) }).getByRole("button").last().click();
  await expect(page.getByRole("row", { name: new RegExp(label) }).getByText("Inactive")).toBeVisible();
});

test("case: HR issues an NTE, the employee explains, HR decides and closes", async ({ browser }) => {
  const n = Date.now().toString().slice(-6);
  const title = `Late submission of reports ${n}`;
  const hr = await (await browser.newContext()).newPage();
  await login(hr, USERS.hr);

  const bianca = await employeeId(hr, "Villanueva");
  await hr.goto("/cases");
  await hr.getByRole("button", { name: "New case" }).click();
  const dlg = hr.getByRole("dialog");
  await dlg.getByLabel("Employee").selectOption(bianca);
  await dlg.getByLabel("Type").selectOption("DISCIPLINARY");
  await dlg.getByLabel("Title").fill(title);
  await dlg.getByLabel("What happened").fill("Weekly reports were submitted late four weeks in a row.");
  await dlg.getByRole("button", { name: "Open case" }).click();
  await expect(hr.getByRole("heading", { name: title })).toBeVisible();
  const caseUrl = hr.url();

  await hr.getByLabel("Charges").fill("Late submission of weekly reports on four consecutive weeks, contrary to the Code of Conduct section 3.1. Possible sanction: written warning.");
  await hr.getByRole("button", { name: "Issue NTE" }).click();
  await expect(hr.getByText("Explanation due").first()).toBeVisible();
  await expect(hr.getByText("NTE issued").first()).toBeVisible();

  // Employee answers from My Info.
  const emp = await (await browser.newContext()).newPage();
  await login(emp, USERS.employee);
  await emp.goto("/me?tab=cases");
  const card = emp.locator(`[data-case="${title}"]`);
  await expect(card).toBeVisible();
  await card.getByLabel("Your written explanation").fill("The reporting tool was down those weeks; I emailed my manager each time.");
  await card.getByRole("button", { name: "Submit explanation" }).click();
  await expect(card.getByText("Your explanation")).toBeVisible();

  // HR decides and closes.
  await hr.goto(caseUrl);
  await expect(hr.getByText("The reporting tool was down")).toBeVisible();
  await hr.getByLabel("Findings and decision").fill("The explanation is partly accepted. The delays were real but no escalation was filed.");
  await hr.getByLabel("Sanction").selectOption("WRITTEN_WARNING");
  await hr.getByRole("button", { name: "Issue decision" }).click();
  await expect(hr.getByText("Decision · Written warning")).toBeVisible();
  await hr.getByRole("button", { name: "Close case" }).click();
  await expect(hr.getByText("Case closed")).toBeVisible();

  await hr.goto(`${caseUrl}/letter/decision`);
  await expect(hr.getByRole("heading", { name: "NOTICE OF DECISION" })).toBeVisible();
  await expect(hr.getByText("Written warning")).toBeVisible();

  // The employee sees the decision; other staff pages stay HR-only.
  await emp.goto("/me?tab=cases");
  await expect(emp.locator(`[data-case="${title}"]`).getByText("Decided")).toBeVisible();
  await emp.goto(caseUrl);
  await expect(emp.getByRole("heading", { name: title })).toHaveCount(0);
});

test("employee acknowledges a must-read document; HR sees when", async ({ browser }) => {
  const name = `policy-${Date.now().toString().slice(-6)}.pdf`;
  const hr = await (await browser.newContext()).newPage();
  await login(hr, USERS.hr);
  const bianca = await employeeId(hr, "Villanueva");
  await hr.goto(`/employees/${bianca}?tab=documents`);
  await hr.getByRole("button", { name: "Upload" }).click();
  const dlg = hr.getByRole("dialog");
  await dlg.getByLabel("File").setInputFiles({ name, mimeType: "application/pdf", buffer: pdf() });
  await dlg.getByLabel("Category").selectOption("OTHER");
  await dlg.getByLabel("Expires on").fill(plusDays(manilaToday(), 20));
  await dlg.getByLabel("Employee must acknowledge").check();
  await dlg.getByRole("button", { name: "Upload" }).click();
  const hrRow = hr.locator("li", { hasText: name });
  await expect(hrRow.getByText("Not yet acknowledged")).toBeVisible();
  await expect(hrRow).toContainText("Expires in 20 days");

  const emp = await (await browser.newContext()).newPage();
  await login(emp, USERS.employee);
  await emp.goto("/me?tab=documents");
  const row = emp.locator("li", { hasText: name });
  emp.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Acknowledge" }).click();
  await expect(row.getByText(/Acknowledged on/)).toBeVisible();
  await expect(row.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);

  await hr.reload();
  await expect(hr.locator("li", { hasText: name }).getByText(/Acknowledged on/)).toBeVisible();
});
