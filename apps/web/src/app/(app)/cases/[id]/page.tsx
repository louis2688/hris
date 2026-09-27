import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Lock, Printer } from "lucide-react";
import { CASE_TYPE_LABELS, NTE_MIN_DAYS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { getCase } from "@/server/services/cases";
import { listForCase } from "@/server/services/documents";
import { manilaToday } from "@/server/services/onboarding";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { fmtDate, fullName } from "@/lib/utils";
import { CaseBadges } from "../badges";
import { CaseDocUpload, CloseCaseForm, DecisionForm, HearingForm, IssueNteForm } from "../client";

export const metadata: Metadata = { title: "Case" };

const ACTIONS: Record<string, string> = {
  created: "Case opened",
  "nte.issued": "Notice to Explain issued",
  "explanation.received": "Explanation received",
  "hearing.scheduled": "Hearing scheduled",
  decision: "Notice of Decision issued",
  closed: "Case closed",
  "document.added": "File attached",
};
const dt = (d: Date) => d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-hairline px-5 py-4 first:border-t-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{title}</p>
      <div className="whitespace-pre-wrap text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await gate("ADMIN", "HR");
  const { id } = await params;
  const c = await getCase(user, id).catch(() => notFound());
  const docs = await listForCase(id);
  const minDue = new Date(manilaToday().getTime() + NTE_MIN_DAYS * 86_400_000).toISOString().slice(0, 10);
  const overdue = c.status === "NTE_ISSUED" && !!c.nteDueAt && c.nteDueAt < new Date();
  const decided = c.status === "DECISION" || c.status === "CLOSED";

  const next =
    c.status === "OPEN" ? (
      <>
        <CardHeader title="Issue Notice to Explain" description="First notice. The employee gets at least 5 calendar days to answer in writing." />
        <CardBody>
          <IssueNteForm id={c.id} minDue={minDue} />
          <div className="mt-6 border-t border-hairline pt-4">
            <p className="mb-2 text-sm text-slate-600">No basis to proceed? Close the case without a notice.</p>
            <CloseCaseForm id={c.id} />
          </div>
        </CardBody>
      </>
    ) : c.status === "NTE_ISSUED" ? (
      <>
        <CardHeader title="Waiting for the explanation" description={`Due ${c.nteDueAt ? dt(c.nteDueAt) : ""}. The employee answers from My Info.`} />
        {overdue ? (
          <CardBody>
            <p className="mb-4 text-sm text-slate-600">The deadline passed without an answer. You may decide on the evidence on hand.</p>
            <DecisionForm id={c.id} />
          </CardBody>
        ) : null}
      </>
    ) : c.status === "EXPLANATION_RECEIVED" || c.status === "HEARING" ? (
      <>
        <CardHeader title="Hearing or decision" description="A hearing is optional unless the employee asks for one or facts are disputed." />
        <CardBody className="space-y-6">
          <HearingForm id={c.id} />
          <div className="border-t border-hairline pt-4">
            <DecisionForm id={c.id} />
          </div>
        </CardBody>
      </>
    ) : c.status === "DECISION" ? (
      <>
        <CardHeader title="Close the case" description="After the Notice of Decision is served and any sanction is carried out." />
        <CardBody>
          <CloseCaseForm id={c.id} />
        </CardBody>
      </>
    ) : null;

  return (
    <>
      <Link href="/cases" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft className="size-4" /> Cases
      </Link>
      <PageHeader
        title={c.title}
        description={`${fullName(c.employee)} · ${c.employee.employeeCode}${c.employee.jobTitle ? ` · ${c.employee.jobTitle.name}` : ""} · ${CASE_TYPE_LABELS[c.type]} · Opened ${fmtDate(c.createdAt)}`}
        actions={
          <>
            {c.confidential ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <Lock className="size-3.5" /> Confidential
              </span>
            ) : null}
            <CaseBadges status={c.status} nteDueAt={c.nteDueAt} />
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <Section title="What happened">{c.description}</Section>
            {c.nteIssuedAt ? (
              <Section title={`Notice to Explain · ${fmtDate(c.nteIssuedAt)}`}>
                {c.nteText}
                <span className="mt-2 block text-slate-500">Explanation due {c.nteDueAt ? dt(c.nteDueAt) : ""}</span>
              </Section>
            ) : null}
            {c.explanation ? <Section title="Employee's explanation">{c.explanation}</Section> : null}
            {c.hearingAt ? <Section title="Hearing">{dt(c.hearingAt)}</Section> : null}
            {decided && c.decision ? (
              <Section title={`Decision · ${c.sanction ?? ""}`}>{c.decision}</Section>
            ) : null}
            {c.nteIssuedAt ? (
              <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-4">
                <Link href={`/cases/${c.id}/letter/nte`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <Printer /> NTE letter
                </Link>
                {decided ? (
                  <Link href={`/cases/${c.id}/letter/decision`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    <Printer /> Notice of Decision
                  </Link>
                ) : null}
              </div>
            ) : null}
          </Card>

          {next ? <Card>{next}</Card> : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Files" description="Evidence and signed notices. Never shown to the employee." />
            {docs.length ? (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <FileText className="size-5 shrink-0 text-slate-400" aria-hidden />
                    <div className="min-w-0">
                      <a href={`/api/v1/documents/${d.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                        {d.name}
                      </a>
                      <p className="text-xs text-slate-500">{fmtDate(d.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {c.status !== "CLOSED" ? (
              <CardBody className={docs.length ? "border-t border-hairline" : undefined}>
                <CaseDocUpload id={c.id} />
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <ol className="px-5 py-4">
              {c.events.map((ev, i) => {
                const who = ev.actor?.employee ? fullName(ev.actor.employee) : (ev.actor?.email ?? "System");
                return (
                  <li key={ev.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < c.events.length - 1 ? <span className="absolute left-[4px] top-4 h-full w-px bg-hairline" aria-hidden /> : null}
                    <span className="relative mt-1.5 size-[9px] shrink-0 rounded-full bg-ink ring-4 ring-card" aria-hidden />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">{ACTIONS[ev.action] ?? ev.action}</p>
                      <p className="text-xs text-slate-500">
                        {dt(ev.createdAt)} · {who}
                      </p>
                      {ev.note && ev.action !== "nte.issued" ? <p className="mt-0.5 text-slate-600">{ev.note}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
