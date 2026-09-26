import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-white shadow-card ring-1 ring-slate-900/[0.06]", className)} {...props} />;
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
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-brand-50 text-brand-700",
    violet: "bg-violet-50 text-violet-700",
  };
  const dot = { slate: "bg-slate-400", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", blue: "bg-brand-500", violet: "bg-violet-500" };
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
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
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
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
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
          <p className="mt-1.5 text-3xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&_svg]:size-5">{icon}</div> : null}
      </div>
    </Card>
  );
}
