import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "flex h-11 w-full rounded-full border border-hairline bg-card px-5 py-2 text-[15px] text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:cursor-not-allowed disabled:bg-bone disabled:text-slate-500 aria-invalid:border-red-500 sm:text-sm";

export function Input({ className, type = "text", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "h-auto min-h-[88px] resize-y rounded-xl px-4 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  // ponytail: native select. Works on every phone, zero JS. Swap for a combobox only if a list gets long.
  return (
    <select className={cn(inputClass, "select-chevron appearance-none pr-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2.5 text-sm text-slate-700 select-none sm:min-h-0">
      <input type="checkbox" className={cn("size-[18px] rounded-md border-slate-300 accent-ink", className)} {...props} />
      {label}
    </label>
  );
}

export function Label({ className, children, required, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-slate-700", className)} {...props}>
      {children}
      {required ? <span className="ml-0.5 text-red-500">*</span> : null}
    </label>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  name: string;
  error?: string[] | string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={className}>
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
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
