import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { addDaysIso, CORRECTION_KIND_LABELS, CORRECTION_MAX_DAYS_BACK, DEFAULT_TIMEZONE, zonedParts } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { cancelCorrectionAction, decideCorrectionAction } from "@/server/actions/timeoff";
import { listCorrections, type CorrectionRow } from "@/server/services/timeoff";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { ActButton, DecideButtons } from "@/components/timeoff-ui";
import { fmtDate, fullName } from "@/lib/utils";
import { RequestStatusBadge } from "../../requests/_ui/shared";
import { CorrectionDialog } from "./form";

export const metadata: Metadata = { title: "Attendance corrections" };

const times = (c: CorrectionRow) => [c.inTime ? `in ${c.inTime}` : null, c.outTime ? `out ${c.outTime}` : null].filter(Boolean).join(" · ");

export default async function CorrectionsPage() {
  const user = await requireSession();
  const { mine, toDecide } = await listCorrections(user);
  const today = zonedParts(new Date(), DEFAULT_TIMEZONE).date;
  const approver = user.role !== "EMPLOYEE";

  return (
    <>
      <PageHeader
        title="Attendance corrections"
        description="Fix a missed punch, or log work from home and official business. Approved corrections add the punches to the time record."
        actions={
          <>
            <Link href="/attendance" className={buttonVariants({ variant: "secondary" })}>
              <ChevronLeft /> Attendance
            </Link>
            {user.employeeId ? <CorrectionDialog min={addDaysIso(today, -CORRECTION_MAX_DAYS_BACK)} max={addDaysIso(today, -1)} /> : null}
          </>
        }
      />
      <div className="space-y-6">
        {approver ? (
          <Card>
            <CardHeader title="Waiting for your decision" description={toDecide.length ? `${toDecide.length} pending` : undefined} />
            {toDecide.length === 0 ? (
              <EmptyState title="You're all caught up" />
            ) : (
              <ul className="divide-y divide-slate-100" aria-label="Corrections to decide">
                {toDecide.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar first={c.employee.firstName} last={c.employee.lastName} src={c.employee.avatarUrl} />
                    <div className="min-w-[12rem] flex-1 text-sm">
                      <p className="font-medium text-ink">
                        {fullName(c.employee)} <span className="font-normal text-slate-500">{CORRECTION_KIND_LABELS[c.kind]}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmtDate(c.date, "EEE d MMM")} · {times(c)} · &ldquo;{c.reason}&rdquo;
                      </p>
                    </div>
                    <DecideButtons action={decideCorrectionAction.bind(null, c.id)} name={`${fullName(c.employee)} ${fmtDate(c.date)}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {user.employeeId ? (
          <Card>
            <CardHeader title="My corrections" />
            {mine.length === 0 ? (
              <EmptyState title="No corrections yet" description="Use Fix on a day in your time record, or File correction above." />
            ) : (
              <ul className="divide-y divide-slate-100" aria-label="My corrections">
                {mine.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-[12rem] flex-1 text-sm">
                      <p className="font-medium text-ink">
                        {CORRECTION_KIND_LABELS[c.kind]} · {fmtDate(c.date, "EEE d MMM yyyy")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {times(c)} · &ldquo;{c.reason}&rdquo;
                        {c.approver ? ` · by ${fullName(c.approver)}` : ""}
                        {c.decisionNote ? ` · ${c.decisionNote}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RequestStatusBadge status={c.status} />
                      {c.status === "PENDING" ? <ActButton action={cancelCorrectionAction.bind(null, c.id)}>Withdraw</ActButton> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
