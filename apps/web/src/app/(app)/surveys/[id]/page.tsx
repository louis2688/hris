import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, EyeOff, UserRound } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { submitSurveyAction } from "@/server/actions/growth";
import { surveyToTake } from "@/server/services/surveys";
import { ActionForm, FormField } from "@/components/action-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";
import { RatingPills } from "../../performance/peer-ui";

export const metadata: Metadata = { title: "Survey" };

export default async function TakeSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const s = user.employeeId ? await surveyToTake(user, id).catch(() => null) : null;
  const results = isStaff(user) ? (
    <Link href={`/surveys/${id}/results`} className={buttonVariants({ variant: "secondary" })}>
      Results
    </Link>
  ) : null;
  if (!s) {
    if (isStaff(user)) return <><PageHeader title="Survey" actions={results} /><Card><EmptyState title="This survey is not addressed to you" /></Card></>;
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 text-sm">
        <Link href="/surveys" className="text-slate-500 hover:text-brand-700">Surveys</Link>
      </p>
      <PageHeader title={s.title} description={s.description ?? (s.closesAt ? `Closes ${fmtDate(s.closesAt)}` : undefined)} actions={results} />
      <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-bone px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-inset ring-hairline">
        {s.anonymous ? <EyeOff className="size-3.5" aria-hidden /> : <UserRound className="size-3.5" aria-hidden />}
        {s.anonymous ? "Anonymous: your answers are never linked to your name." : "Named: HR sees your name with your answers."}
      </p>
      {s.answered ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="size-8 text-tone-green-fg" aria-hidden />
            <p className="font-semibold text-ink">You already answered this survey</p>
            <p className="text-sm text-slate-500">Thanks for taking the time. One response per person.</p>
          </CardBody>
        </Card>
      ) : !s.live ? (
        <Card>
          <EmptyState title="This survey is not open" />
        </Card>
      ) : (
        <Card>
          <CardBody>
            <ActionForm action={submitSurveyAction.bind(null, s.id)} submitLabel="Submit answers" submitVariant="brand" className="space-y-6">
              {s.questions.map((q, i) => (
                <FormField key={q.id} name={`q:${q.id}`} label={`${i + 1}. ${q.text}`} required={q.required}>
                  {q.type === "rating" || q.type === "nps" ? (
                    <div className="inline-flex flex-col">
                      <RatingPills name={`q:${q.id}`} label={q.text} min={q.type === "nps" ? 0 : 1} max={q.type === "nps" ? 10 : 5} />
                      <p className="mt-1.5 flex justify-between text-xs text-slate-500">
                        <span>{q.type === "nps" ? "Not likely" : "Poor"}</span>
                        <span>{q.type === "nps" ? "Very likely" : "Excellent"}</span>
                      </p>
                    </div>
                  ) : q.type === "choice" ? (
                    <div role="radiogroup" aria-label={q.text} className="space-y-1">
                      {(q.options ?? []).map((o) => (
                        <label key={o} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm text-slate-700 ring-1 ring-inset ring-hairline hover:bg-canvas has-[:checked]:ring-ink">
                          <input type="radio" name={`q:${q.id}`} value={o} className="size-4 accent-ink" />
                          {o}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Textarea id={`q:${q.id}`} name={`q:${q.id}`} rows={3} />
                  )}
                </FormField>
              ))}
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
