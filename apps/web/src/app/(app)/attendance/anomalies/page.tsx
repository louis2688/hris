import type { Metadata } from "next";
import Link from "next/link";
import { ANOMALY_KINDS, ANOMALY_LABELS, ANOMALY_RULES, type AnomalyKind, type Severity } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { findAnomalies } from "@/server/services/anomalies";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance anomalies" };

const SEV_TONE = { high: "red", medium: "amber", low: "slate" } as const;
const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const sp = await searchParams;
  const kind = ANOMALY_KINDS.includes(sp.kind as AnomalyKind) ? (sp.kind as AnomalyKind) : undefined;
  const severity = ["high", "medium", "low"].includes(sp.severity ?? "") ? (sp.severity as Severity) : undefined;
  const { from, to, anomalies } = await findAnomalies(user, { from: isDate(sp.from), to: isDate(sp.to), kind, severity });

  return (
    <>
      <PageHeader
        title="Attendance anomalies"
        description={`${anomalies.length} flag${anomalies.length === 1 ? "" : "s"} · ${fmtDate(from)} to ${fmtDate(to)}`}
        actions={
          <Link href="/attendance/team" className={buttonVariants({ variant: "secondary" })}>
            Team attendance
          </Link>
        }
      />
      <Card className="mb-4 p-4">
        <form className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_1.4fr_1fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            From
            <Input type="date" name="from" defaultValue={from} className="mt-1.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <Input type="date" name="to" defaultValue={to} className="mt-1.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Type
            <Select name="kind" defaultValue={kind ?? ""} className="mt-1.5">
              <option value="">All types</option>
              {ANOMALY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ANOMALY_LABELS[k]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Severity
            <Select name="severity" defaultValue={severity ?? ""} className="mt-1.5">
              <option value="">Any</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </label>
          <Button type="submit" className="col-span-2 sm:col-span-1">
            Filter
          </Button>
        </form>
      </Card>

      <Card>
        {anomalies.length === 0 ? (
          <EmptyState title="Nothing unusual" description="No attendance anomalies for this range and filter." />
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Anomalies">
            {anomalies.map((a, i) => (
              <li key={i} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex shrink-0 items-center gap-2 sm:w-56 sm:flex-col sm:items-start">
                  <Badge tone={SEV_TONE[a.severity]} className="capitalize">
                    {a.severity}
                  </Badge>
                  <p className="text-sm font-semibold text-ink">{ANOMALY_LABELS[a.kind]}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {a.people.map((p, k) => (
                      <span key={p.id}>
                        {k ? ", " : ""}
                        <Link href={`/attendance?employeeId=${p.id}&month=${a.dates.at(-1)!.slice(0, 7)}`} className="font-medium text-ink underline-offset-2 hover:underline">
                          {p.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{a.evidence}</p>
                  <p className="mt-1 text-xs text-slate-500">{a.dates.map((d) => fmtDate(d, "EEE d MMM")).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Rules: {ANOMALY_RULES.lateCount}+ lates in range, {ANOMALY_RULES.absentStreak}+ consecutive work days absent without leave, shifts over {ANOMALY_RULES.longShiftMinutes / 60}h, punches outside the location geofence, and 2+ people punching on one terminal (or the same spot without a selfie) within {ANOMALY_RULES.buddySeconds}s.
      </p>
    </>
  );
}
