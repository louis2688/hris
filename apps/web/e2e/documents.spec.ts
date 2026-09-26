import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

const pdf = () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1");

async function employeeId(page: Page, q: string) {
  const r = await page.request.get(`/api/v1/employees?q=${q}`);
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}

async function upload(page: Page, name: string, buffer: Buffer, category = "CONTRACT") {
  await page.getByRole("button", { name: "Upload" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("File").setInputFiles({ name, mimeType: "application/pdf", buffer });
  await dlg.getByLabel("Category").selectOption(category);
  await dlg.getByRole("button", { name: "Upload" }).click();
  return dlg;
}

test("HR uploads a document, the employee downloads it, others cannot", async ({ browser }) => {
  const n = Date.now().toString().slice(-6);
  const hr = await (await browser.newContext()).newPage();
  await login(hr, USERS.hr);

  // HR -> Bianca (employee@hris.local)
  const bianca = await employeeId(hr, "Villanueva");
  await hr.goto(`/employees/${bianca}?tab=documents`);
  await upload(hr, `contract-${n}.pdf`, pdf());
  await expect(hr.getByRole("link", { name: `contract-${n}.pdf` })).toBeVisible();

  // An .exe renamed to .pdf is rejected by magic-byte sniffing.
  const dlg = await upload(hr, `evil-${n}.pdf`, Buffer.from("MZ\x90\x00\x03\x00\x00\x00 this is not a pdf", "latin1"));
  await expect(dlg.getByRole("alert")).toContainText("Only PDF, JPG, PNG, WEBP, DOCX and XLSX");
  await hr.keyboard.press("Escape");
  await expect(hr.getByRole("link", { name: `evil-${n}` })).toHaveCount(0);

  // HR -> Paolo (another employee under the same manager)
  const paolo = await employeeId(hr, "Garcia");
  await hr.goto(`/employees/${paolo}?tab=documents`);
  await upload(hr, `paolo-${n}.pdf`, pdf());
  const paoloHref = await hr.getByRole("link", { name: `paolo-${n}.pdf` }).getAttribute("href");
  expect(paoloHref).toMatch(/^\/api\/v1\/documents\//);

  // Employee sees own doc on /me and downloads it.
  const emp = await (await browser.newContext()).newPage();
  await login(emp, USERS.employee);
  await emp.goto("/me?tab=documents");
  const link = emp.getByRole("link", { name: `contract-${n}.pdf` });
  await expect(link).toBeVisible();
  const res = await emp.request.get((await link.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // ...but not a colleague's.
  expect([403, 404]).toContain((await emp.request.get(paoloHref!)).status());
  expect([403, 404]).toContain((await emp.request.delete(paoloHref!)).status());
});
