import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import { LOAN_TYPE_LABELS, SEPARATION_REASON_LABELS, type PayslipLine } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { getSeparation } from "@/server/services/separations";
import { cancelSeparationAction, completeSeparationAction, startOffboardingAction } from "@/server/actions/separations";
import { ConfirmButton } from "@/components/action-form";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { cn, fmtDate, fmtDays, fullName } from "@/lib/utils";
import { peso, RunStatusBadge } from "../../payroll/_ui/format";
import { SeparationBadges } from "../badges";
import { ExitInterviewForm, FinalPayForm } from "../client";

export const metadata: Metadata = { title: "Separation" };

function Item({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", ok ? "bg-tone-green-bg text-tone-green-fg" : "bg-tone-amber-bg text-tone-amber-fg")}>
        {ok ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-ink">{title}</p>
        {children ? <div className="mt-0.5 text-slate-600">{children}</div> : null}
      </div>
    </li>
  );
}

export default async function SeparationPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const s = await getSeparation(id).catch(() => notFound());
  const c = s.clearance;
  const open = s.status === "CLEARANCE" || s.status === "FINAL_PAY";
  const slip = s.finalPayRun?.payslips[0];
  const lines = (slip?.lines ?? []) as unknown as PayslipLine[];
  const due = lines.find((l) => l.code === "AMOUNT_DUE")?.amount ?? 0;
  const loanTotal = c.loans.reduce((a, l) => a + Number(l.balance), 0);
  const assetTotal = c.assets.reduce((a, x) => a + Number(x.cost ?? 0), 0);
  const pendingLabels = Object.entries({ leave: "leave", overtime: "overtime", loans: "loan", coe: "COE", corrections: "attendance correction" } as const)
    .filter(([k]) => c.pending[k as keyof typeof c.pending])
    .map(([k, label]) => `${c.pending[k as keyof typeof c.pending]} ${label}`);

  return (
    <>
      <Link href="/separations" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft className="size-4" /> Separations
      </Link>
      <PageHeader
        title={fullName(s.employee)}
        description={`${s.employee.employeeCode}${s.employee.jobTitle ? ` · ${s.employee.jobTitle.name}` : ""} · ${SEPARATION_REASON_LABELS[s.reason]}${s.noticeDate ? ` · Notice ${fmtDate(s.noticeDate)}` : ""} · Last day ${fmtDate(s.lastDay)}`}
        actions={
          <>
            <SeparationBadges status={s.status} deadline={s.deadline} overdue={s.overdue} />
            {open && !s.finalPaid ? (
              <ConfirmButton action={cancelSeparationAction.bind(null, s.id)} confirm="Cancel this separation? A draft final pay run is deleted." variant="ghost">
                Cancel separation
              </ConfirmButton>
            ) : null}
            {s.status === "FINAL_PAY" && s.finalPaid ? (
              <ConfirmButton action={completeSeparationAction.bind(null, s.id)} confirm="Complete? The employee is marked separated, their login is deactivated and the separation is recorded in their history." variant="brand">
                Complete separation
              </ConfirmButton>
            ) : null}
          </>
        }
      />
      {s.notes ? <p className="-mt-3 mb-6 max-w-3xl text-sm text-slate-600">{s.notes}</p> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Clearance" description="Computed live from assets, loans, claims, requests and leave." />
            <ul className="divide-y divide-slate-100">
              <Item ok={c.assets.length === 0} title={c.assets.length ? `${c.assets.length} asset${c.assets.length > 1 ? "s" : ""} still assigned` : "No assets assigned"}>
                {c.assets.length ? (
                  <ul className="space-y-0.5">
                    {c.assets.map((a) => (
                      <li key={a.id}>
                        <Link href={`/assets/${a.id}`} className="hover:underline">
                          {a.tag} · {a.name}
                        </Link>
                        {a.cost ? <span className="tabular-nums"> · {peso(a.cost)}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Item>
              <Item ok={c.loans.length === 0} title={c.loans.length ? `Loan balance ${peso(loanTotal)}` : "No outstanding loans"}>
                {c.loans.length ? `${c.loans.map((l) => `${LOAN_TYPE_LABELS[l.type]} ${peso(l.balance)}`).join(", ")}. Deducted in full from final pay.` : null}
              </Item>
              <Item ok={c.claims.length === 0} title={c.claims.length ? `${c.claims.length} expense claim${c.claims.length > 1 ? "s" : ""} open` : "No open expense claims"}>
                {c.claims.length ? c.claims.map((x) => `${x.category} ${peso(x.amount)} (${x.status === "APPROVED" ? "approved, paid in final pay" : "pending approval"})`).join(", ") : null}
              </Item>
              <Item ok={c.pendingTotal === 0} title={c.pendingTotal ? `${c.pendingTotal} pending request${c.pendingTotal > 1 ? "s" : ""}` : "No pending requests"}>
                {pendingLabels.length ? (
                  <>
                    {pendingLabels.join(", ")}.{" "}
                    <Link href="/requests" className="font-medium text-ink underline-offset-4 hover:underline">
                      Review requests
                    </Link>
                  </>
                ) : null}
              </Item>
              <Item ok={!!c.offboarding?.completedAt || (!!c.offboarding && c.offboarding.total > 0 && c.offboarding.done === c.offboarding.total)} title="Offboarding checklist">
                {c.offboarding ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="tabular-nums">
                      {c.offboarding.done} of {c.offboarding.total} tasks done
                    </span>
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-bone" aria-hidden>
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${c.offboarding.total ? (c.offboarding.done / c.offboarding.total) * 100 : 0}%` }} />
                    </span>
                    <Link href={`/onboarding/${c.offboarding.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
                      Open
                    </Link>
                  </div>
                ) : open ? (
                  <ConfirmButton action={startOffboardingAction.bind(null, s.id)} confirm="Start the default offboarding checklist?" variant="secondary" size="sm">
                    Start checklist
                  </ConfirmButton>
                ) : (
                  "Not started"
                )}
              </Item>
            </ul>
            <div className="border-t border-slate-100 px-5 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Leave balances {s.lastDay.getUTCFullYear()}</p>
              <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {c.leave.map((b) => (
                  <li key={b.leaveTypeId} className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-700">
                      {b.leaveTypeName}
                      {b.encashable ? <span className="ml-1.5 text-xs text-tone-green-fg">encashable</span> : null}
                    </span>
                    <span className="tabular-nums text-ink">{fmtDays(b.available)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Exit interview" description={s.exitInterview ? `Saved ${fmtDate(s.exitInterview.at)}` : "Record the conversation before the last day."} />
            <CardBody>
              <ExitInterviewForm id={s.id} value={s.exitInterview} disabled={!open} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Final pay"
            description={`DOLE Labor Advisory 06-2020: release within 30 days, by ${fmtDate(s.deadline)}.`}
            action={s.finalPayRun ? <RunStatusBadge status={s.finalPayRun.status} /> : null}
          />
          {slip ? (
            <div className="border-b border-slate-100 px-5 py-4">
              <dl className="divide-y divide-slate-100 text-sm">
                {lines
                  .filter((l) => l.kind === "earning" || l.kind === "deduction")
                  .map((l, k) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-slate-700">
                        {l.label}
                        {l.qty ? <span className="ml-1.5 text-xs text-slate-500">({l.qty})</span> : null}
                      </dt>
                      <dd className={cn("tabular-nums", l.kind === "deduction" || l.amount < 0 ? "text-tone-red-fg" : "text-ink")}>
                        {l.kind === "deduction" ? "-" : ""}
                        {peso(l.amount)}
                      </dd>
                    </div>
                  ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-bone px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Net final pay</p>
                  {due ? <p className="text-xs font-semibold text-tone-red-fg">Employee owes {peso(due)} after netting</p> : null}
                </div>
                <p className="font-display text-2xl font-bold tabular-nums text-ink">{peso(slip.netPay)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/payroll/${s.finalPayRunId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Open run{s.finalPayRun?.status === "DRAFT" ? " to finalize" : ""}
                </Link>
                <Link href={`/payslips/${slip.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Payslip
                </Link>
              </div>
            </div>
          ) : null}
          {open && (!s.finalPayRun || s.finalPayRun.status === "DRAFT") ? (
            <CardBody>
              <p className="mb-4 text-sm text-slate-600">
                Pays basic from the day after the last regular cutoff to the last day, approved OT, pending adjustments and reimbursements, pro-rated 13th month and leave encashment. Nets every loan balance{c.assets.length ? ` and optionally ${peso(assetTotal)} of unreturned assets` : ""}. Tax is annualized for the year.
              </p>
              <FinalPayForm id={s.id} encashDays={s.leaveEncashDays == null ? c.suggestedEncash : Number(s.leaveEncashDays)} assets={c.assets.length} hasRun={!!s.finalPayRun} />
            </CardBody>
          ) : !slip ? (
            <CardBody>
              <p className="text-sm text-slate-500">No final pay computed.</p>
            </CardBody>
          ) : null}
          {s.status === "COMPLETED" ? (
            <CardBody className="border-t border-slate-100">
              <Badge tone="green">Completed {s.completedAt ? fmtDate(s.completedAt) : ""}</Badge>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
