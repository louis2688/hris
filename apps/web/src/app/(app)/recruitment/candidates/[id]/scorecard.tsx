"use client";

import { RECOMMENDATIONS, RECOMMENDATION_LABELS, type Recommendation } from "@hris/shared";
import { feedbackAction } from "@/server/actions/recruitment";
import { ActionForm, FormField, useFormCtx } from "@/components/action-form";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ValidateFirst } from "@/app/careers/validate-first";

export type FeedbackRow = { id: string; interviewerId: string; interviewer: string; scores: Record<string, number>; rating: number; recommendation: Recommendation; comments: string | null; createdAt: string };

/** Segmented 1-5 radio group; native radios keep it keyboard and screen-reader friendly. */
function Scale({ name, label, value, required }: { name: string; label: string; value?: number; required?: boolean }) {
  const err = useFormCtx().fieldErrors?.[name]?.[0];
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </legend>
      <div className={cn("inline-flex rounded-full bg-bone p-1", err && "ring-1 ring-red-500")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="relative flex size-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-slate-600 transition-colors hover:text-ink has-[:checked]:bg-ink has-[:checked]:text-on-dark has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-focus">
            <input type="radio" name={name} value={n} defaultChecked={value === n} required={required} className="sr-only" aria-label={`${label}: ${n} of 5`} />
            {n}
          </label>
        ))}
      </div>
      {err ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {err}
        </p>
      ) : null}
    </fieldset>
  );
}

function Recommend({ value }: { value?: Recommendation }) {
  const err = useFormCtx().fieldErrors?.recommendation?.[0];
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">
        Recommendation<span className="ml-0.5 text-red-500">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RECOMMENDATIONS.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium ring-1 ring-inset ring-hairline transition-colors hover:bg-canvas has-[:checked]:bg-ink has-[:checked]:text-on-dark has-[:checked]:ring-ink has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-focus">
            <input type="radio" name="recommendation" value={r} defaultChecked={value === r} required className="sr-only" />
            {RECOMMENDATION_LABELS[r]}
          </label>
        ))}
      </div>
      {err ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {err}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ScorecardForm({ interviewId, criteria, mine, onDone }: { interviewId: string; criteria: string[]; mine?: FeedbackRow; onDone: () => void }) {
  return (
    <ValidateFirst>
    <ActionForm action={feedbackAction.bind(null, interviewId)} onSuccess={onDone} submitLabel={mine ? "Update scorecard" : "Submit scorecard"}>
      <p className="text-xs text-slate-500">1 = poor, 3 = meets the bar, 5 = exceptional</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {criteria.map((c) => (
          <Scale key={c} name={`score:${c}`} label={c} value={mine?.scores[c]} />
        ))}
      </div>
      <div className="border-t border-slate-100 pt-4">
        <Scale name="rating" label="Overall rating" value={mine?.rating} required />
      </div>
      <Recommend value={mine?.recommendation} />
      <FormField label="Comments" name="comments">
        <Textarea id="comments" name="comments" rows={3} defaultValue={mine?.comments ?? ""} placeholder="Evidence behind your scores" />
      </FormField>
    </ActionForm>
    </ValidateFirst>
  );
}
