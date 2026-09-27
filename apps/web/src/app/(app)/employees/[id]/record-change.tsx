"use client";

import * as React from "react";
import { History } from "lucide-react";
import { EMPLOYMENT_STATUS_LABELS, EVENT_STATUS_OPTIONS } from "@hris/shared";
import { recordChangeAction } from "@/server/actions/lifecycle";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { OptionSelect, type EmployeeFormOptions } from "../employee-form";

type Kind = "PROMOTION" | "TRANSFER" | "STATUS_CHANGE";

export function RecordChangeDialog({ employeeId, options }: { employeeId: string; options: EmployeeFormOptions }) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<Kind>("PROMOTION");
  const managers = options.managers.filter((m) => m.id !== employeeId);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <History /> Record change
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Record change" description="Effective today or earlier applies now. A future date is scheduled and applied that morning.">
          <ActionForm key={String(open)} action={recordChangeAction.bind(null, employeeId)} onSuccess={() => setOpen(false)} submitLabel="Record change">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Type" name="type" required>
                <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as Kind)}>
                  <option value="PROMOTION">Promotion</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="STATUS_CHANGE">Status change</option>
                </Select>
              </FormField>
              <FormField label="Effective date" name="effectiveDate" required>
                <Input id="effectiveDate" name="effectiveDate" type="date" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })} required />
              </FormField>
              {type === "PROMOTION" ? (
                <>
                  <FormField label="New job title" name="jobTitleId" required>
                    <OptionSelect id="jobTitleId" name="jobTitleId" options={options.jobTitles} placeholder="Pick a job title" />
                  </FormField>
                  <FormField label="New manager" name="managerId" hint="Optional">
                    <OptionSelect id="managerId" name="managerId" options={managers} placeholder="No change" />
                  </FormField>
                </>
              ) : type === "TRANSFER" ? (
                <>
                  <FormField label="New department" name="departmentId">
                    <OptionSelect id="departmentId" name="departmentId" options={options.departments} placeholder="No change" />
                  </FormField>
                  <FormField label="New location" name="locationId">
                    <OptionSelect id="locationId" name="locationId" options={options.locations} placeholder="No change" />
                  </FormField>
                  <FormField label="New manager" name="managerId" className="sm:col-span-2">
                    <OptionSelect id="managerId" name="managerId" options={managers} placeholder="No change" />
                  </FormField>
                </>
              ) : (
                <FormField label="New status" name="employmentStatus" required className="sm:col-span-2" hint="Resignations and terminations go through the separation process">
                  <Select id="employmentStatus" name="employmentStatus" defaultValue="ACTIVE">
                    {EVENT_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s === "ACTIVE" ? "Regular (active)" : EMPLOYMENT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField label="Note" name="note" className="sm:col-span-2">
                <Textarea id="note" name="note" rows={2} placeholder="e.g. Regularized after 6-month probation" />
              </FormField>
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
