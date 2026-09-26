"use client";

import { saveManagerReviewAction, saveSelfReviewAction } from "@/server/actions/performance";
import { ActionForm, FormField, useFormCtx } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export type FormItem = { id: string; kpiName: string; description: string | null; minRating: number; maxRating: number; rating: number | null; comment: string | null; hint?: string };

function DraftButton() {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" name="intent" value="save" variant="secondary" loading={pending}>
      Save draft
    </Button>
  );
}

export function ReviewForm({ id, side, items, comment }: { id: string; side: "self" | "manager"; items: FormItem[]; comment: string | null }) {
  const action = (side === "self" ? saveSelfReviewAction : saveManagerReviewAction).bind(null, id);
  return (
    // Draft button comes first so Enter in a field saves instead of submitting.
    <ActionForm action={action} submitLabel={side === "self" ? "Submit self review" : "Complete review"} footer={<DraftButton />}>
      {items.map((it) => (
        <fieldset key={it.id} className="rounded-xl p-4 ring-1 ring-inset ring-slate-200">
          {/* float + w-full keeps the legend inside the padded box */}
          <legend className="float-left w-full text-sm font-semibold text-ink">{it.kpiName}</legend>
          {it.description ? <p className="clear-left pt-0.5 text-xs text-slate-500">{it.description}</p> : null}
          {it.hint ? <p className="clear-left pt-1 text-xs text-violet-700">{it.hint}</p> : null}
          <div className="clear-left flex flex-wrap gap-1.5 pt-3">
            {Array.from({ length: it.maxRating - it.minRating + 1 }, (_, i) => it.minRating + i).map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="radio" name={`rating:${it.id}`} value={n} defaultChecked={it.rating === n} className="peer sr-only" aria-label={`${n} of ${it.maxRating}`} />
                <span className="flex size-10 items-center justify-center rounded-xl text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 peer-checked:bg-brand-500 peer-checked:text-white peer-checked:ring-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">
                  {n}
                </span>
              </label>
            ))}
          </div>
          <Textarea name={`note:${it.id}`} defaultValue={it.comment ?? ""} rows={2} placeholder="Comment (optional)" aria-label={`Comment on ${it.kpiName}`} className="mt-3" />
        </fieldset>
      ))}
      <FormField label={side === "self" ? "Overall self assessment" : "Overall feedback"} name="comment">
        <Textarea id="comment" name="comment" defaultValue={comment ?? ""} rows={4} />
      </FormField>
    </ActionForm>
  );
}
