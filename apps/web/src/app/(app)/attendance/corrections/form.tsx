"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { CORRECTION_KINDS, CORRECTION_KIND_LABELS, correctionNeeds } from "@hris/shared";
import { createCorrectionAction } from "@/server/actions/timeoff";
import { ActionForm, FormField } from "@/components/action-form";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ParamDialog } from "@/components/timeoff-ui";

type Kind = (typeof CORRECTION_KINDS)[number];

/** "File correction" dialog; opens pre-filled from /attendance/corrections?new=1&date=...&kind=... (DTR "Fix" links). */
export function CorrectionDialog({ min, max }: { min: string; max: string }) {
  const sp = useSearchParams();
  const [kind, setKind] = React.useState<Kind>((CORRECTION_KINDS as readonly string[]).includes(sp.get("kind") ?? "") ? (sp.get("kind") as Kind) : "MISSED_OUT");
  const need = correctionNeeds(kind);
  const date = sp.get("date") ?? max;
  return (
    <ParamDialog param="new" label="File correction" variant="default" icon={<Plus />} title="File a correction" description="Your manager approves it, then the punches are added to your time record.">
      {(close) => (
        <ActionForm action={createCorrectionAction} onSuccess={close} submitLabel="Send for approval">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" name="date" required>
              <Input id="date" name="date" type="date" min={min} max={max} defaultValue={date >= min && date <= max ? date : max} />
            </FormField>
            <FormField label="What happened" name="kind" required>
              <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {CORRECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CORRECTION_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </FormField>
            {need.in ? (
              <FormField label="Time in" name="inTime" required>
                <Input id="inTime" name="inTime" type="time" defaultValue="09:00" />
              </FormField>
            ) : null}
            {need.out ? (
              <FormField label="Time out" name="outTime" required hint={need.in ? "Earlier than time in = next day" : undefined}>
                <Input id="outTime" name="outTime" type="time" defaultValue="18:00" />
              </FormField>
            ) : null}
          </div>
          <FormField label="Reason" name="reason" required>
            <Textarea id="reason" name="reason" rows={2} maxLength={500} placeholder="Forgot to clock out, client visit, etc." />
          </FormField>
        </ActionForm>
      )}
    </ParamDialog>
  );
}
