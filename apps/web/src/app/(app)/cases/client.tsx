"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { CASE_TYPES, CASE_TYPE_LABELS, SANCTIONS, SANCTION_LABELS } from "@hris/shared";
import {
  addCaseDocumentAction,
  closeCaseAction,
  createCaseAction,
  decideCaseAction,
  issueNteAction,
  scheduleHearingAction,
  submitExplanationAction,
} from "@/server/actions/lifecycle";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";

// Native `required` / `minLength` let the browser validate before the action runs (the form resets after any action).

export function NewCaseDialog({ employees }: { employees: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus /> New case
      </Button>
      <DialogContent title="New case" description="Grievances, incidents and disciplinary matters. Only HR and Admin can see cases.">
        <ActionForm action={createCaseAction} submitLabel="Open case" successHref={(d: { id: string }) => `/cases/${d.id}`} onSuccess={() => setOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Employee" name="employeeId" required>
              <Select id="employeeId" name="employeeId" defaultValue="" required>
                <option value="">Pick an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type" name="type" required>
              <Select id="type" name="type" defaultValue="INCIDENT">
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CASE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Title" name="title" required className="sm:col-span-2">
              <Input id="title" name="title" required minLength={3} maxLength={160} placeholder="e.g. Unauthorized absence, 3-5 Sep" />
            </FormField>
            <FormField label="What happened" name="description" required className="sm:col-span-2">
              <Textarea id="description" name="description" rows={4} required minLength={10} placeholder="Dates, people involved, evidence on hand" />
            </FormField>
            <div className="sm:col-span-2">
              <Checkbox name="confidential" defaultChecked label="Confidential (every view is recorded in the audit log)" />
            </div>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function IssueNteForm({ id, minDue }: { id: string; minDue: string }) {
  return (
    <ActionForm action={issueNteAction.bind(null, id)} submitLabel="Issue NTE">
      <div className="grid gap-4">
        <FormField label="Charges" name="nteText" required hint="The specific acts or omissions, the company rule involved and the possible sanction">
          <Textarea id="nteText" name="nteText" rows={6} required minLength={20} />
        </FormField>
        <FormField label="Explanation due" name="dueDate" required hint="At least 5 calendar days from today">
          <Input id="dueDate" name="dueDate" type="date" min={minDue} defaultValue={minDue} required />
        </FormField>
      </div>
    </ActionForm>
  );
}

export function HearingForm({ id }: { id: string }) {
  return (
    <ActionForm action={scheduleHearingAction.bind(null, id)} submitLabel="Schedule hearing" submitVariant="secondary">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Hearing date and time" name="hearingAt" required>
          <Input id="hearingAt" name="hearingAt" type="datetime-local" required />
        </FormField>
        <FormField label="Note" name="note">
          <Input id="note" name="note" placeholder="Venue, panel" />
        </FormField>
      </div>
    </ActionForm>
  );
}

export function DecisionForm({ id }: { id: string }) {
  const [sanction, setSanction] = React.useState<string>("NONE");
  return (
    <ActionForm action={decideCaseAction.bind(null, id)} submitLabel="Issue decision">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Findings and decision" name="decision" required className="sm:col-span-2">
          <Textarea id="decision" name="decision" rows={6} required minLength={20} placeholder="What was established, how the explanation was weighed, and the decision" />
        </FormField>
        <FormField label="Sanction" name="sanction" required>
          <Select id="sanction" name="sanction" value={sanction} onChange={(e) => setSanction(e.target.value)}>
            {SANCTIONS.map((s) => (
              <option key={s} value={s}>
                {SANCTION_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        {sanction === "SUSPENSION" ? (
          <FormField label="Suspension days" name="suspensionDays" required>
            <Input id="suspensionDays" name="suspensionDays" type="number" min={1} max={30} required />
          </FormField>
        ) : null}
      </div>
    </ActionForm>
  );
}

export function CloseCaseForm({ id }: { id: string }) {
  return (
    <ActionForm action={closeCaseAction.bind(null, id)} submitLabel="Close case" submitVariant="secondary">
      <FormField label="Closing note" name="note">
        <Input id="note" name="note" placeholder="Optional" />
      </FormField>
    </ActionForm>
  );
}

export function CaseDocUpload({ id }: { id: string }) {
  return (
    <ActionForm action={addCaseDocumentAction.bind(null, id)} submitLabel="Attach" submitVariant="secondary">
      <FormField label="File" name="file" required hint="HR only. PDF, image, DOCX or XLSX up to 5 MB.">
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-bone file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
        />
      </FormField>
    </ActionForm>
  );
}

export function ExplanationForm({ id }: { id: string }) {
  return (
    <ActionForm action={submitExplanationAction.bind(null, id)} submitLabel="Submit explanation">
      <FormField label="Your written explanation" name="explanation" required hint="Answer each charge. You can also ask for a hearing.">
        <Textarea id="explanation" name="explanation" rows={6} required minLength={10} />
      </FormField>
    </ActionForm>
  );
}
