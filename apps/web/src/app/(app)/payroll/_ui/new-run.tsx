"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { createRunAction } from "@/server/actions/payroll";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";

type Values = { name: string; frequency: "SEMI_MONTHLY" | "MONTHLY"; periodStart: string; periodEnd: string; payDate: string };

export function NewRunDialog({ defaults }: { defaults: Values }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"REGULAR" | "THIRTEENTH_MONTH">("REGULAR");
  const year = defaults.periodStart.slice(0, 4);
  const v: Values =
    kind === "REGULAR"
      ? defaults
      : { name: `13th month pay ${year}`, frequency: defaults.frequency, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, payDate: `${year}-12-15` };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus /> New payroll run
      </Button>
      <DialogContent title="New payroll run" description="Creates a draft. Compute it to generate payslips, then finalize to release them.">
        {/* key remounts the fields with the defaults of the chosen kind */}
        <ActionForm key={kind} action={createRunAction} submitLabel="Create draft" successHref={(d: { id: string }) => `/payroll/${d.id}`} onSuccess={() => setOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type" name="kind" required>
              <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="REGULAR">Regular payroll</option>
                <option value="THIRTEENTH_MONTH">13th month pay</option>
              </Select>
            </FormField>
            <FormField label="Frequency" name="frequency" required>
              <Select id="frequency" name="frequency" defaultValue={v.frequency}>
                <option value="SEMI_MONTHLY">Semi-monthly</option>
                <option value="MONTHLY">Monthly</option>
              </Select>
            </FormField>
            <FormField label="Name" name="name" required className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={v.name} />
            </FormField>
            <FormField label="Period start" name="periodStart" required>
              <Input id="periodStart" name="periodStart" type="date" defaultValue={v.periodStart} />
            </FormField>
            <FormField label="Period end" name="periodEnd" required>
              <Input id="periodEnd" name="periodEnd" type="date" defaultValue={v.periodEnd} />
            </FormField>
            <FormField label="Pay date" name="payDate" required hint={kind === "REGULAR" ? undefined : "PD 851: pay on or before 24 December"}>
              <Input id="payDate" name="payDate" type="date" defaultValue={v.payDate} />
            </FormField>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
