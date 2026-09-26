import Link from "next/link";
import type { LeaveBalance } from "@hris/shared";
import type { LeaveRequestRow } from "@/server/services/leave";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { LeaveStatusBadge, LeaveTypeDot } from "@/components/status-badge";
import { fmtDate, fmtDays, fullName } from "@/lib/utils";

export function BalanceCards({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) return <p className="text-sm text-slate-500">No leave types configured yet.</p>;
  return (
    <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {balances.map((b) => {
        const total = b.entitled + b.carriedOver + b.adjustment;
        const pct = total > 0 ? Math.min(100, Math.round(((b.used + b.pending) / total) * 100)) : 0;
        return (
          <Card key={b.leaveTypeId} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">
                  <LeaveTypeDot color={b.color} name={b.leaveTypeName} />
                </p>
                {total > 0 ? (
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {b.available}
                    <span className="ml-1 text-sm font-normal text-slate-500">of {total} left</span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No fixed allocation</p>
                )}
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: b.color }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {b.used} used · {b.pending} pending
              {b.carriedOver ? ` · ${b.carriedOver} carried over` : ""}
              {b.adjustment ? ` · ${b.adjustment > 0 ? "+" : ""}${b.adjustment} adj.` : ""}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

export function LeaveRequestList({ items, showEmployee = true, title, emptyText = "No leave requests." }: { items: LeaveRequestRow[]; showEmployee?: boolean; title?: string; emptyText?: string }) {
  return (
    <Card>
      {title ? <CardHeader title={title} /> : null}
      {items.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/leave/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                {showEmployee ? <Avatar first={r.employee.firstName} last={r.employee.lastName} src={r.employee.avatarUrl} /> : <span className="size-9 shrink-0 rounded-full" style={{ backgroundColor: r.leaveType.color + "22", boxShadow: `inset 0 0 0 2px ${r.leaveType.color}` }} aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {showEmployee ? fullName(r.employee) : r.leaveType.name}
                    {showEmployee ? <span className="ml-2 font-normal text-slate-500">{r.leaveType.name}</span> : null}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {fmtDate(r.startDate)}
                    {r.startDate.getTime() !== r.endDate.getTime() ? ` to ${fmtDate(r.endDate)}` : ""} · {fmtDays(r.totalDays.toString())}
                    {r.startDayPart !== "FULL" || r.endDayPart !== "FULL" ? " · half day" : ""}
                  </p>
                </div>
                <LeaveStatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
