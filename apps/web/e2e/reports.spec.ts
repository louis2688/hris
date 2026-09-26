import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("HR runs headcount and builds an employee report with CSV export", async ({ page }) => {
  await login(page, USERS.hr);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  await page.getByRole("link", { name: /Headcount/ }).click();
  await expect(page.getByRole("heading", { name: "Headcount" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Total" })).toBeVisible();
  const csv = await page.request.get(await page.getByRole("link", { name: "Download CSV" }).getAttribute("href") as string);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");

  await page.goto("/reports/employees");
  await expect(page.getByRole("heading", { name: "Employee report" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).check();
  await page.getByLabel("Hire date", { exact: true }).check();
  await page.getByLabel("Job title", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page).toHaveURL(/cols=email/);
  await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Job title" })).toHaveCount(0);

  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  expect(href).toContain("cols=hireDate");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const header = (await res.text()).replace(/^﻿/, "").split("\r\n")[0];
  expect(header).toBe("Code,Name,Email,Department,Status,Hire date");
});

test("employees cannot open reports or the CSV endpoint", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/forbidden/);
  expect((await page.request.get("/api/v1/reports/employees")).status()).toBe(403);
});
