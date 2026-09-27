import type { Metadata } from "next";
import Link from "next/link";
import { CANDIDATE_STAGES, CANDIDATE_STAGE_LABELS, type CandidateStage } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { employeeOptions } from "@/server/services/employees";
import { listDepartments, listJobTitles, listLocations } from "@/server/services/org";
import { listCandidates, listVacancies, upcomingInterviews } from "@/server/services/recruitment";
import { deleteVacancyAction, saveVacancyAction } from "@/server/actions/recruitment";
import { EntityManager } from "@/components/entity-manager";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/stage-badge";
import { cn, fmtDate, fmtDateTime, fullName, toSearchParams } from "@/lib/utils";
import { NewCandidate } from "./new-candidate";

export const metadata: Metadata = { title: "Recruitment" };

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ tab?: string; stage?: string; vacancyId?: string; q?: string }> }) {
  await gate("ADMIN", "HR");
  const sp = await searchParams;
  const tab = sp.tab === "vacancies" ? "vacancies" : "candidates";
  const stage = (CANDIDATE_STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as CandidateStage) : undefined;
  const [vacancies, candidates, jobTitles, departments, locations, people, interviews] = await Promise.all([
    listVacancies(),
    listCandidates({ stage, vacancyId: sp.vacancyId, q: sp.q }),
    listJobTitles(),
    listDepartments(),
    listLocations(),
    employeeOptions(),
    upcomingInterviews(),
  ]);
  const opts = (xs: { id: string; name: string }[]) => xs.map((x) => ({ id: x.id, name: x.name }));
  const openVacancies = vacancies.filter((v) => v.status === "OPEN").map((v) => ({ id: v.id, name: v.title }));

  return (
    <>
      <PageHeader title="Recruitment" description={`${openVacancies.length} open vacancies · ${Object.values(candidates.stages).reduce((a, b) => a + (b ?? 0), 0)} candidates`} actions={<NewCandidate vacancies={openVacancies} />} />
      <nav className="mb-6 inline-flex gap-1 rounded-full bg-slate-100 p-1">
        {(["candidates", "vacancies"] as const).map((t) => (
          <Link key={t} href={`/recruitment?tab=${t}`} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-card text-ink shadow-card" : "text-slate-600 hover:text-ink")}>
            {t}
          </Link>
        ))}
      </nav>

      {tab === "vacancies" ? (
        <EntityManager
          title="Vacancies"
          singular="vacancy"
          columns={["Title", "Department", "Hiring manager", "Pipeline", "Status"]}
          rows={vacancies.map((v) => ({
            id: v.id,
            cells: [
              <Link key="t" href={`/recruitment/vacancies/${v.id}`} className="hover:text-brand-700">
                {v.title}
                <span className="block text-xs font-normal text-slate-500">{v.positions} position{v.positions > 1 ? "s" : ""}</span>
              </Link>,
              v.department?.name ?? "-",
              v.hiringManager ? fullName(v.hiringManager) : "-",
              `${v.total} total · ${v.byStage.INTERVIEW ?? 0} interviewing · ${v.byStage.HIRED ?? 0} hired`,
              <Badge key="s" tone={v.status === "OPEN" ? "green" : v.status === "DRAFT" ? "amber" : "slate"}>{v.status.toLowerCase()}</Badge>,
            ],
            values: v,
          }))}
          fields={[
            { name: "title", label: "Title", required: true, span: 2 },
            { name: "jobTitleId", label: "Job title", type: "select", options: opts(jobTitles) },
            { name: "departmentId", label: "Department", type: "select", options: opts(departments) },
            { name: "locationId", label: "Location", type: "select", options: opts(locations) },
            { name: "hiringManagerId", label: "Hiring manager", type: "select", options: people.map((p) => ({ id: p.id, name: fullName(p) })) },
            { name: "positions", label: "Positions", type: "number", min: 1 },
            { name: "status", label: "Status", type: "select", options: [{ id: "OPEN", name: "Open" }, { id: "DRAFT", name: "Draft" }, { id: "CLOSED", name: "Closed" }], placeholder: "Open" },
            { name: "description", label: "Description", type: "textarea", span: 2 },
          ]}
          saveAction={saveVacancyAction}
          deleteAction={deleteVacancyAction}
          deleteConfirm="Delete this vacancy? Candidates stay but lose the link."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Link href={`/recruitment${toSearchParams({ vacancyId: sp.vacancyId, q: sp.q })}`} className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", !stage ? "bg-ink text-on-dark ring-ink" : "bg-card text-slate-600 ring-slate-200 hover:bg-slate-50")}>
                All
              </Link>
              {CANDIDATE_STAGES.map((s) => (
                <Link key={s} href={`/recruitment${toSearchParams({ stage: s, vacancyId: sp.vacancyId, q: sp.q })}`} className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", stage === s ? "bg-ink text-on-dark ring-ink" : "bg-card text-slate-600 ring-slate-200 hover:bg-slate-50")}>
                  {CANDIDATE_STAGE_LABELS[s]} <span className="opacity-60">{candidates.stages[s] ?? 0}</span>
                </Link>
              ))}
            </div>
            <Card>
              <form method="get" className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_220px_auto]">
                {stage ? <input type="hidden" name="stage" value={stage} /> : null}
                <Input name="q" defaultValue={sp.q} placeholder="Search name or email" aria-label="Search" />
                <Select name="vacancyId" defaultValue={sp.vacancyId ?? ""} aria-label="Vacancy">
                  <option value="">All vacancies</option>
                  {vacancies.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </Select>
                <Button variant="secondary" type="submit">
                  Filter
                </Button>
              </form>
              {candidates.items.length === 0 ? (
                <EmptyState title="No candidates" description="Add one with the button above." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {candidates.items.map((c) => (
                    <li key={c.id}>
                      <Link href={`/recruitment/candidates/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {c.vacancy?.title ?? "No vacancy"} · applied {fmtDate(c.appliedAt)}
                            {c.source ? ` · ${c.source}` : ""}
                          </p>
                        </div>
                        <StageBadge stage={c.stage} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card className="h-fit">
            <CardHeader title="Upcoming interviews" />
            {interviews.length === 0 ? (
              <EmptyState title="None scheduled" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {interviews.map((i) => (
                  <li key={i.id}>
                    <Link href={`/recruitment/candidates/${i.candidate.id}`} className="block px-5 py-3 hover:bg-slate-50">
                      <p className="text-sm font-medium">
                        {i.candidate.firstName} {i.candidate.lastName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {i.title} · {fmtDateTime(i.scheduledAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
