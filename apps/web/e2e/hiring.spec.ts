import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

const pdf = () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1");

async function newCandidate(page: Page, first: string, last: string, email: string) {
  await page.goto("/recruitment");
  await page.getByRole("button", { name: "Add candidate" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("First name").fill(first);
  await dlg.getByLabel("Last name").fill(last);
  await dlg.getByLabel("Email").fill(email);
  await dlg.getByRole("button", { name: "Add candidate" }).click();
  await page.waitForURL(/\/recruitment\/candidates\//);
  return page.url();
}

test("offer: HR sends, candidate accepts publicly, HR hires with the offered pay", async ({ page, browser }) => {
  const n = Date.now().toString().slice(-6);
  await login(page, USERS.hr);
  const url = await newCandidate(page, "Offer", `Cand${n}`, `offer${n}@example.com`);

  await page.getByRole("button", { name: "Schedule" }).click();
  await page.getByLabel("Date and time").fill("2030-01-15T10:00");
  await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Initial interview")).toBeVisible();

  await page.getByRole("button", { name: "New offer" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Basic pay (PHP)").fill("45000");
  await dlg.getByLabel("Allowance per month (PHP)").fill("2500");
  await dlg.getByLabel("Start date").fill("2030-02-01");
  await dlg.getByLabel("Offer expires").fill("2030-01-25");
  await dlg.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Send offer" }).click();
  const link = await page.getByRole("dialog").getByLabel("Offer link").inputValue();
  expect(link).toMatch(/\/offer\/[A-Za-z0-9_-]{43}$/);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Offered", { exact: true }).first()).toBeVisible();

  // Candidate, no session.
  const ctx = await browser.newContext();
  const cand = await ctx.newPage();
  await cand.goto(new URL(link).pathname);
  await expect(cand.getByRole("heading", { name: "Offer of employment" })).toBeVisible();
  await expect(cand.getByText("₱45,000.00")).toBeVisible();
  await cand.getByLabel("Full name").fill("Someone Else");
  await cand.getByLabel("I accept the terms of this offer.").check();
  await cand.getByRole("button", { name: "Accept offer" }).click();
  await expect(cand.getByRole("region", { name: "Accept this offer" }).getByRole("alert")).toContainText("must match");
  await cand.getByLabel("Full name").fill(`offer cand${n}`);
  await cand.getByLabel("I accept the terms of this offer.").check();
  await cand.getByRole("button", { name: "Accept offer" }).click();
  await expect(cand.getByText("You accepted this offer")).toBeVisible();
  await ctx.close();

  await page.goto(url);
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hire" }).click();
  await expect(page.getByLabel("Start date")).toHaveValue("2030-02-01");
  await page.getByLabel("Employee ID").fill(`EMP-O${n}`);
  await page.getByRole("dialog").getByRole("button", { name: "Hire" }).click();
  await expect(page.getByText("Temporary password (shown once)")).toBeVisible();
  await page.getByRole("button", { name: "Open employee" }).click();
  await page.waitForURL(/\/employees\//);
  const empId = page.url().split("/employees/")[1]!.split(/[?#]/)[0];
  const res = await page.request.get(`/api/v1/employees/${empId}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const emp = body.employee;
  expect(Number(emp.basicPay)).toBe(45000);
  expect(Number(emp.allowance)).toBe(2500);
});

test("interviewer (manager) submits a scorecard and the summary shows it", async ({ page, browser }) => {
  const n = Date.now().toString().slice(-6);
  await login(page, USERS.hr);
  const url = await newCandidate(page, "Score", `Cand${n}`, `score${n}@example.com`);
  await page.getByRole("button", { name: "Schedule" }).click();
  await page.getByLabel("Date and time").fill("2030-01-16T10:00");
  await page.getByLabel("Interviewer").selectOption({ label: "Jomar Dela Cruz" });
  await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Round 1", { exact: true })).toBeVisible();

  const ctx = await browser.newContext();
  const mgr = await ctx.newPage();
  await login(mgr, USERS.manager);
  await mgr.goto(url);
  await expect(mgr.getByRole("heading", { name: `Score Cand${n}` })).toBeVisible();
  await mgr.getByRole("button", { name: "Scorecard" }).click();
  const dlg = mgr.getByRole("dialog");
  await dlg.getByLabel("Communication: 4 of 5").check({ force: true });
  await dlg.getByLabel("Technical skills: 5 of 5").check({ force: true });
  await dlg.getByLabel("Overall rating: 4 of 5").check({ force: true });
  await dlg.getByText("Strong yes").click();
  await dlg.getByLabel("Comments").fill("Solid fundamentals");
  await dlg.getByRole("button", { name: "Submit scorecard" }).click();
  await expect(mgr.getByText("Solid fundamentals")).toBeVisible();
  await expect(mgr.getByText("4.0").first()).toBeVisible();
  await expect(mgr.getByLabel("Recommendations")).toContainText("Strong yes · 1");
  await ctx.close();

  // HR sees the same scorecard in the summary.
  await page.reload();
  await expect(page.getByLabel("Average per criterion")).toContainText("Technical skills");
  await expect(page.getByLabel("Recommendations")).toContainText("Strong yes · 1");
});

test("employees without an interview can't open a candidate", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/recruitment/candidates/does-not-exist");
  await expect(page).toHaveURL(/forbidden/);
});

test("public careers page: apply with a PDF resume and referral code creates a candidate", async ({ browser, page }) => {
  const n = Date.now().toString().slice(-6);
  const ctx = await browser.newContext();
  const pub = await ctx.newPage();
  await pub.goto("/careers?ref=EMP-0004");
  await expect(pub.getByRole("heading", { name: /Build your career/ })).toBeVisible();
  // Any open listing works; hires in other tests can close a vacancy.
  const job = pub.getByRole("main").getByRole("listitem").first().getByRole("heading");
  const title = (await job.textContent())!;
  await job.click();
  await expect(pub.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(pub.getByLabel("Referred by (employee ID)")).toHaveValue("EMP-0004");

  await pub.getByLabel("First name").fill("Web");
  await pub.getByLabel("Last name").fill(`Applicant${n}`);
  await pub.getByLabel("Email").fill(`web${n}@example.com`);
  await pub.getByLabel("Mobile number").fill("09171234567");
  await pub.getByLabel("Resume (PDF)").setInputFiles({ name: `cv-${n}.pdf`, mimeType: "application/pdf", buffer: pdf() });
  // Native validation blocks submit until consent is given.
  await pub.getByRole("button", { name: "Submit application" }).click();
  await expect(pub.getByText("Thank you for applying!")).toBeHidden();
  await pub.locator("#consent").check();
  await pub.getByRole("button", { name: "Submit application" }).click();
  await expect(pub.getByText("Thank you for applying!")).toBeVisible();
  await ctx.close();

  await login(page, USERS.hr);
  await page.goto(`/recruitment?q=web${n}`);
  await page.getByRole("link", { name: new RegExp(`Web Applicant${n}`) }).click();
  await expect(page.getByText("Bianca Villanueva (EMP-0004)")).toBeVisible();
  await expect(page.getByRole("link", { name: `cv-${n}.pdf` })).toBeVisible();
});
