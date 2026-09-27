import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, EyeOff, Gauge, Percent, Users } from "lucide-react";
import { K_ANON_MIN, QUESTION_TYPE_LABELS, type QuestionResult } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { closeSurveyAction, deleteSurveyAction, publishSurveyAction } from "@/server/actions/growth";
import { surveyResults } from "@/server/services/surveys";
import { ConfirmButton } from "@/components/action-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, fmtDate } from "@/lib/utils";
import { SurveyStatusBadge } from "../../status";

export const metadata: Metadata = { title: "Survey results" };

const signed = (n: number | null) => (n == null ? "-" : n > 0 ? `+${n}` : String(n));

/** Horizontal CSS bars: one row per bucket. */
function Bars({ rows, tone = (_: number) => "bg-ink" }: { rows: { label: string; count: number }[]; tone?: (i: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(2rem,auto)_1fr_4.5rem] items-center gap-3 text-sm">
          <span className="text-slate-600 tabular-nums">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className={cn("block h-full rounded-full", tone(i))} style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums text-slate-500">
            {r.count} · {Math.round((r.count / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function Result({ r }: { r: QuestionResult }) {
  if (!r.count) return <p className="text-sm text-slate-500">No answers yet.</p>;
  if (r.type === "rating")
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Average <span className="font-display text-2xl font-bold text-ink">{r.average}</span> / 5
        </p>
        <Bars rows={r.distribution.map((count, i) => ({ label: String(i + 1), count }))} />
      </div>
    );
  if (r.type === "nps")
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          eNPS <span className="font-display text-2xl font-bold text-ink">{signed(r.enps)}</span>
          <span className="ml-2">· average {r.average} / 10</span>
        </p>
        <Bars rows={r.distribution.map((count, i) => ({ label: String(i), count }))} tone={(i) => (i >= 9 ? "bg-tone-green-fg" : i >= 7 ? "bg-slate-400" : "bg-tone-red-fg")} />
        <p className="text-xs text-slate-500">Promoters 9-10, passives 7-8, detractors 0-6. eNPS = % promoters - % detractors.</p>
      </div>
    );
  if (r.type === "choice") return <Bars rows={r.counts.map((c) => ({ label: c.option, count: c.count }))} />;
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
      {r.answers.map((a, i) => (
        <li key={i} className="whitespace-pre-line rounded-xl bg-bone px-3.5 py-2.5 text-sm text-slate-700">
          {a}
        </li>
      ))}
    </ul>
  );
}

export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const res = await surveyResults(id).catch(() => null);
  if (!res) notFound();
  const { survey: s, questions, departments } = res;
  const firstNps = questions.find((q) => q.result.type === "nps")?.result;
  const numeric = departments[0]?.metrics ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 text-sm">
        <Link href="/surveys" className="text-slate-500 hover:text-brand-700">Surveys</Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">Results</span>
      </p>
      <PageHeader
        title={s.title}
        description={`${s.opensAt ? fmtDate(s.opensAt) : "Opens on publish"} - ${s.closesAt ? fmtDate(s.closesAt) : "open-ended"}${s.anonymous ? " · anonymous" : " · named"}`}
        actions={
          <>
            <SurveyStatusBadge s={s} />
            {s.status === "DRAFT" ? (
              <>
                <Link href={`/surveys/${s.id}/edit`} className={buttonVariants({ variant: "secondary" })}>Edit</Link>
                <ConfirmButton action={deleteSurveyAction.bind(null, s.id)} confirm="Delete this draft?" variant="ghost">Delete</ConfirmButton>
                <ConfirmButton action={publishSurveyAction.bind(null, s.id)} confirm="Publish and notify the audience? Questions are locked after this." variant="brand">Publish</ConfirmButton>
              </>
            ) : null}
            {s.status === "OPEN" ? <ConfirmButton action={closeSurveyAction.bind(null, s.id)} confirm="Close this survey? Nobody can answer after this." variant="secondary">Close survey</ConfirmButton> : null}
            {s.status !== "DRAFT" ? (
              <a href={`/api/v1/surveys/${s.id}/export`} className={buttonVariants({ variant: "secondary" })}>
                <Download /> CSV
              </a>
            ) : null}
          </>
        }
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Responses" value={res.participations} hint={`of ${res.audience} in the audience`} icon={<Users />} />
          <Stat label="Response rate" value={`${res.responseRate}%`} hint={s.anonymous ? "Anonymous survey" : "Named survey"} icon={<Percent />} />
          {firstNps ? <Stat label="eNPS" value={signed(firstNps.type === "nps" ? firstNps.enps : null)} hint="-100 to +100" icon={<Gauge />} /> : null}
        </div>

        {questions.map(({ q, result }, i) => (
          <Card key={q.id}>
            <CardHeader title={`${i + 1}. ${q.text}`} description={`${QUESTION_TYPE_LABELS[q.type]} · ${result.count} answer${result.count === 1 ? "" : "s"}${s.anonymous && q.type === "text" ? " · shown in random order" : ""}`} />
            <CardBody>
              <Result r={result} />
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader
            title="By department"
            description={s.anonymous ? `Anonymous: only departments with ${K_ANON_MIN}+ responses are shown.` : "Named survey: all departments shown."}
          />
          {departments.length && numeric.length ? (
            <Table className="min-w-[480px]">
              <THead>
                <tr>
                  <TH>Department</TH>
                  <TH className="text-right">Responses</TH>
                  {numeric.map(({ q }) => (
                    <TH key={q.id} className="max-w-48 truncate text-right" title={q.text}>
                      {q.type === "nps" ? "eNPS" : "Avg"}: {q.text.length > 28 ? `${q.text.slice(0, 28)}...` : q.text}
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {departments.map((d) => (
                  <TR key={d.name}>
                    <TD className="font-medium text-ink">{d.name}</TD>
                    <TD className="text-right tabular-nums">{d.count}</TD>
                    {d.metrics.map(({ q, result }) => (
                      <TD key={q.id} className="text-right tabular-nums">
                        {result.type === "nps" ? signed(result.enps) : result.type === "rating" ? (result.average ?? "-") : "-"}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No breakdown to show" description={s.anonymous ? `No department has ${K_ANON_MIN} or more responses yet.` : undefined} />
          )}
          {res.hiddenDepartments ? (
            <p className="flex items-center gap-1.5 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <EyeOff className="size-3.5" aria-hidden /> {res.hiddenDepartments} department{res.hiddenDepartments === 1 ? "" : "s"} hidden to protect anonymity.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
