"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/_helpers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action<T> = (prev: ActionResult<T> | undefined, fd: FormData) => Promise<ActionResult<T>>;

const Ctx = React.createContext<{ fieldErrors?: Record<string, string[]>; pending: boolean }>({ pending: false });
export const useFormCtx = () => React.useContext(Ctx);

/**
 * Wraps a server action with useActionState. Shows toasts, exposes field errors to
 * <Field> children via context, optionally runs onSuccess / redirects.
 */
export function ActionForm<T>({
  action,
  children,
  className,
  submitLabel = "Save",
  submitVariant = "default",
  onSuccess,
  successHref,
  resetOnSuccess,
  hideSubmit,
  footer,
}: {
  action: Action<T>;
  children: React.ReactNode;
  className?: string;
  submitLabel?: string;
  submitVariant?: React.ComponentProps<typeof Button>["variant"];
  onSuccess?: (data: T) => void;
  successHref?: string | ((data: T) => string);
  resetOnSuccess?: boolean;
  hideSubmit?: boolean;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<ActionResult<T> | undefined>(undefined);

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state.data);
      if (successHref) router.push(typeof successHref === "function" ? successHref(state.data) : successHref);
    } else if (!state.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, onSuccess, successHref, resetOnSuccess, router]);

  return (
    <Ctx.Provider value={{ fieldErrors: state && !state.ok ? state.fieldErrors : undefined, pending }}>
      <form ref={formRef} action={formAction} className={cn("space-y-4", className)} noValidate>
        {children}
        {state && !state.ok && !state.fieldErrors ? (
          <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-100" role="alert">
            {state.error}
          </p>
        ) : null}
        {hideSubmit ? null : (
          <div className="flex items-center justify-end gap-2 pt-2">
            {footer}
            <Button type="submit" loading={pending} variant={submitVariant}>
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Ctx.Provider>
  );
}

/** Field that reads its error from the enclosing ActionForm. */
export function FormField({
  label,
  name,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { fieldErrors } = useFormCtx();
  const err = fieldErrors?.[name]?.[0];
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {err ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {err}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Button that calls a no-arg server action with confirm. */
export function ConfirmButton({
  action,
  confirm,
  children,
  variant = "destructive",
  size,
  className,
}: {
  action: () => Promise<ActionResult<unknown> | void>;
  confirm: string;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r && !r.ok) toast.error(r.error);
          else if (r?.ok && r.message) toast.success(r.message);
        });
      }}
    >
      {children}
    </Button>
  );
}
