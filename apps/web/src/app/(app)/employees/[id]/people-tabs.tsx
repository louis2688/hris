import Link from "next/link";
import { CHECKLIST_KIND_LABELS } from "@hris/shared";
import { checklistsForEmployee, startOptions } from "@/server/services/onboarding";
import { assetsForEmployee } from "@/server/services/assets";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { cn, fmtDate } from "@/lib/utils";
import { StartChecklistDialog } from "../../onboarding/client";
import { AssetStatusBadge } from "../../assets/client";

export async function OnboardingTab({ employeeId }: { employeeId: string }) {
  const [rows, opts] = await Promise.all([checklistsForEmployee(employeeId), startOptions()]);
  return (
    <Card>
      <CardHeader title="Onboarding & offboarding" action={<StartChecklistDialog employeeId={employeeId} employees={[]} templates={opts.templates} />} />
      {rows.length === 0 ? (
        <EmptyState title="No checklists" description="Start one from a template to track onboarding or offboarding tasks." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((c) => {
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <li key={c.id}>
                <Link href={`/onboarding/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {c.template?.name ?? "Custom checklist"}
                      <Badge tone={c.kind === "ONBOARDING" ? "blue" : "violet"}>{CHECKLIST_KIND_LABELS[c.kind]}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Started {fmtDate(c.startedAt)}
                      {c.completedAt ? ` · Completed ${fmtDate(c.completedAt)}` : ""}
                    </p>
                  </div>
                  <div className="w-full sm:w-44">
                    <p className="mb-1 text-right text-xs tabular-nums text-slate-600">
                      {c.done}/{c.total} done
                    </p>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className={cn("h-1.5 rounded-full", pct === 100 ? "bg-[#2b9a66]" : "bg-ink")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export async function AssetsTab({ employeeId }: { employeeId: string }) {
  const assets = await assetsForEmployee(employeeId);
  return (
    <Card>
      <CardHeader title="Assigned assets" description={`${assets.length} item${assets.length === 1 ? "" : "s"}`} action={<Link href="/assets" className="text-sm font-medium text-brand-700 hover:underline">All assets</Link>} />
      {assets.length === 0 ? (
        <EmptyState title="No assets assigned" description="Assign equipment from the Assets page." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {assets.map((a) => (
            <li key={a.id}>
              <Link href={`/assets/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{a.tag}</span> · {a.category}
                    {a.serialNumber ? ` · SN ${a.serialNumber}` : ""} · since {fmtDate(a.assignedAt)}
                  </p>
                </div>
                <AssetStatusBadge status={a.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
