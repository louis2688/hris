import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,box-shadow,transform,color,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-on-dark hover:bg-slate-700",
        // ponytail: orange is scarce - one per screen (login submit, clock in/out).
        brand: "bg-brand-600 text-white hover:bg-brand-700",
        secondary: "bg-white text-ink ring-1 ring-inset ring-ink hover:bg-canvas",
        ghost: "text-ink hover:bg-ink/5",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        success: "bg-[#23845a] text-white hover:bg-[#1c6b49]",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8",
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
