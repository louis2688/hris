"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CHECKLIST_KIND_LABELS, TASK_OWNERS, TASK_OWNER_LABELS } from "@hris/shared";
import { addTaskAction, startChecklistAction, toggleTaskAction } from "@/server/actions/people";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };

export function StartChecklistDialog({ employees, templates, employeeId }: { employees: Opt[]; templates: (Opt & { kind: "ONBOARDING" | "OFFBOARDING" })[]; employeeId?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={employeeId ? "secondary" : "brand"} size={employeeId ? "sm" : "default"} onClick={() => setOpen(true)}>
        <Plus /> Start checklist
      </Button>
      <DialogContent title="Start a checklist" description="Copies the template's tasks with due dates from the hire date or last day.">
        <ActionForm action={startChecklistAction} successHref={(id) => `/onboarding/${id}`} submitLabel="Start checklist">
          {employeeId ? (
            <input type="hidden" name="employeeId" value={employeeId} />
          ) : (
            <FormField label="Employee" name="employeeId" required>
              <Select id="employeeId" name="employeeId" defaultValue="">
                <option value="">Pick an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Template" name="templateId" required hint={templates.length ? undefined : "Create a template in Settings > Checklists first."}>
            <Select id="templateId" name="templateId" defaultValue={templates[0]?.id ?? ""}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({CHECKLIST_KIND_LABELS[t.kind]})
                </option>
              ))}
            </Select>
          </FormField>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Optimistic checkbox for one task. */
export function TaskCheck({ id, done, disabled, label }: { id: string; done: boolean; disabled?: boolean; label: string }) {
  const [checked, setChecked] = React.useOptimistic(done);
  const [, start] = React.useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={`${checked ? "Mark not done" : "Mark done"}: ${label}`}
      className={cn("size-5 shrink-0 cursor-pointer rounded-md accent-[#2b9a66] disabled:cursor-not-allowed disabled:opacity-40")}
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          setChecked(next);
          const r = await toggleTaskAction(id, next);
          if (!r.ok) toast.error(r.error);
        });
      }}
    />
  );
}

export function AddTaskForm({ checklistId }: { checklistId: string }) {
  return (
    <ActionForm action={addTaskAction.bind(null, checklistId)} resetOnSuccess submitLabel="Add task" submitVariant="secondary" className="space-y-0">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_170px]">
        <FormField label="Task" name="title" required>
          <Input id="title" name="title" placeholder="e.g. Set up VPN access" />
        </FormField>
        <FormField label="Owner" name="owner">
          <Select id="owner" name="owner" defaultValue="HR">
            {TASK_OWNERS.map((o) => (
              <option key={o} value={o}>
                {TASK_OWNER_LABELS[o]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Due date" name="dueDate">
          <Input id="dueDate" name="dueDate" type="date" />
        </FormField>
      </div>
    </ActionForm>
  );
}
