import { test, expect as baseExpect, type Browser, type Locator } from "@playwright/test";
import { nextMonday, PASSWORD, plusDays, uiDate, USERS } from "./helpers";

// several logins per test on a shared dev server
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ mode: "serial", timeout: 300_000 });

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pad = (n: number) => String(n).padStart(2, "0");
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

async function as(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  return page;
}

test("correction: employee fixes a day from the DTR, manager approves, DTR shows the time out", async ({ browser }) => {
  const e = await as(browser, USERS.employee);
  const thisMonth = manilaToday().slice(0, 7);
  const prev = new Date(`${thisMonth}-01T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  // Prefer a "No out" day (missed out); otherwise an absent day (missed both). Seeded data has both (reseed restores).
  let fix: Locator | null = null;
  let month = thisMonth;
  for (const m of [thisMonth, prev.toISOString().slice(0, 7)]) {
    await e.goto(`/attendance?month=${m}`);
    await expect(e.getByText("Days present")).toBeVisible();
    const noOut = e.locator("tr", { hasText: "No out" }).getByRole("link", { name: "Fix", exact: true });
    const any = e.getByRole("link", { name: "Fix", exact: true });
    fix = (await noOut.count()) ? noOut.first() : (await any.count()) ? any.first() : null;
    month = m;
    if (fix) break;
  }
  expect(fix, "a fixable day in the last 30 days").not.toBeNull();
  const date = (await fix!.locator("xpath=ancestor::tr").getAttribute("data-date"))!;
  await fix!.click();
  const dlg = e.getByRole("dialog");
  await expect(dlg.getByLabel("Date")).toHaveValue(date);
  const out = `19:${pad(rand(10, 59))}`;
  await dlg.getByLabel("Time out").fill(out);
  await dlg.getByLabel("Reason").fill("E2E forgot to clock out");
  await dlg.getByRole("button", { name: "Send for approval" }).click();
  await expect(e.getByText("Correction sent for approval")).toBeVisible();

  const m = await as(browser, USERS.manager);
  await m.goto("/attendance/corrections");
  await m.getByRole("button", { name: `Approve Bianca Villanueva ${uiDate(date)}` }).click();
  await expect(m.getByText("Correction approved")).toBeVisible();

  await e.goto(`/attendance?month=${month}`);
  const row = e.locator(`tr[data-date="${date}"]`);
  await expect(row).toContainText("Present");
  await expect(row.locator("td").nth(3)).toHaveText(out);
});

test("comp-off: employee claims a worked Saturday, manager approves, balance goes up", async ({ browser }) => {
  const e = await as(browser, USERS.employee);
  await e.goto("/me/leave");
  const card = e.locator('[data-code="CO"]');
  await expect(card).toBeVisible();
  const before = (await card.locator("[data-available]").count()) ? Number(await card.locator("[data-available]").innerText()) : 0;
  await e.getByRole("button", { name: "Claim comp-off" }).click();
  const dlg = e.getByRole("dialog");
  const day = dlg.getByLabel("Day worked");
  await expect(day).toBeVisible();
  // a whole day needs 4h+ (other specs leave short rest-day punches around)
  const labels = await day.locator("option").allInnerTexts();
  const full = labels.find((l) => Number(l.match(/(\d+)h \d+m$/)?.[1] ?? 0) >= 4);
  expect(full, "a seeded worked Saturday").toBeTruthy();
  await day.selectOption({ label: full! });
  await dlg.getByLabel("Reason").fill("E2E Saturday release support");
  await dlg.getByRole("button", { name: "Send for approval" }).click();
  await expect(e.getByText("Comp-off request sent")).toBeVisible();

  const m = await as(browser, USERS.manager);
  await m.goto("/leave");
  await m.getByRole("button", { name: /^Approve Bianca Villanueva Comp-off \+1 day/ }).first().click();
  await expect(m.getByText("Comp-off approved")).toBeVisible();

  await e.reload();
  await expect(card.locator("[data-available]")).toHaveText(String(before + 1));
});

test("encashment: employee converts half a VL day, HR approves, payroll gets a LEAVE_ENCASH earning", async ({ browser }) => {
  const e = await as(browser, USERS.employee);
  await e.goto("/me/leave?encash=1");
  const dlg = e.getByRole("dialog");
  await expect(dlg.getByLabel("Leave type")).toContainText("Vacation Leave");
  await dlg.getByLabel("Days").fill("0.5");
  await dlg.getByRole("button", { name: "Send to HR" }).click();
  await expect(e.getByText("Encashment request sent to HR")).toBeVisible();

  const h = await as(browser, USERS.hr);
  await h.goto("/leave");
  await h.getByRole("button", { name: /^Approve Bianca Villanueva Encash 0\.5 days Vacation Leave/ }).first().click();
  await expect(h.getByText("Approved - added to payroll")).toBeVisible();
  await h.goto("/payroll/adjustments?status=pending");
  await expect(h.getByText(/Leave encashment \(0\.5 days VL/).first()).toBeVisible();

  await e.reload();
  await expect(e.getByText(/Approved - added to payroll/).first()).toBeVisible();
});

test("block dates: HR blocks a range, an employee's leave request inside it is rejected", async ({ browser }) => {
  const name = `E2E freeze ${Date.now().toString().slice(-5)}`;
  const from = nextMonday(30);
  const h = await as(browser, USERS.hr);
  await h.goto("/settings/leave-policies");
  await h.getByRole("button", { name: "Add block date" }).click();
  const hd = h.getByRole("dialog");
  await hd.getByLabel("Name").fill(name);
  await hd.getByLabel("From").fill(from);
  await hd.getByLabel("To").fill(plusDays(from, 2));
  await hd.getByRole("button", { name: "Save" }).click();
  await expect(h.getByRole("cell", { name })).toBeVisible();

  const e = await as(browser, USERS.employee);
  await e.goto("/me/leave");
  await e.getByRole("button", { name: "Request leave" }).click();
  const dlg = e.getByRole("dialog");
  await dlg.locator("#startDate").fill(plusDays(from, 1));
  await dlg.locator("#endDate").fill(plusDays(from, 1));
  await expect(dlg.getByText(/Blocked: E2E freeze/)).toBeVisible();
  await dlg.getByRole("button", { name: "Submit request" }).click();
  await expect(dlg.getByText(/Leave is blocked .* \(E2E freeze/).first()).toBeVisible();

  h.on("dialog", (d) => d.accept());
  await h.locator("tr", { hasText: name }).getByRole("button").last().click();
  await expect(h.getByRole("cell", { name })).toHaveCount(0);
});

test("import: HR previews a CSV with an error row, then imports the valid punches", async ({ browser }) => {
  let day = plusDays(manilaToday(), -40);
  while ([0, 6].includes(new Date(day).getUTCDay())) day = plusDays(day, -1);
  const csv = `employeeCode,date,time_in,time_out\nEMP-0005,${day},08:${pad(rand(10, 59))},17:${pad(rand(10, 59))}\nEMP-9999,${day},09:00,18:00`;
  const h = await as(browser, USERS.hr);
  await h.goto("/attendance/import");
  await h.getByLabel("Attendance data").fill(csv);
  await h.getByRole("button", { name: "Preview" }).click();
  await expect(h.getByText("Unknown employee")).toBeVisible();
  await expect(h.getByRole("cell", { name: /Paolo Garcia/ })).toBeVisible();
  await h.getByRole("button", { name: "Import 2 punches" }).click();
  await expect(h.getByText(/Done: [12] inserted/)).toBeVisible();
});
