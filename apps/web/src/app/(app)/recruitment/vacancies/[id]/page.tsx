import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CANDIDATE_STAGES, CANDIDATE_STAGE_LABELS, aiScoreTone } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { getVacancy } from "@/server/services/recruitment";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { cn, fmtDate, fullName } from "@/lib/utils";
import { aiProvider } from "@/server/ai";
import { ScreenAll } from "./screen-all";

export const metadata: Metadata = { title: "Vacancy" };
// AI screening server actions run under this route; a PDF screen can take 30-60s.
export const maxDuration = 90;

export default async function VacancyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sort?: string }> }) {
  await gate("ADMIN", "HR");
  const [{ id }, { sort }] = await Promise.all([params, searchParams]);
  const v = await getVacancy(id).catch(() => null);
  if (!v) notFound();
  const cols = CANDIDATE_STAGES.filter((s) => s !== "WITHDRAWN");
  const byAi = sort === "ai";
  // ponytail: rank in memory; a vacancy's candidate list is small. Unscored sink to the bottom.
  const candidates = byAi ? [...v.candidates].sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1)) : v.candidates;
  const unscreened = aiProvider() ? v.candidates.filter((c) => !c.aiScreenedAt && !["HIRED", "REJECTED", "WITHDRAWN"].includes(c.stage)).slice(0, 20).map((c) => c.id) : [];
  const tab = (on: boolean) => cn("rounded-full px-3 py-1.5", on ? "bg-ink text-on-dark" : "text-ink hover:bg-ink/5");

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/recruitment?tab=vacancies" className="text-slate-500 hover:text-brand-700">
          Vacancies
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">{v.title}</span>
      </p>
      <PageHeader
        title={v.title}
        description={[v.department?.name, v.location?.name, v.hiringManager ? `Hiring manager ${fullName(v.hiringManager)}` : null, `${v.positions} position${v.positions > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
        actions={<Badge tone={v.status === "OPEN" ? "green" : "slate"}>{v.status.toLowerCase()}</Badge>}
      />
      {v.description ? <p className="mb-6 max-w-3xl whitespace-pre-line text-sm text-slate-600">{v.description}</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Sort candidates" className="flex items-center gap-1 text-sm">
          <span className="mr-1 text-slate-500">Sort</span>
          <Link href={`/recruitment/vacancies/${v.id}`} className={tab(!byAi)} aria-current={!byAi ? "page" : undefined}>
            Newest
          </Link>
          <Link href={`/recruitment/vacancies/${v.id}?sort=ai`} className={tab(byAi)} aria-current={byAi ? "page" : undefined}>
            AI score
          </Link>
        </nav>
        <ScreenAll ids={unscreened} />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-thin lg:mx-0 lg:px-0">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {cols.map((s) => {
            const list = candidates.filter((c) => c.stage === s);
            return (
              <div key={s} className="rounded-2xl bg-slate-100/70 p-2">
                <p className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {CANDIDATE_STAGE_LABELS[s]} <span>{list.length}</span>
                </p>
                <div className="space-y-2">
                  {list.map((c) => (
                    <Link key={c.id} href={`/recruitment/candidates/${c.id}`}>
                      <Card className="p-3 transition-colors hover:ring-ink/40">
                        <p className="text-sm font-medium">
                          {c.firstName} {c.lastName}
                        </p>
                        <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          {fmtDate(c.appliedAt)}
                          {c.aiScore !== null ? (
                            <Badge tone={aiScoreTone(c.aiScore)} className="tabular-nums">
                              <span className="sr-only">AI score </span>
                              {c.aiScore}
                            </Badge>
                          ) : null}
                        </p>
                        {c.interviews[0] ? <p className="mt-1 text-[11px] text-violet-700">{c.interviews[0].title}</p> : null}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
