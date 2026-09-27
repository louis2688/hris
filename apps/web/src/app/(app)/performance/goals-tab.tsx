import "server-only";
import { AlertTriangle } from "lucide-react";
import { goalWeightTotal, type SessionUser } from "@hris/shared";
import { goalOwners, listGoals, openCycles, parentGoalOptions, type GoalRow } from "@/server/services/goals";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { fullName, isoDate } from "@/lib/utils";
import { GoalItem, NewGoalButton, type GoalFormCtx, type GoalView } from "./goal-ui";

const view = (g: GoalRow): GoalView => ({
  id: g.id,
  employeeId: g.employeeId,
  title: g.title,
  description: g.description,
  kra: g.kra,
  weight: g.weight,
  progress: g.progress,
  status: g.status,
  dueDate: g.dueDate ? isoDate(g.dueDate) : null,
  cycleId: g.cycleId,
  parentId: g.parentId,
  parentLabel: g.parent ? `Cascades from ${fullName(g.parent.employee)}: ${g.parent.title}` : null,
});

/** Goals grouped by cycle, with a weight check per group. */
function CycleGroups({ goals, ctx }: { goals: GoalRow[]; ctx: GoalFormCtx }) {
  const groups = new Map<string, GoalRow[]>();
  for (const g of goals) groups.set(g.cycle?.name ?? "No cycle", [...(groups.get(g.cycle?.name ?? "No cycle") ?? []), g]);
  return (
    <>
      {[...groups].map(([name, rows]) => {
        const total = goalWeightTotal(rows);
        const cycled = name !== "No cycle";
        return (
          <section key={name}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-bone/60 px-4 py-2 sm:px-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">{name}</h4>
              {cycled && total !== 100 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-tone-amber-fg">
                  <AlertTriangle className="size-3.5" aria-hidden /> Weights total {total}% (should be 100%)
                </span>
              ) : cycled ? (
                <span className="text-xs text-slate-500">Weights total 100%</span>
              ) : null}
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((g) => (
                <GoalItem key={g.id} goal={view(g)} ctx={ctx} editable />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export async function GoalsTab({ user }: { user: SessionUser }) {
  const [goals, cycles, owners] = await Promise.all([listGoals(user), openCycles(), goalOwners(user)]);
  const parentOpts = await parentGoalOptions(owners.map((o) => o.id));
  const ctx: GoalFormCtx = {
    employees: owners.map((o) => ({ id: o.id, name: o.id === user.employeeId ? `Me (${fullName(o)})` : fullName(o) })),
    cycles,
    parents: Object.fromEntries(parentOpts.map((p) => [p.employeeId, p.goals])),
  };
  const mine = goals.filter((g) => g.employeeId === user.employeeId);
  const team = goals.filter((g) => g.employeeId !== user.employeeId);
  const byPerson = new Map<string, GoalRow[]>();
  for (const g of team) byPerson.set(g.employeeId, [...(byPerson.get(g.employeeId) ?? []), g]);
  const others = owners.filter((o) => o.id !== user.employeeId);

  return (
    <div className="space-y-6">
      {user.employeeId ? (
        <Card>
          <CardHeader title="My goals" description="Update progress as you go. Your manager sees the same view." action={<NewGoalButton ctx={ctx} employeeId={user.employeeId} />} />
          {mine.length ? <CycleGroups goals={mine} ctx={ctx} /> : <EmptyState title="No goals yet" description="Add 3-5 goals for the cycle with weights that add up to 100%." />}
        </Card>
      ) : null}

      {others.length ? (
        <Card>
          <CardHeader
            title={user.role === "ADMIN" || user.role === "HR" ? "Everyone's goals" : "My team's goals"}
            description="Set goals for your direct reports or cascade one of yours."
            action={<NewGoalButton ctx={{ ...ctx, employees: ctx.employees.filter((e) => e.id !== user.employeeId) }} label="Goal for a report" variant="secondary" />}
          />
          {byPerson.size === 0 ? (
            <EmptyState title="No team goals yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {[...byPerson].map(([id, rows]) => (
                <details key={id} className="group" open={byPerson.size <= 4}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5 [&::-webkit-details-marker]:hidden">
                    <Avatar first={rows[0]!.employee.firstName} last={rows[0]!.employee.lastName} src={rows[0]!.employee.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{fullName(rows[0]!.employee)}</span>
                    <span className="text-xs text-slate-500">
                      {rows.length} goal{rows.length === 1 ? "" : "s"} · avg {Math.round(rows.reduce((s, g) => s + g.progress, 0) / rows.length)}%
                    </span>
                  </summary>
                  <div className="border-t border-slate-100">
                    <CycleGroups goals={rows} ctx={ctx} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
