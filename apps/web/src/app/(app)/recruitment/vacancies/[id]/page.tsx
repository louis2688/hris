import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CANDIDATE_STAGES, CANDIDATE_STAGE_LABELS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { getVacancy } from "@/server/services/recruitment";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { fmtDate, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Vacancy" };

export default async function VacancyPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const v = await getVacancy(id).catch(() => null);
  if (!v) notFound();
  const cols = CANDIDATE_STAGES.filter((s) => s !== "WITHDRAWN");

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
      <div className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-thin lg:mx-0 lg:px-0">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {cols.map((s) => {
            const list = v.candidates.filter((c) => c.stage === s);
            return (
              <div key={s} className="rounded-2xl bg-slate-100/70 p-2">
                <p className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {CANDIDATE_STAGE_LABELS[s]} <span>{list.length}</span>
                </p>
                <div className="space-y-2">
                  {list.map((c) => (
                    <Link key={c.id} href={`/recruitment/candidates/${c.id}`}>
                      <Card className="p-3 transition-shadow hover:shadow-float">
                        <p className="text-sm font-medium">
                          {c.firstName} {c.lastName}
                        </p>
                        <p className="text-xs text-slate-500">{fmtDate(c.appliedAt)}</p>
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
