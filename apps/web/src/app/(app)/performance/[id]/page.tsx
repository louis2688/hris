import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FINAL_RATING_SCALE } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { getReview, isReviewerOf, type ReviewDetail } from "@/server/services/performance";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { ReviewBadge } from "../review-badge";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Performance review" };

type Item = ReviewDetail["items"][number];

function ItemsView({ items, side, comment }: { items: Item[]; side: "self" | "manager"; comment: string | null }) {
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const rating = side === "self" ? it.selfRating : it.managerRating;
        const note = side === "self" ? it.selfComment : it.managerComment;
        return (
          <div key={it.id} className="flex items-start gap-4 rounded-xl p-4 ring-1 ring-inset ring-slate-200">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{it.kpiName}</p>
              {note ? <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{note}</p> : null}
            </div>
            <p className="shrink-0 text-sm tabular-nums text-slate-500">
              <span className="text-lg font-bold text-ink">{rating ?? "-"}</span> / {it.maxRating}
            </p>
          </div>
        );
      })}
      {comment ? <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{comment}</p> : null}
    </div>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const r = await getReview(user, id).catch(() => null);
  if (!r) notFound();

  const isSelf = r.employeeId === user.employeeId;
  const isReviewer = isReviewerOf(user, r);
  const open = r.cycle.status === "ACTIVE";
  const selfEditable = isSelf && open && r.status === "SELF_REVIEW";
  const managerEditable = isReviewer && open && r.status === "MANAGER_REVIEW";
  // Drafts stay private: the reviewer sees self ratings once submitted; the employee sees manager ratings once completed.
  const showSelf = isSelf || r.status !== "SELF_REVIEW";
  const showManager = r.status === "COMPLETED" || (!isSelf && r.status === "MANAGER_REVIEW" && (isReviewer || isStaff(user)));
  const reviewerName = r.reviewer ? fullName(r.reviewer) : "HR";

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm">
        <Link href="/performance" className="text-slate-500 hover:text-brand-700">
          Performance
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">{r.cycle.name}</span>
      </p>
      <PageHeader
        title={isSelf ? `My review - ${r.cycle.name}` : `${fullName(r.employee)} - ${r.cycle.name}`}
        description={`${fmtDate(r.cycle.periodStart)} - ${fmtDate(r.cycle.periodEnd)} · due ${fmtDate(r.cycle.dueDate)}${open ? "" : ` · cycle ${r.cycle.status.toLowerCase()}`}`}
        actions={<ReviewBadge status={r.status} />}
      />
      <div className="space-y-6">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar first={r.employee.firstName} last={r.employee.lastName} src={r.employee.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{fullName(r.employee)}</p>
              <p className="text-sm text-slate-500">
                {r.employee.jobTitle?.name ?? "No job title"} · reviewer {reviewerName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Final rating</p>
              <p className="text-3xl font-bold tabular-nums text-ink">
                {r.finalRating != null ? Number(r.finalRating).toFixed(2) : "-"}
                <span className="text-base font-medium text-slate-400"> / {FINAL_RATING_SCALE}</span>
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Self review" description={r.submittedAt ? `Submitted ${fmtDateTime(r.submittedAt)}` : isSelf ? "Rate yourself on each KPI, then submit to your reviewer." : `Waiting for ${fullName(r.employee)}`} />
          <CardBody>
            {selfEditable ? (
              <ReviewForm
                id={r.id}
                side="self"
                comment={r.selfComment}
                items={r.items.map((i) => ({ id: i.id, kpiName: i.kpiName, description: i.kpi?.description ?? null, minRating: i.minRating, maxRating: i.maxRating, rating: i.selfRating, comment: i.selfComment }))}
              />
            ) : showSelf ? (
              <ItemsView items={r.items} side="self" comment={r.selfComment} />
            ) : (
              <EmptyState title="Not submitted yet" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Manager review"
            description={r.completedAt ? `Completed by ${reviewerName} ${fmtDateTime(r.completedAt)}` : r.status === "MANAGER_REVIEW" ? (isReviewer ? "Your turn. Rate each KPI and add feedback." : `Waiting for ${reviewerName}`) : `Starts after the self review is submitted`}
          />
          <CardBody>
            {managerEditable ? (
              <ReviewForm
                id={r.id}
                side="manager"
                comment={r.managerComment}
                items={r.items.map((i) => ({
                  id: i.id,
                  kpiName: i.kpiName,
                  description: i.kpi?.description ?? null,
                  minRating: i.minRating,
                  maxRating: i.maxRating,
                  rating: i.managerRating,
                  comment: i.managerComment,
                  hint: `Self: ${i.selfRating ?? "-"} / ${i.maxRating}${i.selfComment ? ` - "${i.selfComment}"` : ""}`,
                }))}
              />
            ) : showManager ? (
              <ItemsView items={r.items} side="manager" comment={r.managerComment} />
            ) : (
              <EmptyState title={r.status === "COMPLETED" ? "Completed" : "Not started"} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
