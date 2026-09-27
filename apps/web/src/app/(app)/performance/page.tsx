import type * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { allReviews, listCycles, myReviews, peerRequestsFor, teamReviews } from "@/server/services/performance";
import { TabNav } from "@/components/profile";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, fmtDate, fullName } from "@/lib/utils";
import { CycleBadge, ReviewBadge } from "./review-badge";
import { GoalsTab } from "./goals-tab";
import { OneOnOnesTab } from "./one-on-ones-tab";
import { PeerFeedbackButton } from "./peer-ui";

export const metadata: Metadata = { title: "Performance" };

const rating = (r: unknown) => (r == null ? "-" : Number(r).toFixed(2));

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ cycle?: string; tab?: string }> }) {
  const user = await requireSession();
  const sp = await searchParams;
  const tab = sp.tab === "goals" || sp.tab === "one-on-ones" ? sp.tab : "reviews";
  const header = (description: string, actions?: React.ReactNode) => (
    <>
      <PageHeader title="Performance" description={description} actions={actions} />
      <TabNav base="/performance" active={tab} tabs={[{ key: "reviews", label: "Reviews" }, { key: "goals", label: "Goals" }, { key: "one-on-ones", label: "1:1s" }]} />
    </>
  );
  if (tab === "goals") return (<>{header("Goals and key result areas")}<GoalsTab user={user} /></>);
  if (tab === "one-on-ones") return (<>{header("Regular 1:1s between managers and their reports")}<OneOnOnesTab user={user} /></>);
  return <ReviewsTab user={user} sp={sp} header={header} />;
}

async function ReviewsTab({ user, sp, header }: { user: Awaited<ReturnType<typeof requireSession>>; sp: { cycle?: string }; header: (d: string, a?: React.ReactNode) => React.ReactNode }) {
  const staff = isStaff(user);
  // Guess the cycle's reviews in the same wave as listCycles: ?cycle= if given, else every ACTIVE cycle (narrowed below).
  const [mine, todo, cycles, guessed, asks] = await Promise.all([
    user.employeeId ? myReviews(user.employeeId) : [],
    teamReviews(user),
    staff ? listCycles() : [],
    staff ? allReviews(sp.cycle ? { cycleId: sp.cycle } : { cycle: { status: "ACTIVE" } }) : [],
    user.employeeId ? peerRequestsFor(user.employeeId) : [],
  ]);
  const cycle = staff ? (cycles.find((c) => c.id === sp.cycle) ?? cycles.find((c) => c.status === "ACTIVE")) : undefined;
  // ponytail: an unknown ?cycle= id falls back to the active cycle with a second query.
  const all = !cycle ? [] : !sp.cycle || cycle.id === sp.cycle ? guessed.filter((r) => r.cycleId === cycle.id) : await allReviews({ cycleId: cycle.id });
  const waiting = todo.filter((r) => r.status === "MANAGER_REVIEW" && r.cycle.status === "ACTIVE").length;

  return (
    <>
      {header(
        waiting ? `${waiting} review${waiting > 1 ? "s" : ""} waiting for you` : "Reviews and KPIs",
        staff ? <Link href="/settings/review-cycles" className={buttonVariants({ variant: "secondary" })}>Manage cycles</Link> : null,
      )}
      <div className="space-y-6">
        {asks.length ? (
          <Card className="ring-tone-violet-fg/30">
            <CardHeader title="Feedback requested" description="Colleagues' managers asked for your view. Answer once per request." />
            <ul className="divide-y divide-slate-100">
              {asks.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar first={a.review.employee.firstName} last={a.review.employee.lastName} src={a.review.employee.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(a.review.employee)}</p>
                    <p className="text-xs text-slate-500">
                      {a.review.cycle.name} · due {fmtDate(a.review.cycle.dueDate)}
                    </p>
                  </div>
                  <PeerFeedbackButton id={a.id} forName={fullName(a.review.employee)} cycle={a.review.cycle.name} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {user.employeeId ? (
          <Card>
            <CardHeader title="My reviews" />
            {mine.length === 0 ? (
              <EmptyState title="No reviews yet" description="You will get a notification when a review cycle starts." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {mine.map((r) => (
                  <li key={r.id}>
                    <Link href={`/performance/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.cycle.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          Due {fmtDate(r.cycle.dueDate)}
                          {r.reviewer ? ` · reviewer ${fullName(r.reviewer)}` : ""}
                          {r.finalRating != null ? ` · final ${rating(r.finalRating)}` : ""}
                        </p>
                      </div>
                      <ReviewBadge status={r.status} />
                      <ChevronRight className="size-4 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {todo.length || user.role !== "EMPLOYEE" ? (
          <Card>
            <CardHeader title="Reviews to do" description="People you review. Your turn starts once they submit their self review." />
            {todo.length === 0 ? (
              <EmptyState title="Nothing to review" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {todo.map((r) => (
                  <li key={r.id}>
                    <Link href={`/performance/${r.id}`} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5", r.status === "MANAGER_REVIEW" && "bg-tone-violet-bg/40")}>
                      <Avatar first={r.employee.firstName} last={r.employee.lastName} src={r.employee.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName(r.employee)}</p>
                        <p className="truncate text-xs text-slate-500">
                          {r.cycle.name} · due {fmtDate(r.cycle.dueDate)}
                          {r.finalRating != null ? ` · final ${rating(r.finalRating)}` : ""}
                        </p>
                      </div>
                      <ReviewBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {staff ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="h-fit">
              <CardHeader title="Cycles" />
              {cycles.length === 0 ? (
                <EmptyState title="No cycles yet" action={<Link href="/settings/review-cycles" className={buttonVariants({ size: "sm", variant: "secondary" })}>Create one</Link>} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cycles.map((c) => (
                    <li key={c.id}>
                      <Link href={`/performance?cycle=${c.id}`} className={cn("block px-5 py-3 hover:bg-slate-50", cycle?.id === c.id && "bg-canvas")}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{c.name}</p>
                          <CycleBadge status={c.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {c.total ? `${c.byStatus.COMPLETED ?? 0}/${c.total} completed · ${c.byStatus.MANAGER_REVIEW ?? 0} with reviewer` : `${fmtDate(c.periodStart)} - ${fmtDate(c.periodEnd)}`}
                        </p>
                        {c.total ? (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-tone-green-fg" style={{ width: `${((c.byStatus.COMPLETED ?? 0) / c.total) * 100}%` }} />
                          </div>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title={cycle ? `All reviews - ${cycle.name}` : "All reviews"} />
              {all.length === 0 ? (
                <EmptyState title="No reviews" description={cycle?.status === "DRAFT" ? "Activate the cycle to create reviews." : undefined} />
              ) : (
                <Table className="min-w-[520px]">
                  <THead>
                    <tr>
                      <TH>Employee</TH>
                      <TH>Reviewer</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Rating</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {all.map((r) => (
                      <TR key={r.id}>
                        <TD className="font-medium text-ink">
                          <Link href={`/performance/${r.id}`} className="hover:text-brand-700">
                            {fullName(r.employee)}
                          </Link>
                        </TD>
                        <TD>{r.reviewer ? fullName(r.reviewer) : <span className="text-slate-500">HR</span>}</TD>
                        <TD>
                          <ReviewBadge status={r.status} />
                        </TD>
                        <TD className="text-right tabular-nums">{rating(r.finalRating)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
