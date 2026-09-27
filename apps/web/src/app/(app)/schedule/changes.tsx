"use client";

import { CalendarRange } from "lucide-react";
import { cancelShiftChangeAction, decideShiftChangeAction, requestShiftChangeAction } from "@/server/actions/scheduling";
import { ActionForm, FormField } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ActButton, ParamDialog } from "@/components/timeoff-ui";
import { fmtDate } from "@/lib/utils";

type Change = { id: string; from: string; to: string; shift: string; reason: string; status: string; employee: string };
const TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "slate" } as const;
const range = (c: Change) => (c.from === c.to ? fmtDate(c.from, "EEE d MMM") : `${fmtDate(c.from, "d MMM")} - ${fmtDate(c.to, "d MMM")}`);

export function ShiftChanges({ canRequest, today, shifts, mine, toApprove }: { canRequest: boolean; today: string; shifts: { id: string; name: string; startTime: string; endTime: string }[]; mine: Change[]; toApprove: Change[] }) {
  return (
    <Card>
      <CardHeader
        title="Shift changes"
        description="Ask for a different shift or a rest day for up to 31 days. Your manager approves."
        action={
          canRequest ? (
            <ParamDialog param="change" label="Request change" variant="secondary" size="sm" icon={<CalendarRange />} title="Request a shift change">
              {(close) => (
                <ActionForm action={requestShiftChangeAction} onSuccess={close} submitLabel="Send request">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="From" name="from" required>
                      <Input id="from" name="from" type="date" min={today} defaultValue={today} />
                    </FormField>
                    <FormField label="To" name="to" required>
                      <Input id="to" name="to" type="date" min={today} defaultValue={today} />
                    </FormField>
                  </div>
                  <FormField label="Work" name="shiftId" required>
                    <Select id="shiftId" name="shiftId" defaultValue="">
                      <option value="">Select</option>
                      <option value="REST">Rest day</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.startTime}-{s.endTime}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Reason" name="reason" required>
                    <Textarea id="reason" name="reason" rows={2} maxLength={500} placeholder="Class schedule, family event, etc." />
                  </FormField>
                </ActionForm>
              )}
            </ParamDialog>
          ) : null
        }
      />
      {toApprove.length ? (
        <section aria-label="Shift changes to approve" className="border-b border-slate-100">
          <p className="bg-canvas px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Needs your approval</p>
          <ul className="divide-y divide-slate-100">
            {toApprove.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[12rem] flex-1 text-sm">
                  <p className="font-medium text-ink">
                    {c.employee} · {range(c)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.shift} · &ldquo;{c.reason}&rdquo;
                  </p>
                </div>
                <div className="flex gap-2">
                  <ActButton action={() => decideShiftChangeAction(c.id, false)}>Reject</ActButton>
                  <ActButton action={() => decideShiftChangeAction(c.id, true)} variant="secondary">
                    Approve
                  </ActButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mine.length === 0 ? (
        toApprove.length ? null : <EmptyState title="No shift change requests" />
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="My shift changes">
          {mine.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-[12rem] flex-1 text-sm">
                <p className="font-medium text-ink">
                  {c.shift} · {range(c)}
                </p>
                <p className="truncate text-xs text-slate-500">&ldquo;{c.reason}&rdquo;</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={TONE[c.status as keyof typeof TONE] ?? "slate"}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Badge>
                {c.status === "PENDING" ? <ActButton action={() => cancelShiftChangeAction(c.id)}>Cancel</ActButton> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
