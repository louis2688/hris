import type { Metadata } from "next";
import Link from "next/link";
import { LEAVE_STATUSES, LEAVE_STATUS_LABELS, leaveListQuerySchema } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { isStaff, visibleEmployeeIds } from "@/server/authz";
import { listLeaveRequests, listLeaveTypes } from "@/server/services/leave";
import { departmentOptions } from "@/server/services/org";
import { Card, PageHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/table";
import { LeaveRequestList } from "@/components/leave-widgets";
import { toSearchParams } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const raw = await searchParams;
  const q = leaveListQuerySchema.parse(raw);
  const scope = await visibleEmployeeIds(user);
  const [data, types, departments] = await Promise.all([listLeaveRequests(q, scope), listLeaveTypes(), isStaff(user) ? departmentOptions() : Promise.resolve([])]);

  return (
    <>
      <PageHeader
        title="Leave requests"
        description={isStaff(user) ? "All requests across the company" : "Requests from you and your team"}
        actions={
          <>
            <Link href="/leave/calendar" className={buttonVariants({ variant: "secondary" })}>
              Calendar
            </Link>
            {isStaff(user) ? (
              <Link href="/me/leave?new=1" className={buttonVariants()}>
                File on behalf
              </Link>
            ) : null}
          </>
        }
      />
      <Card className="mb-4">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[160px_1fr_1fr_140px_140px_auto]">
          <Select name="status" defaultValue={q.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            {LEAVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAVE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select name="leaveTypeId" defaultValue={q.leaveTypeId ?? ""} aria-label="Leave type">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {departments.length ? (
            <Select name="departmentId" defaultValue={q.departmentId ?? ""} aria-label="Department">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          ) : (
            <span />
          )}
          <Input type="date" name="from" defaultValue={q.from ?? ""} aria-label="From" />
          <Input type="date" name="to" defaultValue={q.to ?? ""} aria-label="To" />
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </Card>
      <LeaveRequestList items={data.items} emptyText="No requests match these filters." />
      <div className="mt-2 rounded-xl border border-slate-200 bg-card">
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} makeHref={(p) => `/leave${toSearchParams({ ...raw, page: p })}`} />
      </div>
    </>
  );
}
