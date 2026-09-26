import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_TIMEZONE, minToHhmm, PUNCH_METHOD_LABELS, zonedParts } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { isStaff, visibleEmployeeIds } from "@/server/authz";
import { teamToday } from "@/server/services/attendance";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { fullName } from "@/lib/utils";
import { ManualPunchDialog } from "./manual-punch";

export const metadata: Metadata = { title: "Team attendance" };

export default async function TeamAttendancePage() {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const scope = await visibleEmployeeIds(user);
  const rows = await teamToday(isStaff(user) ? null : (scope ?? []).filter((id) => id !== user.employeeId));
  const t = (d: Date) => minToHhmm(zonedParts(d, DEFAULT_TIMEZONE).minutes);
  const inNow = rows.filter((r) => r.punches.length % 2 === 1 || r.punches.at(-1)?.direction === "IN").length;

  return (
    <>
      <PageHeader
        title="Team attendance"
        description={`${inNow} of ${rows.length} clocked in right now`}
        actions={<ManualPunchDialog employees={rows.map((r) => ({ id: r.id, name: `${fullName(r)} (${r.employeeCode})` }))} />}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nobody to show" description="Employees reporting to you appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const first = r.punches[0];
              const last = r.punches.at(-1);
              const inside = !!last && (last.direction ? last.direction === "IN" : r.punches.length % 2 === 1);
              return (
                <li key={r.id}>
                  <Link href={`/attendance?employeeId=${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                    <Avatar first={r.firstName} last={r.lastName} src={r.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(r)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {r.department?.name ?? "-"}
                        {first ? ` · in ${t(first.at)}` : ""}
                        {last && last !== first ? ` · last ${t(last.at)}` : ""}
                        {last ? ` · ${PUNCH_METHOD_LABELS[last.method]}` : ""}
                      </p>
                    </div>
                    {inside ? <Badge tone="green">In</Badge> : first ? <Badge tone="slate">Out</Badge> : <Badge tone="amber">No punch</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
