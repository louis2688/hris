import { test, expect, type Browser, type Page } from "@playwright/test";
import { login, plusDays, USERS } from "./helpers";

const tag = () => Date.now().toString().slice(-6);

async function as(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("dialog", (d) => d.accept());
  await login(page, email);
  return page;
}

test("employee creates a goal and updates its progress", async ({ browser }) => {
  const title = `E2E goal ${tag()}`;
  const emp = await as(browser, USERS.employee);
  await emp.goto("/performance?tab=goals");
  await emp.getByRole("button", { name: "Add goal" }).click();
  const dlg = emp.getByRole("dialog");
  await dlg.getByLabel(/^Goal\*?$/).fill(title);
  await dlg.getByLabel("Key result area").fill("Quality");
  await dlg.getByLabel("Weight %").fill("10");
  await dlg.getByRole("button", { name: "Add goal" }).click();
  await expect(dlg).toBeHidden();

  const item = emp.locator(`li[data-goal="${title}"]`);
  await expect(item).toBeVisible();
  await item.getByLabel(`Progress % for ${title}`).fill("55");
  await item.getByLabel(`Status for ${title}`).selectOption("AT_RISK");
  await item.getByRole("button", { name: "Update" }).click();
  await expect(emp.getByText("Progress saved")).toBeVisible();
  await emp.reload();
  await expect(item.getByText("55%")).toBeVisible();
  await expect(item.getByLabel(`Status for ${title}`)).toHaveValue("AT_RISK");

  await item.getByRole("button", { name: `Delete ${title}` }).click();
  await expect(item).toBeHidden();
});

test("manager records a 1:1 and the employee sees and updates it", async ({ browser }) => {
  const t = tag();
  const mgr = await as(browser, USERS.manager);
  await mgr.goto("/performance?tab=one-on-ones");
  await mgr.getByRole("button", { name: "Schedule 1:1" }).click();
  const dlg = mgr.getByRole("dialog");
  await dlg.getByLabel("With").selectOption({ label: "Bianca Villanueva" });
  await dlg.getByLabel("Date").fill(plusDays(new Date().toISOString().slice(0, 10), 3));
  await dlg.getByLabel("Agenda").fill(`Roadmap ${t}`);
  await dlg.getByLabel("Notes").fill(`Shared notes ${t}`);
  await dlg.getByLabel("Action items").fill(`Send the doc ${t}\nBook a room ${t}`);
  await dlg.getByRole("button", { name: "Schedule" }).click();
  await expect(dlg).toBeHidden();

  const emp = await as(browser, USERS.employee);
  await emp.goto("/performance?tab=one-on-ones");
  const card = emp.locator("[data-meeting]").filter({ hasText: `Roadmap ${t}` });
  await expect(card.getByText(`Shared notes ${t}`)).toBeVisible();
  await card.getByRole("checkbox", { name: `Send the doc ${t}` }).check();
  await card.getByLabel("Add an agenda item").fill(`My topic ${t}`);
  await card.getByRole("button", { name: "Add", exact: true }).click();
  await expect(card.getByText(`My topic ${t}`)).toBeVisible();
  await emp.reload();
  await expect(card.getByRole("checkbox", { name: `Send the doc ${t}` })).toBeChecked();

  await mgr.reload();
  const mine = mgr.locator("[data-meeting]").filter({ hasText: `Roadmap ${t}` });
  await expect(mine.getByText(`My topic ${t}`)).toBeVisible();
  await mine.getByRole("button", { name: /Delete 1:1/ }).click();
  await expect(mine).toBeHidden();
});

