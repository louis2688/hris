"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ClipboardCheck, Pencil, Trash2, UserCheck } from "lucide-react";
import { CANDIDATE_STAGE_LABELS, RECOMMENDATION_LABELS, RECOMMENDATION_TONE, type CandidateStage } from "@hris/shared";
import { addInterviewAction, deleteInterviewAction, hireAction, interviewResultAction, setStageAction } from "@/server/actions/recruitment";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { fmtDateTime, todayISO } from "@/lib/utils";
import { CandidateForm, type CandidateInitial } from "../../new-candidate";
import { ScorecardForm, type FeedbackRow } from "./scorecard";

type Opt = { id: string; name: string };

export function CandidateActions({ id, stage, next, initial, vacancies, people, offer }: { id: string; stage: CandidateStage; next: CandidateStage[]; initial: CandidateInitial; vacancies: Opt[]; people: Opt[]; offer: { startDate: string; summary: string } | null }) {
  const [dlg, setDlg] = React.useState<"stage" | "hire" | "edit" | null>(null);
  const [hired, setHired] = React.useState<{ employeeId: string; initialPassword: string | null } | null>(null);
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setDlg("edit")} aria-label="Edit candidate">
        <Pencil />
      </Button>
      {next.length ? (
        <Button variant="secondary" onClick={() => setDlg("stage")}>
          Move stage
        </Button>
      ) : null}
      {stage === "OFFERED" ? (
        <Button onClick={() => setDlg("hire")}>
          <UserCheck /> Hire
        </Button>
      ) : null}
      <Dialog open={dlg === "edit"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent title="Edit candidate">
          <CandidateForm
            id={id}
            initial={initial}
            vacancies={vacancies}
            people={people}
            onDone={() => {
              setDlg(null);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={dlg === "stage"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent title="Move candidate" description={`Currently ${CANDIDATE_STAGE_LABELS[stage].toLowerCase()}`}>
          <ActionForm action={setStageAction.bind(null, id)} onSuccess={() => setDlg(null)} submitLabel="Move">
            <FormField label="New stage" name="stage" required>
              <Select id="stage" name="stage" defaultValue={next[0]}>
                {next.map((s) => (
                  <option key={s} value={s}>
                    {CANDIDATE_STAGE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Note" name="note">
              <Textarea id="note" name="note" rows={2} />
            </FormField>
          </ActionForm>
        </DialogContent>
      </Dialog>
      <Dialog open={dlg === "hire"} onOpenChange={(o) => !o && (hired ? router.push(`/employees/${hired.employeeId}`) : setDlg(null))}>
        <DialogContent title={hired ? "Hired" : "Hire candidate"} description={hired ? undefined : offer ? "Creates the employee record with the pay and position from the accepted offer." : "Creates the employee record from this candidate and the vacancy."}>
          {hired ? (
            <div className="space-y-4">
              {hired.initialPassword ? (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Temporary password (shown once)</p>
                  <p className="mt-1 select-all font-mono text-base font-semibold">{hired.initialPassword}</p>
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button onClick={() => router.push(`/employees/${hired.employeeId}`)}>Open employee</Button>
              </div>
            </div>
          ) : (
            <ActionForm action={hireAction.bind(null, id)} onSuccess={(d: { employeeId: string; initialPassword: string | null }) => setHired(d)} submitLabel="Hire">
              {offer ? <p className="rounded-xl bg-tone-green-bg px-3.5 py-2.5 text-sm text-tone-green-fg">Accepted offer: {offer.summary}</p> : null}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Employee ID" name="employeeCode" required>
                  <Input id="employeeCode" name="employeeCode" className="font-mono" />
                </FormField>
                <FormField label="Start date" name="hireDate" required>
                  <Input id="hireDate" name="hireDate" type="date" defaultValue={offer?.startDate ?? todayISO()} />
                </FormField>
              </div>
              <Checkbox name="createAccount" defaultChecked label="Create a login account (role: Employee)" />
              <input type="hidden" name="role" value="EMPLOYEE" />
            </ActionForm>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Interview = {
  id: string;
  title: string;
  round: number;
  scheduledAt: string;
  interviewerId: string | null;
  interviewer: string | null;
  location: string | null;
  result: "PENDING" | "PASSED" | "FAILED";
  notes: string | null;
  feedback: FeedbackRow[];
};

export function Interviews({
  candidateId,
  interviews,
  people,
  closed,
  canManage,
  me,
  criteria,
}: {
  candidateId: string;
  interviews: Interview[];
  people: Opt[];
  closed: boolean;
  canManage: boolean;
  me: string | null;
  criteria: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<Interview | null>(null);
  const [scoring, setScoring] = React.useState<Interview | null>(null);
  const tone = { PENDING: "amber", PASSED: "green", FAILED: "red" } as const;
  const nextRound = Math.max(0, ...interviews.map((i) => i.round)) + 1;
  return (
    <Card>
      <CardHeader
        title="Interviews"
        action={
          canManage && !closed ? (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <CalendarPlus /> Schedule
            </Button>
          ) : null
        }
      />
      {interviews.length === 0 ? (
        <EmptyState title="No interviews yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {interviews.map((i) => {
            const canScore = !!me && (canManage || i.interviewerId === me);
            const mine = i.feedback.find((f) => f.interviewerId === me);
            return (
              <li key={i.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="whitespace-nowrap rounded-full bg-bone px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Round {i.round}</span>
                      {i.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fmtDateTime(i.scheduledAt)}
                      {i.interviewer ? ` · ${i.interviewer}` : ""}
                      {i.location ? ` · ${i.location}` : ""}
                    </p>
                    {i.notes ? <p className="mt-1 text-xs text-slate-600">{i.notes}</p> : null}
                  </div>
                  <Badge tone={tone[i.result]}>{i.result.toLowerCase()}</Badge>
                  {canScore ? (
                    <Button size="sm" variant={mine ? "ghost" : "secondary"} onClick={() => setScoring(i)}>
                      <ClipboardCheck /> {mine ? "Edit scorecard" : "Scorecard"}
                    </Button>
                  ) : null}
                  {canManage ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setResult(i)}>
                        Result
                      </Button>
                      <ConfirmButton action={deleteInterviewAction.bind(null, candidateId, i.id)} confirm="Remove this interview?" variant="ghost" size="icon-sm" className="text-red-600">
                        <Trash2 />
                      </ConfirmButton>
                    </>
                  ) : null}
                </div>
                {i.feedback.length ? (
                  <ul className="mt-3 space-y-2">
                    {i.feedback.map((f) => (
                      <li key={f.id} className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-hairline">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{f.interviewer}</span>
                          <span className="tabular-nums text-slate-500">{f.rating}/5</span>
                          <Badge tone={RECOMMENDATION_TONE[f.recommendation]}>{RECOMMENDATION_LABELS[f.recommendation]}</Badge>
                        </div>
                        {Object.keys(f.scores).length ? (
                          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                            {Object.entries(f.scores).sort(([a], [b]) => criteria.indexOf(a) - criteria.indexOf(b)).map(([k, v]) => (
                              <span key={k}>
                                {k} <span className="font-semibold tabular-nums text-ink">{v}</span>
                              </span>
                            ))}
                          </p>
                        ) : null}
                        {f.comments ? <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{f.comments}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!scoring} onOpenChange={(o) => !o && setScoring(null)}>
        {scoring ? (
          <DialogContent title="Interview scorecard" description={`Round ${scoring.round} · ${scoring.title}`} className="sm:max-w-xl">
            <ScorecardForm key={scoring.id} interviewId={scoring.id} criteria={criteria} mine={scoring.feedback.find((f) => f.interviewerId === me)} onDone={() => setScoring(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Schedule interview">
          <ActionForm action={addInterviewAction.bind(null, candidateId)} onSuccess={() => setOpen(false)} submitLabel="Schedule">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <FormField label="Title" name="title" required>
                <Input id="title" name="title" defaultValue={interviews.length ? "Final interview" : "Initial interview"} />
              </FormField>
              <FormField label="Round" name="round">
                <Select id="round" name="round" defaultValue={String(Math.min(nextRound, 10))}>
                  {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>
                      Round {n}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Date and time" name="scheduledAt" required>
                <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
              </FormField>
              <FormField label="Interviewer" name="interviewerId">
                <Select id="interviewerId" name="interviewerId" defaultValue="">
                  <option value="">None</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Location / link" name="location">
              <Input id="location" name="location" placeholder="Room 3 or Google Meet link" />
            </FormField>
          </ActionForm>
        </DialogContent>
      </Dialog>
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        {result ? (
          <DialogContent title={`Result: ${result.title}`}>
            <ActionForm key={result.id} action={interviewResultAction.bind(null, candidateId, result.id)} onSuccess={() => setResult(null)} submitLabel="Save result">
              <FormField label="Result" name="result">
                <Select id="result" name="result" defaultValue={result.result}>
                  <option value="PENDING">Pending</option>
                  <option value="PASSED">Passed</option>
                  <option value="FAILED">Failed</option>
                </Select>
              </FormField>
              <FormField label="Notes" name="notes">
                <Textarea id="notes" name="notes" rows={3} defaultValue={result.notes ?? ""} />
              </FormField>
            </ActionForm>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
