import { EMPLOYMENT_EVENT_LABELS } from "@hris/shared";
import { describeChange, listEvents } from "@/server/services/employment-events";
import { cancelScheduledAction } from "@/server/actions/lifecycle";
import { ConfirmButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";
import { loadFormOptions } from "../options";
import { RecordChangeDialog } from "./record-change";

const TONE = { HIRE: "green", PROMOTION: "violet", TRANSFER: "blue", SALARY_CHANGE: "amber", STATUS_CHANGE: "slate", SEPARATION: "red" } as const;

export async function HistoryTab({ employeeId }: { employeeId: string }) {
  const [events, options] = await Promise.all([listEvents(employeeId), loadFormOptions()]);
  return (
    <Card>
      <CardHeader title="Job history" description="Hires, promotions, transfers, salary and status changes" action={<RecordChangeDialog employeeId={employeeId} options={options} />} />
      {events.length === 0 ? (
        <EmptyState title="No history yet" description="Changes you record, and edits to job fields, show up here." />
      ) : (
        <ol className="px-5 py-4">
          {events.map((ev, i) => {
            const rows = describeChange(ev.from, ev.to);
            return (
              <li key={ev.id} className="relative flex gap-4 pb-6 last:pb-0">
                {i < events.length - 1 ? <span className="absolute left-[5px] top-4 h-full w-px bg-hairline" aria-hidden /> : null}
                <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card ${ev.appliedAt ? "bg-ink" : "border-2 border-dashed border-slate-400 bg-card"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[ev.type]}>{EMPLOYMENT_EVENT_LABELS[ev.type]}</Badge>
                    <span className="text-sm font-medium text-ink">{fmtDate(ev.effectiveDate)}</span>
                    {ev.appliedAt ? null : <Badge tone="amber">Scheduled</Badge>}
                  </div>
                  {rows.length ? (
                    <dl className="mt-2 grid gap-1 text-sm">
                      {rows.map((r) => (
                        <div key={r.label} className="flex flex-wrap gap-x-2">
                          <dt className="text-slate-500">{r.label}</dt>
                          <dd className="text-slate-800">
                            {r.from !== null && ev.type !== "HIRE" ? (
                              <>
                                <span className="text-slate-500 line-through decoration-slate-300">{r.from}</span>
                                <span className="mx-1.5 text-slate-400" aria-label="changed to">→</span>
                              </>
                            ) : null}
                            <span className="font-medium">{r.to ?? "None"}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {ev.note ? <p className="mt-1.5 text-sm text-slate-600">{ev.note}</p> : null}
                </div>
                {ev.appliedAt ? null : (
                  <ConfirmButton action={cancelScheduledAction.bind(null, ev.id)} confirm="Cancel this scheduled change?" variant="ghost" size="sm" className="self-start">
                    Cancel
                  </ConfirmButton>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
