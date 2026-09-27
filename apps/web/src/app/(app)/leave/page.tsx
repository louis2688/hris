import type { Metadata } from "next";
import Link from "next/link";
import { LEAVE_STATUSES, LEAVE_STATUS_LABELS, leaveListQuerySchema } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { isStaff, visibleEmployeeIds } from "@/server/authz";
import { listLeaveRequests, listLeaveTypes } from "@/server/services/leave";
import { departmentOptions } from "@/server/services/org";
import { creditsToDecide } from "@/server/services/timeoff";
import { decideCompOffAction, decideEncashmentAction } from "@/server/actions/timeoff";
import { DecideButtons } from "@/components/timeoff-ui";
import { Avatar } from "@/components/ui/avatar";
import { peso } from "../requests/_ui/shared";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/table";
import { LeaveRequestList } from "@/components/leave-widgets";
import { fmtDate, fmtDays, fullName, toSearchParams } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const raw = await searchParams;
  const q = leaveListQuerySchema.parse(raw);
  const scope = await visibleEmployeeIds(user);
  const [data, types, departments, credits] = await Promise.all([listLeaveRequests(q, scope), listLeaveTypes(), isStaff(user) ? departmentOptions() : Promise.resolve([]), creditsToDecide(user)]);
  const toDecide = [
    ...credits.compOffs.map((c) => ({ id: c.id, e: c.employee, title: `Comp-off +${fmtDays(c.days.toString())} ${c.leaveType.name}`, meta: `Worked ${fmtDate(c.workDate, "EEE d MMM")} · ${c.reason}`, action: decideCompOffAction.bind(null, c.id) })),
    ...credits.encashments.map((c) => ({ id: c.id, e: c.employee, title: `Encash ${fmtDays(c.days.toString())} ${c.leaveType.name}`, meta: `About ${peso(c.amount)} · adds a payroll earning`, action: decideEncashmentAction.bind(null, c.id) })),
  ];

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
      {toDecide.length ? (
        <Card className="mb-4">
          <CardHeader title="Comp-off and encashment to decide" description={`${toDecide.length} pending`} />
          <ul className="divide-y divide-slate-100" aria-label="Comp-off and encashment to decide">
            {toDecide.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar first={c.e.firstName} last={c.e.lastName} src={c.e.avatarUrl} />
                <div className="min-w-[12rem] flex-1 text-sm">
                  <p className="font-medium text-ink">
                    {fullName(c.e)} <span className="font-normal text-slate-500">{c.title}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">{c.meta}</p>
                </div>
                <DecideButtons action={c.action} name={`${fullName(c.e)} ${c.title}`} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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
