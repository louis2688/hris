import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { CHECKLIST_KIND_LABELS, TASK_OWNER_LABELS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { getChecklist, manilaToday } from "@/server/services/onboarding";
import { assetsForEmployee } from "@/server/services/assets";
import { completeChecklistAction, deleteChecklistAction, deleteTaskAction, setAssetStatusAction } from "@/server/actions/people";
import { ConfirmButton } from "@/components/action-form";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { cn, fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { ActionButton } from "../../announcements/client";
import { AddTaskForm, TaskCheck } from "../client";

export const metadata: Metadata = { title: "Checklist" };

const OWNER_TONE = { HR: "slate", MANAGER: "blue", EMPLOYEE: "green", IT: "violet" } as const;

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const c = await getChecklist(user, id).catch(() => null);
  if (!c) notFound();
  const staff = c.access === "staff";
  const today = manilaToday();
  const done = c.tasks.filter((t) => t.doneAt).length;
  const pct = c.tasks.length ? Math.round((done / c.tasks.length) * 100) : 0;
  const assets = c.kind === "OFFBOARDING" && c.access !== "self" ? await assetsForEmployee(c.employee.id) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm">
        <Link href="/onboarding" className="text-slate-500 hover:text-brand-700">
          {c.access === "self" ? "My checklist" : "Onboarding"}
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">{fullName(c.employee)}</span>
      </p>

      <Card className="mb-6">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar first={c.employee.firstName} last={c.employee.lastName} src={c.employee.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">{fullName(c.employee)}</h1>
              <Badge tone={c.kind === "ONBOARDING" ? "blue" : "violet"}>{CHECKLIST_KIND_LABELS[c.kind]}</Badge>
              {c.completedAt ? <Badge tone="green">Completed {fmtDate(c.completedAt)}</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {[c.employee.jobTitle?.name, c.employee.department?.name].filter(Boolean).join(" · ") || "-"}
              {c.employee.manager ? ` · Reports to ${fullName(c.employee.manager)}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {c.template?.name ?? "Custom checklist"} · {c.kind === "ONBOARDING" ? `Start date ${fmtDate(c.employee.hireDate)}` : `Last day ${fmtDate(c.employee.terminationDate ?? c.startedAt)}`}
            </p>
          </div>
          {staff ? (
            <div className="flex flex-wrap gap-2">
              <ConfirmButton action={deleteChecklistAction.bind(null, c.id)} confirm="Delete this checklist and all its tasks?" variant="ghost" size="sm" className="text-red-700">
                Delete
              </ConfirmButton>
              {c.completedAt ? (
                <ActionButton action={completeChecklistAction.bind(null, c.id, false)} variant="secondary">
                  Reopen
                </ActionButton>
              ) : (
                <ConfirmButton
                  action={completeChecklistAction.bind(null, c.id, true)}
                  confirm={done < c.tasks.length ? `${c.tasks.length - done} task(s) are still open. Complete anyway?` : "Mark this checklist complete?"}
                  variant="default"
                  size="sm"
                >
                  Complete checklist
                </ConfirmButton>
              )}
            </div>
          ) : null}
        </CardBody>
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-ink">Progress</span>
            <span className="tabular-nums text-slate-600">
              {done}/{c.tasks.length} tasks
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
            <div className={cn("h-2 rounded-full transition-[width]", pct === 100 ? "bg-[#2b9a66]" : "bg-ink")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader title="Tasks" description={c.access === "self" ? "Your tasks. HR and your manager handle the rest." : "Tick tasks off as they are done."} />
          {c.tasks.length === 0 ? (
            <EmptyState title="No tasks" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.tasks.map((t) => {
                const overdue = !t.doneAt && t.dueDate && t.dueDate < today;
                const canTick = !c.completedAt && (c.access !== "self" || t.owner === "EMPLOYEE");
                return (
                  <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                    <label className="flex min-h-11 flex-1 cursor-pointer items-start gap-3 sm:min-h-0">
                      <span className="pt-0.5">
                        <TaskCheck id={t.id} done={!!t.doneAt} disabled={!canTick} label={t.title} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium", t.doneAt ? "text-slate-500 line-through decoration-slate-300" : "text-ink")}>{t.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <Badge tone={OWNER_TONE[t.owner]}>{TASK_OWNER_LABELS[t.owner]}</Badge>
                          {t.dueDate ? <span className={overdue ? "font-medium text-[#a3261a]" : undefined}>{overdue ? "Overdue · " : "Due "}{fmtDate(t.dueDate)}</span> : null}
                          {t.doneAt ? (
                            <span>
                              Done {fmtDateTime(t.doneAt)}
                              {t.doneBy ? ` by ${t.doneBy.employee ? fullName(t.doneBy.employee) : t.doneBy.email}` : ""}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                    {staff ? (
                      <ConfirmButton action={deleteTaskAction.bind(null, t.id)} confirm={`Remove "${t.title}"?`} variant="ghost" size="icon-sm" className="text-slate-400 hover:text-red-700">
                        <Trash2 />
                      </ConfirmButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {c.access !== "self" && !c.completedAt ? (
            <div className="border-t border-slate-100 bg-canvas/60 px-5 py-4">
              <AddTaskForm checklistId={c.id} />
            </div>
          ) : null}
        </Card>

        {c.kind === "OFFBOARDING" && c.access !== "self" ? (
          <Card>
            <CardHeader title="Assets still assigned" description={assets.length ? "Collect these before the last day." : undefined} />
            {assets.length === 0 ? (
              <CardBody className="text-sm text-slate-500">Nothing outstanding. All company assets are returned.</CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assets.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{a.tag}</span> · {a.category}
                        {a.serialNumber ? ` · SN ${a.serialNumber}` : ""}
                      </p>
                    </div>
                    {staff ? (
                      <ActionButton action={setAssetStatusAction.bind(null, a.id, "AVAILABLE")} variant="secondary">
                        Mark returned
                      </ActionButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
