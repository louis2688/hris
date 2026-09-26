"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { manualPunchAction } from "@/server/actions/attendance";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { todayISO } from "@/lib/utils";

export function ManualPunchDialog({ employees }: { employees: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus /> Add punch
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add missing punch" description="Logged as a manual correction with your name on it.">
          <ActionForm action={manualPunchAction} onSuccess={() => setOpen(false)} submitLabel="Add punch">
            <FormField label="Employee" name="employeeId" required>
              <Select id="employeeId" name="employeeId" defaultValue="">
                <option value="">Select</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Date" name="date" required>
                <Input id="date" name="date" type="date" defaultValue={todayISO()} />
              </FormField>
              <FormField label="Time" name="time" required>
                <Input id="time" name="time" type="time" defaultValue="09:00" />
              </FormField>
              <FormField label="Type" name="direction">
                <Select id="direction" name="direction" defaultValue="">
                  <option value="">Auto</option>
                  <option value="IN">In</option>
                  <option value="OUT">Out</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Reason" name="note" required>
              <Textarea id="note" name="note" rows={2} placeholder="Forgot to punch, device offline, etc." />
            </FormField>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
