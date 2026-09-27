"use client";

import * as React from "react";
import { MessageSquarePlus } from "lucide-react";
import { peerFeedbackAction, requestPeersAction } from "@/server/actions/performance";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { EmployeePicker, type PickPerson } from "./employee-picker";

/** 1..max pill radios. Not a <fieldset> on purpose: review-page tests count fieldsets as KPI items. */
export function RatingPills({ name, max = 5, min = 1, label, defaultValue }: { name: string; max?: number; min?: number; label: string; defaultValue?: number | null }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
        <label key={n} className="cursor-pointer">
          <input type="radio" name={name} value={n} defaultChecked={defaultValue === n} className="peer sr-only" aria-label={`${n} of ${max}`} />
          <span className="flex size-10 items-center justify-center rounded-full text-sm font-semibold text-slate-700 ring-1 ring-inset ring-hairline transition-colors hover:bg-canvas peer-checked:bg-ink peer-checked:text-on-dark peer-checked:ring-ink peer-focus-visible:ring-[3px] peer-focus-visible:ring-focus">
            {n}
          </span>
        </label>
      ))}
    </div>
  );
}

export function PeerFeedbackButton({ id, forName, cycle }: { id: string; forName: string; cycle: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <MessageSquarePlus /> Give feedback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Feedback for ${forName}`} description={`${cycle}. Their manager and HR see your name; ${forName.split(" ")[0]} sees it without names.`}>
          {open ? (
            <ActionForm action={peerFeedbackAction.bind(null, id)} onSuccess={() => setOpen(false)} submitLabel="Send feedback">
              <FormField label="Overall rating" name="rating" required>
                <RatingPills name="rating" label="Overall rating" />
              </FormField>
              <FormField label="Strengths" name="strengths" hint="What should they keep doing?">
                <Textarea id="strengths" name="strengths" rows={3} />
              </FormField>
              <FormField label="Could improve" name="improvements" hint="Specific and kind beats vague.">
                <Textarea id="improvements" name="improvements" rows={3} />
              </FormField>
            </ActionForm>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PeerRequestForm({ reviewId, people, max }: { reviewId: string; people: PickPerson[]; max: number }) {
  const [k, setK] = React.useState(0);
  return (
    <ActionForm key={k} action={requestPeersAction.bind(null, reviewId)} onSuccess={() => setK((x) => x + 1)} submitLabel="Request feedback" submitVariant="secondary">
      <FormField label={`Ask up to ${max} more peer${max === 1 ? "" : "s"}`} name="reviewerIds">
        <EmployeePicker name="reviewerIds" people={people} max={max} />
      </FormField>
    </ActionForm>
  );
}
