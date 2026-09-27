import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-card ring-1 ring-hairline", className)} {...props} />;
}

export function CardHeader({ className, title, description, action }: { className?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function Badge({ className, tone = "slate", children }: { className?: string; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet"; children: React.ReactNode }) {
  const tones = {
    // warm, desaturated tones that sit on cream; text/bg pairs clear WCAG AA
    slate: "bg-canvas text-ink ring-1 ring-inset ring-hairline",
    green: "bg-tone-green-bg text-tone-green-fg",
    amber: "bg-tone-amber-bg text-tone-amber-fg",
    red: "bg-tone-red-bg text-tone-red-fg",
    blue: "bg-tone-blue-bg text-tone-blue-fg",
    violet: "bg-tone-violet-bg text-tone-violet-fg",
  };
  const dot = { slate: "bg-slate-400", green: "bg-[#2b9a66]", amber: "bg-[#d4940f]", red: "bg-[#d4402b]", blue: "bg-[#5577a6]", violet: "bg-[#8166ad]" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      <span className={cn("size-1.5 rounded-full", dot[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-bone text-slate-500">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 7 12 3 4 7l8 4 8-4Z" />
          <path d="M4 7v10l8 4 8-4V7" />
          <path d="M12 11v10" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[34px]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{label}</p>
          <p className="mt-1.5 font-display text-3xl font-bold leading-none tracking-[-0.02em] text-ink tabular-nums">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bone text-ink [&_svg]:size-5">{icon}</div> : null}
      </div>
    </Card>
  );
}
