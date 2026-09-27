import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { gate } from "@/server/auth/session";
import { listForCandidate } from "@/server/services/documents";
import { DocumentsCard } from "@/components/documents-card";
import { employeeOptions } from "@/server/services/employees";
import { allowedStages, getCandidate, listVacancies } from "@/server/services/recruitment";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { StageBadge } from "@/components/stage-badge";
import { DL } from "@/components/profile";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { aiProvider } from "@/server/ai";
import { parseScreening } from "@/server/services/screening";
import { CandidateActions, Interviews } from "./client";
import { AiScreeningCard } from "./ai-screening";

export const metadata: Metadata = { title: "Candidate" };
// AI screening server actions run under this route; a PDF screen can take 30-60s.
export const maxDuration = 90;

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await gate("ADMIN", "HR");
  const { id } = await params;
  const c = await getCandidate(id).catch(() => null);
  if (!c) notFound();
  const [vacancies, people, docs] = await Promise.all([listVacancies(), employeeOptions(), listForCandidate(user, id)]);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 text-sm">
        <Link href="/recruitment" className="text-slate-500 hover:text-brand-700">
          Recruitment
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">
          {c.firstName} {c.lastName}
        </span>
      </p>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        description={`${c.vacancy?.title ?? "No vacancy"} · applied ${fmtDate(c.appliedAt)}`}
        actions={
          <CandidateActions
            id={c.id}
            stage={c.stage}
            next={allowedStages(c.stage)}
            initial={c}
            vacancies={vacancies.map((v) => ({ id: v.id, name: v.title }))}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" action={<StageBadge stage={c.stage} />} />
            <CardBody>
              <DL
                items={[
                  ["Email", <a key="e" href={`mailto:${c.email}`} className="text-brand-700 hover:underline">{c.email}</a>],
                  ["Phone", c.phone ? <a key="p" href={`tel:${c.phone}`}>{c.phone}</a> : null],
                  ["Source", c.source],
                  ["Resume", c.resumeUrl ? <a key="r" href={c.resumeUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open</a> : null],
                  ["Vacancy", c.vacancy ? <Link key="v" href={`/recruitment/vacancies/${c.vacancy.id}`} className="text-brand-700 hover:underline">{c.vacancy.title}</Link> : null],
                  ["Employee record", c.hiredEmployee ? <Link key="h" href={`/employees/${c.hiredEmployee.id}`} className="text-brand-700 hover:underline">{c.hiredEmployee.employeeCode}</Link> : null],
                ]}
              />
              {c.notes ? <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{c.notes}</p> : null}
            </CardBody>
          </Card>
          <DocumentsCard docs={docs} candidateId={c.id} categories={["RESUME", "CERTIFICATE", "ID", "CONTRACT", "OTHER"]} description="Resume, certificates and other files" />
          <Interviews
            candidateId={c.id}
            closed={c.stage === "HIRED" || c.stage === "REJECTED" || c.stage === "WITHDRAWN"}
            people={people.map((p) => ({ id: p.id, name: fullName(p) }))}
            interviews={c.interviews.map((i) => ({ id: i.id, title: i.title, scheduledAt: i.scheduledAt.toISOString(), interviewer: i.interviewer ? fullName(i.interviewer) : null, location: i.location, result: i.result, notes: i.notes }))}
          />
        </div>
        <div className="space-y-6">
          <AiScreeningCard candidateId={c.id} result={parseScreening(c.aiSummary)} screenedAt={c.aiScreenedAt?.toISOString() ?? null} configured={!!aiProvider()} />
          <Card className="h-fit">
            <CardHeader title="History" />
            <ol className="divide-y divide-slate-100">
              {c.history.map((h) => (
                <li key={h.id} className="px-5 py-2.5 text-sm">
                  <p>{h.action.replace("candidate.", "").replace(/[._]/g, " ")}</p>
                  <p className="text-xs text-slate-500">
                    {h.actor?.email ?? "system"} · {fmtDateTime(h.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
