"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const errs = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email" name="email" error={errs?.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" required autoFocus />
      </Field>
      <Field label="Password" name="password" error={errs?.password} required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state && !state.ok && !state.fieldErrors ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="brand" className="w-full" size="lg" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
