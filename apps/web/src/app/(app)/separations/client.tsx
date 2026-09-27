"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { EXIT_QUESTIONS, SEPARATION_REASON_LABELS, type ExitInterview } from "@hris/shared";
import { computeFinalPayAction, saveExitInterviewAction, startSeparationAction } from "@/server/actions/separations";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";

export function StartSeparationDialog({ employees, today }: { employees: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus /> Start separation
      </Button>
      <DialogContent title="Start separation" description="Opens clearance and the offboarding checklist. The employee keeps access until you complete it.">
        <ActionForm action={startSeparationAction} submitLabel="Start separation" successHref={(d: { id: string }) => `/separations/${d.id}`} onSuccess={() => setOpen(false)}>
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
            <FormField label="Reason" name="reason" required className="sm:col-span-2">
              <Select id="reason" name="reason" defaultValue="RESIGNATION">
                {Object.entries(SEPARATION_REASON_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Notice date" name="noticeDate">
              <Input id="noticeDate" name="noticeDate" type="date" defaultValue={today} />
            </FormField>
            <FormField label="Last day" name="lastDay" required hint="Resignations: 30 days after notice (Labor Code art. 300)">
              <Input id="lastDay" name="lastDay" type="date" />
            </FormField>
            <FormField label="Notes" name="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={2} className="min-h-0" />
            </FormField>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function ExitInterviewForm({ id, value, disabled }: { id: string; value: ExitInterview | null; disabled?: boolean }) {
  const a = (k: keyof typeof EXIT_QUESTIONS) => value?.answers.find((x) => x.key === k)?.a ?? "";
  return (
    <ActionForm action={saveExitInterviewAction.bind(null, id)} submitLabel="Save exit interview" hideSubmit={disabled}>
      <fieldset disabled={disabled} className="grid gap-4">
        <FormField label={EXIT_QUESTIONS.reason} name="reason" required>
          <Textarea id="reason" name="reason" rows={2} className="min-h-0" defaultValue={a("reason")} />
        </FormField>
        <FormField label={EXIT_QUESTIONS.didWell} name="didWell">
          <Textarea id="didWell" name="didWell" rows={2} className="min-h-0" defaultValue={a("didWell")} />
        </FormField>
        <FormField label={EXIT_QUESTIONS.improve} name="improve">
          <Textarea id="improve" name="improve" rows={2} className="min-h-0" defaultValue={a("improve")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={EXIT_QUESTIONS.recommend} name="recommend" required>
            <Select id="recommend" name="recommend" defaultValue={a("recommend") || "Yes"}>
              <option>Yes</option>
              <option>Maybe</option>
              <option>No</option>
            </Select>
          </FormField>
          <div className="flex items-end pb-1">
            <Checkbox name="rehireEligible" defaultChecked={value?.rehireEligible ?? true} label="Eligible for rehire (HR only)" />
          </div>
        </div>
      </fieldset>
    </ActionForm>
  );
}

export function FinalPayForm({ id, encashDays, assets, hasRun }: { id: string; encashDays: number; assets: number; hasRun: boolean }) {
  return (
    <ActionForm action={computeFinalPayAction.bind(null, id)} submitLabel={hasRun ? "Recompute final pay" : "Compute final pay"} submitVariant={hasRun ? "secondary" : "brand"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Leave days to encash" name="encashDays" hint="Unused days of encashable leave types. First 10 days are tax-free.">
          <Input id="encashDays" name="encashDays" type="number" step="0.5" min={0} max={365} defaultValue={encashDays} />
        </FormField>
        <div className="flex items-end pb-1">
          <Checkbox name="deductAssets" defaultChecked={false} disabled={!assets} label={`Deduct unreturned assets at cost${assets ? ` (${assets})` : ""}`} />
        </div>
      </div>
    </ActionForm>
  );
}
