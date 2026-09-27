"use client";

import { DEFAULT_ACCOUNTS, type AccountMap } from "@hris/shared";
import { saveAccountingAction } from "@/server/actions/payroll";
import { ActionForm, FormField } from "@/components/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const FIELDS: { k: Exclude<keyof AccountMap, "costCenters">; label: string; side: "Dr" | "Cr" | "Dr/Cr" }[] = [
  { k: "salariesExpense", label: "Salaries and wages expense", side: "Dr" },
  { k: "employerContribExpense", label: "Employer contributions expense", side: "Dr" },
  { k: "reimbursements", label: "Reimbursements", side: "Dr" },
  { k: "sssPayable", label: "SSS payable (EE + ER)", side: "Cr" },
  { k: "philhealthPayable", label: "PhilHealth payable (EE + ER)", side: "Cr" },
  { k: "pagibigPayable", label: "Pag-IBIG payable (EE + ER)", side: "Cr" },
  { k: "taxPayable", label: "Withholding tax payable", side: "Cr" },
  { k: "loansReceivable", label: "Loans receivable", side: "Cr" },
  { k: "employeeAdvances", label: "Advances to employees", side: "Dr/Cr" },
  { k: "otherDeductions", label: "Other deductions payable (HMO, etc.)", side: "Cr" },
  { k: "netPayPayable", label: "Net pay payable / cash", side: "Cr" },
];

export function AccountingForm({ map, departments }: { map: AccountMap; departments: string[] }) {
  return (
    <Card>
      <CardHeader title="GL account map" description="Used by the GL journal CSV on each payroll run. Debits always equal credits." />
      <CardBody>
        <ActionForm action={saveAccountingAction} submitLabel="Save account map" className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <FormField key={f.k} label={`${f.label} (${f.side})`} name={f.k} required>
                <Input id={f.k} name={f.k} defaultValue={map[f.k]} placeholder={DEFAULT_ACCOUNTS[f.k]} />
              </FormField>
            ))}
          </div>
          <fieldset className="border-t border-slate-100 pt-6">
            <legend className="sr-only">Cost centers</legend>
            <h3 className="text-sm font-semibold text-ink">Cost centers</h3>
            <p className="mb-3 text-xs text-slate-500">Optional. Expense lines are split by the employee's department. Blank = no cost center.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {departments.map((d) => (
                <FormField key={d} label={d} name={`cc:${d}`}>
                  <Input id={`cc:${d}`} name={`cc:${d}`} defaultValue={map.costCenters[d] ?? ""} placeholder="e.g. CC-100" />
                </FormField>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
