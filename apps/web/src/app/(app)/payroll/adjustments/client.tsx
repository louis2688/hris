"use client";

import * as React from "react";
import { Plus, Upload } from "lucide-react";
import { ADJUSTMENT_CSV_COLUMNS, ADJUSTMENT_PRESETS, type AdjustmentPreset } from "@hris/shared";
import { createAdjustmentAction, importAdjustmentsAction } from "@/server/actions/payroll";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";

type Opt = { id: string; name: string };

export function AddAdjustmentDialog({ employees, today }: { employees: Opt[]; today: string }) {
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState<AdjustmentPreset>("BONUS");
  const [recurring, setRecurring] = React.useState(false);
  const p = ADJUSTMENT_PRESETS[code];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus /> Add adjustment
      </Button>
      <DialogContent title="Add adjustment" description="Picked up by the payroll run whose period contains the effective date.">
        <ActionForm action={createAdjustmentAction} submitLabel="Add adjustment" onSuccess={() => setOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Employee" name="employeeId" required className="sm:col-span-2">
              <Select id="employeeId" name="employeeId" defaultValue="">
                <option value="">Pick an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type" name="code" required>
              <Select id="code" name="code" value={code} onChange={(e) => setCode(e.target.value as AdjustmentPreset)}>
                {Object.entries(ADJUSTMENT_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {/* key remounts the preset-driven defaults when the type changes */}
            <React.Fragment key={code}>
              <input type="hidden" name="kind" value={p.kind} />
              <FormField label="Amount (PHP)" name="amount" required>
                <Input id="amount" name="amount" type="number" step="0.01" min={0} inputMode="decimal" />
              </FormField>
              <FormField label="Label on payslip" name="label" required className="sm:col-span-2">
                <Input id="label" name="label" defaultValue={p.label} />
              </FormField>
              <div className="sm:col-span-2">
                <Checkbox name="taxable" defaultChecked={p.taxable} label={p.kind === "EARNING" ? "Taxable (withholding tax applies)" : "Before tax (reduces taxable income)"} />
              </div>
            </React.Fragment>
            <FormField label="Effective date" name="effectiveDate" required>
              <Input id="effectiveDate" name="effectiveDate" type="date" defaultValue={today} />
            </FormField>
            <div className="flex items-end pb-1">
              <Checkbox name="recurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} label="Recurring every cutoff" />
            </div>
            {recurring ? (
              <FormField label="End date" name="endDate" hint="Blank = until removed" className="sm:col-span-2">
                <Input id="endDate" name="endDate" type="date" />
              </FormField>
            ) : null}
            <FormField label="Note" name="note" className="sm:col-span-2">
              <Textarea id="note" name="note" rows={2} className="min-h-0" />
            </FormField>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function ImportDialog() {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload /> Import CSV
      </Button>
      <DialogContent title="Import adjustments" description="All rows must be valid or nothing is imported.">
        <ActionForm action={importAdjustmentsAction} submitLabel="Import" onSuccess={() => setOpen(false)}>
          <p className="rounded-xl bg-bone px-3.5 py-2.5 font-mono text-xs leading-relaxed text-slate-700">
            {ADJUSTMENT_CSV_COLUMNS.join(",")}
            <br />
            EMP-0005,EARNING,BONUS,Q3 bonus,5000,yes,2026-10-15
          </p>
          <p className="text-xs text-slate-500">Blank kind, label or taxable default from the code (BONUS, INCENTIVE, RETENTION_BONUS, ARREARS, COMMISSION, OTHER_EARNING, SALARY_DEDUCTION, OTHER_DEDUCTION).</p>
          <FormField label="CSV file" name="file">
            <Input id="file" name="file" type="file" accept=".csv,text/csv" className="pt-2.5" />
          </FormField>
          <FormField label="Or paste rows" name="csv">
            <Textarea id="csv" name="csv" rows={5} wrap="off" spellCheck={false} className="font-mono text-xs" placeholder={ADJUSTMENT_CSV_COLUMNS.join(",")} />
          </FormField>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
