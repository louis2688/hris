"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { applyAction } from "@/server/actions/careers";
import { ActionForm, FormField } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { ValidateFirst } from "../validate-first";

export function ApplyForm({ slug, referralCode }: { slug: string; referralCode: string }) {
  const [done, setDone] = React.useState(false);
  if (done)
    return (
      <div className="py-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-tone-green-fg" aria-hidden />
        <p className="mt-3 font-display text-xl font-bold">Thank you for applying!</p>
        <p className="mt-1 text-sm text-ink-muted">We got your application. Our HR team reviews every resume and will contact you by email or phone if there's a fit.</p>
      </div>
    );
  return (
    <ValidateFirst>
    <ActionForm action={applyAction.bind(null, slug)} onSuccess={() => setDone(true)} submitLabel="Submit application" submitVariant="brand">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="First name" name="firstName" required>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </FormField>
        <FormField label="Last name" name="lastName" required>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </FormField>
      </div>
      <FormField label="Email" name="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField label="Mobile number" name="phone" required>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0917 123 4567" required />
      </FormField>
      <FormField label="Resume (PDF)" name="resume" required hint="PDF only, up to 5 MB">
        <input
          id="resume"
          name="resume"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full rounded-xl border border-dashed border-slate-300 bg-canvas px-3 py-3 text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-on-dark"
        />
      </FormField>
      <FormField label="Referred by (employee ID)" name="referralCode" hint="Optional. Ask your friend for their employee ID.">
        <Input id="referralCode" name="referralCode" defaultValue={referralCode} placeholder="EMP-0000" className="font-mono" />
      </FormField>
      {/* Honeypot: hidden from people and screen readers; bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <FormField label="Data privacy consent" name="consent" required>
        <label className="flex items-start gap-2.5 rounded-xl bg-bone p-3 text-xs leading-relaxed text-slate-700">
          <input id="consent" name="consent" type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-ink" required />
          <span>I consent to the collection and processing of my personal data for recruitment purposes, in accordance with the Data Privacy Act of 2012 (RA 10173). My data will be kept only as long as needed for hiring.</span>
        </label>
      </FormField>
    </ActionForm>
    </ValidateFirst>
  );
}
