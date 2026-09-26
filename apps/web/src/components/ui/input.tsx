import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "flex h-11 w-full rounded-xl bg-white px-3.5 py-2 text-[15px] text-ink shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-inset ring-slate-200 transition-[box-shadow] duration-150 placeholder:text-slate-400 hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:ring-red-500 sm:h-10 sm:text-sm";

export function Input({ className, type = "text", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "h-auto min-h-[88px] resize-y py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  // ponytail: native select. Works on every phone, zero JS. Swap for a combobox only if a list gets long.
  return (
    <select className={cn(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2.5 text-sm text-slate-700 select-none sm:min-h-0">
      <input type="checkbox" className={cn("size-[18px] rounded-md border-slate-300 accent-brand-500 focus:ring-brand-500", className)} {...props} />
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
