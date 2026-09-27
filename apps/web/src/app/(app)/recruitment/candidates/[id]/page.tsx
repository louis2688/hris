import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RECOMMENDATIONS, RECOMMENDATION_LABELS, RECOMMENDATION_TONE, summarizeFeedback, type Recommendation } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listForCandidate } from "@/server/services/documents";
import { DocumentsCard } from "@/components/documents-card";
import { employeeOptions } from "@/server/services/employees";
import { listDepartments, listJobTitles } from "@/server/services/org";
import { allowedStages, canViewCandidate, getCandidate, getCriteria, listVacancies } from "@/server/services/recruitment";
import { listOffers, offerLink, termsOf } from "@/server/services/offers";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { StageBadge } from "@/components/stage-badge";
import { DL } from "@/components/profile";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { aiProvider } from "@/server/ai";
import { parseScreening } from "@/server/services/screening";
import { CandidateActions, Interviews } from "./client";
import { AiScreeningCard } from "./ai-screening";
import { Offers } from "./offers";
import type { FeedbackRow } from "./scorecard";

export const metadata: Metadata = { title: "Candidate" };
// AI screening server actions run under this route; a PDF screen can take 30-60s.
export const maxDuration = 90;

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await gate("ADMIN", "HR", "MANAGER", "EMPLOYEE");
  const { id } = await params;
  // Staff see everything; an assigned interviewer sees a scorecard-only view.
  if (!(await canViewCandidate(user, id))) redirect("/forbidden");
  const staff = isStaff(user);
  const c = await getCandidate(id).catch(() => null);
  if (!c) notFound();
  const [vacancies, people, docs, offers, criteria, jobTitles, departments] = await Promise.all([
    staff ? listVacancies() : [],
    staff ? employeeOptions() : [],
    staff ? listForCandidate(user, id) : [],
    staff ? listOffers(id) : [],
    getCriteria(),
    staff ? listJobTitles() : [],
    staff ? listDepartments() : [],
  ]);
  const peopleOpts = people.map((p) => ({ id: p.id, name: fullName(p) }));
  const accepted = offers.find((o) => o.status === "ACCEPTED");

  const interviews = c.interviews.map((i) => ({
    id: i.id,
    title: i.title,
    round: i.round,
    scheduledAt: i.scheduledAt.toISOString(),
    interviewerId: i.interviewerId,
    interviewer: i.interviewer ? fullName(i.interviewer) : null,
    location: i.location,
    result: i.result,
    notes: i.notes,
    // Interviewers only see their own scorecards, so they aren't anchored by others.
    feedback: i.feedback
      .filter((f) => staff || f.interviewerId === user.employeeId)
      .map((f): FeedbackRow => ({ id: f.id, interviewerId: f.interviewerId, interviewer: fullName(f.interviewer), scores: f.scores as Record<string, number>, rating: f.rating, recommendation: f.recommendation, comments: f.comments, createdAt: f.createdAt.toISOString() })),
  }));
  const allFeedback = interviews.flatMap((i) => i.feedback);
  const summary = summarizeFeedback(allFeedback, criteria);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 text-sm">
        {staff ? (
          <Link href="/recruitment" className="text-slate-500 hover:text-brand-700">
            Recruitment
          </Link>
        ) : (
          <span className="text-slate-500">Interview</span>
        )}
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">
          {c.firstName} {c.lastName}
        </span>
      </p>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        description={`${c.vacancy?.title ?? "No vacancy"} · applied ${fmtDate(c.appliedAt)}`}
        actions={
          staff ? (
            <CandidateActions
              id={c.id}
              stage={c.stage}
              next={allowedStages(c.stage)}
              initial={c}
              vacancies={vacancies.map((v) => ({ id: v.id, name: v.title }))}
              people={peopleOpts}
              offer={accepted ? { startDate: accepted.startDate.toISOString().slice(0, 10), summary: `${accepted.jobTitle?.name ?? "Role"}, ${php.format(Number(accepted.basicPay))}${accepted.payType === "DAILY" ? "/day" : "/month"}, starts ${fmtDate(accepted.startDate)}` } : null}
            />
          ) : (
            <StageBadge stage={c.stage} />
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" action={staff ? <StageBadge stage={c.stage} /> : null} />
            <CardBody>
              <DL
                items={[
                  ...(staff
                    ? ([
                        ["Email", <a key="e" href={`mailto:${c.email}`} className="text-brand-700 hover:underline">{c.email}</a>],
                        ["Phone", c.phone ? <a key="p" href={`tel:${c.phone}`}>{c.phone}</a> : null],
                        ["Source", c.source],
                        ["Resume", c.resumeUrl ? <a key="r" href={c.resumeUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open</a> : null],
                      ] as [string, React.ReactNode][])
                    : []),
                  ["Vacancy", c.vacancy ? (staff ? <Link key="v" href={`/recruitment/vacancies/${c.vacancy.id}`} className="text-brand-700 hover:underline">{c.vacancy.title}</Link> : c.vacancy.title) : null],
                  ["Referred by", c.referrer ? (staff ? <Link key="rf" href={`/employees/${c.referrer.id}`} className="text-brand-700 hover:underline">{fullName(c.referrer)} ({c.referrer.employeeCode})</Link> : fullName(c.referrer)) : null],
                  ...(staff
                    ? ([
                        ["Employee record", c.hiredEmployee ? <Link key="h" href={`/employees/${c.hiredEmployee.id}`} className="text-brand-700 hover:underline">{c.hiredEmployee.employeeCode}</Link> : null],
                        ["Privacy consent", c.consentAt ? `Given ${fmtDateTime(c.consentAt)}` : null],
                      ] as [string, React.ReactNode][])
                    : []),
                ]}
              />
              {staff && c.notes ? <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{c.notes}</p> : null}
            </CardBody>
          </Card>
          {staff ? (
            <Offers
              candidateId={c.id}
              canCreate={["SHORTLISTED", "INTERVIEW", "OFFERED"].includes(c.stage)}
              hired={c.stage === "HIRED"}
              defaults={{ jobTitleId: c.vacancy?.jobTitleId ?? null, departmentId: c.vacancy?.departmentId ?? null }}
              jobTitles={jobTitles.map((j) => ({ id: j.id, name: j.name }))}
              departments={departments.map((d) => ({ id: d.id, name: d.name }))}
              offers={offers.map((o) => ({
                id: o.id,
                status: o.status,
                jobTitleId: o.jobTitleId,
                departmentId: o.departmentId,
                jobTitle: o.jobTitle?.name ?? null,
                department: o.department?.name ?? null,
                employmentType: o.employmentType,
                payType: o.payType,
                basicPay: Number(o.basicPay),
                allowance: Number(o.allowance),
                startDate: o.startDate.toISOString(),
                expiresAt: o.expiresAt?.toISOString() ?? null,
                sentAt: o.sentAt?.toISOString() ?? null,
                respondedAt: o.respondedAt?.toISOString() ?? null,
                signatureName: o.signatureName,
                declineReason: o.declineReason,
                terms: termsOf(o),
                link: offerLink(o),
              }))}
            />
          ) : null}
          {staff ? <DocumentsCard docs={docs} candidateId={c.id} categories={["RESUME", "CERTIFICATE", "ID", "CONTRACT", "OTHER"]} description="Resume, certificates and other files" /> : null}
          <Interviews
            candidateId={c.id}
            closed={c.stage === "HIRED" || c.stage === "REJECTED" || c.stage === "WITHDRAWN"}
            people={peopleOpts}
            canManage={staff}
            me={user.employeeId}
            criteria={criteria}
            interviews={staff ? interviews : interviews.filter((i) => i.interviewerId === user.employeeId)}
          />
        </div>
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader title="Scorecard" description={summary.count ? `${summary.count} submission${summary.count === 1 ? "" : "s"}${staff ? "" : " (yours)"}` : undefined} />
            {summary.count === 0 ? (
              <EmptyState title="No scorecards yet" description="Interviewers submit one per interview." />
            ) : (
              <CardBody className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-4xl font-bold tabular-nums tracking-[-0.02em]">{summary.rating?.toFixed(1)}</span>
                  <span className="text-sm text-slate-500">/ 5 overall</span>
                </div>
                <ul className="space-y-2.5" aria-label="Average per criterion">
                  {summary.perCriterion.map((p) => (
                    <li key={p.criterion}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700">{p.criterion}</span>
                        <span className="font-semibold tabular-nums">{p.avg.toFixed(1)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-bone" aria-hidden>
                        <div className="h-full rounded-full bg-ink" style={{ width: `${(p.avg / 5) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-4" aria-label="Recommendations">
                  {RECOMMENDATIONS.filter((r) => summary.counts[r]).map((r: Recommendation) => (
                    <Badge key={r} tone={RECOMMENDATION_TONE[r]}>
                      {RECOMMENDATION_LABELS[r]} · {summary.counts[r]}
                    </Badge>
                  ))}
                </div>
              </CardBody>
            )}
          </Card>
          {staff ? <AiScreeningCard candidateId={c.id} result={parseScreening(c.aiSummary)} screenedAt={c.aiScreenedAt?.toISOString() ?? null} configured={!!aiProvider()} /> : null}
          {staff ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
