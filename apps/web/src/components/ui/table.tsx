import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table className={cn("w-full min-w-[640px] text-sm", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-bone text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600", className)} {...p} />
);
export const TBody = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn("divide-y divide-slate-100", className)} {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("transition-colors hover:bg-canvas", className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn("px-4 py-2.5 font-medium", className)} {...p} />;
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("px-4 py-3 align-middle text-slate-700", className)} {...p} />;

export function Pagination({ page, totalPages, total, makeHref }: { page: number; totalPages: number; total: number; makeHref: (page: number) => string }) {
  if (totalPages <= 1) return <p className="px-4 py-3 text-xs text-slate-500">{total} result{total === 1 ? "" : "s"}</p>;
  const btn = "rounded-full bg-card px-3.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-inset ring-hairline hover:bg-canvas aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-500">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-2">
        <Link href={makeHref(page - 1)} aria-disabled={page <= 1} className={btn}>
          Previous
        </Link>
        <Link href={makeHref(page + 1)} aria-disabled={page >= totalPages} className={btn}>
          Next
        </Link>
      </div>
    </div>
  );
}
