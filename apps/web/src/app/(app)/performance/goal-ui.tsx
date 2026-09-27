"use client";

import * as React from "react";
import { CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { GOAL_STATUSES, GOAL_STATUS_LABELS, type GoalStatus } from "@hris/shared";
import { deleteGoalAction, goalProgressAction, saveGoalAction } from "@/server/actions/growth";
import { ActionForm, ConfirmButton, FormField, useFormCtx } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn, fmtDate } from "@/lib/utils";

export type GoalView = {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  kra: string | null;
  weight: number;
  progress: number;
  status: GoalStatus;
  dueDate: string | null;
  cycleId: string | null;
  parentId: string | null;
  parentLabel: string | null;
};
export type GoalFormCtx = {
  employees: { id: string; name: string }[];
  cycles: { id: string; name: string }[];
  /** Manager goals each employee may cascade from */
  parents: Record<string, { id: string; title: string }[]>;
};

export const GOAL_TONE = { NOT_STARTED: "slate", ON_TRACK: "green", AT_RISK: "amber", DONE: "blue", DROPPED: "slate" } as const;
export const GoalBadge = ({ status }: { status: GoalStatus }) => <Badge tone={GOAL_TONE[status]}>{GOAL_STATUS_LABELS[status]}</Badge>;

export function ProgressBar({ value, status, className }: { value: number; status?: GoalStatus; className?: string }) {
  const bar = status === "AT_RISK" ? "bg-tone-amber-fg" : status === "DONE" ? "bg-tone-blue-fg" : status === "DROPPED" ? "bg-slate-300" : "bg-tone-green-fg";
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
      <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${value}%` }} />
    </div>
  );
}

function GoalForm({ goal, ctx, employeeId, onDone }: { goal?: GoalView; ctx: GoalFormCtx; employeeId?: string; onDone: () => void }) {
  const [emp, setEmp] = React.useState(goal?.employeeId ?? employeeId ?? ctx.employees[0]?.id ?? "");
  const parents = ctx.parents[emp] ?? [];
  return (
    <ActionForm action={saveGoalAction.bind(null, goal?.id)} onSuccess={onDone} submitLabel={goal ? "Save goal" : "Add goal"}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!goal && ctx.employees.length > 1 ? (
          <FormField label="For" name="employeeId" className="sm:col-span-2">
            <Select id="employeeId" name="employeeId" value={emp} onChange={(e) => setEmp(e.target.value)}>
              {ctx.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <input type="hidden" name="employeeId" value={emp} />
        )}
        <FormField label="Goal" name="title" required className="sm:col-span-2">
          <Input id="title" name="title" defaultValue={goal?.title} placeholder="e.g. Cut API p95 latency to 200 ms" />
        </FormField>
        <FormField label="Key result area" name="kra" hint="e.g. Delivery, Quality, People">
          <Input id="kra" name="kra" defaultValue={goal?.kra ?? ""} />
        </FormField>
        <FormField label="Weight %" name="weight" hint="Weights in a cycle should add up to 100">
          <Input id="weight" name="weight" type="number" min={0} max={100} defaultValue={goal?.weight ?? ""} />
        </FormField>
        <FormField label="Review cycle" name="cycleId">
          <Select id="cycleId" name="cycleId" defaultValue={goal?.cycleId ?? ctx.cycles[0]?.id ?? ""}>
            <option value="">No cycle</option>
            {ctx.cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Due date" name="dueDate">
          <Input id="dueDate" name="dueDate" type="date" defaultValue={goal?.dueDate ?? ""} />
        </FormField>
        <FormField label="Cascades from" name="parentId" hint={parents.length ? "Link to one of the manager's goals" : "The manager has no goals to link to yet"} className="sm:col-span-2">
          <Select key={emp} id="parentId" name="parentId" defaultValue={goal?.parentId ?? ""} disabled={!parents.length}>
            <option value="">None</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Description" name="description" className="sm:col-span-2">
          <Textarea id="description" name="description" defaultValue={goal?.description ?? ""} rows={3} />
        </FormField>
      </div>
    </ActionForm>
  );
}

export function NewGoalButton({ ctx, employeeId, label = "Add goal", variant = "default", size }: { ctx: GoalFormCtx; employeeId?: string; label?: string; variant?: "default" | "secondary" | "brand"; size?: "sm" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New goal">{open ? <GoalForm ctx={ctx} employeeId={employeeId} onDone={() => setOpen(false)} /> : null}</DialogContent>
      </Dialog>
    </>
  );
}

function SaveProgress() {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" size="sm" variant="secondary" loading={pending}>
      Update
    </Button>
  );
}

/** One goal: summary, inline progress + status control, edit/delete. */
export function GoalItem({ goal, ctx, editable }: { goal: GoalView; ctx: GoalFormCtx; editable: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const [progress, setProgress] = React.useState(goal.progress);
  React.useEffect(() => setProgress(goal.progress), [goal.progress]);
  return (
    <li className="px-4 py-4 sm:px-5" data-goal={goal.title}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold text-ink", goal.status === "DROPPED" && "text-slate-500 line-through")}>{goal.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[goal.kra, `${goal.weight}% weight`, goal.dueDate ? `due ${fmtDate(goal.dueDate)}` : null].filter(Boolean).join(" · ")}
          </p>
          {goal.parentLabel ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-tone-violet-fg">
              <CornerDownRight className="size-3.5 shrink-0" aria-hidden /> {goal.parentLabel}
            </p>
          ) : null}
        </div>
        <GoalBadge status={goal.status} />
        {editable ? (
          <div className="-my-1 flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={`Edit ${goal.title}`}>
              <Pencil />
            </Button>
            <ConfirmButton action={() => deleteGoalAction(goal.id)} confirm={`Delete "${goal.title}"?`} variant="ghost" size="icon-sm" className="text-tone-red-fg">
              <Trash2 />
              <span className="sr-only">Delete {goal.title}</span>
            </ConfirmButton>
          </div>
        ) : null}
      </div>
      {goal.description ? <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{goal.description}</p> : null}
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={progress} status={goal.status} className="flex-1" />
        <span className="w-10 text-right text-sm font-semibold tabular-nums text-ink">{progress}%</span>
      </div>
      {editable ? (
        <ActionForm action={goalProgressAction.bind(null, goal.id)} hideSubmit className="mt-3 flex flex-wrap items-center gap-2 space-y-0">
          <label className="sr-only" htmlFor={`p-${goal.id}`}>
            Progress % for {goal.title}
          </label>
          <Input id={`p-${goal.id}`} name="progress" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="h-8 w-20 px-3" />
          <label className="sr-only" htmlFor={`s-${goal.id}`}>
            Status for {goal.title}
          </label>
          <Select id={`s-${goal.id}`} name="status" defaultValue={goal.status} className="h-8 w-auto py-0 pl-3 text-xs">
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <SaveProgress />
        </ActionForm>
      ) : null}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit goal">{editing ? <GoalForm goal={goal} ctx={ctx} onDone={() => setEditing(false)} /> : null}</DialogContent>
      </Dialog>
    </li>
  );
}
