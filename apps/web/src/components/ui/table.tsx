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
  <thead className={cn("bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500", className)} {...p} />
);
export const TBody = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn("divide-y divide-slate-100", className)} {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("hover:bg-slate-50/60", className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn("px-4 py-2.5 font-medium", className)} {...p} />;
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("px-4 py-3 align-middle text-slate-700", className)} {...p} />;

export function Pagination({ page, totalPages, total, makeHref }: { page: number; totalPages: number; total: number; makeHref: (page: number) => string }) {
  if (totalPages <= 1) return <p className="px-4 py-3 text-xs text-slate-500">{total} result{total === 1 ? "" : "s"}</p>;
  const btn = "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-40";
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
