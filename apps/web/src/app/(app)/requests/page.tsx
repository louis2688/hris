import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { listMine, pendingFor } from "@/server/services/requests";
import { Card, EmptyState } from "@/components/ui/card";
import { TabNav } from "@/components/profile";
import { toRows } from "./_ui/list-page";
import { KINDS, RequestList, RequestsHeader } from "./_ui/shared";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireSession();
  const approver = user.role !== "EMPLOYEE";
  const team = approver && ((await searchParams).tab === "team" || !user.employeeId);
  const [pending, mine] = await Promise.all([approver ? pendingFor(user) : null, user.employeeId && !team ? listMine(user.employeeId) : null]);
  const pendingCount = pending ? Object.values(pending).reduce((n, l) => n + l.length, 0) : 0;

  return (
    <>
      <RequestsHeader active="all" description="Overtime, certificates, expense claims and loans in one place" />
      {approver && user.employeeId ? <TabNav base="/requests" active={team ? "team" : "mine"} tabs={[{ key: "mine", label: "Mine" }, { key: "team", label: pendingCount ? `Team · ${pendingCount} pending` : "Team" }]} /> : null}

      {team ? (
        <RequestList rows={toRows(pending!, true)} title="Waiting for your decision" empty="You're all caught up." />
      ) : mine ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {KINDS.map(({ kind, short, blurb, icon: Icon }) => (
              <Link key={kind} href={`/requests/${kind}?new=${kind}`} className="group">
                <Card className="flex h-full flex-col gap-3 p-4 transition-shadow group-hover:shadow-float">
                  <span className="flex size-9 items-center justify-center rounded-full bg-bone text-ink" aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-sm font-semibold text-ink">
                      New {short.toLowerCase()} <ChevronRight className="size-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{blurb}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <RequestList rows={toRows(mine, false)} title="My requests" empty="You have not filed any requests yet." />
        </div>
      ) : (
        <Card>
          <EmptyState title="No employee profile linked" description="Ask HR to link your login to an employee record." />
        </Card>
      )}
    </>
  );
}
