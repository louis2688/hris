import type { Metadata } from "next";
import { leaveListQuerySchema } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { employeeOptions } from "@/server/services/employees";
import { getBalances, listLeaveRequests, listLeaveTypes } from "@/server/services/leave";
import { holidayDatesFor } from "@/server/services/org";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { BalanceCards, LeaveRequestList } from "@/components/leave-widgets";
import { RequestLeaveDialog } from "@/components/leave-request-form";

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
  const [types, balances, nextYearBalances, requests, holidays, employees] = await Promise.all([
    listLeaveTypes(true),
    user.employeeId ? getBalances(user.employeeId, year) : Promise.resolve([]),
    user.employeeId ? getBalances(user.employeeId, year + 1) : Promise.resolve([]),
    user.employeeId ? listLeaveRequests(leaveListQuerySchema.parse({ employeeId: user.employeeId, pageSize: 100 }), null) : Promise.resolve({ items: [] }),
    holidayDatesFor(user.employeeId, new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)), new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1))),
    staff ? employeeOptions() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="My Leave"
        description={`Balances and requests for ${year}`}
        actions={
          <RequestLeaveDialog
            types={types.map((t) => ({ id: t.id, name: t.name, allowHalfDay: t.allowHalfDay, requiresApproval: t.requiresApproval, isPaid: t.isPaid }))}
            balances={sp.employeeId ? [] : [...balances, ...nextYearBalances]}
            holidays={holidays}
            employees={employees ? employees.map((e) => ({ id: e.id, name: `${e.preferredName ?? e.firstName} ${e.lastName} (${e.employeeCode})` })) : undefined}
            defaultEmployeeId={sp.employeeId ?? user.employeeId ?? undefined}
          />
        }
      />
      <div className="space-y-6">
        {user.employeeId ? (
          <>
            <BalanceCards balances={balances} />
            <LeaveRequestList items={requests.items} showEmployee={false} title="My requests" emptyText="You have not requested any leave yet." />
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
