import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,box-shadow,transform,color,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-brand-400 to-brand-500 text-white shadow-[0_1px_2px_rgb(0_82_255/0.3),inset_0_1px_0_rgb(255_255_255/0.2)] hover:from-brand-500 hover:to-brand-600 hover:shadow-[0_6px_16px_-6px_rgb(0_82_255/0.55)]",
        secondary: "bg-white text-ink ring-1 ring-inset ring-slate-200 shadow-card hover:bg-slate-50 hover:ring-slate-300",
        ghost: "text-slate-700 hover:bg-slate-900/5",
        destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
        success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
