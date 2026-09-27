import type { Metadata } from "next";
import { CheckCircle2, Download, Pin, PinOff, ShieldCheck } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listAnnouncements } from "@/server/services/announcements";
import { deleteAnnouncementAction, pinAnnouncementAction, publishAnnouncementAction } from "@/server/actions/people";
import { ConfirmButton } from "@/components/action-form";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { AckButton, ActionButton, AnnouncementEditor } from "./client";
import { Markdown } from "./markdown";

export const metadata: Metadata = { title: "Announcements" };

type Author = { email: string; employee: { firstName: string; lastName: string; preferredName: string | null; avatarUrl: string | null } | null } | null;
const authorName = (a: Author) => (a?.employee ? fullName(a.employee) : (a?.email ?? "HR"));

export default async function AnnouncementsPage() {
  const user = await requireSession();
  const staff = isStaff(user);
  const { items, drafts, audience, pendingByPolicy } = await listAnnouncements(user);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Announcements" description="Company news and policies" actions={staff ? <AnnouncementEditor /> : undefined} />

      {staff && drafts.length ? (
        <Card className="mb-6">
          <CardHeader title={`Drafts (${drafts.length})`} description="Only HR and admins can see drafts." />
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{d.title}</p>
                  <p className="text-xs text-slate-500">
                    Edited {fmtDateTime(d.updatedAt)}
                    {d.requiresAck ? " · Policy" : ""}
                    {d.pinned ? " · Pinned" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <AnnouncementEditor initial={{ ...d, published: false }} />
                  <ConfirmButton action={deleteAnnouncementAction.bind(null, d.id)} confirm="Delete this draft?" variant="ghost" size="sm" className="text-red-700">
                    Delete
                  </ConfirmButton>
                  <ConfirmButton action={publishAnnouncementAction.bind(null, d.id)} confirm={`Publish "${d.title}" and notify everyone?`} variant="default" size="sm">
                    Publish
                  </ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <EmptyState title="No announcements yet" description={staff ? "Write the first one. Tick the policy box when everyone must acknowledge it." : "News and policies from HR will show up here."} />
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((a) => {
            const acked = a.acks[0]?.ackedAt;
            const count = "_count" in a ? (a._count as { acks: number }).acks : 0;
            const pending = pendingByPolicy.get(a.id) ?? [];
            const pct = audience ? Math.round((count / audience) * 100) : 0;
            return (
              <Card key={a.id} className={a.pinned ? "ring-ink/25" : undefined}>
                <article aria-labelledby={`a-${a.id}`}>
                  <div className="flex items-start gap-3 px-5 pt-5">
                    <Avatar first={a.author?.employee?.firstName ?? "H"} last={a.author?.employee?.lastName ?? "R"} src={a.author?.employee?.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.pinned ? (
                          <Badge tone="slate">Pinned</Badge>
                        ) : null}
                        {a.requiresAck ? <Badge tone="amber">Policy</Badge> : null}
                      </div>
                      <h2 id={`a-${a.id}`} className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.01em] text-ink">
                        {a.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {authorName(a.author)} · {fmtDate(a.publishedAt, "d MMM yyyy")}
                      </p>
                    </div>
                  </div>
                  <CardBody className="pt-3">
                    <Markdown text={a.body} />
                  </CardBody>

                  {a.requiresAck ? (
                    <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bone px-4 py-3">
                      {acked ? (
                        <p className="inline-flex items-center gap-2 text-sm font-medium text-[#1a6641]">
                          <CheckCircle2 className="size-4" /> You acknowledged this on {fmtDate(acked)}
                        </p>
                      ) : (
                        <>
                          <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <ShieldCheck className="size-4 text-slate-500" /> Please read and acknowledge this policy.
                          </p>
                          <AckButton id={a.id} />
                        </>
                      )}
                    </div>
                  ) : null}

                  {staff && a.requiresAck ? (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink">
                          <span className="tabular-nums">
                            {count}/{audience}
                          </span>{" "}
                          acknowledged
                        </p>
                        <a href={`/api/v1/announcements/${a.id}/acks`} className={buttonVariants({ variant: "ghost", size: "sm" })} download>
                          <Download /> CSV
                        </a>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Acknowledged">
                        <div className="h-2 rounded-full bg-[#2b9a66]" style={{ width: `${pct}%` }} />
                      </div>
                      {audience - count > 0 ? (
                        <details className="group mt-3">
                          <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-ink">Not yet acknowledged ({audience - count})</summary>
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {pending.map((p) => (
                              <li key={p.id} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-slate-700 ring-1 ring-inset ring-hairline">
                                {p.employee ? fullName(p.employee) : p.email}
                              </li>
                            ))}
                            {audience - count > pending.length ? <li className="px-1 py-1 text-xs text-slate-500">and {audience - count - pending.length} more in the CSV</li> : null}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}

                  {staff ? (
                    <div className="flex flex-wrap justify-end gap-1 border-t border-slate-100 px-3 py-2">
                      <ActionButton action={pinAnnouncementAction.bind(null, a.id, !a.pinned)}>
                        {a.pinned ? <PinOff /> : <Pin />} {a.pinned ? "Unpin" : "Pin"}
                      </ActionButton>
                      <AnnouncementEditor initial={{ ...a, published: true }} />
                      <ConfirmButton action={deleteAnnouncementAction.bind(null, a.id)} confirm="Delete this announcement? Acknowledgments are deleted too." variant="ghost" size="sm" className="text-red-700">
                        Delete
                      </ConfirmButton>
                    </div>
                  ) : null}
                </article>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
