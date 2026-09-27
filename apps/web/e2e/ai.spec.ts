import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

// Runs against a server started with AI_PROVIDER=mock (deterministic, no network).
// The not-configured state is covered by aiProviderFor() unit tests in packages/shared/src/schemas/ai.test.ts.

test("employee asks the assistant about leave and gets their real balance via the tool path", async ({ page }) => {
  await login(page, USERS.employee);
  const { balances } = (await (await page.request.get("/api/v1/me/balances")).json()) as { balances: { leaveTypeName: string; available: number }[] };
  const vl = balances.find((b) => /vacation/i.test(b.leaveTypeName)) ?? balances[0]!;

  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "HR assistant" })).toBeVisible();
  await page.getByRole("button", { name: "How many vacation leave days do I have?" }).click();
  const reply = page.getByTestId("assistant-message").last();
  await expect(reply).toContainText(vl.leaveTypeName);
  await expect(reply).toContainText(`available ${vl.available}`);

  // Follow-up keeps history in the client and still answers.
  await page.getByLabel("Message").fill("When is the next holiday?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(2);
  await expect(page.getByTestId("assistant-message").last()).toContainText(/Here is what I found|Nothing found/);
});

test("assistant API rejects bad input and needs auth", async ({ page, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await anon.post("/api/v1/assistant", { data: { messages: [{ role: "user", content: "hi" }] } })).status()).toBe(401);
  await login(page, USERS.employee);
  expect((await page.request.post("/api/v1/assistant", { data: { messages: [{ role: "user", content: "x".repeat(2001) }] } })).status()).toBe(422);
});

test("HR uploads a PDF resume and screens the candidate with AI", async ({ page }) => {
  const n = Date.now().toString().slice(-6);
  await login(page, USERS.hr);
  await page.goto("/recruitment");
  await page.getByRole("button", { name: "Add candidate" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("First name").fill("Ai");
  await dlg.getByLabel("Last name").fill(`Screen${n}`);
  await dlg.getByLabel("Email").fill(`ai${n}@example.com`);
  await dlg.getByLabel("Vacancy").selectOption({ index: 1 });
  await dlg.getByRole("button", { name: "Add candidate" }).click();
  await page.waitForURL(/\/recruitment\/candidates\//);

  await page.getByRole("button", { name: "Upload" }).click();
  const up = page.getByRole("dialog");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1");
  await up.getByLabel("File").setInputFiles({ name: `resume-${n}.pdf`, mimeType: "application/pdf", buffer: pdf });
  await up.getByLabel("Category").selectOption("RESUME");
  await up.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: `resume-${n}.pdf` })).toBeVisible();

  await page.getByRole("button", { name: "Screen with AI" }).click();
  await expect(page.getByTestId("ai-score")).toHaveText(/^\d{1,3}$/);
  await expect(page.getByText("AI suggestion - review before deciding")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-screen" })).toBeVisible();
  // Screening never moves the stage.
  await expect(page.getByText("Applied").first()).toBeVisible();
});
