"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companySettingsSchema, compensationSchema, createPayrollRunSchema, payrollConfigSchema, unflattenPayrollForm } from "@hris/shared";
import { requireRole } from "../auth/session";
import * as payroll from "../services/payroll";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

const staff = () => requireRole("ADMIN", "HR");

function revalidateRun(id?: string) {
  revalidatePath("/payroll");
  revalidatePath("/payslips");
  if (id) revalidatePath(`/payroll/${id}`);
}

export async function createRunAction(_p: ActionResult<{ id: string }> | undefined, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await staff();
  const p = parse(createPayrollRunSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(async () => ({ id: (await payroll.createRun(actor, p.data)).id }), "Payroll run created");
  if (r.ok) revalidateRun();
  return r;
}

export async function computeRunAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => payroll.computeRun(actor, id));
  revalidateRun(id);
  return r.ok ? { ok: true, data: undefined, message: `${r.data} payslip${r.data === 1 ? "" : "s"} computed` } : r;
}

export async function finalizeRunAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => payroll.finalizeRun(actor, id), "Run finalized. Employees have been notified.");
  revalidateRun(id);
  return r;
}

export async function markRunPaidAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => payroll.markRunPaid(actor, id), "Marked as paid");
  revalidateRun(id);
  return r;
}

export async function deleteRunAction(id: string): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => payroll.deleteRun(actor, id), "Draft deleted");
  revalidateRun();
  if (r.ok) redirect("/payroll");
  return r;
}

export async function saveCompensationAction(employeeId: string | undefined, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  if (!employeeId) return { ok: false, error: "Pick an employee" };
  const p = parse(compensationSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => payroll.updateCompensation(actor, employeeId, p.data), "Compensation saved");
  revalidatePath("/payroll/compensation");
  return r;
}

export async function saveCompanyAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(companySettingsSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => payroll.saveCompany(actor, p.data), "Company details saved");
  revalidatePath("/settings/payroll");
  return r;
}

export async function savePayrollConfigAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await staff();
  const p = parse(payrollConfigSchema, unflattenPayrollForm(formToObject(fd)));
  if ("error" in p) {
    // Nested issues ("tax.monthly.2.rate") surface on their form field ("tax.monthly").
    const fe: Record<string, string[]> = {};
    const errs = p.error.ok ? {} : (p.error.fieldErrors ?? {});
    for (const [k, msgs] of Object.entries(errs)) {
      const [group, key, ...rest] = k.split(".");
      const field = key ? `${group}.${key}` : group!;
      (fe[field] ??= []).push(...msgs.map((m) => (rest.length ? `Row ${Number(rest[0]) + 1} ${rest.slice(1).join(".")}: ${m}` : m)));
    }
    return { ok: false, error: "Please fix the highlighted fields", fieldErrors: fe };
  }
  const r = await run(() => payroll.savePayrollConfig(actor, p.data), "Payroll rates saved");
  revalidatePath("/settings/payroll");
  return r;
}

export async function resetPayrollConfigAction(): Promise<ActionResult> {
  const actor = await staff();
  const r = await run(() => payroll.savePayrollConfig(actor, null), "Rates reset to defaults");
  revalidatePath("/settings/payroll");
  return r;
}