test("HR runs a training event; employee attends and leaves feedback", async ({ browser }) => {
  const title = `E2E training ${tag()}`;
  const hr = await as(browser, USERS.hr);
  await hr.goto("/training");
  await hr.getByRole("button", { name: "New event" }).click();
  const dlg = hr.getByRole("dialog");
  await dlg.getByLabel("Title").fill(title);
  await dlg.getByLabel("Starts").fill("2030-01-15T09:00");
  await dlg.getByLabel("Ends").fill("2030-01-15T17:00");
  await dlg.getByLabel("Cost per participant (PHP)").fill("1000");
  await dlg.getByLabel("Capacity").fill("5");
  await dlg.getByRole("button", { name: "Create event" }).click();
  await hr.waitForURL(/\/training\/[^/]+$/);

  await hr.getByLabel("Search people").fill("Bianca");
  await hr.getByRole("checkbox", { name: /Bianca Villanueva/ }).check();
  await hr.getByRole("button", { name: "Send invites" }).click();
  const row = hr.locator('li[data-attendee="Bianca Villanueva"]');
  await row.getByLabel("Attendance for Bianca Villanueva").selectOption("ATTENDED");
  await row.getByLabel("Result for Bianca Villanueva").fill("PASSED");
  await row.getByLabel("Score for Bianca Villanueva").fill("88");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(hr.getByText("Saved")).toBeVisible();

  const emp = await as(browser, USERS.employee);
  await emp.goto("/training");
  const mine = emp.locator(`li[data-training="${title}"]`);
  await expect(mine.getByText("Attended")).toBeVisible();
  await mine.getByRole("button", { name: "Rate this training" }).click();
  const fb = emp.getByRole("dialog");
  await fb.getByRole("radiogroup").locator("label").filter({ hasText: /^4$/ }).click();
  await fb.getByLabel("Comment").fill("Useful labs");
  await fb.getByRole("button", { name: "Send feedback" }).click();
  await expect(mine.getByText("You rated it 4/5")).toBeVisible();

  await hr.reload();
  await expect(hr.getByText("4 / 5")).toBeVisible();
  await hr.getByRole("button", { name: "Delete" }).click();
  await hr.waitForURL(/\/training$/);
});

test("HR runs an anonymous survey; employee answers once; results show eNPS", async ({ browser }) => {
  const title = `E2E pulse ${tag()}`;
  const hr = await as(browser, USERS.hr);
  await hr.goto("/surveys/new");
  await hr.getByLabel("Title").fill(title);
  await expect(hr.getByRole("checkbox", { name: /Anonymous/ })).toBeChecked();
  await hr.getByRole("button", { name: "Save draft" }).click();
  await hr.waitForURL(/\/surveys\/[^/]+\/results$/);
  const id = hr.url().split("/").at(-2)!;
  await hr.getByRole("button", { name: "Publish" }).click();
  await expect(hr.getByText("Live", { exact: true })).toBeVisible();

  const emp = await as(browser, USERS.employee);
  await emp.goto("/surveys");
  await emp.getByRole("link").filter({ hasText: title }).click();
  await emp.getByRole("radiogroup", { name: /recommend working here/ }).locator("label").filter({ hasText: /^10$/ }).click();
  await emp.getByRole("radiogroup", { name: /supported/ }).locator("label").filter({ hasText: /^4$/ }).click();
  await emp.getByRole("button", { name: "Submit answers" }).click();
  await expect(emp.getByText("You already answered this survey")).toBeVisible();

  // A second submit (e.g. from the mobile API) is refused.
  const again = await emp.request.post(`/api/v1/surveys/${id}/responses`, { data: { answers: { [(await firstQuestionId(emp, id)) ?? "x"]: 9 } } });
  expect(again.status()).toBe(409);

  await hr.reload();
  const responses = hr.locator("p", { hasText: /^Responses$/ }).locator("..");
  await expect(responses.getByText("1", { exact: true })).toBeVisible();
  await expect(hr.locator("p", { hasText: /^eNPS$/ }).locator("..").getByText("+100").first()).toBeVisible();
  await hr.getByRole("button", { name: "Close survey" }).click();
  await expect(hr.getByText("Closed", { exact: true })).toBeVisible();
});

async function firstQuestionId(page: Page, surveyId: string) {
  const r = await page.request.get("/api/v1/surveys");
  const { surveys } = (await r.json()) as { surveys: { id: string; questions: { id: string }[] }[] };
  return surveys.find((s) => s.id === surveyId)?.questions[0]?.id;
}
