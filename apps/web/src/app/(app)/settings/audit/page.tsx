import type { Metadata } from "next";
import Link from "next/link";
import { gate } from "@/server/auth/session";
import { auditEntities, auditQuerySchema, changedKeys, listAuditLogs } from "@/server/services/audit-log";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/table";
import { fmtDateTime, fullName, toSearchParams } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

const json = (v: unknown) => (v === null || v === undefined ? "-" : JSON.stringify(v, null, 2));
const short = (v: unknown) => {
  const s = v === undefined ? "-" : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};
const pick = (v: unknown, k: string) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined);

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await gate("ADMIN", "HR");
  const raw = await searchParams;
  const q = auditQuerySchema.parse(raw);
  const [data, entities] = await Promise.all([listAuditLogs(q), auditEntities()]);
  const cols = "sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]";

  return (
    <div className="space-y-4">
      <Card>
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_140px_140px_auto]">
          <Input name="actor" defaultValue={q.actor ?? ""} placeholder="Actor email" aria-label="Actor" />
          <Input name="action" defaultValue={q.action ?? ""} placeholder="Action prefix, e.g. leave." aria-label="Action prefix" />
          <Select name="entity" defaultValue={q.entity ?? ""} aria-label="Entity">
            <option value="">All entities</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <Input type="date" name="from" defaultValue={q.from ?? ""} aria-label="From" />
          <Input type="date" name="to" defaultValue={q.to ?? ""} aria-label="To" />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            <Link href="/settings/audit" className={buttonVariants({ variant: "ghost" })}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Audit log" description="Every change made in Ugnayo, newest first. Expand a row to see what changed." />
        {data.items.length === 0 ? (
          <EmptyState title="No entries" description="Nothing matches these filters." />
        ) : (
          <div className="text-sm">
            <div className={`hidden gap-3 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:grid ${cols}`}>
              <span>When</span>
              <span>Actor</span>
              <span>Action</span>
              <span>Entity</span>
            </div>
            <ul className="divide-y divide-slate-100" aria-label="Audit entries">
              {data.items.map((r) => {
                const keys = changedKeys(r.before, r.after);
                const actor = r.actor ? (r.actor.employee ? fullName(r.actor.employee) : r.actor.email) : "System";
                return (
                  <li key={r.id}>
                    <details className="group">
                      <summary className={`grid cursor-pointer list-none gap-1 px-4 py-3 text-slate-700 transition-colors hover:bg-canvas sm:gap-3 ${cols}`}>
                        <span className="text-slate-500 tabular-nums">{fmtDateTime(r.createdAt)}</span>
                        <span className="truncate" title={r.actor?.email}>
                          {actor}
                        </span>
                        <span className="truncate font-mono text-xs leading-5">{r.action}</span>
                        <span className="truncate">
                          <Badge>{r.entity}</Badge>
                          {r.entityId ? <span className="ml-2 font-mono text-xs text-slate-400">{r.entityId}</span> : null}
                        </span>
                      </summary>
                      <div className="space-y-3 bg-slate-50/60 px-4 py-3">
                        {r.ip ? <p className="text-xs text-slate-500">IP {r.ip}</p> : null}
                        {r.before == null && r.after == null ? (
                          <p className="text-xs text-slate-500">No payload recorded.</p>
                        ) : (
                          <>
                            {keys.length ? (
                              <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Changed ({keys.length})</p>
                                <table className="w-full text-xs">
                                  <tbody className="divide-y divide-slate-200/70">
                                    {keys.map((k) => (
                                      <tr key={k}>
                                        <td className="py-1 pr-3 font-mono font-medium text-slate-700">{k}</td>
                                        <td className="py-1 pr-3 font-mono break-all text-red-700">{short(pick(r.before, k))}</td>
                                        <td className="py-1 font-mono break-all text-emerald-700">{short(pick(r.after, k))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                            <div className="grid gap-3 md:grid-cols-2">
                              {(["before", "after"] as const).map((side) => (
                                <div key={side} className="min-w-0">
                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{side === "before" ? "Before" : "After"}</p>
                                  <pre className="max-h-80 overflow-auto rounded-xl bg-card p-3 font-mono text-xs text-slate-700 ring-1 ring-slate-200">{json(r[side])}</pre>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} makeHref={(p) => `/settings/audit${toSearchParams({ ...raw, page: p })}`} />
      </Card>
    </div>
  );
}
