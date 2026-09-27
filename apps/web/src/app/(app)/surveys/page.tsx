import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, EyeOff, Plus } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listSurveys, surveysForMe } from "@/server/services/surveys";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import { SurveyStatusBadge } from "./status";

export const metadata: Metadata = { title: "Surveys" };

export default async function SurveysPage() {
  const user = await requireSession();
  const staff = isStaff(user);
  const [mine, all] = await Promise.all([surveysForMe(user), staff ? listSurveys() : []]);
  const todo = mine.filter((s) => !s.answered).length;

  return (
    <>
      <PageHeader
        title="Surveys"
        description={todo ? `${todo} survey${todo === 1 ? "" : "s"} waiting for your answer` : "Pulse checks and eNPS"}
        actions={
          staff ? (
            <Link href="/surveys/new" className={buttonVariants({ variant: "brand" })}>
              <Plus /> New survey
            </Link>
          ) : null
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Open for you" />
          {mine.length ? (
            <ul className="divide-y divide-slate-100">
              {mine.map((s) => (
                <li key={s.id}>
                  <Link href={`/surveys/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bone text-ink" aria-hidden>
                      <ClipboardList className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{s.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {s.questions.length} question{s.questions.length === 1 ? "" : "s"}
                        {s.closesAt ? ` · closes ${fmtDate(s.closesAt)}` : ""}
                        {s.anonymous ? " · anonymous" : " · named"}
                      </p>
                    </div>
                    {s.answered ? <Badge tone="green">Answered</Badge> : <Badge tone="amber">To answer</Badge>}
                    <ChevronRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No open surveys" description="You will get a notification when HR opens one for you." />
          )}
        </Card>

        {staff ? (
          <Card>
            <CardHeader title="All surveys" description="Drafts, live and closed. Open one for results and CSV export." />
            {all.length ? (
              <Table className="min-w-[600px]">
                <THead>
                  <tr>
                    <TH>Survey</TH>
                    <TH>Window</TH>
                    <TH className="text-right">Responses</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {all.map((s) => (
                    <TR key={s.id}>
                      <TD>
                        <Link href={s.status === "DRAFT" ? `/surveys/${s.id}/edit` : `/surveys/${s.id}/results`} className="font-medium text-ink hover:text-brand-700">
                          {s.title}
                        </Link>
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          {s.anonymous ? <EyeOff className="size-3" aria-hidden /> : null}
                          {s.anonymous ? "Anonymous" : "Named"} · {s.questionCount} question{s.questionCount === 1 ? "" : "s"}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap text-xs">
                        {s.opensAt ? fmtDate(s.opensAt) : "On publish"} - {s.closesAt ? fmtDate(s.closesAt) : "open-ended"}
                      </TD>
                      <TD className="text-right tabular-nums">{s._count.participations}</TD>
                      <TD>
                        <SurveyStatusBadge s={s} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No surveys yet" action={<Link href="/surveys/new" className={buttonVariants({ size: "sm", variant: "secondary" })}>Create one</Link>} />
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
