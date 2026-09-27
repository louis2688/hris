"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { acceptOfferAction, declineOfferAction } from "@/server/actions/offers";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ValidateFirst } from "../../careers/validate-first";

export function Respond({ token, fullName }: { token: string; fullName: string }) {
  const [declining, setDeclining] = React.useState(false);
  const router = useRouter();
  const done = () => router.refresh();
  return (
    <section className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-hairline sm:p-8" aria-labelledby="respond-h">
      <h2 id="respond-h" className="font-display text-2xl font-bold tracking-[-0.02em]">
        {declining ? "Decline this offer" : "Accept this offer"}
      </h2>
      {declining ? (
        <ActionForm action={declineOfferAction.bind(null, token)} onSuccess={done} submitLabel="Decline offer" submitVariant="destructive" footer={<Button type="button" variant="ghost" onClick={() => setDeclining(false)}>Back</Button>} className="mt-4">
          <FormField label="Reason (optional)" name="reason" hint="Helps us improve. Only HR sees this.">
            <Textarea id="reason" name="reason" rows={3} />
          </FormField>
        </ActionForm>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            Type your full name as it appears on the letter (<span className="font-medium text-ink">{fullName}</span>) to sign electronically.
          </p>
          <ValidateFirst>
          <ActionForm
            action={acceptOfferAction.bind(null, token)}
            onSuccess={done}
            submitLabel="Accept offer"
            submitVariant="brand"
            footer={
              <Button type="button" variant="ghost" onClick={() => setDeclining(true)}>
                Decline
              </Button>
            }
            className="mt-4"
          >
            <FormField label="Full name" name="name" required>
              <Input id="name" name="name" autoComplete="name" required className="font-serif text-base" />
            </FormField>
            <FormField label="Agreement" name="agree" required>
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input id="agree" name="agree" type="checkbox" required className="mt-0.5 size-[18px] shrink-0 accent-ink" />
                <span>I accept the terms of this offer.</span>
              </label>
            </FormField>
          </ActionForm>
          </ValidateFirst>
        </>
      )}
    </section>
  );
}
