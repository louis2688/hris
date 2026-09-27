"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import type { BenefitDependent } from "@hris/shared";
import { saveEnrollmentAction } from "@/server/actions/benefits";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";

export type EnrollmentValue = { id: string; employeeId: string; from: string; to: string | null; cardNo: string | null; dependents: BenefitDependent[] };

export function EnrollDialog({ planId, employees, today, value }: { planId: string; employees: { id: string; name: string }[]; today: string; value?: EnrollmentValue }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {value ? (
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Edit enrollment">
          <Pencil />
        </Button>
      ) : (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus /> Enroll employee
        </Button>
      )}
      <DialogContent title={value ? "Edit enrollment" : "Enroll employee"}>
        <ActionForm action={saveEnrollmentAction.bind(null, value?.id)} submitLabel={value ? "Save" : "Enroll"} onSuccess={() => setOpen(false)}>
          <input type="hidden" name="planId" value={planId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Employee" name="employeeId" required className="sm:col-span-2">
              <Select id="employeeId" name="employeeId" defaultValue={value?.employeeId ?? ""}>
                <option value="">Pick an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Effective from" name="effectiveFrom" required>
              <Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={value?.from ?? today} />
            </FormField>
            <FormField label="Effective to" name="effectiveTo" hint="Blank = ongoing">
              <Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={value?.to ?? ""} />
            </FormField>
            <FormField label="Card no." name="cardNo" className="sm:col-span-2">
              <Input id="cardNo" name="cardNo" defaultValue={value?.cardNo ?? ""} />
            </FormField>
            <FormField label="Dependents" name="dependents" hint="One per line: Name | Relationship | YYYY-MM-DD" className="sm:col-span-2">
              <Textarea
                id="dependents"
                name="dependents"
                rows={3}
                className="font-mono text-xs"
                placeholder="Ana Cruz | Spouse | 1990-02-03"
                defaultValue={value?.dependents.map((d) => [d.name, d.relationship, d.birthDate].filter(Boolean).join(" | ")).join("\n") ?? ""}
              />
            </FormField>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
