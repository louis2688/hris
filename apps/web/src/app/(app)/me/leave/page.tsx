import type { Metadata } from "next";
import { DEFAULT_TIMEZONE, leaveListQuerySchema, zonedParts } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { employeeOptions } from "@/server/services/employees";
import { blocksFor, getBalances, listLeaveRequests, listLeaveTypes } from "@/server/services/leave";
import { holidayDatesFor } from "@/server/services/org";
import { compOffEligible, myCredits } from "@/server/services/timeoff";
import { cancelCreditAction } from "@/server/actions/timeoff";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { BalanceCards, LeaveRequestList } from "@/components/leave-widgets";
import { RequestLeaveDialog } from "@/components/leave-request-form";
import { ActButton } from "@/components/timeoff-ui";
import { fmtDate, fmtDays } from "@/lib/utils";
import { peso, RequestStatusBadge } from "../../requests/_ui/shared";
import { CompOffDialog, EncashDialog } from "./credits";

export const metadata: Metadata = { title: "My Leave" };

export default async function MyLeavePage({ searchParams }: { searchParams: Promise<{ year?: string; employeeId?: string }> }) {
  const user = await requireSession();
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getUTCFullYear();
  const staff = isStaff(user);

  if (!user.employeeId && !staff) {
    return (
      <Card>
        <EmptyState title="No employee profile linked" description="Ask HR to link your login to an employee record." />
      </Card>
    );
  }

  const now = new Date();
  const today = new Date(zonedParts(now, DEFAULT_TIMEZONE).date);
  const me = user.employeeId;
  const [types, balances, nextYearBalances, requests, holidays, employees, blocks, eligible, credits] = await Promise.all([
    listLeaveTypes(true),
    me ? getBalances(me, year) : Promise.resolve([]),
    me ? getBalances(me, year + 1) : Promise.resolve([]),
    me ? listLeaveRequests(leaveListQuerySchema.parse({ employeeId: me, pageSize: 100 }), null) : Promise.resolve({ items: [] }),
    holidayDatesFor(me, new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)), new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1))),
    staff ? employeeOptions() : Promise.resolve(null),
    blocksFor(me, today),
    me ? compOffEligible(me) : Promise.resolve([]),
    me ? myCredits(me) : Promise.resolve({ compOffs: [], encashments: [] }),
  ]);
  const thisYear = me && year === now.getUTCFullYear() ? balances : me ? await getBalances(me, now.getUTCFullYear()) : [];
  const creditRows = [
    ...credits.compOffs.map((c) => ({ id: c.id, kind: "compoff" as const, at: c.createdAt, title: `Comp-off +${fmtDays(c.days.toString())} ${c.leaveType.name}`, meta: `Worked ${fmtDate(c.workDate, "EEE d MMM")} · ${c.reason}`, status: c.status })),
    ...credits.encashments.map((e) => ({
      id: e.id,
      kind: "encashment" as const,
      at: e.createdAt,
      title: `Encash ${fmtDays(e.days.toString())} ${e.leaveType.name}`,
      meta: `${e.status === "APPROVED" ? "Approved - added to payroll" : "Estimated"} ${peso(e.amount)}`,
      status: e.status,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader
        title="My Leave"
        description={`Balances and requests for ${year}`}
        actions={
          <>
            {me ? (
              <>
                <CompOffDialog eligible={eligible} types={types.filter((t) => t.isCompensatory).map((t) => ({ id: t.id, name: t.name }))} />
                <EncashDialog types={thisYear.filter((b) => types.find((t) => t.id === b.leaveTypeId)?.allowEncashment && b.available > 0).map((b) => ({ id: b.leaveTypeId, name: b.leaveTypeName, available: b.available }))} />
              </>
            ) : null}
            <RequestLeaveDialog
              types={types.map((t) => ({ id: t.id, name: t.name, allowHalfDay: t.allowHalfDay, requiresApproval: t.requiresApproval, isPaid: t.isPaid }))}
              balances={sp.employeeId ? [] : [...balances, ...nextYearBalances]}
              holidays={holidays}
              employees={employees ? employees.map((e) => ({ id: e.id, name: `${e.preferredName ?? e.firstName} ${e.lastName} (${e.employeeCode})` })) : undefined}
              defaultEmployeeId={sp.employeeId ?? user.employeeId ?? undefined}
              blocks={staff ? [] : blocks.map((b) => ({ name: b.name, from: b.from.toISOString().slice(0, 10), to: b.to.toISOString().slice(0, 10) }))}
            />
          </>
        }
      />
      <div className="space-y-6">
        {me ? (
          <>
            <BalanceCards balances={balances} />
            <LeaveRequestList items={requests.items} showEmployee={false} title="My requests" emptyText="You have not requested any leave yet." />
            {creditRows.length ? (
              <Card>
                <CardHeader title="Comp-off and encashment" />
                <ul className="divide-y divide-slate-100" aria-label="Comp-off and encashment">
                  {creditRows.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-[12rem] flex-1 text-sm">
                        <p className="font-medium text-ink">{c.title}</p>
                        <p className="truncate text-xs text-slate-500">{c.meta}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <RequestStatusBadge status={c.status} />
                        {c.status === "PENDING" ? <ActButton action={cancelCreditAction.bind(null, c.kind, c.id)}>Withdraw</ActButton> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : (
          <Card>
            <EmptyState title="Your account has no employee record" description="You can still file leave on behalf of employees using the button above." />
          </Card>
        )}
      </div>
    </>
  );
}
